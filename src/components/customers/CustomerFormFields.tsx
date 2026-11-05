import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { User, Phone, Mail, FileText, Calendar, MapPin, Hash, Building2 } from 'lucide-react'

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
}

interface CustomerFormFieldsProps {
  form: CustomerFormState
  onChange: <K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => void
  errors?: Partial<Record<keyof CustomerFormState, string>>
  clearError?: (field: keyof CustomerFormState) => void
}

export function CustomerFormFields({
  form,
  onChange,
  errors = {},
  clearError,
}: CustomerFormFieldsProps) {
  const handleFieldChange = (field: keyof CustomerFormState, value: string) => {
    onChange(field, value)
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

  // Máscara dinâmica simples para Telefone/WhatsApp
  const handlePhoneChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 11)
    let formatted = clean
    if (clean.length > 10) {
      formatted = clean.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3')
    } else if (clean.length > 6) {
      formatted = clean.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3')
    } else if (clean.length > 2) {
      formatted = clean.replace(/(\d{2})(\d{1,5})/, '($1) $2')
    }
    handleFieldChange('phone', formatted)
  }

  // Máscara dinâmica simples para CEP
  const handleZipChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = clean
    if (clean.length > 5) {
      formatted = clean.replace(/(\d{5})(\d{1,3})/, '$1-$2')
    }
    handleFieldChange('address_zip', formatted)
  }

  return (
    <div className="space-y-4">
      {/* Dados Principais */}
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> Identificação e Contato
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="cust-name" className="text-xs font-semibold text-[#2D2A26]">
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
            <Label htmlFor="cust-cpf" className="text-xs font-semibold text-[#2D2A26]">
              CPF (opcional)
            </Label>
            <Input
              id="cust-cpf"
              value={form.cpf}
              onChange={(e) => handleCpfChange(e.target.value)}
              placeholder="000.000.000-00"
              maxLength={14}
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label
              htmlFor="cust-birth"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
              <Calendar className="h-3 w-3 text-[#6B655E]" /> Data de Nascimento
            </Label>
            <Input
              id="cust-birth"
              type="date"
              value={form.birth_date}
              onChange={(e) => handleFieldChange('birth_date', e.target.value)}
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label
              htmlFor="cust-phone"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
              <Phone className="h-3 w-3 text-[#6B655E]" /> Telefone / WhatsApp
            </Label>
            <Input
              id="cust-phone"
              value={form.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="(11) 99999-9999"
              maxLength={15}
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label
              htmlFor="cust-email"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
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
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Endereço
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="cust-zip" className="text-xs font-semibold text-[#2D2A26]">
              CEP
            </Label>
            <Input
              id="cust-zip"
              value={form.address_zip}
              onChange={(e) => handleZipChange(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div className="sm:col-span-3">
            <Label htmlFor="cust-street" className="text-xs font-semibold text-[#2D2A26]">
              Logradouro / Rua
            </Label>
            <Input
              id="cust-street"
              value={form.address_street}
              onChange={(e) => handleFieldChange('address_street', e.target.value)}
              placeholder="Rua, Avenida, Alameda..."
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label
              htmlFor="cust-number"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
              <Hash className="h-3 w-3 text-[#6B655E]" /> Número
            </Label>
            <Input
              id="cust-number"
              value={form.address_number}
              onChange={(e) => handleFieldChange('address_number', e.target.value)}
              placeholder="123"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="cust-complement" className="text-xs font-semibold text-[#2D2A26]">
              Complemento
            </Label>
            <Input
              id="cust-complement"
              value={form.address_complement}
              onChange={(e) => handleFieldChange('address_complement', e.target.value)}
              placeholder="Apto 42, Bloco B"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label htmlFor="cust-neighborhood" className="text-xs font-semibold text-[#2D2A26]">
              Bairro
            </Label>
            <Input
              id="cust-neighborhood"
              value={form.address_neighborhood}
              onChange={(e) => handleFieldChange('address_neighborhood', e.target.value)}
              placeholder="Bairro"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div className="sm:col-span-3">
            <Label
              htmlFor="cust-city"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
              <Building2 className="h-3 w-3 text-[#6B655E]" /> Cidade
            </Label>
            <Input
              id="cust-city"
              value={form.city}
              onChange={(e) => handleFieldChange('city', e.target.value)}
              placeholder="São Paulo"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label htmlFor="cust-state" className="text-xs font-semibold text-[#2D2A26]">
              UF / Estado
            </Label>
            <Input
              id="cust-state"
              value={form.state}
              maxLength={2}
              onChange={(e) => handleFieldChange('state', e.target.value.toUpperCase())}
              placeholder="SP"
              className="mt-1 bg-white border-[#E5DFD5] uppercase"
            />
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
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
