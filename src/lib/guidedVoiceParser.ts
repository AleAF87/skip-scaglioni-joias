/**
 * Utilitários para casamento e interpretação de fala em modo guiado
 * (tipo, material, perfil, tamanho, valores monetários, quantidade, descrição e observações).
 */

import { ProductType, ProductMaterial, ProductSize } from '@/types'
import { normalizeCurrencyValue, normalizeCurrencyText } from '@/lib/formatters'

/**
 * Remove acentuação e pontuação para comparações fonéticas/flexíveis
 */
export function normalizeForMatch(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface MatchResult<T> {
  matched: T | null
  exact: boolean
  ambiguous: boolean
  candidates: T[]
  originalInput: string
  score?: number
}

/**
 * Calcula a distância de Levenshtein entre duas strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  const aLen = a.length
  const bLen = b.length

  if (aLen === 0) return bLen
  if (bLen === 0) return aLen

  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return matrix[aLen][bLen]
}

/**
 * Retorna similaridade normalizada entre 0 e 1 (1 = idêntico)
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForMatch(str1)
  const s2 = normalizeForMatch(str2)
  if (!s1 && !s2) return 1
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  const maxLen = Math.max(s1.length, s2.length)
  const dist = levenshteinDistance(s1, s2)
  return 1 - dist / maxLen
}

/**
 * Remove palavras de preenchimento comuns da fala para comparar cadastros
 */
function cleanQuerySpeech(raw: string): string {
  let clean = normalizeForMatch(raw)
  // Remove termos como "tamanho", "tam", "aro", "numero", "material", "tipo", "de", "do", "da", "em", "um", "uma"
  clean = clean.replace(/^(?:tamanho|tam|aro|numero|material|tipo|peca|joia)\s+/gi, '')
  clean = clean.replace(/\b(?:de|do|da|em|com)\b/gi, ' ')
  return clean.replace(/\s+/g, ' ').trim()
}

/**
 * Extrai números explícitos de uma string
 */
function extractNumbers(str: string): string[] {
  const matches = str.match(/\d+/g)
  return matches ? matches : []
}

/**
 * Casa uma query falada com uma lista de cadastros auxiliares (tipos, materiais, tamanhos).
 * Suporta:
 * 1. Match exato normalizado
 * 2. Proteção estrita para números em tamanhos: se a fala tem número (ex: "tamanho 25"),
 *    nunca casa com letras (ex: "M", "P", "G")
 * 3. Busca por contenção e prefixo de palavras
 * 4. Correspondência fuzzy/similaridade de Levenshtein (tolerante a grafias cortadas como "folhado" -> "folheado a ouro")
 * 5. Tratamento de ambiguidade (se houver mais de uma sugestão plausível, retorna candidatos para escolha do usuário)
 */
export function matchAuxiliaryItem<T extends { id: string; name: string }>(
  query: string,
  list: T[],
  options?: { category?: 'type' | 'material' | 'size' | 'audience' },
): MatchResult<T> {
  const originalInput = query || ''
  const qClean = normalizeForMatch(query)
  if (!qClean || list.length === 0) {
    return {
      matched: null,
      exact: false,
      ambiguous: false,
      candidates: [],
      originalInput,
    }
  }

  // REQUISITO: "sempre selecionar o último item falado (exemplo falou 'brinco pulseira', seleciona 'pulseira')"
  // Se a transcrição contiver múltiplos itens da lista (ou palavras que batem exatamente com nomes de itens),
  // a última opção mencionada na fala deve vencer.
  interface PositionedMatch {
    item: T
    pos: number
    exactLength: number
  }

  const findLastMentionedItem = (): T | null => {
    const matches: PositionedMatch[] = []
    // Tokeniza e busca por limites de palavra para evitar falso positivos parciais
    for (const item of list) {
      const itemClean = normalizeForMatch(item.name)
      if (!itemClean || itemClean.length < 2) continue

      // Regex de palavra inteira no texto normalizado
      const escaped = itemClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'gi')
      let m: RegExpExecArray | null
      while ((m = regex.exec(qClean)) !== null) {
        // Encontra o índice real de onde a palavra começa
        const matchedIndex = m.index + (m[0].startsWith(' ') ? 1 : 0)
        matches.push({
          item,
          pos: matchedIndex,
          exactLength: itemClean.length,
        })
      }
    }

    if (matches.length > 0) {
      // Ordena decrescente pela posição final (último falado na frase)
      matches.sort((a, b) => {
        if (b.pos !== a.pos) return b.pos - a.pos
        // Se começam na mesma posição (ex: "ouro" vs "ouro branco"), vence o mais específico/longo
        return b.exactLength - a.exactLength
      })
      return matches[0].item
    }
    return null
  }

  const lastMentioned = findLastMentionedItem()
  if (lastMentioned) {
    return {
      matched: lastMentioned,
      exact: true,
      ambiguous: false,
      candidates: [lastMentioned],
      originalInput,
      score: 1,
    }
  }

  // 1. Match exato normalizado
  const exact = list.find((item) => normalizeForMatch(item.name) === qClean)
  if (exact) {
    return {
      matched: exact,
      exact: true,
      ambiguous: false,
      candidates: [exact],
      originalInput,
      score: 1,
    }
  }

  // Limpeza de prefixos como "tamanho 25" -> "25", "material ouro" -> "ouro"
  const qSpeechClean = cleanQuerySpeech(query)
  if (qSpeechClean) {
    const exactClean = list.find((item) => normalizeForMatch(item.name) === qSpeechClean)
    if (exactClean) {
      return {
        matched: exactClean,
        exact: true,
        ambiguous: false,
        candidates: [exactClean],
        originalInput,
        score: 1,
      }
    }
  }

  // PROTEÇÃO CONTRA O BUG RELATADO: "tamanho 25" casar com "M"
  // Se a query contém dígitos numéricos (ex: 25, 18, 45), candidatos NÃO NUMÉRICOS de tamanho
  // com apenas letras (ex: P, M, G, GG, PP, Unico) JAMAIS podem ser casados por contenção acidental.
  const queryNumbers = extractNumbers(qClean)
  const hasQueryNumbers = queryNumbers.length > 0

  // Se o usuário falou um número (ex: "25", "tamanho 25", "aro 20"):
  if (hasQueryNumbers) {
    const primaryNum = queryNumbers[0]
    // Procura por tamanho numérico exato na lista (ex: "25" ou "25cm" ou "aro 25")
    const numCandidates = list.filter((item) => {
      const itemNumbers = extractNumbers(item.name)
      if (itemNumbers.includes(primaryNum)) return true
      const itemClean = normalizeForMatch(item.name)
      return itemClean === primaryNum || itemClean === `${primaryNum}cm`
    })

    if (numCandidates.length === 1) {
      return {
        matched: numCandidates[0],
        exact: false,
        ambiguous: false,
        candidates: numCandidates,
        originalInput,
        score: 0.95,
      }
    }

    if (numCandidates.length > 1) {
      return {
        matched: null,
        exact: false,
        ambiguous: true,
        candidates: numCandidates,
        originalInput,
      }
    }

    // Se a query tem número e não existe nenhum item numérico correspondente na lista (ex: "25"),
    // NÃO podemos casar com nada existente (evita "25" -> "M"). Retorna null direto!
    return {
      matched: null,
      exact: false,
      ambiguous: false,
      candidates: [],
      originalInput,
    }
  }

  // PROTEÇÃO INVERSA: Se a query é uma letra única de tamanho (ex: "P", "M", "G"),
  // só casar com letras únicas idênticas
  if (qSpeechClean.length === 1 && /[pmg]/i.test(qSpeechClean)) {
    const letterMatch = list.find((item) => normalizeForMatch(item.name) === qSpeechClean)
    if (letterMatch) {
      return {
        matched: letterMatch,
        exact: true,
        ambiguous: false,
        candidates: [letterMatch],
        originalInput,
        score: 1,
      }
    }
    return {
      matched: null,
      exact: false,
      ambiguous: false,
      candidates: [],
      originalInput,
    }
  }

  // 2. Pontuação de similaridade e fuzzy matching para cada item
  // Suporta palavras cortadas e variações fonéticas (ex: "folhado" -> "folheado a ouro", "ouro rose" -> "ouro rosê")
  interface ScoredCandidate {
    item: T
    score: number
  }

  const scored: ScoredCandidate[] = []

  // Normalização fonética leve para português (folhado ~ folheado, etc.)
  const phoneticPtBr = (str: string) => {
    return normalizeForMatch(str)
      .replace(/lh/g, 'l')
      .replace(/ea/g, 'a')
      .replace(/ia/g, 'a')
      .replace(/ss/g, 's')
      .replace(/ç/g, 'c')
      .replace(/z/g, 's')
      .replace(/ch/g, 'x')
      .replace(/k/g, 'c')
  }

  const qPhonetic = phoneticPtBr(qSpeechClean || qClean)

  for (const item of list) {
    const itemClean = normalizeForMatch(item.name)
    const itemSpeechClean = cleanQuerySpeech(item.name)
    const itemPhonetic = phoneticPtBr(itemSpeechClean || itemClean)

    // Se o item for apenas letra única e a query tiver mais de 1 caractere, descarta
    if (itemClean.length === 1 && (qSpeechClean.length > 1 || qClean.length > 1)) {
      continue
    }

    let itemScore = 0

    // Caso A: igualdade exata na versão sem stopwords
    if (itemClean === qSpeechClean || itemSpeechClean === qSpeechClean) {
      itemScore = 0.98
    }
    // Caso B: o item começa com a query ou a query começa com o item
    else if (itemClean.startsWith(qClean) || itemSpeechClean.startsWith(qSpeechClean)) {
      itemScore = 0.9
    }
    // Caso C: contenção de palavra inteira (ex: "folheado" em "folheado a ouro")
    else if (
      itemClean.includes(qSpeechClean) ||
      (qSpeechClean && qSpeechClean.includes(itemClean))
    ) {
      // Razão de tamanho para ponderar
      const ratio =
        Math.min(itemClean.length, qSpeechClean.length) /
        Math.max(itemClean.length, qSpeechClean.length)
      itemScore = 0.8 + ratio * 0.15
    }
    // Caso D: Similaridade fonética / fuzzy Levenshtein
    else {
      const simDirect = stringSimilarity(qSpeechClean || qClean, itemSpeechClean || itemClean)
      const simPhonetic = stringSimilarity(qPhonetic, itemPhonetic)

      // Também testa substrings/palavras (ex: "folhado" contra "folheado" na frase "folheado a ouro")
      const itemWords = itemClean.split(' ')
      let maxWordSim = 0
      for (const w of itemWords) {
        if (w.length <= 2) continue
        const wSim = stringSimilarity(qSpeechClean, w)
        const wPhon = stringSimilarity(qPhonetic, phoneticPtBr(w))
        if (wSim > maxWordSim) maxWordSim = wSim
        if (wPhon > maxWordSim) maxWordSim = wPhon
      }

      const bestSim = Math.max(simDirect, simPhonetic, maxWordSim * 0.9)
      if (bestSim >= 0.6) {
        itemScore = bestSim
      }
    }

    if (itemScore >= 0.6) {
      scored.push({ item, score: itemScore })
    }
  }

  // Ordena por maior pontuação
  scored.sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return {
      matched: null,
      exact: false,
      ambiguous: false,
      candidates: [],
      originalInput,
      score: 0,
    }
  }

  const topMatch = scored[0]

  // Se houver apenas 1 candidato e pontuação confiável (>= 0.65), é match direto
  if (scored.length === 1 && topMatch.score >= 0.65) {
    return {
      matched: topMatch.item,
      exact: topMatch.score >= 0.95,
      ambiguous: false,
      candidates: [topMatch.item],
      originalInput,
      score: topMatch.score,
    }
  }

  // Se houver 2+ candidatos plausíveis
  if (scored.length > 1) {
    const secondMatch = scored[1]

    // Se o primeiro estiver muito acima do segundo (diferença >= 0.20 e score >= 0.82), não é ambíguo
    if (topMatch.score >= 0.82 && topMatch.score - secondMatch.score >= 0.2) {
      return {
        matched: topMatch.item,
        exact: topMatch.score >= 0.95,
        ambiguous: false,
        candidates: [topMatch.item],
        originalInput,
        score: topMatch.score,
      }
    }

    // Caso contrário: ambíguo! Pega todos com score acima de 0.60 (até 5 itens)
    const plausibleCandidates = scored.filter((s) => s.score >= 0.6).map((s) => s.item)
    return {
      matched: null,
      exact: false,
      ambiguous: true,
      candidates: plausibleCandidates,
      originalInput,
      score: topMatch.score,
    }
  }

  return {
    matched: null,
    exact: false,
    ambiguous: false,
    candidates: [],
    originalInput,
    score: 0,
  }
}

