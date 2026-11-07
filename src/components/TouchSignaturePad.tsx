import React, { useRef, useState, useEffect } from 'react'
import { Eraser, Check, PenTool } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TouchSignaturePadProps {
  onConfirm: (signatureDataUrl: string) => void
  onCancel?: () => void
  signerName?: string
  title?: string
  description?: string
}

export const TouchSignaturePad: React.FC<TouchSignaturePadProps> = ({
  onConfirm,
  onCancel,
  signerName,
  title = 'Assinatura de Recebimento com o Dedo',
  description = 'Conforme as joias recebidas e assine deslizando o dedo na área abaixo.',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  // Configure canvas on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1e1b18'
      ctx.lineWidth = 2.5
    }
  }, [])

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasDrawn(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  // Exporta a assinatura comprimida (JPEG quality 0.7, largura máx ~600px)
  // para o payload caber folgado no backend mesmo em telas grandes — data URLs
  // base64 de PNG em resolução nativa do canvas passavam do limite do campo
  // signature_data e a entrega ficava travada em "Aguardando recebimento".
  const handleConfirm = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const sourceW = Math.round(rect.width * dpr)
    const sourceH = Math.round(rect.height * dpr)

    const MAX_WIDTH = 600
    const scale = Math.min(1, MAX_WIDTH / sourceW)
    const targetW = Math.max(1, Math.round(sourceW * scale))
    const targetH = Math.max(1, Math.round(sourceH * scale))

    const out = document.createElement('canvas')
    out.width = targetW
    out.height = targetH
    const outCtx = out.getContext('2d')
    if (!outCtx) {
      onConfirm(canvas.toDataURL('image/png'))
      return
    }
    // Fundo branco: JPEG não tem canal alfa e pixels transparentes ficam pretos.
    outCtx.fillStyle = '#FFFFFF'
    outCtx.fillRect(0, 0, targetW, targetH)
    outCtx.drawImage(canvas, 0, 0, targetW, targetH)
    onConfirm(out.toDataURL('image/jpeg', 0.7))
  }

  return (
    <div className="flex flex-col gap-3 w-full bg-[#FFFFFF] p-4 rounded-2xl border border-[#E5DFD5] shadow-xs">
      <div>
        <div className="flex items-center gap-2 text-[#7A5C2E]">
          <PenTool className="h-5 w-5" />
          <h3 className="font-serif font-bold text-base text-[#2D2A26]">{title}</h3>
        </div>
        <p className="text-xs text-[#6B655E] mt-0.5">{description}</p>
        {signerName && (
          <p className="text-xs font-semibold text-[#7A5C2E] mt-1">
            Recebedora: <span className="text-[#2D2A26]">{signerName}</span>
          </p>
        )}
      </div>

      <div className="relative border-2 border-dashed border-[#C6A664]/60 rounded-xl bg-[#FDFBF7] overflow-hidden select-none touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-48 cursor-crosshair block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-[#A8A196]">
            <PenTool className="h-6 w-6 mb-1 opacity-40 text-[#7A5C2E]" />
            <span className="text-xs italic">Assine com o dedo ou caneta aqui</span>
          </div>
        )}
        <div className="absolute bottom-2 left-4 right-4 border-b border-[#E5DFD5]/60 pointer-events-none" />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={!hasDrawn}
          className="border-[#E5DFD5] text-[#6B655E] hover:text-[#B3261E] hover:bg-[#B3261E]/5 text-xs flex items-center gap-1.5"
        >
          <Eraser className="h-3.5 w-3.5" />
          Limpar
        </Button>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-[#6B655E]"
            >
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={!hasDrawn}
            className="bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5 font-medium shadow-xs"
          >
            <Check className="h-3.5 w-3.5" />
            Confirmar e Assinar
          </Button>
        </div>
      </div>
    </div>
  )
}
