Warning: truncated output (original token count: 29096)
Total output lines: 2527

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  ResellerSale,
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
  const { user, isSuperAdmin, isAdmin, isOperator, isReseller } = useAuth()
  const canManage = isAdmin || isOperator
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

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
    navigate('/revendedoras/entrega?reseller=' + encodeURIComponent(currentReseller.id))
  }, [currentReseller, setSearchParams, navigate])

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
  const [isDirectCreateModalOpen, setIsDirectCreateModalOpen] = useState(false)

  // Deliveries List
  const [deliveries, setDeliveries] = useState<ResellerDelivery[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState<boolean>(false)

  // Current reseller stock items
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false)

  // Vendas no PDV da revendedora (usadas no modal Recebidas: seções Vendidas / Reservadas no PDV)
  const [resellerSales, setResellerSales] = useState<ResellerSale[]>([])
  const [contextLoadError, setContextLoadError] = useState<string | null>(null)

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
  // (v0.0.172: o modal antigo de conferência foi removido — o fluxo completo vive
  //  na página dedicada /revendedoras/conferencia, que persiste as devoluções pelo
  //  resellerStockService.processReturn. Estados/funções órfãos foram retirados.)
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [issues, setIssues] = useState<ResellerIssue[]>([])

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
      navigate('/revendedoras/entrega?reseller=' + encodeURIComponent(reseller.id))
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
    setIsNewDeliveryModalOpen(false)
    setIsStockModalOpen(false)
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

  // v0.0.172 — Modal "Recebidas" em 3 seções:
  // Seção 1 "Não Vendidas": posse (stockItems) menos o que já foi vendido/reservado no PDV
  // Seção 2 "Vendidas": itens de reseller_sales com status 'completed'
  // Seção 3 "Reservadas no PDV": itens de reseller_sales com status 'pending'
  // reseller_stock_items já representa a posse atual da revendedora. Vendas concluídas
  // são baixadas desse estoque no PDV; portanto, não devem ser descontadas outra vez aqui.
  const nonSoldStockItems = useMemo(
    () =>
      stockItems
        .filter((item) => item.quantity > 0)
        .map((item) => ({ item, remainingQty: item.quantity })),
    [stockItems],
  )

  const saleRowsByStatus = useMemo(() => {
    const build = (status: 'completed' | 'pending') => {
      const map = new Map<
        string,
        { code: string; description: string; quantity: number; total: number }
      >()
      for (const sale of resellerSales) {
        if (sale.status !== status) continue
        for (const it of sale.items || []) {
          const key = it.product_id || `${it.code}-${it.description}`
          const prev = map.get(key) || {
            code: it.code,
            description: it.description,
            quantity: 0,
            total: 0,
          }
          prev.quantity += it.quantity || 0
          prev.total += it.total || 0
          map.set(key, prev)
        }
      }
      return Array.from(map.values())
    }
    return { sold: build('completed'), reserved: build('pending') }
  }, [resellerSales])

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
      if (isMounted) setContextLoadError(null)
      try {
        const [dels, items, issuesList, returnsList, legacy, salesList] = await Promise.all([
          resellerStockService.getDeliveries({ resellerId }),
          resellerStockService.getResellerStock(resellerId),
          resellerStockService.getIssues({ resellerId }),
          resellerStockService.getReturns({ resellerId }),
          resellerService.getConsignmentLists({ resellerId }),
          resellerStockService.getResellerSales({ resellerId }),
        ])
        if (!isMounted) return

        setDeliveries(dels)
        setStockItems(items)
        setIssues(issuesList)
        setReturnsHistory(returnsList)
        setLegacyLists(legacy)
        setResellerSales(salesList)
      } catch (err) {
        console.error('Erro ao carregar dados da revendedora:', err)
        if (isMounted) {
          setContextLoadError(
            'Não foi possível carregar a posse e as vendas desta revendedora. Verifique a sessão e as permissões de acesso antes de considerar o saldo vazio.',
          )
        }
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

  // Leitura por CÂMERA - Modal de Entrega (mesmo modelo do PDV: 3s de cooldown, bip e pergunta de duplicado)
  // onScan pode retornar Promise (consulta ao banco) — o scanner espera o resultado.
  const handleDeliveryCameraScan = async (
    barcode: string,
    options?: { forceDuplicate?: boolean; viaCamera?: boolean },
  ): Promise<boolean | { requiresDuplicateConfirmation: boolean; product?: Product }> => {
    const rawCode = (barcode || '').trim()
    if (!rawCode) return false
    // A câmera não pode herdar texto de uma leitura manual que falhou.
    setDeliveryBarcodeScan('')

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
        found = {
          ...(availableProducts.find((p) => p.id === resolved.product!.id) || {}),
          ...(resolved.product as Product),
        }
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
            found = {
              ...(availableProducts.find((p) => p.id === resolved.product!.id) || {}),
              ...(resolved.product as Product),
            }
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
    const pendingBalance = returnsHistory.reduce(
      (total, ret) => total + (ret.financial_status !== 'settled' ? ret.balance_due || 0 : 0),
      0,
    )
    if (
      pendingBalance > 0 &&
      !window.confirm(
        `Esta revendedora possui ${formatCurrency(pendingBalance)} em pendências. Deseja iniciar uma nova entrega mesmo assim?`,
      )
    ) {
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
    …9096 tokens truncated…    setSelectedSettlementReceipt(null)
        }}
      />

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
                          className="pl-9 pr-9 text-xs bg-white border-[#C6A664] focus-visible:ring-[#7A5C2E] font-mono font-medium h-9"
                        />
                        {deliveryBarcodeScan && !isSearchingDeliveryBarcode && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryBarcodeScan('')
                              setDeliveryScanAlert(null)
                              deliveryBarcodeInputRef.current?.focus()
                            }}
                            className="absolute right-2 top-1.5 h-6 w-6 rounded-md text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center justify-center"
                            title="Limpar código lido"
                            aria-label="Limpar código lido"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
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
                  Carregando dados da revendedora...
                </div>
              ) : contextLoadError ? (
                <div className="border border-red-200 p-5 text-center rounded-xl bg-red-50">
                  <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-red-800">Falha ao carregar os dados</p>
                  <p className="text-xs text-red-700 mt-1">{contextLoadError}</p>
                </div>
              ) : stockItems.length === 0 && resellerSales.length === 0 ? (
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
                  {/* SEÇÃO 1 — NÃO VENDIDAS (peças em posse que não constam em venda */}
                  {/* completed nem reserva pending do PDV) */}
                  <div className="overflow-x-auto">
                    <p className="px-4 pt-3 pb-2 text-[11px] uppercase font-bold tracking-wide text-[#7A5C2E]">
                      Não Vendidas
                    </p>
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
                        {nonSoldStockItems.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-6 px-4 text-center text-[#8C8275] text-xs"
                            >
                              Nenhuma peça não vendida em posse — todas foram vendidas ou estão
                              reservadas no PDV.
                            </td>
                          </tr>
                        ) : (
                          nonSoldStockItems.map(({ item, remainingQty }, idxStock) => {
                            const prod = item.expand?.product
                            const photo = prod ? getProductDisplayPhoto(prod) : null
                            const hasPhoto = Boolean(photo)
                            const price = item.selling_price || prod?.selling_price || 0
                            const subtotal = price * remainingQty
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
                                    {remainingQty} un
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
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Separador sutil entre as seções */}
                  <hr className="border-t border-[#E5DFD5] my-1" />

                  {/* SEÇÃO 2 — VENDIDAS (vendas completed no PDV da revendedora) */}
                  <div className="overflow-x-auto">
                    <p className="px-4 pt-3 pb-2 text-[11px] uppercase font-bold tracking-wide text-[#2E7D4F]">
                      Vendidas
                    </p>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-emerald-50/70 text-[#2E7D4F] uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-4">Código</th>
                          <th className="py-3 px-4">Joia</th>
                          <th className="py-3 px-4 text-center">Quantidade</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {saleRowsByStatus.sold.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 px-4 text-center text-[#8C8275] text-xs"
                            >
                              Nenhuma venda realizada no PDV desta revendedora.
                            </td>
                          </tr>
                        ) : (
                          saleRowsByStatus.sold.map((row, idxSold) => (
                            <tr
                              key={`vendida-${row.code}-${idxSold}`}
                              className="hover:bg-[#FDFBF7]"
                            >
                              <td className="py-3 px-4 font-mono font-bold text-[#7A5C2E]">
                                {row.code || '—'}
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                                {row.description || 'Joia'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-md font-bold bg-emerald-100/70 text-[#2E7D4F]">
                                  {row.quantity} un
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#2D2A26]">
                                {formatCurrency(row.total)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Separador sutil entre as seções */}
                  <hr className="border-t border-[#E5DFD5] my-1" />

                  {/* SEÇÃO 3 — RESERVADAS NO PDV (vendas pending = reservas em aberto) */}
                  <div className="overflow-x-auto">
                    <p className="px-4 pt-3 pb-2 text-[11px] uppercase font-bold tracking-wide text-amber-700">
                      Reservadas no PDV
                    </p>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-amber-50/70 text-amber-700 uppercase font-semibold border-b border-[#E5DFD5]">
                        <tr>
                          <th className="py-3 px-4">Código</th>
                          <th className="py-3 px-4">Joia</th>
                          <th className="py-3 px-4 text-center">Quantidade</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DFD5]">
                        {saleRowsByStatus.reserved.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 px-4 text-center text-[#8C8275] text-xs"
                            >
                              Nenhuma reserva em aberto no PDV desta revendedora.
                            </td>
                          </tr>
                        ) : (
                          saleRowsByStatus.reserved.map((row, idxRes) => (
                            <tr
                              key={`reservada-${row.code}-${idxRes}`}
                              className="hover:bg-[#FDFBF7]"
                            >
                              <td className="py-3 px-4 font-mono font-bold text-[#7A5C2E]">
                                {row.code || '—'}
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#2D2A26]">
                                {row.description || 'Joia'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-md font-bold bg-amber-100/70 text-amber-700">
                                  {row.quantity} un
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#2D2A26]">
                                {formatCurrency(row.total)}
                              </td>
                            </tr>
                          ))
                        )}
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
                      navigate('/revendedoras/devolucao?reseller=' + currentReseller.id)
                    }}
                    className="text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Abrir Devolução
                  </Button>
                </div>
              )}
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
