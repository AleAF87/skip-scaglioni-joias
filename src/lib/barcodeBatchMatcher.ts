import { Product } from '@/types'

/**
 * Normaliza um código para comparação:
 * - Converte para string
 * - Remove espaços e quebras no início e fim
 * - Reduz múltiplos espaços internos para um único espaço
 * - Converte para minúsculas
 */
export function normalizeCodeForComparison(code?: string | null): string {
  if (!code) return ''
  return String(code).trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Remove aspas circundantes de uma string (ex.: "776981 PRATA 19" -> 776981 PRATA 19)
 */
function cleanQuotedString(val: string): string {
  const trimmed = val.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/**
 * Extrai candidatos a código a partir de uma linha de CSV:
 * Se a linha for delimitada por ponto e vírgula, vírgula ou tabulação:
 * - Se houver cabeçalho com coluna conhecida (codigo_tecson, codigo_lido, code, codigo_barras, codigo),
 *   identifica o índice correspondente
 * - Se não for cabeçalho nem tiver vírgula/ponto e vírgula, a linha inteira é tratada como um código
 */
export function parseRawCodeInput(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return []

  const lines = rawText.split(/\r?\n/)
  const extracted: string[] = []

  // Verifica se a primeira linha parece um cabeçalho CSV com delimitador ; ou , ou \t
  let targetColIndex = -1
  let delimiter: string | null = null

  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine.includes(';') || firstLine.includes(',') || firstLine.includes('\t')) {
      const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ','
      const headers = firstLine.split(sep).map((h) => cleanQuotedString(h).toLowerCase())

      // Procura possíveis nomes de coluna de código
      const candidateNames = [
        'codigo_lido',
        'codigo_tecson',
        'code',
        'codigo',
        'codigo_barras',
        'barcode',
        'sku',
        'cod',
      ]

      for (let i = 0; i < headers.length; i++) {
        if (candidateNames.includes(headers[i])) {
          targetColIndex = i
          delimiter = sep
          break
        }
      }
    }
  }

  const startIndex = targetColIndex !== -1 ? 1 : 0

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Se identificamos uma coluna específica pelo cabeçalho
    if (targetColIndex !== -1 && delimiter) {
      const parts = line.split(delimiter)
      if (parts.length > targetColIndex) {
        const val = cleanQuotedString(parts[targetColIndex])
        if (val) extracted.push(val)
      }
      continue
    }

    // Se não há cabeçalho reconhecido:
    // Se a linha tem delimitador (ex: lista separada por vírgula ou ponto-e-vírgula em uma ou várias linhas)
    // quebra em tokens
    if (line.includes(';') || line.includes(',')) {
      const tokens = line.split(/[;,]/)
      for (const t of tokens) {
        const clean = cleanQuotedString(t)
        if (clean) extracted.push(clean)
      }
    } else {
      // Linha única com o código (mesmo que contenha espaços internos como '776981 PRATA 19')
      const clean = cleanQuotedString(line)
      if (clean) extracted.push(clean)
    }
  }

  // Remove duplicados preservando a ordem
  const seen = new Set<string>()
  const uniqueList: string[] = []
  for (const item of extracted) {
    const norm = normalizeCodeForComparison(item)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      uniqueList.push(item.trim())
    }
  }

  return uniqueList
}

export interface MatchResult {
  matchedProducts: Product[]
  matchedIds: string[]
  unmatchedCodes: string[]
  totalInputCodes: number
  matchedCount: number
  unmatchedCount: number
}

/**
 * Casa a lista de códigos com a lista de produtos carregados:
 * 1. Para cada produto, cria chaves normalizadas dos seus códigos (code, codigo_barras, sku_interno, sku_novo, etc.)
 * 2. Faz correspondência tolerante a:
 *    - Diferença de maiúsculas/minúsculas
 *    - Espaços no início e fim
 *    - Espaços múltiplos internos
 *    - Código principal com prefixo numérico (ex: lista traz "776981 PRATA 19" e produto tem "776981" ou "776981 PRATA 19")
 *    - Zeros à esquerda quando estritamente numérico (ex.: "008112" casa com "8112")
 */
