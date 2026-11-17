import pb from '@/lib/pocketbase/client'
import { Product } from '@/types'

/**
 * ESTOQUE ÚNICO (modelo unificado):
 * - product.quantity é o ÚNICO estoque físico real.
 * - product.qtde_loja_virtual é apenas o interruptor "Publicar no e-commerce"
 *   (1 = ativado, 0 = desativado) — não é mais saldo.
 * - A quantidade exibida/vendável no e-commerce = estoque único (quantity) −
 *   quantidade em posse das revendedoras (soma de reseller_stock_items).
 *
 * Se uma revendedora vender uma peça, a quantidade em posse dela diminui
 * e a quantidade disponível no e-commerce sobe automaticamente (a peça volta
 * ao estoque geral de fato).
 */

/** Saldo em posse das revendedoras (resellerQty) que NÃO está disponível no e-commerce */
export function getEcommerceAvailableStock(
  product: Pick<Product, 'quantity'> | null | undefined,
  resellerQty: number = 0,
): number {
  if (!product) return 0
  const general =
    typeof product.quantity === 'number' && !isNaN(product.quantity) ? product.quantity : 0
  const reseller =
    typeof resellerQty === 'number' && !isNaN(resellerQty) && resellerQty > 0 ? resellerQty : 0
  return Math.max(0, general - reseller)
}

/**
 * Estoque único total do produto: geral + posse das revendedoras.
 * (Mantida apenas para telas que mostram o total físico existente da peça.)
 */
export function getProductTotalStock(
  product: Pick<Product, 'quantity'> | null | undefined,
  resellerQty: number = 0,
): number {
  if (!product) return 0
  const general =
    typeof product.quantity === 'number' && !isNaN(product.quantity) ? product.quantity : 0
  const reseller =
    typeof resellerQty === 'number' && !isNaN(resellerQty) && resellerQty > 0 ? resellerQty : 0
  return general + reseller
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

export interface ResellerItemDetail {
  reseller_id: string
  reseller_name: string
  quantity: number
  selling_price?: number
}

export interface ProductStockBreakdown {
  general: number
  ecommerce: number
  reseller: number
  total: number
  resellerDetails: ResellerItemDetail[]
}

/**
 * Busca detalhamento completo de saldos com revendedoras (incluindo nome da revendedora e id)
 * Retorna Map<productId, ResellerItemDetail[]>
 */
export async function fetchResellerStockDetailsMap(): Promise<Map<string, ResellerItemDetail[]>> {
  const map = new Map<string, ResellerItemDetail[]>()
  if (!pb.authStore.isValid) {
    return map
  }

  try {
    const items = await pb.collection('reseller_stock_items').getFullList<{
      id: string
      product: string
      reseller: string
      quantity: number
      selling_price: number
      expand?: {
        reseller?: { id: string; name?: string }
      }
    }>({
      filter: 'quantity > 0',
      expand: 'reseller',
      fields: 'id,product,reseller,quantity,selling_price,expand.reseller.id,expand.reseller.name',
    })

    items.forEach((it) => {
      if (it.product && it.quantity > 0) {
        const list = map.get(it.product) || []
        const rName = it.expand?.reseller?.name || 'Revendedora'
        list.push({
          reseller_id: it.reseller,
          reseller_name: rName,
          quantity: Number(it.quantity) || 0,
          selling_price: Number(it.selling_price) || 0,
        })
        map.set(it.product, list)
      }
    })
  } catch {
    // Tratado em silêncio
  }
  return map
}

/**
 * Retorna o breakdown de estoque de um produto no modelo unificado.
 * `ecommerce` aqui é a quantidade DISPONÍVEL no e-commerce (estoque único − posse).
 */
export function getProductStockBreakdown(
  product: Pick<Product, 'quantity'> | null | undefined,
  resellerDetails: ResellerItemDetail[] = [],
): ProductStockBreakdown {
  const general =
    product && typeof product.quantity === 'number' && !isNaN(product.quantity)
      ? Math.max(0, product.quantity)
      : 0
  const reseller = resellerDetails.reduce((sum, r) => sum + (r.quantity || 0), 0)
  const ecommerce = Math.max(0, general - reseller)
  return {
    general,
    ecommerce,
    reseller,
    total: general,
    resellerDetails,
  }
}
