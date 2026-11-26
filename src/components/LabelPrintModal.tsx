import React from 'react'
import { createPortal } from 'react-dom'
import { Printer, X, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LabelTemplateModel } from '@/types/labels'
import { LabelContentOptions } from '@/types/labelContent'
import { BarcodeSvg } from '@/components/BarcodeSvg'
import { formatCurrency } from '@/lib/formatters'

export interface PrintQueueItem {
  id: string
  type: 'empty' | 'product'
  productId?: string
  code: string
  barcodeValue: string
  skuEcommerce?: string
  description: string
  fullName: string
  price: number
  quantity: number
}

interface LabelPrintModalProps {
  isOpen: boolean
  onClose: () => void
  template: LabelTemplateModel
  items: PrintQueueItem[]
  contentOptions: LabelContentOptions

  manualOffsets?: {
    marginTop: number
    marginLeft: number
    gapHorizontal: number
    gapVertical: number
  }
}

export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({
  isOpen,
  onClose,
  template,
  items,
  contentOptions,
  manualOffsets = { marginTop: 0, marginLeft: 0, gapHorizontal: 0, gapVertical: 0 },
}) => {
  const [zoom, setZoom] = React.useState<number>(100)

  const { showCode, showFullName, showSellingPrice } = contentOptions

  if (!isOpen) return null

  // 1. Expande a fila de itens respeitando:
  // - A fila chega com os mais recentes primeiro (ordem exibida na tela) e a
  //   impressão INVERTE essa ordem: o FINAL da lista sai no topo da 1ª folha.
  //   Etiquetas vazias entram no final da fila na tela e por isso imprimem nas
  //   primeiras posições da 1ª folha (reaproveitamento de folhas usadas); os
  //   produtos mais recentes imprimem por último.
  // - Cada produto se multiplica pela quantidade especificada
  const flattenedCells: Array<{
    type: 'empty' | 'product'
    code: string
    barcodeValue: string
    skuEcommerce: string
    description: string
    fullName: string
    price: number
    key: string
  }> = []

  // Impressão na ordem INVERSA à da lista (final da lista → topo do papel).
  const orderedItems = [...items].reverse()
  orderedItems.forEach((item, itemIdx) => {
    const qty = Math.max(1, Math.floor(item.quantity || 1))
    for (let i = 0; i < qty; i++) {
      flattenedCells.push({
        type: item.type,
        code: item.code,
        barcodeValue: item.barcodeValue,
        skuEcommerce: item.skuEcommerce || '',
        description: item.description,
        fullName: item.fullName,
        price: item.price,
        key: `${item.id}-${itemIdx}-${i}`,
      })
    }
  })

  // 2. Paginação conforme o número de etiquetas por folha do gabarito
  const labelsPerPage = template.labelsPerSheet
  const pages: Array<typeof flattenedCells> = []

  for (let i = 0; i < flattenedCells.length; i += labelsPerPage) {
    const pageCells = flattenedCells.slice(i, i + labelsPerPage)
    // Preenche com vazios no final da última página para manter a grade alinhada se necessário
    while (pageCells.length < labelsPerPage) {
      pageCells.push({
        type: 'empty',
        code: '',
        barcodeValue: '',
        skuEcommerce: '',
        description: '',
        fullName: '',
        price: 0,
        key: `pad-${i}-${pageCells.length}`,
      })
    }
    pages.push(pageCells)
  }

  // Se não houver itens, cria pelo menos 1 página
  if (pages.length === 0) {
    const emptyPage: typeof flattenedCells = []
    for (let i = 0; i < labelsPerPage; i++) {
      emptyPage.push({
        type: 'empty',
        code: '',
        barcodeValue: '',
        skuEcommerce: '',
        description: '',
        fullName: '',
        price: 0,
        key: `empty-${i}`,
      })
    }
    pages.push(emptyPage)
  }

  // Medidas reais em mm aplicadas às variáveis CSS
  const effectiveMarginTop = template.marginTopMm + (manualOffsets.marginTop || 0)
  const effectiveMarginLeft = template.marginLeftMm + (manualOffsets.marginLeft || 0)
  const isA4349 = template.id === 'A4349'
  const isEBF23 = template.id === 'EBF23'
  // Margens do @page na impressão. A4349 v0.0.241 (geometria confirmada pelo
  // usuário contra a folha real): sup 13 / inf 14 / esq 8 / dir 8.
  // Horizontal: 8 + (7×26) + (6×2) + 8 = 210mm ✓
  // Vertical:   13 + (18×15) + 14 = 297mm ✓ (0mm entre linhas)
  // Demais gabaritos mantêm suas margens originais.
  // EBF23 (medidas confirmadas pelo usuário contra a folha Carta física):
  // @page sup 14,5 / esq 25,5 / dir 25,5 / inf 13,5.
  // Horizontal: 25,5 + (2×80) + 4,9 + 25,5 = 215,9mm ✓
  // Vertical:   14,5 + (20×10) + (19×2,63) + 13,5 ≈ 278mm ✓
  //   v0.0.268: gapVertical 2,63mm = passo real ~12,63mm medido pelo usuário
  //   (com 2,5mm o erro de ~0,13mm/vão acumulava 2,5mm na 20ª etiqueta).
  //   Prévia em tela e impressão usam o MESMO rowGap (effectiveGapY).
  const pageMarginTop = isA4349 ? 13 : isEBF23 ? 14.5 : effectiveMarginTop
  const pageMarginLeft = isA4349 ? 8 : isEBF23 ? 25.5 : effectiveMarginLeft
  const pageMarginRight = isA4349 ? 8 : isEBF23 ? 25.5 : effectiveMarginLeft
  const pageMarginBottom = isA4349 ? 14 : isEBF23 ? 13.5 : effectiveMarginTop
  const effectiveGapX = template.gapHorizontalMm + (manualOffsets.gapHorizontal || 0)
  const effectiveGapY = template.gapVerticalMm + (manualOffsets.gapVertical || 0)
  // Gap horizontal impresso = gap do gabarito (2mm) para a A4349: a grade
  // impressa fecha exatamente em 190mm (7×26 + 6×2) dentro dos 194mm úteis
  // (210 − 8 − 8). Sem mais compensação de +0,5mm.
  const printGapX = effectiveGapX
  // Respiro interno da arte dentro da etiqueta: A4349 v0.0.246 pede 1mm em
  // todos os lados, EXCETO a DIREITA (usuário pediu mais respiro para o
  // código de barras + número não encostarem na borda direita dos 26×15mm);
  // v0.0.265: direita aumenta de 2mm para 2,5mm. A arte (código de barras e
  // textos são fluidos, width 100% da área útil) encolhe proporcionalmente
  // com o padding maior. Antes (v0.0.241 a v0.0.245): 1mm em todos os lados.
  // Backup em src/types/labels.backup.ts. Demais gabaritos mantêm o padding.
  // EBF23: a célula NÃO tem padding — cada aba impressa cuida da própria
  // margem interna de 1mm (arte de 25×8mm dentro de cada aba de 27mm).
  const labelInnerPadding = isA4349
    ? '1mm 2.5mm 1mm 1mm'
    : template.isJewelryTag
      ? '0mm'
      : '0.5mm 1mm'

  const handlePrint = () => {
    window.print()
  }

  // O overlay vai via portal direto para <body>: na impressão, o CSS esconde com
  // display:none todo irmão do overlay (#root incluído), evitando que o conteúdo
  // da página (sidebar, tabelas) ocupe fluxo e gere páginas em branco no início.
  return createPortal(
    <div className="print-overlay fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-xs text-white">
      {/* Barra superior de controles (oculta na impressão) */}
      <header className="no-print shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 bg-[#1F1D1A] border-b border-[#3D3833]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#C6A664]/20 border border-[#C6A664]/40 flex items-center justify-center text-[#E5C378]">
            <Printer className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F3EAD8] flex items-center gap-2">
              Prévia de Impressão de Etiquetas
              <Badge variant="outline" className="text-xs border-[#C6A664]/50 text-[#C6A664]">
                {template.label.split('—')[1]?.trim() || template.id}
              </Badge>
            </h2>
            <p className="text-xs text-[#A8A196]">
              {flattenedCells.filter((c) => c.type === 'product').length} etiquetas de produtos •{' '}
              {flattenedCells.filter((c) => c.type === 'empty').length} posições vazias •{' '}
              {pages.length} folha(s) {template.sheetType}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Controle de Zoom da Prévia */}
          <div className="hidden sm:flex items-center bg-[#2B2723] rounded-lg border border-[#3D3833] p-1 text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="p-1.5 hover:bg-[#3D3833] rounded text-[#E5DFD5] transition-colors"
              title="Diminuir zoom"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono text-[#F3EAD8] min-w-[50px] text-center">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
              className="p-1.5 hover:bg-[#3D3833] rounded text-[#E5DFD5] transition-colors"
              title="Aumentar zoom"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-[#3D3833] bg-[#2B2723] text-[#E5DFD5] hover:bg-[#3D3833] hover:text-white"
          >
            <X className="h-4 w-4 mr-1.5" />
            Fechar
          </Button>

          <Button
            type="button"
            onClick={handlePrint}
            className="bg-[#C6A664] hover:bg-[#B39352] text-[#1F1D1A] font-bold shadow-md hover:scale-[1.02] transition-transform"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir Agora
          </Button>
        </div>
      </header>
      {/* Dica para o usuário sobre configuração de impressão do navegador */}
      <div className="no-print bg-[#2A2418] border-b border-[#59441D] px-6 py-2 text-xs text-[#E5C378] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#E5C378]" />
          <span>
            <strong>Dica de impressão:</strong> Na janela de impressão do navegador, mantenha as
            margens em <strong>&quot;Padrão&quot;</strong> (as margens do gabarito são enviadas
            automaticamente para a impressora), a escala em <strong>100%</strong> e desative
            cabeçalhos e rodapés para o encaixe perfeito na folha do fabricante.
          </span>
        </div>
        <span className="text-[11px] opacity-75 hidden md:inline">
          Gabarito: {template.columns} colunas × {template.rows} linhas ({template.labelWidthMm} ×{' '}
          {template.labelHeightMm} mm)
        </span>
      </div>
      {/* Área da folha (ScrollView) */}
      <div className="print-scroll flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center gap-8 bg-[#12110F]">
        <div
          id="print-sheets-container"
          className="flex flex-col items-center gap-8"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
        >
          {pages.map((pageCells, pageIndex) => (
            <div
              key={pageIndex}
              className="sheet-page bg-white text-black shadow-2xl relative select-none print:shadow-none"
              style={{
                width: `${template.sheetWidthMm}mm`,
                minWidth: `${template.sheetWidthMm}mm`,
                maxWidth: `${template.sheetWidthMm}mm`,
                height: `${template.sheetHeightMm}mm`,
                minHeight: `${template.sheetHeightMm}mm`,
                maxHeight: `${template.sheetHeightMm}mm`,
                paddingTop: `${effectiveMarginTop}mm`,
                paddingLeft: `${effectiveMarginLeft}mm`,
                boxSizing: 'border-box',
                pageBreakAfter: 'always',
                pageBreakInside: 'avoid',
              }}
            >
              {/* Grade de etiquetas da folha */}
              <div
                className="sheet-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidthMm}mm)`,
                  gridTemplateRows: `repeat(${template.rows}, ${template.labelHeightMm}mm)`,
                  columnGap: `${effectiveGapX}mm`,
                  rowGap: `${effectiveGapY}mm`,
                  width: 'fit-content',
                }}
              >
                {pageCells.map((cell) => {
                  const isEmpty = cell.type === 'empty'

                  return (
                    <div
                      key={cell.key}
                      className="label-item-box flex flex-col items-center justify-between overflow-hidden relative"
                      style={{
                        width: `${template.labelWidthMm}mm`,
                        height: `${template.labelHeightMm}mm`,
                        boxSizing: 'border-box',
                        padding: labelInnerPadding,
                      }}
                    >
                      {/* Borda sutil apenas na prévia na tela, invisível na impressão */}
                      <div className="label-guide-border absolute inset-0 pointer-events-none border border-dashed border-[#d1d5db] print:hidden" />

                      {isEmpty ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-[7.5px] font-mono text-[#9ca3af] uppercase tracking-wider print:hidden">
                            [ Vazia ]
                          </span>
                        </div>
                      ) : template.isJewelryTag ? (
                        /* Arte oficial Singularis EBF23 (80×10mm) conforme gabarito
                           Tecson/Pimaco: aba esquerda 27mm + picote + aba direita
                           27mm + haste final 25mm SEM NENHUMA impressão (é a parte
                           que envolve a peça). Arte interna com 1mm de margem em
                           todas as direções (25×8mm dentro de cada aba). O picote
                           (linha pontilhada vertical) fica VISÍVEL TAMBÉM NA
                           IMPRESSÃO como guia de dobra — nenhuma regra de print o
                           esconde nas partes impressas. */
                        <div className="w-full h-full flex items-stretch font-sans text-black">
                          {/* Aba esquerda (27mm): código de barras + número legível embaixo */}
                          <div
                            className="h-full flex flex-col items-center justify-center overflow-hidden"
                            style={{ width: '27mm', padding: '1mm' }}
                          >
                            <div className="w-full min-h-0 flex-1 flex items-center justify-center">
                              <BarcodeSvg
                                value={cell.barcodeValue}
                                displayText={showCode ? cell.code : ''}
                                height={26}
                                showText={false}
                              />
                            </div>
                            {showCode && (
                              <span className="font-mono font-black text-[7.5px] tracking-tight leading-none mt-[0.2mm]">
                                {cell.barcodeValue}
                              </span>
                            )}
                            {showCode && cell.skuEcommerce && (
                              <span className="font-mono text-[6px] text-gray-600 tracking-tight leading-none mt-[0.2mm]">
                                SKU {cell.skuEcommerce}
                              </span>
                            )}
                          </div>

                          {/* Picote (linha pontilhada vertical) — guia de dobra,
                              presente na tela E na folha impressa */}
                          <div
                            aria-hidden="true"
                            className="h-full shrink-0 border-l border-dotted border-gray-600"
                            style={{ width: '1mm' }}
                          />

                          {/* Aba direita (27mm): conteúdo empilhado e ALINHADO À ESQUERDA */}
                          <div
                            className="h-full flex flex-col justify-center items-start text-left overflow-hidden"
                            style={{ width: '27mm', padding: '1mm' }}
                          >
                            {showCode && (
                              <span className="w-full truncate font-mono font-bold text-[7px] leading-tight">
                                Cód.: {cell.code}
                              </span>
                            )}
                            {showFullName && (
                              <span
                                className="w-full truncate text-[6.5px] text-gray-800 leading-tight"
                                title={cell.fullName}
                              >
                                {cell.fullName}
                              </span>
                            )}
                            {showSellingPrice && cell.price > 0 && (
                              <span className="font-bold text-[7.5px] text-black leading-tight">
                                {formatCurrency(cell.price)}
                              </span>
                            )}
                          </div>

                          {/* Haste final (25mm) — SEM NENHUMA impressão */}
                          <div aria-hidden="true" className="h-full" style={{ width: '25mm' }} />
                        </div>
                      ) : (
                        /* Layout padrão (6187, A4349, A4351) */
                        <div className="w-full h-full flex flex-col items-center justify-between text-center overflow-hidden leading-tight font-sans">
                          {/* Nome completo (categoria + nome) opcional */}
                          {showFullName && (
                            <span className="w-full truncate text-[6.5px] text-gray-800 leading-tight pt-[0.2mm]">
                              {cell.fullName}
                            </span>
                          )}

                          {/* Código de barras ocupando o corpo principal da etiqueta,
                              com o texto legível do código embaixo (sem foto) */}
                          <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden py-[0.3mm]">
                            <div className="w-full flex-1 min-h-0">
                              <BarcodeSvg value={cell.barcodeValue} height={28} showText={false} />
                            </div>
                            {showCode && (
                              <span className="font-mono font-bold tracking-tight text-[7.5px] mt-[0.2mm]">
                                {cell.barcodeValue}
                              </span>
                            )}
                          </div>

                          {/* Linha inferior: SKU E-commerce + Preço opcional */}
                          <div className="w-full flex items-center justify-between px-0.5 text-[7px] font-semibold mt-[0.2mm]">
                            {cell.skuEcommerce ? (
                              <span className="font-mono font-medium text-[6px] text-gray-600 tracking-tight">
                                SKU {cell.skuEcommerce}
                              </span>
                            ) : (
                              <span />
                            )}

                            {showSellingPrice && cell.price > 0 && (
                              <span className="font-bold text-[7px] text-black">
                                {formatCurrency(cell.price)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Estilos dedicados para impressão limpa em folhas pautadas */}
      <style>{`
      @media print {
        html,
        body {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Remove do fluxo impresso TUDO que não for o overlay do modal.
           visibility:hidden mantinha o espaço ocupado (páginas em branco);
           display:none tira os elementos do layout de vez. O overlay é filho
           direto de <body> (portal), então #root e demais irmãos somem. */
        body > *:not(.print-overlay) {
          display: none !important;
        }
        /* O overlay fixed do modal vira bloco estático na impressão: elementos
           fixed repetem a prévia em TODAS as páginas impressas
           (bug das folhas idênticas) */
        .print-overlay {
          position: static !important;
          inset: auto !important;
          z-index: auto !important;
          display: block !important;
          background: transparent !important;
          backdrop-filter: none !important;
          overflow: visible !important;
        }
        /* Área de rolagem da tela não pode cortar a folha na impressão */
        .print-scroll {
          overflow: visible !important;
          max-height: none !important;
          padding: 0 !important;
          display: block !important;
        }
        #print-sheets-container {
          position: static !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          background: transparent !important;
          display: block !important;
        }
        #print-sheets-container .sheet-page {
          box-shadow: none !important;
          margin: 0 !important;
          /* As margens do gabarito ficam no @page (aplicadas pela impressora);
             na impressão a folha vira apenas a grade de etiquetas, sem padding
             e sem o tamanho fixo da prévia em tela (não duplica margem). */
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          padding: 0 !important;
          page-break-after: always !important;
          break-after: page !important;
          overflow: hidden !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* A última folha não pode gerar uma página em branco extra */
        #print-sheets-container .sheet-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
        .no-print {
          display: none !important;
        }
        .label-guide-border {
          display: none !important;
        }
        /* A4349 v0.0.241: gap horizontal da impressão = gabarito (2mm), sem a
           compensação de +0,5mm das versões anteriores. A prévia em tela
           continua com o gap do template para não alterar a visualização. */
        #print-sheets-container .sheet-grid {
          ${isA4349 ? `column-gap: ${printGapX}mm !important;` : ''}
        }
      @page {
          size: ${template.sheetType === 'Carta' ? 'letter' : 'A4'} portrait;
          /* O navegador aplica estas margens quando a opção de margens fica em
             "Padrão". A4349 v0.0.241, geometria confirmada pelo usuário contra a
             folha real: sup 13 / inf 14 / esq 8 / dir 8.
             Horizontal: 8 + (7×26) + (6×2) + 8 = 210mm.
             Vertical: 13 + (18×15) + 14 = 297mm (0mm entre linhas). */
          margin: ${pageMarginTop}mm ${pageMarginRight}mm ${pageMarginBottom}mm ${pageMarginLeft}mm !important;
        }
      }
    `}</style>
    </div>,
    document.body,
  )
}
