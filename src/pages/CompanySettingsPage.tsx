import React, { useState, useEffect } from 'react'
import { companySettingsService } from '@/services/companySettingsService'
import { AppSettings } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Building2, Save, AlertTriangle, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CompanySettingsPage() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form states
  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('Scaglioni Joias')
  const [cnpj, setCnpj] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [forumCity, setForumCity] = useState('')
  const [forumState, setForumState] = useState('')
  const [contractVersion, setContractVersion] = useState('1.0')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await companySettingsService.getSettings()
      setSettings(data)
      setLegalName(data.company_legal_name || '')
      setTradeName(data.company_trade_name || 'Scaglioni Joias')
      setCnpj(data.company_cnpj || '')
      setStreet(data.company_address_street || '')
      setNumber(data.company_address_number || '')
      setComplement(data.company_address_complement || '')
      setNeighborhood(data.company_address_neighborhood || '')
      setCity(data.company_address_city || '')
      setState(data.company_address_state || '')
      setZip(data.company_address_zip || '')
      setEmail(data.company_email || '')
      setPhone(data.company_phone || '')
      setForumCity(data.forum_city || data.company_address_city || '')
      setForumState(data.forum_state || data.company_address_state || '')
      setContractVersion(data.contract_version || '1.0')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar dados da empresa.')
    } finally {
      setLoading(false)
    }
  }

  // Identificar campos pendentes que deixam o contrato com placeholders
  const missingFields: string[] = []
  if (!legalName.trim()) missingFields.push('Razão Social')
  if (!cnpj.trim()) missingFields.push('CNPJ')
  if (!street.trim() || !number.trim()) missingFields.push('Endereço Completo (Rua e Número)')
  if (!city.trim() || !state.trim()) missingFields.push('Cidade e UF')
  if (!email.trim()) missingFields.push('E-mail institucional')
  if (!phone.trim()) missingFields.push('Telefone / WhatsApp')
  if (!forumCity.trim() || !forumState.trim()) missingFields.push('Comarca do Foro (Cláusula 12)')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings?.id) {
      toast.error('Registro de configurações não inicializado.')
      return
    }

    setSaving(true)
    try {
      await companySettingsService.updateSettings(settings.id, {
        company_legal_name: legalName.trim(),
        company_trade_name: tradeName.trim() || 'Scaglioni Joias',
        company_cnpj: cnpj.trim(),
        company_address_street: street.trim(),
        company_address_number: number.trim(),
        company_address_complement: complement.trim(),
        company_address_neighborhood: neighborhood.trim(),
        company_address_city: city.trim(),
        company_address_state: state.trim().toUpperCase(),
        company_address_zip: zip.trim(),
        company_email: email.trim(),
        company_phone: phone.trim(),
        forum_city: forumCity.trim() || city.trim(),
        forum_state: (forumState.trim() || state.trim()).toUpperCase(),
        contract_version: contractVersion.trim() || '1.0',
      })
      toast.success('Configurações da empresa salvas com sucesso!')
      loadSettings()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar: ' + (err.message || 'Verifique os dados.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#7A5C2E]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent" />
        <p className="text-sm">Carregando dados da empresa...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Building2 className="h-6 w-6" />
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Configurações da Empresa (Contratante)
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Dados institucionais da Scaglioni Joias que preenchem automaticamente o Contrato de
            Consignação e Termo de Recebimento de Produtos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-md bg-[#F3EAD8] text-[#7A5C2E] font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Acesso Administrador
          </span>
        </div>
      </div>

      {/* Alerta de Contrato Incompleto */}
      {missingFields.length > 0 ? (
        <Alert className="border-amber-300 bg-amber-50/80 text-amber-900 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          <AlertTitle className="font-serif font-bold text-amber-900">
            Atenção: O contrato de consignação será gerado com dados incompletos!
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800 mt-1">
            Os seguintes campos ainda não foram cadastrados e aparecerão entre colchetes no
            documento (ex.: <em>[CNPJ não cadastrado]</em>):
            <strong className="block mt-1 font-semibold">{missingFields.join(', ')}.</strong>
            Preencha os campos abaixo e salve para que os novos contratos reflitam os dados
            jurídicos reais da empresa.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-300 bg-emerald-50/80 text-emerald-900 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          <AlertTitle className="font-serif font-bold text-emerald-900">
            Cadastro Completo da Empresa
          </AlertTitle>
          <AlertDescription className="text-xs text-emerald-800 mt-0.5">
            Todos os dados institucionais obrigatórios estão preenchidos. Os contratos gerados terão
            plena validade jurídica e qualificação contratual completa.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bloco 1: Identificação Jurídica */}
        <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
          <CardHeader className="bg-[#FDFBF7] border-b border-[#E5DFD5] py-4">
            <CardTitle className="text-base font-serif font-bold text-[#2D2A26] flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#7A5C2E]" /> Identificação & Qualificação Jurídica
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Usado no preâmbulo do contrato (CONTRATANTE) e no cabeçalho das páginas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-[#2D2A26]">Razão Social *</Label>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Ex: Scaglioni Comércio de Joias e Acessórios Ltda."
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Nome Fantasia *</Label>
                <Input
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="Scaglioni Joias"
                  className="mt-1 font-semibold text-[#7A5C2E]"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">CNPJ *</Label>
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">E-mail de Contato *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@scaglionijoias.com.br"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">
                  Telefone / WhatsApp *
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bloco 2: Endereço Completo da Sede */}
        <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
          <CardHeader className="bg-[#FDFBF7] border-b border-[#E5DFD5] py-4">
            <CardTitle className="text-base font-serif font-bold text-[#2D2A26] flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#7A5C2E]" /> Endereço Completo da Sede da
              Joalheria
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Endereço formal para correspondência, notificações e identificação contratual.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-[#2D2A26]">Logradouro / Rua *</Label>
                <Input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Ex: Av. Paulista, Alameda das Acácias..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Número *</Label>
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="1234"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Complemento</Label>
                <Input
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Sala 102, Edifício Joias"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Bairro</Label>
                <Input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Bela Vista"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">CEP</Label>
                <Input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="01311-000"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Cidade *</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São Paulo"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Estado (UF) *</Label>
                <Input
                  value={state}
                  maxLength={2}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  placeholder="SP"
                  className="mt-1 uppercase"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bloco 3: Foro Jurídico e Versão */}
        <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
          <CardHeader className="bg-[#FDFBF7] border-b border-[#E5DFD5] py-4">
            <CardTitle className="text-base font-serif font-bold text-[#2D2A26] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#7A5C2E]" /> Cláusula de Foro & Versionamento
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Definição da comarca para a Cláusula 12 (Foro) e controle de versão do modelo
              contratual.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">
                  Cidade da Comarca do Foro *
                </Label>
                <Input
                  value={forumCity}
                  onChange={(e) => setForumCity(e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="mt-1"
                />
                <span className="text-[10px] text-[#6B655E]">Preenche: comarca de [CIDADE/UF]</span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">UF do Foro *</Label>
                <Input
                  value={forumState}
                  maxLength={2}
                  onChange={(e) => setForumState(e.target.value.toUpperCase())}
                  placeholder="SP"
                  className="mt-1 uppercase"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#2D2A26]">Versão do Contrato</Label>
                <Input
                  value={contractVersion}
                  onChange={(e) => setContractVersion(e.target.value)}
                  placeholder="1.0"
                  className="mt-1 font-mono"
                />
                <span className="text-[10px] text-[#6B655E]">
                  Gravada de forma imutável em cada aceite
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-95 text-white font-semibold flex items-center gap-2 px-6"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando Configurações...' : 'Salvar Dados da Empresa'}
          </Button>
        </div>
      </form>
    </div>
  )
}
