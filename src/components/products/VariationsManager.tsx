import React from 'react'
import { ProductVariationInput, StockDistributionItem } from '@/services/productCreationService'
import { Reseller } from '@/types'
import { StockDistributionManager } from './StockDistributionManager'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Layers, Tag } from 'lucide-react'

interface VariationsManagerProps {
  variations: ProductVariationInput[]
  onChange: (variations: ProductVariationInput[]) => void
  resellers: Reseller[]
  baseSku: string
  basePrice: number
}

const ATTRIBUTE_PRESETS = ['Tamanho', 'Aro', 'Cor', 'Modelo', 'Material', 'Banho']

export function VariationsManager({
  variations,
  onChange,
  resellers,
  baseSku,
  basePrice,
}: VariationsManagerProps) {
  const handleAddVariation = () => {
    const nextIdx = variations.length + 1
    const varSku = baseSku ? `${baseSku}-V${nextIdx}` : `VAR-${Date.now().toString().slice(-4)}`
    const initialDist: StockDistributionItem = {
      id: `dist-var-${Date.now()}`,
      localizacao: 'Estoque geral',
      quantidade: 1,
    }

    const newVar: ProductVariationInput = {
      attributeName: 'Aro',
      attributeValue: '',
      sku: varSku,
      price: basePrice || 0,
      initialQuantity: 1,
      distribution: [initialDist],
    }

    onChange([...variations, newVar])
  }

  const handleRemoveVariation = (index: number) => {
    onChange(variations.filter((_, idx) => idx !== index))
  }

  const handleUpdateVariation = (index: number, updates: Partial<ProductVariationInput>) => {
    onChange(
      variations.map((v, idx) => {
        if (idx === index) {
          const updated = { ...v, ...updates }
          // Se mudou initialQuantity, atualiza a distribuição se só tiver 1 item
          if (
            updates.initialQuantity !== undefined &&
            updated.distribution.length === 1 &&
            updated.distribution[0].quantidade !== updates.initialQuantity
          ) {
            updated.distribution = [
              {
                ...updated.distribution[0],
                quantidade: updates.initialQuantity,
              },
            ]
          }
          return updated
        }
        return v
      }),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-[#7A5C2E]" />
            Grade de Variações do Produto
          </label>
          <p className="text-[11px] text-[#6B655E]">
            Cada variação possui seu próprio SKU, preço e controle individual de estoque inicial por
            localização.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddVariation}
          className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Variação
        </Button>
      </div>

      {variations.length === 0 ? (
        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-900 text-center">
          Nenhuma variação adicionada ainda. Clique em "+ Adicionar Variação" acima para começar.
        </div>
      ) : (
        <div className="space-y-4">
          {variations.map((variation, vIdx) => {
            return (
              <div
                key={vIdx}
                className="p-4 rounded-xl bg-white border border-[#E5DFD5] shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-[#7A5C2E] text-white text-xs font-bold flex items-center justify-center">
                      {vIdx + 1}
                    </span>
                    <span className="text-xs font-bold text-[#2D2A26]">
                      Variação: {variation.attributeName || 'Atributo'}{' '}
                      {variation.attributeValue ? `(${variation.attributeValue})` : ''}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveVariation(vIdx)}
                    className="text-xs text-[#B3261E] hover:bg-red-50 h-7"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#2D2A26] block mb-1">
                      Atributo (Nome) *
                    </label>
                    <select
                      value={variation.attributeName}
                      onChange={(e) =>
                        handleUpdateVariation(vIdx, { attributeName: e.target.value })
                      }
                      className="w-full h-9 px-2 text-xs rounded-md border border-[#E5DFD5] bg-white text-[#2D2A26]"
                    >
                      {ATTRIBUTE_PRESETS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#2D2A26] block mb-1">
                      Valor do atributo * (ex: 15, Prata)
                    </label>
                    <Input
                      value={variation.attributeValue}
                      onChange={(e) =>
                        handleUpdateVariation(vIdx, { attributeValue: e.target.value })
                      }
                      placeholder="Ex: 16, Ouro 18k..."
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#2D2A26] block mb-1">
                      SKU da Variação (bloqueado)
                    </label>
                    <Input
                      value={variation.sku}
                      readOnly
                      disabled
                      className="h-9 text-xs bg-[#F3EAD8]/40 font-mono text-[#7A5C2E] font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#2D2A26] block mb-1">
                      Preço de venda (R$) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={variation.price === 0 ? '' : variation.price}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        handleUpdateVariation(vIdx, { price: isNaN(val) ? 0 : val })
                      }}
                      className="h-9 text-xs font-mono font-semibold"
                    />
                  </div>
                </div>

                {/* Quantidade Inicial da Variação */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="w-40">
                    <label className="text-[11px] font-semibold text-[#2D2A26] block mb-1">
                      Qtde. Inicial Variação *
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={variation.initialQuantity === 0 ? '' : variation.initialQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        handleUpdateVariation(vIdx, {
                          initialQuantity: isNaN(val) ? 0 : Math.max(0, val),
                        })
                      }}
                      className="h-9 text-xs font-mono font-semibold"
                    />
                  </div>
                  <div className="flex-1 pt-4 text-[11px] text-[#6B655E]">
                    Distribuir o estoque desta variação nas localizações abaixo:
                  </div>
                </div>

                {/* Distribuição por localização obrigatória para a variação */}
                <StockDistributionManager
                  distribution={variation.distribution}
                  onChange={(dist) => handleUpdateVariation(vIdx, { distribution: dist })}
                  resellers={resellers}
                  targetQuantity={variation.initialQuantity}
                  labelPrefix={`Variação #${vIdx + 1}`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
