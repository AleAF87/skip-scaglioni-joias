import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Lock, Mail, CheckCircle2, Shield, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordEye } from '@/components/pos/PasswordEye'

export default function UserProfile() {
  const { user, refreshUser } = useAuth()

  // Profile data
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [document, setDocument] = useState(user?.document || '')
  const [birthDate, setBirthDate] = useState(user?.birth_date || '')
  const [street, setStreet] = useState(user?.address_street || '')
  const [number, setNumber] = useState(user?.address_number || '')
  const [complement, setComplement] = useState(user?.address_complement || '')
  const [neighborhood, setNeighborhood] = useState(user?.address_neighborhood || '')
  const [zip, setZip] = useState(user?.address_zip || '')
  const [city, setCity] = useState(user?.city || '')
  const [state, setState] = useState(user?.state || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Password change
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPass, setIsChangingPass] = useState(false)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSavingProfile(true)
    try {
      await pb.collection('users').update(user.id, {
        name: name.trim(),
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

      // Se for revendedora, sincronizar também com a collection resellers
      try {
        const resellerRec = await pb.collection('resellers').getFirstListItem(`user = '${user.id}'`)
        if (resellerRec) {
          await pb.collection('resellers').update(resellerRec.id, {
            name: name.trim(),
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
        }
      } catch {
        /* intentionally ignored */
      }

      await refreshUser()
      toast.success('Dados cadastrais atualizados!')
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + (err.message || ''))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (newPassword !== confirmPassword) {
      toast.error('A nova senha e a confirmação não coincidem.')
      return
    }

    if (newPassword.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    setIsChangingPass(true)
    try {
      await pb.collection('users').update(user.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      })
      toast.success('Senha alterada com sucesso!')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error('Erro ao alterar senha: ' + (err.message || 'Verifique sua senha atual.'))
    } finally {
      setIsChangingPass(false)
    }
  }

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return

    setIsRequestingEmailChange(true)
    try {
      await pb.collection('users').requestEmailChange(newEmail.trim())
      toast.success(
        `Link de confirmação enviado para ${newEmail}. Acesse seu e-mail para validar a alteração.`,
      )
      setNewEmail('')
    } catch (err: any) {
      toast.error('Erro ao solicitar troca de e-mail: ' + (err.message || ''))
    } finally {
      setIsRequestingEmailChange(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-[#E5DFD5] pb-4">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
          Meu Perfil & Segurança
        </h1>
        <p className="text-sm text-[#6B655E] mt-1">
          Gerencie suas informações de cadastro, credenciais de acesso e segurança da conta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column (User summary card) */}
        <Card className="border-[#E5DFD5] bg-white shadow-xs p-6 flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-[#7A5C2E] via-[#C6A664] to-[#E8D5A3] flex items-center justify-center text-white text-2xl font-serif font-bold shadow-md mb-4">
            {user?.name.charAt(0).toUpperCase()}
          </div>

          <h2 className="font-serif text-lg font-bold text-[#2D2A26]">{user?.name}</h2>
          <p className="text-xs text-[#6B655E] mt-0.5">{user?.email}</p>

          <div className="mt-3 flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={
                user?.role === 'superadmin'
                  ? 'border-red-600/40 text-red-700 bg-red-50 uppercase tracking-wider text-[10px] font-bold'
                  : 'border-[#C6A664] text-[#7A5C2E] bg-[#C6A664]/10 uppercase tracking-wider text-[10px] font-bold'
              }
            >
              {user?.role === 'superadmin'
                ? 'Super Administrador'
                : user?.role === 'admin'
                  ? 'Administrador'
                  : user?.role === 'operator'
                    ? 'Operador'
                    : 'Revendedor'}
            </Badge>

            <Badge
              variant="outline"
              className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-[10px]"
            >
              Ativo
            </Badge>
          </div>

          <div className="w-full mt-6 pt-6 border-t border-[#E5DFD5] text-left text-xs space-y-2 text-[#6B655E]">
            <p className="flex justify-between">
              <span>Membro desde:</span>
              <strong className="text-[#2D2A26]">
                {user?.created ? new Date(user.created).toLocaleDateString('pt-BR') : '—'}
              </strong>
            </p>
            <p className="flex justify-between">
              <span>Localização:</span>
              <strong className="text-[#2D2A26]">
                {user?.city ? `${user.city}/${user.state}` : 'Não informada'}
              </strong>
            </p>
          </div>
        </Card>

        {/* Right Columns (Edit Profile + Security tabs) */}
        <div className="md:col-span-2 space-y-6">
          {/* Edit Profile Info Form */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <User className="h-4 w-4 text-[#7A5C2E]" /> Dados Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold">Nome Completo</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Documento (CPF / CNPJ)</Label>
                    <Input
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                      placeholder="000.000.000-00"
                      className="mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E5DFD5]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] mb-2">
                    Endereço Completo (Para Documentos Contratuais)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-semibold">Rua / Logradouro</Label>
                      <Input
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Rua, Avenida..."
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Número</Label>
                      <Input
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="123"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Complemento</Label>
                      <Input
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        placeholder="Apto, Bloco"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Bairro</Label>
                      <Input
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Bairro"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">CEP</Label>
                      <Input
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        placeholder="00000-000"
                        className="mt-1 font-mono"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Cidade</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Estado (UF)</Label>
                      <Input
                        value={state}
                        maxLength={2}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        className="mt-1 uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-[#7A5C2E] hover:bg-[#634924] text-white font-semibold"
                  >
                    {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#7A5C2E]" /> Troca de Senha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Senha Atual</Label>
                  <PasswordEye
                    value={oldPassword}
                    onChange={setOldPassword}
                    required
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">Nova Senha (mín. 8 caracteres)</Label>
                    <PasswordEye
                      value={newPassword}
                      onChange={setNewPassword}
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Confirmação da Nova Senha</Label>
                    <PasswordEye
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      required
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={isChangingPass}
                    className="bg-[#2E7D4F] text-white"
                  >
                    {isChangingPass ? 'Atualizando...' : 'Atualizar Senha'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Email */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#7A5C2E]" /> Alteração de E-mail de Acesso
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Um link de verificação será enviado para o novo endereço antes da troca ser
                efetivada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRequestEmailChange} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Novo Endereço de E-mail</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="novo.email@exemplo.com"
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isRequestingEmailChange}
                    variant="outline"
                    className="border-[#7A5C2E] text-[#7A5C2E]"
                  >
                    {isRequestingEmailChange ? 'Enviando...' : 'Enviar Link de Confirmação'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