export function matchCodesWithProducts(inputCodes: string[], products: Product[]): MatchResult {
  const matchedProductMap = new Map<string, Product>()
  const matchedCodesSet = new Set<string>()

  // Pré-indexar produtos
  // Mapeia normalizado -> lista de produtos
  const codeIndex = new Map<string, Product[]>()
  const numericCodeIndex = new Map<number, Product[]>()

  for (const p of products) {
    const candidates = [
      p.code,
      p.codigo_barras,
      p.codigo_barras_tecson,
      p.codigo_produto_tecson,
      p.sku_interno,
      p.sku_novo,
      p.sku_scaglioni,
    ].filter(Boolean) as string[]

    // Opção A Tecson: se tiver código e variação, inclui combinações número+variação
    // ex: p.code="8112" e p.variacao="N14" -> indexa "8112 n14", "8112-n14"
    const pCodeNum = (p.code || p.sku_novo || '').trim()
    const pVar = (p.variacao || '').trim()
    if (pCodeNum && pVar) {
      candidates.push(`${pCodeNum} ${pVar}`)
    }

    for (const c of candidates) {
      const norm = normalizeCodeForComparison(c)
      if (norm) {
        if (!codeIndex.has(norm)) codeIndex.set(norm, [])
        codeIndex.get(norm)!.push(p)
      }

      // Se for puramente numérico
      if (/^\d+$/.test(norm)) {
        const numVal = parseInt(norm, 10)
        if (!isNaN(numVal)) {
          if (!numericCodeIndex.has(numVal)) numericCodeIndex.set(numVal, [])
          numericCodeIndex.get(numVal)!.push(p)
        }
      }
    }
  }

  for (const rawCode of inputCodes) {
    const norm = normalizeCodeForComparison(rawCode)
    if (!norm) continue

    let foundProducts: Product[] = []

    // 1. Match exato pelo código normalizado
    if (codeIndex.has(norm)) {
      foundProducts = codeIndex.get(norm)!
    }

    // 2. Se for estritamente dígitos, tenta match numérico ignorando zeros à esquerda (ex.: 008112 -> 8112)
    if (foundProducts.length === 0 && /^\d+$/.test(norm)) {
      const numVal = parseInt(norm, 10)
      if (!isNaN(numVal) && numericCodeIndex.has(numVal)) {
        foundProducts = numericCodeIndex.get(numVal)!
      }
    }

    // 2b. Se o código da lista tiver formato composto número + sufixo/variação
    // (ex.: "008112 N14" ou "8112 N14"), tenta strippedLeadingZeros do número + resto
    if (foundProducts.length === 0 && norm.includes(' ')) {
      const spaceIdx = norm.indexOf(' ')
      const prefix = norm.slice(0, spaceIdx).trim()
      const suffix = norm.slice(spaceIdx + 1).trim()
      if (/^\d+$/.test(prefix)) {
        const strippedNum = prefix.replace(/^0+/, '') || '0'
        const strippedCombined = `${strippedNum} ${suffix}`
        if (codeIndex.has(strippedCombined)) {
          foundProducts = codeIndex.get(strippedCombined)!
        }
      }
    }

    // 3. Se ainda não encontrou e o código da lista tiver formato composto (ex.: "776981 PRATA 19" ou "008112 N14"),
    // testa se a primeira parte numérica isolada bate com algum produto (só se não houver variações específicas)
    if (foundProducts.length === 0) {
      const firstToken = norm.split(' ')[0]
      if (firstToken && /^\d+$/.test(firstToken)) {
        const numVal = parseInt(firstToken, 10)
        if (!isNaN(numVal) && numericCodeIndex.has(numVal)) {
          foundProducts = numericCodeIndex.get(numVal)!
        } else if (codeIndex.has(firstToken)) {
          foundProducts = codeIndex.get(firstToken)!
        }
      }
    }

    // 4. Se encontrou correspondência, adiciona ao mapa
    if (foundProducts.length > 0) {
      matchedCodesSet.add(rawCode)
      for (const p of foundProducts) {
        matchedProductMap.set(p.id, p)
      }
    }
  }

  const matchedProducts = Array.from(matchedProductMap.values())
  const matchedIds = matchedProducts.map((p) => p.id)
  const unmatchedCodes = inputCodes.filter((c) => !matchedCodesSet.has(c))

  return {
    matchedProducts,
    matchedIds,
    unmatchedCodes,
    totalInputCodes: inputCodes.length,
    matchedCount: matchedIds.length,
    unmatchedCount: unmatchedCodes.length,
  }
}
