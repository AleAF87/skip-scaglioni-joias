import { ConsignmentDocumentSnapshot } from '@/types'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/formatters'

/**
 * Utilitário para formatar endereço completo legível
 */
export function formatFullAddress(addr: {
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  zip?: string
}): string {
  const parts: string[] = []
  if (addr.street) {
    let rua = addr.street
    if (addr.number) rua += `, nº ${addr.number}`
    if (addr.complement) rua += ` (${addr.complement})`
    parts.push(rua)
  }
  if (addr.neighborhood) parts.push(`Bairro ${addr.neighborhood}`)
  if (addr.city) {
    let loc = addr.city
    if (addr.state) loc += `/${addr.state}`
    parts.push(loc)
  }
  if (addr.zip) parts.push(`CEP: ${addr.zip}`)

  if (parts.length === 0) return '[Endereço não cadastrado]'
  return parts.join(', ')
}

/**
 * Gera o documento estruturado em texto e layout HTML/canvas para impressão e renderização
 */
export function getDocumentTextModel(snapshot: ConsignmentDocumentSnapshot) {
  const company = snapshot.company
  const reseller = snapshot.reseller
  const consignment = snapshot.consignment
  const items = snapshot.items
  const totals = snapshot.totals
  const signature = snapshot.signature

  // Placeholders entre colchetes caso falte dado
  const razaoSocial = company.legal_name || '[Razão Social da Scaglioni Joias não cadastrada]'
  const cnpj = company.cnpj || '[CNPJ não cadastrado]'
  const enderecoEmpresa = formatFullAddress({
    street: company.address_street,
    number: company.address_number,
    complement: company.address_complement,
    neighborhood: company.address_neighborhood,
    city: company.address_city,
    state: company.address_state,
    zip: company.address_zip,
  })

  const nomeRevendedora = reseller.name || '[Nome Completo da Revendedora não cadastrado]'
  const cpfRevendedora = reseller.cpf || '[CPF não cadastrado]'
  const dataNascimento = reseller.birth_date
    ? formatDate(reseller.birth_date)
    : '[Data de nascimento não cadastrada]'
  const enderecoRevendedora = formatFullAddress({
    street: reseller.address_street,
    number: reseller.address_number,
    complement: reseller.address_complement,
    neighborhood: reseller.address_neighborhood,
    city: reseller.address_city,
    state: reseller.address_state,
    zip: reseller.address_zip,
  })
  const whatsappRevendedora = reseller.phone || '[Telefone/WhatsApp não informado]'
  const emailRevendedora = reseller.email || '[E-mail não informado]'

  const codigoLista = consignment.code
  const dataEmissao = formatDateTime(consignment.created_at)
  const prazoVenda = consignment.valid_until
    ? formatDate(consignment.valid_until)
    : '[A definir conforme alinhamento]'
  const dataAcerto = consignment.financial_due_date
    ? formatDate(consignment.financial_due_date)
    : consignment.valid_until
      ? formatDate(consignment.valid_until)
      : '[Conforme acordado com a administração]'
  const dataDevolucao = consignment.return_due_date
    ? formatDate(consignment.return_due_date)
    : consignment.valid_until
      ? formatDate(consignment.valid_until)
      : '[Conforme acordado com a administração]'
  const observacoes = consignment.notes?.trim() || 'Sem observações'

  const forumCidadeUf =
    company.forum_city && company.forum_state
      ? `${company.forum_city}/${company.forum_state}`
      : company.address_city && company.address_state
        ? `${company.address_city}/${company.address_state}`
        : '[Comarca da empresa não cadastrada]'

  return {
    titulo: 'CONTRATO DE CONSIGNAÇÃO E TERMO DE RECEBIMENTO DE PRODUTOS',
    versao: snapshot.contract_version || '1.0',
    contratante: {
      razaoSocial,
      nomeFantasia: company.trade_name || 'Scaglioni Joias',
      cnpj,
      endereco: enderecoEmpresa,
      email: company.email || '[E-mail não cadastrado]',
      whatsapp: company.phone || '[WhatsApp não cadastrado]',
    },
    consignataria: {
      nome: nomeRevendedora,
      cpf: cpfRevendedora,
      dataNascimento,
      endereco: enderecoRevendedora,
      whatsapp: whatsappRevendedora,
      email: emailRevendedora,
    },
    lista: {
      codigo: codigoLista,
      dataEmissao,
      prazoVenda,
      dataAcerto,
      dataDevolucao,
      observacoes,
      criadorNome: consignment.operator_name || 'Equipe Scaglioni',
      criadorIp: consignment.created_ip || '127.0.0.1',
      status: consignment.status,
    },
    clausulaForo: forumCidadeUf,
    items,
    totals,
    signature,
  }
}
