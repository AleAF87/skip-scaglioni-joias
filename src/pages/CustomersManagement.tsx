import React, { useState, useEffect } from 'react'
import { Customer } from '@/types'
import { customerService } from '@/services/customerService'
import { formatDate, formatCpf, formatPhone } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  ShoppingBag,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { CustomerModal } from '@/components/customers/CustomerModal'

export default function CustomersManagement() {
  const { canManageInternal } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Modais de Criação e Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [modalCustomer, setModalCustomer] = useState<Customer | null>(null)
  const [modalInitialTab, setModalInitialTab] = useState<'dados' | 'historico'>('dados')

  // Modal de Exclusão com Confirmação
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [search, page])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const res = await customerService.getCustomers({
        search: search.trim(),
        page,
        perPage: 20,
      })
      setCustomers(res.items)
      setTotalPages(res.totalPages || 1)
      setTotalItems(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao listar clientes:', err)
      toast.error('Erro ao carregar lista de clientes.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setModalCustomer(null)
    setModalInitialTab('dados')
    setModalOpen(true)
  }

  const handleOpenEdit = (c: Customer, tab: 'dados' | 'historico' = 'dados') => {
    setModalCustomer(c)
    setModalInitialTab(tab)
    setModalOpen(true)
  }

  const handleOpenDelete = (c: Customer) => {
    setCustomerToDelete(c)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return
    setIsDeleting(true)
    try {
      await customerService.deleteCustomer(customerToDelete.id)
      toast.success(`Cliente "${customerToDelete.name}" excluído com sucesso!`)
      setDeleteModalOpen(false)
      setCustomerToDelete(null)
      loadCustomers()
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err)
      toast.error(err?.message || 'Falha ao excluir cliente.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#2D2A26] flex items-center gap-2">
            <Users className="h-6 w-6 text-[#C6A664]" />
            Clientes
          </h1>
          <p className="text-xs text-[#6B655E] mt-1">
            Gerencie o cadastro de clientes, dados para contato e consulte o histórico de compras e
            reservas vinculadas pelo ID imutável.
          </p>
        </div>

        {canManageInternal && (
          <Button
            onClick={handleOpenCreate}
            className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        )}
      </div>

      {/* Filtros e Busca */}
      <Card className="border-[#E5DFD5] bg-white">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B655E]" />
              <Input
                placeholder="Buscar por nome, CPF, telefone, e-mail ou cidade..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9 bg-[#FDFBF7] border-[#E5DFD5] text-xs h-9"
              />
            </div>
            {search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
                className="text-xs text-[#6B655E]"
              >
                Limpar busca
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Clientes */}
      <Card className="border-[#E5DFD5] bg-white overflow-hidden">
        <CardHeader className="bg-[#FDFBF7] border-b border-[#E5DFD5] py-3 px-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-[#2D2A26]">
              Lista de Clientes Cadastrados
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Total de {totalItems} cliente{totalItems === 1 ? '' : 's'} encontrado
              {totalItems === 1 ? '' : 's'}
            </CardDescription>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F5F0] text-[#6B655E] border-b border-[#E5DFD5]">
              <tr>
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">CPF</th>
                <th className="py-3 px-4 font-semibold">Telefone / WhatsApp</th>
                <th className="py-3 px-4 font-semibold">E-mail</th>
                <th className="py-3 px-4 font-semibold">Cidade / UF</th>
                <th className="py-3 px-4 font-semibold">Cadastro</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6B655E]">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#C6A664]" />
                    Carregando clientes...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6B655E]">
                    <User className="h-8 w-8 text-[#C6A664] mx-auto mb-2 opacity-40" />
                    <p className="font-medium text-[#2D2A26]">Nenhum cliente encontrado</p>
                    <p className="text-[11px] mt-0.5">
                      {search
                        ? 'Tente ajustar os termos da busca.'
                        : 'Clique em "Novo Cliente" acima para cadastrar.'}
                    </p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FDFBF7]/70 transition-colors">
                    {/* Nome + ID */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#2D2A26]">{c.name}</div>
                      <div className="text-[10px] text-[#6B655E] font-mono mt-0.5">ID: {c.id}</div>
                    </td>

                    {/* CPF */}
                    <td className="py-3 px-4 font-mono text-[#2D2A26]">
                      {c.cpf ? formatCpf(c.cpf) : '—'}
                    </td>

                    {/* Telefone */}
                    <td className="py-3 px-4 text-[#2D2A26]">
                      {c.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-[#C6A664]" />
                          {formatPhone(c.phone)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* E-mail */}
                    <td className="py-3 px-4 text-[#2D2A26]">
                      {c.email ? (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-[#C6A664]" />
                          {c.email}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Cidade / UF */}
                    <td className="py-3 px-4 text-[#2D2A26]">
                      {c.city || c.state ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-[#C6A664]" />
                          {[c.city, c.state].filter(Boolean).join(' - ')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Data de Cadastro */}
                    <td className="py-3 px-4 text-[#6B655E]">{formatDate(c.created)}</td>

                    {/* Ações */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(c, 'historico')}
                          className="h-8 border-[#E5DFD5] text-[#2D2A26] hover:bg-[#FDFBF7] text-xs font-medium"
                          title="Ver histórico de compras"
                        >
                          <ShoppingBag className="h-3.5 w-3.5 mr-1 text-[#C6A664]" />
                          Compras
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(c, 'dados')}
                          className="h-8 border-[#C6A664] text-[#7A5C2E] hover:bg-[#C6A664]/10 text-xs font-medium"
                          title={`Editar dados de ${c.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDelete(c)}
                          className="h-8 text-[#B3261E] hover:bg-[#B3261E]/10 text-xs"
                          title={`Excluir cliente ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="py-3 px-4 border-t border-[#E5DFD5] flex items-center justify-between bg-[#FDFBF7]">
            <span className="text-xs text-[#6B655E]">
              Página {page} de {totalPages} ({totalItems} clientes)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 text-xs border-[#E5DFD5]"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 text-xs border-[#E5DFD5]"
              >
                Próxima <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal de Criar / Editar Cliente com Histórico de Compras */}
      <CustomerModal
        customer={modalCustomer}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={loadCustomers}
        initialTab={modalInitialTab}
      />

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#B3261E]">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="font-serif text-lg">Excluir Cliente</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[#6B655E] pt-2 leading-relaxed">
              Tem certeza de que deseja excluir o cadastro de{' '}
              <strong className="text-[#2D2A26]">{customerToDelete?.name}</strong>?
              <br />
              <br />
              Esta ação removerá o registro cadastral. O histórico de compras antigas não será
              apagado do banco de dados, mas não estará mais associado a um perfil ativo.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeleteModalOpen(false)}
              className="border-[#E5DFD5]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="bg-[#B3261E] hover:bg-[#B3261E]/90 text-white font-semibold text-xs"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Excluindo...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
