import React, { useMemo } from 'react'
import { encodeCode128B } from '@/lib/code128Encoder'

interface BarcodeSvgProps {
  value: string
  displayText?: string
  height?: number
  showText?: boolean
  className?: string
  color?: string
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  displayText,
  height = 36,
  showText = true,
  className = '',
  color = '#000000',
}) => {
  const { modules, text } = useMemo(() => {
    return encodeCode128B(value || '0')
  }, [value])

  const labelText = displayText !== undefined ? displayText : text
  const moduleWidth = 1
  const totalWidth = modules.length * moduleWidth
  const textHeight = showText ? 12 : 0
  const totalHeight = height + textHeight

  // Agrupa módulos pretos consecutivos em retângulos SVG para desempenho e nitidez ideais
  const rects = useMemo(() => {
    const list: { x: number; width: number }[] = []
    let currentX = 0
    let currentWidth = 0

    for (let i = 0; i < modules.length; i++) {
      if (modules[i]) {
        if (currentWidth === 0) {
          currentX = i * moduleWidth
        }
        currentWidth += moduleWidth
      } else {
        if (currentWidth > 0) {
          list.push({ x: currentX, width: currentWidth })
          currentWidth = 0
        }
      }
    }
    if (currentWidth > 0) {
      list.push({ x: currentX, width: currentWidth })
    }
    return list
  }, [modules])

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      preserveAspectRatio="none"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
      shapeRendering="crispEdges"
    >
      <rect width={totalWidth} height={totalHeight} fill="#FFFFFF" />
      {rects.map((r, idx) => (
        <rect key={idx} x={r.x} y={0} width={r.width} height={height} fill={color} />
      ))}
      {showText && (
        <text
          x={totalWidth / 2}
          y={height + 9.5}
          textAnchor="middle"
          fill={color}
          fontSize="9.5"
          fontWeight="bold"
          fontFamily="monospace, Courier, sans-serif"
          letterSpacing="1"
        >
          {labelText}
        </text>
      )}
    </svg>
  )
}
