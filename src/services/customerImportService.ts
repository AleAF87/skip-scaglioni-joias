/**
 * Importador de planilha de clientes (planilha "Clientes 23385" — ERP externo).
 *
 * Responsabilidades (regras decididas pelo usuário):
 *  - Ler .xlsx (via lib xlsx) ou .csv no navegador, normalizar cabeçalhos
 *    tolerantes (acentos, maiúsculas, espaços/underscores) e mapear para os
 *    campos da collection customers;
 *  - Pular linhas com STATUS "EXCLUÍDO" (o status não é gravado — a linha só
 *    é pulada);
 *  - Pular duplicados: mesmo CPF normalizado (só dígitos) dentro do arquivo ou
 *    já existente na base; sem CPF, nome+telefone normalizados iguais;
 *  - EMAIL_COMPRAS grava no email principal (o que o PDV usa na busca);
 *  - Mapeamento reduzido (decisão v0.0.115): RG→rg, CNPJ→cnpj,
 *    CLIENTE_DESDE→customer_since. Colunas de cobrança, contatos de
 *    compras/financeiro, vendedor, site, tipo de pagamento e lembrar
 *    aniversário são IGNORADAS (campos removidos da collection);
 *  - created_by fica vazio: o importador grava import_source='planilha' e o
 *    hook customers_created_by não preenche created_by nesse caso;
 *  - Dados gravados como vierem (CPF/CEP incompletos não são corrigidos).
 */
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { Customer } from '@/types'

export interface CustomerImportRow {
  line: number
  name: string
  data: Record<string, string>
}

export interface ImportSummary {
  imported: number
  skippedDuplicate: number
  skippedExcluded: number
  failed: number
  failedNames: string[]
}

/**
 * Cabeçalhos da planilha → chaves internas (normalizados, sem acentos).
 * Chaves que não correspondem a campo gravado (status, email_compras) são
 * usadas só na lógica de pular/mapear.
 */
const COLUMN_MAP: Record<string, string> = {
  NOME: 'name',
  CPF: 'cpf',
  RG: 'rg',
  CNPJ: 'cnpj',
  DATA_NASCIMENTO_OU_FUNDACAO: 'birth_date',
  ENDERECO: 'address_street',
  NUMERO_ENDERECO: 'address_number',
  COMPLEMENTO_ENDERECO: 'address_complement',
  BAIRRO: 'address_neighborhood',
  CIDADE: 'city',
  UF: 'state',
  CEP: 'address_zip',
  PAIS: 'country',
  FONE_PRINCIPAL: 'phone',
  EMAIL_COMPRAS: 'email_compras',
  CLIENTE_DESDE: 'customer_since',
  OBSERVACOES: 'notes',
  STATUS: 'status',
}

export function normalizeHeaderKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Só dígitos (para CPF/telefone/CEP). */
export function digitsOnly(value: string | undefined): string {
  return (value || '').replace(/\D/g, '')
}

