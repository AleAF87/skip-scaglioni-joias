import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Product, InitialStock } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { MapPin, Boxes, Store, Package, UserCheck, Loader2 } from 'lucide-react'

interface ProductStockLocationModalProps {
  product: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProductStockLocationModal({
  product,
  open,
  onOpenChange,
}: ProductStockLocationModalProps) {
  const [initialStocks, setInitialStocks] = useState<InitialStock[]>([])
  const [resellerItems, setResellerItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open && product) {
      loadStockDetails(product.id)
    }
  }, [open, product])

  const loadStockDetails = async (productId: string) => {
    setIsLoading(true)
    try {
      const [stocks, rItems] = await Promise.all([
        pb
          .collection('initial_stocks')
          .getFullList<InitialStock>({
            filter: `product = '${productId}'`,
            sort: '-created',
          })
          .catch(() => []),
        pb
          .collection('reseller_stock_items')
          .getFullList({
            filter: `product = '${productId}'`,
            expand: 'reseller',
          })
          .catch(() => []),
      ])

      setInitialStocks(stocks)
      setResellerItems(rItems)
    } catch (err) {
      console.warn('Erro ao carregar distribuição de estoque:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (!product) return null

  // Calcular totais acumulados por localização
  let lojaFisicaTotal = 0
  let ecommerceTotal = 0
  const resellerTotals: Record<string, { name: string; qty: number }> = {}

  // A partir de initial_stocks
  initialStocks.forEach((s) => {
    const d = s.detalhes_distribuicao as any
    if (d) {
      if (typeof d.loja_fisica === 'number') lojaFisicaTotal += d.loja_fisica
      if (typeof d.expedicao === 'number') ecommerceTotal += d.expedicao
      if (Array.isArray(d.revendedoras)) {
        d.revendedoras.forEach((r: any) => {
          if (r.reseller_id) {
            const key = r.reseller_id
            const existing = resellerTotals[key] || {
              name: r.reseller_name || 'Revendedora',
              qty: 0,
            }
            existing.qty += r.quantidade || 0
            resellerTotals[key] = existing
          }
        })
      }
    }
  })

  // Completa com dados da tabela reseller_stock_items se houver registros consolidados
  resellerItems.forEach((ri) => {
    const rId = ri.reseller
    const rName = ri.expand?.reseller?.name || 'Revendedora'
    const qty = ri.quantity || 0
    if (!resellerTotals[rId]) {
      resellerTotals[rId] = { name: rName, qty }
    } else {
      // Usa o valor consolidado mais recente do estoque da revendedora
      resellerTotals[rId].qty = qty
    }
  })

  // Se loja física e e-commerce não tiverem registros detalhados gravados, calcula residual
  const totalResellerPieces = Object.values(resellerTotals).reduce((sum, r) => sum + r.qty, 0)
  if (lojaFisicaTotal === 0 && ecommerceTotal === 0 && (product.quantity || 0) > 0) {
    lojaFisicaTotal = Math.max(0, (product.quantity || 0) - totalResellerPieces)
  }

  const grandTotal = lojaFisicaTotal + ecommerceTotal + totalResellerPieces

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-[#E5DFD5]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <MapPin className="h-5 w-5" />
            <DialogTitle className="font-serif text-lg text-[#2D2A26]">
              Estoque por Localização
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#6B655E]">
            {product.nome_produto || product.description} • SKU: {product.sku_novo || product.code}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#6B655E] gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-[#C6A664]" />
            <span className="text-xs">Carregando localizações de estoque...</span>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Resumo do total */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#F8F3EA] to-[#F3EAD8] border border-[#C6A664]/40 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[#7A5C2E] font-bold block">
                  Estoque Total Geral
                </span>
                <span className="font-serif text-2xl font-bold text-[#2D2A26]">
                  {product.quantity || grandTotal} peças
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-[#7A5C2E] text-white flex items-center justify-center shadow-xs">
                <Boxes className="h-5 w-5" />
              </div>
            </div>

            {/* Lista de Localizações */}
            <div className="space-y-2">
              {/* Loja Física */}
              <div className="p-3 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 text-[#7A5C2E] flex items-center justify-center">
                    <Store className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#2D2A26] block">Loja Física</span>
                    <span className="text-[10px] text-[#6B655E]">Showroom & Balcão PDV</span>
                  </div>
                </div>
                <span className="text-sm font-bold font-mono text-[#2D2A26]">
                  {lojaFisicaTotal} un.
                </span>
              </div>

              {/* Estoque Separado para E-commerce */}
              <div className="p-3 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#2D2A26] block">
                      Estoque Separado para E-commerce
                    </span>
                    <span className="text-[10px] text-[#6B655E]">Expedição & Vendas Online</span>
                  </div>
                </div>
                <span className="text-sm font-bold font-mono text-[#2D2A26]">
                  {ecommerceTotal} un.
                </span>
              </div>

              {/* Revendedoras */}
              {Object.keys(resellerTotals).length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B655E] block">
                    Em posse de Revendedoras ({totalResellerPieces} un.)
                  </span>

                  {Object.entries(resellerTotals).map(([rId, data]) => (
                    <div
                      key={rId}
                      className="p-2.5 rounded-lg border border-[#E5DFD5] bg-white flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-[#2E7D4F]" />
                        <span className="text-xs font-medium text-[#2D2A26]">{data.name}</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-[#2E7D4F]">
                        {data.qty} un.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