/**
 * Mapeia texto falado para Perfil: 'feminino' | 'masculino' | 'unissex'
 */
export function parseTargetAudience(text: string): {
  value: 'feminino' | 'masculino' | 'unissex' | ''
  recognized: boolean
} {
  const clean = normalizeForMatch(text)
  if (!clean) return { value: '', recognized: false }

  // Se o usuário falou várias palavras (ex: "masculino feminino" ou "para homem e mulher"),
  // seleciona a ÚLTIMA opção mencionada na fala.
  const femKeywords = [
    'feminino',
    'feminina',
    'mulher',
    'mulheres',
    'moca',
    'mocas',
    'dama',
    'damas',
    'fem',
  ]
  const mascKeywords = [
    'masculino',
    'masculina',
    'homem',
    'homens',
    'rapaz',
    'rapazes',
    'varao',
    'masc',
  ]
  const uniKeywords = [
    'unissex',
    'unisex',
    'ambos',
    'ambas',
    'misto',
    'mista',
    'neutro',
    'neutra',
    'uni',
  ]

  interface AudMatch {
    type: 'feminino' | 'masculino' | 'unissex'
    pos: number
  }

  const occurrences: AudMatch[] = []

  const findLastOfKeywords = (keywords: string[], type: 'feminino' | 'masculino' | 'unissex') => {
    for (const kw of keywords) {
      let idx = clean.lastIndexOf(kw)
      while (idx !== -1) {
        occurrences.push({ type, pos: idx })
        if (idx === 0) break
        idx = clean.lastIndexOf(kw, idx - 1)
      }
    }
  }

  findLastOfKeywords(femKeywords, 'feminino')
  findLastOfKeywords(mascKeywords, 'masculino')
  findLastOfKeywords(uniKeywords, 'unissex')

  if (occurrences.length > 0) {
    // Ordena pela maior posição (última ocorrência no texto falado)
    occurrences.sort((a, b) => b.pos - a.pos)
    return { value: occurrences[0].type, recognized: true }
  }

  return { value: '', recognized: false }
}

