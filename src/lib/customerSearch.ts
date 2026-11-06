import type { Customer } from '@/types'

// Normaliza texto para busca ao vivo: minúsculas e sem acentos (NFD).
export function normalizeCustomerSearchText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Mantém apenas dígitos — usado para comparar CPF e telefone ignorando máscara.
export function customerDigitsOnly(value?: string | null): string {
  return (value || '').replace(/\D/g, '')
}

// Rótulo exibido no campo quando um cliente fica selecionado na venda.
export function getMaskedCustomerLabel(customer: Pick<Customer, 'name' | 'phone'>): string {
  const phone = (customer.phone || '').trim()
  return phone ? `${customer.name} (${phone})` : customer.name
}

// Busca ao vivo tolerante a máscara em UM único campo livre: casa por nome completo
// (sem acentos, qualquer ordem de palavras), CPF (com ou sem máscara), e-mail e
// telefone/WhatsApp (com ou sem DDD/máscara). Clientes só com nome (CPF vazio)
// continuam encontráveis. A consulta do usuário é triada conforme digita.
export function filterCustomersLive(
  customers: Customer[],
  rawQuery: string,
  limit = 50,
): Customer[] {
  const q = normalizeCustomerSearchText(rawQuery)
  if (!q) {
    return [...customers]
      .sort((a, b) =>
        normalizeCustomerSearchText(a.name).localeCompare(normalizeCustomerSearchText(b.name)),
      )
      .slice(0, limit)
  }

  const qDigits = customerDigitsOnly(q)
  // CPF só é comparado quando a digitação parece um CPF completo (11 dígitos)
  const qDigitsCpf = qDigits.length === 11 ? qDigits : ''
  const qTokens = q.split(/\s+/).filter(Boolean)

  return customers
    .filter((c) => {
      // Nome completo: contém a consulta inteira OU todas as palavras digitadas
      const name = normalizeCustomerSearchText(c.name)
      if (name) {
        if (name.includes(q)) return true
        const nameTokens = name.split(/\s+/)
        if (qTokens.length > 1 && qTokens.every((t) => nameTokens.some((nt) => nt.includes(t)))) {
          return true
        }
      }

      // E-mail
      const email = normalizeCustomerSearchText(c.email)
      if (email && email.includes(q)) return true

      // CPF e telefone/WhatsApp: comparação por dígitos, tolerante a máscara
      if (qDigits) {
        if (qDigitsCpf) {
          const cpf = customerDigitsOnly(c.cpf)
          if (cpf && cpf.includes(qDigitsCpf)) return true
        }
        const phone = customerDigitsOnly(c.phone)
        if (phone && (phone.includes(qDigits) || qDigits.includes(phone))) return true
      }

      return false
    })
    .sort((a, b) =>
      normalizeCustomerSearchText(a.name).localeCompare(normalizeCustomerSearchText(b.name)),
    )
    .slice(0, limit)
}
