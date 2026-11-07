import { ClientResponseError } from 'pocketbase'

/**
 * Extrai uma mensagem de erro legível de um erro lançado pelo PocketBase.
 *
 * Por que isso existe: o SDK do PocketBase usa "Something went wrong." como
 * mensagem padrão do ClientResponseError quando o corpo de erro não tem
 * `message` (ex.: os hooks internos respondem { error: "..." } em vez de
 * { message: "..." }) — o que fazia o toast exibir o texto genérico em inglês
 * em vez do motivo real da recusa.
 *
 * Ordem de extração:
 * 1. response.message (padrão PocketBase)
 * 2. response.error (padrão dos hooks internos, ex. reseller_stock_operations)
 * 3. primeira mensagem de validação de campo em response.data
 * 4. mensagens genéricas em português por status HTTP
 */
export function getBackendErrorMessage(error: unknown): string {
  if (error instanceof ClientResponseError) {
    const res: any = error.response || {}

    // 1. Mensagem padrão do PocketBase (ValidationsError e hooks com { message })
    if (typeof res.message === 'string' && res.message.trim()) {
      return res.message.trim()
    }

    // 2. Padrão dos hooks internos (e.json(400, { error: '...' }))
    if (typeof res.error === 'string' && res.error.trim()) {
      return res.error.trim()
    }

    // 3. Mensagem de validação de campo (ex.: { data: { quantity: { message: "cannot be blank" } } })
    const data = res.data
    if (data && typeof data === 'object') {
      const fieldMsgs: string[] = []
      for (const [, detail] of Object.entries(data)) {
        if (
          detail &&
          typeof detail === 'object' &&
          'message' in detail &&
          typeof (detail as { message: unknown }).message === 'string'
        ) {
          fieldMsgs.push((detail as { message: string }).message)
        }
      }
      if (fieldMsgs.length > 0) return fieldMsgs.join(' ')
    }

    // 4. Fallback legível em português por status
    const fallbacks: Record<number, string> = {
      400: 'A requisição foi recusada pelo servidor. Verifique os dados informados e tente novamente.',
      401: 'Sessão expirada. Faça login novamente.',
      403: 'Você não tem permissão para realizar esta operação.',
      404: 'Registro não encontrado.',
      429: 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.',
    }
    return fallbacks[error.status] || 'Ocorreu um erro inesperado. Tente novamente.'
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.'
}
