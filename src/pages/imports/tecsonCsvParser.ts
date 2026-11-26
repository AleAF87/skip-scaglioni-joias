// Parser do CSV de importação de posse de revendedora (Tecson).
// LEITURA POR CABEÇALHO — nunca por posição fixa de coluna.
//
// Formato padrão (igual ao da importação Tecson):
//   IMAGEM;NOME;COD_PRODUTO;FORNECEDOR;CODIGO_BARRAS;QUANTIDADE;PRECO
//
// Regras:
//  - Cada campo é identificado pelo CABEÇALHO da coluna, com aliases aceitos
//    (incluindo os nomes usados em /importar-tecson: R$_VENDA para preço e
//    QUANT_EM_ESTOQUES para quantidade).
//  - CODIGO_BARRAS é a chave principal para localizar/criar o produto. O valor
//    ORIGINAL da Tecson é preservado (auditoria, inclusive zeros à esquerda);
//    na comparação interna só removemos zeros à esquerda:
//    '0000000442497' ⇒ '442497' (código interno).
//  - NOME = descrição inicial de produto novo; FORNECEDOR é informativo.
//  - Codificações comuns (UTF-8 com/sem BOM, Latin-1) são tratadas.

export interface ParsedTecsonRow {
  line: number
  imagem: string
  nome: string
  codProduto: string
  codProdutoBase: string
  variacao: string
  fornecedor: string
  codigoBarras: string
  codigoBarrasNorm: string
  quantidade: number
  preco: number
  erro?: string
}

export interface TecsonParseResult {
  rows: ParsedTecsonRow[]
  headers: string[]
  delimiter: string
  errors: string[]
  /** Mapa campo canônico → índice da coluna detectado no cabeçalho. */
  headerMap: Record<string, number | null>
}

/** Normaliza o valor ORIGINAL do código de barras (trim). */
export function normalizeBarcodeOriginal(raw: string): string {
  return String(raw || '').trim()
}

/** Chave de comparação: remove apenas zeros à esquerda (0000000442497 ⇒ 442497). */
export function stripLeadingZerosBarcode(value: string): string {
  const v = String(value || '').trim()
  if (!v) return ''
  if (!/^\d+$/.test(v)) return v // não numérico: compara como veio
  return v.replace(/^0+/, '') || '0'
}

/** Converte preço brasileiro (ex.: '140,00', 'R$ 1.234,56') para número. */
export function parseTecsonPriceBr(raw: string): number {
  let v = String(raw ?? '').trim()
  if (!v) return 0
  v = v.replace(/[^\d,.-]/g, '')
  if (!v) return 0
  if (v.includes(',')) {
    // formato BR: ponto = milhar, vírgula = decimal
    v = v.replace(/\./g, '').replace(',', '.')
  } else if (v.includes('.')) {
    // sem vírgula: se o último grupo não tem 3 dígitos, é decimal
    const parts = v.split('.')
    const last = parts[parts.length - 1]
    if (parts.length > 2 || last.length !== 3) v = v.replace(/\./g, ',')
  }
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Converte quantidade para inteiro (aceita '3', '3,0', '3.0'). Nunca lê outro campo. */
export function parseTecsonQuantityInt(raw: string): number {
  const v = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
  if (!v) return 0
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

// Aliases por campo, escritos na forma canônica do CSV (com _, $, acentos,
// espaços e hífens). TODOS passam pela MESMA normalização que os cabeçalhos
// antes da comparação — nunca literal.
const HEADER_ALIASES: Record<string, string[]> = {
  imagem: ['IMAGEM', 'IMAGE', 'FOTO', 'URL_IMAGEM', 'IMG'],
  nome: ['NOME', 'DESCRICAO', 'DESCRIÇÃO', 'DESCRICAO_PRODUTO', 'NOME_PRODUTO', 'PRODUTO'],
  codProduto: [
    'COD_PRODUTO',
    'CODIGO_PRODUTO',
    'CÓDIGO_PRODUTO',
    'COD_PROD_TECSON',
    'COD_TECSON',
    'CODIGO_TECSON',
  ],
  fornecedor: ['FORNECEDOR', 'FORNECEDORA', 'SUPPLIER'],
  codigoBarras: [
    'CODIGO_BARRAS',
    'CÓDIGO_DE_BARRAS',
    'CODIGO_DE_BARRAS',
    'COD_BARRAS',
    'EAN',
    'EAN13',
    'GTIN',
    'CODIGO_BARRAS_TECSON',
    'COD_BARRAS_TECSON',
  ],
  quantidade: [
    'QUANTIDADE',
    'QUANT_EM_ESTOQUES',
    'QTD',
    'QTDE',
    'QTD_ESTOQUE',
    'QUANTIDADE_ESTOQUE',
  ],
  preco: ['PRECO', 'PREÇO', 'R$_VENDA', 'VALOR_VENDA', 'PRECO_VENDA', 'R$_PRECO', 'VALOR'],
}

/** Rótulo legível de cada campo canônico, para a prévia da página. */
export const FIELD_LABELS: Record<string, string> = {
  imagem: 'imagem',
  nome: 'nome/descrição',
  codProduto: 'código do produto (Tecson)',
  fornecedor: 'fornecedor',
  codigoBarras: 'código de barras',
  quantidade: 'quantidade',
  preco: 'preço',
}

/**
 * NORMALIZAÇÃO ÚNICA de cabeçalhos (e aliases): remove BOM, acentos, `_`,
 * espaços, `$` e hífens, e uppercase. A comparação é sempre entre valores já
 * normalizados — nunca literal. Ex.: 'CODIGO_BARRAS', 'codigo barras' e
 * 'Código-de-Barras' ⇒ 'CODIGOBARRAS'; 'R$_VENDA' ⇒ 'RVENDA'.
 */
export function normHeader(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

/** Mapeia cada coluna do CSV para o campo canônico pelo CABEÇALHO. */
export function mapHeaders(headers: string[]): Record<string, number | null> {
  const map: Record<string, number | null> = {
    imagem: null,
    nome: null,
    codProduto: null,
    fornecedor: null,
    codigoBarras: null,
    quantidade: null,
    preco: null,
  }
  // Normaliza os aliases UMA vez, com a MESMA função usada nos cabeçalhos.
  const normalizedAliases: Record<string, string[]> = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      aliases.map(normHeader).filter(Boolean),
    ]),
  )
  headers.forEach((h, index) => {
    const n = normHeader(h)
    if (!n) return
    for (const [field, aliases] of Object.entries(normalizedAliases)) {
      if (aliases.includes(n) && map[field] === null) {
        map[field] = index
        break
      }
    }
  })
  return map
}

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) || []).length
  const commas = (headerLine.match(/,/g) || []).length
  return commas > semis ? ',' : ';'
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    return new TextDecoder('utf-16le').decode(buffer).replace(/^\uFEFF/, '')
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('latin1').decode(buffer)
    } catch {
      /* latin1 não suportado: usa utf-8 */
    }
  }
  return utf8
}

