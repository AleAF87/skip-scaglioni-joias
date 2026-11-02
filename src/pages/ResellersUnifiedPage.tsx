import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Users2,
  PackagePlus,
  Boxes,
  RotateCcw,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  PenTool,
  Store,
  FileText,
  DollarSign,
  FileCheck2,
  FileSignature,
  ZoomIn,
  Package,
  ArrowLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { productService } from '@/services/productService'
import { resellerStockService } from '@/services/resellerStockService'
import { companySettingsService } from '@/services/companySettingsService'
import {
  Reseller,
  Product,
  ResellerDelivery,
  ResellerStockItem,
  ResellerReturn,
  ResellerIssue,
  ConsignmentList,
  AppSettings,
} from '@/types'
import { formatCurrency, formatDate, formatDateTime, getFileUrl } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchSignaturePad } from '@/components/TouchSignaturePad'
import { DeliveryReceiptModal } from '@/components/DeliveryReceiptModal'
import { ConsignmentContractModal } from '@/components/ConsignmentContractModal'
import { ImageLightbox } from '@/components/ImageLightbox'
import { toast } from 'sonner'

export default function ResellersUnifiedPage() {
  const { user, isAdmin, isOperator, isReseller } = useAuth()
  const canManage = isAdmin || isOperator
  const [searchParams, setSearchParams] = useSearchParams()

  // Reseller Context
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [resellerSearch, setResellerSearch] = useState<string>('')

  // Overview metrics (all resellers)
  const [allStockItems, setAllStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(true)

  // Profile Active Tab: 'deliveries' | 'new_delivery' | 'stock' | 'returns' | 'history_closing'
  const [profileTab, setProfileTab] = useState<
    'deliveries' | 'new_delivery' | 'stock' | 'returns' | 'history_closing'
  >('deliveries')

  // Deliveries List
  const [deliveries, setDeliveries] = useState<ResellerDelivery[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(false)

  // Current reseller stock items
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false)

  // Receipt Modal & Touch Sign
  const [selectedReceiptDelivery, setSelectedReceiptDelivery] = useState<ResellerDelivery | null>(
    null,
  )
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [signingDelivery, setSigningDelivery] = useState<ResellerDelivery | null>(null)

  // New Delivery Form State
  const [availableProducts, setAvailableProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [deliveryItems, setDeliveryItems] = useState<
    Array<{
      product: Product
      quantity: number
      selling_price: number
    }>
  >([])
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [deliverySignature, setDeliverySignature] = useState<string | null>(null)
  const [showSignPadInForm, setShowSignPadInForm] = useState(false)
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false)

  // Returns / Devoluções & Conferência State
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
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [issues, setIssues] = useState<ResellerIssue[]>([])

  // Legacy / Historical Consignment Lists
  const [legacyLists, setLegacyLists] = useState<ConsignmentList[]>([])
  const [companySettings, setCompanySettings] = useState<AppSettings | null>(null)
  const [activeContractList, setActiveContractList] = useState<ConsignmentList | null>(null)
  const [contractModalOpen, setContractModalOpen] = useState(false)

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

  // 1. Initial Load
  useEffect(() => {
    loadInitial()
  }, [user])

  const loadInitial = async () => {
    try {
      setIsLoadingOverview(true)
      let loadedResellers: Reseller[] = []

      if (canManage) {
        loadedResellers = await resellerService.getResellers({ status: 'active' })
        setResellers(loadedResellers)

        // Load all stock items for the overview
        try {
          const allStock = await resellerStockService.getAllResellerStockItems('')
          setAllStockItems(allStock)
        } catch {
          /* ignore */
        }
      } else if (isReseller && user) {
        try {
          const res = await resellerService.getResellerByUserId(user.id)
          loadedResellers = [res]
          setResellers(loadedResellers)
          setCurrentReseller(res)
        } catch (err) {
          console.error('Revendedora não localizada:', err)
        }
      }

      // Check query param for reseller ID if manager
      const urlResellerId = searchParams.get('reseller')
      if (canManage && urlResellerId) {
        const found = loadedResellers.find((r) => r.id === urlResellerId)
        if (found) {
          setCurrentReseller(found)
        }
      }

      // Settings (for contracts if any)
      try {
        const setts = await companySettingsService.getSettings()
        setCompanySettings(setts)
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('Erro ao carregar dados iniciais:', err)
    } finally {
      setIsLoadingOverview(false)
    }
  }

  // Navigate into a Reseller profile
  const handleOpenResellerProfile = (
    reseller: Reseller,
    initialTab:
      | 'deliveries'
      | 'new_delivery'
      | 'stock'
      | 'returns'
      | 'history_closing' = 'deliveries',
  ) => {
    setCurrentReseller(reseller)
    setProfileTab(initialTab)
    if (canManage) {
      setSearchParams({ reseller: reseller.id }, { replace: true })
    }
  }

  // Back to overview
  const handleBackToOverview = () => {
    setCurrentReseller(null)
    setDeliveryItems([])
    setDeliveryNotes('')
    setDeliverySignature(null)
    setShowSignPadInForm(false)
    setReturnNotes('')
    setSearchParams({}, { replace: true })
  }

  // 2. Load context data whenever currentReseller changes
  useEffect(() => {
    if (currentReseller) {
      loadDeliveries(currentReseller.id)
      loadStock(currentReseller.id)
      loadIssues(currentReseller.id)
      loadReturnsHistory(currentReseller.id)
      loadLegacyLists(currentReseller.id)
    }
  }, [currentReseller?.id])

  const loadDeliveries = async (resellerId: string) => {
    setIsLoadingDeliveries(true)
    try {
      const res = await resellerStockService.getDeliveries({ resellerId })
      setDeliveries(res)
    } catch (err) {
      console.error('Erro ao carregar entregas:', err)
    } finally {
      setIsLoadingDeliveries(false)
    }
  }

  const loadStock = async (resellerId: string) => {
    if (!resellerId) return
    setIsLoadingStock(true)
    try {
      const items = await resellerStockService.getResellerStock(resellerId)
      setStockItems(items)

      // Inicializa o mapa de devolução
      const initialMap: Record<
        string,
        {
          returned_qty: number
          pending_qty: number
          pending_reason: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
          pending_notes: string
        }
      > = {}
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
      console.error('Erro ao carregar estoque:', err)
    } finally {
      setIsLoadingStock(false)
    }
  }

  const loadIssues = async (resellerId: string) => {
    try {
      const list = await resellerStockService.getIssues({ resellerId })
      setIssues(list)
    } catch (err) {
      console.error('Erro ao carregar pendências:', err)
    }
  }

  const loadReturnsHistory = async (resellerId: string) => {
    try {
      const list = await resellerStockService.getReturns({ resellerId })
      setReturnsHistory(list)
    } catch (err) {
      console.error('Erro ao carregar devoluções:', err)
    }
  }

  const loadLegacyLists = async (resellerId: string) => {
    try {
      const data = await resellerService.getConsignmentLists({ resellerId })
      setLegacyLists(data)
    } catch (err) {
      console.error('Erro ao carregar histórico legado:', err)
    }
  }

  // Load available products for delivery creation
  const loadAvailableProducts = async (term = '') => {
    try {
      const res = await productService.getProducts({
        search: term,
        status: 'available',
        perPage: 40,
      })
      setAvailableProducts(res.items.filter((p) => p.quantity > 0))
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    }
  }

  useEffect(() => {
    if (currentReseller && profileTab === 'new_delivery') {
      loadAvailableProducts()
    }
  }, [currentReseller?.id, profileTab])

  // Basket handlers
  const handleAddProductToDelivery = (prod: Product) => {
    const existing = deliveryItems.find((it) => it.product.id === prod.id)
    if (existing) {
      if (existing.quantity >= prod.quantity) {
        toast.warning(`Estoque geral da loja possui apenas ${prod.quantity} unidades disponíveis.`)
        return
      }
      setDeliveryItems(
        deliveryItems.map((it) =>
          it.product.id === prod.id ? { ...it, quantity: it.quantity + 1 } : it,
        ),
      )
    } else {
      setDeliveryItems([
        ...deliveryItems,
        {
          product: prod,
          quantity: 1,
          selling_price: prod.selling_price,
        },
      ])
    }
  }

  const handleUpdateItemQty = (prodId: string, qty: number) => {
    const item = deliveryItems.find((it) => it.product.id === prodId)
    if (!item) return
    if (qty > item.product.quantity) {
      toast.warning(`Estoque máximo disponível na loja é ${item.product.quantity}.`)
      qty = item.product.quantity
    }
    if (qty <= 0) {
      setDeliveryItems(deliveryItems.filter((it) => it.product.id !== prodId))
    } else {
      setDeliveryItems(
        deliveryItems.map((it) => (it.product.id === prodId ? { ...it, quantity: qty } : it)),
      )
    }
  }

  const handleRemoveDeliveryItem = (prodId: string) => {
    setDeliveryItems(deliveryItems.filter((it) => it.product.id !== prodId))
  }

  // Submit delivery
  const handleCreateDelivery = async () => {
    if (!currentReseller) {
      toast.error('Revendedora não identificada.')
      return
    }
    if (deliveryItems.length === 0) {
      toast.error('Adicione ao menos uma joia para a entrega.')
      return
    }

    setIsSubmittingDelivery(true)
    try {
      const payload = {
        reseller_id: currentReseller.id,
        items: deliveryItems.map((it) => ({
          product_id: it.product.id,
          quantity: it.quantity,
          selling_price: it.selling_price,
        })),
        notes: deliveryNotes,
        signature_data: deliverySignature || undefined,
        signer_name: currentReseller.name,
      }

      const res = await resellerStockService.createDelivery(payload)
      toast.success(
        `Entrega ${res.code} registrada com sucesso para ${currentReseller.name}! Peças baixadas do estoque geral e creditadas no estoque da revendedora.`,
      )

      setDeliveryItems([])
      setDeliveryNotes('')
      setDeliverySignature(null)
      setShowSignPadInForm(false)
      setProfileTab('deliveries')
      await loadDeliveries(currentReseller.id)
      await loadStock(currentReseller.id)

      // refresh overview data
      if (canManage) {
        const allStock = await resellerStockService.getAllResellerStockItems('')
        setAllStockItems(allStock)
      }
    } catch (err: any) {
      console.error('Erro ao criar entrega:', err)
      toast.error(err.message || 'Falha ao registrar entrega.')
    } finally {
      setIsSubmittingDelivery(false)
    }
  }

  // Handle standalone sign on pending delivery
  const handleSaveSignature = async (dataUrl: string) => {
    if (!signingDelivery || !currentReseller) return
    try {
      await resellerStockService.signDelivery({
        delivery_id: signingDelivery.id,
        signature_data: dataUrl,
        signer_name: currentReseller.name || user?.name,
      })
      toast.success('Assinatura da entrega confirmada com sucesso!')
      setSigningDelivery(null)
      loadDeliveries(currentReseller.id)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar assinatura.')
    }
  }

  // Conference & Return handlers
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

  const handleSubmitReturn = async () => {
    if (!currentReseller) {
      toast.error('Revendedora não identificada.')
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
          `A soma devolvida + pendente excede o saldo em poder da revendedora para o item ${it.expand?.product?.code}.`,
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

    setIsSubmittingReturn(true)
    try {
      const res = await resellerStockService.processReturn({
        reseller_id: currentReseller.id,
        items: itemsToProcess,
        notes: returnNotes,
      })

      toast.success(
        `Conferência ${res.code} processada com sucesso! ${res.total_returned_qty} peças retornaram ao estoque geral da loja e ${res.total_pending_qty} pendências foram geradas.`,
      )
      setReturnNotes('')
      await loadStock(currentReseller.id)
      await loadIssues(currentReseller.id)
      await loadReturnsHistory(currentReseller.id)
      if (canManage) {
        const allStock = await resellerStockService.getAllResellerStockItems('')
        setAllStockItems(allStock)
      }
      setProfileTab('stock')
    } catch (err: any) {
      console.error('Erro na devolução:', err)
      toast.error(err.message || 'Falha ao processar devolução.')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  // Totals for delivery basket
  const totalDeliveryItemsCount = deliveryItems.reduce((acc, it) => acc + it.quantity, 0)
  const totalDeliveryValue = deliveryItems.reduce(
    (acc, it) => acc + it.quantity * it.selling_price,
    0,
  )

  // Overall metrics calculation
  const resellerOverviewList = resellers
    .filter((r) => {
      if (!resellerSearch.trim()) return true
      const term = resellerSearch.toLowerCase()
      return (
        r.name.toLowerCase().includes(term) ||
        r.email?.toLowerCase().includes(term) ||
        r.city?.toLowerCase().includes(term) ||
        r.phone?.toLowerCase().includes(term)
      )
    })
    .map((r) => {
      const itemsForR = allStockItems.filter((it) => it.reseller === r.id && it.quantity > 0)
      const piecesCount = itemsForR.reduce((acc, it) => acc + (it.quantity || 0), 0)
      const totalValue = itemsForR.reduce(
        (acc, it) =>
          acc + (it.quantity || 0) * (it.selling_price || it.expand?.product?.selling_price || 0),
        0,
      )
      return {
        reseller: r,
        piecesCount,
        distinctProducts: itemsForR.length,
        totalValue,
      }
    })

  const grandTotalPieces = resellerOverviewList.reduce((acc, it) => acc + it.piecesCount, 0)
  const grandTotalValue = resellerOverviewList.reduce((acc, it) => acc + it.totalValue, 0)

  const pendingIssuesList = issues.filter((i) => i.status === 'pending')
  const totalPendingDue = pendingIssuesList.reduce(
    (acc, i) => acc + (i.scaglioni_due_total || 0),
    0,
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ------------------------------------------------------------------- */}
      {/* MODO 1: VISÃO GERAL (Cards de Resumo + Busca + Cards das Revendedoras) */}
      {/* ------------------------------------------------------------------- */}
      {!currentReseller && (
        <div className="space-y-6">
          {/* Top Header da Visão Geral */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
            <div>
              <div className="flex items-center gap-2 text-[#7A5C2E]">
                <Users2 className="h-6 w-6" />
                <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-[#2D2A26]">
                  Revendedoras
                </h1>
              </div>
              <p className="text-sm text-[#6B655E] mt-1">
                {canManage
                  ? 'Visão geral das revendedoras ativas. Clique no card de uma revendedora para abrir o perfil com entregas, estoque, conferência e fechamentos.'
                  : 'Acompanhe suas peças recebidas, assine recebimentos pendentes, consulte seu estoque e realize vendas no seu PDV.'}
              </p>
            </div>
          </div>

          {/* Cards de Resumos no topo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-[#E5DFD5] bg-white shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-[#6B655E]">
                    Revendedoras Ativas
                  </p>
                  <p className="text-2xl font-bold font-serif text-[#2D2A26] mt-1">
                    {resellers.length}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#F3EAD8] text-[#7A5C2E]">
                  <Users2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E5DFD5] bg-white shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-[#6B655E]">
                    Peças com Revendedoras
                  </p>
                  <p className="text-2xl font-bold font-serif text-[#2D2A26] mt-1">
                    {grandTotalPieces}{' '}
                    <span className="text-sm font-normal text-[#6B655E]">unidades</span>
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#F3EAD8] text-[#7A5C2E]">
                  <Boxes className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E5DFD5] bg-white shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold text-[#6B655E]">
                    Valor Total em Posse (R$)
                  </p>
                  <p className="text-2xl font-bold font-serif text-[#7A5C2E] mt-1">
                    {formatCurrency(grandTotalValue)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#2E7D4F]/10 text-[#2E7D4F]">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Busca da revendedora */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
            <Input
              placeholder="Buscar revendedora por nome, cidade ou telefone..."
              value={resellerSearch}
              onChange={(e) => setResellerSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          {/* Cards de cada revendedora */}
          {isLoadingOverview ? (
            <div className="py-12 text-center text-xs text-[#8C8275]">
              Carregando dados das revendedoras...
            </div>
          ) : resellerOverviewList.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center bg-white">
              <Users2 className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="font-semibold text-sm text-[#2D2A26]">Nenhuma revendedora encontrada</p>
              <p className="text-xs text-[#6B655E] mt-1">
                Cadastre novas revendedoras ou ajuste os filtros da busca.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resellerOverviewList.map(
                ({ reseller, piecesCount, distinctProducts, totalValue }) => (
                  <Card
                    key={reseller.id}
                    onClick={() => handleOpenResellerProfile(reseller, 'deliveries')}
                    className="border border-[#E5DFD5] hover:border-[#7A5C2E] hover:shadow-md transition-all bg-white flex flex-col justify-between cursor-pointer group"
                  >
                    <CardHeader className="pb-3 border-b border-[#E5DFD5]/60 bg-[#FDFBF7] group-hover:bg-[#F3EAD8]/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-[10px]"
                        >
                          Revendedora Ativa
                        </Badge>
                        <span className="text-[11px] font-bold text-[#7A5C2E]">
                          {reseller.commission_rate || 40}% comissão
                        </span>
                      </div>
                      <CardTitle className="font-serif text-base text-[#2D2A26] mt-2 group-hover:text-[#7A5C2E] transition-colors flex items-center justify-between">
                        <span>{reseller.name}</span>
                        <ChevronRight className="h-4 w-4 text-[#C6A664] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </CardTitle>
                      <p className="text-[11px] text-[#6B655E]">
                        {reseller.city
                          ? `${reseller.city} - ${reseller.state || ''}`
                          : 'Local não informado'}{' '}
                        • {reseller.phone || reseller.email}
                      </p>
                    </CardHeader>

                    <CardContent className="py-4 space-y-2.5 text-xs flex-1">
                      <div className="flex justify-between items-center text-[#6B655E]">
                        <span>Peças em posse:</span>
                        <strong className="text-[#2D2A26] font-semibold text-sm">
                          {piecesCount} unidades
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-[#6B655E]">
                        <span>Modelos distintos:</span>
                        <span className="text-[#2D2A26] font-medium">{distinctProducts} peças</span>
                      </div>
                      <div className="flex justify-between items-center text-[#6B655E] pt-1 border-t border-[#E5DFD5]/60">
                        <span>Valor total em posse:</span>
                        <strong className="text-[#7A5C2E] font-bold text-sm">
                          {formatCurrency(totalValue)}
                        </strong>
                      </div>
                    </CardContent>

                    <div className="p-3 bg-[#FDFBF7] border-t border-[#E5DFD5] flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenResellerProfile(reseller, 'stock')
                        }}
                        className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex-1"
                      >
                        <Boxes className="h-3.5 w-3.5 mr-1" />
                        Ver Estoque
                      </Button>

                      {canManage && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenResellerProfile(reseller, 'new_delivery')
                          }}
                          className="text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white flex-1"
                        >
                          <PackagePlus className="h-3.5 w-3.5 mr-1" />
                          Entregar Joias
                        </Button>
                      )}
                    </div>
                  </Card>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODO 2: PERFIL DA REVENDEDORA (Título + Botão Voltar + Abas Internas)*/}
      {/* ------------------------------------------------------------------- */}
      {currentReseller && (
        <div className="space-y-6">
          {/* Header do Perfil da Revendedora com botão de Voltar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
            <div className="space-y-1">
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToOverview}
                  className="text-xs text-[#7A5C2E] hover:text-[#634923] hover:bg-[#F3EAD8] p-0 h-auto font-medium mb-1.5 flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para a visão geral
                </Button>
              )}

              <div className="flex items-center gap-2 text-[#7A5C2E]">
                <Users2 className="h-6 w-6" />
                <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-[#2D2A26]">
                  {currentReseller.name}
                </h1>
                <Badge
                  variant="outline"
                  className="border-[#2E7D4F] text-[#2E7D4F] bg-[#2E7D4F]/10 text-xs ml-1"
                >
                  Revendedora
                </Badge>
              </div>

              <p className="text-xs text-[#6B655E] flex items-center gap-2 flex-wrap">
                <span>
                  Comissão:{' '}
                  <strong className="text-[#2D2A26] font-semibold">
                    {currentReseller.commission_rate || 40}%
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Contato:{' '}
                  <strong className="text-[#2D2A26] font-semibold">
                    {currentReseller.phone || currentReseller.email || 'Não informado'}
                  </strong>
                </span>
                {currentReseller.city && (
                  <>
                    <span>•</span>
                    <span>
                      Local:{' '}
                      <strong className="text-[#2D2A26] font-semibold">
                        {currentReseller.city}
                        {currentReseller.state ? `/${currentReseller.state}` : ''}
                      </strong>
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Quick Actions do Perfil */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/loja/${currentReseller.id}`} target="_blank">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
                >
                  <Store className="h-3.5 w-3.5" />
                  Loja Virtual
                </Button>
              </Link>

              <Link to="/revendedora/financeiro">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#E5DFD5] text-[#2D2A26] hover:bg-[#FDFBF7] text-xs flex items-center gap-1.5"
                >
                  <DollarSign className="h-3.5 w-3.5 text-[#2E7D4F]" />
                  Financeiro
                </Button>
              </Link>

              {canManage && (
                <Button
                  size="sm"
                  onClick={() => setProfileTab('new_delivery')}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <PackagePlus className="h-4 w-4" />
                  Nova Entrega
                </Button>
              )}
            </div>
          </div>

          {/* Abas Internas DENTRO do perfil da revendedora */}
          <div className="flex border-b border-[#E5DFD5] gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setProfileTab('deliveries')}
              className={`pb-2.5 px-3 font-serif text-xs md:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                profileTab === 'deliveries'
                  ? 'border-[#7A5C2E] text-[#7A5C2E]'
                  : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
              }`}
            >
              <FileText className="h-4 w-4" />
              Entregas Realizadas ({deliveries.length})
            </button>

            {canManage && (
              <button
                onClick={() => setProfileTab('new_delivery')}
                className={`pb-2.5 px-3 font-serif text-xs md:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                  profileTab === 'new_delivery'
                    ? 'border-[#7A5C2E] text-[#7A5C2E]'
                    : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
                }`}
              >
                <PackagePlus className="h-4 w-4" />+ Registrar Entrega
              </button>
            )}

            <button
              onClick={() => setProfileTab('stock')}
              className={`pb-2.5 px-3 font-serif text-xs md:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                profileTab === 'stock'
                  ? 'border-[#7A5C2E] text-[#7A5C2E]'
                  : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
              }`}
            >
              <Boxes className="h-4 w-4" />
              Estoque em Poder ({stockItems.length})
            </button>

            {canManage && (
              <button
                onClick={() => setProfileTab('returns')}
                className={`pb-2.5 px-3 font-serif text-xs md:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                  profileTab === 'returns'
                    ? 'border-[#7A5C2E] text-[#7A5C2E]'
                    : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                Conferência & Devoluções
              </button>
            )}

            <button
              onClick={() => setProfileTab('history_closing')}
              className={`pb-2.5 px-3 font-serif text-xs md:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                profileTab === 'history_closing'
                  ? 'border-[#7A5C2E] text-[#7A5C2E]'
                  : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
              }`}
            >
              <FileCheck2 className="h-4 w-4" />
              Histórico & Fechamentos ({legacyLists.length + returnsHistory.length})
            </button>
          </div>

          {/* CONTEÚDO DAS ABAS DO PERFIL */}

          {/* ABA 1: HISTÓRICO DE ENTREGAS */}
          {profileTab === 'deliveries' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FDFBF7] p-3.5 rounded-xl border border-[#E5DFD5]">
                <p className="text-xs text-[#6B655E]">
                  Exibindo entregas realizadas para <strong>{currentReseller.name}</strong>
                </p>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => setProfileTab('new_delivery')}
                    className="bg-[#7A5C2E] text-white text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova Entrega
                  </Button>
                )}
              </div>

              {isLoadingDeliveries ? (
                <div className="p-12 text-center text-[#8C8275] text-xs">
                  Carregando entregas...
                </div>
              ) : deliveries.length === 0 ? (
                <Card className="border-[#E5DFD5] p-12 text-center bg-white">
                  <FileText className="h-10 w-10 text-[#C6A664] mx-auto mb-3 opacity-60" />
                  <p className="text-base font-semibold text-[#2D2A26]">
                    Nenhuma entrega registrada
                  </p>
                  <p className="text-xs text-[#6B655E] mt-1">
                    {canManage
                      ? 'Registre uma nova entrega para transferir peças do estoque geral para esta revendedora.'
                      : 'Nenhuma entrega foi registrada para você até o momento.'}
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deliveries.map((del) => {
                    const isAccepted = del.status === 'accepted'
                    return (
                      <Card
                        key={del.id}
                        className="border-[#E5DFD5] hover:shadow-md transition-shadow bg-white flex flex-col justify-between"
                      >
                        <CardHeader className="pb-3 border-b border-[#E5DFD5]/60">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#7A5C2E] px-2 py-0.5 rounded bg-[#F3EAD8]">
                              {del.code}
                            </span>
                            <Badge
                              variant={isAccepted ? 'default' : 'secondary'}
                              className={`text-[10px] ${
                                isAccepted
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                  : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isAccepted ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Recebida / Assinada
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Aguardando recebimento
                                </span>
                              )}
                            </Badge>
                          </div>
                          <CardTitle className="font-serif text-base text-[#2D2A26] mt-2 truncate">
                            {currentReseller.name}
                          </CardTitle>
                          <p className="text-[11px] text-[#6B655E]">
                            {formatDateTime(del.created)}
                          </p>
                        </CardHeader>

                        <CardContent className="py-3 text-xs space-y-2 flex-1">
                          <div className="flex justify-between items-center text-[#6B655E]">
                            <span>Total de Peças:</span>
                            <strong className="text-[#2D2A26] font-semibold text-sm">
                              {del.total_items_count} peças
                            </strong>
                          </div>
                          <div className="flex justify-between items-center text-[#6B655E]">
                            <span>Valor Total da Entrega:</span>
                            <strong className="text-[#7A5C2E] font-bold text-sm">
                              {formatCurrency(del.total_value)}
                            </strong>
                          </div>

                          {del.notes && (
                            <p className="text-[11px] text-[#8C8275] bg-[#FDFBF7] p-2 rounded border border-[#E5DFD5]/60 italic truncate">
                              "{del.notes}"
                            </p>
                          )}

                          {del.signature_data && (
                            <div className="pt-2 border-t border-[#E5DFD5]/40 flex items-center justify-between">
                              <span className="text-[10px] text-[#6B655E]">Assinado por:</span>
                              <span className="text-[10px] font-semibold text-[#2D2A26]">
                                {del.signer_name || currentReseller.name}
                              </span>
                            </div>
                          )}
                        </CardContent>

                        <div className="p-3 bg-[#FDFBF7] border-t border-[#E5DFD5] flex items-center justify-between gap-2">
                          {!isAccepted && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSigningDelivery(del)}
                              className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center gap-1 flex-1"
                            >
                              <PenTool className="h-3 w-3" />
                              Assinar Recebimento
                            </Button>
                          )}

                          <Button
                            variant={isAccepted ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setSelectedReceiptDelivery(del)
                              setIsReceiptOpen(true)
                            }}
                            className={`text-xs flex items-center gap-1 ${
                              isAccepted
                                ? 'bg-[#7A5C2E] hover:bg-[#634923] text-white flex-1'
                                : 'border-[#E5DFD5] text-[#2D2A26]'
                            }`}
                          >
                            <FileText className="h-3 w-3" />
                            Comprovante / PDF
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 2: REGISTRAR ENTREGA (ADMIN / OPERADOR) */}
          {profileTab === 'new_delivery' && canManage && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Product Picker from general store inventory */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="border-[#E5DFD5] bg-white">
                  <CardHeader className="pb-3 border-b border-[#E5DFD5]">
                    <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                      <span>Selecionar Joias do Estoque Geral da Loja</span>
                      <span className="text-xs font-normal text-[#6B655E]">
                        Peças saem do geral e entram para {currentReseller.name}
                      </span>
                    </CardTitle>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                      <Input
                        placeholder="Buscar joia por código ou descrição..."
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value)
                          loadAvailableProducts(e.target.value)
                        }}
                        className="pl-9 text-xs"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 max-h-[500px] overflow-y-auto space-y-2">
                    {availableProducts.length === 0 ? (
                      <p className="text-center py-8 text-xs text-[#8C8275]">
                        Nenhum produto disponível em estoque geral no momento.
                      </p>
                    ) : (
                      availableProducts.map((prod) => {
                        const photo =
                          prod.photos && prod.photos.length > 0
                            ? getFileUrl('products', prod.id, prod.photos[0])
                            : null
                        const hasPhoto = Boolean(photo)

                        return (
                          <div
                            key={prod.id}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7] transition-all gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => hasPhoto && handleOpenLightbox(prod)}
                                disabled={!hasPhoto}
                                className={`relative group h-10 w-10 rounded-lg bg-neutral-100 border border-[#E5DFD5] shrink-0 overflow-hidden flex items-center justify-center ${
                                  hasPhoto
                                    ? 'hover:border-[#C6A664] cursor-pointer'
                                    : 'cursor-default'
                                }`}
                                title={hasPhoto ? 'Ampliar foto' : 'Sem foto'}
                              >
                                {photo ? (
                                  <>
                                    <img
                                      src={photo}
                                      alt={prod.description}
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
                                    {prod.code}
                                  </span>
                                  <span className="text-xs font-semibold text-[#2D2A26] truncate">
                                    {prod.description}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[#6B655E] mt-0.5">
                                  <span>
                                    Estoque Geral: <strong>{prod.quantity}</strong> un
                                  </span>
                                  <span>•</span>
                                  <span>
                                    Preço Venda:{' '}
                                    <strong>{formatCurrency(prod.selling_price)}</strong>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddProductToDelivery(prod)}
                              className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] h-8 px-2.5 shrink-0"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Adicionar
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Delivery Basket & Confirmation */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="border-[#E5DFD5] bg-white sticky top-20 shadow-sm">
                  <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                    <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                      <span>Joias na Entrega</span>
                      <Badge variant="outline" className="border-[#C6A664] text-[#7A5C2E]">
                        {totalDeliveryItemsCount} peças
                      </Badge>
                    </CardTitle>
                    <div className="mt-2 text-xs text-[#6B655E]">
                      Destinatária:{' '}
                      <strong className="text-[#2D2A26]">{currentReseller.name}</strong> (
                      {currentReseller.phone || currentReseller.email})
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4">
                    {deliveryItems.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#8C8275]">
                        Nenhuma joia adicionada à entrega ainda. Selecione peças ao lado.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {deliveryItems.map((it) => (
                          <div
                            key={it.product.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]/80 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-[#2D2A26] truncate">
                                {it.product.description}
                              </p>
                              <p className="text-[10px] text-[#6B655E]">
                                {it.product.code} • {formatCurrency(it.selling_price)} un
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max={it.product.quantity}
                                value={it.quantity}
                                onChange={(e) =>
                                  handleUpdateItemQty(
                                    it.product.id,
                                    parseInt(e.target.value, 10) || 1,
                                  )
                                }
                                className="w-12 h-7 text-center rounded border border-[#E5DFD5] text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveDeliveryItem(it.product.id)}
                                className="text-[#B3261E] hover:bg-[#B3261E]/10 p-1 rounded"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Totals Box */}
                    <div className="p-3 bg-[#F3EAD8]/40 rounded-xl border border-[#C6A664]/40 space-y-1.5 text-xs">
                      <div className="flex justify-between text-[#6B655E]">
                        <span>Total de Peças:</span>
                        <strong className="text-[#2D2A26]">{totalDeliveryItemsCount} peças</strong>
                      </div>
                      <div className="flex justify-between text-[#6B655E]">
                        <span>Valor Total da Entrega:</span>
                        <strong className="text-[#7A5C2E] font-bold text-sm">
                          {formatCurrency(totalDeliveryValue)}
                        </strong>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label className="text-xs text-[#6B655E]">Observações da entrega:</Label>
                      <Input
                        placeholder="Ex: Entregue no estojo de veludo, kit inicial..."
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        className="text-xs mt-1"
                      />
                    </div>

                    {/* Touch Signature option right on the delivery form */}
                    <div>
                      {!showSignPadInForm && !deliverySignature && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSignPadInForm(true)}
                          className="w-full border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center justify-center gap-1.5"
                        >
                          <PenTool className="h-3.5 w-3.5" />
                          Coletar Assinatura Touch de Recebimento Agora
                        </Button>
                      )}

                      {showSignPadInForm && !deliverySignature && (
                        <TouchSignaturePad
                          signerName={currentReseller.name}
                          onConfirm={(dataUrl) => {
                            setDeliverySignature(dataUrl)
                            setShowSignPadInForm(false)
                            toast.success('Assinatura registrada!')
                          }}
                          onCancel={() => setShowSignPadInForm(false)}
                        />
                      )}

                      {deliverySignature && (
                        <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-50 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Assinatura capturada</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeliverySignature(null)}
                            className="text-[11px] text-[#B3261E] h-7 px-2"
                          >
                            Trocar
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Submit button */}
                    <Button
                      onClick={handleCreateDelivery}
                      disabled={isSubmittingDelivery || deliveryItems.length === 0}
                      className="w-full bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-10 shadow-sm flex items-center justify-center gap-2"
                    >
                      <ArrowRight className="h-4 w-4" />
                      {isSubmittingDelivery
                        ? 'Transferindo Estoque...'
                        : 'Confirmar Entrega e Baixar do Estoque Geral'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ABA 3: ESTOQUE EM PODER DA REVENDEDORA */}
          {profileTab === 'stock' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FDFBF7] p-4 rounded-xl border border-[#E5DFD5]">
                <div>
                  <h3 className="font-serif font-bold text-sm text-[#2D2A26]">
                    Joias em Poder de {currentReseller.name}
                  </h3>
                  <p className="text-xs text-[#6B655E]">
                    Peças ativas em posse da revendedora prontas para venda pelo PDV dela ou
                    devolução.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold flex-wrap">
                  <span className="text-[#6B655E]">
                    Total de peças:{' '}
                    <strong className="text-[#2D2A26] text-sm">
                      {stockItems.reduce((acc, it) => acc + it.quantity, 0)} un
                    </strong>
                  </span>
                  <span className="text-[#6B655E]">
                    Valor total:{' '}
                    <strong className="text-[#7A5C2E] text-sm">
                      {formatCurrency(
                        stockItems.reduce(
                          (acc, it) =>
                            acc +
                            it.quantity *
                              (it.selling_price || it.expand?.product?.selling_price || 0),
                          0,
                        ),
                      )}
                    </strong>
                  </span>
                </div>
              </div>

              {isLoadingStock ? (
                <div className="p-12 text-center text-[#8C8275] text-xs">
                  Carregando estoque da revendedora...
                </div>
              ) : stockItems.length === 0 ? (
                <Card className="border-[#E5DFD5] p-12 text-center bg-white">
                  <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-3 opacity-60" />
                  <p className="text-base font-semibold text-[#2D2A26]">Nenhuma joia em estoque</p>
                  <p className="text-xs text-[#6B655E] mt-1">
                    Todas as peças foram vendidas ou devolvidas. Realize uma nova entrega para repor
                    o estoque desta revendedora.
                  </p>
                </Card>
              ) : (
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-4">Código</th>
                          <th className="py-3 px-4">Descrição da Joia</th>
                          <th className="py-3 px-4">Tipo / Material</th>
                          <th className="py-3 px-4 text-center">Qtd em Poder</th>
                          <th className="py-3 px-4 text-right">Preço de Venda</th>
                          <th className="py-3 px-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {stockItems.map((item) => {
                          const prod = item.expand?.product
                          const price = item.selling_price || prod?.selling_price || 0
                          return (
                            <tr key={item.id} className="hover:bg-[#FDFBF7]">
                              <td className="py-3 px-4 font-mono font-bold text-[#7A5C2E]">
                                {prod?.code || '—'}
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                                {prod?.description || 'Joia'}
                              </td>
                              <td className="py-3 px-4 text-[#6B655E]">
                                {prod?.expand?.type?.name || '—'} •{' '}
                                {prod?.expand?.material?.name || '—'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-md font-bold bg-[#E8D5A3]/30 text-[#7A5C2E]">
                                  {item.quantity} un
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-[#6B655E]">
                                {formatCurrency(price)}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#2D2A26]">
                                {formatCurrency(price * item.quantity)}
                              </td>
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

          {/* ABA 4: CONFERÊNCIA & DEVOLUÇÕES (ADMIN / OPERADOR) */}
          {profileTab === 'returns' && canManage && (
            <div className="space-y-4">
              <Card className="border-[#E5DFD5] bg-white">
                <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                  <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                    <span>Conferência & Devolução de Joias de {currentReseller.name}</span>
                    <span className="text-xs font-normal text-[#6B655E]">
                      Peças devolvidas voltam ao estoque geral da loja
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {isLoadingStock ? (
                    <div className="py-12 text-center text-xs text-[#8C8275]">
                      Carregando estoque da revendedora...
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
                                Qtd Devolvida (Loja)
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

                                  {/* Motivo */}
                                  <td className="py-3 px-3 bg-amber-50/50">
                                    <select
                                      disabled={(conf.pending_qty || 0) === 0}
                                      value={conf.pending_reason}
                                      onChange={(e) =>
                                        handleItemChange(
                                          it.product,
                                          'pending_reason',
                                          e.target.value,
                                        )
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

                                  {/* Notas */}
                                  <td className="py-3 px-3 bg-amber-50/50">
                                    <input
                                      type="text"
                                      disabled={(conf.pending_qty || 0) === 0}
                                      placeholder="Detalhes..."
                                      value={conf.pending_notes}
                                      onChange={(e) =>
                                        handleItemChange(
                                          it.product,
                                          'pending_notes',
                                          e.target.value,
                                        )
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

                  <div>
                    <Label className="text-xs text-[#6B655E]">
                      Observações gerais da devolução:
                    </Label>
                    <Input
                      placeholder="Ex: Devolução periódica recebida no balcão da loja..."
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      className="text-xs mt-1"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmitReturn}
                      disabled={isSubmittingReturn || stockItems.length === 0}
                      className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-10 px-6 shadow-xs flex items-center gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isSubmittingReturn
                        ? 'Processando Devolução...'
                        : 'Confirmar Devolução e Baixar Estoque'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ABA 5: HISTÓRICO & FECHAMENTOS */}
          {profileTab === 'history_closing' && (
            <div className="space-y-6">
              {/* Resumo Consolidado da Revendedora */}
              <Card className="border-[#E5DFD5] bg-white">
                <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                  <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                    <span>Resumo Consolidado de {currentReseller.name}</span>
                    <Badge variant="outline" className="border-[#7A5C2E] text-[#7A5C2E]">
                      Fechamento & Posição Atual
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-[#6B655E]">
                    Visão sintética das peças entregues, vendidas no PDV, devolvidas e ainda em
                    poder da revendedora.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5]">
                      <p className="text-[11px] text-[#6B655E] uppercase font-semibold">
                        Entregas Feitas
                      </p>
                      <p className="text-xl font-bold font-serif text-[#2D2A26] mt-1">
                        {deliveries.length}
                      </p>
                      <p className="text-[10px] text-[#6B655E]">
                        {deliveries.reduce((acc, d) => acc + (d.total_items_count || 0), 0)} peças
                      </p>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <p className="text-[11px] text-emerald-800 uppercase font-semibold">
                        Devolvidas à Loja
                      </p>
                      <p className="text-xl font-bold font-serif text-emerald-900 mt-1">
                        {returnsHistory.reduce((acc, r) => acc + (r.total_returned_qty || 0), 0)}
                      </p>
                      <p className="text-[10px] text-emerald-700">peças restituídas</p>
                    </div>

                    <div className="p-3 bg-[#F3EAD8]/40 rounded-xl border border-[#C6A664]/50">
                      <p className="text-[11px] text-[#7A5C2E] uppercase font-semibold">
                        Ainda em Posse
                      </p>
                      <p className="text-xl font-bold font-serif text-[#7A5C2E] mt-1">
                        {stockItems.reduce((acc, it) => acc + it.quantity, 0)}
                      </p>
                      <p className="text-[10px] text-[#7A5C2E]">
                        {formatCurrency(
                          stockItems.reduce(
                            (acc, it) =>
                              acc +
                              it.quantity *
                                (it.selling_price || it.expand?.product?.selling_price || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>

                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="text-[11px] text-amber-800 uppercase font-semibold">
                        Pendências / Extravios
                      </p>
                      <p className="text-xl font-bold font-serif text-amber-900 mt-1">
                        {pendingIssuesList.length}
                      </p>
                      <p className="text-[10px] text-amber-700">
                        {formatCurrency(totalPendingDue)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Histórico de Devoluções */}
              {returnsHistory.length > 0 && (
                <Card className="border-[#E5DFD5] bg-white">
                  <CardHeader className="pb-3 border-b border-[#E5DFD5]">
                    <CardTitle className="font-serif text-base text-[#2D2A26]">
                      Conferências de Devolução Registradas ({returnsHistory.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F3EAD8]/50 text-[#7A5C2E] font-semibold border-b border-[#E5DFD5]">
                          <tr>
                            <th className="py-2.5 px-4">Código</th>
                            <th className="py-2.5 px-4">Data</th>
                            <th className="py-2.5 px-4">Revendedora</th>
                            <th className="py-2.5 px-4 text-center">Devolvidas</th>
                            <th className="py-2.5 px-4 text-center">Pendentes</th>
                            <th className="py-2.5 px-4 text-right">Valor Pendente</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DFD5]">
                          {returnsHistory.map((ret) => (
                            <tr key={ret.id} className="hover:bg-[#FDFBF7]">
                              <td className="py-2.5 px-4 font-mono font-bold text-[#7A5C2E]">
                                {ret.code}
                              </td>
                              <td className="py-2.5 px-4 text-[#6B655E]">
                                {formatDateTime(ret.created)}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[#2D2A26]">
                                {currentReseller.name}
                              </td>
                              <td className="py-2.5 px-4 text-center font-bold text-emerald-700">
                                {ret.total_returned_qty} un
                              </td>
                              <td className="py-2.5 px-4 text-center font-bold text-amber-800">
                                {ret.total_pending_qty} un
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-[#7A5C2E]">
                                {formatCurrency(ret.total_pending_value_due)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Histórico Legado Preservado */}
              <Card className="border-[#E5DFD5] bg-white">
                <CardHeader className="pb-3 border-b border-[#E5DFD5]">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-serif text-base text-[#2D2A26]">
                        Histórico Arquivado de Listas Anteriores ({legacyLists.length})
                      </CardTitle>
                      <CardDescription className="text-xs text-[#6B655E]">
                        Dados preservados do modelo anterior. Nenhum registro histórico foi apagado.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-[#6B655E]">
                      Preservado para Auditoria
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {legacyLists.length === 0 ? (
                    <p className="p-6 text-center text-xs text-[#8C8275]">
                      Nenhum registro anterior na base para esta revendedora.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F3EAD8]/40 text-[#7A5C2E] font-semibold border-b border-[#E5DFD5]">
                          <tr>
                            <th className="py-2.5 px-4">Código</th>
                            <th className="py-2.5 px-4">Revendedora</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4">Data</th>
                            <th className="py-2.5 px-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DFD5]">
                          {legacyLists.map((l) => (
                            <tr key={l.id} className="hover:bg-[#FDFBF7]">
                              <td className="py-2.5 px-4 font-mono font-bold text-[#7A5C2E]">
                                {l.code}
                              </td>
                              <td className="py-2.5 px-4 text-[#2D2A26]">{currentReseller.name}</td>
                              <td className="py-2.5 px-4">
                                <Badge variant="secondary" className="text-[10px]">
                                  {l.status}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4 text-[#6B655E]">
                                {formatDate(l.created)}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setActiveContractList(l)
                                    setContractModalOpen(true)
                                  }}
                                  className="h-7 text-xs text-[#7A5C2E]"
                                >
                                  <FileSignature className="h-3 w-3 mr-1" />
                                  Ver Contrato
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Standalone Signature Modal if user clicks 'Assinar Recebimento' */}
      {signingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-md w-full animate-fade-in">
            <TouchSignaturePad
              title={`Assinatura da Entrega ${signingDelivery.code}`}
              description="Confirme o recebimento das joias assinando com o dedo abaixo."
              signerName={currentReseller?.name || user?.name}
              onConfirm={handleSaveSignature}
              onCancel={() => setSigningDelivery(null)}
            />
          </div>
        </div>
      )}

      {/* Delivery Receipt / Print Modal */}
      <DeliveryReceiptModal
        delivery={selectedReceiptDelivery}
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false)
          setSelectedReceiptDelivery(null)
        }}
      />

      {/* Modal de Contrato Legado Preservado */}
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
          canSign={isReseller || canManage}
          onSignedSuccess={() => {
            if (currentReseller) loadLegacyLists(currentReseller.id)
          }}
        />
      )}

      {/* Lightbox Modal */}
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