/**
 * Mapeia palavras faladas simples para números inteiros (ex: "um", "dois", "dez", "vinte e cinco")
 */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  hum: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
}

/**
 * Converte texto falado de quantidade em número inteiro
 */
export function parseQuantityText(text: string): { value: number | null; recognized: boolean } {
  if (!text) return { value: null, recognized: false }
  const clean = normalizeForMatch(text)

  // 1. Dígitos diretos (ex: "5", "10 unidades", "20 pecas")
  const digitMatch = clean.match(/\b\d+\b/)
  if (digitMatch) {
    const parsed = parseInt(digitMatch[0], 10)
    if (!isNaN(parsed) && parsed >= 0) {
      return { value: parsed, recognized: true }
    }
  }

  // 2. Palavras numéricas compostas (ex: "vinte e cinco", "trinta e dois")
  const words = clean.split(' ').filter(Boolean)
  let accumulated = 0
  let matchedWord = false

  for (const w of words) {
    if (w === 'e' || w === 'unidade' || w === 'unidades' || w === 'peca' || w === 'pecas') continue
    if (NUMBER_WORDS[w] !== undefined) {
      accumulated += NUMBER_WORDS[w]
      matchedWord = true
    }
  }

  if (matchedWord && accumulated >= 0) {
    return { value: accumulated, recognized: true }
  }

  return { value: null, recognized: false }
}

