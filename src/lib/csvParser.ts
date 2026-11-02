// Tolerant CSV parser for product migration imports.
// Handles UTF-8 and Windows-1252/latin1, semicolon or comma delimiters, quoted multi-line fields.

export interface ParsedCsvProduct {
  lineIndex: number
  code: string // codigo_barras
  description: string // nome
  quantity: number // quantidade_estoques
  selling_price: number // preco_venda
  invested_value: number // preco_custo
  image_url: string // url_imagem
  import_image_path: string // arquivo_imagem
  rawRecord?: Record<string, string>
}

export interface CsvParseResult {
  headers: string[]
  detectedDelimiter: string
  encodingUsed: string
  validProducts: ParsedCsvProduct[]
  invalidRows: Array<{
    lineIndex: number
    reason: string
    rawText: string
  }>
  totalRows: number
}

// Tolerant number parser for Brazilian decimal formats or dot decimal
export function parseLooseNumber(val?: string | number | null): number {
  if (val === undefined || val === null) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val

  const s = String(val).trim()
  if (!s) return 0

  // Remove currency signs or prefixes like "R$"
  let clean = s.replace(/[R$\s]/g, '')

  // If format is like "1.234,56", replace '.' then ',' -> '.'
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.')
    } else {
      clean = clean.replace(/,/g, '')
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.')
  }

  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

// Detect encoding and convert buffer to text tolerantly
export async function decodeFileTolerant(
  file: File | Blob,
): Promise<{ text: string; encoding: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  // 1. Try UTF-8 with fatal: true to detect non-UTF-8 bytes
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    const text = utf8Decoder.decode(bytes)

    // Check for common UTF-8 replacement chars or broken latin1 representations
    if (!text.includes('\uFFFD')) {
      return { text, encoding: 'UTF-8' }
    }
  } catch {
    // Decoding as strict UTF-8 failed, will try windows-1252 / ISO-8859-1
  }

  // 2. Decode as windows-1252 (latin1)
  try {
    const latinDecoder = new TextDecoder('windows-1252')
    const text = latinDecoder.decode(bytes)
    return { text, encoding: 'Windows-1252 (Latin-1)' }
  } catch {
    // Fallback to standard utf-8 without fatal
    const fallbackDecoder = new TextDecoder('utf-8')
    return { text: fallbackDecoder.decode(bytes), encoding: 'UTF-8 (Lossy)' }
  }
}

// Split text into CSV tokens handling quotes and multi-line cells
export function parseCsvRows(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  // Normalize CRLF to LF
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i]
    const nextChar = cleanText[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField)
        currentField = ''
        // Only push row if not completely empty
        if (currentRow.some((f) => f.trim() !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
      } else {
        currentField += char
      }
    }
  }

  // Push last cell & row if remaining
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some((f) => f.trim() !== '')) {
      rows.push(currentRow)
    }
  }

  return rows
}

