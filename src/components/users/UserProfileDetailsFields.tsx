import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Phone, Calendar, MapPin, FileText } from 'lucide-react'

interface UserProfileDetailsFieldsProps {
  phone: string
  setPhone: (v: string) => void
  document: string
  setDocument: (v: string) => void
  birthDate: string
  setBirthDate: (v: string) => void
  street: string
  setStreet: (v: string) => void
  number: string
  setNumber: (v: string) => void
  complement: string
  setComplement: (v: string) => void
  neighborhood: string
  setNeighborhood: (v: string) => void
  zip: string
  setZip: (v: string) => void
  city: string
  setCity: (v: string) => void
  state: string
  setState: (v: string) => void
  notes: string
  setNotes: (v: string) => void
}

export function UserProfileDetailsFields({
  phone,
  setPhone,
  document,
  setDocument,
  birthDate,
  setBirthDate,
  street,
  setStreet,
  number,
  setNumber,
  complement,
  setComplement,
  neighborhood,
  setNeighborhood,
  zip,
  setZip,
  city,
  setCity,
  state,
  setState,
  notes,
  setNotes,
}: UserProfileDetailsFieldsProps) {
  return (
    <>
      {/* Contato e Identificação */}
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" /> Contato e Identificação
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="edit-user-phone" className="text-xs font-semibold text-[#2D2A26]">
              Telefone / WhatsApp
            </Label>
            <Input
              id="edit-user-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label htmlFor="edit-user-doc" className="text-xs font-semibold text-[#2D2A26]">
              CPF / Documento
            </Label>
            <Input
              id="edit-user-doc"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="000.000.000-00"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>

          <div>
            <Label
              htmlFor="edit-user-birth"
              className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
            >
              <Calendar className="h-3 w-3 text-[#6B655E]" /> Data de Nascimento
            </Label>
            <Input
              id="edit-user-birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Endereço
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-3">
            <Label htmlFor="edit-user-street" className="text-xs font-semibold text-[#2D2A26]">
              Logradouro / Rua
            </Label>
            <Input
              id="edit-user-street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Rua, Avenida, etc."
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
          <div>
            <Label htmlFor="edit-user-number" className="text-xs font-semibold text-[#2D2A26]">
              Número
            </Label>
            <Input
              id="edit-user-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="123"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="edit-user-complement" className="text-xs font-semibold text-[#2D2A26]">
              Complemento
            </Label>
            <Input
              id="edit-user-complement"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Apto 42, Bloco B"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
          <div>
            <Label
              htmlFor="edit-user-neighborhood"
              className="text-xs font-semibold text-[#2D2A26]"
            >
              Bairro
            </Label>
            <Input
              id="edit-user-neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Bairro"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
          <div>
            <Label htmlFor="edit-user-zip" className="text-xs font-semibold text-[#2D2A26]">
              CEP
            </Label>
            <Input
              id="edit-user-zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="00000-000"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label htmlFor="edit-user-city" className="text-xs font-semibold text-[#2D2A26]">
              Cidade
            </Label>
            <Input
              id="edit-user-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="São Paulo"
              className="mt-1 bg-white border-[#E5DFD5]"
            />
          </div>
          <div>
            <Label htmlFor="edit-user-state" className="text-xs font-semibold text-[#2D2A26]">
              UF / Estado
            </Label>
            <Input
              id="edit-user-state"
              value={state}
              maxLength={2}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="SP"
              className="mt-1 bg-white border-[#E5DFD5] uppercase"
            />
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Observações Administrativas
        </h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anotações internas sobre este usuário..."
          rows={2}
          className="bg-white border-[#E5DFD5] text-xs text-[#2D2A26]"
        />
      </div>
    </>
  )
}
