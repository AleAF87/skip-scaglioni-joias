import React, { useEffect, useState } from 'react'
import { Package, Boxes, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResellerDelivery, ResellerReturn, Product } from '@/types'
import { resellerStockService } from '@/services/resellerStockService'
import { productService } from '@/services/productService'
import { formatCurrency, getProductDisplayPhoto } from '@/lib/formatters'
import { ImageLightbox } from '@/components/ImageLightbox'

interface DeliveryItemsModalProps {
  delivery: ResellerDelivery | null
  resellerId?: string
  onClose: () => void
}

interface ItemRow {
  code: string
  description: string
  selling_price: number
  deliveredQty: number
  returnedQty: number
  photo: string | null
}

/**
 * Modal v0.0.153: lista de joias de UMA entrega, aberta pelo card.
 * Mostra imagem clicável (zoom), código, nome, valor de venda e as
 * 3 quantidades simplificadas: Entregue (recebida) / Devolvida / Em posse.
 */
export function DeliveryItemsModal({ delivery, resellerId, onClose }: DeliveryItemsModalProps) {
  const [rows, setRows] = useState<ItemRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  useEffect(() => {
    if (!delivery) return

    let isMounted = true
    const load = async () => {
      setIsLoading(true)
      try {
        const [returns, productsRes] = await Promise.all([
          resellerStockService.getReturns(
            resellerId ? { resellerId } : ({} as { resellerId?: string }),
          ),
          productService.getProducts({ perPage: 300 }),
        ])
        if (!isMounted) return

        const productList: Product[] = productsRes.items || []
        const findProduct = (code: string): Product | undefined =>
          productList.find((p) => {
            const pCode = String(p.code || '').replace(/^0+/, '')
            const iCode = String(code || '').replace(/^0+/, '')
            return (pCode && iCode && pCode === iCode) || p.sku === code
          })

        // Devoluções desta entrega (fluxo novo: toda devolução guarda delivery_code)
        const deliveryReturns = (returns as ResellerReturn[]).filter(
          (ret) => !delivery.code || !ret.delivery_code || ret.delivery_code === delivery.code,
        )

        const computed: ItemRow[] = (delivery.items || []).map((item) => {
          const product = findProduct(item.code)
          let returnedQty = 0
          for (const ret of deliveryReturns) {
            if (ret.status !== 'completed') continue
            for (const retItem of ret.items || []) {
              const rCode = String(retItem.code || '').replace(/^0+/, '')
              const iCode = String(item.code || '').replace(/^0+/, '')
              if (rCode && iCode && rCode === iCode) {
                returnedQty += retItem.returned_qty || 0
              }
            }
          }
          const deliveredQty = item.quantity || 0
          return {
            code: item.code || '—',
            description: item.description || product?.name || 'Joia',
            selling_price: item.selling_price || product?.selling_price || 0,
            deliveredQty,
            returnedQty: Math.min(returnedQty, deliveredQty),
            photo: product ? getProductDisplayPhoto(product) : null,
          }
        })
        setRows(computed)
      } catch (err) {
        console.error('Erro ao carregar itens da entrega:', err)
        if (isMounted) {
          setRows(
            (delivery.items || []).map((item) => ({
              code: item.code || '—',
              description: item.description || 'Joia',
              selling_price: item.selling_price || 0,
              deliveredQty: item.quantity || 0,
              returnedQty: 0,
              photo: null,
            })),
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [delivery, resellerId])

  if (!delivery) return null

  const totalDelivered = rows.reduce((acc, r) => acc + r.deliveredQty, 0)
  const totalReturned = rows.reduce((acc, r) => acc + r.returnedQty, 0)
  const totalInPossession = totalDelivered - totalReturned

  return (
    <>
      <Dialog open={!!delivery} onOpenChange={(val) => !val && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-[#2D2A26]">
              <Package className="h-4 w-4 text-[#7A5C2E]" />
              Joias da entrega {delivery.code}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="py-10 text-center text-sm text-[#8C8275]">Carregando joias...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#8C8275]">
              Nenhuma joia registrada nesta entrega.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F3EAD8]/50 text-[#7A5C2E] font-semibold border-b border-[#E5DFD5]">
                  <tr>
                    <th className="py-2.5 px-3">Foto</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Nome</th>
                    <th className="py-2.5 px-3 text-right">Valor de Venda</th>
                    <th className="py-2.5 px-3 text-center">Entregue</th>
                    <th className="py-2.5 px-3 text-center">Devolvida</th>
                    <th className="py-2.5 px-3 text-center">Em posse</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5]">
                  {rows.map((row, idx) => (
                    <tr
                      key={`${delivery.id || 'sem-id'}-${row.code || 'sem-cod'}-${idx}`}
                      className="hover:bg-[#FDFBF7]"
                    >
                      <td className="py-2.5 px-3">
                        {row.photo ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLightboxIndex(idx)
                              setLightboxOpen(true)
                            }}
                            className="block rounded-lg overflow-hidden border border-[#E5DFD5] hover:border-[#C6A664] transition-colors"
                            title="Clique para ampliar"
                          >
                            <img
                              src={row.photo}
                              alt={row.description}
                              className="h-12 w-12 object-cover"
                            />
                          </button>
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-[#F3EAD8]/60 flex items-center justify-center">
                            <Package className="h-5 w-5 text-[#C6A664]" />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#7A5C2E]">{row.code}</td>
                      <td className="py-2.5 px-3 font-medium text-[#2D2A26]">{row.description}</td>
                      <td className="py-2.5 px-3 text-right text-[#6B655E]">
                        {formatCurrency(row.selling_price)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-[#2D2A26]">
                        {row.deliveredQty}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-amber-800">
                        {row.returnedQty}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                        {row.deliveredQty - row.returnedQty}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#FDFBF7] border-t border-[#E5DFD5] font-semibold">
                  <tr>
                    <td colSpan={4} className="py-3 px-3 text-right text-[#7A5C2E] font-serif">
                      Totais:
                    </td>
                    <td className="py-3 px-3 text-center text-sm">{totalDelivered}</td>
                    <td className="py-3 px-3 text-center text-sm text-amber-800">
                      {totalReturned}
                    </td>
                    <td className="py-3 px-3 text-center text-sm text-emerald-700">
                      {totalInPossession}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="flex items-center gap-4 text-[11px] text-[#6B655E] flex-wrap">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#2D2A26]" /> Entregue (recebida)
            </span>
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5 text-amber-800" /> Devolvida
            </span>
            <span className="flex items-center gap-1">
              <Boxes className="h-3.5 w-3.5 text-emerald-700" /> Em posse da revendedora
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={rows
          .filter((r) => r.photo)
          .map((r) => ({ url: r.photo as string, alt: r.description }))}
        initialIndex={lightboxIndex}
        title={rows[lightboxIndex]?.description}
      />
    </>
  )
}
