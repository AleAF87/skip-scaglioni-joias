import React, { useEffect, useState } from 'react'
import { Product } from '@/types'
import { formatCurrency, formatDate, getProductDisplayPhoto } from '@/lib/formatters'
import { getProductTotalStock, fetchResellerStockQuantityMap } from '@/services/totalStockService'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Package,
  Tag,
  DollarSign,
  Boxes,
  Globe,
  Star,
  Barcode,
  Layers,
  Calendar,
  Building,
} from 'lucide-react'

interface ProductViewModalProps {
  product: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryNames?: string[]
}

export function ProductViewModal({
  product,
  open,
  onOpenChange,
  categoryNames = [],
}: ProductViewModalProps) {
  const [resellerQty, setResellerQty] = useState(0)

  useEffect(() => {
    if (open && product?.id) {
      fetchResellerStockQuantityMap()
        .then((m) => setResellerQty(m.get(product.id) || 0))
        .catch(() => setResellerQty(0))
    }
  }, [open, product?.id])

  if (!product) return null

  const totalStock = getProductTotalStock(product, resellerQty)
  const photoUrl = getProductDisplayPhoto(product)
  const isEcommerce = product.publicar_no_ecommerce
  const isHighlight = product.destaque_ecommerce

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-[#E5DFD5] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Package className="h-5 w-5" />
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              {product.nome_produto || product.description}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#6B655E]">
            Produto ID:{' '}
            <strong className="text-[#2D2A26]">{product.produto_id || product.id}</strong> • SKU
            novo: <strong className="text-[#7A5C2E]">{product.sku_novo || product.code}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Top row: Imagem e dados chave */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="h-36 w-36 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={product.nome_produto || 'Produto'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-10 w-10 text-[#C6A664]/50" />
              )}
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {isEcommerce && (
                  <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                    <Globe className="h-3 w-3 mr-1" /> No E-commerce
                  </Badge>
                )}
                {isHighlight && (
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                    <Star className="h-3 w-3 mr-1 fill-current" /> Destaque
                  </Badge>
                )}
                {product.status === 'available' ? (
                  <Badge className="bg-green-100 text-green-800 text-[10px]">Disponível</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 text-[10px]">Indisponível</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-[#8C8275] block">Preço de venda:</span>
                  <span className="font-serif text-lg font-bold text-[#2E7D4F]">
                    {formatCurrency(product.selling_price)}
                  </span>
                </div>
                {product.preco_promocional && product.preco_promocional > 0 && (
                  <div>
                    <span className="text-[#8C8275] block">Preço promocional:</span>
                    <span className="font-serif text-lg font-bold text-amber-600">
                      {formatCurrency(product.preco_promocional)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[#8C8275] block">Estoque atual (total):</span>
                  <span className="font-mono text-base font-bold text-[#2D2A26]">
                    {totalStock} peças
                  </span>
                  {product.qtde_loja_virtual || resellerQty ? (
                    <span className="text-[10px] text-[#6B655E] block">
                      Geral: {product.quantity || 0} | E-com: {product.qtde_loja_virtual || 0} |
                      Rev: {resellerQty}
                    </span>
                  ) : null}
                </div>
                {product.custo_unitario && product.custo_unitario > 0 && (
                  <div>
                    <span className="text-[#8C8275] block">Custo unitário:</span>
                    <span className="font-mono text-sm font-semibold text-[#6B655E]">
                      {formatCurrency(product.custo_unitario)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Categorias & Marca */}
          <div className="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2D2A26] flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-[#7A5C2E]" /> Marca:
              </span>
              <span className="text-[#2D2A26] font-medium">
                {product.expand?.marca_id?.name || 'Scaglioni'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2D2A26] flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#7A5C2E]" /> Categorias:
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {categoryNames.length > 0 ? (
                  categoryNames.map((name, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-white border border-[#E5DFD5] text-[11px] font-medium"
                    >
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-[#8C8275] italic">Sem categorias vinculadas</span>
                )}
              </div>
            </div>

            {product.codigo_barras && (
              <div className="flex items-center justify-between pt-1 border-t border-[#E5DFD5]">
                <span className="font-semibold text-[#2D2A26] flex items-center gap-1.5">
                  <Barcode className="h-3.5 w-3.5 text-[#7A5C2E]" /> Código de barras:
                </span>
                <span className="font-mono text-[#2D2A26]">{product.codigo_barras}</span>
              </div>
            )}

            {product.fornecedor && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2D2A26] flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-[#7A5C2E]" /> Fornecedor:
                </span>
                <span className="text-[#2D2A26]">{product.fornecedor}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-[#E5DFD5]">
              <span className="font-semibold text-[#2D2A26] flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#7A5C2E]" /> Data de cadastro:
              </span>
              <span className="text-[#6B655E]">{formatDate(product.created)}</span>
            </div>
          </div>

          {/* Descrição */}
          {product.description && (
            <div>
              <span className="text-xs font-semibold text-[#2D2A26] block mb-1">Descrição:</span>
              <p className="text-xs text-[#6B655E] leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]">
                {product.description}
              </p>
            </div>
          )}

          {/* Medidas */}
          {(product.altura_cm ||
            product.largura_cm ||
            product.comprimento_cm ||
            product.peso_g) && (
            <div className="grid grid-cols-4 gap-2 text-center text-xs p-3 rounded-lg border border-[#E5DFD5] bg-[#FDFBF7]">
              <div>
                <span className="text-[10px] text-[#8C8275] block">Altura</span>
                <span className="font-semibold">{product.altura_cm || 0} cm</span>
              </div>
              <div>
                <span className="text-[10px] text-[#8C8275] block">Largura</span>
                <span className="font-semibold">{product.largura_cm || 0} cm</span>
              </div>
              <div>
                <span className="text-[10px] text-[#8C8275] block">Comprimento</span>
                <span className="font-semibold">{product.comprimento_cm || 0} cm</span>
              </div>
              <div>
                <span className="text-[10px] text-[#8C8275] block">Peso</span>
                <span className="font-semibold">{product.peso_g || 0} g</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
