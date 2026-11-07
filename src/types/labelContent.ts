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
/**
 * Extrai o texto legível de uma variação de produto manual (ProductVariation)
 * Ex: { Aro: "15" } => "Aro 15"
 */
export function formatVariationAttributeLabel(
  attrs?: Record<string, string | number> | null,
): string {
  if (!attrs) return ''
  const entries = Object.entries(attrs).filter(
    ([_, v]) => v !== undefined && v !== null && String(v).trim() !== '',
  )
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      const cleanK = k.trim()
      const cleanV = String(v).trim()
      // Se a chave for genérica ou se o valor já contiver a chave, mostra só o valor
      if (!cleanK || cleanK.toLowerCase() === 'variação' || cleanK.toLowerCase() === 'variacao') {
        return cleanV
      }
      return `${cleanK} ${cleanV}`
    })
    .join(' / ')
}

/**
 * Retorna o rótulo de variação de um produto considerando:
 * 1. Campo direto `variacao` (Tecson ou unificado)
 * 2. Variação específica passada (manual da coleção product_variations)
 * 3. Variações em `expand['product_variations(product)']`
 */
export function getProductVariationBadge(
  p?: Partial<Product> | null,
  specificVariation?: { attributes?: Record<string, string | number>; sku?: string } | null,
): string {
  if (!p && !specificVariation) return ''

  if (specificVariation?.attributes) {
    const formatted = formatVariationAttributeLabel(specificVariation.attributes)
    if (formatted) return formatted
  }
  if (specificVariation?.sku) {
    return specificVariation.sku
  }

  const direct = (p?.variacao || '').trim()
  if (direct) return direct

  const varList = p?.expand?.['product_variations(product)'] || []
  if (varList.length === 1) {
    const single = varList[0]
    const label = formatVariationAttributeLabel(single.attributes)
    return label || single.sku || ''
  } else if (varList.length > 1) {
    const labels = varList
      .map((v) => formatVariationAttributeLabel(v.attributes) || v.sku)
      .filter(Boolean)
    if (labels.length > 0) {
      return labels.join(', ')
    }
  }

  return ''
}

/**
 * Nome completo do produto: categoria (principal, quando houver) + nome do produto + variação.
 * Sem categoria, mostra apenas o nome.
 */
export function getProductFullName(
  p: Product,
  specificVariation?: { attributes?: Record<string, string | number>; sku?: string } | null,
): string {
  const name = p.nome_produto || p.description || 'Produto Scaglioni'
  const links = p.expand?.['product_category_links(product)'] || []
  const withCategory = links.find((l) => l.expand?.category?.name)
  const categoryName = withCategory?.expand?.category?.name?.trim()
  const base = categoryName ? `${categoryName} — ${name}` : name

  const varLabel = getProductVariationBadge(p, specificVariation)
  return varLabel ? `${base} — ${varLabel}` : base
}