/**
 * Converte texto falado de valor monetário (investido ou preço de venda)
 * Suporta falas como "sessenta reais", "sessenta e cinco e noventa", "20", "138,42", "78,902"
 */
export function parseCurrencySpeech(text: string): {
  value: number | null
  formattedString: string
  recognized: boolean
} {
  if (!text) return { value: null, formattedString: '', recognized: false }

  const normalizedText = normalizeCurrencyText(text)

  // 1. Tenta extrair valores já digitais com vírgula ou ponto (ex: "138,42", "60.00", "78,902")
  const numberRegex = /(\d+(?:[.,]\d+)?)/g
  const matches = normalizedText.match(numberRegex)

  if (matches && matches.length > 0) {
    // Se o usuário falou algo como "sessenta e noventa" e foi transcrito como "60 90" ou "60 e 90"
    const splitCheck = normalizedText.match(/(\d+)\s*(?:e|,|\.)\s*(\d{1,2})\b/)
    if (splitCheck) {
      const intPart = splitCheck[1]
      const centsPart = splitCheck[2].padEnd(2, '0').slice(0, 2)
      const reconstructed = `${intPart}.${centsPart}`
      const val = normalizeCurrencyValue(reconstructed)
      if (val !== null && val >= 0) {
        return {
          value: val,
          formattedString: val.toFixed(2),
          recognized: true,
        }
      }
    }

    // Pega o primeiro número identificado
    const firstMatch = matches[0]
    const val = normalizeCurrencyValue(firstMatch)
    if (val !== null && val >= 0) {
      return {
        value: val,
        formattedString: val.toFixed(2),
        recognized: true,
      }
    }
  }

  // 2. Fallback para palavras por extenso (ex: "sessenta reais", "vinte reais")
  const clean = normalizeForMatch(text)
  const words = clean.split(' ').filter(Boolean)
  let accumulated = 0
  let matchedWord = false

  for (const w of words) {
    if (w === 'e' || w === 'real' || w === 'reais' || w === 'conto' || w === 'contos') continue
    if (NUMBER_WORDS[w] !== undefined) {
      accumulated += NUMBER_WORDS[w]
      matchedWord = true
    }
  }

  if (matchedWord && accumulated >= 0) {
    return {
      value: accumulated,
      formattedString: accumulated.toFixed(2),
      recognized: true,
    }
  }

  return { value: null, formattedString: '', recognized: false }
}

