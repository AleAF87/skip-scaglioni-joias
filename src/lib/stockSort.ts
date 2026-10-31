import { Product } from '@/types'

export type SortField =
  | 'created'
  | 'code'
  | 'name'
  | 'invested_value'
  | 'selling_price'
  | 'quantity'

export type SortDirection = 'asc' | 'desc'

export interface StockSortState {
  field: SortField
  direction: SortDirection
}

/**
 * Retorna o código de exibição primário de um produto
 */
export function getProductDisplayCode(p: Partial<Product>): string {
  return String(p.codigo_barras || p.codigo_barras_tecson || p.code || '').trim()
}

/**
 * Normaliza o nome do produto para ordenação (com fallback para description)
 */
export function getProductDisplayName(p: Partial<Product>): string {
  return String(p.nome_produto?.trim() || p.description || '').trim()
}

/**
 * Retorna timestamp da data de cadastro do produto no sistema (created ou criado_em_origem como fallback)
 */
export function getProductCreatedTime(p: Partial<Product>): number {
  const dateStr = p.created || p.criado_em_origem
  if (!dateStr) return 0
  const time = new Date(dateStr).getTime()
  return isNaN(time) ? 0 : time
}

/**
 * Compara dois códigos tratando valores puramente numéricos (mesmo com zeros à esquerda)
 * como números (ex: '0000000000009' antes de '10000').
 * Códigos não estritamente numéricos vão para o fim em ordem alfabética.
 */
export function compareProductCodes(a: Partial<Product>, b: Partial<Product>): number {
  const codeA = getProductDisplayCode(a)
  const codeB = getProductDisplayCode(b)

  const isNumA = /^\d+$/.test(codeA)
  const isNumB = /^\d+$/.test(codeB)

  if (isNumA && isNumB) {
    const valA = parseInt(codeA, 10)
    const valB = parseInt(codeB, 10)
    if (valA !== valB) {
      return valA - valB
    }
    return codeA.localeCompare(codeB)
  }

  // Se um é numérico e o outro não, o numérico vem primeiro
  if (isNumA && !isNumB) return -1
  if (!isNumA && isNumB) return 1

  // Ambos alfanuméricos
  return codeA.localeCompare(codeB, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

/**
 * Ordena uma lista de produtos em memória com base no campo e direção escolhidos.
 */
export function sortProductsList(
  items: Product[],
  field: SortField,
  direction: SortDirection,
): Product[] {
  const factor = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    let diff = 0

    switch (field) {
      case 'created': {
        const timeA = getProductCreatedTime(a)
        const timeB = getProductCreatedTime(b)
        diff = timeA - timeB
        break
      }
      case 'code': {
        diff = compareProductCodes(a, b)
        break
      }
      case 'name': {
        const nameA = getProductDisplayName(a)
        const nameB = getProductDisplayName(b)
        diff = nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' })
        break
      }
      case 'invested_value': {
        const valA = typeof a.invested_value === 'number' ? a.invested_value : 0
        const valB = typeof b.invested_value === 'number' ? b.invested_value : 0
        diff = valA - valB
        break
      }
      case 'selling_price': {
        const valA = typeof a.selling_price === 'number' ? a.selling_price : 0
        const valB = typeof b.selling_price === 'number' ? b.selling_price : 0
        diff = valA - valB
        break
      }
      case 'quantity': {
        const qtyA = typeof a.quantity === 'number' ? a.quantity : 0
        const qtyB = typeof b.quantity === 'number' ? b.quantity : 0
        diff = qtyA - qtyB
        break
      }
      default:
        diff = 0
    }

    // Desempate estável: data de cadastro decrescente (-created) e depois ID
    if (diff === 0 && field !== 'created') {
      const timeA = getProductCreatedTime(a)
      const timeB = getProductCreatedTime(b)
      const secondary = timeB - timeA
      if (secondary !== 0) return secondary
      return (a.id || '').localeCompare(b.id || '')
    }

    return diff * factor
  })
}
