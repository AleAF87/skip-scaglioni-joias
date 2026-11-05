import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { AppUser } from '@/types'
import { formatDate } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { UserCheck, Search, CheckCircle, XCircle, Shield, User, Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { UserEditModal } from '@/components/users/UserEditModal'

export default function UsersManagement() {
  const { user: currentUser, isAdmin } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<AppUser['role']>('operator')

  // Edit user modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)

  useEffect(() => {
    loadUsers()
  }, [search, statusFilter, roleFilter])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const filters: string[] = []
      if (statusFilter) filters.push(`status = '${statusFilter}'`)
      if (roleFilter) filters.push(`role = '${roleFilter}'`)
      if (search) {
        const q = search.replace(/'/g, "\\'")
        filters.push(`(name ~ '${q}' || email ~ '${q}')`)
      }

      const list = await pb.collection('users').getFullList<AppUser>({
        filter: filters.join(' && '),
        sort: '-created',
      })
      setUsers(list)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao listar usuários.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (
    userId: string,
    newStatus: 'active' | 'rejected' | 'disabled',
    name: string,
  ) => {
    try {
      await pb.collection('users').update(userId, { status: newStatus })
      toast.success(`Usuário "${name}" agora está ${newStatus === 'active' ? 'ativo' : newStatus}!`)
      loadUsers()
    } catch (err) {
      toast.error('Erro ao atualizar status.')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await pb.collection('users').create({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        passwordConfirm: newPassword,
        role: newRole,
        status: 'active',
        emailVisibility: true,
      })
      toast.success('Novo usuário criado com status Ativo!')
      setCreateModalOpen(false)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      loadUsers()
    } catch (err: any) {
      toast.error('Falha ao criar usuário: ' + (err.message || ''))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <UserCheck className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Gestão de Usuários
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Controle de acessos, aprovação de cadastros e concessão de papéis no sistema.
          </p>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Novo Usuário
        </Button>
      </div>

      {/* Filter toolbar */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário por nome ou e-mail..."
                className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
              />
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Perfis</option>
                <option value="superadmin">Super Administrador</option>
                <option value="admin">Administrador</option>
                <option value="operator">Operador</option>
                <option value="reseller">Revendedor</option>
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Status</option>
                <option value="pending">Pendente</option>
                <option value="active">Ativo</option>
                <option value="rejected">Reprovado</option>
                <option value="disabled">Desativado</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4">Papel (Role)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Cadastro</th>
                <th className="py-3 px-4 text-right">Ações de Acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5] text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#6B655E]">
                    Carregando usuários...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#6B655E]">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FDFBF7]">
                    <td className="py-3 px-4 font-semibold text-[#2D2A26]">{u.name}</td>
                    <td className="py-3 px-4 text-xs text-[#6B655E]">{u.email}</td>
                    <td className="py-3 px-4">
                      {u.role === 'superadmin' ? (
                        <Badge
                          variant="outline"
                          className="border-red-600/40 text-red-700 bg-red-50 text-xs font-semibold gap-1"
                        >
                          <Shield className="h-3 w-3 text-red-600" />
                          Super Administrador
                        </Badge>
                      ) : u.role === 'admin' ? (
                        <span className="font-semibold text-xs text-[#7A5C2E]">Administrador</span>
                      ) : u.role === 'operator' ? (
                        <span className="font-semibold text-xs text-[#7A5C2E]">Operador</span>
                      ) : (
                        <span className="font-semibold text-xs text-[#6B655E]">Revendedor</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.status === 'pending' && (
                        <Badge
                          variant="outline"
                          className="border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10 text-xs"
                        >
                          Pendente
                        </Badge>
                      )}
                      {u.status === 'active' && (
                        <Badge
                          variant="outline"
                          className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-xs"
                        >
                          Ativo
                        </Badge>
                      )}
                      {u.status === 'rejected' && (
                        <Badge variant="destructive" className="bg-[#B3261E] text-white text-xs">
                          Reprovado
                        </Badge>
                      )}
                      {u.status === 'disabled' && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-700 text-xs">
                          Desativado
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#6B655E]">{formatDate(u.created)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUser(u)
                              setEditModalOpen(true)
                            }}
                            className="h-8 border-[#C6A664] text-[#7A5C2E] hover:bg-[#C6A664]/10 hover:text-[#7A5C2E] text-xs font-medium"
                            title={`Editar dados de ${u.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                          </Button>
                        )}

                        {u.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(u.id, 'active', u.name)}
                              className="h-8 bg-[#2E7D4F] text-white text-xs"
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateStatus(u.id, 'rejected', u.name)}
                              className="h-8 border-[#B3261E] text-[#B3261E] text-xs"
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reprovar
                            </Button>
                          </>
                        )}
                        {u.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateStatus(u.id, 'disabled', u.name)}
                            className="h-8 text-[#B3261E] hover:bg-[#B3261E]/10 text-xs"
                          >
                            Desativar
                          </Button>
                        )}
                        {u.status === 'disabled' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateStatus(u.id, 'active', u.name)}
                            className="h-8 text-[#2E7D4F] hover:bg-[#2E7D4F]/10 text-xs"
                          >
                            Ativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit User Modal */}
      <UserEditModal
        user={editingUser}
        open={editModalOpen}
        onOpenChange={(isOpen) => {
          setEditModalOpen(isOpen)
          if (!isOpen) setEditingUser(null)
        }}
        onSaved={loadUsers}
        currentUserId={currentUser?.id}
      />

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#2D2A26]">
              Cadastrar Novo Usuário
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">E-mail de Acesso *</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Senha Inicial (mín. 8 caracteres) *</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Papel no Sistema *</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AppUser['role'])}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 text-sm mt-1"
              >
                <option value="superadmin">Super Administrador (Acesso Irrestrito)</option>
                <option value="admin">Administrador (Total)</option>
                <option value="operator">Operador (Estoque, Vendas, Dashboard)</option>
                <option value="reseller">Revendedor (Vitrine e Consignação própria)</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#7A5C2E] text-white">
                Criar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
