import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  User,
  Phone,
  Mail,
  FileText,
  Calendar,
  MapPin,
  Hash,
  Building2,
  CreditCard,
  Globe,
  Receipt,
  ShoppingCart,
  Banknote,
} from 'lucide-react'

export interface CustomerFormState {
  name: string
  cpf: string
  birth_date: string
  phone: string
  email: string
  address_zip: string
  address_street: string
  address_number: string
  address_complement: string
  address_neighborhood: string
  city: string
  state: string
  notes: string
  // Campos novos (importação de planilha / cadastro completo)
  rg: string
  cnpj: string
  remember_birthday: boolean
  seller_name: string
  country: string
  site: string
  payment_type: string
  billing_street: string
  billing_number: string
  billing_complement: string
  billing_neighborhood: string
  billing_city: string
  billing_state: string
  billing_zip: string
  billing_country: string
  contact_purchases_name: string
  contact_purchases_phone: string
  contact_purchases_email: string
  contact_finance_name: string
  contact_finance_phone: string
  contact_finance_email: string
  customer_since: string
  status: string
}

export const CUSTOMER_STATUS_EXCLUDED = 'EXCLUÍDO'
export const CUSTOMER_STATUS_ACTIVE = ''

interface CustomerFormFieldsProps {
  form: CustomerFormState
  onChange: <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => void
  errors?: Partial<Record<keyof CustomerFormState, string>>
  clearError?: (field: keyof CustomerFormState) => void
}

const inputCls = 'mt-1 bg-white border-[#E5DFD5]'
const labelCls = 'text-xs font-semibold text-[#2D2A26]'
const groupCls = 'bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3'
const groupTitleCls =
  'text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5'