/**
 * Sanitiza a descrição para remover menções redundantes ao tipo, material, perfil e tamanho.
 */
export function cleanSpokenDescription(
  rawDesc: string,
  typeName?: string,
  materialName?: string,
  audience?: string,
  sizeName?: string,
): string {
  if (!rawDesc) return ''
  let cleaned = rawDesc

  // 1. Remove menções ao material
  const matTerms: string[] = []
  if (materialName) {
    matTerms.push(materialName)
    matTerms.push(materialName.replace(/\s*18k\b/gi, '').trim())
  }
  matTerms.push(
    'ouro branco',
    'ouro amarelo',
    'ouro rose',
    'ouro rosê',
    'ouro 18k',
    'ouro',
    'prata 925',
    'prata',
    'folheado a ouro',
    'folheado',
    'aço cirúrgico',
    'aco cirurgico',
    'aço',
  )
  for (const term of matTerms) {
    if (!term || term.length < 3) continue
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(
      new RegExp(
        `^(?:peça\\s+)?(?:em\\s+|de\\s+)?${esc}(?:\\s+(?:com|de|em|e|para)\\s+|[,;:\\-—\\s]+)*`,
        'gi',
      ),
      '',
    )
    cleaned = cleaned.replace(
      new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${esc}\\b`, 'gi'),
      '',
    )
  }

  // 2. Remove menções ao tipo
  const typeTerms: string[] = []
  if (typeName) typeTerms.push(typeName)
  typeTerms.push(
    'brinco',
    'anel',
    'colar',
    'pulseira',
    'pingente',
    'gargantilha',
    'choker',
    'joia',
    'peça',
    'peca',
  )
  for (const term of typeTerms) {
    if (!term || term.length < 3) continue
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(
      new RegExp(`^${esc}(?:\\s+(?:com|de|em|e)\\s+|[,;:\\-—\\s]+)*`, 'gi'),
      '',
    )
    cleaned = cleaned.replace(
      new RegExp(`(?:\\s*(?:,|\\be\\b|com|em|de)\\s+)?\\b${esc}\\b`, 'gi'),
      '',
    )
  }

  // 3. Remove menções ao perfil
  if (audience) {
    const audRegex = new RegExp(`\\b(${audience}|feminino|masculino|unissex)\\b`, 'gi')
    cleaned = cleaned.replace(audRegex, '')
  } else {
    cleaned = cleaned.replace(/\b(feminino|masculino|unissex)\b/gi, '')
  }

  // 4. Remove menções ao tamanho
  if (sizeName) {
    const esc = sizeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\b(tamanho\\s+)?${esc}\\b`, 'gi'), '')
  }
  cleaned = cleaned.replace(/\btamanho\s+(único|unico|\d+)\b/gi, '')

  // 5. Limpa pontuações e conectivos sobrando
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:com|de|em|e|para|—|-|,|\.)\s+/i, '')
    .replace(/\s*[,.\-—]\s*$/, '')
    .trim()

  return cleaned || rawDesc.trim()
}
