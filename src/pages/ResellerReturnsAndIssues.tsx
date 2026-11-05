import React, { useState, useEffect } from 'react'
import { RotateCcw, AlertTriangle, CheckCircle2, Boxes, FileText, DollarSign } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { ResellerStockItem, Reseller, ResellerReturn, ResellerIssue } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ResellerReturnsIssuesContentProps {
  reseller: Reseller
  initialTab?: 'return_form' | 'issues_list' | 'history'
}

/**
 * Conteúdo integral da "Devolução, Conferência & Pendências" para UMA revendedora.
 * Reutilizado por:
 *  - Página /revendedora/devolucoes-pendencias (revendedora logada vê os próprios dados)
 *  - Aba "Devolução & Pendências" dentro do perfil da revendedora na página Revendedoras
 * A revendedora em foco vem pela prop — nunca há seletor "Revendedora em Análise" aqui.
 */
export function ResellerReturnsIssuesContent({
  reseller,
  initialTab,
}: ResellerReturnsIssuesContentProps) {
  const { canManageInternal: canManage } = useAuth()

  const [activeTab, setActiveTab] = useState<'return_form' | 'issues_list' | 'history'>(
    initialTab || (canManage ? 'return_form' : 'issues_list'),
  )

  // Reseller stock for return conference
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState(false)

  // Conference state per item: { returned_qty, pending_qty, pending_reason, pending_notes }
  const [conferenceMap, setConferenceMap] = useState<
    Record<
      string,
      {
        returned_qty: number
        pending_qty: number
        pending_reason: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
        pending_notes: string
      }
    >
  >({})
  const [returnNotes, setReturnNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Issues list
  const [issues, setIssues] = useState<ResellerIssue[]>([])
  const [isLoadingIssues, setIsLoadingIssues] = useState(false)

  // Returns history
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Quitting an issue
  const [resolvingIssue, setResolvingIssue] = useState<ResellerIssue | null>(null)
  const [paidNotes, setPaidNotes] = useState('')

  useEffect(() => {
    if (reseller?.id) {
      loadStock(reseller.id)
      loadIssues(reseller.id)
      loadReturnsHistory(reseller.id)
    }
  }, [reseller?.id])

  const loadStock = async (resellerId: string) => {
    setIsLoadingStock(true)
    try {
      const items = await resellerStockService.getResellerStock(resellerId)
      setStockItems(items)
      // Initialize map
      const initialMap: Record<string, any> = {}
      items.forEach((it) => {
        initialMap[it.product] = {
          returned_qty: 0,
          pending_qty: 0,
          pending_reason: 'extraviada',
          pending_notes: '',
        }
      })
      setConferenceMap(initialMap)
    } catch (err) {
      console.error('Erro ao carregar estoque da revendedora:', err)
    } finally {
      setIsLoadingStock(false)
    }
  }

  const loadIssues = async (resellerId: string) => {
    setIsLoadingIssues(true)
    try {
      const list = await resellerStockService.getIssues({
        resellerId: resellerId,
      })
      setIssues(list)
    } catch (err) {
      console.error('Erro ao carregar pendências:', err)
    } finally {
      setIsLoadingIssues(false)
    }
  }

  const loadReturnsHistory = async (resellerId: string) => {
    setIsLoadingHistory(true)
    try {
      const list = await resellerStockService.getReturns({
        resellerId: resellerId,
      })
      setReturnsHistory(list)
    } catch (err) {
      console.error('Erro ao carregar histórico de devoluções:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Update item conference values
  const handleItemChange = (productId: string, field: string, val: any) => {
    setConferenceMap((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {
          returned_qty: 0,
          pending_qty: 0,
          pending_reason: 'extraviada',
          pending_notes: '',
        }),
        [field]: val,
      },
    }))
  }

  // Submit return & issues
  const handleSubmitReturn = async () => {
    if (!reseller?.id) {
      toast.error('Selecione uma revendedora.')
      return
    }

    const itemsToProcess: Array<{
      product_id: string
      returned_qty: number
      pending_qty: number
      pending_reason?: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
      pending_notes?: string
    }> = []

    for (const it of stockItems) {
      const conf = conferenceMap[it.product]
      if (!conf) continue

      const ret = conf.returned_qty || 0
      const pend = conf.pending_qty || 0

      if (ret < 0 || pend < 0) {
        toast.error('Quantidades não podem ser negativas.')
        return
      }

      if (ret + pend > it.quantity) {
        toast.error(
          `A soma devolvida + pendente excede o saldo em poder da vendedora para o item ${it.expand?.product?.code}.`,
        )
        return
      }

      if (ret > 0 || pend > 0) {
        itemsToProcess.push({
          product_id: it.product,
          returned_qty: ret,
          pending_qty: pend,
          pending_reason: pend > 0 ? conf.pending_reason : undefined,
          pending_notes: pend > 0 ? conf.pending_notes : undefined,
        })
      }
    }

    if (itemsToProcess.length === 0) {
      toast.error('Informe pelo menos uma devolução física ou pendência a registrar.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await resellerStockService.processReturn({
        reseller_id: reseller.id,
        items: itemsToProcess,
        notes: returnNotes,
      })

      toast.success(
        `Conferência ${res.code} processada com sucesso! ${res.total_returned_qty} peças voltaram ao estoque geral e ${res.total_pending_qty} pendências foram geradas.`,
      )
      setReturnNotes('')
      await loadStock(reseller.id)
      await loadIssues(reseller.id)
      await loadReturnsHistory(reseller.id)
      setActiveTab('issues_list')
    } catch (err: any) {
      console.error('Erro na devolução:', err)
      toast.error(err.message || 'Falha ao processar devolução.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Settle issue
  const handleResolveIssue = async (status: 'paid' | 'forgiven') => {
    if (!resolvingIssue) return
    try {
      await resellerStockService.resolveIssue({
        issue_id: resolvingIssue.id,
        status,
        paid_notes: paidNotes,
      })
      toast.success(
        status === 'paid'
          ? 'Pendência marcada como quitada!'
          : 'Pendência perdoada/desconsiderada.',
      )
      setResolvingIssue(null)
      setPaidNotes('')
      loadIssues(reseller.id)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao resolver pendência.')
    }
  }

  const pendingIssuesList = issues.filter((i) => i.status === 'pending')
  const totalPendingDue = pendingIssuesList.reduce(
    (acc, i) => acc + (i.scaglioni_due_total || 0),
    0,
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <RotateCcw className="h-5 w-5" />
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
              Devolução, Conferência & Pendências
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Conferência de peças devolvidas pela revendedora, classificação de pendências
            (extraviada, venda avulsa sem PDV ou outros) e controle do valor a pagar à Scaglioni.
          </p>
        </div>

        {/* Total due card badge */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
          <div>
            <span className="text-[10px] text-amber-800 uppercase font-bold tracking-wider block">
              Total Pendente a Pagar:
            </span>
            <strong className="text-base font-bold text-amber-950 font-serif">
              {formatCurrency(totalPendingDue)}
            </strong>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E5DFD5] gap-4">
        {canManage && (
          <button
            onClick={() => setActiveTab('return_form')}
            className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'return_form'
                ? 'border-[#7A5C2E] text-[#7A5C2E]'
                : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            Conferência & Devolução de Peças
          </button>
        )}

        <button
          onClick={() => setActiveTab('issues_list')}
          className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'issues_list'
              ? 'border-[#7A5C2E] text-[#7A5C2E]'
              : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Pendências & Extravios ({pendingIssuesList.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-[#7A5C2E] text-[#7A5C2E]'
              : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
          }`}
        >
          <FileText className="h-4 w-4" />
          Histórico de Devoluções ({returnsHistory.length})
        </button>
      </div>

      {/* TAB 1: FORMULÁRIO DE CONFERÊNCIA & DEVOLUÇÃO (ADMIN / OPERADOR) */}
      {activeTab === 'return_form' && canManage && (
        <div className="space-y-4">
          <Card className="border-[#E5DFD5]">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                <span>Conferência de Joias em Poder de {reseller?.name || 'Revendedora'}</span>
                <span className="text-xs font-normal text-[#6B655E]">
                  Informe as peças devolvidas e as pendentes/extraviadas
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {isLoadingStock ? (
                <div className="py-12 text-center text-xs text-[#8C8275]">
                  Carregando estoque da vendedora...
                </div>
              ) : stockItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8C8275]">
                  <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Nenhuma joia em poder desta revendedora.
                  </p>
                  <p>O saldo em mãos dela é zero.</p>
                </div>
              ) : (
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-3">Código</th>
                          <th className="py-3 px-3">Descrição da Joia</th>
                          <th className="py-3 px-3 text-center">Saldo em Mãos</th>
                          <th className="py-3 px-3 text-center bg-emerald-50 text-emerald-800">
                            Qtd Devolvida (Física)
                          </th>
                          <th className="py-3 px-3 text-center bg-amber-50 text-amber-800">
                            Qtd Faltante / Pendente
                          </th>
                          <th className="py-3 px-3 bg-amber-50 text-amber-800">Motivo Pendência</th>
                          <th className="py-3 px-3 bg-amber-50 text-amber-800">Obs / Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {stockItems.map((it) => {
                          const prod = it.expand?.product
                          const conf = conferenceMap[it.product] || {
                            returned_qty: 0,
                            pending_qty: 0,
                            pending_reason: 'extraviada',
                            pending_notes: '',
                          }

                          return (
                            <tr key={it.id} className="hover:bg-[#FDFBF7]">
                              <td className="py-3 px-3 font-mono font-bold text-[#7A5C2E]">
                                {prod?.code}
                              </td>
                              <td className="py-3 px-3 font-medium text-[#2D2A26] max-w-[200px] truncate">
                                {prod?.description}
                              </td>
                              <td className="py-3 px-3 text-center font-bold">
                                <span className="inline-block px-2 py-0.5 rounded bg-[#E8D5A3]/40 text-[#7A5C2E]">
                                  {it.quantity} un
                                </span>
                              </td>

                              {/* Devolvidas fisicamente */}
                              <td className="py-3 px-3 text-center bg-emerald-50/50">
                                <input
                                  type="number"
                                  min="0"
                                  max={it.quantity}
                                  value={conf.returned_qty || ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleItemChange(
                                      it.product,
                                      'returned_qty',
                                      parseInt(e.target.value, 10) || 0,
                                    )
                                  }
                                  className="w-16 h-8 text-center rounded-md border border-emerald-300 bg-white text-xs font-bold"
                                />
                              </td>

                              {/* Pendente / Extraviada */}
                              <td className="py-3 px-3 text-center bg-amber-50/50">
                                <input
                                  type="number"
                                  min="0"
                                  max={it.quantity - (conf.returned_qty || 0)}
                                  value={conf.pending_qty || ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleItemChange(
                                      it.product,
                                      'pending_qty',
                                      parseInt(e.target.value, 10) || 0,
                                    )
                                  }
                                  className="w-16 h-8 text-center rounded-md border border-amber-300 bg-white text-xs font-bold"
                                />
                              </td>

                              {/* Classificação da pendência */}
                              <td className="py-3 px-3 bg-amber-50/50">
                                <select
                                  disabled={(conf.pending_qty || 0) === 0}
                                  value={conf.pending_reason}
                                  onChange={(e) =>
                                    handleItemChange(it.product, 'pending_reason', e.target.value)
                                  }
                                  className="h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                                >
                                  <option value="extraviada">Extraviada / Perdida</option>
                                  <option value="venda_avulsa_sem_pdv">Venda avulsa sem PDV</option>
                                  <option value="outros">Outros motivos</option>
                                </select>
                              </td>

                              {/* Notas da pendência */}
                              <td className="py-3 px-3 bg-amber-50/50">
                                <input
                                  type="text"
                                  disabled={(conf.pending_qty || 0) === 0}
                                  placeholder="Detalhes..."
                                  value={conf.pending_notes}
                                  onChange={(e) =>
                                    handleItemChange(it.product, 'pending_notes', e.target.value)
                                  }
                                  className="w-full h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* General Return Notes */}
              <div>
                <Label className="text-xs text-[#6B655E]">Observações gerais da devolução:</Label>
                <Input
                  placeholder="Ex: Conferência de fim de mês realizada no balcão da loja..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSubmitReturn}
                  disabled={isSubmitting || stockItems.length === 0}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-10 px-6 shadow-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSubmitting
                    ? 'Processando Conferência...'
                    : 'Confirmar Devolução e Gerar Pendências'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: LISTA DE PENDÊNCIAS & EXTRAVIOS */}
      {activeTab === 'issues_list' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FDFBF7] p-4 rounded-xl border border-[#E5DFD5]">
            <div>
              <h3 className="font-serif font-bold text-sm text-[#2D2A26]">
                Peças Não Devolvidas & Pendências Financeiras
              </h3>
              <p className="text-xs text-[#6B655E]">
                Peças classificadas como extraviadas, vendidas avulso sem PDV ou outros motivos com
                valor devido à Scaglioni.
              </p>
            </div>
          </div>

          {isLoadingIssues ? (
            <div className="py-12 text-center text-xs text-[#8C8275]">Carregando pendências...</div>
          ) : issues.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2 opacity-80" />
              <p className="text-base font-semibold text-[#2D2A26]">Nenhuma pendência ativa!</p>
              <p className="text-xs text-[#6B655E] mt-1">
                Todas as peças em poder da vendedora estão conferidas e sem débitos em aberto.
              </p>
            </Card>
          ) : (
            <div className="border border-[#E5DFD5] rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-3 px-3">Data</th>
                      <th className="py-3 px-3">Revendedora</th>
                      <th className="py-3 px-3">Joia / Código</th>
                      <th className="py-3 px-3 text-center">Qtd</th>
                      <th className="py-3 px-3">Motivo</th>
                      <th className="py-3 px-3 text-right">Valor a Pagar (Scaglioni)</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      {canManage && <th className="py-3 px-3 text-center">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {issues.map((iss) => {
                      const isPending = iss.status === 'pending'
                      const isPaid = iss.status === 'paid'

                      const reasonLabel =
                        iss.reason === 'extraviada'
                          ? 'Extraviada / Perdida'
                          : iss.reason === 'venda_avulsa_sem_pdv'
                            ? 'Venda Avulsa sem PDV'
                            : 'Outros Motivos'

                      return (
                        <tr key={iss.id} className="hover:bg-[#FDFBF7]">
                          <td className="py-3 px-3 text-[#6B655E] whitespace-nowrap">
                            {formatDateTime(iss.created)}
                          </td>
                          <td className="py-3 px-3 font-medium text-[#2D2A26]">
                            {iss.expand?.reseller?.name || 'Revendedora'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-[#7A5C2E] block">
                              {iss.expand?.product?.code}
                            </span>
                            <span className="text-[#2D2A26] block truncate max-w-[180px]">
                              {iss.expand?.product?.description}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold">{iss.quantity} un</td>
                          <td className="py-3 px-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                iss.reason === 'extraviada'
                                  ? 'border-red-300 bg-red-50 text-red-800'
                                  : iss.reason === 'venda_avulsa_sem_pdv'
                                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                                    : 'border-amber-300 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {reasonLabel}
                            </Badge>
                            {iss.notes && (
                              <p className="text-[10px] text-[#8C8275] italic mt-0.5 truncate max-w-[150px]">
                                {iss.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-sm text-[#7A5C2E]">
                            {formatCurrency(iss.scaglioni_due_total)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge
                              variant={isPaid ? 'default' : 'secondary'}
                              className={`text-[10px] ${
                                isPaid
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                  : iss.status === 'forgiven'
                                    ? 'bg-gray-100 text-gray-700'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isPaid
                                ? 'Quitado / Pago'
                                : iss.status === 'forgiven'
                                  ? 'Perdoado'
                                  : 'Pendente de Pagamento'}
                            </Badge>
                            {iss.paid_at && (
                              <p className="text-[9px] text-[#6B655E] mt-0.5">
                                Em: {formatDateTime(iss.paid_at)}
                              </p>
                            )}
                          </td>

                          {canManage && (
                            <td className="py-3 px-3 text-center">
                              {isPending && (
                                <Button
                                  size="sm"
                                  onClick={() => setResolvingIssue(iss)}
                                  className="h-7 px-2 text-[11px] bg-[#7A5C2E] hover:bg-[#634923] text-white"
                                >
                                  Quitar Débito
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTÓRICO DE DEVOLUÇÕES */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {isLoadingHistory ? (
            <div className="py-12 text-center text-xs text-[#8C8275]">Carregando histórico...</div>
          ) : returnsHistory.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center">
              <FileText className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="text-base font-semibold text-[#2D2A26]">
                Nenhuma conferência de devolução registrada ainda.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {returnsHistory.map((ret) => (
                <Card key={ret.id} className="border-[#E5DFD5] bg-white">
                  <CardHeader className="p-4 border-b border-[#E5DFD5]/60 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#7A5C2E] px-2 py-0.5 rounded bg-[#F3EAD8]">
                        {ret.code}
                      </span>
                      <span className="text-[11px] text-[#6B655E]">
                        {formatDateTime(ret.created)}
                      </span>
                    </div>
                    <CardTitle className="font-serif text-sm font-bold text-[#2D2A26] mt-2">
                      {ret.expand?.reseller?.name || 'Revendedora'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#6B655E]">Devolvidas à Loja:</span>
                      <strong className="text-emerald-700 font-bold">
                        {ret.total_returned_qty} peças
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B655E]">Pendências Geradas:</span>
                      <strong className="text-amber-800 font-bold">
                        {ret.total_pending_qty} peças
                      </strong>
                    </div>
                    <div className="flex justify-between border-t border-[#E5DFD5] pt-1.5">
                      <span className="text-[#6B655E]">Valor a Pagar Pendente:</span>
                      <strong className="text-[#7A5C2E] font-bold">
                        {formatCurrency(ret.total_pending_value_due)}
                      </strong>
                    </div>
                    {ret.notes && (
                      <p className="text-[11px] text-[#8C8275] bg-[#FDFBF7] p-2 rounded italic">
                        "{ret.notes}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resolve Issue Modal (Admin / Operator) */}
      {resolvingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[#E5DFD5] p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 text-[#7A5C2E]">
              <DollarSign className="h-5 w-5" />
              <h3 className="font-serif font-bold text-base text-[#2D2A26]">Quitar Pendência</h3>
            </div>

            <div className="p-3 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] space-y-1.5 text-xs">
              <p>
                Revendedora:{' '}
                <strong>{resolvingIssue.expand?.reseller?.name || 'Revendedora'}</strong>
              </p>
              <p>
                Joia:{' '}
                <strong>
                  {resolvingIssue.expand?.product?.code} -{' '}
                  {resolvingIssue.expand?.product?.description}
                </strong>
              </p>
              <p>
                Quantidade: <strong>{resolvingIssue.quantity} un</strong>
              </p>
              <p className="text-sm font-bold text-[#7A5C2E] border-t border-[#E5DFD5] pt-1.5">
                Valor devido à Scaglioni: {formatCurrency(resolvingIssue.scaglioni_due_total)}
              </p>
            </div>

            <div>
              <Label className="text-xs text-[#6B655E]">Anotações do pagamento:</Label>
              <Input
                placeholder="Ex: Recebido em dinheiro no balcão / PIX em 15/10..."
                value={paidNotes}
                onChange={(e) => setPaidNotes(e.target.value)}
                className="text-xs mt-1"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResolvingIssue(null)}
                className="text-xs text-[#6B655E]"
              >
                Cancelar
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResolveIssue('forgiven')}
                  className="text-xs border-[#E5DFD5] text-[#8C8275]"
                >
                  Perdoar
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleResolveIssue('paid')}
                  className="text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white"
                >
                  Confirmar Quitação
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ResellerReturnsAndIssues() {
  const { user, isReseller, canManageInternal } = useAuth()

  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [isLoadingContext, setIsLoadingContext] = useState(true)

  useEffect(() => {
    loadResellerContext()
  }, [user])

  const loadResellerContext = async () => {
    setIsLoadingContext(true)
    try {
      // Revendedora logada: sempre os próprios dados (nunca seletor).
      if (isReseller && user) {
        const r = await resellerService.getResellerByUserId(user.id)
        setCurrentReseller(r)
      }
      // Admin/operador/superadmin: suporte legado à rota /revendedora/devolucoes-pendencias
      // com ?reseller=<id>. O acesso natural agora é pelo card da revendedora na página
      // Revendedoras, que embute o mesmo conteúdo por aba.
      else if (canManageInternal) {
        const params = new URLSearchParams(window.location.search)
        const targetId = params.get('reseller')
        if (targetId) {
          try {
            const r = await pb.collection('resellers').getOne<Reseller>(targetId, {
              expand: 'user',
            })
            setCurrentReseller(r)
          } catch {
            /* revendedora não encontrada */
          }
        }
      }
    } catch (err) {
      console.error('Erro ao identificar revendedora:', err)
    } finally {
      setIsLoadingContext(false)
    }
  }

  if (isLoadingContext) {
    return <div className="py-16 text-center text-xs text-[#8C8275]">Carregando contexto...</div>
  }

  if (!currentReseller) {
    return (
      <div className="py-16 text-center text-xs text-[#8C8275] max-w-md mx-auto space-y-2">
        <p>Nenhuma revendedora em foco.</p>
        <p className="text-[11px]">
          {isReseller
            ? 'Não foi possível localizar o cadastro da sua revendedora. Contate o administrador.'
            : 'Acesse as devoluções pelo card da revendedora na página "Revendedoras".'}
        </p>
      </div>
    )
  }

  return <ResellerReturnsIssuesContent reseller={currentReseller} />
}
