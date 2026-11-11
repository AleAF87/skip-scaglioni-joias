import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Users2,
  PackagePlus,
  Percent,
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
  AlertCircle,
  Barcode,
  AlertTriangle,
  Camera,
  Printer,
} from 'lucide-react'
import { isExactCodeMatch, matchesProductQuery } from '@/lib/barcodeSearch'
import { getProductFullName } from '@/types/labelContent'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getFileUrl,
  getProductDisplayPhoto,
} from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchSignaturePad } from '@/components/TouchSignaturePad'
import { DeliveryReceiptModal } from '@/components/DeliveryReceiptModal'
import { SettlementReceiptModal } from '@/components/SettlementReceiptModal'
import { ConsignmentContractModal } from '@/components/ConsignmentContractModal'
import { ImageLightbox } from '@/components/ImageLightbox'
import { ResellerFinancialContent } from '@/pages/ResellerFinancial'
import { ResellerReturnsIssuesContent } from '@/pages/ResellerReturnsAndIssues'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { ResellerDirectCreateModal } from '@/components/resellers/ResellerDirectCreateModal'
import pb from '@/lib/pocketbase/client'
import { getBackendErrorMessage } from '@/lib/backendErrors'
import { getDeliveryDisplayStatus } from '@/lib/deliveryStatus'
import { compressSignatureDataUrl } from '@/lib/signatureCompression'
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

  // Profile Active Tab: 'deliveries' | 'history_closing' | 'financial' | 'returns' (demais abas migradas para modais e botões contextuais)
  const [profileTab, setProfileTab] = useState<
    'deliveries' | 'history_closing' | 'financial' | 'returns'
  >('deliveries')

  // Modais do Perfil
  const [isNewDeliveryModalOpen, setIsNewDeliveryModalOpen] = useState(false)

  // Listener do menu lateral (Layout): item "Nova Entrega" dispara este evento
  // para abrir o modal de nova entrega na revendedora em contexto.
  const openNewDeliveryModal = useCallback(() => {
    if (!currentReseller) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('reseller', currentReseller.id)
      return next
    })
    setIsNewDeliveryModalOpen(true)
  }, [currentReseller, setSearchParams])

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ resellerId?: string }>).detail
      if (detail?.resellerId && detail.resellerId !== currentReseller?.id) return
      openNewDeliveryModal()
    }
    window.addEventListener('scaglioni:open-new-delivery', handler)
    return () => window.removeEventListener('scaglioni:open-new-delivery', handler)
  }, [openNewDeliveryModal, currentReseller?.id])

  const [isStockModalOpen, setIsStockModalOpen] = useState(false)
  const [isConferenceModalOpen, setIsConferenceModalOpen] = useState(false)
  const [isDirectCreateModalOpen, setIsDirectCreateModalOpen] = useState(false)

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

  // Barcode Scanner State - Modal de Entrega
  const [deliveryBarcodeScan, setDeliveryBarcodeScan] = useState('')
  const [deliveryScanAlert, setDeliveryScanAlert] = useState<string | null>(null)
  const [isSearchingDeliveryBarcode, setIsSearchingDeliveryBarcode] = useState(false)
  const deliveryBarcodeInputRef = useRef<HTMLInputElement>(null)
  const [isDeliveryCameraOpen, setIsDeliveryCameraOpen] = useState(false)
  const lastScannedDeliveryCodeRef = useRef<string>('')

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
  // Comissão escolhida pelo admin/superadmin na hora do fechamento (padrão: a da revendedora).
  const [settlementCommission, setSettlementCommission] = useState<number | null>(null)
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [issues, setIssues] = useState<ResellerIssue[]>([])

  // Barcode Scanner State - Modal de Conferência & Devolução
  const [returnBarcodeScan, setReturnBarcodeScan] = useState('')
  const [returnScanAlert, setReturnScanAlert] = useState<string | null>(null)
  const returnBarcodeInputRef = useRef<HTMLInputElement>(null)
  const [isReturnCameraOpen, setIsReturnCameraOpen] = useState(false)
  const lastScannedReturnCodeRef = useRef<string>('')

  // Comprovante de Fechamento / Acerto State
  const [selectedSettlementReceipt, setSelectedSettlementReceipt] = useState<ResellerReturn | null>(
    null,
  )
  const [isSettlementReceiptOpen, setIsSettlementReceiptOpen] = useState(false)

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
    const urls: string[] = []
    if (p.photos && p.photos.length > 0) {
      urls.push(...p.photos.map((ph) => getFileUrl('products', p.id, ph)))
    }
    if (p.image_url && !urls.includes(p.image_url)) {
      urls.push(p.image_url)
    }
    if (urls.length === 0) return
    setLightboxPhotos(urls)
    setLightboxTitle(`${p.code} — ${p.description || p.nome_produto || ''}`)
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
        // Dedup: garante que a mesma revendedora não apareça duas vezes na lista
        // (ex.: registro duplicado ou resposta repetida), evitando keys duplicadas na renderização.
        const seenIds = new Set<string>()
        loadedResellers = loadedResellers.filter((r) => {
          const k = r.id || r.name
          if (seenIds.has(k)) return false
          seenIds.add(k)
          return true
        })
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

  // Navigate into a Reseller profile — abre direto na aba Financeiro & Lucro (pedido do usuário:
  // o conteúdo da antiga página Financeiro agora vive dentro dos dados da revendedora)
  const handleOpenResellerProfile = (reseller: Reseller, action?: 'new_delivery' | 'stock') => {
    setCurrentReseller(reseller)
    setProfileTab('financial')
    if (canManage) {
      setSearchParams({ reseller: reseller.id }, { replace: true })
    }
    if (action === 'new_delivery') {
      setIsNewDeliveryModalOpen(true)
    } else if (action === 'stock') {
      setIsStockModalOpen(true)
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
    setIsNewDeliveryModalOpen(false)
    setIsStockModalOpen(false)
    setIsConferenceModalOpen(false)
    setSearchParams({}, { replace: true })
  }

  // Entregas realizadas (v0.0.152): SOMENTE entregas com peças ainda em aberto
  // (aguardando assinatura ou com peças em posse da revendedora). Entrega 100%
  // devolvida sai desta lista e fica consultável apenas no histórico de
  // devoluções (aba Devolução & Pendências / Histórico & Fechamentos).
  const openDeliveries = useMemo(
    () =>
      deliveries.filter((del) => !getDeliveryDisplayStatus(del, returnsHistory).isFullyReturned),
    [deliveries, returnsHistory],
  )

  // 2. Load context data whenever currentReseller changes with realtime auto-refresh
  useEffect(() => {
    if (!currentReseller?.id) return

    const resellerId = currentReseller.id
    let isMounted = true
    let debounceTimer: any = null

    // Função silenciosa de recarga de contexto da revendedora
    const refreshContextData = async (silent = false) => {
      if (!silent) {
        setIsLoadingDeliveries(true)
        setIsLoadingStock(true)
      }
      try {
        const [dels, items, issuesList, returnsList, legacy] = await Promise.all([
          resellerStockService.getDeliveries({ resellerId }),
          resellerStockService.getResellerStock(resellerId),
          resellerStockService.getIssues({ resellerId }),
          resellerStockService.getReturns({ resellerId }),
          resellerService.getConsignmentLists({ resellerId }),
        ])
        if (!isMounted) return

        setDeliveries(dels)
        setStockItems(items)
        setIssues(issuesList)
        setReturnsHistory(returnsList)
        setLegacyLists(legacy)

        // Atualiza conferenceMap preservando digitação em andamento
        setConferenceMap((prev) => {
          const updated: Record<
            string,
            {
              returned_qty: number
              pending_qty: number
              pending_reason: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
              pending_notes: string
            }
          > = {}
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
      } catch (err) {
        console.error('Erro ao carregar dados da revendedora:', err)
      } finally {
        if (isMounted && !silent) {
          setIsLoadingDeliveries(false)
          setIsLoadingStock(false)
        }
      }
    }

    // Carga inicial
    refreshContextData(false)

    // Debounce leve (350ms) para não recarregar em rajada
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (isMounted) {
          refreshContextData(true)
        }
      }, 350)
    }

    // Subscrição em tempo real para coleções relacionadas à revendedora
    const collectionsToWatch = [
      'reseller_sales',
      'reseller_stock_items',
      'reseller_deliveries',
      'reseller_returns',
      'reseller_issues',
    ]
    let subscriptionsActive = true

    collectionsToWatch.forEach((colName) => {
      try {
        pb.collection(colName)
          .subscribe('*', (e) => {
            const recordReseller = (e.record as any)?.reseller
            if (!recordReseller || recordReseller === resellerId) {
              scheduleRefresh()
            }
          })
          .catch((err) => {
            console.warn(`[Realtime Unified] Erro ao assinar ${colName}:`, err)
          })
      } catch (err) {
        console.warn(`[Realtime Unified] Falha ao iniciar subscribe em ${colName}:`, err)
      }
    })

    // Polling de fallback (a cada 20s)
    const pollInterval = setInterval(() => {
      if (isMounted) {
        refreshContextData(true)
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

  // Mapas derivados para o card de entrega (v0.0.146):
  // - produto por id (para imagem clicável na tabela de itens)
  // - qtde devolvida por produto (somando devoluções completed vinculadas à entrega)
  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    availableProducts.forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p)
    })
    stockItems.forEach((it) => {
      const prod = it.expand?.product
      if (prod && !map.has(prod.id)) map.set(prod.id, prod)
    })
    return map
  }, [availableProducts, stockItems])

  const deliveryReturnedQtyByProduct = useMemo(() => {
    const map = new Map<string, number>()
    for (const ret of returnsHistory) {
      if (ret.status !== 'completed') continue
      for (const item of ret.items || []) {
        map.set(item.product_id, (map.get(item.product_id) || 0) + (item.returned_qty || 0))
      }
    }
    return map
  }, [returnsHistory])

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
    if (currentReseller && isNewDeliveryModalOpen) {
      loadAvailableProducts()
      setDeliveryBarcodeScan('')
      setDeliveryScanAlert(null)
      setIsDeliveryCameraOpen(false)
      lastScannedDeliveryCodeRef.current = ''
      // Auto-foco imediato no leitor de código de barras
      setTimeout(() => {
        deliveryBarcodeInputRef.current?.focus()
      }, 100)
    }
  }, [currentReseller?.id, isNewDeliveryModalOpen])

  useEffect(() => {
    if (currentReseller && isConferenceModalOpen) {
      setReturnBarcodeScan('')
      setReturnScanAlert(null)
      setIsReturnCameraOpen(false)
      lastScannedReturnCodeRef.current = ''
      // Auto-foco imediato no leitor de código de barras
      setTimeout(() => {
        returnBarcodeInputRef.current?.focus()
      }, 100)
    }
  }, [currentReseller?.id, isConferenceModalOpen])

  // Leitura por CÂMERA - Modal de Conferência & Devolução (mesmo modelo do PDV e Nova Entrega:
  // cooldown de 3s, bip, vibração, lanterna e pergunta de duplicado só na câmera)
  const handleReturnCameraScan = async (
    barcode: string,
    options?: { forceDuplicate?: boolean; viaCamera?: boolean },
  ): Promise<boolean | { requiresDuplicateConfirmation: boolean; product?: Product }> => {
    const rawCode = (barcode || '').trim()
    if (!rawCode) return false

    // 1. Tenta resolver via endpoint especializado resolveBarcode
    let foundStockItem: ResellerStockItem | undefined = undefined
    let foundProd: Product | null = null

    try {
      const resolved = await productService.resolveBarcode(rawCode)
      if (resolved && resolved.matched && resolved.product) {
        foundProd = resolved.product as Product
        foundStockItem = stockItems.find(
          (it) =>
            it.product === resolved.product!.id || it.expand?.product?.id === resolved.product!.id,
        )
      } else if (
        resolved &&
        resolved.ambiguous &&
        resolved.variations &&
        resolved.variations.length > 0
      ) {
        toast.info(
          resolved.message ||
            `O código possui variações (${resolved.variations.map((v) => v.variacao).join(', ')}). Especifique a variação.`,
        )
        return false
      }
    } catch {
      /* fallback */
    }

    // 2. Busca nas joias que estão EM PODER desta revendedora (stockItems) por match local
    if (!foundStockItem) {
      foundStockItem = stockItems.find((it) => {
        const prod = it.expand?.product
        return prod && isExactCodeMatch(prod, rawCode)
      })
      if (foundStockItem) {
        foundProd = foundStockItem.expand?.product || null
      }
    }

    if (!foundStockItem && !foundProd) {
      try {
        const res = await productService.getProducts({ search: rawCode, perPage: 10 })
        foundProd = res.items.find((p) => isExactCodeMatch(p, rawCode)) || null
        if (foundProd) {
          foundStockItem = stockItems.find((it) => it.product === foundProd?.id)
        }
      } catch {
        /* ignore */
      }
    }

    if (!foundStockItem || !foundProd) {
      const alertMsg = `ALERTA: A peça código "${rawCode}" NÃO pertence ao estoque em poder de ${currentReseller?.name || 'esta revendedora'}! Não foi entregue a ela.`
      setReturnScanAlert(alertMsg)
      toast.error(`Peça "${rawCode}" não pertence a esta revendedora!`)
      return false
    }

    const prodId = foundStockItem.product
    const currentConf = conferenceMap[prodId] || {
      returned_qty: 0,
      pending_qty: 0,
      pending_reason: 'extraviada',
      pending_notes: '',
    }

    // Pergunta de duplicado: apenas pela câmera caso seja o mesmo código lido repetido ou já tenha retornado > 0
    const alreadyReturned = (currentConf.returned_qty || 0) > 0
    const isSameCodeAsLast = lastScannedReturnCodeRef.current === rawCode
    if (
      (isSameCodeAsLast || alreadyReturned) &&
      !options?.forceDuplicate &&
      options?.viaCamera === true
    ) {
      return { requiresDuplicateConfirmation: true, product: foundProd }
    }

    lastScannedReturnCodeRef.current = rawCode

    const newReturnedQty = (currentConf.returned_qty || 0) + 1
    const totalCount = newReturnedQty + (currentConf.pending_qty || 0)

    if (totalCount > foundStockItem.quantity) {
      setReturnScanAlert(
        `A revendedora possui apenas ${foundStockItem.quantity} unidade(s) de "${foundProd.code}". A quantidade devolvida não pode exceder o saldo em poder.`,
      )
      toast.warning(
        `Saldo máximo em mãos atingido (${foundStockItem.quantity} un) para ${foundProd.code}.`,
      )
      return false
    }

    // Incrementa a quantidade devolvida em 1
    handleItemChange(prodId, 'returned_qty', newReturnedQty)
    toast.success(
      `+1 devolvido: ${foundProd.code} (${newReturnedQty} de ${foundStockItem.quantity} un)`,
    )
    setReturnScanAlert(null)
    return true
  }

  // Leitura por CÂMERA - Modal de Entrega (mesmo modelo do PDV: 3s de cooldown, bip e pergunta de duplicado)
  // onScan pode retornar Promise (consulta ao banco) — o scanner espera o resultado.
  const handleDeliveryCameraScan = async (
    barcode: string,
    options?: { forceDuplicate?: boolean; viaCamera?: boolean },
  ): Promise<boolean | { requiresDuplicateConfirmation: boolean; product?: Product }> => {
    const rawCode = (barcode || '').trim()
    if (!rawCode) return false

    // Já lido agora mesmo (ref, sem depender de re-render): câmera pergunta sobre duplicado
    if (
      lastScannedDeliveryCodeRef.current === rawCode &&
      !options?.forceDuplicate &&
      options?.viaCamera === true
    ) {
      // Reencontra o produto para exibir na pergunta
      const dupProd =
        availableProducts.find((p) => isExactCodeMatch(p, rawCode)) ||
        (await (async () => {
          try {
            const resolved = await productService.resolveBarcode(rawCode)
            if (resolved?.matched && resolved.product) return resolved.product as Product
            const res = await productService.getProducts({ search: rawCode, perPage: 10 })
            return res.items.find((p) => isExactCodeMatch(p, rawCode)) || null
          } catch {
            return null
          }
        })())
      return { requiresDuplicateConfirmation: true, product: dupProd || undefined }
    }

    lastScannedDeliveryCodeRef.current = rawCode
    setDeliveryScanAlert(null)

    // 1. Tenta resolver via endpoint especializado resolveBarcode
    let found: Product | undefined = undefined

    try {
      const resolved = await productService.resolveBarcode(rawCode)
      if (resolved && resolved.matched && resolved.product) {
        found =
          availableProducts.find((p) => p.id === resolved.product!.id) ||
          (resolved.product as Product)
      } else if (
        resolved &&
        resolved.ambiguous &&
        resolved.variations &&
        resolved.variations.length > 0
      ) {
        setDeliveryScanAlert(
          resolved.message ||
            `Código "${rawCode}" possui múltiplas variações (${resolved.variations.map((v) => v.variacao).join(', ')}). Especifique a variação na etiqueta.`,
        )
        return false
      }
    } catch {
      /* fallback */
    }

    // 2. Se não achou via endpoint, tenta na lista em memória (disponíveis carregados)
    if (!found) {
      found = availableProducts.find((p) => isExactCodeMatch(p, rawCode))
    }

    // 3. Se não achar na página atual ou estoque local, busca no banco geral
    if (!found) {
      const res = await productService.getProducts({ search: rawCode, perPage: 10 })
      found = res.items.find((p) => isExactCodeMatch(p, rawCode))
    }

    if (!found) {
      setDeliveryScanAlert(`Código "${rawCode}" não encontrado no cadastro de produtos.`)
      return false
    }

    if (found.quantity <= 0) {
      setDeliveryScanAlert(
        `Peça "${found.code} — ${found.description || found.nome_produto}" sem saldo disponível no estoque geral da loja (0 unidades).`,
      )
      return false
    }

    // Câmera: se o produto já está na lista da entrega, pergunta antes de incluir mais um
    const existingInDelivery = deliveryItems.find((it) => it.product.id === found!.id)
    const currentQtyInBasket = existingInDelivery ? existingInDelivery.quantity : 0
    if (currentQtyInBasket > 0 && !options?.forceDuplicate && options?.viaCamera === true) {
      return { requiresDuplicateConfirmation: true, product: found }
    }

    if (currentQtyInBasket >= found.quantity) {
      setDeliveryScanAlert(
        `Estoque geral da loja possui apenas ${found.quantity} unidade(s) de "${found.code}". Não é possível adicionar mais.`,
      )
      return false
    }

    // Sucesso: adiciona/incrementa em 1
    handleAddProductToDelivery(found)
    setDeliveryScanAlert(null)
    return true
  }

  // Resumo de peças que a revendedora JÁ tem em mãos (consignadas) — exibido no modal Nova Entrega
  const resellerHandQty = stockItems.reduce((acc, it) => acc + it.quantity, 0)
  const resellerHandValue = stockItems.reduce(
    (acc, it) => acc + it.quantity * (it.selling_price || it.expand?.product?.selling_price || 0),
    0,
  )

  // Handler de leitura de código de barras - Modal de Entrega
  const handleDeliveryBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const rawCode = deliveryBarcodeScan.trim()
      if (!rawCode) return

      setDeliveryScanAlert(null)
      setIsSearchingDeliveryBarcode(true)

      try {
        // 1. Tenta resolver via endpoint especializado resolveBarcode (lida com "número variação" e código isolado)
        let found: Product | undefined = undefined

        try {
          const resolved = await productService.resolveBarcode(rawCode)
          if (resolved && resolved.matched && resolved.product) {
            found =
              availableProducts.find((p) => p.id === resolved.product!.id) ||
              (resolved.product as Product)
          } else if (
            resolved &&
            resolved.ambiguous &&
            resolved.variations &&
            resolved.variations.length > 0
          ) {
            setDeliveryScanAlert(
              resolved.message ||
                `Código possui variações (${resolved.variations.map((v) => v.variacao).join(', ')}). Especifique a variação na leitura.`,
            )
            toast.info('Código possui variações. Especifique a variação exata.')
            setDeliveryBarcodeScan('')
            return
          }
        } catch {
          // Fallback para matching local
        }

        // 2. Se não achou via endpoint, tenta na lista em memória (disponíveis carregados)
        if (!found) {
          found = availableProducts.find((p) => isExactCodeMatch(p, rawCode))
        }

        // 3. Se não achar na página atual ou estoque local, busca no banco geral
        if (!found) {
          const res = await productService.getProducts({
            search: rawCode,
            perPage: 10,
          })
          found = res.items.find((p) => isExactCodeMatch(p, rawCode))
        }

        // Se ainda não encontrou nenhuma joia com esse código
        if (!found) {
          setDeliveryScanAlert(`Código "${rawCode}" não encontrado no cadastro de produtos.`)
          toast.error(`Produto "${rawCode}" não encontrado.`)
          setDeliveryBarcodeScan('')
          return
        }

        // Se o produto não possui saldo disponível no estoque geral (sem saldo)
        if (found.quantity <= 0) {
          setDeliveryScanAlert(
            `Peça "${found.code} — ${found.description || found.nome_produto}" sem saldo disponível no estoque geral da loja (0 unidades).`,
          )
          toast.error(`Sem saldo no estoque geral para ${found.code}.`)
          setDeliveryBarcodeScan('')
          return
        }

        // Verifica se a quantidade a adicionar excede o saldo da loja
        const existingInDelivery = deliveryItems.find((it) => it.product.id === found!.id)
        const currentQtyInBasket = existingInDelivery ? existingInDelivery.quantity : 0

        if (currentQtyInBasket >= found.quantity) {
          setDeliveryScanAlert(
            `Estoque geral da loja possui apenas ${found.quantity} unidade(s) de "${found.code}". Não é possível adicionar mais.`,
          )
          toast.warning(`Limite de estoque atingido para ${found.code} (${found.quantity} un).`)
          setDeliveryBarcodeScan('')
          return
        }

        // Sucesso: adiciona/incrementa em 1
        handleAddProductToDelivery(found)
        toast.success(`+1 lido: ${found.code} (${currentQtyInBasket + 1} na entrega)`)
        setDeliveryScanAlert(null)
        setDeliveryBarcodeScan('')
      } catch (err: any) {
        console.error('Erro na leitura de código de barras para entrega:', err)
        setDeliveryScanAlert('Erro ao pesquisar código de barras.')
      } finally {
        setIsSearchingDeliveryBarcode(false)
        // Mantém o input focado para a próxima leitura do leitor físico
        deliveryBarcodeInputRef.current?.focus()
      }
    }
  }

  // Handler de leitura de código de barras - Modal de Conferência & Devolução
  const handleReturnBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const rawCode = returnBarcodeScan.trim()
      if (!rawCode) return

      setReturnScanAlert(null)

      // 1. Tenta resolver via endpoint especializado resolveBarcode
      let foundStockItem: ResellerStockItem | undefined = undefined

      try {
        const resolved = await productService.resolveBarcode(rawCode)
        if (resolved && resolved.matched && resolved.product) {
          foundStockItem = stockItems.find(
            (it) =>
              it.product === resolved.product!.id ||
              it.expand?.product?.id === resolved.product!.id,
          )
        } else if (
          resolved &&
          resolved.ambiguous &&
          resolved.variations &&
          resolved.variations.length > 0
        ) {
          setReturnScanAlert(
            resolved.message ||
              `Código possui variações (${resolved.variations.map((v) => v.variacao).join(', ')}). Especifique a variação.`,
          )
          toast.info('Código possui variações. Especifique a variação.')
          setReturnBarcodeScan('')
          return
        }
      } catch {
        /* fallback */
      }

      // 2. Busca nas joias que estão EM PODER desta revendedora (stockItems)
      if (!foundStockItem) {
        foundStockItem = stockItems.find((it) => {
          const prod = it.expand?.product
          return prod && isExactCodeMatch(prod, rawCode)
        })
      }

      // Regra 4: Se o produto não estiver relacionado à revendedora, exibir alerta destacado
      if (!foundStockItem) {
        setReturnScanAlert(
          `ALERTA: A peça código "${rawCode}" NÃO pertence ao estoque em poder de ${currentReseller?.name || 'esta revendedora'}! Não foi entregue a ela.`,
        )
        toast.error(`Peça "${rawCode}" não pertence a esta revendedora!`)
        setReturnBarcodeScan('')
        return
      }

      const prodId = foundStockItem.product
      const currentConf = conferenceMap[prodId] || {
        returned_qty: 0,
        pending_qty: 0,
        pending_reason: 'extraviada',
        pending_notes: '',
      }

      const newReturnedQty = (currentConf.returned_qty || 0) + 1
      const totalCount = newReturnedQty + (currentConf.pending_qty || 0)

      if (totalCount > foundStockItem.quantity) {
        setReturnScanAlert(
          `A revendedora possui apenas ${foundStockItem.quantity} unidade(s) de "${foundStockItem.expand?.product?.code}". A quantidade devolvida não pode exceder o saldo em poder.`,
        )
        toast.warning(
          `Saldo máximo em mãos atingido (${foundStockItem.quantity} un) para ${foundStockItem.expand?.product?.code}.`,
        )
        setReturnBarcodeScan('')
        return
      }

      // Incrementa a quantidade devolvida em 1
      handleItemChange(prodId, 'returned_qty', newReturnedQty)
      toast.success(
        `+1 devolvido: ${foundStockItem.expand?.product?.code} (${newReturnedQty} de ${foundStockItem.quantity} un)`,
      )
      setReturnScanAlert(null)
      setReturnBarcodeScan('')

      // Mantém o foco no leitor
      returnBarcodeInputRef.current?.focus()
    }
  }

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
      setIsNewDeliveryModalOpen(false)
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

  // Handle standalone sign on pending delivery.
  // A assinatura de recebimento é aceita mesmo em entrega cujas peças já foram
  // totalmente devolvidas (status derivado "Devolvida / Finalizada") — é apenas
  // um registro histórico. Em caso de falha do backend, o erro é capturado aqui
  // e vira um aviso claro em português; NUNCA é relançado — relançar cairia no
  // handler global de erro do app, que mostra "Something went wrong" e desloga
  // o usuário (bug corrigido na 0.0.147).
  const handleSaveSignature = async (dataUrl: string) => {
    if (!signingDelivery || !currentReseller) return
    try {
      // Rede de segurança: comprime a assinatura (largura máx. 400px, JPEG)
      // para que o payload caiba em qualquer limite residual do campo de texto.
      const compressedSignature = await compressSignatureDataUrl(dataUrl)
      await resellerStockService.signDelivery({
        delivery_id: signingDelivery.id,
        signature_data: compressedSignature,
        signer_name: currentReseller.name || user?.name,
      })
      toast.success('Assinatura da entrega confirmada com sucesso!')
      setSigningDelivery(null)
      loadDeliveries(currentReseller.id)
    } catch (err) {
      // Aviso claro em português (não silencioso): o hook responde { error: "..." }
      // e o SDK exibiria "Something went wrong." sem o helper.
      console.error('Erro ao salvar assinatura da entrega:', err)
      toast.error('Não foi possível salvar a assinatura: ' + getBackendErrorMessage(err), {
        duration: 8000,
      })
      // Fecha o pad de assinatura para a tela continuar utilizável; os dados
      // da entrega e o card permanecem como estavam.
      setSigningDelivery(null)
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

    // Comissão usada neste fechamento: a escolhida pelo admin/superadmin nos botões
    // (30% / 35% / 40%) ou, se não escolhida, a taxa cadastrada da revendedora.
    const effectiveCommission = settlementCommission ?? (currentReseller.commission_rate || 40)

    // Fechamento sem vendas e sem pendências: devolução total — nada a acertar.
    const isFullReturnClosing = itemsToProcess.every((it) => it.pending_qty === 0)

    setIsSubmittingReturn(true)
    try {
      const res = await resellerStockService.processReturn({
        reseller_id: currentReseller.id,
        items: itemsToProcess,
        notes: returnNotes,
        commission_rate: effectiveCommission,
        // Rastreio (v0.0.145): devolução fica ligada à entrega em conferência (mais recente em aberto)
        delivery_id: deliveries[0]?.id,
        delivery_code: deliveries[0]?.code,
      })

      if (isFullReturnClosing) {
        const updatedReseller = await resellerService.getResellerById(currentReseller.id)
        if (updatedReseller) setCurrentReseller(updatedReseller)
      }

      if (res.total_pending_value_due > 0) {
        toast.success(
          `Conferência ${res.code} processada com sucesso! ${res.total_returned_qty} peças retornaram ao estoque geral da loja e ${res.total_pending_qty} pendências foram geradas.`,
        )
      } else {
        toast.success(
          `Fechamento ${res.code} concluído: ${res.total_returned_qty} peça(s) devolvida(s) voltaram integralmente ao estoque geral da loja. Nada a acertar com ${currentReseller.name} — nenhuma venda registrada e nenhum valor devido.`,
          { duration: 8000 },
        )
      }
      setReturnNotes('')
      setSettlementCommission(null)
      setIsConferenceModalOpen(false)
      await loadStock(currentReseller.id)
      await loadIssues(currentReseller.id)
      const updatedReturns = await resellerStockService.getReturns({
        resellerId: currentReseller.id,
      })
      setReturnsHistory(updatedReturns)
      if (canManage) {
        const allStock = await resellerStockService.getAllResellerStockItems('')
        setAllStockItems(allStock)
      }

      // TAREFA 2: Comprovante de fechamento abre automaticamente após finalizar com sucesso
      const matchedReturn = updatedReturns.find((r) => r.id === res.return_id)
      const syntheticReturn: ResellerReturn = matchedReturn || {
        id: res.return_id,
        code: res.code,
        reseller: currentReseller.id,
        operator: user?.id,
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
        commission_rate: res.commission_rate ?? effectiveCommission,
        // Rastreio: código real da entrega de origem (numeração pura) vindo do backend
        delivery_code: res.delivery_code || deliveries[0]?.code,
        notes: returnNotes,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        expand: {
          reseller: {
            ...currentReseller,
            commission_rate: effectiveCommission,
          },
          operator: user as any,
        },
      }

      setSelectedSettlementReceipt(syntheticReturn)
      setIsSettlementReceiptOpen(true)
    } catch (err: any) {
      console.error('Erro na devolução:', err)
      toast.error(getBackendErrorMessage(err), { duration: 8000 })
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
    .map((r, idx) => {
      const itemsForR = allStockItems.filter((it) => it.reseller === r.id && it.quantity > 0)
      const piecesCount = itemsForR.reduce((acc, it) => acc + (it.quantity || 0), 0)
      const totalValue = itemsForR.reduce(
        (acc, it) =>
          acc + (it.quantity || 0) * (it.selling_price || it.expand?.product?.selling_price || 0),
        0,
      )
      return {
        reseller: r,
        // Key única e estável: id do registro, reforçado com o índice da lista
        // (proteção extra caso dois registros cheguem com o mesmo id na resposta)
        key: `${r.id || 'sem-id'}-${idx}`,
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

            {/* Apenas admin e superadmin podem cadastrar revendedoras diretamente */}
            {isAdmin && (
              <div className="flex items-center gap-2 self-start sm:self-center">
                <Button
                  onClick={() => setIsDirectCreateModalOpen(true)}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-9 px-4 shadow-sm flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Cadastrar Revendedora
                </Button>
              </div>
            )}
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
                ({ reseller, piecesCount, distinctProducts, totalValue, key }) => (
                  <Card
                    key={key}
                    onClick={() => handleOpenResellerProfile(reseller)}
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
                      <CardTitle className="font-serif text-base font-bold text-[#2D2A26] mt-2 group-hover:text-[#7A5C2E] transition-colors flex items-center justify-between">
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
          {/* Abas internas em botões compactos (sem barra de rolagem); nada acima delas */}
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleBackToOverview}
                aria-label="Voltar para a visão geral"
                className="h-9 w-9 rounded-full border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}

            <button
              onClick={() => setProfileTab('deliveries')}
              className={`h-9 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                profileTab === 'deliveries'
                  ? 'bg-[#7A5C2E] border-[#7A5C2E] text-white shadow-xs'
                  : 'bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Entregas Realizadas
            </button>

            <button
              onClick={() => setProfileTab('history_closing')}
              className={`h-9 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                profileTab === 'history_closing'
                  ? 'bg-[#7A5C2E] border-[#7A5C2E] text-white shadow-xs'
                  : 'bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]'
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Histórico & Fechamentos
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
                  profileTab === 'history_closing'
                    ? 'bg-white text-[#7A5C2E]'
                    : 'bg-[#C6A664] text-black'
                }`}
              >
                {legacyLists.length + returnsHistory.length}
              </span>
            </button>

            <button
              onClick={() => setProfileTab('financial')}
              className={`h-9 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                profileTab === 'financial'
                  ? 'bg-[#7A5C2E] border-[#7A5C2E] text-white shadow-xs'
                  : 'bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Financeiro &amp; Lucro
            </button>

            <button
              onClick={() => setProfileTab('returns')}
              className={`h-9 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                profileTab === 'returns'
                  ? 'bg-[#7A5C2E] border-[#7A5C2E] text-white shadow-xs'
                  : 'bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Devolução &amp; Pendências
            </button>

            {/* Ações rápidas do perfil, à direita das abas */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Link to={`/loja/${currentReseller.id}`} target="_blank">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
                >
                  <Store className="h-3.5 w-3.5" />
                  Loja Virtual
                </Button>
              </Link>

              {canManage && (
                <Button
                  size="sm"
                  onClick={() => setIsNewDeliveryModalOpen(true)}
                  className="h-9 rounded-full bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <PackagePlus className="h-4 w-4" />
                  Nova Entrega
                </Button>
              )}
            </div>
          </div>

          {/* CONTEÚDO DAS ABAS DO PERFIL */}

          {/* ABA 1: HISTÓRICO DE ENTREGAS */}
          {profileTab === 'deliveries' && (
            <div className="space-y-4">
              {isLoadingDeliveries ? (
                <div className="p-12 text-center text-[#8C8275] text-xs">
                  Carregando entregas...
                </div>
              ) : openDeliveries.length === 0 ? (
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
                  {openDeliveries.map((del, idxDel) => {
                    const isAccepted = del.status === 'accepted'
                    const delDisplay = getDeliveryDisplayStatus(del, returnsHistory)
                    const isFullyReturned = delDisplay.isFullyReturned
                    return (
                      <Card
                        key={`${del.id}-${del.code}-${idxDel}`}
                        onClick={() => setIsStockModalOpen(true)}
                        className={`border-[#E5DFD5] hover:border-[#7A5C2E] hover:shadow-md transition-all bg-white flex flex-col justify-between cursor-pointer group ${
                          isFullyReturned ? 'opacity-80' : ''
                        }`}
                      >
                        <CardHeader className="pb-3 border-b border-[#E5DFD5]/60 group-hover:bg-[#FDFBF7] transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#7A5C2E] px-2 py-0.5 rounded bg-[#F3EAD8]">
                              {del.code}
                            </span>
                            <Badge
                              variant={isFullyReturned || isAccepted ? 'default' : 'secondary'}
                              className={`text-[10px] ${
                                isFullyReturned
                                  ? 'bg-slate-200 text-slate-800 hover:bg-slate-200'
                                  : isAccepted
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                    : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isFullyReturned ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> {delDisplay.label}
                                </span>
                              ) : isAccepted ? (
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
                          <CardTitle className="font-serif text-base font-bold text-[#2D2A26] mt-2 flex items-center justify-between">
                            <span>{formatDateTime(del.created)}</span>
                            <ChevronRight className="h-4 w-4 text-[#C6A664] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </CardTitle>
                        </CardHeader>

                        <CardContent className="py-3 text-xs space-y-2 flex-1">
                          <div className="flex justify-between items-center text-[#6B655E]">
                            <span>Total de Peças Entregues:</span>
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
                          {/* Lucro estimado da revendedora: 30% fixo sobre o valor de venda das peças */}
                          <div className="flex justify-between items-center text-[#6B655E]">
                            <span>Valor estimado de lucro (30%):</span>
                            <strong className="text-emerald-700 font-bold text-sm">
                              {formatCurrency(del.total_value * 0.3)}
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

                          {/* Dica de clique para abrir joias em poder */}
                          {!isFullyReturned && (
                            <div className="pt-2 border-t border-[#E5DFD5]/40 flex items-center justify-between text-[11px] text-[#7A5C2E]">
                              <span className="flex items-center gap-1 font-medium">
                                <Boxes className="h-3.5 w-3.5" />
                                Ver joias em poder (
                                {stockItems.reduce((acc, it) => acc + it.quantity, 0)} un)
                              </span>
                              <span className="text-[10px] text-[#6B655E]">
                                Clique para detalhes
                              </span>
                            </div>
                          )}
                          {isFullyReturned && (
                            <div className="pt-2 border-t border-[#E5DFD5]/40 flex items-center justify-between text-[11px] text-slate-500">
                              <span className="flex items-center gap-1 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Todas as peças desta entrega já foram devolvidas
                              </span>
                              <span className="text-[10px] text-[#6B655E]">
                                Clique para detalhes
                              </span>
                            </div>
                          )}
                        </CardContent>

                        <div
                          className="p-3 bg-[#FDFBF7] border-t border-[#E5DFD5] flex items-center justify-between gap-2 flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Botão de Conferência & Devolução DENTRO da entrega em aberto */}
                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsConferenceModalOpen(true)}
                              className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center gap-1 flex-1 min-w-[130px]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Conferência & Devolução
                            </Button>
                          )}

                          {!isAccepted && !isFullyReturned && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSigningDelivery(del)}
                              className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center gap-1 flex-1 min-w-[120px]"
                            >
                              <PenTool className="h-3 w-3" />
                              Assinar
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
                                ? 'bg-[#7A5C2E] hover:bg-[#634923] text-white flex-1 min-w-[110px]'
                                : 'border-[#E5DFD5] text-[#2D2A26] min-w-[110px]'
                            }`}
                          >
                            <FileText className="h-3 w-3" />
                            Comprovante
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 2: HISTÓRICO & FECHAMENTOS */}
          {profileTab === 'history_closing' && (
            <div className="space-y-6">
              {/* Resumo Consolidado da Revendedora */}
              <Card className="border-[#E5DFD5] bg-white">
                <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                  <CardTitle className="font-serif text-base font-bold text-[#2D2A26]">
                    Resumo Consolidado de {currentReseller.name}
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
                        {openDeliveries.length}
                      </p>
                      <p className="text-[10px] text-[#6B655E]">
                        {openDeliveries.reduce((acc, d) => acc + (d.total_items_count || 0), 0)}{' '}
                        peças
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
                    <CardTitle className="font-serif text-base font-bold text-[#2D2A26]">
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
                            <th className="py-2.5 px-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DFD5]">
                          {returnsHistory.map((ret, idxRet) => (
                            <tr
                              key={`${ret.id || 'sem-id'}-${ret.code || 'sem-cod'}-${idxRet}`}
                              className="hover:bg-[#FDFBF7]"
                            >
                              <td className="py-2.5 px-4 font-mono font-bold text-[#7A5C2E]">
                                {ret.code}
                                {ret.delivery_code && (
                                  <p className="font-sans font-normal text-[10px] text-[#6B655E] mt-0.5">
                                    Entrega {ret.delivery_code}
                                  </p>
                                )}
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
                              <td className="py-2.5 px-4 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedSettlementReceipt(ret)
                                    setIsSettlementReceiptOpen(true)
                                  }}
                                  className="h-7 text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center gap-1.5 ml-auto font-medium"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  Comprovante
                                </Button>
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
                      <CardTitle className="font-serif text-base font-bold text-[#2D2A26]">
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
                          {legacyLists.map((l, idxList) => (
                            <tr
                              key={`${l.id || 'sem-id'}-${l.code || 'sem-cod'}-${idxList}`}
                              className="hover:bg-[#FDFBF7]"
                            >
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

          {/* ABA 3: FINANCEIRO & LUCRO — mesmo conteúdo da página Financeiro, já no contexto
              desta revendedora (sem seletor "Revendedora em Foco") */}
          {profileTab === 'financial' && (
            <ResellerFinancialContent reseller={currentReseller} showCatalogButton={false} />
          )}

          {/* ABA 4: DEVOLUÇÃO & PENDÊNCIAS — mesmo conteúdo da página de Devoluções, já no
              contexto desta revendedora (sem seletor "Revendedora em Análise"). A aba interna
              de conferência só aparece para admin/operador. */}
          {profileTab === 'returns' && <ResellerReturnsIssuesContent reseller={currentReseller} />}
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

      {/* Comprovante do Fechamento / Acerto Modal */}
      <SettlementReceiptModal
        settlement={selectedSettlementReceipt}
        resellerNameFallback={currentReseller?.name}
        closedByName={user?.name}
        isOpen={isSettlementReceiptOpen}
        onClose={() => {
          setIsSettlementReceiptOpen(false)
          setSelectedSettlementReceipt(null)
        }}
      />

      {/* Scanner por Câmera no Modal de Conferência & Devolução */}
      {isConferenceModalOpen && isReturnCameraOpen && (
        <BarcodeScannerModal
          isOpen={isReturnCameraOpen}
          onClose={() => setIsReturnCameraOpen(false)}
          onScan={handleReturnCameraScan}
          originTitle={`Devolução — ${currentReseller?.name || 'Revendedora'}`}
          viaCamera
        />
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: NOVA ENTREGA DE JOIAS */}
      {/* ------------------------------------------------------------------- */}
      {currentReseller && (
        <Dialog open={isNewDeliveryModalOpen} onOpenChange={setIsNewDeliveryModalOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-6 bg-white border-[#E5DFD5]">
            <DialogHeader className="pb-3 border-b border-[#E5DFD5]">
              <DialogTitle className="font-serif text-xl font-bold text-[#2D2A26] flex items-center gap-2">
                <PackagePlus className="h-5 w-5" />
                Nova Entrega para {currentReseller.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E]">
                Selecione as joias disponíveis no estoque geral da loja. As peças selecionadas serão
                debitadas do estoque central e creditadas no estoque em poder da revendedora.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              {/* Left Column: Product Picker */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="border-[#E5DFD5] bg-white shadow-xs">
                  <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                    <div className="flex items-center justify-between">
                      <h4 className="font-serif text-base font-bold text-[#2D2A26]">
                        Estoque Geral Disponível
                      </h4>
                      <span className="text-[11px] text-[#6B655E]">
                        {availableProducts.length} itens listados
                      </span>
                    </div>
                    {/* Leitor de Código de Barras (Ativo e Focado por Padrão) */}
                    <div className="mt-2.5 p-2.5 bg-[#F3EAD8]/50 rounded-xl border border-[#C6A664]/60 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5">
                          <Barcode className="h-4 w-4 text-[#7A5C2E]" />
                          Modo Leitor de Código de Barras
                          <span className="text-[10px] font-normal text-[#2E7D4F] bg-emerald-100 px-1.5 py-0.5 rounded">
                            Ativo (Auto-Foco)
                          </span>
                        </Label>
                        <span className="text-[10px] text-[#6B655E]">
                          Cada leitura = +1 na cesta
                        </span>
                      </div>
                      {/* Câmera do celular — mesmo modelo do PDV: leitura sequencial com delay de 3s,
                          contagem regressiva visual, bip e pergunta de produto duplicado (só na câmera) */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsDeliveryCameraOpen(true)}
                        className="w-full h-9 text-xs font-semibold border-[#7A5C2E] text-[#7A5C2E] hover:bg-[#7A5C2E] hover:text-white bg-white flex items-center justify-center gap-1.5"
                      >
                        <Camera className="h-4 w-4" />
                        Ler pela Câmera do Celular
                      </Button>
                      <div className="relative">
                        <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-[#7A5C2E]" />
                        <Input
                          ref={deliveryBarcodeInputRef}
                          placeholder="Escaneie o código de barras com o leitor físico (Enter automático)..."
                          value={deliveryBarcodeScan}
                          onChange={(e) => setDeliveryBarcodeScan(e.target.value)}
                          onKeyDown={handleDeliveryBarcodeKeyDown}
                          disabled={isSearchingDeliveryBarcode}
                          className="pl-9 text-xs bg-white border-[#C6A664] focus-visible:ring-[#7A5C2E] font-mono font-medium h-9"
                        />
                      </div>
                      {deliveryScanAlert && (
                        <div className="p-2 rounded-lg bg-red-100 border border-red-300 text-red-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                          <span>{deliveryScanAlert}</span>
                        </div>
                      )}
                    </div>

                    {/* Resumo: quantas peças a revendedora JÁ tem em mãos antes de consignar mais */}
                    <div className="mt-2.5 flex items-center gap-2.5 p-2.5 rounded-xl border border-[#C6A664]/40 bg-white">
                      <div className="p-2 rounded-lg bg-[#F3EAD8] shrink-0">
                        <Boxes className="h-4 w-4 text-[#7A5C2E]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-[#6B655E] leading-tight">
                          {currentReseller.name} já tem em mãos:
                        </p>
                        <p className="text-xs font-bold text-[#2D2A26] leading-tight mt-0.5">
                          {resellerHandQty} peça{resellerHandQty === 1 ? '' : 's'} em consignação
                          <span className="font-normal text-[#6B655E]">
                            {' '}
                            • {formatCurrency(resellerHandValue)} • {stockItems.length} modelo
                            {stockItems.length === 1 ? '' : 's'}
                          </span>
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] ${
                          resellerHandQty + totalDeliveryItemsCount > 80
                            ? 'border-amber-400 text-amber-700 bg-amber-50'
                            : 'border-[#C6A664] text-[#7A5C2E]'
                        }`}
                      >
                        {resellerHandQty + totalDeliveryItemsCount} peças após esta entrega
                      </Badge>
                    </div>

                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                      <Input
                        placeholder="Ou busque manualmente por código ou descrição..."
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value)
                          loadAvailableProducts(e.target.value)
                        }}
                        className="pl-9 text-xs bg-white"
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="p-3 max-h-[440px] overflow-y-auto space-y-2">
                    {availableProducts.length === 0 ? (
                      <p className="text-center py-8 text-xs text-[#8C8275]">
                        Nenhum produto disponível no estoque geral da loja no momento.
                      </p>
                    ) : (
                      availableProducts.map((prod, idxProd) => {
                        const photo = getProductDisplayPhoto(prod)
                        const hasPhoto = Boolean(photo)

                        return (
                          <div
                            key={`${prod.id || 'sem-id'}-${idxProd}`}
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
                                    Disponível: <strong>{prod.quantity}</strong> un
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
                <Card className="border-[#E5DFD5] bg-white shadow-xs">
                  <CardHeader className="pb-3 border-b border-[#E5DFD5] bg-[#FDFBF7]">
                    <div className="flex items-center justify-between">
                      <h4 className="font-serif text-base font-bold text-[#2D2A26]">
                        Cesta da Entrega
                      </h4>
                      <Badge variant="outline" className="border-[#C6A664] text-[#7A5C2E]">
                        {totalDeliveryItemsCount} peças
                      </Badge>
                    </div>
                    <div className="text-[11px] text-[#6B655E] mt-1 truncate">
                      Destinatária:{' '}
                      <strong className="text-[#2D2A26]">{currentReseller.name}</strong>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4">
                    {deliveryItems.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#8C8275]">
                        Nenhuma joia adicionada à entrega ainda. Selecione peças ao lado.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {deliveryItems.map((it, idxItem) => {
                          const photo = getProductDisplayPhoto(it.product)
                          const hasPhoto = Boolean(photo)
                          const itemSubtotal = it.quantity * it.selling_price

                          return (
                            <div
                              key={`${it.product?.id || 'sem-id'}-${idxItem}`}
                              className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#FDFBF7] border border-[#E5DFD5]/80 text-xs"
                            >
                              {/* Foto do produto */}
                              <button
                                type="button"
                                onClick={() => hasPhoto && handleOpenLightbox(it.product)}
                                disabled={!hasPhoto}
                                className={`relative group h-10 w-10 rounded-lg bg-neutral-100 border border-[#E5DFD5] shrink-0 overflow-hidden flex items-center justify-center ${
                                  hasPhoto
                                    ? 'hover:border-[#C6A664] cursor-pointer'
                                    : 'cursor-default'
                                }`}
                                title={hasPhoto ? 'Ampliar foto' : 'Sem foto'}
                              >
                                {photo ? (
                                  <img
                                    src={photo}
                                    alt={it.product.description || it.product.nome_produto}
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-[#C6A664]" />
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-[#2D2A26] truncate">
                                  {getProductFullName(it.product) ||
                                    it.product.description ||
                                    it.product.nome_produto}
                                </p>
                                <p className="text-[11px] text-[#6B655E] flex items-center gap-2">
                                  <span className="font-mono font-bold text-[#7A5C2E]">
                                    {it.product.code}
                                    {it.product.variacao ? ` — ${it.product.variacao}` : ''}
                                  </span>
                                  <span>•</span>
                                  <span>{formatCurrency(it.selling_price)}/un</span>
                                  <span>•</span>
                                  <span className="font-bold text-[#2D2A26]">
                                    Subtotal: {formatCurrency(itemSubtotal)}
                                  </span>
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
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
                                  className="w-12 h-7 text-center rounded border border-[#E5DFD5] text-xs font-bold bg-white"
                                  title="Quantidade (incrementada a cada leitura)"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDeliveryItem(it.product.id)}
                                  className="text-[#B3261E] hover:bg-[#B3261E]/10 p-1 rounded"
                                  title="Remover da cesta"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Totals Box */}
                    <div className="p-3 bg-[#F3EAD8]/40 rounded-xl border border-[#C6A664]/40 space-y-1 text-xs">
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
          </DialogContent>
        </Dialog>
      )}

      {/* Leitor por câmera do modal Nova Entrega — mesmo componente do PDV (delay 3s, contagem
          regressiva, bip/vibração, lanterna e pergunta de duplicado apenas na câmera) */}
      {isNewDeliveryModalOpen && isDeliveryCameraOpen && (
        <BarcodeScannerModal
          onClose={() => setIsDeliveryCameraOpen(false)}
          onScan={handleDeliveryCameraScan}
          originTitle={`Entrega para ${currentReseller?.name || 'Revendedora'}`}
          viaCamera
        />
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: ESTOQUE EM PODER DA REVENDEDORA (Joias em mãos) */}
      {/* ------------------------------------------------------------------- */}
      {currentReseller && (
        <Dialog open={isStockModalOpen} onOpenChange={setIsStockModalOpen}>
          <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto p-6 bg-white border-[#E5DFD5]">
            <DialogHeader className="pb-3 border-b border-[#E5DFD5]">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <DialogTitle className="font-serif text-xl font-bold text-[#2D2A26] flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-[#7A5C2E]" />
                  Joias em Poder — {currentReseller.name}
                </DialogTitle>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#6B655E]">
                    Total de peças:{' '}
                    <strong className="text-[#2D2A26]">
                      {stockItems.reduce((acc, it) => acc + it.quantity, 0)} un
                    </strong>
                  </span>
                  <span>•</span>
                  <span className="text-[#6B655E]">
                    Valor total:{' '}
                    <strong className="text-[#7A5C2E]">
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
              <DialogDescription className="text-xs text-[#6B655E]">
                Listagem detalhada das joias em posse da revendedora para venda ou devolução, com
                código, quantidade, preço de venda e subtotal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {isLoadingStock ? (
                <div className="p-12 text-center text-[#8C8275] text-xs">
                  Carregando estoque da revendedora...
                </div>
              ) : stockItems.length === 0 ? (
                <div className="border border-[#E5DFD5] p-10 text-center rounded-xl bg-[#FDFBF7]">
                  <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-3 opacity-60" />
                  <p className="text-base font-semibold text-[#2D2A26]">
                    Nenhuma joia em poder desta revendedora
                  </p>
                  <p className="text-xs text-[#6B655E] mt-1">
                    O saldo em mãos dela é zero. Realize uma nova entrega para transferir peças da
                    loja.
                  </p>
                </div>
              ) : (
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-3 w-12 text-center">Foto</th>
                          <th className="py-3 px-4">Código</th>
                          <th className="py-3 px-4">Descrição da Joia</th>
                          <th className="py-3 px-4">Tipo / Material</th>
                          <th className="py-3 px-4 text-center">Quantidade</th>
                          <th className="py-3 px-4 text-right">Preço de Venda</th>
                          <th className="py-3 px-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {stockItems.map((item, idxStock) => {
                          const prod = item.expand?.product
                          const photo = prod ? getProductDisplayPhoto(prod) : null
                          const hasPhoto = Boolean(photo)
                          const price = item.selling_price || prod?.selling_price || 0
                          const subtotal = price * item.quantity
                          return (
                            <tr
                              key={`${item.id || 'sem-id'}-${item.product || 'sem-prod'}-${idxStock}`}
                              className="hover:bg-[#FDFBF7]"
                            >
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => prod && hasPhoto && handleOpenLightbox(prod)}
                                  disabled={!hasPhoto}
                                  className={`relative group h-10 w-10 mx-auto rounded-lg bg-neutral-100 border border-[#E5DFD5] overflow-hidden flex items-center justify-center ${
                                    hasPhoto
                                      ? 'hover:border-[#C6A664] cursor-pointer'
                                      : 'cursor-default'
                                  }`}
                                  title={hasPhoto ? 'Ampliar foto' : 'Sem foto'}
                                >
                                  {photo ? (
                                    <img
                                      src={photo}
                                      alt={prod?.description || prod?.nome_produto || 'Joia'}
                                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                  ) : (
                                    <Package className="h-4 w-4 text-[#C6A664]" />
                                  )}
                                </button>
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-[#7A5C2E]">
                                {prod?.code || '—'}
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                                {prod?.description || prod?.nome_produto || 'Joia'}
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
                                {formatCurrency(subtotal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {canManage && stockItems.length > 0 && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsStockModalOpen(false)
                      setIsConferenceModalOpen(true)
                    }}
                    className="text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Abrir Conferência & Devolução
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 3: CONFERÊNCIA & DEVOLUÇÃO (Dentro da entrega em aberto) */}
      {/* ------------------------------------------------------------------- */}
      {currentReseller && (
        <Dialog open={isConferenceModalOpen} onOpenChange={setIsConferenceModalOpen}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto p-6 bg-white border-[#E5DFD5]">
            <DialogHeader className="pb-3 border-b border-[#E5DFD5]">
              <DialogTitle className="font-serif text-xl font-bold text-[#2D2A26] flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-[#7A5C2E]" />
                Conferência & Devolução de Joias — {currentReseller.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#6B655E]">
                Informe a quantidade de peças que retornam fisicamente ao estoque geral da loja e
                registre eventuais extravios ou pendências com justificativa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Leitor de Código de Barras (Ativo e Focado por Padrão) + Câmera do Celular */}
              <div className="p-3 bg-[#F3EAD8]/50 rounded-xl border border-[#C6A664]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5">
                    <Barcode className="h-4 w-4 text-[#7A5C2E]" />
                    Modo Leitor de Código de Barras — Devolução Física
                    <span className="text-[10px] font-normal text-[#2E7D4F] bg-emerald-100 px-1.5 py-0.5 rounded">
                      Ativo (Auto-Foco)
                    </span>
                  </Label>
                  <span className="text-[10px] text-[#6B655E]">
                    Cada leitura = +1 devolução contada
                  </span>
                </div>

                {/* Opção 1: Ler pela Câmera do Celular (delay 3s, bip, vibração, lanterna, pergunta duplicado) */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReturnCameraOpen(true)}
                  className="w-full h-9 text-xs font-semibold border-[#7A5C2E] text-[#7A5C2E] hover:bg-[#7A5C2E] hover:text-white bg-white flex items-center justify-center gap-1.5"
                >
                  <Camera className="h-4 w-4" />
                  Ler pela Câmera do Celular
                </Button>

                {/* Opção 2: Leitor Físico (Enter automático, instantâneo, sem pergunta) */}
                <div className="relative">
                  <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-[#7A5C2E]" />
                  <Input
                    ref={returnBarcodeInputRef}
                    placeholder="Escaneie a peça com o leitor físico para registrar retorno (Enter automático)..."
                    value={returnBarcodeScan}
                    onChange={(e) => setReturnBarcodeScan(e.target.value)}
                    onKeyDown={handleReturnBarcodeKeyDown}
                    className="pl-9 text-xs bg-white border-[#C6A664] focus-visible:ring-[#7A5C2E] font-mono font-medium h-9"
                  />
                </div>

                {/* Alerta Destacado (Vermelho bem visível se não pertencer à revendedora) */}
                {returnScanAlert && (
                  <div className="p-3 rounded-xl bg-red-600 text-white font-semibold text-xs flex items-center gap-2.5 shadow-md animate-fade-in">
                    <AlertTriangle className="h-5 w-5 text-amber-200 shrink-0" />
                    <div className="flex-1 leading-relaxed">
                      <p className="font-bold uppercase tracking-wider text-[11px] text-amber-200">
                        Atenção — Peça não autorizada
                      </p>
                      <p>{returnScanAlert}</p>
                    </div>
                  </div>
                )}
              </div>

              {isLoadingStock ? (
                <div className="py-12 text-center text-xs text-[#8C8275]">
                  Carregando estoque da revendedora...
                </div>
              ) : stockItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8C8275] border border-[#E5DFD5] rounded-xl bg-[#FDFBF7]">
                  <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Nenhuma joia em poder desta revendedora.
                  </p>
                  <p className="text-xs text-[#6B655E] mt-1">O saldo em mãos dela é zero.</p>
                </div>
              ) : (
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-3 w-12 text-center">Foto</th>
                          <th className="py-3 px-3">Código</th>
                          <th className="py-3 px-3">Descrição da Joia</th>
                          <th className="py-3 px-3 text-right">Preço Venda</th>
                          <th className="py-3 px-3 text-center">Saldo em Mãos</th>
                          <th className="py-3 px-3 text-center bg-emerald-50 text-emerald-800 font-bold">
                            Qtd Devolvida (Lida)
                          </th>
                          <th className="py-3 px-3 text-center bg-amber-50 text-amber-800">
                            Qtd Faltante / Pendente
                          </th>
                          <th className="py-3 px-3 bg-amber-50 text-amber-800">Motivo Pendência</th>
                          <th className="py-3 px-3 bg-amber-50 text-amber-800">
                            Obs / Justificativa
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {stockItems.map((it, idxConf) => {
                          const prod = it.expand?.product
                          const photo = prod ? getProductDisplayPhoto(prod) : null
                          const hasPhoto = Boolean(photo)
                          const conf = conferenceMap[it.product] || {
                            returned_qty: 0,
                            pending_qty: 0,
                            pending_reason: 'extraviada',
                            pending_notes: '',
                          }

                          return (
                            <tr
                              key={`${it.id || 'sem-id'}-${it.product || 'sem-prod'}-${idxConf}`}
                              className={`hover:bg-[#FDFBF7] transition-colors ${
                                (conf.returned_qty || 0) > 0 ? 'bg-emerald-50/30' : ''
                              }`}
                            >
                              {/* Foto da Joia */}
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => prod && hasPhoto && handleOpenLightbox(prod)}
                                  disabled={!hasPhoto}
                                  className={`relative group h-10 w-10 mx-auto rounded-lg bg-neutral-100 border border-[#E5DFD5] overflow-hidden flex items-center justify-center ${
                                    hasPhoto
                                      ? 'hover:border-[#C6A664] cursor-pointer'
                                      : 'cursor-default'
                                  }`}
                                  title={hasPhoto ? 'Ampliar foto' : 'Sem foto'}
                                >
                                  {photo ? (
                                    <img
                                      src={photo}
                                      alt={prod?.description || prod?.nome_produto || 'Joia'}
                                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                  ) : (
                                    <Package className="h-4 w-4 text-[#C6A664]" />
                                  )}
                                </button>
                              </td>

                              <td className="py-3 px-3 font-mono font-bold text-[#7A5C2E]">
                                {prod?.code}
                                {prod?.variacao ? ` — ${prod.variacao}` : ''}
                              </td>
                              <td className="py-3 px-3 font-semibold text-[#2D2A26] max-w-[200px] truncate">
                                {prod
                                  ? getProductFullName(prod) ||
                                    prod.description ||
                                    prod.nome_produto
                                  : 'Joia'}
                              </td>
                              <td className="py-3 px-3 text-right text-[#6B655E]">
                                {formatCurrency(prod?.selling_price || it.selling_price || 0)}
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
                                  title="Contagem lida ou inserida"
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
                                    handleItemChange(it.product, 'pending_reason', e.target.value)
                                  }
                                  className="h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                                >
                                  <option value="extraviada">Extraviada / Perdida</option>
                                  <option value="venda_avulsa_sem_pdv">Venda avulsa sem PDV</option>
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

              <div>
                <Label className="text-xs text-[#6B655E]">Observações gerais da devolução:</Label>
                <Input
                  placeholder="Ex: Devolução periódica recebida no balcão da loja..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              {/* Comissão aplicada neste fechamento — somente Admin/Superadmin podem alterar */}
              {isAdmin && (
                <div className="p-3 rounded-xl bg-[#F3EAD8]/50 border border-[#C6A664]/60">
                  <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5">
                    <Percent className="h-4 w-4 text-[#7A5C2E]" />
                    Comissão aplicada neste fechamento
                  </Label>
                  <p className="text-[10px] text-[#6B655E] mt-0.5 mb-2">
                    Escolha o percentual a ser usado no cálculo deste acerto. Se não escolher, usa a
                    comissão cadastrada da revendedora
                    {typeof currentReseller.commission_rate === 'number'
                      ? ` (${currentReseller.commission_rate}%)`
                      : ''}
                    . A escolha também atualiza a comissão cadastrada dela.
                  </p>
                  <div className="flex gap-2">
                    {[30, 35, 40].map((pct) => {
                      const active =
                        (settlementCommission ?? currentReseller.commission_rate ?? 40) === pct
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setSettlementCommission(pct)}
                          className={`h-9 flex-1 rounded-lg text-xs font-bold border transition-colors ${
                            active
                              ? 'bg-[#7A5C2E] text-white border-[#7A5C2E] shadow-xs'
                              : 'bg-white text-[#7A5C2E] border-[#C6A664] hover:bg-[#7A5C2E]/10'
                          }`}
                        >
                          {pct}%
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5DFD5]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConferenceModalOpen(false)}
                  className="text-xs border-[#E5DFD5]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmitReturn}
                  disabled={isSubmittingReturn || stockItems.length === 0}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-9 px-6 shadow-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSubmittingReturn
                    ? 'Processando Devolução...'
                    : 'Confirmar Devolução e Baixar Estoque'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Cadastro Direto de Revendedora (Admin e Superadmin) */}
      {isAdmin && (
        <ResellerDirectCreateModal
          open={isDirectCreateModalOpen}
          onOpenChange={setIsDirectCreateModalOpen}
          onSuccess={async (newResellerId) => {
            await loadInitial()
            toast.success('Revendedora cadastrada com sucesso e pronta para uso!')
            if (newResellerId) {
              try {
                const created = await resellerService.getResellerById(newResellerId)
                if (created) {
                  handleOpenResellerProfile(created)
                }
              } catch {
                /* se falhar ao abrir direto, lista já estará atualizada */
              }
            }
          }}
        />
      )}
    </div>
  )
}
