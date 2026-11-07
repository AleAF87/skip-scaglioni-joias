import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  UserPlus,
  Eye,
  EyeOff,
  Percent,
  Mail,
  User,
  Phone,
  FileText,
  MapPin,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { resellerService } from '@/services/resellerService'
import { formatPhone, formatCpf, formatCep } from '@/lib/formatters'

interface ResellerDirectCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (newResellerId?: string) => void
}

export function ResellerDirectCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: ResellerDirectCreateModalProps) {
  // Campos obrigatórios
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [commissionRate, setCommissionRate] = useState('40')
  const [showPassword, setShowPassword] = useState(false)

  // Campos opcionais (sanfona/detalhes extras)
  const [showExtraFields, setShowExtraFields] = useState(false)
  const [phone, setPhone] = useState('')
  const [document, setDocument] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [addressComplement, setAddressComplement] = useState('')
  const [addressNeighborhood, setAddressNeighborhood] = useState('')
  const [addressZip, setAddressZip] = useState('')
  const [notes, setNotes] = useState('')

  // Estados de submissão
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setCommissionRate('40')
    setShowPassword(false)
    setShowExtraFields(false)
    setPhone('')
    setDocument('')
    setBirthDate('')
    setCity('')
    setState('')
    setAddressStreet('')
    setAddressNumber('')
    setAddressComplement('')
    setAddressNeighborhood('')
    setAddressZip('')
    setNotes('')
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm()
      onOpenChange(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    // Validações básicas no cliente
    if (!name.trim()) {
      setErrorMsg('Informe o nome completo da revendedora.')
      return
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Informe um e-mail válido para a revendedora.')
      return
    }

    if (!password || password.length < 8) {
      setErrorMsg('A senha deve ter no mínimo 8 caracteres para garantir acesso seguro.')
      return
    }

    const commNum = parseFloat(commissionRate.replace(',', '.'))
    if (isNaN(commNum) || commNum < 0 || commNum > 100) {
      setErrorMsg('Informe uma taxa de comissão válida entre 0 e 100%.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await resellerService.directCreateReseller({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        commission_rate: commNum,
        phone: phone.trim() || undefined,
        document: document.trim() || undefined,
        birth_date: birthDate.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim().toUpperCase() || undefined,
        address_street: addressStreet.trim() || undefined,
        address_number: addressNumber.trim() || undefined,
        address_complement: addressComplement.trim() || undefined,
        address_neighborhood: addressNeighborhood.trim() || undefined,
        address_zip: addressZip.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      setSuccessMsg(`Revendedora "${name.trim()}" cadastrada e ativada com sucesso!`)

      setTimeout(() => {
        setIsSubmitting(false)
        resetForm()
        onOpenChange(false)
        onSuccess(res.reseller_id)
      }, 1000)
    } catch (err: any) {
      console.error('Erro ao cadastrar revendedora diretamente:', err)
      const rawMsg =
        err?.response?.data?.error ||
        err?.data?.error ||
        err?.message ||
        'Não foi possível cadastrar a revendedora.'

      if (rawMsg.includes('email') || rawMsg.includes('Já existe')) {
        setErrorMsg(rawMsg)
      } else {
        setErrorMsg(rawMsg)
      }
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-[#E5DFD5]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <div className="p-2 rounded-lg bg-[#F3EAD8]">
              <UserPlus className="h-5 w-5 text-[#7A5C2E]" />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl font-bold text-[#2D2A26]">
                Cadastrar Revendedora
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E] mt-0.5">
                Cadastro direto para revendedoras já existentes (com contrato assinado). A conta
                nasce ativa e apta a logar imediatamente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMsg && (
            <div className="p-3 bg-[#BE3A34]/10 border border-[#BE3A34]/20 rounded-lg flex items-start gap-2.5 text-xs text-[#BE3A34]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-[#2E7D4F]/10 border border-[#2E7D4F]/20 rounded-lg flex items-start gap-2.5 text-xs text-[#2E7D4F]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* DADOS OBRIGATÓRIOS ESSENCIAIS */}
          <div className="p-3.5 bg-[#FAF7F2] rounded-xl border border-[#E5DFD5] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Dados Obrigatórios (Mínimo Necessário)
              </span>
              <span className="text-[11px] font-medium text-[#2E7D4F] bg-[#2E7D4F]/10 px-2 py-0.5 rounded-full">
                Status: Ativo Imediato
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nome */}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium text-[#2D2A26]">
                  Nome Completo da Revendedora <span className="text-[#BE3A34]">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                  <Input
                    placeholder="Ex: Maria Luiza Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="pl-9 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-[#2D2A26]">
                  E-mail de Login <span className="text-[#BE3A34]">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                  <Input
                    type="email"
                    placeholder="revendedora@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-[#2D2A26]">
                  Senha Inicial (mínimo 8 dígitos) <span className="text-[#BE3A34]">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pr-10 text-xs"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-[#8C8275] hover:text-[#2D2A26]"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Comissão */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-[#2D2A26]">
                  Comissão (%) <span className="text-[#BE3A34]">*</span>
                </Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="40"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    required
                    className="pl-9 text-xs font-semibold text-[#7A5C2E]"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-[10px] text-[#6B655E]">
                  Padrão Scaglioni: 40% (ajustável de acordo com o contrato).
                </p>
              </div>

              {/* Telefone / WhatsApp (recomendado) */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-[#2D2A26]">
                  Telefone / WhatsApp <span className="text-[10px] text-[#8C8275]">(opcional)</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                  <Input
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className="pl-9 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DADOS COMPLEMENTARES (OPCIONAIS) */}
          <div className="border border-[#E5DFD5] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowExtraFields(!showExtraFields)}
              className="w-full p-3 bg-white hover:bg-[#FAF7F2] text-left flex items-center justify-between text-xs font-semibold text-[#2D2A26] transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#7A5C2E]" />
                Dados Complementares (Documento, Endereço e Observações)
                <span className="text-[10px] font-normal text-[#8C8275]">
                  — Opcional, pode ser completado depois
                </span>
              </span>
              {showExtraFields ? (
                <ChevronUp className="h-4 w-4 text-[#8C8275]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#8C8275]" />
              )}
            </button>

            {showExtraFields && (
              <div className="p-3.5 bg-[#FAF7F2] border-t border-[#E5DFD5] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Documento / CPF */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">CPF / CNPJ</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={document}
                      onChange={(e) => setDocument(formatCpf(e.target.value))}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Data de Nascimento */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* CEP */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">CEP</Label>
                    <Input
                      placeholder="00000-000"
                      value={addressZip}
                      onChange={(e) => setAddressZip(formatCep(e.target.value))}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* Rua */}
                  <div className="space-y-1 sm:col-span-3">
                    <Label className="text-xs font-medium text-[#2D2A26]">Logradouro / Rua</Label>
                    <Input
                      placeholder="Rua das Joias"
                      value={addressStreet}
                      onChange={(e) => setAddressStreet(e.target.value)}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Número */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">Número</Label>
                    <Input
                      placeholder="123"
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Bairro */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">Bairro</Label>
                    <Input
                      placeholder="Centro"
                      value={addressNeighborhood}
                      onChange={(e) => setAddressNeighborhood(e.target.value)}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Cidade */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">Cidade</Label>
                    <Input
                      placeholder="São Paulo"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="text-xs"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Estado / UF */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-[#2D2A26]">UF</Label>
                    <Input
                      placeholder="SP"
                      maxLength={2}
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      className="text-xs uppercase"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Complemento */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-[#2D2A26]">Complemento</Label>
                  <Input
                    placeholder="Apto 42, Bloco B"
                    value={addressComplement}
                    onChange={(e) => setAddressComplement(e.target.value)}
                    className="text-xs"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Observações internas */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-[#2D2A26]">
                    Observações Internas / Detalhes do Contrato
                  </Label>
                  <Input
                    placeholder="Ex: Contrato físico nº 124 assinado em 10/11/2026. Região Jardins."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#7A5C2E] hover:bg-[#5C4522] text-white text-xs gap-1.5 shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cadastrando Revendedora...
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" />
                  Concluir Cadastro Direto
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
