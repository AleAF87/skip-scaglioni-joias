import React, { useState, useEffect } from 'react'
import { resellerService } from '@/services/resellerService'
import { productService } from '@/services/productService'
import { useAuth } from '@/contexts/AuthContext'
import { ConsignmentList, Product, Reseller, ConsignmentItem, AppSettings } from '@/types'
import { formatCurrency, formatDate, formatDateTime, getFileUrl } from '@/lib/formatters'
import { ImageLightbox } from '@/components/ImageLightbox'
import { companySettingsService } from '@/services/companySettingsService'
import { consignmentDocumentService } from '@/services/consignmentDocumentService'
import { ConsignmentContractModal } from '@/components/ConsignmentContractModal'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Handshake,
  Plus,
  CheckCircle,
  XCircle,
  Printer,
  FileCheck2,
  AlertTriangle,
  RotateCcw,
  Boxes,
  ArrowRight,
  Clock,
  Sparkles,
  Package,
  ZoomIn,
  FileSignature,
  ShieldCheck,
  Ban,
} from 'lucide-react'
import { toast } from 'sonner'

export default function ConsignmentsManagement() {
  const { user, isReseller, canManageInternal } = useAuth()

  const [lists, setLists] = useState<ConsignmentList[]>([])
  const [loading, setLoading] = useState(true)
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [companySettings, setCompanySettings] = useState<AppSettings | null>(null)

  // Contract Modal State
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [activeContractList, setActiveContractList] = useState<ConsignmentList | null>(null)

  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [listToCancel, setListToCancel] = useState<ConsignmentList | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // New list modal
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedResellerId, setSelectedResellerId] = useState('')
  const [validUntilDate, setValidUntilDate] = useState('')
  const [financialDueDate, setFinancialDueDate] = useState('')
  const [returnDueDate, setReturnDueDate] = useState('')
  const [listNotes, setListNotes] = useState('')
  const [selectedItemsForConsign, setSelectedItemsForConsign] = useState<
    Array<{
      product_id: string
      code: string
      description: string
      quantity: number
      selling_price: number
      maxQty: number
      type_name?: string
      material_name?: string
      size_name?: string
      photo_url?: string
    }>
  >([])

  // Consignment Closing Modal
  const [closingModalOpen, setClosingModalOpen] = useState(false)
  const [activeClosingList, setActiveClosingList] = useState<ConsignmentList | null>(null)
  const [closingEntries, setClosingEntries] = useState<{
    [productId: string]: { sold: number; returned: number }
  }>({})
  const [closingError, setClosingError] = useState<string | null>(null)

  // Document Print modals (Recibo de Consignação / Relatório de Fechamento)
  const [printDocModalOpen, setPrintDocModalOpen] = useState(false)
  const [docType, setDocType] = useState<'receipt' | 'report'>('receipt')
  const [docList, setDocList] = useState<ConsignmentList | null>(null)

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const handleOpenLightbox = (p: Product, initialIdx: number = 0) => {
    if (!p.photos || p.photos.length === 0) return
    const urls = p.photos.map((ph) => getFileUrl('products', p.id, ph))
    setLightboxPhotos(urls)
    setLightboxTitle(`${p.code} — ${p.description}`)
    setLightboxIndex(initialIdx)
    setLightboxOpen(true)
  }

  useEffect(() => {
    loadConsignments()
    if (canManageInternal) {
      loadDependencies()
    }
  }, [user])

  const loadConsignments = async () => {
    setLoading(true)
    try {
      let resellerIdFilter: string | undefined
      if (isReseller && user) {
        // find reseller record linked to this user
        try {
          const r = await resellerService.getResellerByUserId(user.id)
          resellerIdFilter = r.id
        } catch {
          /* intentionally ignored */
        }
      }

      const data = await resellerService.getConsignmentLists({ resellerId: resellerIdFilter })
      setLists(data)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar listas de consignação.')
    } finally {
      setLoading(false)
    }
  }

  const loadDependencies = async () => {
    try {
      const [resRes, prodRes, settingsRes] = await Promise.all([
        resellerService.getResellers({ status: 'active' }),
        productService.getProducts({ perPage: 100, status: 'available' }),
        companySettingsService.getSettings(),
      ])
      setResellers(resRes)
      setProducts(prodRes.items)
      setCompanySettings(settingsRes)
    } catch (err) {
      console.error(err)
    }
  }

  // Handle Add Item to New Consignment
  const handleAddItemToConsign = (prod: Product) => {
    const existing = selectedItemsForConsign.find((i) => i.product_id === prod.id)
    if (existing) {
      if (existing.quantity >= prod.quantity) {
        toast.warning('Limite de estoque atingido para consignar.')
        return
      }
      setSelectedItemsForConsign((prev) =>
        prev.map((it) => (it.product_id === prod.id ? { ...it, quantity: it.quantity + 1 } : it)),
      )
    } else {
      const photoUrl =
        prod.photos && prod.photos.length > 0
          ? getFileUrl('products', prod.id, prod.photos[0])
          : undefined

      setSelectedItemsForConsign((prev) => [
        ...prev,
        {
          product_id: prod.id,
          code: prod.code,
          description: prod.description,
          quantity: 1,
          selling_price: prod.selling_price,
          maxQty: prod.quantity,
          type_name: prod.expand?.type?.name,
          material_name: prod.expand?.material?.name,
          size_name: prod.expand?.size?.name,
          photo_url: photoUrl,
        },
      ])
    }
  }

  // Create Consignment List
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedResellerId) {
      toast.error('Selecione o revendedor.')
      return
    }
    if (selectedItemsForConsign.length === 0) {
      toast.error('Adicione produtos para consignar.')
      return
    }

    try {
      const createdList = await resellerService.createConsignmentList({
        reseller_id: selectedResellerId,
        items: selectedItemsForConsign,
        valid_until: validUntilDate ? new Date(validUntilDate).toISOString() : undefined,
        financial_due_date: financialDueDate ? new Date(financialDueDate).toISOString() : undefined,
        return_due_date: returnDueDate ? new Date(returnDueDate).toISOString() : undefined,
        notes: listNotes.trim() || undefined,
      })
      toast.success(
        'Lista de consignação gerada com sucesso! Status inicial: Pendente de Assinatura. Os produtos só saem do estoque após a assinatura do contrato.',
      )
      setCreateModalOpen(false)
      setSelectedResellerId('')
      setValidUntilDate('')
      setFinancialDueDate('')
      setReturnDueDate('')
      setListNotes('')
      setSelectedItemsForConsign([])
      await loadConsignments()

      // Abrir imediatamente o contrato para conferência
      setActiveContractList(createdList)
      setContractModalOpen(true)
    } catch (err: any) {
      toast.error('Erro ao criar lista: ' + (err.message || ''))
    }
  }

  // Reseller Accept/Reject list
  const handleResellerDecision = async (listId: string, status: 'accepted' | 'rejected') => {
    const verb = status === 'accepted' ? 'aceitar' : 'recusar'
    if (window.confirm(`Deseja realmente ${verb} esta lista de consignação?`)) {
      try {
        await resellerService.updateConsignmentStatus(listId, status)
        toast.success(`Lista de consignação ${status === 'accepted' ? 'aceita' : 'recusada'}!`)
        loadConsignments()
      } catch (err) {
        toast.error('Erro ao atualizar status.')
      }
    }
  }

  // Open Closing Dialog
  const handleOpenClosing = (list: ConsignmentList) => {
    const rawItems: ConsignmentItem[] = Array.isArray(list.items)
      ? list.items
      : JSON.parse((list.items as any) || '[]')

    const initialEntries: { [id: string]: { sold: number; returned: number } } = {}
    rawItems.forEach((it) => {
      // Default to 0 sold, full returned
      initialEntries[it.product_id] = { sold: 0, returned: it.quantity }
    })

    setActiveClosingList(list)
    setClosingEntries(initialEntries)
    setClosingError(null)
    setClosingModalOpen(true)
  }

  // Confirm Closing with Consistency Rule
  const handleConfirmClosing = async () => {
    if (!activeClosingList) return
    const rawItems: ConsignmentItem[] = Array.isArray(activeClosingList.items)
      ? activeClosingList.items
      : JSON.parse((activeClosingList.items as any) || '[]')

    // Validate consistency: sold + returned === consigned quantity
    for (const it of rawItems) {
      const entry = closingEntries[it.product_id] || { sold: 0, returned: 0 }
      const totalEntered = entry.sold + entry.returned
      if (totalEntered !== it.quantity) {
        setClosingError(
          `Erro no item ${it.code}: vendidos (${entry.sold}) + devolvidos (${entry.returned}) deve ser igual a ${it.quantity}.`,
        )
        return
      }
    }

    try {
      const itemsPayload = rawItems.map((it) => ({
        product_id: it.product_id,
        code: it.code,
        sold: closingEntries[it.product_id]?.sold || 0,
        returned: closingEntries[it.product_id]?.returned || 0,
      }))

      await resellerService.closeConsignmentList({
        consignment_id: activeClosingList.id,
        items_closing: itemsPayload,
      })

      toast.success('Lista de consignação fechada e estoque consolidado com sucesso!')
      setClosingModalOpen(false)
      loadConsignments()
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Falha no fechamento.'
      setClosingError(msg)
    }
  }

  // Open Document Modal
  const handleOpenDoc = (list: ConsignmentList, type: 'receipt' | 'report') => {
    setDocList(list)
    setDocType(type)
    setPrintDocModalOpen(true)
  }

  // Open Electronic Contract Modal
  const handleOpenContractModal = (list: ConsignmentList) => {
    setActiveContractList(list)
    setContractModalOpen(true)
  }

  // Confirm cancel list
  const handleConfirmCancel = async () => {
    if (!listToCancel) return
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.')
      return
    }

    setCancelling(true)
    try {
      await consignmentDocumentService.cancelConsignment({
        consignmentId: listToCancel.id,
        cancellationReason: cancelReason.trim(),
      })
      toast.success(`Lista ${listToCancel.code} cancelada com sucesso! Histórico preservado.`)
      setCancelModalOpen(false)
      setListToCancel(null)
      loadConsignments()
    } catch (err: any) {
      console.error(err)
      toast.error('Falha ao cancelar: ' + (err.message || 'Tente novamente.'))
    } finally {
      setCancelling(false)
    }
  }

  const parseListItems = (list: ConsignmentList): ConsignmentItem[] => {
    if (Array.isArray(list.items)) return list.items
    try {
      return JSON.parse((list.items as any) || '[]')
    } catch {
      return []
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Handshake className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Consignações & Revenda
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Controle de listas consignadas, aceite de revendedores, fechamento consistente e recibos
            imprimíveis.
          </p>
        </div>

        {canManageInternal && (
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nova Lista de Consignação
          </Button>
        )}
      </div>

      {/* Lists Overview Table */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] text-xs uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Revendedor</th>
                <th className="py-3 px-4">Itens</th>
                <th className="py-3 px-4">Validade</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5] text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#6B655E]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent" />
                      <span>Carregando consignações...</span>
                    </div>
                  </td>
                </tr>
              ) : lists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#6B655E]">
                    Nenhuma lista de consignação registrada.
                  </td>
                </tr>
              ) : (
                lists.map((list) => {
                  const items = parseListItems(list)
                  const totalPieces = items.reduce((acc, it) => acc + (it.quantity || 0), 0)
                  const totalValue = items.reduce(
                    (acc, it) => acc + (it.quantity || 0) * (it.selling_price || 0),
                    0,
                  )

                  return (
                    <tr key={list.id} className="hover:bg-[#FDFBF7]">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-[#7A5C2E]">
                        {list.code}
                      </td>

                      <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                        {list.expand?.reseller?.name || 'Revendedor'}
                      </td>

                      <td className="py-3 px-4 text-xs text-[#2D2A26]">
                        <strong>{totalPieces} peças</strong> ({formatCurrency(totalValue)})
                      </td>

                      <td className="py-3 px-4 text-xs text-[#6B655E]">
                        {list.valid_until ? formatDate(list.valid_until) : 'Indeterminado'}
                      </td>

                      <td className="py-3 px-4">
                        {(list.status === 'pending_signature' || list.status === 'pending') && (
                          <Badge
                            variant="outline"
                            className="border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10 text-xs font-semibold"
                          >
                            <Clock className="w-3 h-3 mr-1" /> Pendente de Assinatura
                          </Badge>
                        )}
                        {(list.status === 'open' ||
                          list.status === 'accepted' ||
                          list.status === 'in_progress') && (
                          <Badge
                            variant="outline"
                            className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-xs font-semibold"
                          >
                            <ShieldCheck className="w-3 h-3 mr-1" /> Aberta (Assinada)
                          </Badge>
                        )}
                        {list.status === 'closed' && (
                          <Badge
                            variant="secondary"
                            className="bg-stone-100 text-stone-700 text-xs font-semibold"
                          >
                            Finalizada
                          </Badge>
                        )}
                        {list.status === 'cancelled' && (
                          <Badge
                            variant="destructive"
                            className="bg-[#B3261E] text-white text-xs font-semibold"
                          >
                            <Ban className="w-3 h-3 mr-1" /> Cancelada
                          </Badge>
                        )}
                        {list.status === 'rejected' && (
                          <Badge variant="destructive" className="bg-[#B3261E] text-white text-xs">
                            Recusada
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* BOTÃO PRINCIPAL: CONTRATO ELETRÔNICO OBRIGATÓRIO (PDF + ASSINATURA) */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenContractModal(list)}
                            className="h-8 px-2.5 border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5 font-semibold"
                            title="Contrato de Consignação e Termo de Recebimento de Produtos"
                          >
                            <FileSignature className="h-3.5 w-3.5 text-[#7A5C2E]" />
                            <span>
                              {list.status === 'pending_signature' || list.status === 'pending'
                                ? isReseller
                                  ? 'Assinar Contrato'
                                  : 'Ver Contrato'
                                : 'Contrato PDF'}
                            </span>
                          </Button>

                          {/* Print Recibo de Consignação (Available once accepted/closed) */}
                          {(list.status === 'open' ||
                            list.status === 'accepted' ||
                            list.status === 'closed') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDoc(list, 'receipt')}
                              className="h-8 text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs"
                              title="Recibo Sintético de Consignação"
                            >
                              <Printer className="h-3.5 w-3.5 mr-1" /> Recibo
                            </Button>
                          )}

                          {/* Close List (Admin / Operator only) */}
                          {canManageInternal &&
                            (list.status === 'open' || list.status === 'accepted') && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenClosing(list)}
                                className="h-8 bg-[#7A5C2E] text-white text-xs"
                              >
                                <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Fechar Lista
                              </Button>
                            )}

                          {/* Relatório de Fechamento (once closed) */}
                          {list.status === 'closed' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDoc(list, 'report')}
                              className="h-8 text-[#2E7D4F] hover:bg-[#2E7D4F]/10 text-xs font-semibold"
                            >
                              <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Relatório
                            </Button>
                          )}

                          {/* Cancelar Lista (Admin / Operator) - Mantém histórico e PDF */}
                          {canManageInternal &&
                            list.status !== 'closed' &&
                            list.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setListToCancel(list)
                                  setCancelReason('')
                                  setCancelModalOpen(true)
                                }}
                                className="h-8 text-[#B3261E] hover:bg-[#B3261E]/10 text-xs"
                                title="Cancelar lista mantendo histórico do contrato"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal New Consignment List */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Criar Nova Lista de Consignação
            </DialogTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Selecione o revendedor parceiro e adicione as joias que serão consignadas.
            </CardDescription>
          </DialogHeader>

          <form onSubmit={handleCreateList} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Revendedor Ativo *</Label>
                <select
                  value={selectedResellerId}
                  onChange={(e) => setSelectedResellerId(e.target.value)}
                  required
                  className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm mt-1"
                >
                  <option value="">Selecione o revendedor...</option>
                  {resellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.city || 'Revenda'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Prazo para Venda (Validade)</Label>
                <Input
                  type="date"
                  value={validUntilDate}
                  onChange={(e) => setValidUntilDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Data Limite de Acerto Financeiro</Label>
                <Input
                  type="date"
                  value={financialDueDate}
                  onChange={(e) => setFinancialDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Data Limite para Devolução</Label>
                <Input
                  type="date"
                  value={returnDueDate}
                  onChange={(e) => setReturnDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold">Observações da Lista</Label>
                <Input
                  value={listNotes}
                  onChange={(e) => setListNotes(e.target.value)}
                  placeholder="Observações da lista (ou deixe em branco para 'Sem observações')"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Products Selector com miniatura amplificável e colunas/badges separadas */}
            <div className="space-y-2 pt-2 border-t border-[#E5DFD5]">
              <Label className="text-xs font-semibold text-[#2D2A26]">
                Adicionar Joias do Estoque
              </Label>
              <div className="max-h-56 overflow-y-auto divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl">
                {products.map((p) => {
                  const photo =
                    p.photos && p.photos.length > 0
                      ? getFileUrl('products', p.id, p.photos[0])
                      : null
                  const hasPhoto = Boolean(photo)

                  return (
                    <div
                      key={p.id}
                      className="p-2.5 flex items-center justify-between hover:bg-[#FDFBF7] gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => hasPhoto && handleOpenLightbox(p)}
                          disabled={!hasPhoto}
                          className={`relative group h-10 w-10 rounded-lg bg-neutral-100 border border-[#E5DFD5] shrink-0 overflow-hidden flex items-center justify-center ${
                            hasPhoto ? 'hover:border-[#C6A664] cursor-pointer' : 'cursor-default'
                          }`}
                          title={hasPhoto ? 'Ampliar foto' : 'Sem foto'}
                        >
                          {photo ? (
                            <>
                              <img
                                src={photo}
                                alt={p.description}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                <ZoomIn className="h-3 w-3" />
                              </div>
                            </>
                          ) : (
                            <Package className="h-4 w-4 text-[#C6A664]" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                              {p.code}
                            </span>
                            <span className="text-xs text-[#6B655E]">({p.quantity} disp.)</span>
                          </div>
                          <span className="text-sm font-medium text-[#2D2A26] block whitespace-normal break-words">
                            {p.description}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-[#6B655E] mt-0.5">
                            <span className="px-1 py-0.2 rounded bg-[#E5DFD5]/60 text-[#2D2A26]">
                              {p.expand?.type?.name || 'Joia'}
                            </span>
                            <span className="px-1 py-0.2 rounded bg-[#E5DFD5]/60 text-[#2D2A26]">
                              Tam: {p.expand?.size?.name || 'Único'}
                            </span>
                            <span className="px-1 py-0.2 rounded bg-[#E5DFD5]/60 text-[#2D2A26] capitalize">
                              Perfil: {p.target_audience || 'Unissex'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-[#2E7D4F]">
                          {formatCurrency(p.selling_price)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleAddItemToConsign(p)}
                          className="h-7 bg-[#7A5C2E] text-white"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selected Items for Consignment */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-[#2D2A26]">
                Joias Selecionadas para Consignação ({selectedItemsForConsign.length})
              </Label>
              {selectedItemsForConsign.length === 0 ? (
                <p className="text-xs text-[#6B655E] italic">Nenhuma joia adicionada ainda.</p>
              ) : (
                <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden">
                  {selectedItemsForConsign.map((it) => (
                    <div
                      key={it.product_id}
                      className="p-3 flex items-center justify-between bg-white"
                    >
                      <div>
                        <span className="font-mono text-xs font-bold text-[#7A5C2E] mr-2">
                          {it.code}
                        </span>
                        <span className="text-sm font-semibold whitespace-normal break-words">
                          {it.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Qtd:</Label>
                        <Input
                          type="number"
                          min="1"
                          max={it.maxQty}
                          value={it.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 1
                            setSelectedItemsForConsign((prev) =>
                              prev.map((i) =>
                                i.product_id === it.product_id ? { ...i, quantity: val } : i,
                              ),
                            )
                          }}
                          className="h-8 w-16 text-center font-bold"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setSelectedItemsForConsign((prev) =>
                              prev.filter((i) => i.product_id !== it.product_id),
                            )
                          }
                          className="text-[#B3261E]"
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#2E7D4F] text-white">
                Criar e Enviar para Revendedor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Closing Modal with Consistency Rule */}
      <Dialog open={closingModalOpen} onOpenChange={setClosingModalOpen}>
        <DialogContent className="max-w-2xl bg-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Fechamento de Consignação: {activeClosingList?.code}
            </DialogTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Regra de consistência obrigatória: Para cada item,{' '}
              <strong>Vendidos + Devolvidos = Total Consignado</strong>.
            </CardDescription>
          </DialogHeader>

          {closingError && (
            <div className="p-3 rounded-lg bg-[#B3261E]/10 border border-[#B3261E]/30 text-xs text-[#B3261E] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{closingError}</span>
            </div>
          )}

          {activeClosingList && (
            <div className="space-y-4 py-2">
              <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden">
                {parseListItems(activeClosingList).map((it) => {
                  const entry = closingEntries[it.product_id] || { sold: 0, returned: it.quantity }
                  const sum = entry.sold + entry.returned
                  const isConsistent = sum === it.quantity

                  return (
                    <div key={it.product_id} className="p-3.5 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-[#7A5C2E] mr-2">
                            {it.code}
                          </span>
                          <span className="text-sm font-semibold whitespace-normal break-words">
                            {it.description}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs font-bold">
                          Consignado: {it.quantity} unid.
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-[#FDFBF7] p-2.5 rounded-lg border border-[#E5DFD5]">
                        <div>
                          <Label className="text-xs font-semibold text-[#2E7D4F]">
                            Qtd Vendida
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max={it.quantity}
                            value={entry.sold}
                            onChange={(e) => {
                              const sold = parseInt(e.target.value, 10) || 0
                              const returned = Math.max(0, it.quantity - sold)
                              setClosingEntries((prev) => ({
                                ...prev,
                                [it.product_id]: { sold, returned },
                              }))
                            }}
                            className="h-8 font-bold text-[#2E7D4F]"
                          />
                        </div>

                        <div>
                          <Label className="text-xs font-semibold text-[#6B655E]">
                            Qtd Devolvida (Retorna ao Estoque)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max={it.quantity}
                            value={entry.returned}
                            onChange={(e) => {
                              const returned = parseInt(e.target.value, 10) || 0
                              const sold = Math.max(0, it.quantity - returned)
                              setClosingEntries((prev) => ({
                                ...prev,
                                [it.product_id]: { sold, returned },
                              }))
                            }}
                            className="h-8 font-bold text-[#6B655E]"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span
                          className={
                            isConsistent
                              ? 'text-[#2E7D4F] font-semibold'
                              : 'text-[#B3261E] font-bold'
                          }
                        >
                          Soma: {sum} / {it.quantity}{' '}
                          {isConsistent ? '✓ Correto' : '✗ Inconsistente'}
                        </span>
                        <span className="text-[#6B655E]">
                          Total Venda: {formatCurrency(entry.sold * it.selling_price)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setClosingModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmClosing}
              className="bg-[#2E7D4F] text-white font-semibold"
            >
              Concluir Fechamento e Atualizar Estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable Document Modal (A4 Recibo ou Relatório) */}
      <Dialog open={printDocModalOpen} onOpenChange={setPrintDocModalOpen}>
        <DialogContent className="max-w-3xl bg-white p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="print:hidden">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                {docType === 'receipt'
                  ? 'Recibo de Consignação'
                  : 'Relatório de Fechamento de Consignação'}
              </DialogTitle>
              <Button onClick={() => window.print()} className="bg-[#2D2A26] text-white">
                <Printer className="h-4 w-4 mr-2" /> Imprimir A4
              </Button>
            </div>
          </DialogHeader>

          {docList && (
            <div className="document-print-area p-8 border border-[#2D2A26] rounded-xl bg-white space-y-6 text-sm">
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h1 className="font-serif text-2xl font-bold uppercase tracking-wider text-[#2D2A26]">
                    Scaglioni Joias
                  </h1>
                  <p className="text-xs text-[#6B655E]">Alta Joalheria • Sistema de Consignação</p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold">{docList.code}</span>
                  <p className="text-xs text-[#6B655E]">{formatDateTime(docList.created)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-[#FDFBF7] rounded-lg">
                <div>
                  <p className="text-xs text-[#6B655E]">Revendedor(a):</p>
                  <p className="font-bold text-[#2D2A26]">{docList.expand?.reseller?.name}</p>
                  <p className="text-xs text-[#6B655E]">
                    {docList.expand?.reseller?.phone} • {docList.expand?.reseller?.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#6B655E]">Status da Lista:</p>
                  <p className="font-bold uppercase text-[#7A5C2E]">{docList.status}</p>
                  <p className="text-xs text-[#6B655E]">
                    Validade:{' '}
                    {docList.valid_until ? formatDate(docList.valid_until) : 'Indeterminado'}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#2D2A26] text-xs uppercase font-bold">
                    <th className="py-2">Código</th>
                    <th className="py-2">Descrição</th>
                    <th className="py-2 text-center">Consignado</th>
                    {docType === 'report' && (
                      <>
                        <th className="py-2 text-center">Vendidos</th>
                        <th className="py-2 text-center">Devolvidos</th>
                      </>
                    )}
                    <th className="py-2 text-right">Preço Unit.</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5] text-xs">
                  {parseListItems(docList).map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-mono font-semibold">{it.code}</td>
                      <td className="py-2 whitespace-normal break-words">{it.description}</td>
                      <td className="py-2 text-center font-bold">{it.quantity}</td>
                      {docType === 'report' && (
                        <>
                          <td className="py-2 text-center font-bold text-[#2E7D4F]">
                            {it.sold || 0}
                          </td>
                          <td className="py-2 text-center font-bold text-[#6B655E]">
                            {it.returned || 0}
                          </td>
                        </>
                      )}
                      <td className="py-2 text-right">{formatCurrency(it.selling_price)}</td>
                      <td className="py-2 text-right font-bold">
                        {formatCurrency(
                          docType === 'report'
                            ? (it.sold || 0) * it.selling_price
                            : it.quantity * it.selling_price,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-12 text-center text-xs">
                <div>
                  <div className="border-t border-[#2D2A26] pt-1">
                    Assinatura da Scaglioni Joias
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#2D2A26] pt-1">
                    Assinatura do(a) Revendedor(a)
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONTRATO ELETRÔNICO E TERMO DE RECEBIMENTO */}
      {activeContractList && (
        <ConsignmentContractModal
          isOpen={contractModalOpen}
          onClose={() => {
            setContractModalOpen(false)
            setActiveContractList(null)
          }}
          list={activeContractList}
          reseller={
            resellers.find((r) => r.id === activeContractList.reseller) ||
            activeContractList.expand?.reseller ||
            null
          }
          settings={companySettings}
          canSign={
            isReseller || user?.role === 'admin' || user?.role === 'operator' // revendedora assina; admin/operador pode assinar/demonstrar
          }
          onSignedSuccess={() => {
            loadConsignments()
          }}
        />
      )}

      {/* MODAL DE CANCELAMENTO COM MOTIVO AUDITADO */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-2xl border border-[#E5DFD5] p-6">
          <DialogHeader>
            <DialogTitle className="text-[#B3261E] font-serif flex items-center gap-2">
              <Ban className="h-5 w-5" /> Cancelar Lista de Consignação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-[#6B655E] leading-relaxed">
              O cancelamento da lista <strong>{listToCancel?.code}</strong> manterá o histórico
              completo, o PDF original gerado e registrará o responsável e o motivo. Caso os
              produtos tenham sido liberados, o estoque será restaurado automaticamente.
            </p>
            <div>
              <Label className="text-xs font-semibold text-[#2D2A26]">
                Motivo do Cancelamento *
              </Label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Revendedora solicitou ajuste de mix de peças..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancelling}
            >
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmCancel}
              disabled={!cancelReason.trim() || cancelling}
              className="bg-[#B3261E] text-white hover:bg-[#B3261E]/90"
            >
              {cancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Modal Reutilizável */}
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />
    </div>
  )
}