export function parseTecsonCsv(text: string): TecsonParseResult {
  const result: TecsonParseResult = {
    rows: [],
    headers: [],
    delimiter: ';',
    errors: [],
    headerMap: {
      imagem: null,
      nome: null,
      codProduto: null,
      fornecedor: null,
      codigoBarras: null,
      quantidade: null,
      preco: null,
    },
  }
  if (!text || !text.trim()) {
    result.errors.push('Arquivo vazio.')
    return result
  }

  const clean = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const rawLines = clean.split('\n')
  const lines = rawLines.filter((l, i) => i === 0 || l.trim() !== '')
  if (lines.length === 0) {
    result.errors.push('Arquivo vazio.')
    return result
  }

  const delimiter = detectDelimiter(lines[0])
  result.delimiter = delimiter

  const headerCells = splitLine(lines[0], delimiter)
  result.headers = headerCells.map((h) => h.trim().replace(/^"|"$/g, ''))
  const map = mapHeaders(result.headers)
  result.headerMap = map

  if (map.codigoBarras === null) {
    result.errors.push(
      'Coluna CODIGO_BARRAS não encontrada no cabeçalho — ela é a chave principal da importação. ' +
        'Confira os cabeçalhos detectados acima; nenhuma importação pode ser confirmada sem ela.',
    )
  }
  if (map.quantidade === null) {
    result.errors.push(
      'Coluna de QUANTIDADE não encontrada no cabeçalho (aliases: QUANTIDADE, QUANT_EM_ESTOQUES, QTD, QTDE, QTD_ESTOQUE).',
    )
  }
  if (map.preco === null) {
    result.errors.push(
      'Coluna de PREÇO não encontrada no cabeçalho (aliases: PRECO, R$_VENDA, VALOR_VENDA, PRECO_VENDA, VALOR).',
    )
  }

  // Deriva variação do COD_PRODUTO (parte após espaço, ex.: '631587 37' ⇒ '37').
  const parseCodProduto = (raw: string) => {
    const original = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
    if (!original) return { original: '', base: '', variacao: '' }
    const parts = original.split(' ')
    const baseNum = (parts[0] || '').replace(/\D/g, '')
    const base = baseNum ? baseNum.replace(/^0+/, '') || '0' : ''
    const variacao = parts.length > 1 ? parts.slice(1).join(' ') : ''
    return { original, base, variacao }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter)
    const get = (field: string): string => {
      const idx = map[field]
      if (idx === null) return ''
      const cell = cells[idx] ?? ''
      return cell.trim().replace(/^"|"$/g, '')
    }

    const imagem = get('imagem')
    const nome = get('nome')
    const { original: codOriginal, base: codBase, variacao } = parseCodProduto(get('codProduto'))
    const fornecedor = get('fornecedor')
    const codigoBarras = get('codigoBarras')
    const quantidade = parseTecsonQuantityInt(get('quantidade'))
    const preco = parseTecsonPriceBr(get('preco'))

    const row: ParsedTecsonRow = {
      line: i + 1,
      imagem,
      nome,
      codProduto: codOriginal,
      codProdutoBase: codBase,
      variacao,
      fornecedor,
      codigoBarras,
      codigoBarrasNorm: stripLeadingZerosBarcode(codigoBarras),
      quantidade,
      preco,
    }
    if (!codigoBarras && !codOriginal) {
      row.erro = 'Linha sem CODIGO_BARRAS e sem COD_PRODUTO — ignorada.'
      result.errors.push(`Linha ${i + 1}: ${row.erro}`)
    }
    result.rows.push(row)
  }
  return result
}

/** Lê um File e devolve o texto decodificado (UTF-8/Latin-1/UTF-16). */
export async function readTecsonFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return decodeText(buffer)
}
