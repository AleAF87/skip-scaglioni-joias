// Regra central de normalização de código de barras (única no projeto).
// Regra do usuário: sem zeros à esquerda — 0000000442497 ≡ 442497.
// Usar ESTA função em cadastro/edição, importações, etiquetas, PDV, scanner,
// busca, vendas, entregas, devoluções, conferência e validação de duplicidade.
// Nunca usar COD_PRODUTO ou nome para vincular produto.

export interface BarcodeMatch {
  original: string
  normalized: string
  valid: boolean
  reason?: string
}

const MIN_BARCODE_LENGTH = 8

/**
 * Normaliza um código de barras para comparação/lookup:
 * - mantém apenas dígitos (0-9)
 * - remove zeros à esquerda ("0000000442497" → "442497"; "000" → "")
 */
export function normalizeBarcode(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const digits = String(raw).replace(/\D+/g, '')
  return digits.replace(/^0+/, '')
}

/** Valor original (com dígitos, sem formatação) para auditoria. */
export function auditBarcode(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).replace(/\D+/g, '')
}

/** Valida se o valor pode ser usado como código de barras de produto. */
export function isValidBarcode(raw: string | null | undefined): boolean {
  const n = normalizeBarcode(raw)
  if (n.length < MIN_BARCODE_LENGTH) return false
  // Todos os dígitos iguais (ex.: 1111111111) não é código real.
  if (/^(\d)\1+$/.test(n)) return false
  return true
}

export function normalizeBarcodeDetailed(raw: string | null | undefined): BarcodeMatch {
  const original = auditBarcode(raw)
  const normalized = normalizeBarcode(raw)
  let valid = true
  let reason: string | undefined
  if (normalized.length < MIN_BARCODE_LENGTH) {
    valid = false
    reason = 'Código de barras inválido (menos de 8 dígitos úteis).'
  } else if (/^(\d)\1+$/.test(normalized)) {
    valid = false
    reason = 'Código de barras inválido (dígitos repetidos).'
  }
  return { original, normalized, valid, reason }
}

/** Comparação de igualdade entre dois códigos (normalizados). */
export function barcodesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeBarcode(a)
  const nb = normalizeBarcode(b)
  return na !== '' && nb !== '' && na === nb
}
