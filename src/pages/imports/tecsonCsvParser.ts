/**
 * Parser do CSV Tecson → posse de revendedora.
 *
 * NOVO FORMATO (prioritário):
 *   COD_PRODUTO;CODIGO_BARRAS_TECSON;QUANTIDADE;DESCRICAO;PRECO
 *
 * - COD_PRODUTO é a CHAVE PRINCIPAL (código interno Scaglioni, ex. "631587 N15").
 *   Pode conter código + variação: "631587 N15" → base "631587", variação "N15";
 *   "927062 PRATA 20" → base "927062", variação "PRATA 20".
 * - CODIGO_BARRAS_TECSON é opcional — somente legado/auditoria, NUNCA chave de busca.
 * - QUANTIDADE aceita zero (prévia: "Sem posse atual — cadastro/mapeamento somente").
 * - DESCRICAO e PRECO são opcionais.
 *
 * Compatibilidade com o formato ANTIGO (header CODIGO_BARRAS/EAN/GTIN): se a
 * primeira coluna não existir mas houver código de barras, usa-o como base_code.
 */

export interface ParsedTecsonRow {
  line: number
  /** Linha bruta original (coluna 1). */
  cod_produto: string
  /** Código base separado (ex. "631587" de "631587 N15"). */
  base_code: string
  /** Sufixo de variação separado (ex. "N15"), vazio quando não há. */
  variation: string
  /** Audtoria: código de barras legado Tecson (não usado para localizar). */
  codigo_barras_tecson: string
  quantity: number
  description: string
  selling_price: string
  /** Linhas sem COD_PRODUTO legível vão para inválidas (com motivo). */
  invalid_reason?: string
}

/** Separa "631587 N15" → { baseCode: '631587', variation: 'N15' }. */
export function splitCodProduto(raw: string): { baseCode: string; variation: string } {
  const clean = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!clean) return { baseCode: '', variation: '' }
  const spaceIdx = clean.indexOf(' ')
  if (spaceIdx > 0) {
    return {
      baseCode: clean.slice(0, spaceIdx).trim(),
      variation: clean.slice(spaceIdx + 1).trim(),
    }
  }
  return { baseCode: clean, variation: '' }
}

/** Normaliza o código base para comparação (preserva zeros à esquerda). */
export function normalizeTecsonBaseCode(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseTecsonCsv(text: string): {
  rows: ParsedTecsonRow[]
  invalidRows: ParsedTecsonRow[]
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rows: ParsedTecsonRow[] = []
  const invalidRows: ParsedTecsonRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
    if (i === 0 && /COD[\s_]?PRODUTO|CODIGO[\s_]?BARRAS|EAN|GTIN/i.test(cols.join(' '))) continue // header

    const codProduto = cols[0] || ''
    const codBarrasTecson = cols[1] || ''
    const quantidadeRaw = cols[2] || '0'
    const descricao = cols[3] || ''
    const preco = cols[4] || ''

    const row: ParsedTecsonRow = {
      line: i + 1,
      cod_produto: codProduto,
      base_code: '',
      variation: '',
      codigo_barras_tecson: codBarrasTecson,
      quantity: Math.max(0, parseInt(quantidadeRaw, 10) || 0),
      description: descricao,
      selling_price: preco,
    }

    if (!codProduto) {
      // Sem COD_PRODUTO: no formato antigo a 1ª coluna ERA o código de barras.
      const legacy = codBarrasTecson
      if (legacy) {
        row.base_code = normalizeTecsonBaseCode(legacy)
        row.cod_produto = legacy
        row.codigo_barras_tecson = legacy
      } else {
        row.invalid_reason = 'Linha sem COD_PRODUTO.'
        invalidRows.push(row)
        continue
      }
    } else {
      const { baseCode, variation } = splitCodProduto(codProduto)
      row.base_code = normalizeTecsonBaseCode(baseCode)
      row.variation = normalizeTecsonBaseCode(variation)
    }

    rows.push(row)
  }

  return { rows, invalidRows }
}
