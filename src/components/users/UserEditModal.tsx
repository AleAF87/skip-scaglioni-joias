import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { AppUser, UserRole, UserStatus } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { UserAccessFields } from './UserAccessFields'
import { UserProfileDetailsFields } from './UserProfileDetailsFields'

interface UserEditModalProps {
  user: AppUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  currentUserId?: string
  isSuperAdmin?: boolean
}

export function UserEditModal({
  user,
  open,
  onOpenChange,
  onSaved,
  currentUserId,
  isSuperAdmin = false,
}: UserEditModalProps) {
  const [loading, setLoading] = useState(false)

  // Form states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('operator')
  const [status, setStatus] = useState<UserStatus>('active')
  const [phone, setPhone] = useState('')
  const [document, setDocument] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [zip, setZip] = useState('')
  const [notes, setNotes] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (user && open) {
      setName(user.name || '')
      setEmail(user.email || '')
      setRole(user.role || 'operator')
      setStatus(user.status || 'active')
      setPhone(user.phone || '')
      setDocument(user.document || '')
      setBirthDate(user.birth_date || '')
      setCity(user.city || '')
      setState(user.state || '')
      setStreet(user.address_street || '')
      setNumber(user.address_number || '')
      setComplement(user.address_complement || '')
      setNeighborhood(user.address_neighborhood || '')
      setZip(user.address_zip || '')
      setNotes(user.notes || '')
      setNewPassword('')
      setErrors({})
    }
  }, [user, open])

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (user?.role === 'superadmin' && !isSuperAdmin) {
      errs.role = 'Apenas Super Administradores podem editar usuários Superadmin.'
      toast.error('Apenas Super Administradores podem editar usuários Superadmin.')
      return false
    }

    if (role === 'superadmin' && !isSuperAdmin) {
      errs.role = 'Apenas Super Administradores podem conceder o papel de Super Administrador.'
      toast.error('Apenas Super Administradores podem conceder o papel de Super Administrador.')
      return false
    }

    if (!name.trim()) {
      errs.name = 'Nome completo é obrigatório.'
    }
    if (!email.trim()) {
      errs.email = 'E-mail é obrigatório.'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        errs.email = 'Informe um endereço de e-mail válido.'
      }
    }
    if (newPassword && newPassword.length < 8) {
      errs.newPassword = 'A nova senha deve ter no mínimo 8 caracteres.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!validate()) {
      toast.error('Corrija os erros destacados no formulário.')
      return
    }

    setLoading(true)
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        email: email.trim(),
        role,
        status,
        phone: phone.trim(),
        document: document.trim(),
        birth_date: birthDate.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        address_street: street.trim(),
        address_number: number.trim(),
        address_complement: complement.trim(),
        address_neighborhood: neighborhood.trim(),
        address_zip: zip.trim(),
        notes: notes.trim(),
      }

      if (newPassword.trim()) {
        payload.password = newPassword.trim()
        payload.passwordConfirm = newPassword.trim()
      }

      await pb.collection('users').update(user.id, payload)

      // Se for perfil de revendedor, sincroniza dados cadastrais na collection 'resellers' caso exista
      try {
        const resellerRec = await pb.collection('resellers').getFirstListItem(`user = '${user.id}'`)
        if (resellerRec) {
          await pb.collection('resellers').update(resellerRec.id, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            document: document.trim(),
            birth_date: birthDate.trim(),
            city: city.trim(),
            state: state.trim().toUpperCase(),
            address_street: street.trim(),
            address_number: number.trim(),
            address_complement: complement.trim(),
            address_neighborhood: neighborhood.trim(),
            address_zip: zip.trim(),
            status,
          })
        }
      } catch {
        // Se não tiver registro correspondente na resellers, prossegue normalmente
      }

      toast.success(`Usuário "${name.trim()}" atualizado com sucesso!`)
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      console.error('Erro ao atualizar usuário:', err)
      const dataErrors = err?.response?.data || {}
      if (dataErrors.email) {
        setErrors((prev) => ({
          ...prev,
          email: dataErrors.email.message || 'E-mail já está em uso ou inválido.',
        }))
      }
      toast.error(err?.message || 'Falha ao atualizar dados do usuário.')
    } finally {
      setLoading(false)
    }
  }

  const isEditingSelf = Boolean(user && currentUserId && user.id === currentUserId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <UserCog className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                Editar Usuário
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E] mt-0.5">
                Atualize as credenciais, papéis de acesso e dados cadastrais de{' '}
                {user?.name || 'usuário'}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <UserAccessFields
            name={name}
            setName={setName}
            email={email}
            setEmail={setEmail}
            role={role}
            setRole={setRole}
            status={status}
            setStatus={setStatus}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            errors={errors}
            clearError={clearError}
            isEditingSelf={isEditingSelf}
            canAssignSuperadmin={isSuperAdmin}
          />

          <UserProfileDetailsFields
            phone={phone}
            setPhone={setPhone}
            document={document}
            setDocument={setDocument}
            birthDate={birthDate}
            setBirthDate={setBirthDate}
            street={street}
            setStreet={setStreet}
            number={number}
            setNumber={setNumber}
            complement={complement}
            setComplement={setComplement}
            neighborhood={neighborhood}
            setNeighborhood={setNeighborhood}
            zip={zip}
            setZip={setZip}
            city={city}
            setCity={setCity}
            state={state}
            setState={setState}
            notes={notes}
            setNotes={setNotes}
          />

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="border-[#E5DFD5]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
