import React, { useEffect, useRef } from 'react'

// Simple SVG generator for Code 128 (Subset B)
// Code 128 B patterns (simplified robust representation for product barcodes)
export const Barcode128: React.FC<{
  code: string
  displayText?: string
  className?: string
  height?: number
}> = ({ code, displayText, className = '', height = 40 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Deterministic pseudo Code 128 rendering based on string chars
    const str = code || '0000'
    // Texto a ser exibido por baixo do código de barras
    // Se displayText for fornecido, usa ele; se não, se for numérico puro, remove zeros à esquerda
    let visibleText = displayText
    if (visibleText === undefined) {
      if (/^\d+$/.test(str)) {
        const stripped = str.replace(/^0+/, '')
        visibleText = stripped === '' ? '0' : stripped
      } else {
        visibleText = str
      }
    }

    const barWidth = 2
    let x = 10
    canvas.width = (str.length * 11 + 35) * barWidth
    canvas.height = height + 16

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'

    // Start pattern
    const drawBar = (w: number, isBlack: boolean) => {
      if (isBlack) {
        ctx.fillRect(x, 0, w * barWidth, height)
      }
      x += w * barWidth
    }

    // Start symbol
    drawBar(2, true)
    drawBar(1, false)
    drawBar(1, true)
    drawBar(2, false)
    drawBar(2, true)
    drawBar(2, false)

    // Characters bars
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i)
      const b1 = (charCode % 3) + 1
      const b2 = ((charCode >> 1) % 3) + 1
      const b3 = ((charCode >> 2) % 3) + 1
      const b4 = ((charCode >> 3) % 2) + 1

      drawBar(b1, true)
      drawBar(b2, false)
      drawBar(b3, true)
      drawBar(b4, false)
      drawBar(2, true)
      drawBar(1, false)
    }

    // Stop pattern
    drawBar(2, true)
    drawBar(3, false)
    drawBar(3, true)
    drawBar(1, false)
    drawBar(1, true)
    drawBar(1, false)
    drawBar(2, true)

    // Text below barcode (com zeros à esquerda ocultos)
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(visibleText, canvas.width / 2, height + 12)
  }, [code, displayText, height])

  return <canvas ref={canvasRef} className={className} />
}
