/**
 * Normaliza qualquer representação de valor monetário para exatamente 2 casas decimais.
 *
 * REGRA ADOTADA:
 * Em todo o sistema (transcrições de voz, interpretação por IA, inputs numéricos, PDV e tabelas),
 * nenhum valor monetário deve conter mais de 2 dígitos de centavos.
 *
 * Quando a fala for pausada e a transcrição / STT produzir 3 dígitos decimais com um zero intercalado
 * (exemplo relatado pelo usuário: "78,902" ou "78.902" ao falar "setenta e oito e noventa... dois"),
 * a regra remove o zero errôneo entre o primeiro e o segundo dígito ("902" -> "92"), resultando em 78.92.
 * Caso haja 3 ou mais dígitos decimais em outro padrão (ex: "1234.567" ou "1.234,567"), a função
 * arredonda com precisão para 2 casas decimais (1234.57).
 *
 * Suporta formatos numéricos brasileiros ("1.234,56", "78,902") e internacionais ("1234.567", "78.902").
 *
 * @param input Número, string ou nulo/indefinido
 * @returns Número com no máximo 2 casas decimais (ou null se inválido/vazio)
 */
export function normalizeCurrencyValue(input?: number | string | null): number | null {
  if (input === undefined || input === null) return null
  if (typeof input === 'number') {
    if (isNaN(input)) return null
    // Se for número puro, converte para string para verificar se tem o padrão de 3 decimais com zero
    input = input.toString()
  }

  const trimmed = input.toString().trim()
  if (!trimmed) return null

  // Remove símbolo de moeda R$, espaços
  let cleaned = trimmed.replace(/^R\$\s*/i, '').replace(/\s/g, '')

  // Se contiver ponto de milhar brasileiro e vírgula decimal (ex: "1.234,567" ou "1.234,56")
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Se o ponto vier antes da vírgula (formato brasileiro padrão 1.234,56)
    if (cleaned.lastIndexOf('.') < cleaned.lastIndexOf(',')) {
      cleaned = cleaned.replace(/\./g, '') // remove separadores de milhar
    } else {
      // Formato invertido internacional (1,234.56)
      cleaned = cleaned.replace(/,/g, '')
    }
  }

  // Normaliza vírgula decimal para ponto
  cleaned = cleaned.replace(',', '.')

  // Trata casos com múltiplos pontos restantes (deixa apenas o último como decimal)
  const lastDot = cleaned.lastIndexOf('.')
  if (lastDot !== -1) {
    const intPart = cleaned.slice(0, lastDot).replace(/\./g, '')
    const decPart = cleaned.slice(lastDot + 1)
    cleaned = `${intPart}.${decPart}`
  }

  // Analisa partes inteira e decimal
  const parts = cleaned.split('.')
  if (parts.length === 2) {
    const intPart = parts[0]
    let decPart = parts[1]

    // REGRA ESPECÍFICA DE DITADO PAUSADO:
    // Se a fala pausada gerou 3 dígitos no padrão "D0D" (ex: "902" -> "92"), remove o '0' intercalado
    if (decPart.length === 3 && /^[0-9]0[0-9]$/.test(decPart)) {
      decPart = decPart[0] + decPart[2]
      cleaned = `${intPart}.${decPart}`
    } else if (decPart.length > 2) {
      // Arredonda para 2 casas decimais
      const val = parseFloat(cleaned)
      if (isNaN(val)) return null
      return Math.round(val * 100) / 100
    }
  }

  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return Math.round(num * 100) / 100
}

/**
 * Normaliza um texto com números falados ou digitados substituindo padrões monetários
 * com 3 dígitos decorrentes de pausas (ex: "78,902" -> "78,92" ou "78.902" -> "78.92").
 */
export function normalizeCurrencyText(text: string): string {
  if (!text) return ''

  // Substitui padrões como "78,902" -> "78,92" e "78.902" -> "78.92"
  return text.replace(/\b(\d+)([,.])(\d)0(\d)\b/g, (_match, intPart, sep, d1, d2) => {
    return `${intPart}${sep}${d1}${d2}`
  })
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00'
  }
  const normalized = Math.round(value * 100) / 100
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized)
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '—'
  try {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch {
    return '—'
  }
}

export function formatCpf(cpf?: string | null): string {
  if (!cpf) return '—'
  const clean = cpf.replace(/\D/g, '')
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return cpf.trim() || '—'
}

export function formatPhone(phone?: string | null): string {
  if (!phone) return '—'
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 11) {
    return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (clean.length === 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return phone.trim() || '—'
}

export function formatCep(cep?: string | null): string {
  if (!cep) return '—'
  const clean = cep.replace(/\D/g, '')
  if (clean.length === 8) {
    return clean.replace(/(\d{5})(\d{3})/, '$1-$2')
  }
  return cep.trim() || '—'
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—'
  try {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

export function getFileUrl(collectionName: string, recordId: string, fileName?: string): string {
  if (!fileName) return ''
  // If fileName is already a full URL (fallback from image_url)
  if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
    return fileName
  }
  const base = import.meta.env.VITE_POCKETBASE_URL || ''
  return `${base}/api/files/${collectionName}/${recordId}/${fileName}`
}

export function getProductDisplayPhoto(
  product?: { photos?: string[]; image_url?: string; id?: string } | null,
): string {
  if (!product) return ''
  if (product.photos && product.photos.length > 0 && product.id) {
    return getFileUrl('products', product.id, product.photos[0])
  }
  if (product.image_url) {
    return product.image_url
  }
  return ''
}
