import { Product } from '@/types'

/**
 * Opções de conteúdo da etiqueta de produto (página Gerar Etiquetas).
 * Define quais campos o usuário quer ver na etiqueta, além do código de barras,
 * que continua sempre presente.
 */
export interface LabelContentOptions {
  showCode: boolean
  showFullName: boolean
  showSellingPrice: boolean
}

export const DEFAULT_LABEL_CONTENT: LabelContentOptions = {
  showCode: true,
  showFullName: false,
  showSellingPrice: false,
}

/**
 * Nome completo do produto: categoria (principal, quando houver) + nome do produto.
 * Sem categoria, mostra apenas o nome.
 */
export function getProductFullName(p: Product): string {
  const name = p.nome_produto || p.description || 'Produto Scaglioni'
  const links = p.expand?.['product_category_links(product)'] || []
  const withCategory = links.find((l) => l.expand?.category?.name)
  const categoryName = withCategory?.expand?.category?.name?.trim()
  const base = categoryName ? `${categoryName} — ${name}` : name
  const variacao = (p.variacao || '').trim()
  return variacao ? `${base} — ${variacao}` : base
}