/** Nome normalizado: sem acentos, minúsculo, espaços colapsados. */
export function normalizeName(value: string | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isExcludedStatus(value: string | undefined): boolean {
  const s = normalizeName(value)
  return s.includes('excluido') || s.includes('excluida')
}

/**
 * Datas da planilha vêm em pt-BR (dd/mm/aaaa); PocketBase espera aaaa-mm-dd.
 * Datas incompletas/estranhas viram vazio — nunca inventa dia/mês.
 */
export function parseSheetDate(value: string | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  // Serial numérico do Excel (xlsx sem cellDates): dias desde 1899-12-30
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw)
    const ms = Math.round((serial - 25569) * 86400 * 1000)
    const d = new Date(ms)
    const y = d.getUTCFullYear()
    if (y >= 1900 && y <= 2999) {
      return `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`
    }
    return ''
  }
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    let y = m[3]
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y.padStart(4, '0')}-${mo}-${d}`
    }
    return ''
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return ''
}

/** Lê o arquivo (xlsx/csv) e devolve as linhas já com cabeçalho normalizado. */
export async function parseCustomerSpreadsheet(file: File): Promise<CustomerImportRow[]> {
  const buffer = await file.arrayBuffer()
  // cellDates:false — datas viram serial/pt-BR e passam por parseSheetDate.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  const rows: CustomerImportRow[] = []
  rawRows.forEach((raw, idx) => {
    const mapped: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      const key = COLUMN_MAP[normalizeHeaderKey(String(k))]
      if (key) mapped[key] = v == null ? '' : String(v).trim()
    }
    rows.push({ line: idx + 2, name: (mapped.name || '').trim(), data: mapped })
  })
  return rows
}

/** Monta o payload do PocketBase para uma linha da planilha. */
export function buildCustomerPayload(row: CustomerImportRow): Record<string, unknown> {
  const d = row.data

  // EMAIL_COMPRAS grava no e-mail principal (usado pelo PDV na busca)
  const purchasesEmail = (d.email_compras || '').trim()
  const email = purchasesEmail

  const customerSince = parseSheetDate(d.customer_since)
  const birthDate = parseSheetDate(d.birth_date)

  const payload: Record<string, unknown> = {
    name: row.name,
    import_source: 'planilha',
    created_by: '', // decisão do usuário: importado NÃO tem criador
  }
  const optional: Array<[string, string]> = [
    ['cpf', d.cpf],
    ['rg', d.rg],
    ['cnpj', d.cnpj],
    ['birth_date', birthDate],
    ['phone', d.phone],
    ['email', email],
    ['address_street', d.address_street],
    ['address_number', d.address_number],
    ['address_complement', d.address_complement],
    ['address_neighborhood', d.address_neighborhood],
    ['city', d.city],
    ['state', (d.state || '').toUpperCase()],
    ['address_zip', d.address_zip],
    ['country', d.country],
    ['customer_since', customerSince],
    ['notes', d.notes],
  ]
  for (const [field, value] of optional) {
    if (value) payload[field] = value
  }
  return payload
}

/** Chave de duplicidade: cpf:<digits> ou nome|telefone. */
function duplicateKey(name: string, cpf: string, phone: string): string {
  const cpfDigits = digitsOnly(cpf)
  if (cpfDigits) return `cpf:${cpfDigits}`
  return `name:${normalizeName(name)}|phone:${digitsOnly(phone)}`
}

/**
 * Executa a importação de fato: cria os registros no PocketBase e devolve o
 * resumo. created_by fica vazio (import_source='planilha' + hook ajustado).
 */
export async function importCustomers(
  rows: CustomerImportRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    skippedDuplicate: 0,
    skippedExcluded: 0,
    failed: 0,
    failedNames: [],
  }

  // CPFs já existentes na base (para pular duplicados com a coleção)
  const existing = await pb.collection('customers').getFullList<Customer>({
    fields: 'id,name,cpf,phone',
    // lote grande o suficiente para a base atual de clientes
    batch: 500,
  })
  const seen = new Set<string>()
  for (const c of existing) {
    seen.add(duplicateKey(c.name, c.cpf || '', c.phone || ''))
  }

  const collection = pb.collection('customers')
  let done = 0
  for (const row of rows) {
    done++
    onProgress?.(done, rows.length)

    const d = row.data
    if (!row.name) continue // sem nome não é um cliente válido
    if (isExcludedStatus(d.status)) {
      summary.skippedExcluded++
      continue
    }

    const key = duplicateKey(row.name, d.cpf, d.phone)
    if (seen.has(key)) {
      summary.skippedDuplicate++
      continue
    }
    seen.add(key)

    try {
      await collection.create(buildCustomerPayload(row))
      summary.imported++
    } catch (err) {
      console.error(`Falha ao importar linha ${row.line} (${row.name}):`, err)
      summary.failed++
      summary.failedNames.push(`linha ${row.line} — ${row.name}`)
    }
  }

  return summary
}
