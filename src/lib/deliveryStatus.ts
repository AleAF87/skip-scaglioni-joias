import { ResellerDelivery, ResellerReturn } from '@/types'

/**
 * Deriva o estado real de uma entrega a partir das devoluções da revendedora.
 * Uma entrega é "finalizada" (devolvida) quando TODAS as peças dela já voltaram:
 * somatório de returned_qty nas devoluções completed = total_items_count.
 *
 * Retorna:
 * - isFullyReturned: entrega sem nada pendente = finalizada (regra do usuário).
 * - returnedQty: peças já devolvidas somadas nas devoluções daquela entrega.
 */
export function getDeliveryReturnedState(
  delivery: ResellerDelivery,
  returns: ResellerReturn[],
): { isFullyReturned: boolean; returnedQty: number } {
  const totalPieces = delivery.total_items_count || 0
  if (totalPieces <= 0) return { isFullyReturned: false, returnedQty: 0 }

  let returnedQty = 0
  for (const ret of returns) {
    if (ret.status !== 'completed') continue
    // Devoluções novas guardam o código da entrega; antigas são somadas por data
    // (tudo devolvido depois da entrega pertence a ela — fluxo atual tem 1 maleta por vez)
    if (ret.delivery_code && ret.delivery_code !== delivery.code) continue
    if (!ret.delivery_code && new Date(ret.created) < new Date(delivery.created)) continue

    for (const item of ret.items || []) {
      returnedQty += item.returned_qty || 0
    }
  }

  return { isFullyReturned: returnedQty >= totalPieces, returnedQty }
}

/** Rótulo/status de exibição do card da entrega. */
export function getDeliveryDisplayStatus(
  delivery: ResellerDelivery,
  returns: ResellerReturn[],
): { label: string; tone: 'emerald' | 'amber' | 'slate'; isFullyReturned: boolean } {
  const { isFullyReturned } = getDeliveryReturnedState(delivery, returns)
  if (isFullyReturned) {
    return { label: 'Devolvida / Finalizada', tone: 'emerald', isFullyReturned: true }
  }
  if (delivery.status === 'pending_signature') {
    return { label: 'Aguardando recebimento', tone: 'amber', isFullyReturned: false }
  }
  if (delivery.status === 'accepted') {
    return { label: 'Recebida', tone: 'slate', isFullyReturned: false }
  }
  return { label: 'Cancelada', tone: 'slate', isFullyReturned: false }
}
