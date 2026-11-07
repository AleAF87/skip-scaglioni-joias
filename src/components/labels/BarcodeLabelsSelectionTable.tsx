import React from 'react'
import { LayoutGrid, CheckSquare, Square } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Product } from '@/types'
import { getProductDisplayPhoto } from '@/lib/formatters'

interface BarcodeLabelsSelectionTableProps {
  products: Product[]
  selectedIds: string[]
  onToggleSelectOne: (id: string) => void
}

export const BarcodeLabelsSelectionTable: React.FC<BarcodeLabelsSelectionTableProps> = ({
  products,
  selectedIds,
  onToggleSelectOne,
}) => {
  return (
    <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden no-print">
      <div className="p-3.5 bg-[#F8F3EA] border-b border-[#E5DFD5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-[#7A5C2E]" />
          <span className="font-serif text-sm font-bold text-[#2D2A26]">
            Selecione quais joias incluir na folha de impressão
          </span>
        </div>
        <span className="text-xs text-[#6B655E]">
          {selectedIds.length > 0
            ? `${selectedIds.length} marcado(s) — apenas os marcados serão impressos`
            : 'Nenhum marcado — todos os filtrados serão impressos'}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-[#E5DFD5]">
        {products.map((p) => {
          const isChecked = selectedIds.includes(p.id)
          const photo = getProductDisplayPhoto(p)
          const displayName = p.nome_produto?.trim() || p.description || 'Sem descrição'

          return (
            <div
              key={p.id}
              onClick={() => onToggleSelectOne(p.id)}
              className={`p-2.5 px-4 flex items-center justify-between gap-3 hover:bg-[#FDFBF7] cursor-pointer transition-colors ${
                isChecked ? 'bg-[#C6A664]/10' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleSelectOne(p.id)
                  }}
                  className="shrink-0 text-[#7A5C2E]"
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4 text-[#7A5C2E]" />
                  ) : (
                    <Square className="h-4 w-4 text-[#6B655E]" />
                  )}
                </button>

                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="h-9 w-9 rounded object-cover border border-[#E5DFD5] shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-9 w-9 rounded bg-[#F3EAD8] flex items-center justify-center text-[10px] font-bold text-[#7A5C2E] shrink-0">
                    JOIA
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#2D2A26] truncate">{displayName}</p>
                  <p className="font-mono text-[11px] font-bold text-[#7A5C2E]">Código: {p.code}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-right">
                {typeof p.selling_price === 'number' && p.selling_price > 0 && (
                  <span className="text-xs font-bold text-[#2D2A26]">
                    {p.selling_price.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={
                    (p.quantity ?? 0) > 0
                      ? 'border-[#2E7D4F] text-[#2E7D4F] text-[10px]'
                      : 'border-[#B3261E] text-[#B3261E] text-[10px]'
                  }
                >
                  {(p.quantity ?? 0) > 0 ? `Estoque: ${p.quantity}` : 'Esgotado'}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
