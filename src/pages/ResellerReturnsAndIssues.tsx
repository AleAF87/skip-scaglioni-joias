import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  FileText,
  DollarSign,
  Printer,
  Search,
  Filter,
  Calendar,
  X,
  TrendingDown,
  Clock,
  Sparkles,
  RefreshCw,
  ScanLine,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { ResellerStockItem, Reseller, ResellerReturn, ResellerIssue } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { SettlementReceiptModal } from '@/components/SettlementReceiptModal'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
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

  // Leitor de código de barras por câmera (mesmo componente do PDV, compatível com iOS/Safari)
  const [isScannerOpen, setIsScannerOpen] = useState(false)

  // Issues list
  const [issues, setIssues] = useState<ResellerIssue[]>([])
  const [isLoadingIssues, setIsLoadingIssues] = useState(false)

  // Returns history
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Comprovante de Fechamento / Acerto State
  const [selectedReceipt, setSelectedReceipt] = useState<ResellerReturn | null>(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  // Quitting an issue
  const [resolvingIssue, setResolvingIssue] = useState<ResellerIssue | null>(null)
  const [paidNotes, setPaidNotes] = useState('')

  // Filtros de busca e período
  const [searchQuery, setSearchQuery] = useState('')
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d' | 'month'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'forgiven'>('all')
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date())
  const [isRefreshingSilent, setIsRefreshingSilent] = useState(false)

  useEffect(() => {
    if (!reseller?.id) return

    let isMounted = true
    let debounceTimer: any = null

    const fetchAllData = async (silent = false) => {
      if (!silent) {
        setIsLoadingStock(true)
        setIsLoadingIssues(true)
        setIsLoadingHistory(true)
      }
      try {
        const [items, issuesList, returnsList] = await Promise.all([
          resellerStockService.getResellerStock(reseller.id),
          resellerStockService.getIssues({ resellerId: reseller.id }),
          resellerStockService.getReturns({ resellerId: reseller.id }),
        ])
        if (!isMounted) return

        setStockItems(items)
        setIssues(issuesList)
        setReturnsHistory(returnsList)
        setLastSyncTime(new Date())

        // Atualiza o conferenceMap preservando digitação em andamento do usuário se houver
        setConferenceMap((prev) => {
          const updated: Record<string, any> = {}
          items.forEach((it) => {
            updated[it.product] = prev[it.product] || {
              returned_qty: 0,
              pending_qty: 0,
              pending_reason: 'extraviada',
              pending_notes: '',
            }
          })
          return updated
        })
      } catch (err: any) {
        console.error('Erro ao carregar dados da revendedora:', err)
        // Sessão expirada: avisa a usuária em vez de falhar em silêncio.
        if (err?.status === 401 || !pb.authStore.isValid) {
          toast.error('Sua sessão expirou. Faça login novamente para continuar conferindo.')
        }
      } finally {
        if (isMounted) {
          if (!silent) {
            setIsLoadingStock(false)
            setIsLoadingIssues(false)
            setIsLoadingHistory(false)
          } else {
            setIsRefreshingSilent(false)
          }
        }
      }
    }

    // Carga inicial
    fetchAllData(false)

    // Debounce leve (350ms)
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      if (isMounted) setIsRefreshingSilent(true)
      debounceTimer = setTimeout(() => {
        if (isMounted) {
          fetchAllData(true)
        }
      }, 350)
    }

    // Subscrição em tempo real para coleções ligadas a estoque, devoluções, pendências e vendas
    const collectionsToWatch = [
      'reseller_stock_items',
      'reseller_returns',
      'reseller_issues',
      'reseller_sales',
    ]
    let subscriptionsActive = true

    collectionsToWatch.forEach((colName) => {
      try {
        pb.collection(colName)
          .subscribe('*', (e) => {
            const recordReseller = (e.record as any)?.reseller
            if (!recordReseller || recordReseller === reseller.id) {
              scheduleRefresh()
            }
          })
          .catch((err) => {
            console.warn(`[Realtime Returns] Erro ao assinar ${colName}:`, err)
          })
      } catch (err) {
        console.warn(`[Realtime Returns] Falha ao iniciar subscribe em ${colName}:`, err)
      }
    })

    // Polling leve de fallback (a cada 20s)
    const pollInterval = setInterval(() => {
      if (isMounted) {
        fetchAllData(true)
      }
    }, 20000)

    return () => {
      isMounted = false
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(pollInterval)
      if (subscriptionsActive) {
        subscriptionsActive = false
        collectionsToWatch.forEach((colName) => {
          try {
            pb.collection(colName)
              .unsubscribe('*')
              .catch(() => {})
          } catch {
            /* ignore */
          }
        })
      }
    }
  }, [reseller?.id])

  const loadStock = async (resellerId: string) => {
    setIsLoadingStock(true)
    try {
      const items = await resellerStockService.getResellerStock(resellerId)
      setStockItems(items)
      setConferenceMap((prev) => {
        const initialMap: Record<string, any> = {}
        items.forEach((it) => {
          initialMap[it.product] = prev[it.product] || {
            returned_qty: 0,
            pending_qty: 0,
            pending_reason: 'extraviada',
            pending_notes: '',
          }
        })
        return initialMap
      })
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
      const updatedHistory = await resellerStockService.getReturns({ resellerId: reseller.id })
      setReturnsHistory(updatedHistory)

      // Abre comprovante automaticamente após finalizar
      const matched = updatedHistory.find((r) => r.id === res.return_id)
      const receiptData: ResellerReturn = matched || {
        id: res.return_id,
        code: res.code,
        reseller: reseller.id,
        operator: pb.authStore.record?.id,
        status: 'completed',
        items: itemsToProcess.map((it) => {
          const itemStock = stockItems.find((s) => s.product === it.product_id)
          const p = itemStock?.expand?.product
          return {
            product_id: it.product_id,
            code: p?.code || '—',
            description: p?.description || p?.nome_produto || 'Joia',
            selling_price: p?.selling_price || itemStock?.selling_price || 0,
            returned_qty: it.returned_qty,
            pending_qty: it.pending_qty,
            pending_reason: it.pending_reason,
          }
        }),
        total_returned_qty: res.total_returned_qty,
        total_pending_qty: res.total_pending_qty,
        total_pending_value_due: res.total_pending_value_due,
        notes: returnNotes,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        expand: {
          reseller,
        },
      }
      setSelectedReceipt(receiptData)
      setIsReceiptOpen(true)

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

  // Localiza um item do estoque da revendedora a partir do código lido (câmera ou digitação)
  const findStockItemByScannedCode = useCallback(
    (rawCode: string) => {
      const code = (rawCode || '').trim().toLowerCase()
      const digits = code.replace(/\D/g, '')
      if (!code) return undefined
      return stockItems.find((it) => {
        const prod: any = it.expand?.product
        if (!prod) return false
        const candidates = [prod.code, prod.sku]
          .filter((v: any) => v !== undefined && v !== null && String(v).trim() !== '')
          .map((v: any) => String(v).trim().toLowerCase())
        return candidates.some(
          (c: string) => c === code || (digits !== '' && c.replace(/\D/g, '') === digits),
        )
      })
    },
    [stockItems],
  )

  // Leitura por câmera: incrementa "Qtd Devolvida (Física)" da peça lida.
  // Retorna false para o leitor tocar o bip de erro e mostrar feedback na tela.
  const handleScannerScan = useCallback(
    (barcode: string): boolean => {
      const item = findStockItemByScannedCode(barcode)
      if (!item) {
        toast.error(
          `Código ${barcode} não encontrado no estoque em poder de ${reseller?.name || 'revendedora'}.`,
        )
        return false
      }
      const prod: any = item.expand?.product
      const conf = conferenceMap[item.product] || {
        returned_qty: 0,
        pending_qty: 0,
        pending_reason: 'extraviada' as const,
        pending_notes: '',
      }
      if ((conf.returned_qty || 0) + (conf.pending_qty || 0) >= item.quantity) {
        toast.error(
          `Peça ${prod?.code} já está totalmente conferida nesta devolução (saldo ${item.quantity} un).`,
        )
        return false
      }
      handleItemChange(item.product, 'returned_qty', (conf.returned_qty || 0) + 1)
      toast.success(
        `+1 devolvida: ${prod?.code} — ${prod?.description || prod?.nome_produto || 'Joia'}`,
      )
      return true
    },
    [findStockItemByScannedCode, conferenceMap, reseller?.name],
  )

  // KPIs do topo (coerentes com Financeiro & Lucro da revendedora)
  const pendingIssuesList = useMemo(() => issues.filter((i) => i.status === 'pending'), [issues])
  const paidIssuesList = useMemo(() => issues.filter((i) => i.status === 'paid'), [issues])
  const forgivenIssuesList = useMemo(() => issues.filter((i) => i.status === 'forgiven'), [issues])

  const totalPendingDue = useMemo(
    () => pendingIssuesList.reduce((acc, i) => acc + (i.scaglioni_due_total || 0), 0),
    [pendingIssuesList],
  )
  const totalPaidIssues = useMemo(
    () => paidIssuesList.reduce((acc, i) => acc + (i.scaglioni_due_total || 0), 0),
    [paidIssuesList],
  )
  const totalReturnedPieces = useMemo(
    () => returnsHistory.reduce((acc, r) => acc + (r.total_returned_qty || 0), 0),
    [returnsHistory],
  )
  const totalPendingPieces = useMemo(
    () => pendingIssuesList.reduce((acc, i) => acc + (i.quantity || 0), 0),
    [pendingIssuesList],
  )

  // Helper de filtro por período
  const isWithinPeriod = (dateIso?: string) => {
    if (!dateIso || periodFilter === 'all') return true
    const d = new Date(dateIso).getTime()
    const now = Date.now()
    if (periodFilter === '7d') {
      return now - d <= 7 * 24 * 60 * 60 * 1000
    }
    if (periodFilter === '30d') {
      return now - d <= 30 * 24 * 60 * 60 * 1000
    }
    if (periodFilter === 'month') {
      const itemDate = new Date(dateIso)
      const nowDate = new Date()
      return (
        itemDate.getFullYear() === nowDate.getFullYear() &&
        itemDate.getMonth() === nowDate.getMonth()
      )
    }
    return true
  }

  // Filtragem de pendências (issues)
  const filteredIssues = useMemo(() => {
    return issues.filter((iss) => {
      // Filtro de status
      if (statusFilter !== 'all' && iss.status !== statusFilter) {
        return false
      }
      // Filtro de período
      if (!isWithinPeriod(iss.created)) {
        return false
      }
      // Filtro de busca (código ou descrição ou observações)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const code = iss.expand?.product?.code?.toString().toLowerCase() || ''
        const desc = (
          iss.expand?.product?.description ||
          iss.expand?.product?.nome_produto ||
          ''
        ).toLowerCase()
        const notes = (iss.notes || '').toLowerCase()
        const reason = (iss.reason || '').toLowerCase()
        if (
          !code.includes(query) &&
          !desc.includes(query) &&
          !notes.includes(query) &&
          !reason.includes(query)
        ) {
          return false
        }
      }
      return true
    })
  }, [issues, statusFilter, periodFilter, searchQuery])

  // Filtragem de histórico de devoluções (returns)
  const filteredReturns = useMemo(() => {
    return returnsHistory.filter((ret) => {
      if (!isWithinPeriod(ret.created)) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const code = (ret.code || '').toLowerCase()
        const notes = (ret.notes || '').toLowerCase()
        const hasItemMatch = (ret.items || []).some((item) => {
          const itemCode = (item.code || '').toLowerCase()
          const itemDesc = (item.description || '').toLowerCase()
          return itemCode.includes(query) || itemDesc.includes(query)
        })
        if (!code.includes(query) && !notes.includes(query) && !hasItemMatch) {
          return false
        }
      }
      return true
    })
  }, [returnsHistory, periodFilter, searchQuery])

  // Filtragem de itens no formulário de conferência
  const filteredStockItems = useMemo(() => {
    if (!searchQuery.trim()) return stockItems
    const query = searchQuery.trim().toLowerCase()
    return stockItems.filter((it) => {
      const prod = it.expand?.product
      const code = prod?.code?.toString().toLowerCase() || ''
      const desc = (prod?.description || prod?.nome_produto || '').toLowerCase()
      return code.includes(query) || desc.includes(query)
    })
  }, [stockItems, searchQuery])

  const hasActiveFilters =
    searchQuery.trim().length > 0 || periodFilter !== 'all' || statusFilter !== 'all'
  const clearFilters = () => {
    setSearchQuery('')
    setPeriodFilter('all')
    setStatusFilter('all')
  }

  const isLoadingAny = isLoadingStock || isLoadingIssues || isLoadingHistory

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header com identificação e indicador realtime discreto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <RotateCcw className="h-5 w-5" />
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
              Devolução, Conferência & Pendências
            </h1>
            {isRefreshingSilent && (
              <span className="flex items-center gap-1 text-[11px] text-[#7A5C2E] bg-[#F3EAD8] px-2 py-0.5 rounded-full animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            {reseller?.name ? (
              <span>
                Acompanhamento de joias de <strong>{reseller.name}</strong> — conferência, histórico
                de retornos e quitação de pendências.
              </span>
            ) : (
              'Conferência de peças devolvidas pela revendedora, classificação de pendências e controle de valores devidos.'
            )}
          </p>
        </div>

        {/* Status de sincronização suave */}
        <div className="flex items-center gap-2 text-xs text-[#8C8275]">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Tempo real ativo</span>
        </div>
      </div>

      {/* 4 CARDS DE KPI (COERENTES COM FINANCEIRO & LUCRO) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Peças Devolvidas */}
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-xs font-semibold">Peças Devolvidas</span>
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="font-serif text-2xl font-bold text-emerald-950">
              {totalReturnedPieces}{' '}
              <span className="text-sm font-sans font-normal text-emerald-800">un</span>
            </div>
            <p className="text-[11px] text-emerald-700">
              Retornadas ao estoque da loja em {returnsHistory.length} fechamento(s)
            </p>
          </CardContent>
        </Card>

        {/* 2. Pendências / Extravios em Aberto */}
        <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-xs font-semibold">Pendências em Aberto</span>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="font-serif text-2xl font-bold text-amber-950">
              {totalPendingPieces}{' '}
              <span className="text-sm font-sans font-normal text-amber-800">
                un ({pendingIssuesList.length})
              </span>
            </div>
            <p className="text-[11px] text-amber-700">
              Extravios ou vendas sem PDV aguardando quitação
            </p>
          </CardContent>
        </Card>

        {/* 3. Valor Já Quitado */}
        <Card className="border-[#E5DFD5] bg-white shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[#6B655E]">
              <span className="text-xs font-semibold">Valor Já Quitado</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#2D2A26]">
              {formatCurrency(totalPaidIssues)}
            </div>
            <p className="text-[11px] text-[#6B655E]">
              {paidIssuesList.length} pendência(s) quitadas/pagas
            </p>
          </CardContent>
        </Card>

        {/* 4. Valor Pendente de Acerto */}
        <Card className="border-[#C6A664] bg-[#FDFBF7] shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[#7A5C2E]">
              <span className="text-xs font-semibold">Pendente de Acerto</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#7A5C2E]">
              {formatCurrency(totalPendingDue)}
            </div>
            <p className="text-[11px] text-[#7A5C2E]">Valor a pagar devido à Scaglioni</p>
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTROS E BUSCA RÁPIDA */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Campo de Busca por código / nome */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C8275]" />
              <Input
                placeholder="Buscar por código ou descrição da joia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs border-[#E5DFD5] bg-[#FDFBF7] focus-visible:ring-[#7A5C2E] h-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-[#8C8275] hover:text-[#2D2A26]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filtros em Linha: Período e Situação */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Período */}
              <div className="flex items-center gap-1.5 bg-[#FDFBF7] border border-[#E5DFD5] rounded-md px-2 py-1">
                <Calendar className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span className="text-[11px] text-[#6B655E] hidden sm:inline">Período:</span>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as any)}
                  className="bg-transparent text-xs text-[#2D2A26] font-medium border-0 focus:ring-0 cursor-pointer p-0 pr-1"
                >
                  <option value="all">Todo o período</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="month">Este mês</option>
                </select>
              </div>

              {/* Situação (visível na aba de pendências) */}
              {activeTab === 'issues_list' && (
                <div className="flex items-center gap-1.5 bg-[#FDFBF7] border border-[#E5DFD5] rounded-md px-2 py-1">
                  <Filter className="h-3.5 w-3.5 text-[#7A5C2E]" />
                  <span className="text-[11px] text-[#6B655E] hidden sm:inline">Situação:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent text-xs text-[#2D2A26] font-medium border-0 focus:ring-0 cursor-pointer p-0 pr-1"
                  >
                    <option value="all">Todas as situações</option>
                    <option value="pending">Apenas Pendentes</option>
                    <option value="paid">Quitadas / Pagas</option>
                    <option value="forgiven">Perdoadas</option>
                  </select>
                </div>
              )}

              {/* Limpar Filtros */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-xs text-[#7A5C2E] hover:text-[#634923] hover:bg-[#F3EAD8]"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              <CardTitle className="font-serif text-base font-bold text-[#2D2A26] flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span>Conferência de Joias em Poder de {reseller?.name || 'Revendedora'}</span>
                <span className="text-xs font-normal text-[#6B655E]">
                  Informe as peças devolvidas e as pendentes/extraviadas
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Leitura por câmera (igual ao PDV) */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-9 px-4 flex items-center gap-2 w-full sm:w-auto shadow-xs"
                >
                  <ScanLine className="h-4 w-4" />
                  Ler código de barras (câmera)
                </Button>
              </div>

              {isLoadingStock ? (
                <div className="py-12 text-center text-xs text-[#8C8275] flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 text-[#C6A664] animate-spin" />
                  <span>Carregando estoque da revendedora...</span>
                </div>
              ) : stockItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8C8275] border border-dashed border-[#E5DFD5] rounded-xl bg-[#FDFBF7] p-8">
                  <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Nenhuma joia em poder desta revendedora.
                  </p>
                  <p className="mt-1">O saldo em mãos dela é zero.</p>
                </div>
              ) : filteredStockItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8C8275] border border-dashed border-[#E5DFD5] rounded-xl bg-[#FDFBF7] p-8">
                  <Search className="h-8 w-8 text-[#C6A664] mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Nenhuma joia encontrada para a busca "{searchQuery}"
                  </p>
                  <p className="mt-1">Tente outro código ou nome da joia.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-xs border-[#C6A664] text-[#7A5C2E]"
                  >
                    Limpar busca
                  </Button>
                </div>
              ) : (
                <>
                  {/* Visualização Desktop: Tabela clássica */}
                  <div className="hidden md:block border border-[#E5DFD5] rounded-xl overflow-hidden">
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
                            <th className="py-3 px-3 bg-amber-50 text-amber-800">
                              Motivo Pendência
                            </th>
                            <th className="py-3 px-3 bg-amber-50 text-amber-800">Obs / Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DFD5]">
                          {filteredStockItems.map((it) => {
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
                                  {prod?.description || prod?.nome_produto || 'Joia'}
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
                                    <option value="venda_avulsa_sem_pdv">
                                      Venda avulsa sem PDV
                                    </option>
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

                  {/* Visualização Mobile: Cards empilhados amigáveis */}
                  <div className="md:hidden space-y-3">
                    {filteredStockItems.map((it) => {
                      const prod = it.expand?.product
                      const conf = conferenceMap[it.product] || {
                        returned_qty: 0,
                        pending_qty: 0,
                        pending_reason: 'extraviada',
                        pending_notes: '',
                      }

                      return (
                        <Card key={it.id} className="border-[#E5DFD5] bg-white p-3 space-y-2.5">
                          <div className="flex items-start justify-between gap-2 border-b border-[#E5DFD5]/60 pb-2">
                            <div>
                              <span className="font-mono font-bold text-xs text-[#7A5C2E] px-1.5 py-0.5 rounded bg-[#F3EAD8]">
                                {prod?.code}
                              </span>
                              <p className="font-medium text-xs text-[#2D2A26] mt-1">
                                {prod?.description || prod?.nome_produto || 'Joia'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] text-[#6B655E] block">
                                Saldo em mãos
                              </span>
                              <span className="font-bold text-xs text-[#7A5C2E]">
                                {it.quantity} un
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                              <label className="text-[10px] text-emerald-800 font-bold block mb-1">
                                Qtd Devolvida (Física):
                              </label>
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
                                className="w-full h-8 text-center rounded-md border border-emerald-300 bg-white text-xs font-bold"
                              />
                            </div>

                            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                              <label className="text-[10px] text-amber-800 font-bold block mb-1">
                                Qtd Faltante / Pendente:
                              </label>
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
                                className="w-full h-8 text-center rounded-md border border-amber-300 bg-white text-xs font-bold"
                              />
                            </div>
                          </div>

                          {(conf.pending_qty || 0) > 0 && (
                            <div className="space-y-1.5 p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
                              <div>
                                <label className="text-[10px] text-amber-800 font-semibold block mb-0.5">
                                  Motivo da pendência:
                                </label>
                                <select
                                  value={conf.pending_reason}
                                  onChange={(e) =>
                                    handleItemChange(it.product, 'pending_reason', e.target.value)
                                  }
                                  className="w-full h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                                >
                                  <option value="extraviada">Extraviada / Perdida</option>
                                  <option value="venda_avulsa_sem_pdv">Venda avulsa sem PDV</option>
                                  <option value="outros">Outros motivos</option>
                                </select>
                              </div>
                              <div>
                                <input
                                  type="text"
                                  placeholder="Detalhes ou justificativa..."
                                  value={conf.pending_notes}
                                  onChange={(e) =>
                                    handleItemChange(it.product, 'pending_notes', e.target.value)
                                  }
                                  className="w-full h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                                />
                              </div>
                            </div>
                          )}
                        </Card>
                      )
                    })}
                  </div>
                </>
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
              <h3 className="font-serif text-base font-bold text-[#2D2A26]">
                Peças Não Devolvidas & Pendências Financeiras
              </h3>
              <p className="text-xs text-[#6B655E]">
                Peças classificadas como extraviadas, vendidas avulso sem PDV ou outros motivos com
                valor devido à Scaglioni.
              </p>
            </div>
            <div className="text-xs text-[#6B655E] shrink-0 font-medium">
              Exibindo <strong className="text-[#2D2A26]">{filteredIssues.length}</strong> de{' '}
              {issues.length} pendência(s)
            </div>
          </div>

          {isLoadingIssues ? (
            <div className="py-12 text-center text-xs text-[#8C8275] flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 text-[#C6A664] animate-spin" />
              <span>Carregando pendências...</span>
            </div>
          ) : issues.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center bg-white shadow-xs">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2 opacity-80" />
              <p className="text-base font-semibold text-[#2D2A26]">Nenhuma pendência ativa!</p>
              <p className="text-xs text-[#6B655E] mt-1">
                Todas as peças em poder da vendedora estão conferidas e sem débitos em aberto.
              </p>
            </Card>
          ) : filteredIssues.length === 0 ? (
            <Card className="border-dashed border-[#E5DFD5] p-10 text-center bg-[#FDFBF7]">
              <Search className="h-8 w-8 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="text-sm font-semibold text-[#2D2A26]">
                Nenhuma pendência encontrada com os filtros atuais.
              </p>
              <p className="text-xs text-[#6B655E] mt-1">
                Verifique o termo de busca, o período ou a situação selecionada.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-3 text-xs border-[#C6A664] text-[#7A5C2E]"
              >
                Limpar filtros
              </Button>
            </Card>
          ) : (
            <>
              {/* Tabela Desktop */}
              <div className="hidden md:block border border-[#E5DFD5] rounded-xl overflow-hidden bg-white shadow-xs">
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
                        <th className="py-3 px-3 text-center">Situação</th>
                        {canManage && <th className="py-3 px-3 text-center">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DFD5]">
                      {filteredIssues.map((iss) => {
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
                                {iss.expand?.product?.description ||
                                  iss.expand?.product?.nome_produto}
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
                                  ? 'Quitada / Paga'
                                  : iss.status === 'forgiven'
                                    ? 'Perdoada'
                                    : 'Pendente'}
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
                                    className="h-7 px-2.5 text-[11px] bg-[#7A5C2E] hover:bg-[#634923] text-white shadow-xs"
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

              {/* Cards Mobile empilhados */}
              <div className="md:hidden space-y-3">
                {filteredIssues.map((iss) => {
                  const isPending = iss.status === 'pending'
                  const isPaid = iss.status === 'paid'
                  const reasonLabel =
                    iss.reason === 'extraviada'
                      ? 'Extraviada / Perdida'
                      : iss.reason === 'venda_avulsa_sem_pdv'
                        ? 'Venda Avulsa sem PDV'
                        : 'Outros Motivos'

                  return (
                    <Card
                      key={iss.id}
                      className="border-[#E5DFD5] bg-white p-3.5 space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-[#E5DFD5]/60 pb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs text-[#7A5C2E] px-1.5 py-0.5 rounded bg-[#F3EAD8]">
                              {iss.expand?.product?.code}
                            </span>
                            <Badge
                              variant={isPaid ? 'default' : 'secondary'}
                              className={`text-[9px] ${
                                isPaid
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : iss.status === 'forgiven'
                                    ? 'bg-gray-100 text-gray-700'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isPaid
                                ? 'Quitada'
                                : iss.status === 'forgiven'
                                  ? 'Perdoada'
                                  : 'Pendente'}
                            </Badge>
                          </div>
                          <p className="font-medium text-xs text-[#2D2A26] mt-1">
                            {iss.expand?.product?.description ||
                              iss.expand?.product?.nome_produto ||
                              'Joia'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-[#8C8275] block">
                            {formatDateTime(iss.created)}
                          </span>
                          <span className="text-xs font-bold text-[#7A5C2E]">
                            {iss.quantity} un
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <div>
                          <span className="text-[10px] text-[#6B655E] block">Motivo:</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              iss.reason === 'extraviada'
                                ? 'border-red-300 bg-red-50 text-red-800'
                                : iss.reason === 'venda_avulsa_sem_pdv'
                                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                                  : 'border-amber-300 bg-amber-50 text-amber-800'
                            }`}
                          >
                            {reasonLabel}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-[#6B655E] block">Valor devido:</span>
                          <strong className="text-sm font-bold text-[#7A5C2E]">
                            {formatCurrency(iss.scaglioni_due_total)}
                          </strong>
                        </div>
                      </div>

                      {iss.notes && (
                        <p className="text-[11px] text-[#8C8275] italic bg-[#FDFBF7] p-2 rounded border border-[#E5DFD5]/60">
                          "{iss.notes}"
                        </p>
                      )}

                      {canManage && isPending && (
                        <div className="pt-2 border-t border-[#E5DFD5]/60 flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => setResolvingIssue(iss)}
                            className="w-full h-8 text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white"
                          >
                            Quitar Débito
                          </Button>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: HISTÓRICO DE DEVOLUÇÕES */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FDFBF7] p-4 rounded-xl border border-[#E5DFD5]">
            <div>
              <h3 className="font-serif text-base font-bold text-[#2D2A26]">
                Histórico de Fechamentos & Devoluções
              </h3>
              <p className="text-xs text-[#6B655E]">
                Registro de cada conferência realizada com comprovante imprimível, devoluções e
                pendências geradas.
              </p>
            </div>
            <div className="text-xs text-[#6B655E] shrink-0 font-medium">
              Exibindo <strong className="text-[#2D2A26]">{filteredReturns.length}</strong> de{' '}
              {returnsHistory.length} fechamento(s)
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="py-12 text-center text-xs text-[#8C8275] flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 text-[#C6A664] animate-spin" />
              <span>Carregando histórico de devoluções...</span>
            </div>
          ) : returnsHistory.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center bg-white shadow-xs">
              <FileText className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="text-base font-semibold text-[#2D2A26]">
                Nenhuma conferência de devolução registrada ainda.
              </p>
              <p className="text-xs text-[#6B655E] mt-1">
                Quando realizar um fechamento ou acerto, o histórico e comprovante aparecerão aqui.
              </p>
            </Card>
          ) : filteredReturns.length === 0 ? (
            <Card className="border-dashed border-[#E5DFD5] p-10 text-center bg-[#FDFBF7]">
              <Search className="h-8 w-8 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="text-sm font-semibold text-[#2D2A26]">
                Nenhum fechamento encontrado com os filtros atuais.
              </p>
              <p className="text-xs text-[#6B655E] mt-1">
                Verifique o termo de busca ou o período selecionado.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-3 text-xs border-[#C6A664] text-[#7A5C2E]"
              >
                Limpar filtros
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReturns.map((ret) => (
                <Card
                  key={ret.id}
                  className="border-[#E5DFD5] bg-white shadow-xs hover:border-[#C6A664] transition-colors"
                >
                  <CardHeader className="p-4 border-b border-[#E5DFD5]/60 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#7A5C2E] px-2 py-0.5 rounded bg-[#F3EAD8]">
                        {ret.code}
                      </span>
                      <span className="text-[11px] text-[#6B655E]">
                        {formatDateTime(ret.created)}
                      </span>
                    </div>
                    <CardTitle className="font-serif text-base font-bold text-[#2D2A26] mt-2">
                      {ret.expand?.reseller?.name || 'Revendedora'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[#6B655E]">Devolvidas à Loja:</span>
                      <strong className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {ret.total_returned_qty} peças
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#6B655E]">Pendências Geradas:</span>
                      <strong className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {ret.total_pending_qty} peças
                      </strong>
                    </div>
                    <div className="flex justify-between items-center border-t border-[#E5DFD5] pt-2">
                      <span className="text-[#6B655E]">Valor a Pagar Pendente:</span>
                      <strong className="text-[#7A5C2E] font-bold text-sm">
                        {formatCurrency(ret.total_pending_value_due)}
                      </strong>
                    </div>
                    {ret.notes && (
                      <p className="text-[11px] text-[#8C8275] bg-[#FDFBF7] p-2 rounded italic border border-[#E5DFD5]/60">
                        "{ret.notes}"
                      </p>
                    )}
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedReceipt(ret)
                          setIsReceiptOpen(true)
                        }}
                        className="w-full h-8 text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center justify-center gap-1.5 font-medium shadow-2xs"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Comprovante do Fechamento
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leitor de código de barras por câmera (mesmo componente do PDV, camada z-200 via portal) */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen
          onClose={() => setIsScannerOpen(false)}
          onScan={handleScannerScan}
          originTitle={`Devolução — ${reseller?.name || 'Revendedora'}`}
        />
      )}

      {/* Settlement Receipt Modal */}
      <SettlementReceiptModal
        settlement={selectedReceipt}
        resellerNameFallback={reseller?.name}
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false)
          setSelectedReceipt(null)
        }}
      />

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
