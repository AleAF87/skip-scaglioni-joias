import React, { useEffect, useRef, useState } from 'react'
import {
  Camera,
  Flashlight,
  FlashlightOff,
  X,
  Volume2,
  VolumeX,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => boolean | void
  selectedOriginLabel?: string
  lastScannedCode?: string
}

declare global {
  interface Window {
    BarcodeDetector?: any
    ZXing?: any
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  selectedOriginLabel = 'Estoque Geral',
  lastScannedCode,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const zxingReaderRef = useRef<any>(null)

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
  const [usingEngine, setUsingEngine] = useState<'native' | 'zxing' | 'detecting'>('detecting')

  // Evita leituras duplicadas ultra-rápidas no mesmo décimo de segundo
  const lastDetectedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })

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

  // Carrega ZXing fallback dinamicamente se necessário
  const loadZxingLibrary = async (): Promise<any> => {
    if (window.ZXing?.BrowserMultiFormatReader) {
      return window.ZXing
    }
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('zxing-script')
      if (existing) {
        let attempts = 0
        const check = setInterval(() => {
          attempts++
          if (window.ZXing?.BrowserMultiFormatReader) {
            clearInterval(check)
            resolve(window.ZXing)
          } else if (attempts > 30) {
            clearInterval(check)
            reject(new Error('Tempo esgotado carregando leitor de código'))
          }
        }, 100)
        return
      }

      const script = document.createElement('script')
      script.id = 'zxing-script'
      script.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'
      script.async = true
      script.onload = () => {
        if (window.ZXing) resolve(window.ZXing)
        else reject(new Error('Biblioteca de código de barras não encontrada'))
      }
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca ZXing'))
      document.body.appendChild(script)
    })
  }

  // Inicia a câmera
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    let isMounted = true

    const startCamera = async () => {
      setErrorMessage(null)
      setTorchOn(false)
      setTorchAvailable(false)

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        setHasCameraPermission(true)

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
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

        // Inicia detector
        await initDetector(stream)
      } catch (err: any) {
        console.error('Erro ao acessar câmera:', err)
        if (isMounted) {
          setHasCameraPermission(false)
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMessage('Permissão para uso da câmera foi negada no navegador.')
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMessage('Nenhuma câmera traseira foi detectada neste aparelho.')
          } else {
            setErrorMessage(err.message || 'Não foi possível inicializar a câmera do aparelho.')
          }
        }
      }
    }

    startCamera()

    return () => {
      isMounted = false
      stopCamera()
    }
  }, [isOpen])

  // Desliga câmera e animações
  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset()
      } catch {
        /* intentionally ignored */
      }
      zxingReaderRef.current = null
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

  // Inicializa o motor de leitura (Nativo BarcodeDetector ou fallback ZXing)
  const initDetector = async (stream: MediaStream) => {
    let nativeAvailable = false

    if ('BarcodeDetector' in window) {
      try {
        const supported = await (window as any).BarcodeDetector.getSupportedFormats()
        if (
          supported &&
          (supported.includes('code_128') ||
            supported.includes('ean_13') ||
            supported.includes('qr_code'))
        ) {
          nativeAvailable = true
        }
      } catch (_) {
        nativeAvailable = false
      }
    }

    if (nativeAvailable) {
      setUsingEngine('native')
      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'qr_code'],
      })
      runNativeLoop(detector)
    } else {
      // Fallback para ZXing
      setUsingEngine('zxing')
      try {
        const ZXingLib = await loadZxingLibrary()
        if (ZXingLib?.BrowserMultiFormatReader) {
          runZxingReader(ZXingLib)
        } else {
          runCanvasFallback()
        }
      } catch (err) {
        console.warn('Fallback ZXing falhou, tentando fallback com canvas:', err)
        runCanvasFallback()
      }
    }
  }

  // Processa código lido de forma contínua ("sequencieira")
  const handleCodeDetected = (rawCode: string) => {
    const code = (rawCode || '').trim()
    if (!code) return

    const now = Date.now()
    // Cooldown de 1.4s para o MESMO código exatamente para não disparar 30 vezes no mesmo segundo
    if (lastDetectedRef.current.code === code && now - lastDetectedRef.current.time < 1400) {
      return
    }
    lastDetectedRef.current = { code, time: now }

    setScanCount((c) => c + 1)
    playBeep(true)
    triggerHaptic(true)

    // Chama o callback do PDV
    const result = onScan(code)

    setScannedFeedback({
      code,
      success: result !== false,
      message:
        result === false
          ? `Código ${code}: não adicionado (verifique aviso na tela)`
          : `Lido com sucesso: ${code}`,
    })

    // Limpa feedback visual após 2.2s
    setTimeout(() => {
      setScannedFeedback((prev) => (prev?.code === code ? null : prev))
    }, 2200)
  }

  // Loop Nativo de leitura via BarcodeDetector
  const runNativeLoop = (detector: any) => {
    let active = true

    const scanFrame = async () => {
      if (!active || !videoRef.current || videoRef.current.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scanFrame)
        return
      }

      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes && barcodes.length > 0) {
          const first = barcodes[0]
          if (first?.rawValue) {
            handleCodeDetected(first.rawValue)
          }
        }
      } catch (_) {
        // Quadro com ruído ou fora de foco
      }

      animFrameRef.current = requestAnimationFrame(scanFrame)
    }

    animFrameRef.current = requestAnimationFrame(scanFrame)
  }

  // Leitura com ZXing BrowserMultiFormatReader
  const runZxingReader = (ZXingLib: any) => {
    try {
      const codeReader = new ZXingLib.BrowserMultiFormatReader()
      zxingReaderRef.current = codeReader

      if (videoRef.current) {
        codeReader.decodeFromVideoElement(videoRef.current, (result: any) => {
          if (result && result.getText()) {
            handleCodeDetected(result.getText())
          }
        })
      }
    } catch (e) {
      console.error('Erro no ZXing reader:', e)
    }
  }

  // Fallback em canvas
  const runCanvasFallback = () => {
    const scanCanvas = () => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scanCanvas)
        return
      }
      animFrameRef.current = requestAnimationFrame(scanCanvas)
    }
    animFrameRef.current = requestAnimationFrame(scanCanvas)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between select-none">
      {/* Top Bar com Controles */}
      <div className="bg-black/60 backdrop-blur-md px-4 py-3 flex items-center justify-between z-20 text-white border-b border-white/10">
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
              Origem: <strong className="text-white">{selectedOriginLabel}</strong>
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
              <Volume2 className="h-4 w-4" />
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
          <div className="p-6 text-center text-white max-w-sm space-y-3">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h3 className="font-semibold text-base text-red-200">Não foi possível usar a câmera</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{errorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="mt-2 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Escurecimento fora da mira */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Moldura de Leitura Centralizada */}
              <div className="relative w-[82vw] max-w-[340px] h-[190px] rounded-2xl border-2 border-[#C6A664] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center overflow-hidden">
                {/* Linha Laser Animada */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse top-1/2 -translate-y-1/2" />

                {/* Cantoneiras Estilizadas */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white" />

                <span className="text-[11px] font-medium text-white/90 bg-black/60 px-2.5 py-0.5 rounded-full backdrop-blur-xs tracking-wide">
                  Aponte para o código da etiqueta
                </span>
              </div>

              {/* Feedback Instantâneo da Leitura */}
              {scannedFeedback && (
                <div
                  className={`mt-4 px-4 py-2 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-2 max-w-[85vw] animate-in fade-in zoom-in-95 duration-150 ${
                    scannedFeedback.success
                      ? 'bg-emerald-950/85 text-emerald-100 border border-emerald-500/50'
                      : 'bg-red-950/85 text-red-100 border border-red-500/50'
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
          </>
        )}
      </div>

      {/* Bottom Bar: Modo Sequencial, Contador e Botão Concluir */}
      <div className="bg-black/70 backdrop-blur-md px-4 py-3 z-20 border-t border-white/10 text-white space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-zinc-300">
              Câmera aberta contínua • <strong className="text-emerald-400">{scanCount}</strong>{' '}
              {scanCount === 1 ? 'leitura' : 'leituras'}
            </span>
          </div>

          {!torchAvailable && (
            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
              <FlashlightOff className="h-3 w-3" /> Flash indisponível
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 text-[11px] text-zinc-400">
            A cada código lido o produto entra na lista. Peças repetidas criam uma nova linha.
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
    </div>
  )
}
export default BarcodeScannerModal
