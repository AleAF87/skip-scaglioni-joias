import { Product } from '@/types'

/**
 * Normaliza SKU do site para comparação tolerante:
 * - Converte para maiúsculas e remove espaços, traços e caracteres invisíveis
 * - Converte cedilha Ç -> C (ex.: TZLÇBO03 -> TZLCBO03)
 * - Remove acentos diacríticos
 */
export function normalizeSkuForSearch(input?: string | null): string {
  if (!input) return ''
  return String(input)
    .toUpperCase()
    .replace(/Ç/g, 'C')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_]+/g, '')
    .trim()
}

/**
 * Remove zeros à esquerda mantendo pelo menos '0' se for zero
 */
export function stripLeadingZeros(input?: string | null): string {
  if (!input) return ''
  const trimmed = String(input).trim()
  if (!/^\d+$/.test(trimmed)) return trimmed
  const stripped = trimmed.replace(/^0+/, '')
  return stripped === '' ? '0' : stripped
}

/**
 * Converte string para representação numérica limpa se for puramente dígitos
 */
export function parseNumericCode(input?: string | null): number | null {
  if (!input) return null
  const trimmed = String(input).trim()
  if (!/^\d+$/.test(trimmed)) return null
  const val = parseInt(trimmed, 10)
  return isNaN(val) ? null : val
}

/**
 * Formata um código para impressão em etiqueta:
 * - Retorna o código limpo exatamente como deve ser impresso.
 */
export function formatCodeForLabelDisplay(code?: string | null): string {
  if (!code) return ''
  return String(code).trim()
}

/**
 * Determina qual código deve ser usado para código de barras e etiqueta de uma joia:
 * - Se for produto Scaglioni ou tiver sku_novo, prioriza o código numérico sequencial sem zeros (sku_novo ou code numérico)
 * - Se for Tecson, mantém o código de barras tecson original intacto (codigo_barras_tecson || codigo_barras || code)
 */
export function getProductBarcodeValue(p: Partial<Product>): string {
  const isTecson = Boolean(p.id_tecson || p.codigo_barras_tecson || p.codigo_produto_tecson)
  if (isTecson) {
    return (p.codigo_barras_tecson || p.codigo_barras || p.code || '').trim()
  }
  // Scaglioni ou novos produtos: prioriza sku_novo numérico ou code (sempre gravados como número puro 1, 2, 3...)
  return (p.sku_novo || p.code || p.codigo_barras || '').trim()
}

/**
 * Retorna os identificadores de código de um produto para conferência
 */
export function getProductCodeIdentifiers(p: Partial<Product>): {
  code: string
  skuNovo: string
  codBarrasTecson: string
  codProdTecson: string
  codBarras: string
  skuScaglioni: string
  produtoId: string
  idTecson: string
  idScaglioni: string
  skuInterno: string
} {
  return {
    code: (p.code || '').trim(),
    skuNovo: (p.sku_novo || '').trim(),
    codBarrasTecson: (p.codigo_barras_tecson || '').trim(),
    codProdTecson: (p.codigo_produto_tecson || '').trim(),
    codBarras: (p.codigo_barras || '').trim(),
    skuScaglioni: (p.sku_scaglioni || '').trim(),
    produtoId: (p.produto_id || '').trim(),
    idTecson: (p.id_tecson || '').trim(),
    idScaglioni: (p.id_scaglioni || '').trim(),
    skuInterno: (p.sku_interno || '').trim(),
  }
}

/**
 * Verifica se um produto corresponde EXATAMENTE a um código digitado/escaneado (Scan Exato):
 * 1. Se a busca for estritamente numérica, compara o valor numérico (ignorando zeros à esquerda nos dois sentidos).
 * 2. Se a busca for alfanumérica (SKU do site), compara normalizado (Ç -> C, sem espaços/traços).
 */
