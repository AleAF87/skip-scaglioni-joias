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
}

/**
 * Casa uma query falada com uma lista de cadastros auxiliares (tipos, materiais, tamanhos).
 */
export function matchAuxiliaryItem<T extends { id: string; name: string }>(
  query: string,
  list: T[],
): MatchResult<T> {
  const qClean = normalizeForMatch(query)
  if (!qClean) {
    return {
      matched: null,
      exact: false,
      ambiguous: false,
      candidates: [],
      originalInput: query,
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
      originalInput: query,
    }
  }

  // 2. Busca por contenção (a query contém o item ou o item contém a query)
  const candidates = list.filter((item) => {
    const itemClean = normalizeForMatch(item.name)
    return itemClean.includes(qClean) || qClean.includes(itemClean)
  })

  if (candidates.length === 1) {
    return {
      matched: candidates[0],
      exact: false,
      ambiguous: false,
      candidates,
      originalInput: query,
    }
  }

  if (candidates.length > 1) {
    // Tenta desempate por quem começa com a query
    const prefixMatch = candidates.filter((item) => normalizeForMatch(item.name).startsWith(qClean))
    if (prefixMatch.length === 1) {
      return {
        matched: prefixMatch[0],
        exact: false,
        ambiguous: false,
        candidates: prefixMatch,
        originalInput: query,
      }
    }

    return {
      matched: null,
      exact: false,
      ambiguous: true,
      candidates,
      originalInput: query,
    }
  }

  return {
    matched: null,
    exact: false,
    ambiguous: false,
    candidates: [],
    originalInput: query,
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

  if (
    clean.includes('fem') ||
    clean.includes('mulher') ||
    clean.includes('moca') ||
    clean.includes('dama')
  ) {
    return { value: 'feminino', recognized: true }
  }
  if (
    clean.includes('masc') ||
    clean.includes('homem') ||
    clean.includes('rapaz') ||
    clean.includes('varao')
  ) {
    return { value: 'masculino', recognized: true }
  }
  if (
    clean.includes('uni') ||
    clean.includes('ambos') ||
    clean.includes('misto') ||
    clean.includes('neutro')
  ) {
    return { value: 'unissex', recognized: true }
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
