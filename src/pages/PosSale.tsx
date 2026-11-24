
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { salesService } from '@/services/salesService'
import { productService } from '@/services/productService'
import { useAuth } from '@/contexts/AuthContext'
import { usePdvGuard } from '@/contexts/PdvGuardContext'
import { useNavigate } from 'react-router-dom'
import { Product, Customer, Sale, SaleItem } from '@/types'
import {
  getProductFullName,
  getProductVariationBadge,
  formatVariationAttributeLabel,
} from '@/types/labelContent'
import {
  fetchResellerStockDetailsMap,
  getProductStockBreakdown,
  ResellerItemDetail,
} from '@/services/totalStockService'
import { getProductBarcodeValue, isExactCodeMatch, matchesProductQuery } from '@/lib/barcodeSearch'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { useMemo } from 'react'
import { filterCustomersLive, getMaskedCustomerLabel } from '@/lib/customerSearch'
import {
  formatCpf,
  formatCurrency,
  formatDateTime,
  formatPhone,
  getFileUrl,
  getProductDisplayPhoto,
  normalizeCurrencyValue,
} from '@/lib/formatters'
import { ImageLightbox } from '@/components/ImageLightbox'
import { LOGO_ICON_URL } from '@/constants/branding'
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
import {
  ShoppingCart,
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  CreditCard,
  Banknote,
  QrCode,
  Clock,
  Printer,
  UserPlus,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  PackageCheck,
  ZoomIn,
  Download,
  Mail,
  Send,
  Undo2,
  Globe,
  Users,
  AlertTriangle,
  Building2,
  PackageSearch,
  ScanLine,
  X,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'

const LEAVE_CONFIRMATION_TEXT = 'deseja realmente sair da página e perder toda a lista'

export interface PosCartItem extends SaleItem {
  cart_item_id?: string
  stock_origin?: 'general' | 'ecommerce' | 'reseller'
  reseller_id?: string
  reseller_name?: string
  photo?: string | null
}

export default function PosSale() {
  const navigate = useNavigate()
  const { isAdmin, isSuperAdmin } = useAuth()
  const canSellFromExternal = isAdmin || isSuperAdmin
  const { setIsCartDirty, registerLeaveHandler } = usePdvGuard()

  // Cart state
  const [cart, setCart] = useState<PosCartItem[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [isScannerArmed, setIsScannerArmed] = useState(true)
  const [isGlobalScanBusy, setIsGlobalScanBusy] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [resellerStockMap, setResellerStockMap] = useState<Map<string, ResellerItemDetail[]>>(
    new Map(),
  )
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')

  // Product Search / Barcode scanner input
  const [barcodeOrSearch, setBarcodeOrSearch] = useState('')
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])

  // Payment & Checkout options
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cash' | 'credit_card' | 'debit_card'>(
    'pix',
  )
  const [installments, setInstallments] = useState<number>(1)
  const [discount, setDiscount] = useState<string>('0')
  const [discountPercent, setDiscountPercent] = useState<string>('0')

  // Pending sales
  const [pendingSales, setPendingSales] = useState<Sale[]>([])
  const [pendingModalOpen, setPendingModalOpen] = useState(false)
  const [activePendingSaleId, setActivePendingSaleId] = useState<string | null>(null)

  // Deletion of pending reservation state
  const [reservationToDelete, setReservationToDelete] = useState<Sale | null>(null)
  const [isDeletingReservation, setIsDeletingReservation] = useState(false)

  // Recent sales / reservations (Últimas compras/reservas)
  const [recentSales, setRecentSales] = useState<Sale[]>([])
  const [loadingRecentSales, setLoadingRecentSales] = useState(false)

  // Dupla confirmação ao sair com carrinho não vazio
  const [leaveModalStep, setLeaveModalStep] = useState<0 | 1 | 2>(0)
  const pendingNavigationActionRef = useRef<(() => void) | null>(null)
  const isNavigatingAwayRef = useRef<boolean>(false)
  const isHandlingPopStateRef = useRef<boolean>(false)

  // Cliente: busca interativa ao vivo
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false)
  const [isNoCustomerFound, setIsNoCustomerFound] = useState(false)
  const customerSearchContainerRef = useRef<HTMLDivElement>(null)

  // Single-screen Flip State: 'products' | 'payment'
  const [activeScreen, setActiveScreen] = useState<'products' | 'payment'>('products')

  // Success Receipt state / modal
  const [completedSale, setCompletedSale] = useState<any | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  // External stock fulfillment reminder modal (produtos a retirar/entregar de ecom/revendedora)
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [fulfillmentItems, setFulfillmentItems] = useState<PosCartItem[]>([])

  // New Customer modal
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustCpf, setNewCustCpf] = useState('')

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const handleOpenLightbox = (p: Product, initialIdx: number = 0) => {
    // Fotos podem vir de duas fontes: galeria local (photos) ou URL externa (image_url,
    // usado pelos produtos importados que chegam com photos vazio). A galeria entra sempre;
    // a image_url é adicionada como extra (mesmo quando há galeria) para não perder nenhuma foto.
    const urls = (p.photos ?? []).map((ph) => getFileUrl('products', p.id, ph))
    if (p.image_url && !urls.includes(p.image_url)) urls.push(p.image_url)
    if (urls.length === 0) return
    setLightboxPhotos(urls)
    setLightboxTitle(`${p.code} — ${p.description}`)
    setLightboxIndex(initialIdx)
    setLightboxOpen(true)
  }

  const [isProcessing, setIsProcessing] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInitialData()
    loadPendingSales()
    loadRecentSales()
  }, [])

  const loadInitialData = async () => {
    try {
      const [prodRes, custRes, resellerMap] = await Promise.all([
        productService.getProducts({ perPage: 500 }),
        salesService.getCustomers(),
        fetchResellerStockDetailsMap(),
      ])
      setProducts(prodRes.items)
      setCustomers(custRes)
      setResellerStockMap(resellerMap)
    } catch (err) {
      console.error(err)
    }
  }

  const loadPendingSales = async () => {
    try {
      const pSales = await salesService.getPendingSales()
      setPendingSales(pSales)
    } catch (err) {
      console.error(err)
    }
  }

  const loadRecentSales = async () => {
    setLoadingRecentSales(true)
    try {
      const res = await salesService.getRecentSalesAndReservations(5)
      setRecentSales(res.items || [])
    } catch (err) {
      console.error('Erro ao carregar últimas compras/reservas:', err)
    } finally {
      setLoadingRecentSales(false)
    }
  }

  // Sincronizar estado sujo do carrinho com o PdvGuardContext e registrar callback de saída
  useEffect(() => {
    setIsCartDirty(cart.length > 0)
    return () => {
      setIsCartDirty(false)
    }
  }, [cart.length, setIsCartDirty])

  useEffect(() => {
    registerLeaveHandler((onConfirm) => {
      pendingNavigationActionRef.current = onConfirm
      setLeaveModalStep(1)
    })
    return () => {
      registerLeaveHandler(null)
    }
  }, [registerLeaveHandler])

  // Interceptar cliques externos em links, navegação do browser (popstate) e beforeunload se o carrinho tiver itens
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault()
        e.returnValue = LEAVE_CONFIRMATION_TEXT
        return LEAVE_CONFIRMATION_TEXT
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Interceptar botão voltar/avançar do navegador quando cart.length > 0
    if (cart.length > 0) {
      // Push dummy state no histórico para que o 'voltar' do browser dispare popstate sem sair imediatamente
      window.history.pushState({ pdvGuard: true }, '')

      const handlePopState = (e: PopStateEvent) => {
        if (isNavigatingAwayRef.current) return

        // Impede que a saída aconteça e volta ao estado do PDV
        window.history.pushState({ pdvGuard: true }, '')
        pendingNavigationActionRef.current = () => {
          isNavigatingAwayRef.current = true
          window.history.go(-2)
        }
        setLeaveModalStep(1)
      }

      window.addEventListener('popstate', handlePopState)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
        window.removeEventListener('popstate', handlePopState)
      }
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [cart.length])

  useEffect(() => {
    // Interceptar cliques globais em links <a> na página se o carrinho tiver itens
    const handleDocumentClick = (e: MouseEvent) => {
      if (cart.length === 0) return
      if (isNavigatingAwayRef.current) return

      const target = e.target as HTMLElement | null
      if (!target) return

      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return

      // Não interceptar links internos de blob ou nova aba
      if (link.getAttribute('href')?.startsWith('blob:')) return
      if (link.target === '_blank') return

      const href = link.getAttribute('href')
      if (!href || href.startsWith('#')) return

      // Se for navegação para a própria tela
      const targetUrl = new URL(link.href, window.location.origin)
      if (
        targetUrl.pathname === window.location.pathname &&
        targetUrl.search === window.location.search
      ) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      pendingNavigationActionRef.current = () => {
        isNavigatingAwayRef.current = true
        if (targetUrl.origin === window.location.origin) {
          navigate(targetUrl.pathname + targetUrl.search + targetUrl.hash)
        } else {
          window.location.href = link.href
        }
      }
      setLeaveModalStep(1)
    }

    document.addEventListener('click', handleDocumentClick, true)

    // Fechar dropdown de clientes ao clicar fora
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        customerSearchContainerRef.current &&
        !customerSearchContainerRef.current.contains(e.target as Node)
      ) {
        setIsCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)

    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [cart.length, navigate])

  const handleCancelLeave = () => {
    setLeaveModalStep(0)
    pendingNavigationActionRef.current = null
  }

  // CLIENTE — campo único de texto livre com lista dropdown filtrada ao vivo.
  // Digita qualquer coisa (nome completo, CPF, e-mail ou telefone/WhatsApp) e os
  // resultados são triados conforme digita; o vínculo com a venda é sempre pelo
  // ID do cliente, nunca por CPF. Campo vazio = Consumidor Final (Sem cadastro).
  const customersReady = customers.length > 0

  const filteredCustomers = useMemo(
    () => filterCustomersLive(customers, customerSearchQuery),
    [customers, customerSearchQuery],
  )

  useEffect(() => {
    // Digitação sem nenhum resultado na lista = sugere cadastrar novo cliente
    setIsNoCustomerFound(
      Boolean(customerSearchQuery.trim()) && customersReady && filteredCustomers.length === 0,
    )
  }, [customerSearchQuery, customersReady, filteredCustomers.length])

  const clearCustomerSelection = () => {
    setCustomerSearchQuery('')
    setSelectedCustomerId('')
    setIsNoCustomerFound(false)
    setIsCustomerDropdownOpen(false)
  }

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id)
    setCustomerSearchQuery(getMaskedCustomerLabel(customer))
    setIsCustomerDropdownOpen(false)
    setIsNoCustomerFound(false)
    barcodeInputRef.current?.focus()
  }

  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsCustomerDropdownOpen(false)
      return
    }
    if (e.key !== 'Enter') return

    e.preventDefault()
    // Enter escolhe o primeiro resultado triado na lista dropdown
    if (filteredCustomers.length > 0) {
      selectCustomer(filteredCustomers[0])
      return
    }
    // Nenhum resultado -> abre o cadastro de novo cliente preenchendo o que foi digitado
    if (customerSearchQuery.trim()) {
      setIsCustomerDropdownOpen(false)
      setNewCustomerModalOpen(true)
    }
  }

  const handleConfirmLeaveStep = () => {
    if (leaveModalStep === 1) {
      // Primeira confirmação aceita -> passa para a SEGUNDA confirmação (mesma pergunta)
      setLeaveModalStep(2)
    } else if (leaveModalStep === 2) {
      // Segunda confirmação aceita -> executa a navegação de fato
      setLeaveModalStep(0)
      setIsCartDirty(false)
      const action = pendingNavigationActionRef.current
      pendingNavigationActionRef.current = null
      if (action) {
        action()
      } else {
        isNavigatingAwayRef.current = true
        navigate(-1)
      }
    }
  }

  // Determina disponibilidade total do produto considerando o perfil do usuário
  const getProductAvailableStock = (p: Product) => {
    const breakdown = getProductStockBreakdown(p, resellerStockMap.get(p.id) || [])
    if (canSellFromExternal) {
      return breakdown.total
    }
    return breakdown.general
  }

  // Handle Search or Barcode Scan
  useEffect(() => {
    const q = barcodeOrSearch.trim()
    if (!q) {
      setFilteredProducts([])
      return
    }

    // Procura matches usando o motor universal de busca de códigos/joias
    // Se for admin/superadmin, inclui produtos com estoque total > 0 (geral, e-commerce ou revendedora)
    // Se for operador/outro, apenas produtos com estoque geral (p.quantity > 0)
    const matches = products.filter((p) => {
      if (!matchesProductQuery(p, q)) return false
      const available = getProductAvailableStock(p)
      return available > 0
    })
    setFilteredProducts(matches.slice(0, 8))
  }, [barcodeOrSearch, products, resellerStockMap, canSellFromExternal])

  // Origem padrão de um item novo no carrinho: sempre o estoque único (unificação).
  // qtde_loja_virtual virou apenas interruptor de publicação (1/0), nunca saldo.
  const resolveDefaultOrigin = (_product: Product) => ({
    origin: 'general' as const,
    reseller_id: undefined,
    reseller_name: undefined,
  })

  // Quantidade máxima disponível para uma origem específica.
  // 'ecommerce' e 'general' caem no mesmo estoque único (quantity).
  const getMaxQtyForOrigin = (
    product: Product,
    origin: 'general' | 'ecommerce' | 'reseller',
    resellerId?: string,
  ): number => {
    if (origin === 'general' || origin === 'ecommerce') {
      return Math.max(0, Number(product.quantity) || 0)
    }
    if (origin === 'reseller') {
      const resellers = resellerStockMap.get(product.id) || []
      if (resellerId) {
        const found = resellers.find((r) => r.reseller_id === resellerId)
        return found ? found.quantity : 0
      }
      return resellers.reduce((acc, r) => acc + r.quantity, 0)
    }
    return 0
  }

  // Add product to cart
  const addToCart = (product: Product) => {
    if (
      !product.selected_variation_id &&
      (product.expand?.['product_variations(product)'] || []).length > 0
    ) {
      toast.info('Este produto possui variações. Leia a etiqueta da variação específica.')
      return
    }
    const available = getProductAvailableStock(product)
    if (available <= 0) {
      toast.error('Produto esgotado no estoque.')
      return
    }

    const defaultSource = resolveDefaultOrigin(product)

    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product_id === product.id && item.variation_id === product.selected_variation_id,
      )
      if (existing) {
        const maxQty = getMaxQtyForOrigin(
          product,
          existing.stock_origin || 'general',
          existing.reseller_id,
        )
        if (existing.quantity >= maxQty) {
          toast.warning(
            `Limite atingido para esta origem (${maxQty} unid). Alterne a origem ou o produto.`,
          )
          return prev
        }
        // Já existe linha do produto: incrementa A LINHA EXISTENTE, mas move-a
        // para a PRIMEIRA posição do carrinho (mais recente no topo).
        return [
          {
            ...existing,
            quantity: existing.quantity + 1,
            total: (existing.quantity + 1) * existing.unit_price,
          },
          ...prev.filter((i) => i !== existing),
        ]
      } else {
        // Novo item entra na PRIMEIRA linha do carrinho (mais recente no topo).
        const fullName = getProductFullName(product, product.selected_variation) || product.description
        return [
          {
            cart_item_id: `${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            product_id: product.id,
            code: getProductBarcodeValue(product),
            variation_id: product.selected_variation_id,
            variation_sku: product.selected_variation_sku,
            description: fullName,
            quantity: 1,
            unit_price: product.selling_price,
            total: product.selling_price,
            stock_origin: defaultSource.origin,
            reseller_id: defaultSource.reseller_id,
            reseller_name: defaultSource.reseller_name,
            photo: getProductDisplayPhoto(product),
          },
          ...prev,
        ]
      }
    })

    setBarcodeOrSearch('')
    barcodeInputRef.current?.focus()
  }

  const updateCartQty = (cartItemKey: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(cartItemKey)
      return
    }

    const cartItem = cart.find((i) => (i.cart_item_id || i.product_id) === cartItemKey)
    const prod = cartItem ? products.find((p) => p.id === cartItem.product_id) : null
    if (prod && cartItem) {
      const maxAvailable = getMaxQtyForOrigin(
        prod,
        cartItem.stock_origin || 'general',
        cartItem.reseller_id,
      )
      if (newQty > maxAvailable) {
        toast.warning(`Apenas ${maxAvailable} unidades disponíveis nesta origem de estoque.`)
        return
      }
    }

    setCart((prev) =>
      prev.map((item) =>
        (item.cart_item_id || item.product_id) === cartItemKey
          ? {
              ...item,
              quantity: newQty,
              total: newQty * item.unit_price,
            }
          : item,
      ),
    )
  }

  const removeFromCart = (cartItemKey: string) => {
    setCart((prev) => prev.filter((item) => (item.cart_item_id || item.product_id) !== cartItemKey))
  }

  // Leitura de código de barras pela câmera (smartphone/webcam)
  // Caso o produto já esteja na lista desta venda e options?.forceDuplicate não seja true,
  // retorna { requiresDuplicateConfirmation: true, product } para que o modal da câmera pergunte ao usuário.
  const handleBarcodeScan = async (
    codigo: string,
    options?: { forceDuplicate?: boolean },
  ): Promise<boolean | { requiresDuplicateConfirmation: boolean; product: Product }> => {
    const raw = (codigo || '').trim()
    if (!raw) return false

    // a) Buscar o produto:
    // 1. Tenta resolver via endpoint especializado resolveBarcode (lida com número+variação e ambiguidade)
    // 2. Se não resolver ou endpoint falhar, cai no match local exato em memória
    let product: Product | undefined = undefined

    try {
      const resolved = await productService.resolveBarcode(raw)
      if (resolved && resolved.matched && resolved.product) {
        // Encontra o produto correspondente no array em memória para ter relations e estoque atualizados
        product = {
          ...(products.find((p) => p.id === resolved.product!.id) || {}),
          ...(resolved.product as Product),
        }
      } else if (
        resolved &&
        resolved.ambiguous &&
        resolved.variations &&
        resolved.variations.length > 0
      ) {
        const readableVariations = resolved.variations
          .map((v) => {
            const rawAttrs = (v as any).attributes
            const attrLabel = rawAttrs ? formatVariationAttributeLabel(rawAttrs) : ''
            return attrLabel || v.variacao || '(sem variação)'
          })
          .join(', ')
        toast.info(
          `O código "${raw}" possui variações (${readableVariations}). Especifique a variação ou selecione na lista.`,
        )
        return false
      }
    } catch {
      // Fallback para casamento exato em memória
    }

    if (!product) {
      const exactMatches = products.filter((p) => isExactCodeMatch(p, raw))
      if (exactMatches.length === 0) {
        // Evita que a próxima leitura seja concatenada ao código inválido anterior.
        setBarcodeOrSearch('')
        toast.error(`Código de barras não cadastrado: "${raw}"`)
        return false
      }
      product = exactMatches[0]
    }

    // b) Validar estoque único (unificação): a venda desconta sempre do estoque único.
    const availableInOrigin = getMaxQtyForOrigin(product, 'general')
    if (availableInOrigin <= 0) {
      toast.error(`Produto sem estoque disponível: ${product.code} - ${product.description}`)
      return false
    }

    // c) Se o produto já está listado na venda atual e não foi explicitamente confirmado pelo modal:
    // Retorna solicitação de confirmação para o scanner de câmera (smartphone)
    const alreadyInCart = cart.some(
      (item) => item.product_id === product.id && item.variation_id === product.selected_variation_id,
    )
    if (alreadyInCart && !options?.forceDuplicate) {
      return {
        requiresDuplicateConfirmation: true,
        product,
      }
    }

    // d) Aprovado -> adicionar UM item à lista com linha individualizada
    const uniqueLineId = `${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const fullName = getProductFullName(product, product.selected_variation) || product.description

    const newItem: PosCartItem = {
      cart_item_id: uniqueLineId,
      product_id: product.id,
      code: getProductBarcodeValue(product),
      variation_id: product.selected_variation_id,
      variation_sku: product.selected_variation_sku,
      description: fullName,
      quantity: 1,
      unit_price: product.selling_price,
      total: product.selling_price,
      stock_origin: 'general',
      reseller_id: undefined,
      reseller_name: undefined,
      photo: getProductDisplayPhoto(product),
    }

    // Novo item entra na PRIMEIRA linha do carrinho (mais recente no topo).
    setCart((prev) => [newItem, ...prev])

    if (alreadyInCart) {
      toast.info(`Código já lido — item adicionado novamente (${product.code})`)
    } else {
      toast.success(`Item adicionado: ${product.code} - ${product.description}`)
    }

    return true
  }

  // Totals
  const subtotal = cart.reduce((acc, item) => acc + item.total, 0)
  const discountVal = Math.max(0, normalizeCurrencyValue(discount) || 0)
  const total = Math.round(Math.max(0, subtotal - discountVal) * 100) / 100
  const installmentValue = Math.round((total / installments) * 100) / 100

  // Sincronização bidirecional de desconto R$ e Percentual
  const isUpdatingDiscountRef = useRef(false)

  const handleDiscountValueChange = (valStr: string) => {
    setDiscount(valStr)
    if (isUpdatingDiscountRef.current) return
    isUpdatingDiscountRef.current = true
    try {
      const numVal = parseFloat(valStr) || 0
      if (subtotal > 0 && numVal >= 0) {
        const pct = (numVal / subtotal) * 100
        setDiscountPercent(pct.toFixed(2).replace(/\.00$/, ''))
      } else {
        setDiscountPercent('0')
      }
    } finally {
      isUpdatingDiscountRef.current = false
    }
  }

  const handleDiscountPercentChange = (pctStr: string) => {
    setDiscountPercent(pctStr)
    if (isUpdatingDiscountRef.current) return
    isUpdatingDiscountRef.current = true
    try {
      const numPct = parseFloat(pctStr) || 0
      if (subtotal > 0 && numPct >= 0) {
        const val = (numPct / 100) * subtotal
        setDiscount(val.toFixed(2))
      } else {
        setDiscount('0')
      }
    } finally {
      isUpdatingDiscountRef.current = false
    }
  }

  // Se o subtotal mudar, recalcula o valor do desconto mantendo o percentual se este foi o foco, ou vice-versa
  useEffect(() => {
    if (isUpdatingDiscountRef.current) return
    const numPct = parseFloat(discountPercent) || 0
    const numVal = parseFloat(discount) || 0
    if (subtotal <= 0) {
      if (discount !== '0') setDiscount('0')
      if (discountPercent !== '0') setDiscountPercent('0')
      return
    }
    if (numPct > 0) {
      const newVal = (numPct / 100) * subtotal
      setDiscount(newVal.toFixed(2))
    } else if (numVal > 0) {
      const newPct = (numVal / subtotal) * 100
      setDiscountPercent(newPct.toFixed(2).replace(/\.00$/, ''))
    }
  }, [subtotal])

  // Key press on Barcode input (Enter triggers exact match addition / scan jump)
  const handleBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = barcodeOrSearch.trim()
      if (!q) return

      // Qualquer leitura (manual ou bipeada) desarma o indicador até o campo ser rearmado
      setIsScannerArmed(false)

      // 1. Tenta resolver via endpoint resolveBarcode (lida com formato "número variação" e código isolado)
      try {
        const resolved = await productService.resolveBarcode(q)
        if (resolved && resolved.matched && resolved.product) {
          const resolvedProd = {
            ...(products.find((p) => p.id === resolved.product!.id) || {}),
            ...(resolved.product as Product),
          }
          const varBadge = getProductVariationBadge(resolvedProd)
          const varSuffix = varBadge ? ' ' + varBadge : ''
          if (getProductAvailableStock(resolvedProd) > 0) {
            addToCart(resolvedProd)
            toast.success(`Joia adicionada: ${resolvedProd.code}${varSuffix}`)
            return
          } else {
            toast.error(`Produto sem estoque disponível: ${resolvedProd.code}${varSuffix}`)
            return
          }
        } else if (
          resolved &&
          resolved.ambiguous &&
          resolved.variations &&
          resolved.variations.length > 0
        ) {
          const readableVariations = resolved.variations
            .map((v) => {
              const rawAttrs = (v as any).attributes
              const attrLabel = rawAttrs ? formatVariationAttributeLabel(rawAttrs) : ''
              return attrLabel || v.variacao || '(sem variação)'
            })
            .join(', ')
          toast.info(
            `O código possui múltiplas variações (${readableVariations}). Selecione na lista ou informe a variação.`,
          )
          return
        }
      } catch {
        // Fallback para matching local
      }

      // 2. Salto no scan exato local em memória: verifica se corresponde exatamente a um único código
      // (numérico ignorando zeros à esquerda, ou SKU do site normalizado Ç->C)
      const exactMatches = products.filter(
        (p) => isExactCodeMatch(p, q) && getProductAvailableStock(p) > 0,
      )
      if (exactMatches.length === 1) {
        addToCart(exactMatches[0])
        toast.success(
          `Joia adicionada: ${exactMatches[0].code || exactMatches[0].sku_novo || exactMatches[0].sku_scaglioni}`,
        )
        return
      }

      // 3. Se houver exatamente 1 produto filtrado na lista
      if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0])
        toast.success(`Joia adicionada: ${filteredProducts[0].code}`)
        return
      }

      if (exactMatches.length > 1) {
        toast.info('Mais de um produto encontrado com este código. Selecione na lista.')
      } else {
        // Código inválido não permanece no campo: a próxima leitura começa limpa.
        setBarcodeOrSearch('')
        toast.info('Nenhuma joia encontrada com esse código de barras exato.')
      }
    }
  }

  // ============================================================
  // Leitor físico de código de barras — captura global da página
  // ============================================================
  // O leitor físico digita o código como um teclado (rajada rápida terminando em
  // Enter) e o vendedor muitas vezes esquece de clicar no campo. Então o PDV
  // escuta o teclado DA PÁGINA INTEIRA: qualquer rajada "impossível para humano"
  // é tratada como leitura de código de barras, mesmo sem foco em campo nenhum.
  // Humanos não digitam tão rápido: intervalo entre teclas <= 60ms e
  // código >= 4 caracteres terminando em Enter, com a rajada inteira em < 1s.
  const barcodeGlobalBufferRef = useRef<{ chars: string; firstAt: number; lastAt: number } | null>(
    null,
  )
  const isGlobalScanBusyRef = useRef(false)

  const processScannedCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return
      if (isGlobalScanBusyRef.current) return
      isGlobalScanBusyRef.current = true
      setIsGlobalScanBusy(true)
      try {
        // Caminho preferencial: resolveBarcode (lida com "número + variação" e ambiguidade)
        try {
          const resolved = await productService.resolveBarcode(code)
          if (resolved && resolved.matched && resolved.product) {
            const resolvedProd = {
              ...(products.find((p) => p.id === resolved.product!.id) || {}),
              ...(resolved.product as Product),
            }
            const varBadge = getProductVariationBadge(resolvedProd)
            const varSuffix = varBadge ? ' ' + varBadge : ''
            if (getProductAvailableStock(resolvedProd) > 0) {
              addToCart(resolvedProd)
              toast.success(`Joia adicionada: ${resolvedProd.code}${varSuffix}`)
              return
            } else {
              toast.error(`Produto sem estoque disponível: ${resolvedProd.code}${varSuffix}`)
              return
            }
          } else if (resolved && resolved.ambiguous && (resolved.variations?.length ?? 0) > 0) {
            const readableVariations = (resolved.variations || [])
              .map((v: any) => {
                const rawAttrs = (v as any).attributes
                const attrLabel = rawAttrs ? formatVariationAttributeLabel(rawAttrs) : ''
                return attrLabel || v.variacao || '(sem variação)'
              })
              .join(', ')
            toast.info(
              `O código possui múltiplas variações (${readableVariations}). Selecione na lista ou informe a variação.`,
            )
            return
          }
        } catch {
          // Fallback para casamento local
        }

        // Casamento exato local (numérico sem zeros à esquerda, SKU normalizado)
        const exactMatches = products.filter(
          (p) => isExactCodeMatch(p, code) && getProductAvailableStock(p) > 0,
        )
        if (exactMatches.length === 1) {
          addToCart(exactMatches[0])
          toast.success(
            `Joia adicionada: ${exactMatches[0].code || exactMatches[0].sku_novo || exactMatches[0].sku_scaglioni}`,
          )
          return
        }
        if (exactMatches.length > 1) {
          toast.info('Mais de um produto encontrado com este código. Selecione na lista.')
          return
        }

        // Último recurso: se a digitação filtrou exatamente 1 produto, adiciona
        if (filteredProducts.length === 1) {
          addToCart(filteredProducts[0])
          toast.success(`Joia adicionada: ${filteredProducts[0].code}`)
          return
        }

        setBarcodeOrSearch('')
        toast.info('Nenhuma joia encontrada com esse código de barras.')
      } finally {
        isGlobalScanBusyRef.current = false
        setIsGlobalScanBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, resellerStockMap, filteredProducts, addToCart],
  )

  useEffect(() => {
    const isTypingInField = () => {
      // Se o foco já está num campo de texto (busca, quantidade, cliente, desconto...),
      // a digitação é humana: não intercepta. O campo de código também não entra aqui,
      // porque ele tem o próprio onKeyDown.
      const active = document.activeElement as HTMLElement | null
      return Boolean(
        active &&
        (active === barcodeInputRef.current ||
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable ||
          active.tagName === 'SELECT'),
      )
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key.length !== 1 && e.key !== 'Enter' && e.key !== 'Tab') return
      if (isTypingInField()) {
        barcodeGlobalBufferRef.current = null
        return
      }

      const now = Date.now()
      const buf = barcodeGlobalBufferRef.current

      // Enter encerra a rajada: se parecer leitura de leitor, processa como código
      if (e.key === 'Enter') {
        if (buf && buf.chars.length >= 4 && now - buf.firstAt < 1000) {
          e.preventDefault()
          e.stopPropagation()
          barcodeGlobalBufferRef.current = null
          setIsScannerArmed(false)
          processScannedCode(buf.chars)
        }
        barcodeGlobalBufferRef.current = null
        return
      }

      if (e.key === 'Tab') {
        barcodeGlobalBufferRef.current = null
        return
      }

      // Caractere comum: só continua buffer se a rajada estiver rápida
      if (!buf) {
        barcodeGlobalBufferRef.current = { chars: e.key, firstAt: now, lastAt: now }
        return
      }
      if (now - buf.lastAt > 60 || now - buf.firstAt >= 1000) {
        barcodeGlobalBufferRef.current = { chars: e.key, firstAt: now, lastAt: now }
        return
      }
      barcodeGlobalBufferRef.current = { ...buf, chars: buf.chars + e.key, lastAt: now }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [processScannedCode])

  // Rearmamento automático: quando o foco sai do campo de escaneamento, ele volta
  // sozinho após ~0,5s — exceto se o usuário estiver digitando ativamente em outro
  // campo (quantidade, cliente, desconto, etc.).
  const rearmTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (isScannerArmed) return

    const scheduleRearm = () => {
      if (rearmTimerRef.current !== null) window.clearTimeout(rearmTimerRef.current)
      rearmTimerRef.current = window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        const userTyping =
          active &&
          active !== barcodeInputRef.current &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        if (!userTyping) {
          barcodeInputRef.current?.focus()
          setIsScannerArmed(true)
        }
        rearmTimerRef.current = null
      }, 500)
    }

    scheduleRearm()

    const handleFocusIn = () => {
      if (!isScannerArmed) scheduleRearm()
    }
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      if (rearmTimerRef.current !== null) window.clearTimeout(rearmTimerRef.current)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [isScannerArmed])

  // Mantém o campo sempre focado quando a tela do PDV fica pronta (armado por padrão)
  useEffect(() => {
    if (!isScannerArmed) return
    const timer = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null
      const userTyping =
        active &&
        active !== barcodeInputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (!userTyping) barcodeInputRef.current?.focus()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [isScannerArmed])

  // Save as Pending Sale / Reserva
  const handleSavePending = async () => {
    if (cart.length === 0) {
      toast.error('O carrinho está vazio.')
      return
    }

    if (!selectedCustomerId) {
      toast.error(
        'Reserva exige cliente selecionado com cadastro. Não é permitido reservar para "Consumidor Final (Sem cadastro)".',
      )
      return
    }

    try {
      await salesService.savePendingSale({
        customer_id: selectedCustomerId,
        items: cart,
        subtotal,
        discount: discountVal,
        total,
        payment_method: paymentMethod,
        installments,
        sale_id: activePendingSaleId || undefined,
      })

      toast.success('Reserva / Venda a prazo salva com sucesso! O estoque NÃO foi alterado.')
      resetSaleForm()
      loadPendingSales()
      loadRecentSales()
    } catch (err: any) {
      toast.error('Erro ao salvar reserva pendente: ' + (err.message || ''))
    }
  }

  // Delete Pending Reservation with safe confirmation
  const handleConfirmDeleteReservation = async () => {
    if (!reservationToDelete) return
    const target = reservationToDelete
    setIsDeletingReservation(true)
    try {
      await salesService.deleteSale(target.id)
      toast.success(`Reserva ${target.code} excluída com sucesso!`)

      // Se a venda excluída estava sendo editada no carrinho, resetar o ID pendente ativo
      if (activePendingSaleId === target.id) {
        setActivePendingSaleId(null)
      }

      // Atualiza o estado local imediatamente
      setPendingSales((prev) => prev.filter((s) => s.id !== target.id))
      setRecentSales((prev) => prev.filter((s) => s.id !== target.id))

      // Fecha o diálogo de confirmação
      setReservationToDelete(null)

      // Recarrega do servidor em background
      loadPendingSales()
      loadRecentSales()
    } catch (err: any) {
      console.error('Erro ao excluir reserva:', err)
      const msg = err?.data?.message || err?.message || 'Falha ao excluir a reserva.'
      toast.error('Erro ao excluir reserva: ' + msg)
    } finally {
      setIsDeletingReservation(false)
    }
  }

  // Resume Pending Sale
  const handleResumePending = (pSale: Sale) => {
    try {
      const items = Array.isArray(pSale.items)
        ? pSale.items
        : JSON.parse((pSale.items as any) || '[]')
      setCart(items)
      setSelect…9313 tokens truncated…          </Label>
                        <Input
                          id="disc"
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(e) => handleDiscountValueChange(e.target.value)}
                          className="w-24 h-8 text-right font-semibold text-xs border-[#E5DFD5]"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="discPct" className="text-xs text-[#6B655E]">
                          Desconto (%):
                        </Label>
                        <Input
                          id="discPct"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={discountPercent}
                          onChange={(e) => handleDiscountPercentChange(e.target.value)}
                          className="w-24 h-8 text-right font-semibold text-xs border-[#E5DFD5]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline pt-2">
                      <span className="font-serif text-base font-bold text-[#2D2A26]">
                        Total a Pagar:
                      </span>
                      <span className="font-serif text-2xl font-bold text-[#7A5C2E]">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>

                  {/* Botões do Checkout: Apenas ícones lado a lado para Pagamento e Fiado (salvar pendente) */}
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-[#6B655E] uppercase tracking-wider text-center">
                      Ações de Checkout
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Botão com ÍCONE DE PAGAMENTO (sem texto) */}
                      <Button
                        type="button"
                        onClick={() => {
                          if (cart.length === 0) {
                            toast.warning('Adicione produtos antes de prosseguir para o pagamento.')
                            return
                          }
                          setActiveScreen('payment')
                        }}
                        disabled={cart.length === 0}
                        title="Prosseguir para Pagamento (Cartão / Pix / Dinheiro)"
                        className="h-14 bg-[#2E7D4F] hover:bg-[#256640] text-white flex items-center justify-center rounded-xl shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <CreditCard className="h-7 w-7" />
                      </Button>

                      {/* Botão com ÍCONE DE FIADO / PENDENTE / RESERVA (sem texto) */}
                      <Button
                        type="button"
                        onClick={handleSavePending}
                        disabled={cart.length === 0}
                        title={
                          !selectedCustomerId
                            ? 'Reserva bloqueada: selecione um cliente cadastrado para reservar'
                            : 'Venda a Prazo / Reserva (Salvar como Pendente sem baixar estoque)'
                        }
                        variant="outline"
                        className={`h-14 border-2 flex items-center justify-center rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] ${
                          !selectedCustomerId
                            ? 'border-[#E5DFD5] text-[#8C8275] bg-[#FDFBF7] cursor-not-allowed opacity-75'
                            : 'border-[#B26A00] text-[#B26A00] hover:bg-[#B26A00]/10'
                        }`}
                      >
                        <Clock className="h-7 w-7" />
                      </Button>
                    </div>

                    <p className="text-[10px] text-[#6B655E] text-center pt-0.5">
                      <span className="font-medium text-[#2E7D4F]">Pagamento</span> ou{' '}
                      <span className="font-medium text-[#B26A00]">Reserva / Venda a Prazo</span>
                    </p>

                    {!selectedCustomerId && (
                      <p className="text-[10px] text-[#B3261E] bg-[#B3261E]/5 p-1.5 rounded border border-[#B3261E]/20 text-center">
                        ⚠️ <strong>Reserva exige cliente:</strong> selecione um cliente cadastrado
                        para habilitar a reserva.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Bloco: Últimas compras/reservas (mais recente primeiro) */}
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardHeader className="p-3 pb-2 border-b border-[#E5DFD5]">
                  <CardTitle className="font-serif text-xs font-bold text-[#2D2A26] flex items-center justify-between">
                    <span>Últimas compras/reservas</span>
                    <Badge variant="outline" className="text-[10px] font-normal text-[#6B655E]">
                      {recentSales.length} mais recentes
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                  {loadingRecentSales ? (
                    <p className="text-xs text-[#8C8275] text-center py-2">Carregando...</p>
                  ) : recentSales.length === 0 ? (
                    <p className="text-xs text-[#8C8275] text-center py-2">
                      Nenhuma venda ou reserva registrada ainda.
                    </p>
                  ) : (
                    <div className="space-y-2 divide-y divide-[#E5DFD5]/60">
                      {recentSales.map((sale) => {
                        const isPending = sale.status === 'pending'
                        const isCancelled = sale.status === 'cancelled'
                        const custName =
                          sale.expand?.customer?.name ||
                          (sale.customer ? 'Cliente cadastrado' : 'Consumidor Final')

                        return (
                          <div
                            key={sale.id}
                            className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[#7A5C2E] text-[11px]">
                                  {sale.code}
                                </span>
                                <Badge
                                  className={`text-[9px] px-1 py-0 h-4 ${
                                    isPending
                                      ? 'bg-[#FEF3C7] text-[#B26A00] border border-[#B26A00]/30'
                                      : isCancelled
                                        ? 'bg-[#FEE2E2] text-[#B3261E] border border-[#B3261E]/30'
                                        : 'bg-[#DCFCE7] text-[#15803D] border border-[#15803D]/30'
                                  }`}
                                >
                                  {isPending ? 'Reserva' : isCancelled ? 'Cancelada' : 'Venda'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[#2D2A26] font-medium truncate mt-0.5">
                                {custName}
                              </p>
                              <p className="text-[10px] text-[#8C8275]">
                                {formatDateTime(sale.created)}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-bold text-[#2D2A26] block">
                                {formatCurrency(sale.total)}
                              </span>
                              {isPending && (
                                <div className="flex items-center justify-end gap-2 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => setReservationToDelete(sale)}
                                    title="Excluir reserva"
                                    className="p-1 text-[#8C8275] hover:text-[#B3261E] hover:bg-[#FEE2E2]/60 rounded transition-colors"
                                    aria-label="Excluir reserva"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResumePending(sale)}
                                    className="text-[10px] text-[#7A5C2E] hover:underline font-semibold"
                                  >
                                    Retomar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* LADO B: Tela de Pagamento com efeito 'virar página' no mesmo container */}
        <div
          className={`transition-all duration-500 ease-in-out ${
            activeScreen === 'payment'
              ? 'opacity-100 scale-100 translate-x-0 relative z-10 pointer-events-auto'
              : 'opacity-0 scale-95 translate-x-full absolute inset-0 z-0 pointer-events-none'
          }`}
        >
          <div className="max-w-3xl mx-auto space-y-4 bg-white p-5 rounded-2xl border border-[#E5DFD5] shadow-sm">
            {/* Cabeçalho da tela de pagamento com botão para VOLTAR À LISTA DOS PRODUTOS */}
            <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveScreen('products')}
                  className="border-[#7A5C2E] text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center gap-1.5 text-xs font-semibold h-9"
                >
                  <Undo2 className="h-4 w-4" />
                  <span>Voltar aos Produtos (Editar Carrinho)</span>
                </Button>
              </div>

              <div className="text-right">
                <span className="text-xs text-[#6B655E]">Total a Pagar:</span>
                <span className="font-serif text-xl font-bold text-[#7A5C2E] block">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {/* Resumo dos Itens editáveis se desejar voltar */}
            <div className="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-[#2D2A26] block">
                  {cart.length} itens no carrinho ({cart.reduce((acc, it) => acc + it.quantity, 0)}{' '}
                  unidades)
                </span>
                <span className="text-[#6B655E]">
                  Cliente:{' '}
                  {customers.find((c) => c.id === selectedCustomerId)?.name || 'Consumidor Final'}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActiveScreen('products')}
                className="text-xs text-[#7A5C2E] hover:underline"
              >
                Alterar itens / quantidades
              </Button>
            </div>

            {/* Forma de Pagamento */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider block">
                Escolha a Forma de Pagamento *
              </Label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('pix')
                    setInstallments(1)
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all text-xs font-semibold ${
                    paymentMethod === 'pix'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/15 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <QrCode className="h-6 w-6" />
                  <span>Pix</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('credit_card')
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all text-xs font-semibold ${
                    paymentMethod === 'credit_card'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/15 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <CreditCard className="h-6 w-6" />
                  <span>Cartão Crédito</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('debit_card')
                    setInstallments(1)
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all text-xs font-semibold ${
                    paymentMethod === 'debit_card'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/15 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <CreditCard className="h-6 w-6" />
                  <span>Cartão Débito</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('cash')
                    setInstallments(1)
                  }}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all text-xs font-semibold ${
                    paymentMethod === 'cash'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/15 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <Banknote className="h-6 w-6" />
                  <span>Dinheiro</span>
                </button>
              </div>

              {/* Opções de Parcelamento no Cartão */}
              {paymentMethod === 'credit_card' && (
                <div className="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] space-y-2 mt-2">
                  <Label className="text-xs font-semibold text-[#2D2A26] flex items-center justify-between">
                    <span>Parcelamento no Cartão de Crédito:</span>
                    <span className="text-[#7A5C2E] font-bold">
                      {installments}x de {formatCurrency(installmentValue)}
                    </span>
                  </Label>
                  <select
                    value={installments}
                    onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                    className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-[#C6A664]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                      const val = Math.round((total / num) * 100) / 100
                      return (
                        <option key={num} value={num}>
                          {num}x de {formatCurrency(val)} {num === 1 ? '(À vista)' : 'sem juros'}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Ações Finais na tela de pagamento */}
            <div className="pt-4 border-t border-[#E5DFD5] flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveScreen('products')}
                className="w-full sm:w-auto border-[#E5DFD5] text-[#6B655E] text-xs h-11"
              >
                <Undo2 className="h-4 w-4 mr-1.5" />
                Voltar e Modificar Produtos
              </Button>

              <Button
                type="button"
                onClick={handleCompleteSale}
                disabled={isProcessing || cart.length === 0}
                className="w-full sm:w-auto px-8 h-12 bg-[#2E7D4F] hover:bg-[#256640] text-white font-bold text-base shadow-md"
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                {isProcessing
                  ? 'Concluindo Venda...'
                  : `Confirmar Pagamento (${formatCurrency(total)})`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Sales Modal */}
      <Dialog open={pendingModalOpen} onOpenChange={setPendingModalOpen}>
        <DialogContent className="max-w-2xl bg-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#2D2A26]">
              Vendas Salvas como Pendentes
            </DialogTitle>
            <CardDescription className="text-sm text-[#6B655E]">
              Essas vendas foram salvas e não afetaram o estoque. Escolha uma para retomar e
              concluir.
            </CardDescription>
          </DialogHeader>

          <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden mt-3">
            {pendingSales.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#6B655E]">
                Nenhuma venda pendente no momento.
              </p>
            ) : (
              pendingSales.map((ps) => (
                <div
                  key={ps.id}
                  className="p-4 flex items-center justify-between hover:bg-[#FDFBF7]"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-[#7A5C2E] block">
                      {ps.code}
                    </span>
                    <p className="text-sm font-semibold text-[#2D2A26]">
                      {ps.expand?.customer?.name || 'Consumidor Final'}
                    </p>
                    <p className="text-xs text-[#6B655E] mt-0.5">
                      {formatDateTime(ps.created)} • {ps.payment_method}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="font-serif font-bold text-base text-[#2D2A26]">
                      {formatCurrency(ps.total)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setReservationToDelete(ps)}
                      title="Excluir reserva"
                      className="h-9 w-9 min-w-9 text-[#8C8275] hover:text-[#B3261E] hover:bg-[#FEE2E2]/60 rounded-lg transition-colors"
                      aria-label="Excluir reserva"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleResumePending(ps)}
                      className="bg-[#7A5C2E] text-white h-9"
                    >
                      Retomar <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale Receipt Modal (Printable) */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-md bg-white p-6">
          <DialogHeader className="print:hidden">
            <DialogTitle className="font-serif text-center text-xl text-[#2D2A26]">
              Comprovante de Venda
            </DialogTitle>
          </DialogHeader>

          {completedSale && (
            <div className="receipt-print-area space-y-4 text-xs font-mono border border-dashed border-[#E5DFD5] p-5 rounded-xl bg-[#FFFFFF]">
              <div className="text-center pb-2 border-b border-[#2D2A26]/30">
                <div className="flex justify-center mb-1">
                  <div className="bg-black p-1.5 rounded-lg inline-block">
                    <img
                      src={LOGO_ICON_URL}
                      alt="Scaglioni Joias"
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                </div>
                <h2 className="font-serif text-base font-bold uppercase tracking-wider text-[#2D2A26]">
                  Scaglioni Joias
                </h2>
                <p className="text-[10px] text-[#6B655E]">ALTA JOALHERIA & CONIGNAÇÃO</p>
                <p className="text-[10px] text-[#6B655E]">São Paulo - SP</p>
                <div className="mt-2 text-[10px] text-[#2D2A26]">
                  <span>
                    Venda: <strong>{completedSale.code}</strong>
                  </span>
                  <br />
                  <span>Data: {formatDateTime(completedSale.date)}</span>
                </div>
              </div>

              {completedSale.customer && (
                <div className="pb-2 border-b border-[#2D2A26]/20">
                  <p>
                    <strong>Cliente:</strong> {completedSale.customer.name}
                  </p>
                  {completedSale.customer.phone && (
                    <p>
                      <strong>Telefone:</strong> {completedSale.customer.phone}
                    </p>
                  )}
                </div>
              )}

              {/* Items List sem truncamento, descrição completa */}
              <div className="space-y-1 pb-2 border-b border-[#2D2A26]/20">
                {completedSale.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="whitespace-normal break-words flex-1">
                      {item.quantity}x {item.description}
                    </span>
                    <span className="shrink-0">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-right">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(completedSale.subtotal)}</span>
                </div>
                {completedSale.discount > 0 && (
                  <div className="flex justify-between text-[#B3261E]">
                    <span>Desconto:</span>
                    <span>- {formatCurrency(completedSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-[#2D2A26]/20">
                  <span>TOTAL:</span>
                  <span>{formatCurrency(completedSale.total)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-[#6B655E]">
                  <span>Pagamento:</span>
                  <span className="uppercase">
                    {completedSale.payment_method}{' '}
                    {completedSale.installments > 1 ? `(${completedSale.installments}x)` : ''}
                  </span>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-[#2D2A26]/20 text-[10px] text-[#6B655E]">
                <p>Obrigado pela preferência!</p>
                <p>Garantia de autenticidade Scaglioni Joias.</p>
              </div>
            </div>
          )}

          {/* Tela de pós-venda: imprimir, salvar (download) e enviar comprovante por e-mail */}
          <div className="print:hidden space-y-3 mt-2">
            {/* Campo de e-mail do cliente + botão de envio */}
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#7A5C2E] shrink-0" />
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="E-mail do cliente para enviar o comprovante..."
                className="text-xs border-[#E5DFD5] flex-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Imprimir Comprovante */}
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="border-[#2D2A26] text-[#2D2A26] text-xs h-10"
              >
                <Printer className="h-4 w-4 mr-1.5" /> Imprimir
              </Button>

              {/* Salvar / Download Comprovante */}
              <Button
                variant="outline"
                onClick={handleDownloadReceipt}
                className="border-[#7A5C2E] text-[#7A5C2E] text-xs h-10"
              >
                <Download className="h-4 w-4 mr-1.5" /> Salvar
              </Button>

              {/* Enviar Comprovante por e-mail */}
              <Button
                onClick={handleSendEmailReceipt}
                disabled={isSendingEmail}
                className="bg-[#2E7D4F] hover:bg-[#256640] text-white text-xs h-10"
              >
                <Send className="h-4 w-4 mr-1.5" /> {isSendingEmail ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>

            <Button
              onClick={() => {
                setReceiptModalOpen(false)
                setCompletedSale(null)
              }}
              className="w-full bg-[#2D2A26] hover:bg-[#1F1D1A] text-white text-xs h-10"
            >
              Concluir e Iniciar Nova Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer Modal */}
      <Dialog open={newCustomerModalOpen} onOpenChange={setNewCustomerModalOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-[#2D2A26]">
              Cadastrar Novo Cliente
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateCustomer} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                required
                placeholder="Ex: Luiza Andrade"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
                <Input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  CPF <span className="text-[#8C8275] font-normal">(Opcional)</span>
                </Label>
                <Input
                  value={newCustCpf}
                  onChange={(e) => setNewCustCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">
                E-mail <span className="text-[#8C8275] font-normal">(Opcional)</span>
              </Label>
              <Input
                type="email"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                placeholder="luiza@exemplo.com"
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setNewCustomerModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#7A5C2E] text-white">
                Salvar Cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reminder Modal: Produtos a Retirar / Entregar (E-commerce / Revendedoras) */}
      <Dialog open={reminderModalOpen} onOpenChange={setReminderModalOpen}>
        <DialogContent className="max-w-lg bg-white border border-[#E5DFD5] shadow-xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-[#B26A00] mb-1">
              <span className="p-2 rounded-xl bg-[#FEF3C7] text-[#B26A00]">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <DialogTitle className="font-serif text-xl text-[#2D2A26]">
                  Atenção: Produto(s) a Retirar / Entregar
                </DialogTitle>
                <CardDescription className="text-xs text-[#6B655E]">
                  Esta venda utilizou estoque fora da loja física. Providencie a separação ou
                  coleta:
                </CardDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-[#FEF3C7] bg-[#FFFBEB] p-3 text-xs text-[#92400E] leading-relaxed">
              <strong>Lembrete de Separação:</strong> Os itens listados abaixo foram baixados do
              estoque ou do mostruário de uma revendedora. Não se esqueça de recolher a peça para
              entregar ao cliente ou regularizar a entrega.
            </div>

            <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto">
              {fulfillmentItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 flex items-start justify-between gap-3 hover:bg-[#FDFBF7]"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                        {item.code}
                      </span>
                      <span className="font-bold text-xs text-[#2D2A26]">
                        {item.quantity} {item.quantity > 1 ? 'unidades' : 'unidade'}
                      </span>
                    </div>
                    <p className="text-xs text-[#2D2A26] line-clamp-2">{item.description}</p>
                    <div className="pt-0.5">
                      {item.stock_origin === 'reseller' && (
                        <Badge className="bg-[#FEF3C7] text-[#B26A00] border border-[#B26A00]/30 text-[10px] font-semibold flex items-center gap-1 w-fit">
                          <Users className="h-3 w-3" />
                          <span>
                            Pegar de volta da revendedora:{' '}
                            <strong>{item.reseller_name || 'Designada'}</strong>
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={() => {
                setReminderModalOpen(false)
                setReceiptModalOpen(true)
              }}
              className="w-full bg-[#7A5C2E] hover:bg-[#634A24] text-white text-xs h-10 font-semibold"
            >
              <PackageSearch className="h-4 w-4 mr-1.5" />
              Entendido! Ver Comprovante de Venda
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

      {/* Modal de Confirmação para Excluir Reserva Pendente */}
      <Dialog
        open={Boolean(reservationToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingReservation) {
            setReservationToDelete(null)
          }
        }}
      >
        <DialogContent className="max-w-md bg-white border border-[#E5DFD5] shadow-xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 text-[#B3261E] mb-1">
              <span className="p-2.5 rounded-2xl bg-[#B3261E]/10 text-[#B3261E]">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-serif text-lg text-[#2D2A26]">
                  Excluir reserva pendente?
                </DialogTitle>
                <p className="text-xs text-[#8C8275]">Esta ação não pode ser desfeita</p>
              </div>
            </div>
          </DialogHeader>

          {reservationToDelete && (
            <div className="py-2 space-y-3">
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[#7A5C2E]">
                    {reservationToDelete.code}
                  </span>
                  <Badge className="bg-[#FEF3C7] text-[#B26A00] border border-[#B26A00]/30 text-[10px] px-1.5 py-0 h-4">
                    Reserva
                  </Badge>
                </div>
                <p className="text-[#2D2A26] font-medium">
                  <strong>Cliente:</strong>{' '}
                  {reservationToDelete.expand?.customer?.name ||
                    (reservationToDelete.customer ? 'Cliente cadastrado' : 'Consumidor Final')}
                </p>
                <div className="flex items-center justify-between text-[#6B655E] pt-1">
                  <span>Data: {formatDateTime(reservationToDelete.created)}</span>
                  <span className="font-bold text-[#2D2A26]">
                    {formatCurrency(reservationToDelete.total)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#6B655E]">
                Como esta reserva ainda está pendente, o estoque não foi baixado e não haverá
                impacto nas quantidades das peças. Tem certeza que deseja remover esta reserva?
              </p>
            </div>
          )}

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingReservation}
              onClick={() => setReservationToDelete(null)}
              className="w-full sm:w-auto border-[#7A5C2E] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs h-10 font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isDeletingReservation}
              onClick={handleConfirmDeleteReservation}
              className="w-full sm:w-auto bg-[#B3261E] hover:bg-[#8F1E18] text-white text-xs h-10 font-semibold"
            >
              {isDeletingReservation ? 'Excluindo...' : 'Sim, excluir reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Dupla Confirmação ao sair da tela com itens no carrinho */}
      <Dialog
        open={leaveModalStep !== 0}
        onOpenChange={(open) => {
          if (!open) handleCancelLeave()
        }}
      >
        <DialogContent className="max-w-md bg-white border-2 border-[#B3261E]/40 shadow-xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 text-[#B3261E] mb-2">
              <span className="p-2.5 rounded-2xl bg-[#B3261E]/10 text-[#B3261E]">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <DialogTitle className="font-serif text-lg text-[#2D2A26]">
                  {leaveModalStep === 1
                    ? 'Atenção: Carrinho com itens!'
                    : 'Confirmação final obrigatória'}
                </DialogTitle>
                <p className="text-xs text-[#8C8275]">Etapa {leaveModalStep} de 2 de confirmação</p>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <p className="text-sm font-semibold text-[#2D2A26] bg-[#FDFBF7] p-3 rounded-xl border border-[#E5DFD5]">
              {leaveModalStep === 1
                ? 'deseja realmente sair da página e perder toda a lista'
                : 'deseja realmente sair da página e perder toda a lista'}
            </p>

            <p className="text-xs text-[#6B655E]">
              Existem <strong>{cart.length} produto(s)</strong> no seu carrinho de venda atual. Se
              você sair agora, todos os itens adicionados serão perdidos.
            </p>
          </div>

          <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelLeave}
              className="w-full sm:w-auto border-[#7A5C2E] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs h-10 font-semibold"
            >
              Não, quero continuar na venda
            </Button>
            <Button
              type="button"
              onClick={handleConfirmLeaveStep}
              className="w-full sm:w-auto bg-[#B3261E] hover:bg-[#8F1E18] text-white text-xs h-10 font-semibold"
            >
              {leaveModalStep === 1
                ? 'Sim, entendi (1ª confirmação)'
                : 'Sim, confirmo e quero sair'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leitor de código de barras pela câmera com leitura contínua */}
      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={handleBarcodeScan}
          originTitle="Estoque único da loja"
        />
      )}
    </div>
  )
}
