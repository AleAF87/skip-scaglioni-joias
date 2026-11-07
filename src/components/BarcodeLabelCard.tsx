import React, { useMemo } from 'react'
import { encodeCode128B } from '@/lib/code128Encoder'

interface BarcodeLabelCardProps {
  /**
   * Código exato a ser codificado e exibido (ex.: p.code)
   */
  code: string
  /**
   * Nome ou descrição do produto
   */
  name: string
  /**
   * Preço de venda opcional (se fornecido, exibe formatado)
   */
  price?: number | null
  /**
   * Material ou detalhes adicionais (opcional)
   */
  subtitle?: string
  /**
   * URL de foto (se disponível, miniatura opcional)
   */
  photoUrl?: string | null
  /**
   * Altura das barras em pixels (padrão 46px)
   */
  barcodeHeight?: number
}

/**
 * Componente de etiqueta individual otimizado para exibição em tela e impressão (@media print)
 * Codifica estritamente o código fornecido usando Code 128 Subset B.
 */
export const BarcodeLabelCard: React.FC<BarcodeLabelCardProps> = ({
  code,
  name,
  price,
  subtitle,
  photoUrl,
  barcodeHeight = 44,
}) => {
  const cleanCode = (code || '').trim()

  const { modules, valid } = useMemo(() => {
    if (!cleanCode) {
      return { modules: [], valid: false }
    }
    try {
      const res = encodeCode128B(cleanCode)
      return { modules: res.modules, valid: res.modules.length > 0 }
    } catch (e) {
      console.error('Erro ao codificar Code 128 para:', cleanCode, e)
      return { modules: [], valid: false }
    }
  }, [cleanCode])

  const moduleWidth = 1.35
  const totalWidth = modules.length * moduleWidth
  const quietZone = 8
  const viewBoxWidth = totalWidth + quietZone * 2
  const viewBoxHeight = barcodeHeight + 2

  return (
    <div
      className="barcode-label-card bg-white text-black p-3 rounded-lg border border-[#2D2A26]/80 flex flex-col justify-between items-center text-center shadow-xs transition-shadow print:shadow-none print:border-black print:rounded-none"
      style={{
        boxSizing: 'border-box',
        minHeight: '138px',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      {/* Cabeçalho da Etiqueta: Marca e Preço */}
      <div className="w-full flex items-center justify-between gap-1 border-b border-black/15 pb-1 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#2D2A26] print:text-black">
        <span className="truncate font-serif">Scaglioni Joias</span>
        {typeof price === 'number' && !isNaN(price) && price > 0 && (
          <span className="shrink-0 text-[11px] font-sans font-bold text-[#7A5C2E] print:text-black">
            {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
      </div>

      {/* Nome e subtítulo do produto */}
      <div className="w-full flex items-center justify-center gap-1.5 mb-1 px-0.5">
        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            className="w-7 h-7 object-cover rounded shrink-0 border border-black/10 print:hidden"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1 text-center">
          <p
            className="text-xs font-semibold text-[#2D2A26] print:text-black line-clamp-2 leading-tight"
            title={name}
          >
            {name || 'Produto sem descrição'}
          </p>
          {subtitle && (
            <p className="text-[9px] text-[#6B655E] print:text-black/80 truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Código de Barras desenhado (SVG vetorial Code 128) */}
      <div className="w-full flex flex-col items-center justify-center my-1">
        {valid ? (
          <svg
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            className="w-full max-w-[210px] h-auto overflow-visible select-none"
            style={{ maxHeight: `${barcodeHeight + 4}px` }}
            preserveAspectRatio="xMidYMid meet"
            shapeRendering="crispEdges"
            aria-label={`Código de barras Code 128: ${cleanCode}`}
          >
            <rect width={viewBoxWidth} height={viewBoxHeight} fill="#ffffff" />
            <g transform={`translate(${quietZone}, 1)`}>
              {modules.map((isBar, idx) =>
                isBar ? (
                  <rect
                    key={idx}
                    x={idx * moduleWidth}
                    y={0}
                    width={moduleWidth}
                    height={barcodeHeight}
                    fill="#000000"
                  />
                ) : null,
              )}
            </g>
          </svg>
        ) : (
          <div className="text-[10px] text-red-600 font-mono py-2">
            Código inválido para Code 128
          </div>
        )}

        {/* Código em texto legível embaixo (Human Readable) */}
        <span
          className="font-mono text-xs font-bold tracking-widest text-[#2D2A26] print:text-black mt-1 select-all"
          title={`Código lido pelo leitor/câmera: ${cleanCode}`}
        >
          {cleanCode}
        </span>
      </div>
    </div>
  )
}