export function isExactCodeMatch(p: Partial<Product>, query: string): boolean {
  const qTrim = (query || '').trim()
  if (!qTrim) return false

  const codes = getProductCodeIdentifiers(p)
  const isQueryDigitsOnly = /^\d+$/.test(qTrim)

  if (isQueryDigitsOnly) {
    const qNum = parseInt(qTrim, 10)
    const checkFields = [
      codes.code,
      codes.skuNovo,
      codes.codBarrasTecson,
      codes.codProdTecson,
      codes.codBarras,
      codes.produtoId,
      codes.idTecson,
      codes.idScaglioni,
      codes.skuInterno,
    ]

    for (const f of checkFields) {
      if (f && /^\d+$/.test(f)) {
        const fNum = parseInt(f, 10)
        if (fNum === qNum) return true
      }
      // Também verifica se a string sem zeros à esquerda coincide
      if (f && stripLeadingZeros(f) === stripLeadingZeros(qTrim)) {
        return true
      }
    }
    return false
  }

  // Busca alfanumérica / SKU do site
  const normQ = normalizeSkuForSearch(qTrim)
  if (!normQ) return false

  const textFields = [
    codes.code,
    codes.skuScaglioni,
    codes.skuNovo,
    codes.codBarrasTecson,
    codes.codProdTecson,
    codes.codBarras,
    codes.produtoId,
    codes.idTecson,
    codes.idScaglioni,
  ]

  for (const f of textFields) {
    if (f && normalizeSkuForSearch(f) === normQ) {
      return true
    }
  }

  return false
}

/**
 * Verifica se o produto corresponde a uma busca em lista/tabela (filtro universal):
 * - Se a query for puramente dígitos:
 *     - Match numérico exato sobre qualquer campo de código (ignora zeros à esquerda)
 *     - Match por substring no código ou na descrição/nome
 * - Se a query for texto:
 *     - Match normalizado com Ç -> C sobre SKU e códigos
 *     - Match por includes na descrição e nome do produto
 */
export function matchesProductQuery(p: Partial<Product>, query: string): boolean {
  const qTrim = (query || '').trim()
  if (!qTrim) return true

  const isQueryDigitsOnly = /^\d+$/.test(qTrim)
  const qLower = qTrim.toLowerCase()

  // 1. Se for exato pelo código, já dá match imediato
  if (isExactCodeMatch(p, qTrim)) return true

  // 2. Se for somente dígitos, também testa se o valor numérico de algum código corresponde
  if (isQueryDigitsOnly) {
    const qNum = parseInt(qTrim, 10)
    const codes = getProductCodeIdentifiers(p)
    const numFields = [
      codes.code,
      codes.skuNovo,
      codes.codBarrasTecson,
      codes.codProdTecson,
      codes.codBarras,
      codes.produtoId,
      codes.idTecson,
      codes.idScaglioni,
      codes.skuInterno,
    ]

    for (const f of numFields) {
      if (f && /^\d+$/.test(f)) {
        if (parseInt(f, 10) === qNum) return true
      }
      if (f && stripLeadingZeros(f) === stripLeadingZeros(qTrim)) {
        return true
      }
    }
  }

  // 3. Normalização de SKU do site (Ç -> C, traços e espaços)
  const normQ = normalizeSkuForSearch(qTrim)
  if (normQ.length >= 2) {
    const codes = getProductCodeIdentifiers(p)
    const skus = [codes.skuScaglioni, codes.code, codes.skuNovo]
    for (const s of skus) {
      if (s) {
        const normS = normalizeSkuForSearch(s)
        if (normS.includes(normQ) || normQ.includes(normS)) {
          return true
        }
      }
    }
  }

  // 4. Busca textual padrão por descrição, nome e todos os identificadores (SKU novo, herdado Scaglioni, barras, etc.)
  const desc = (p.description || '').toLowerCase()
  const nome = (p.nome_produto || '').toLowerCase()
  const code = (p.code || '').toLowerCase()
  const codTecson = (p.codigo_barras_tecson || '').toLowerCase()
  const codProdTecson = (p.codigo_produto_tecson || '').toLowerCase()
  const codBarras = (p.codigo_barras || '').toLowerCase()
  const skuNovo = (p.sku_novo || '').toLowerCase()
  const skuScaglioni = (p.sku_scaglioni || '').toLowerCase()
  const skuInterno = (p.sku_interno || '').toLowerCase()
  const prodId = (p.produto_id || '').toLowerCase()

  if (
    desc.includes(qLower) ||
    nome.includes(qLower) ||
    code.includes(qLower) ||
    codTecson.includes(qLower) ||
    codProdTecson.includes(qLower) ||
    codBarras.includes(qLower) ||
    skuNovo.includes(qLower) ||
    skuScaglioni.includes(qLower) ||
    skuInterno.includes(qLower) ||
    prodId.includes(qLower)
  ) {
    return true
  }

  return false
}
