import React from 'react'
import { UserRole, UserStatus } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Mail, Lock } from 'lucide-react'

interface UserAccessFieldsProps {
  name: string
  setName: (v: string) => void
  email: string
  setEmail: (v: string) => void
  role: UserRole
  setRole: (v: UserRole) => void
  status: UserStatus
  setStatus: (v: UserStatus) => void
  newPassword: string
  setNewPassword: (v: string) => void
  errors: Record<string, string>
  clearError: (field: string) => void
  isEditingSelf?: boolean
}

export function UserAccessFields({
  name,
  setName,
  email,
  setEmail,
  role,
  setRole,
  status,
  setStatus,
  newPassword,
  setNewPassword,
  errors,
  clearError,
  isEditingSelf,
}: UserAccessFieldsProps) {
  return (
    <div className="bg-[#FDFBF7] p-3.5 rounded-lg border border-[#E5DFD5] space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#7A5C2E] flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" /> Acesso e Papel no Sistema
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="edit-user-name" className="text-xs font-semibold text-[#2D2A26]">
            Nome Completo *
          </Label>
          <Input
            id="edit-user-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              clearError('name')
            }}
            className={`mt-1 bg-white ${errors.name ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#E5DFD5]'}`}
            placeholder="Nome do usuário"
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>

        <div>
          <Label htmlFor="edit-user-email" className="text-xs font-semibold text-[#2D2A26]">
            E-mail de Login *
          </Label>
          <Input
            id="edit-user-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              clearError('email')
            }}
            className={`mt-1 bg-white ${errors.email ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#E5DFD5]'}`}
            placeholder="usuario@exemplo.com"
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="edit-user-role" className="text-xs font-semibold text-[#2D2A26]">
            Papel no Sistema (Role) *
          </Label>
          <select
            id="edit-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 text-sm mt-1 text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
          >
            <option value="superadmin">Super Administrador (Acesso Irrestrito)</option>
            <option value="admin">Administrador (Total)</option>
            <option value="operator">Operador (Estoque, Vendas, Dashboard)</option>
            <option value="reseller">Revendedor (Vitrine e Consignação)</option>
          </select>
          {isEditingSelf && (
            <p className="text-[11px] text-[#B26A00] mt-1">
              Atenção: alterar seu próprio papel pode limitar seus privilégios nesta sessão.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="edit-user-status" className="text-xs font-semibold text-[#2D2A26]">
            Status da Conta *
          </Label>
          <select
            id="edit-user-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as UserStatus)}
            className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 text-sm mt-1 text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
          >
            <option value="active">Ativo (Permitido login)</option>
            <option value="pending">Pendente (Aguardando aprovação)</option>
            <option value="disabled">Desativado (Bloqueado)</option>
            <option value="rejected">Reprovado</option>
          </select>
        </div>
      </div>

      <div>
        <Label
          htmlFor="edit-user-password"
          className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1"
        >
          <Lock className="h-3 w-3 text-[#6B655E]" /> Redefinir Senha (opcional)
        </Label>
        <Input
          id="edit-user-password"
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value)
            clearError('newPassword')
          }}
          placeholder="Deixe em branco para manter a senha atual"
          className={`mt-1 bg-white ${errors.newPassword ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#E5DFD5]'}`}
          autoComplete="new-password"
        />
        {errors.newPassword ? (
          <p className="text-xs text-red-600 mt-1">{errors.newPassword}</p>
        ) : (
          <p className="text-[11px] text-[#6B655E] mt-1">
            Preencha apenas se desejar redefinir a senha deste usuário (mínimo de 8 caracteres).
          </p>
        )}
      </div>
    </div>
  )
}