// Full parser according to Scaglioni column definitions
export function parseProductsCsv(rawText: string, encodingName = 'UTF-8'): CsvParseResult {
  // Detect delimiter (; or , or \t)
  const firstLine = rawText.split('\n')[0] || ''
  const semiCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length

  let delimiter = ';'
  if (commaCount > semiCount && commaCount > tabCount) delimiter = ','
  if (tabCount > semiCount && tabCount > commaCount) delimiter = '\t'

  const allRows = parseCsvRows(rawText, delimiter)

  if (allRows.length === 0) {
    return {
      headers: [],
      detectedDelimiter: delimiter,
      encodingUsed: encodingName,
      validProducts: [],
      invalidRows: [],
      totalRows: 0,
    }
  }

  const rawHeaders = allRows[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^["']|["']$/g, ''),
  )
  const headers = rawHeaders

  // Find column indexes
  // User columns: id; data_inclusao; nome; codigo_produto; fornecedor; codigo_barras; quantidade_estoques; preco_venda; valor_venda_estoques; preco_custo; valor_custo_estoques; tipo_produto; variacao; nome_produto_pai; url_imagem; arquivo_imagem
  const colIndex = {
    nome: headers.findIndex((h) => h === 'nome' || h === 'descricao' || h === 'nome_produto'),
    codigo_barras: headers.findIndex(
      (h) => h === 'codigo_barras' || h === 'codigo' || h === 'barcode',
    ),
    quantidade_estoques: headers.findIndex(
      (h) => h === 'quantidade_estoques' || h === 'quantidade' || h === 'estoque',
    ),
    preco_venda: headers.findIndex(
      (h) => h === 'preco_venda' || h === 'preco' || h === 'valor_venda',
    ),
    preco_custo: headers.findIndex(
      (h) => h === 'preco_custo' || h === 'custo' || h === 'investido',
    ),
    url_imagem: headers.findIndex(
      (h) => h === 'url_imagem' || h === 'imagem_url' || h === 'foto_url',
    ),
    arquivo_imagem: headers.findIndex(
      (h) => h === 'arquivo_imagem' || h === 'arquivo' || h === 'imagem_arquivo',
    ),
  }

  const validProducts: ParsedCsvProduct[] = []
  const invalidRows: CsvParseResult['invalidRows'] = []

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r]
    const lineIndex = r + 1

    // Extract mapped values
    const rawCodeBarras =
      colIndex.codigo_barras >= 0 ? (row[colIndex.codigo_barras] || '').trim() : ''
    const rawNome = colIndex.nome >= 0 ? (row[colIndex.nome] || '').trim() : ''
    const rawQty = colIndex.quantidade_estoques >= 0 ? row[colIndex.quantidade_estoques] : '0'
    const rawPrecoVenda = colIndex.preco_venda >= 0 ? row[colIndex.preco_venda] : '0'
    const rawPrecoCusto = colIndex.preco_custo >= 0 ? row[colIndex.preco_custo] : '0'
    const rawUrlImagem = colIndex.url_imagem >= 0 ? (row[colIndex.url_imagem] || '').trim() : ''
    const rawArquivoImagem =
      colIndex.arquivo_imagem >= 0 ? (row[colIndex.arquivo_imagem] || '').trim() : ''

    // Regra: O código deve vir EXCLUSIVAMENTE da coluna codigo_barras.
    // A coluna codigo_produto é descartada/ignorada.
    // Zeros à esquerda são removidos se numérico (ex: "00123" -> "123")
    const stripZeros = (s: string) => {
      const t = (s || '').trim()
      if (!/^\d+$/.test(t)) return t
      const stripped = t.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    }
    const code = stripZeros(rawCodeBarras)
    const description = rawNome

    if (!code) {
      invalidRows.push({
        lineIndex,
        reason: 'Código de barras obrigatório ausente na coluna codigo_barras.',
        rawText: row.join(';').substring(0, 80),
      })
      continue
    }

    if (!description) {
      invalidRows.push({
        lineIndex,
        reason: 'Linha sem nome/descrição de produto.',
        rawText: row.join(';').substring(0, 80),
      })
      continue
    }

    const quantity = Math.max(0, parseInt(rawQty, 10) || 0)
    const sellingPrice = Math.max(0, parseLooseNumber(rawPrecoVenda))
    const investedValue = Math.max(0, parseLooseNumber(rawPrecoCusto))

    const product: ParsedCsvProduct = {
      lineIndex,
      code,
      description: description || `Produto ${code || lineIndex}`,
      quantity,
      selling_price: sellingPrice,
      invested_value: investedValue,
      image_url: rawUrlImagem,
      import_image_path: rawArquivoImagem,
    }

    validProducts.push(product)
  }

  return {
    headers: rawHeaders,
    detectedDelimiter: delimiter,
    encodingUsed: encodingName,
    validProducts,
    invalidRows,
    totalRows: allRows.length - 1,
  }
}
