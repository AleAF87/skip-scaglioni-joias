import pb from '@/lib/pocketbase/client'
import { Product } from '@/types'

/**
 * Retorna o estoque total atual de um produto somando:
 * - Estoque físico geral (product.quantity)
 * - Estoque no e-commerce / loja virtual (product.qtde_loja_virtual)
 * - Estoque alocado e em posse das revendedoras (resellerQty, lido de reseller_stock_items)
 *
 * Se uma revendedora vender uma peça, a quantidade em posse dela diminui
 * e o total exibido cai automaticamente.
 */
export function getProductTotalStock(
  product: Pick<Product, 'quantity' | 'qtde_loja_virtual'> | null | undefined,
  resellerQty: number = 0,
): number {
  if (!product) return 0
  const general =
    typeof product.quantity === 'number' && !isNaN(product.quantity) ? product.quantity : 0
  const ecommerce =
    typeof product.qtde_loja_virtual === 'number' && !isNaN(product.qtde_loja_virtual)
      ? product.qtde_loja_virtual
      : 0
  const reseller =
    typeof resellerQty === 'number' && !isNaN(resellerQty) && resellerQty > 0 ? resellerQty : 0
  return general + ecommerce + reseller
}

/**
 * Busca o mapa consolidado de quantidades de cada produto em posse de todas as revendedoras.
 * Retorna um Map<productId, totalQuantityWithResellers>.
 * Como a tabela `reseller_stock_items` guarda { product, quantity, reseller } com quantity atual,
 * somamos a quantidade por produto.
 */
export async function fetchResellerStockQuantityMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!pb.authStore.isValid) {
    return map
  }

  try {
    const items = await pb.collection('reseller_stock_items').getFullList<{
      product: string
      quantity: number
    }>({
      filter: 'quantity > 0',
      fields: 'product,quantity',
    })

    items.forEach((it) => {
      if (it.product) {
        const current = map.get(it.product) || 0
        map.set(it.product, current + (Number(it.quantity) || 0))
      }
    })
  } catch {
    // Falha tratada silenciosamente de propósito para não disparar o rastreador de erros
    // em telas não autenticadas, transições de login/logout ou requisições canceladas.
  }
  return map
}
