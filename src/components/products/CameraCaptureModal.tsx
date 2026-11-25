import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, Check, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { captureVideoFrameAsJpeg, describeCameraError } from '@/lib/cameraPhoto'

type FacingMode = 'environment' | 'user'
type CameraStatus = 'starting' | 'live' | 'captured' | 'error'

interface CameraCaptureModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Recebe a foto já comprimida como arquivo JPEG (mesma fila do upload por arquivo). */
  onCapture: (file: File) => void
}

export function CameraCaptureModal({ open, onOpenChange, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Cada início de câmera recebe um id; inícios antigos são descartados
  const runIdRef = useRef(0)

  const [status, setStatus] = useState<CameraStatus>('starting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [cameraCount, setCameraCount] = useState(0)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(
    async (mode: FacingMode) => {
      const runId = ++runIdRef.current
      stopStream()
      setStatus('starting')
      setErrorMessage(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMessage(
          'Este navegador não permite acessar a câmera. Use um navegador atualizado em conexão segura (HTTPS).',
        )
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: mode } },
        })
        if (runId !== runIdRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        // Conta câmeras disponíveis para exibir o botão de alternar
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (runId === runIdRef.current) {
            setCameraCount(devices.filter((d) => d.kind === 'videoinput').length)
          }
        } catch (enumErr) {
          console.debug('enumerateDevices falhou:', enumErr)
        }

        const video = videoRef.current
        if (video) {
          // Safari iOS: exige playsinline e muted (atributo) para reproduzir sem gesto
          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          video.setAttribute('muted', '')
          video.defaultMuted = true
          video.muted = true
          video.srcObject = stream

          try {
            await video.play()
          } catch (playErr) {
            console.warn('video.play() advertiu (pode já estar em reprodução):', playErr)
          }

          // Espera o primeiro frame realmente disponível (Safari iOS só entrega frames após 'playing')
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
            // Timeout de segurança para não travar a abertura da câmera
            setTimeout(resolve, 6000)
          })
        }

        if (runId === runIdRef.current) setStatus('live')
      } catch (err) {
        if (runId !== runIdRef.current) return
        console.warn('Falha ao acessar a câmera:', err)
        stopStream()
        setErrorMessage(describeCameraError(err))
        setStatus('error')
      }
    },
    [stopStream],
  )

  // Abre/fecha a câmera conforme o modal
  useEffect(() => {
    if (!open) {
      runIdRef.current++
      stopStream()
      return
    }
    setCapturedBlob(null)
    setCapturedUrl(null)
    setCameraCount(0)
    setFacingMode('environment')
    startCamera('environment')
    return () => {
      runIdRef.current++
      stopStream()
    }
  }, [open, startCamera, stopStream])

  // Libera a URL temporária da foto capturada
  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl)
    }
  }, [capturedUrl])

  const handleCapture = async () => {
    const video = videoRef.current
    if (!video || status !== 'live') return
    setIsCapturing(true)
    try {
      const blob = await captureVideoFrameAsJpeg(video)
      // Desliga a câmera assim que a foto é capturada
      runIdRef.current++
      stopStream()
      setCapturedBlob(blob)
      setCapturedUrl(URL.createObjectURL(blob))
      setStatus('captured')
    } catch (err) {
      console.warn('Falha ao capturar foto:', err)
      setErrorMessage('Não foi possível capturar a foto. Tente novamente.')
    } finally {
      setIsCapturing(false)
    }
  }

  const handleRetake = () => {
    setCapturedBlob(null)
    setCapturedUrl(null)
    startCamera(facingMode)
  }

  const handleSwitchCamera = () => {
    const next: FacingMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  const handleUsePhoto = () => {
    if (!capturedBlob) return
    const file = new File([capturedBlob], `foto-camera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })
    onCapture(file)
    onOpenChange(false)
  }

  const isCaptured = status === 'captured'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#2D2A26]">Tirar foto do produto</DialogTitle>
          <DialogDescription className="text-xs text-[#6B655E]">
            {isCaptured
              ? 'Confira a foto. Use-a para adicionar à galeria ou tire novamente.'
              : 'Posicione o produto e toque em capturar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden">
          {/* Prévia ao vivo: fica no DOM para o elemento de vídeo persistir entre tentativas */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Prévia da câmera"
            className={`w-full h-full object-cover ${isCaptured ? 'hidden' : ''}`}
          />

          {isCaptured && capturedUrl && (
            <img
              src={capturedUrl}
              alt="Foto capturada do produto"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}

          {status === 'starting' && (
            <div
              role="status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-xs"
            >
              <Loader2
                className="h-6 w-6 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Abrindo a câmera...
            </div>
          )}

          {status === 'error' && (
            <div
              role="alert"
              className="absolute inset-0 flex items-center justify-center p-4 text-center text-white text-sm"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {status !== 'error' && errorMessage && (
          <p role="alert" className="text-xs text-[#B3261E]">
            {errorMessage}
          </p>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {status === 'live' && cameraCount > 1 && (
              <Button type="button" variant="outline" onClick={handleSwitchCamera}>
                <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Trocar câmera
              </Button>
            )}
          </div>

          {status === 'live' && (
            <Button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="bg-[#7A5C2E] hover:bg-[#5F4621] text-white"
            >
              <Camera className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Capturar foto
            </Button>
          )}

          {isCaptured && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleRetake}>
                <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Tirar novamente
              </Button>
              <Button
                type="button"
                onClick={handleUsePhoto}
                className="bg-[#7A5C2E] hover:bg-[#5F4621] text-white"
              >
                <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Usar foto
              </Button>
            </div>
          )}

          {status === 'error' && (
            <Button type="button" variant="outline" onClick={handleRetake}>
              <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Tentar novamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
