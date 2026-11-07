import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Keyboard,
  Camera,
  RefreshCw,
  Flashlight,
  FlashlightOff,
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ScanLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
// Decodificador embutido no bundle (sem CDN): funciona offline e no Safari/iOS.
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  BarcodeFormat,
  DecodeHintType,
  IllegalArgumentException,
  NotFoundException,
} from '@zxing/library'

interface BarcodeScannerModalProps {
  isOpen?: boolean
  onClose: () => void
  // onScan pode ser síncrono (PDVs) ou assíncrono (modal Nova Entrega, que consulta o banco).
  onScan: (
    barcode: string,
    options?: { forceDuplicate?: boolean; viaCamera?: boolean },
  ) =>
    | boolean
    | { requiresDuplicateConfirmation: boolean; product?: any }
    | void
    | Promise<boolean | { requiresDuplicateConfirmation: boolean; product?: any } | void>
  selectedOriginLabel?: string
  originTitle?: string
  lastScannedCode?: string
  // viaCamera=true ativa a pergunta "Deseja incluir mais um produto já cadastrado?"
  // (fluxo por câmera). false/ausente = nunca pergunta (leitor físico/Enter).
  viaCamera?: boolean
}

declare global {
  interface Window {
    BarcodeDetector?: any
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen = true,
  onClose,
  onScan,
  selectedOriginLabel,
  originTitle,
  lastScannedCode,
  viaCamera = false,
}) => {
  const currentOriginLabel = originTitle || selectedOriginLabel || 'Estoque Geral'
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const mountedRef = useRef(true)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const viaCameraRef = useRef(viaCamera)
  viaCameraRef.current = viaCamera

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false)
  const [torchOn, setTorchOn] = useState<boolean>(false)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true)
  const [scannedFeedback, setScannedFeedback] = useState<{
    code: string
    success: boolean
    message: string
  } | null>(null)
  const [scanCount, setScanCount] = useState<number>(0)
  // 'detecting': ainda negociando; 'waiting': câmera ativa, decodificador rodando
  const [engineStatus, setEngineStatus] = useState<'detecting' | 'native' | 'zxing' | 'error'>(
    'detecting',
  )

  // Timestamp do último processamento de código aceito ou tentativa (cooldown global de 3 segundos)
  const lastProcessedTimeRef = useRef<number>(0)
  // Flag de bloqueio imediato síncrono para evitar processar mais de 1 detecção no mesmo ciclo/frame
  const isProcessingRef = useRef<boolean>(false)
  // Flag e timer para ignorar leituras enquanto modal de pergunta ou feedback está pausando o fluxo
  const isPausedRef = useRef<boolean>(false)
  // Estado para indicar visualmente na mira o cooldown ativo de 3s
  const [inCooldown, setInCooldown] = useState<boolean>(false)
  const cooldownTimerRef = useRef<any>(null)

  // Estado da pergunta "Deseja incluir mais um produto já cadastrado?" quando lido via smartphone/câmera
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    code: string
    product: any
  } | null>(null)

  // Digitação manual do código dentro do próprio leitor (fallback quando a câmera não lê)
  const [manualCode, setManualCode] = useState<string>('')

  // Toca bip de áudio sintetizado pelo Web Audio API
  const playBeep = (success: boolean = true) => {
    if (!soundEnabled) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = success ? 'sine' : 'sawtooth'
      osc.frequency.setValueAtTime(success ? 880 : 330, ctx.currentTime)
      if (success) {
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12)
      }
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.16)
    } catch (_) {
      // AudioContext bloqueado ou não suportado
    }
  }

  // Vibração tátil no celular quando suportado
  const triggerHaptic = (success: boolean = true) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (success) {
          navigator.vibrate(80)
        } else {
          navigator.vibrate([60, 40, 60])
        }
      } catch {
        /* intentionally ignored */
      }
    }
  }

  // Processa código lido de forma contínua ("sequencieira") — suporta callbacks síncronos e assíncronos
  const handleCodeDetected = useCallback(async (rawCode: string) => {
    const code = (rawCode || '').trim()
    if (!code) return

    // 1. Bloqueio imediato se já houver processamento síncrono em andamento ou se modal de diálogo estiver aberto
    if (isProcessingRef.current || isPausedRef.current) return

    const now = Date.now()
    // 2. Cooldown global de 3.0s (3000ms) após QUALQUER leitura (mesmo código ou código diferente)
    // Impede repetições múltiplas enquanto a etiqueta estiver apontada para a câmera
    if (now - lastProcessedTimeRef.current < 3000) {
      return
    }

    // Trava imediatamente para evitar concorrência de frames no mesmo ciclo
    isProcessingRef.current = true
    lastProcessedTimeRef.current = now

    // Ativa estado visual de cooldown de 3s
    setInCooldown(true)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    cooldownTimerRef.current = setTimeout(() => {
      setInCooldown(false)
    }, 3000)

    try {
      // Chama o callback do PDV (viaCamera indica que a leitura veio da câmera).
      // Pode devolver Promise (consulta ao banco no modal Nova Entrega) ou valor direto.
      const scanResult: any = await onScanRef.current(code, { viaCamera: viaCameraRef.current })

      // Caso o produto já esteja listado na venda atual, o callback solicita confirmação do usuário
      if (
        scanResult &&
        typeof scanResult === 'object' &&
        scanResult.requiresDuplicateConfirmation
      ) {
        // Pausa detecções enquanto o usuário decide
        isPausedRef.current = true
        playBeep(true)
        triggerHaptic(true)
        setDuplicatePrompt({
          code,
          product: scanResult.product,
        })
        return
      }

      const isSuccess = scanResult !== false

      if (isSuccess) {
        setScanCount((c) => c + 1)
        playBeep(true)
        triggerHaptic(true)
      } else {
        // Feedback diferenciado para rejeição/erro de saldo ou código inexistente
        playBeep(false)
        triggerHaptic(false)
      }

      setScannedFeedback({
        code,
        success: isSuccess,
        message: !isSuccess
          ? `Código ${code}: não adicionado (verifique aviso na tela)`
          : `Lido com sucesso: ${code}`,
      })

      // Limpa feedback visual após 2.5s
      setTimeout(() => {
        setScannedFeedback((prev) => (prev?.code === code ? null : prev))
      }, 2500)
    } finally {
      // Libera flag de concorrência imediatamente após a execução do callback
      isProcessingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loop de decodificação próprio: captura frames do vídeo via canvas e decodifica com o
  // ZXing embutido no bundle. Independente de eventos do vídeo — roda enquanto readyState >= 2.
  const runFrameLoop = useCallback(
    (reader: BrowserMultiFormatReader) => {
      let stopped = false
      // Canvas OFFSCREEN (nunca anexado ao DOM): só serve para decodificação.
      // Reduzido para no máximo DECODE_MAX_WIDTH px para poupar memória/GPU no Safari iOS,
      // que pode deixar o elemento <video> em branco quando a pressão de memória sobe.
      const canvas = document.createElement('canvas')
      const ctx2d = canvas.getContext('2d', { willReadFrequently: true })

      const tick = async () => {
        if (stopped) return

        const video = videoRef.current
        if (
          video &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          ctx2d &&
          !isProcessingRef.current &&
          !isPausedRef.current &&
          Date.now() - lastProcessedTimeRef.current >= 3000
        ) {
          try {
            // Desenha o frame atual do vídeo no canvas oculto e decodifica
            const scale = Math.min(1, DECODE_MAX_WIDTH / video.videoWidth)
            const targetW = Math.round(video.videoWidth * scale)
            const targetH = Math.round(video.videoHeight * scale)
            // Só redimensiona o canvas quando a dimensão muda (redimensionar a cada frame é caro)
            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW
              canvas.height = targetH
            }
            ctx2d.drawImage(video, 0, 0, targetW, targetH)
            const result = await (reader as any).decodeFromCanvas(canvas)
            if (result) {
              const text =
                typeof result.getText === 'function' ? result.getText() : (result.text ?? '')
              if (text) {
                handleCodeDetected(text)
              }
            }
          } catch (e) {
            // NotFoundException é normal (nenhum código no frame) — ignora.
            // IllegalArgumentException indica decoder não inicializado — também ignora silenciosamente.
            if (
              !(e instanceof NotFoundException) &&
              !(e instanceof IllegalArgumentException) &&
              !(e && (e as any).name === 'NotFoundException')
            ) {
              console.debug('Frame de decodificação falhou:', e)
            }
          }
        }

        if (!stopped) {
          window.setTimeout(tick, 120)
        }
      }

      tick()
      return () => {
        stopped = true
      }
    },
    [handleCodeDetected],
  )

  // Inicia a câmera
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    mountedRef.current = true
    let loopStop: (() => void) | null = null
    let cancelled = false

    const startCamera = async () => {
      setErrorMessage(null)
      setTorchOn(false)
      setTorchAvailable(false)
      setEngineStatus('detecting')

      try {
        // Câmera traseira preferencial; constraints flexíveis para não travar no Safari iOS
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'environment' },
          })
        } catch (strictErr) {
          console.warn('Falha com facingMode environment, tentando qualquer câmera:', strictErr)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          })
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        setHasCameraPermission(true)

        // Espera o vídeo realmente reproduzir (Safari iOS só decodifica frames após 'playing')
        const video = videoRef.current
        if (video) {
          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          // iOS exige o atributo muted (não só a propriedade) para reproduzir sem gesto
          video.setAttribute('muted', '')
          video.defaultMuted = true
          video.muted = true
          video.srcObject = stream

          try {
            await video.play()
          } catch (playErr) {
            console.warn('video.play() advertiu (pode já estar em reprodução):', playErr)
          }

          // Aguarda o primeiro frame de vídeo estar disponível
          await new Promise<void>((resolve) => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              resolve()
              return
            }
            const onReady = () => {
              video.removeEventListener('playing', onReady)
              video.removeEventListener('loadeddata', onReady)
              resolve()
            }
            video.addEventListener('playing', onReady)
            video.addEventListener('loadeddata', onReady)
            // Timeout de segurança de 6s para não travar a abertura da câmera
            setTimeout(resolve, 6000)
          })
        }

        if (cancelled) {
          stopCamera()
          return
        }

        // Verifica suporte a Lanterna (Torch)
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const capabilities: any = videoTrack.getCapabilities()
            if (capabilities && capabilities.torch) {
              setTorchAvailable(true)
            }
          } catch (e) {
            console.debug('Capabilities torch check error:', e)
          }
        }

        // Motor preferencial: BarcodeDetector nativo (Chrome/Android) quando suportar code_128.
        let nativeAvailable = false
        if ('BarcodeDetector' in window) {
          try {
            const supported = await (window as any).BarcodeDetector.getSupportedFormats()
            if (supported && Array.isArray(supported) && supported.includes('code_128')) {
              nativeAvailable = true
            }
          } catch (_) {
            nativeAvailable = false
          }
        }

        if (nativeAvailable) {
          setEngineStatus('native')
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'qr_code'],
            })
            loopStop = runNativeLoop(detector)
            return
          } catch (e) {
            console.warn('Falha ao instanciar BarcodeDetector, recorrendo ao ZXing:', e)
          }
        }

        // Fallback: ZXing embutido no bundle (Safari/iOS, Firefox etc.) — sem CDN
        setEngineStatus('zxing')
        const reader = new BrowserMultiFormatReader(hints())
        readerRef.current = reader
        loopStop = runFrameLoop(reader)
      } catch (err: any) {
        console.error('Erro ao acessar câmera:', err)
        if (!cancelled) {
          setHasCameraPermission(false)
          setEngineStatus('error')
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMessage('Permissão para uso da câmera foi negada no navegador.')
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMessage('Nenhuma câmera foi detectada neste aparelho.')
          } else {
            setErrorMessage(err.message || 'Não foi possível inicializar a câmera do aparelho.')
          }
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      mountedRef.current = false
      if (loopStop) loopStop()
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Desliga câmera e loop
  const stopCamera = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop()
      } catch {
        /* intentionally ignored */
      }
      controlsRef.current = null
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current)
      cooldownTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          // Desliga lanterna antes de parar track
          if (track.readyState === 'live') {
            const caps: any =
              typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}
            if (caps && caps.torch) {
              ;(track as any).applyConstraints({ advanced: [{ torch: false }] }).catch(() => {})
            }
          }
          track.stop()
        } catch {
          /* intentionally ignored */
        }
      })
      streamRef.current = null
    }
    setTorchOn(false)
    setTorchAvailable(false)
  }

  // Loop Nativo de leitura via BarcodeDetector (Chrome/Android)
  const runNativeLoop = (detector: any) => {
    let stopped = false

    const scanFrame = async () => {
      if (stopped) return

      const video = videoRef.current
      if (!video || video.readyState < 2) {
        window.setTimeout(scanFrame, 120)
        return
      }

      // Se estiver em cooldown ou pausado, não consome CPU chamando detector.detect desnecessariamente
      if (
        isProcessingRef.current ||
        isPausedRef.current ||
        Date.now() - lastProcessedTimeRef.current < 3000
      ) {
        window.setTimeout(scanFrame, 120)
        return
      }

      try {
        const barcodes = await detector.detect(video)
        if (barcodes && barcodes.length > 0) {
          const first = barcodes[0]
          if (first?.rawValue) {
            handleCodeDetected(first.rawValue)
          }
        }
      } catch (_) {
        // Quadro com ruído ou fora de foco
      }

      if (!stopped) {
        window.setTimeout(scanFrame, 120)
      }
    }

    scanFrame()
    return () => {
      stopped = true
    }
  }

  // Alterna lanterna (Torch)
  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return

    const newState = !torchOn
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: newState }],
      })
      setTorchOn(newState)
    } catch (e) {
      console.warn('Falha ao alternar lanterna:', e)
      setTorchAvailable(false)
    }
  }

  // Resposta à pergunta: "Deseja incluir mais um produto já cadastrado?"
  const handleConfirmDuplicate = async (confirm: boolean) => {
    if (!duplicatePrompt) return
    const { code } = duplicatePrompt

    // Atualiza o timestamp global para aplicar os 3 segundos de cooldown a partir da resposta do usuário
    lastProcessedTimeRef.current = Date.now()
    setDuplicatePrompt(null)

    // Reinicia o timer de cooldown visual de 3s
    setInCooldown(true)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    cooldownTimerRef.current = setTimeout(() => {
      setInCooldown(false)
    }, 3000)

    if (confirm) {
      // "Sim" -> força a inclusão do produto
      const result: any = await onScan(code, { forceDuplicate: true, viaCamera })
      const isSuccess = result !== false

      if (isSuccess) {
        setScanCount((c) => c + 1)
        playBeep(true)
        triggerHaptic(true)
        setScannedFeedback({
          code,
          success: true,
          message: `Lido com sucesso: ${code}`,
        })
      } else {
        playBeep(false)
        triggerHaptic(false)
        setScannedFeedback({
          code,
          success: false,
          message: `Código ${code}: não adicionado (verifique saldo)`,
        })
      }
    } else {
      // "Não" -> não adiciona nada e a câmera continua aguardando a próxima leitura
      setScannedFeedback({
        code,
        success: false,
        message: `Inclusão cancelada para ${code}`,
      })
    }

    // Libera a pausa das detecções após fechar o diálogo (o cooldown de 3s já protegerá de leituras imediatas)
    setTimeout(() => {
      isPausedRef.current = false
    }, 200)

    // Limpa feedback visual após 2.5s
    setTimeout(() => {
      setScannedFeedback((prev) => (prev?.code === code ? null : prev))
    }, 2500)
  }

  // Digitação manual: envia o código pelo mesmo fluxo da câmera
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code || isProcessingRef.current || isPausedRef.current) return
    setManualCode('')
    lastProcessedTimeRef.current = Date.now()
    setInCooldown(true)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    cooldownTimerRef.current = setTimeout(() => {
      setInCooldown(false)
    }, 3000)

    const result: any = await onScan(code, { viaCamera })
    const isSuccess = result !== false
    if (isSuccess) {
      setScanCount((c) => c + 1)
      playBeep(true)
      triggerHaptic(true)
      setScannedFeedback({ code, success: true, message: `Lido com sucesso: ${code}` })
    } else {
      playBeep(false)
      triggerHaptic(false)
      setScannedFeedback({
        code,
        success: false,
        message: `Código ${code}: não adicionado (verifique aviso na tela)`,
      })
    }
    setTimeout(() => {
      setScannedFeedback((prev) => (prev?.code === code ? null : prev))
    }, 2500)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col justify-between select-none">
      {/* Top Bar com Controles */}
      <div className="bg-black/85 px-4 py-3 flex items-center justify-between z-20 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-[#C6A664] animate-pulse" />
          <div>
            <h2 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
              <span>Leitor de Código de Barras</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-[#C6A664] text-[#C6A664]"
              >
                Sequencial
              </Badge>
            </h2>
            <p className="text-[11px] text-zinc-300">
              Origem: <strong className="text-white">{currentOriginLabel}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Lanterna (Torch) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleTorch}
            disabled={!torchAvailable}
            title={
              torchAvailable
                ? torchOn
                  ? 'Desligar lanterna'
                  : 'Ligar lanterna'
                : 'Lanterna indisponível neste aparelho'
            }
            className={`h-9 w-9 p-0 rounded-full border transition-all ${
              torchOn
                ? 'bg-amber-400 text-black border-amber-300 hover:bg-amber-300 shadow-md shadow-amber-400/50'
                : torchAvailable
                  ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                  : 'bg-white/5 text-zinc-500 border-transparent opacity-40 cursor-not-allowed'
            }`}
          >
            {torchOn ? (
              <Flashlight className="h-4 w-4 fill-current" />
            ) : (
              <FlashlightOff className="h-4 w-4" />
            )}
          </Button>

          {/* Botão de Som / Bip */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Silenciar bip' : 'Ativar bip'}
            className="h-9 w-9 p-0 rounded-full border bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-white" />
            ) : (
              <VolumeX className="h-4 w-4 text-zinc-400" />
            )}
          </Button>

          {/* Fechar Câmera */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 p-0 rounded-full bg-red-600/80 text-white hover:bg-red-700 hover:text-white"
            title="Fechar câmera e voltar ao PDV"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Área da Câmera com Overlay de Mira */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {errorMessage ? (
          <div className="p-6 text-center text-white max-w-md space-y-4 bg-zinc-950/90 border border-red-500/30 rounded-2xl mx-4 shadow-2xl">
            <AlertCircle className="h-12 w-12 text-amber-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="font-semibold text-base text-white">Aviso do Leitor da Câmera</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">{errorMessage}</p>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-left text-xs text-zinc-300 space-y-1.5">
              <p className="font-medium text-amber-300 flex items-center gap-1.5">
                <span>💡</span> Alternativa recomendada:
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-300">
                Você pode utilizar um <strong>leitor físico de código de barras</strong> (USB ou
                Bluetooth) direto no campo de busca do PDV, ou digitar o número do código da joia no
                campo abaixo.
              </p>
            </div>

            {/* Digitação manual também no estado de erro */}
            <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Digite o código da joia"
                className="flex-1 h-10 px-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              />
              <Button
                type="submit"
                size="sm"
                className="h-10 bg-[#C6A664] hover:bg-[#B39353] text-[#2D2A26] font-semibold"
              >
                Incluir
              </Button>
            </form>

            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="text-xs bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <RefreshCw />
                Tentar novamente
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onClose}
                className="text-xs bg-[#C6A664] hover:bg-[#B39353] text-[#2D2A26] font-semibold"
              >
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Vídeo em camada própria (translateZ) e sem sobreposição de backdrop-filter:
                no Safari iOS, blur sobre o <video> faz a área ficar branca após o início. */}
            <video
              ref={videoRef}
              playsInline
              webkit-playsinline="true"
              muted
              autoPlay
              style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
              className="absolute inset-0 w-full h-full object-cover bg-black"
            />

            {/* Escurecimento fora da mira */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Moldura de Leitura Centralizada */}
              <div
                className={`relative w-[82vw] max-w-[340px] h-[190px] rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center overflow-hidden transition-colors duration-300 ${
                  inCooldown ? 'border-amber-400/80 bg-amber-500/5' : 'border-[#C6A664]'
                }`}
              >
                {/* Linha Laser Animada */}
                <div
                  className={`absolute left-2 right-2 h-0.5 transition-all duration-300 top-1/2 -translate-y-1/2 ${
                    inCooldown
                      ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#fbbf24] opacity-60'
                      : 'bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse'
                  }`}
                />

                {/* Cantoneiras Estilizadas */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white" />

                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full tracking-wide text-white/90 bg-black/70">
                  Aponte para o código da etiqueta
                </span>
              </div>

              {/* Feedback Instantâneo da Leitura */}
              {scannedFeedback && !duplicatePrompt && (
                <div
                  className={`mt-4 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 max-w-[85vw] animate-in fade-in zoom-in-95 duration-150 ${
                    scannedFeedback.success
                      ? 'bg-emerald-950/95 text-emerald-100 border border-emerald-500/50'
                      : 'bg-red-950/95 text-red-100 border border-red-500/50'
                  }`}
                >
                  {scannedFeedback.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate">{scannedFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Modal / Dialog de confirmação dentro do fluxo da câmera quando produto já listado */}
            {duplicatePrompt && (
              <div className="absolute inset-0 bg-black/85 z-30 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-[#2D2A26] border-2 border-[#C6A664] rounded-2xl p-5 max-w-sm w-full text-white shadow-2xl space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-[#C6A664] shrink-0 border border-[#C6A664]/30">
                      <HelpCircle className="h-6 w-6" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h3 className="font-semibold text-sm text-white leading-tight">
                        Deseja incluir mais um produto já cadastrado?
                      </h3>
                      <p className="text-xs text-zinc-300">
                        Código: <strong className="text-white">{duplicatePrompt.code}</strong>
                        {duplicatePrompt.product?.description && (
                          <span className="block text-[11px] text-zinc-400 truncate mt-0.5">
                            {duplicatePrompt.product.description}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-zinc-300">
                    Este item já se encontra na lista desta venda. Deseja adicionar mais uma
                    unidade?
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleConfirmDuplicate(false)}
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white h-11 font-medium text-sm rounded-xl"
                    >
                      Não
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleConfirmDuplicate(true)}
                      className="bg-[#C6A664] hover:bg-[#B39353] text-[#2D2A26] h-11 font-bold text-sm rounded-xl shadow-lg"
                    >
                      Sim
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Bar: status do motor, contador, digitação manual e botão Concluir */}
      <div className="bg-black/85 px-4 py-3 z-20 border-t border-white/10 text-white space-y-2">
        {/* Status visível: câmera ativa, procurando código… */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              engineStatus === 'error'
                ? 'bg-red-500'
                : inCooldown
                  ? 'bg-amber-400'
                  : 'bg-emerald-400 animate-ping'
            }`}
          />
          <span className="text-zinc-300">
            {engineStatus === 'detecting' && 'Iniciando câmera…'}
            {engineStatus === 'native' && 'Câmera ativa, procurando código…'}
            {engineStatus === 'zxing' && 'Câmera ativa, procurando código…'}
            {engineStatus === 'error' && 'Câmera indisponível — use a digitação manual abaixo'}
          </span>
          {engineStatus !== 'error' && (
            <span className="text-zinc-500">
              • <strong className="text-emerald-400">{scanCount}</strong>{' '}
              {scanCount === 1 ? 'leitura' : 'leituras'}
            </span>
          )}
        </div>

        {/* Digitação manual — sempre visível, mesmo com câmera funcionando */}
        <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              inputMode="numeric"
              enterKeyHint="send"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Não leu? Digite o código da joia"
              className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
            />
          </div>
          <Button
            type="submit"
            disabled={!manualCode.trim()}
            className="h-11 px-4 rounded-xl bg-[#C6A664] hover:bg-[#B39353] text-[#2D2A26] font-semibold shrink-0"
          >
            <ScanLine className="h-4 w-4 mr-1" />
            Incluir
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 text-[11px] text-zinc-400 flex items-center gap-1.5">
            <ScanLine className="h-3.5 w-3.5 shrink-0" />
            <span>
              A cada código lido o produto entra na lista. Peças repetidas criam uma nova linha.
            </span>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="bg-[#C6A664] hover:bg-[#B39353] text-[#2D2A26] font-bold h-10 px-5 rounded-xl shadow-lg shrink-0"
          >
            Revisar Lista / Concluir
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Largura máxima do frame usado na decodificação (canvas oculto)
const DECODE_MAX_WIDTH = 960

// Hints do ZXing: prioriza Code 128 (etiquetas do sistema) e formatos de joalheria
function hints(): Map<DecodeHintType, any> {
  const map = new Map<DecodeHintType, any>()
  map.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ])
  map.set(DecodeHintType.TRY_HARDER, true)
  return map
}

export default BarcodeScannerModal
