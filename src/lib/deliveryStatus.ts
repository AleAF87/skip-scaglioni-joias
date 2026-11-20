import { ResellerDelivery, ResellerReturn } from '@/types'

/**
 * Situação operacional da entrega. Uma entrega só deixa os cards abertos quando
 * todas as peças receberam destino (devolução/extravio/venda) E o acerto financeiro
 * correspondente está quitado. Saldo devedor mantém o card em "Pendência".
 */
export function getDeliveryReturnedState(
  delivery: ResellerDelivery,
  returns: ResellerReturn[],
): { isFullyReturned: boolean; returnedQty: number; accountedQty: number; hasFinancialPending: boolean } {
  const totalPieces = delivery.total_items_count || 0
  if (totalPieces <= 0) {
    return { isFullyReturned: false, returnedQty: 0, accountedQty: 0, hasFinancialPending: false }
  }

  let returnedQty = 0
  let accountedQty = 0
  let hasFinancialPending = false
  for (const ret of returns) {
    if (ret.status !== 'completed') continue
    const belongsToDelivery =
      (ret.delivery_ref && ret.delivery_ref === delivery.id) ||
      (!ret.delivery_ref && ret.delivery_code === delivery.code) ||
      (!ret.delivery_ref && !ret.delivery_code && new Date(ret.created) >= new Date(delivery.created))
    if (!belongsToDelivery) continue

    for (const item of ret.items || []) {
      returnedQty += item.returned_qty || 0
      accountedQty += (item.returned_qty || 0) + (item.pending_qty || 0)
    }
    // Vendas PDV vinculadas ao acerto também dão destino definitivo às peças.
    accountedQty += ret.total_sold_qty || 0
    if ((ret.balance_due || 0) > 0 && ret.financial_status !== 'settled') {
      hasFinancialPending = true
    }
  }

  return {
    isFullyReturned: accountedQty >= totalPieces && !hasFinancialPending,
    returnedQty,
    accountedQty,
    hasFinancialPending,
  }
}

export function getDeliveryDisplayStatus(
  delivery: ResellerDelivery,
  returns: ResellerReturn[],
): { label: string; tone: 'emerald' | 'amber' | 'slate'; isFullyReturned: boolean } {
  const { isFullyReturned, hasFinancialPending, accountedQty } = getDeliveryReturnedState(
    delivery,
    returns,
  )
  if (hasFinancialPending && accountedQty >= (delivery.total_items_count || 0)) {
    return { label: 'Pendência', tone: 'amber', isFullyReturned: false }
  }
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
