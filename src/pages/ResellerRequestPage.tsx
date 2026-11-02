import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resellerService } from '@/services/resellerService'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Sparkles, ArrowLeft, Upload, CheckCircle2, Handshake } from 'lucide-react'
import { toast } from 'sonner'

export default function ResellerRequestPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [document, setDocument] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [password, setPassword] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Create User account with role 'reseller' and status 'pending'
      const userRec = await pb.collection('users').create({
        email: email.trim(),
        password: password,
        passwordConfirm: password,
        name: name.trim(),
        role: 'reseller',
        status: 'pending',
        phone: phone.trim(),
        document: document.trim(),
        birth_date: birthDate.trim(),
        address_street: street.trim(),
        address_number: number.trim(),
        address_complement: complement.trim(),
        address_neighborhood: neighborhood.trim(),
        address_zip: zip.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
      })

      // 2. Create Reseller record with attachments
      const formData = new FormData()
      formData.append('user', userRec.id)
      formData.append('name', name.trim())
      formData.append('email', email.trim())
      formData.append('phone', phone.trim())
      formData.append('document', document.trim())
      formData.append('birth_date', birthDate.trim())
      formData.append('address_street', street.trim())
      formData.append('address_number', number.trim())
      formData.append('address_complement', complement.trim())
      formData.append('address_neighborhood', neighborhood.trim())
      formData.append('address_zip', zip.trim())
      formData.append('city', city.trim())
      formData.append('state', state.trim().toUpperCase())
      formData.append('status', 'pending')
      files.forEach((file) => {
        formData.append('attachments', file)
      })

      await resellerService.createResellerRequest(formData)
      setSuccess(true)
      toast.success('Solicitação enviada com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao enviar solicitação: ' + (err.message || 'Verifique seus dados.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] py-12 px-4 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#7A5C2E] to-[#C6A664] flex items-center justify-center text-white shadow-md">
            <Handshake className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-[#2D2A26]">
            Seja um Revendedor Scaglioni
          </h1>
          <p className="text-xs uppercase tracking-wider text-[#7A5C2E] font-semibold">
            Solicitação de Cadastro para Revendedora Oficial
          </p>
        </div>

        <Card className="border-[#E5DFD5] bg-white shadow-lg rounded-2xl p-6">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-[#2E7D4F] mx-auto" />
              <h2 className="font-serif text-2xl font-bold text-[#2D2A26]">
                Solicitação Recebida com Sucesso!
              </h2>
              <p className="text-sm text-[#6B655E] max-w-md mx-auto">
                Seu cadastro está com status <strong>Pendente</strong> e será analisado pela
                administração da joalheria. Assim que aprovado, você receberá a liberação de acesso
                para acompanhar suas entregas, estoque e vitrine.
              </p>
              <div className="pt-4">
                <Link to="/login">
                  <Button className="bg-[#7A5C2E] text-white">Ir para a Tela de Login</Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">Nome Completo *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Seu nome completo"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">E-mail *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="email@exemplo.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Senha para Acesso Futuro *</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">WhatsApp / Telefone *</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="(11) 98765-4321"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">CPF ou CNPJ *</Label>
                  <Input
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    required
                    placeholder="000.000.000-00"
                    className="mt-1 font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Data de Nascimento *</Label>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Endereço Residencial Completo */}
              <div className="pt-2 border-t border-[#E5DFD5]">
                <h3 className="font-serif font-bold text-sm text-[#2D2A26] mb-3">
                  Endereço Residencial Completo (Para Comprovantes e Entregas)
                </h3>{' '}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold">Rua / Logradouro *</Label>
                    <Input
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      required
                      placeholder="Rua, Avenida, Alameda..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Número *</Label>
                    <Input
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      required
                      placeholder="123"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Complemento</Label>
                    <Input
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto 42, Bloco B"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Bairro *</Label>
                    <Input
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      required
                      placeholder="Bairro"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">CEP *</Label>
                    <Input
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      required
                      placeholder="00000-000"
                      className="mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Cidade *</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Estado (UF) *</Label>
                    <Input
                      value={state}
                      maxLength={2}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      required
                      placeholder="SP"
                      className="mt-1 uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div>
                <Label className="text-xs font-semibold">Anexar Documentos (Opcional)</Label>
                <p className="text-[11px] text-[#6B655E] mb-1.5">
                  Comprovante de residência, foto de documento ou referências comerciais.
                </p>
                <Input
                  type="file"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) setFiles(Array.from(e.target.files))
                  }}
                  className="mt-1"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-95 text-white font-semibold"
                >
                  {loading ? 'Enviando Cadastro...' : 'Enviar Solicitação de Parceria'}
                </Button>
              </div>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="text-xs text-[#7A5C2E] hover:underline inline-flex items-center"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Já possui conta? Entrar
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
