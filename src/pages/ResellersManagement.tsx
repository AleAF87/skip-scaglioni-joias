import React, { useState, useEffect } from 'react'
import { resellerService } from '@/services/resellerService'
import { Reseller } from '@/types'
import { formatDate, getFileUrl } from '@/lib/formatters'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Users2,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Eye,
  Mail,
  Phone,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

export default function ResellersManagement() {
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Reject Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Details Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [activeReseller, setActiveReseller] = useState<Reseller | null>(null)

  useEffect(() => {
    loadResellers()
  }, [search, statusFilter])

  const loadResellers = async () => {
    setLoading(true)
    try {
      const data = await resellerService.getResellers({
        search,
        status: statusFilter,
      })
      setResellers(data)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao listar revendedores.')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string, name: string) => {
    if (
      window.confirm(
        `Aprovar o cadastro do revendedor "${name}"? Ele terá acesso imediato à vitrine e consignações.`,
      )
    ) {
      try {
        await resellerService.updateResellerStatus(id, 'active')
        toast.success(`Revendedor "${name}" aprovado com sucesso!`)
        loadResellers()
      } catch (err) {
        toast.error('Erro ao aprovar revendedor.')
      }
    }
  }

  const handleOpenReject = (id: string) => {
    setSelectedResellerId(id)
    setRejectionReason('')
    setRejectModalOpen(true)
  }

  const handleConfirmReject = async () => {
    if (!selectedResellerId) return
    if (!rejectionReason.trim()) {
      toast.error('Informe a justificativa da reprovação.')
      return
    }

    try {
      await resellerService.updateResellerStatus(
        selectedResellerId,
        'rejected',
        rejectionReason.trim(),
      )
      toast.info('Solicitação do revendedor reprovada.')
      setRejectModalOpen(false)
      setSelectedResellerId(null)
      loadResellers()
    } catch (err) {
      toast.error('Erro ao reprovar revendedor.')
    }
  }

  const handleToggleDisabled = async (reseller: Reseller) => {
    const newStatus = reseller.status === 'disabled' ? 'active' : 'disabled'
    const actionLabel = newStatus === 'disabled' ? 'desativar' : 'reativar'

    if (window.confirm(`Deseja realmente ${actionLabel} o acesso de "${reseller.name}"?`)) {
      try {
        await resellerService.updateResellerStatus(reseller.id, newStatus)
        toast.success(`Revendedor ${newStatus === 'disabled' ? 'desativado' : 'reativado'}!`)
        loadResellers()
      } catch (err) {
        toast.error('Falha ao alterar status.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Users2 className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Gestão de Revendedores
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Análise e aprovação de solicitações de revendedores, controle de acesso e documentos
            anexados.
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail ou documento..."
                className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Status</option>
                <option value="pending">Pendentes de Aprovação</option>
                <option value="active">Ativos</option>
                <option value="rejected">Reprovados</option>
                <option value="disabled">Desativados</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resellers Table */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Revendedor</th>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Cidade / UF</th>
                <th className="py-3 px-4">Documento</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Cadastro</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5] text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6B655E]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent" />
                      <span>Carregando revendedores...</span>
                    </div>
                  </td>
                </tr>
              ) : resellers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#6B655E]">
                    Nenhum revendedor encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                resellers.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FDFBF7]">
                    <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                      {r.name}
                      {r.attachments && r.attachments.length > 0 && (
                        <span className="block text-[11px] text-[#7A5C2E] font-normal">
                          {r.attachments.length} anexo(s) disponível(is)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="block text-xs text-[#2D2A26] flex items-center gap-1">
                        <Mail className="h-3 w-3 text-[#6B655E]" /> {r.email}
                      </span>
                      {r.phone && (
                        <span className="block text-xs text-[#6B655E] flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 text-[#6B655E]" /> {r.phone}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-xs text-[#6B655E]">
                      {r.city ? `${r.city} - ${r.state || ''}` : '—'}
                    </td>

                    <td className="py-3 px-4 font-mono text-xs text-[#2D2A26]">
                      {r.document || '—'}
                    </td>

                    <td className="py-3 px-4">
                      {r.status === 'pending' && (
                        <Badge
                          variant="outline"
                          className="border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10 text-xs"
                        >
                          Pendente
                        </Badge>
                      )}
                      {r.status === 'active' && (
                        <Badge
                          variant="outline"
                          className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-xs"
                        >
                          Ativo
                        </Badge>
                      )}
                      {r.status === 'rejected' && (
                        <Badge variant="destructive" className="bg-[#B3261E] text-white text-xs">
                          Reprovado
                        </Badge>
                      )}
                      {r.status === 'disabled' && (
                        <Badge
                          variant="outline"
                          className="border-gray-400 text-gray-600 bg-gray-100 text-xs"
                        >
                          Desativado
                        </Badge>
                      )}
                    </td>

                    <td className="py-3 px-4 text-xs text-[#6B655E]">{formatDate(r.created)}</td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActiveReseller(r)
                            setDetailsModalOpen(true)
                          }}
                          className="h-8 text-[#7A5C2E] hover:bg-[#F3EAD8]"
                          title="Ver detalhes e anexos"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {r.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(r.id, r.name)}
                              className="h-8 bg-[#2E7D4F] hover:bg-[#256640] text-white text-xs"
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenReject(r.id)}
                              className="h-8 border-[#B3261E] text-[#B3261E] hover:bg-[#B3261E]/10 text-xs"
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Reprovar
                            </Button>
                          </>
                        )}

                        {r.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleDisabled(r)}
                            className="h-8 text-[#6B655E] hover:text-[#B3261E] text-xs"
                          >
                            Desativar
                          </Button>
                        )}

                        {r.status === 'disabled' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleDisabled(r)}
                            className="h-8 text-[#2E7D4F] hover:bg-[#2E7D4F]/10 text-xs"
                          >
                            Reativar
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

      {/* Reject Modal with Justification */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#B3261E]">
              Reprovar Solicitação de Revendedor
            </DialogTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Informe o motivo da reprovação. Esta justificativa ficará registrada no cadastro.
            </CardDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs font-semibold">Justificativa da Reprovação *</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Documentação incompleta ou não atendida aos critérios de revenda..."
              rows={3}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReject}
              className="bg-[#B3261E] hover:bg-[#8f1e17] text-white"
            >
              Confirmar Reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details & Attachments Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-xl bg-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Perfil do Revendedor: {activeReseller?.name}
            </DialogTitle>
          </DialogHeader>

          {activeReseller && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5]">
                <div>
                  <span className="text-xs text-[#6B655E] block">E-mail</span>
                  <span className="font-semibold text-[#2D2A26]">{activeReseller.email}</span>
                </div>
                <div>
                  <span className="text-xs text-[#6B655E] block">Telefone</span>
                  <span className="font-semibold text-[#2D2A26]">
                    {activeReseller.phone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#6B655E] block">CPF / CNPJ</span>
                  <span className="font-mono font-semibold text-[#2D2A26]">
                    {activeReseller.document || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#6B655E] block">Localização</span>
                  <span className="font-semibold text-[#2D2A26]">
                    {activeReseller.city ? `${activeReseller.city} - ${activeReseller.state}` : '—'}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-[#E5DFD5] flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#6B655E] block">Comissão da Vendedora</span>
                    <span className="font-bold text-[#7A5C2E]">
                      {activeReseller.commission_rate ?? 40}% sobre vendas no PDV
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-[#C6A664] text-[#7A5C2E]"
                    onClick={async () => {
                      const input = window.prompt(
                        'Defina a porcentagem de comissão desta revendedora (%):',
                        String(activeReseller.commission_rate ?? 40),
                      )
                      if (input !== null) {
                        const parsed = parseFloat(input)
                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                          await resellerService.updateReseller(activeReseller.id, {
                            commission_rate: parsed,
                          })
                          toast.success('Comissão atualizada com sucesso!')
                          setActiveReseller({ ...activeReseller, commission_rate: parsed })
                          loadResellers()
                        } else {
                          toast.error('Informe um valor entre 0 e 100.')
                        }
                      }
                    }}
                  >
                    Alterar Comissão
                  </Button>
                </div>
              </div>

              {activeReseller.rejection_reason && (
                <div className="p-3 bg-[#B3261E]/10 border border-[#B3261E]/30 rounded-xl text-xs text-[#B3261E]">
                  <strong>Motivo da reprovação anterior:</strong> {activeReseller.rejection_reason}
                </div>
              )}

              {/* Attachments Section */}
              <div>
                <Label className="text-xs font-semibold text-[#2D2A26] mb-2 block">
                  Documentos e Anexos ({activeReseller.attachments?.length || 0})
                </Label>

                {!activeReseller.attachments || activeReseller.attachments.length === 0 ? (
                  <p className="text-xs text-[#6B655E] italic">Nenhum anexo enviado.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {activeReseller.attachments.map((fileName, idx) => {
                      const url = getFileUrl('resellers', activeReseller.id, fileName)
                      const isImg = fileName.match(/\.(jpg|jpeg|png|webp)$/i)
                      return (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 rounded-lg border border-[#E5DFD5] bg-[#FDFBF7] hover:bg-[#F3EAD8] flex items-center gap-2 transition-colors text-xs text-[#7A5C2E] font-medium truncate"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[#C6A664]" />
                          <span className="truncate">{fileName}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setDetailsModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
