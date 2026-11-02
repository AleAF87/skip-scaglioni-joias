import React from 'react'
import { StockDistributionItem } from '@/services/productCreationService'
import { Reseller } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react'

interface StockDistributionManagerProps {
  distribution: StockDistributionItem[]
  onChange: (items: StockDistributionItem[]) => void
  resellers: Reseller[]
  targetQuantity: number
  labelPrefix?: string
}

export const LOCATION_OPTIONS = ['Estoque geral', 'Estoque separado para e-commerce', 'Revendedora']

export function StockDistributionManager({
  distribution,
  onChange,
  resellers,
  targetQuantity,
  labelPrefix = 'Estoque',
}: StockDistributionManagerProps) {
  const sum = distribution.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0)
  const isExact = sum === targetQuantity && targetQuantity >= 0
  const diff = targetQuantity - sum

  const handleAddLine = () => {
    const newItem: StockDistributionItem = {
      id: `dist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      localizacao: 'Estoque geral',
      quantidade: diff > 0 ? diff : 0,
    }
    onChange([...distribution, newItem])
  }

  const handleRemoveLine = (id: string) => {
    if (distribution.length <= 1) {
      // Deixa com 1 linha zerada em vez de vazio total
      onChange([
        {
          id: `dist-${Date.now()}`,
          localizacao: 'Estoque geral',
          quantidade: 0,
        },
      ])
      return
    }
    onChange(distribution.filter((item) => item.id !== id))
  }

  const handleUpdateLine = (id: string, updates: Partial<StockDistributionItem>) => {
    onChange(
      distribution.map((item) => {
        if (item.id === id) {
          const updated = { ...item, ...updates }
          // Se mudou localização para algo diferente de Revendedora, limpa resellerId
          if (updates.localizacao && updates.localizacao !== 'Revendedora') {
            updated.resellerId = undefined
            updated.resellerName = undefined
          }
          return updated
        }
        return item
      }),
    )
  }

  return (
    <div className="space-y-3 p-4 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5DFD5] pb-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#7A5C2E]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2A26]">
            Distribuição do {labelPrefix} por Localização
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B655E]">
            Soma: <strong>{sum}</strong> / {targetQuantity} un.
          </span>
          {isExact ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2E7D4F] bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <CheckCircle2 className="h-3 w-3" /> Exato
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#B3261E] bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              <AlertCircle className="h-3 w-3" />
              {diff > 0 ? `Faltam ${diff} un.` : `Excesso de ${Math.abs(diff)} un.`}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {distribution.map((item, index) => {
          const isReseller = item.localizacao === 'Revendedora'
          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2.5 rounded-lg border border-[#E5DFD5]"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs font-mono text-[#8C8275] w-5 text-center">
                  #{index + 1}
                </span>

                <select
                  value={item.localizacao}
                  onChange={(e) => handleUpdateLine(item.id, { localizacao: e.target.value })}
                  className="h-9 px-2.5 text-xs rounded-md border border-[#E5DFD5] bg-white text-[#2D2A26] focus:outline-hidden focus:ring-1 focus:ring-[#C6A664] flex-1 min-w-[140px]"
                >
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>

                {isReseller && (
                  <select
                    value={item.resellerId || ''}
                    onChange={(e) => {
                      const selReseller = resellers.find((r) => r.id === e.target.value)
                      handleUpdateLine(item.id, {
                        resellerId: e.target.value,
                        resellerName: selReseller?.name,
                      })
                    }}
                    className="h-9 px-2.5 text-xs rounded-md border border-amber-300 bg-amber-50/50 text-[#2D2A26] focus:outline-hidden focus:ring-1 focus:ring-[#C6A664] flex-1 min-w-[160px]"
                  >
                    <option value="">Selecione a Revendedora *</option>
                    {resellers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.city ? `(${r.city})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <div className="flex items-center gap-1.5 w-28">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantidade === 0 ? '' : item.quantidade}
                    placeholder="0"
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      handleUpdateLine(item.id, { quantidade: isNaN(val) ? 0 : Math.max(0, val) })
                    }}
                    className="h-9 text-xs text-right pr-2 font-mono font-semibold"
                  />
                  <span className="text-[11px] text-[#8C8275]">un.</span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveLine(item.id)}
                  title="Remover linha"
                  className="h-9 w-9 text-[#B3261E] hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddLine}
          className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Localização
        </Button>

        <p className="text-[11px] text-[#6B655E]">
          {isExact
            ? 'Distribuição completa e válida.'
            : 'Atenção: ajuste as quantidades para bater com a quantidade inicial.'}
        </p>
      </div>
    </div>
  )
}