export function CustomerFormFields({
  form,
  onChange,
  errors = {},
  clearError,
}: CustomerFormFieldsProps) {
  const handleFieldChange = (field: keyof CustomerFormState, value: string) => {
    onChange(field, value as never)
    if (clearError) clearError(field)
  }

  // Máscara dinâmica simples para CPF
  const handleCpfChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 11)
    let formatted = clean
    if (clean.length > 9) {
      formatted = clean.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
    } else if (clean.length > 6) {
      formatted = clean.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
    } else if (clean.length > 3) {
      formatted = clean.replace(/(\d{3})(\d{1,3})/, '$1.$2')
    }
    handleFieldChange('cpf', formatted)
  }

  // Máscara dinâmica simples para CNPJ (aceita incompleto)
  const handleCnpjChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 14)
    let formatted = clean
    if (clean.length > 12) {
      formatted = clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5')
    } else if (clean.length > 8) {
      formatted = clean.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4')
    } else if (clean.length > 5) {
      formatted = clean.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3')
    } else if (clean.length > 2) {
      formatted = clean.replace(/(\d{2})(\d{1,3})/, '$1.$2')
    }
    handleFieldChange('cnpj', formatted)
  }

  // Máscara dinâmica simples para Telefone/WhatsApp
  const handlePhoneChange = (field: keyof CustomerFormState, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 11)
    let formatted = clean
    if (clean.length > 10) {
      formatted = clean.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3')
    } else if (clean.length > 6) {
      formatted = clean.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3')
    } else if (clean.length > 2) {
      formatted = clean.replace(/(\d{2})(\d{1,5})/, '($1) $2')
    }
    handleFieldChange(field, formatted)
  }

  // Máscara dinâmica simples para CEP
  const handleZipChange = (field: keyof CustomerFormState, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = clean
    if (clean.length > 5) {
      formatted = clean.replace(/(\d{5})(\d{1,3})/, '$1-$2')
    }
    handleFieldChange(field, formatted)
  }

  return (
    <div className="space-y-4">
      {/* Dados Principais */}
      <div className={groupCls}>
        <h3 className={groupTitleCls}>
          <User className="h-3.5 w-3.5" /> Identificação e Contato
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="cust-name" className={labelCls}>
              Nome Completo *
            </Label>
            <Input
              id="cust-name"
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Ex: Patrícia Albuquerque"
              className={`mt-1 bg-white ${errors.name ? 'border-red-500' : 'border-[#E5DFD5]'}`}
            />
            {errors.name && <p className="text-[11px] text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="cust-cpf" className={labelCls}>
              CPF (opcional)
            </Label>
            <Input
              id="cust-cpf"
              value={form.cpf}
              onChange={(e) => handleCpfChange(e.target.value)}
              placeholder="000.000.000-00"
              maxLength={14}
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-rg" className={labelCls}>
              RG (opcional)
            </Label>
            <Input
              id="cust-rg"
              value={form.rg}
              onChange={(e) => handleFieldChange('rg', e.target.value)}
              placeholder="Documento de identidade"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-cnpj" className={labelCls}>
              CNPJ (opcional)
            </Label>
            <Input
              id="cust-cnpj"
              value={form.cnpj}
              onChange={(e) => handleCnpjChange(e.target.value)}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-birth" className={`${labelCls} flex items-center gap-1`}>
              <Calendar className="h-3 w-3 text-[#6B655E]" /> Data de Nascimento
            </Label>
            <Input
              id="cust-birth"
              type="date"
              value={form.birth_date}
              onChange={(e) => handleFieldChange('birth_date', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-phone" className={`${labelCls} flex items-center gap-1`}>
              <Phone className="h-3 w-3 text-[#6B655E]" /> Telefone / WhatsApp
            </Label>
            <Input
              id="cust-phone"
              value={form.phone}
              onChange={(e) => handlePhoneChange('phone', e.target.value)}
              placeholder="(11) 99999-9999"
              maxLength={15}
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-email" className={`${labelCls} flex items-center gap-1`}>
              <Mail className="h-3 w-3 text-[#6B655E]" /> E-mail
            </Label>
            <Input
              id="cust-email"
              type="email"
              value={form.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              placeholder="cliente@exemplo.com"
              className={`mt-1 bg-white ${errors.email ? 'border-red-500' : 'border-[#E5DFD5]'}`}
            />
            {errors.email && <p className="text-[11px] text-red-600 mt-1">{errors.email}</p>}
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div className={groupCls}>
        <h3 className={groupTitleCls}>
          <MapPin className="h-3.5 w-3.5" /> Endereço
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="cust-zip" className={labelCls}>
              CEP
            </Label>
            <Input
              id="cust-zip"
              value={form.address_zip}
              onChange={(e) => handleZipChange('address_zip', e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-3">
            <Label htmlFor="cust-street" className={labelCls}>
              Logradouro / Rua
            </Label>
            <Input
              id="cust-street"
              value={form.address_street}
              onChange={(e) => handleFieldChange('address_street', e.target.value)}
              placeholder="Rua, Avenida, Alameda..."
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-number" className={`${labelCls} flex items-center gap-1`}>
              <Hash className="h-3 w-3 text-[#6B655E]" /> Número
            </Label>
            <Input
              id="cust-number"
              value={form.address_number}
              onChange={(e) => handleFieldChange('address_number', e.target.value)}
              placeholder="123"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="cust-complement" className={labelCls}>
              Complemento
            </Label>
            <Input
              id="cust-complement"
              value={form.address_complement}
              onChange={(e) => handleFieldChange('address_complement', e.target.value)}
              placeholder="Apto 42, Bloco B"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-neighborhood" className={labelCls}>
              Bairro
            </Label>
            <Input
              id="cust-neighborhood"
              value={form.address_neighborhood}
              onChange={(e) => handleFieldChange('address_neighborhood', e.target.value)}
              placeholder="Bairro"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="cust-city" className={`${labelCls} flex items-center gap-1`}>
              <Building2 className="h-3 w-3 text-[#6B655E]" /> Cidade
            </Label>
            <Input
              id="cust-city"
              value={form.city}
              onChange={(e) => handleFieldChange('city', e.target.value)}
              placeholder="São Paulo"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-state" className={labelCls}>
              UF / Estado
            </Label>
            <Input
              id="cust-state"
              value={form.state}
              maxLength={2}
              onChange={(e) => handleFieldChange('state', e.target.value.toUpperCase())}
              placeholder="SP"
              className={`${inputCls} uppercase`}
            />
          </div>

          <div>
            <Label htmlFor="cust-country" className={labelCls}>
              País
            </Label>
            <Input
              id="cust-country"
              value={form.country}
              onChange={(e) => handleFieldChange('country', e.target.value)}
              placeholder="Brasil"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Endereço de Cobrança */}
      <div className={groupCls}>
        <h3 className={groupTitleCls}>
          <Receipt className="h-3.5 w-3.5" /> Endereço de Cobrança
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="cust-billing-zip" className={labelCls}>
              CEP
            </Label>
            <Input
              id="cust-billing-zip"
              value={form.billing_zip}
              onChange={(e) => handleZipChange('billing_zip', e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-3">
            <Label htmlFor="cust-billing-street" className={labelCls}>
              Logradouro / Rua
            </Label>
            <Input
              id="cust-billing-street"
              value={form.billing_street}
              onChange={(e) => handleFieldChange('billing_street', e.target.value)}
              placeholder="Rua, Avenida, Alameda..."
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-billing-number" className={labelCls}>
              Número
            </Label>
            <Input
              id="cust-billing-number"
              value={form.billing_number}
              onChange={(e) => handleFieldChange('billing_number', e.target.value)}
              placeholder="123"
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="cust-billing-complement" className={labelCls}>
              Complemento
            </Label>
            <Input
              id="cust-billing-complement"
              value={form.billing_complement}
              onChange={(e) => handleFieldChange('billing_complement', e.target.value)}
              placeholder="Apto 42, Bloco B"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-billing-neighborhood" className={labelCls}>
              Bairro
            </Label>
            <Input
              id="cust-billing-neighborhood"
              value={form.billing_neighborhood}
              onChange={(e) => handleFieldChange('billing_neighborhood', e.target.value)}
              placeholder="Bairro"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-billing-city" className={labelCls}>
              Cidade
            </Label>
            <Input
              id="cust-billing-city"
              value={form.billing_city}
              onChange={(e) => handleFieldChange('billing_city', e.target.value)}
              placeholder="São Paulo"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-billing-state" className={labelCls}>
              UF
            </Label>
            <Input
              id="cust-billing-state"
              value={form.billing_state}
              maxLength={2}
              onChange={(e) => handleFieldChange('billing_state', e.target.value.toUpperCase())}
              placeholder="SP"
              className={`${inputCls} uppercase`}
            />
          </div>

          <div>
            <Label htmlFor="cust-billing-country" className={labelCls}>
              País
            </Label>
            <Input
              id="cust-billing-country"
              value={form.billing_country}
              onChange={(e) => handleFieldChange('billing_country', e.target.value)}
              placeholder="Brasil"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Contatos: Compras e Financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={groupCls}>
          <h3 className={groupTitleCls}>
            <ShoppingCart className="h-3.5 w-3.5" /> Contato de Compras
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cust-purchases-name" className={labelCls}>
                Nome
              </Label>
              <Input
                id="cust-purchases-name"
                value={form.contact_purchases_name}
                onChange={(e) => handleFieldChange('contact_purchases_name', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <Label htmlFor="cust-purchases-phone" className={labelCls}>
                Telefone
              </Label>
              <Input
                id="cust-purchases-phone"
                value={form.contact_purchases_phone}
                onChange={(e) => handlePhoneChange('contact_purchases_phone', e.target.value)}
                maxLength={15}
                className={inputCls}
              />
            </div>
            <div>
              <Label htmlFor="cust-purchases-email" className={labelCls}>
                E-mail
              </Label>
              <Input
                id="cust-purchases-email"
                type="email"
                value={form.contact_purchases_email}
                onChange={(e) => handleFieldChange('contact_purchases_email', e.target.value)}
                className={inputCls}
              />
              <p className="text-[10px] text-[#6B655E] mt-1">
                Se preenchido, grava também no e-mail principal (usado na busca do PDV).
              </p>
            </div>
          </div>
        </div>

        <div className={groupCls}>
          <h3 className={groupTitleCls}>
            <Banknote className="h-3.5 w-3.5" /> Contato Financeiro
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cust-finance-name" className={labelCls}>
                Nome
              </Label>
              <Input
                id="cust-finance-name"
                value={form.contact_finance_name}
                onChange={(e) => handleFieldChange('contact_finance_name', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <Label htmlFor="cust-finance-phone" className={labelCls}>
                Telefone
              </Label>
              <Input
                id="cust-finance-phone"
                value={form.contact_finance_phone}
                onChange={(e) => handlePhoneChange('contact_finance_phone', e.target.value)}
                maxLength={15}
                className={inputCls}
              />
            </div>
            <div>
              <Label htmlFor="cust-finance-email" className={labelCls}>
                E-mail
              </Label>
              <Input
                id="cust-finance-email"
                type="email"
                value={form.contact_finance_email}
                onChange={(e) => handleFieldChange('contact_finance_email', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dados Comerciais */}
      <div className={groupCls}>
        <h3 className={groupTitleCls}>
          <Globe className="h-3.5 w-3.5" /> Dados Comerciais
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cust-seller" className={labelCls}>
              Vendedor
            </Label>
            <Input
              id="cust-seller"
              value={form.seller_name}
              onChange={(e) => handleFieldChange('seller_name', e.target.value)}
              placeholder="Ex: Rosemary Scaglioni"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-site" className={labelCls}>
              Site
            </Label>
            <Input
              id="cust-site"
              value={form.site}
              onChange={(e) => handleFieldChange('site', e.target.value)}
              placeholder="www.exemplo.com.br"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-payment-type" className={`${labelCls} flex items-center gap-1`}>
              <CreditCard className="h-3 w-3 text-[#6B655E]" /> Tipo de Pagamento
            </Label>
            <Input
              id="cust-payment-type"
              value={form.payment_type}
              onChange={(e) => handleFieldChange('payment_type', e.target.value)}
              placeholder="Ex: Boleto, Cartão, PIX"
              className={inputCls}
            />
          </div>

          <div>
            <Label htmlFor="cust-since" className={labelCls}>
              Cliente Desde
            </Label>
            <Input
              id="cust-since"
              type="date"
              value={form.customer_since}
              onChange={(e) => handleFieldChange('customer_since', e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 mt-1">
              <Checkbox
                id="cust-remember-birthday"
                checked={form.remember_birthday}
                onCheckedChange={(checked) => onChange('remember_birthday', checked === true)}
              />
              <Label htmlFor="cust-remember-birthday" className="text-xs text-[#2D2A26]">
                Lembrar aniversário
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={groupCls}>
        <h3 className={groupTitleCls}>
          <FileText className="h-3.5 w-3.5" /> Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cust-status" className={labelCls}>
              Situação
            </Label>
            <select
              id="cust-status"
              value={form.status}
              onChange={(e) => handleFieldChange('status', e.target.value)}
              className="mt-1 h-9 w-full bg-white border border-[#E5DFD5] rounded-md px-2 text-xs text-[#2D2A26] focus:outline-none focus:ring-1 focus:ring-[#C6A664]"
            >
              <option value="">Ativo</option>
              <option value="EXCLUÍDO">Excluído</option>
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-[11px] text-[#6B655E]">
              Clientes “Excluído” continuam no cadastro (com histórico), mas aparecem marcados na
              listagem.
            </p>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className={`${groupCls} space-y-2`}>
        <h3 className={groupTitleCls}>
          <FileText className="h-3.5 w-3.5" /> Observações
        </h3>
        <Textarea
          value={form.notes}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          placeholder="Preferências, anotações de presentes, medidas de aro ou informações adicionais..."
          rows={3}
          className="bg-white border-[#E5DFD5] text-xs text-[#2D2A26]"
        />
      </div>
    </div>
  )
}
