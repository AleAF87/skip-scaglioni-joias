import React, { useState, useEffect, useRef } from 'react'
import { salesService } from '@/services/salesService'
import { productService } from '@/services/productService'
import { useAuth } from '@/contexts/AuthContext'
import { Product, Customer, Sale, SaleItem } from '@/types'
import {
  fetchResellerStockDetailsMap,
  getProductStockBreakdown,
  ResellerItemDetail,
} from '@/services/totalStockService'
import { isExactCodeMatch, matchesProductQuery } from '@/lib/barcodeSearch'
import {
  formatCurrency,
  formatDateTime,
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
} from 'lucide-react'
import { toast } from 'sonner'

export interface PosCartItem extends SaleItem {
  stock_origin?: 'general' | 'ecommerce' | 'reseller'
  reseller_id?: string
  reseller_name?: string
}

export default function PosSale() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const canSellFromExternal = isAdmin || isSuperAdmin

  // Cart state
  const [cart, setCart] = useState<PosCartItem[]>([])
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

  // Pending sales
  const [pendingSales, setPendingSales] = useState<Sale[]>([])
  const [pendingModalOpen, setPendingModalOpen] = useState(false)
  const [activePendingSaleId, setActivePendingSaleId] = useState<string | null>(null)

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

  const [isProcessing, setIsProcessing] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInitialData()
    loadPendingSales()
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

  // Determina a melhor origem padrão de estoque para um item adicionado ao carrinho
  const resolveDefaultOrigin = (
    product: Product,
  ): {
    origin: 'general' | 'ecommerce' | 'reseller'
    reseller_id?: string
    reseller_name?: string
  } => {
    const general = Number(product.quantity) || 0
    const ecom = Number(product.qtde_loja_virtual) || 0
    const resellers = resellerStockMap.get(product.id) || []

    if (general > 0) {
      return { origin: 'general' }
    }
    if (canSellFromExternal) {
      if (ecom > 0) {
        return { origin: 'ecommerce' }
      }
      if (resellers.length > 0) {
        return {
          origin: 'reseller',
          reseller_id: resellers[0].reseller_id,
          reseller_name: resellers[0].reseller_name,
        }
      }
    }
    return { origin: 'general' }
  }

  // Quantidade máxima disponível para uma origem específica
  const getMaxQtyForOrigin = (
    product: Product,
    origin: 'general' | 'ecommerce' | 'reseller',
    resellerId?: string,
  ): number => {
    if (origin === 'general') {
      return Math.max(0, Number(product.quantity) || 0)
    }
    if (origin === 'ecommerce') {
      return Math.max(0, Number(product.qtde_loja_virtual) || 0)
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
    const available = getProductAvailableStock(product)
    if (available <= 0) {
      toast.error('Produto esgotado no estoque.')
      return
    }

    const defaultSource = resolveDefaultOrigin(product)

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id)
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
        return prev.map((item) =>
          item.product_id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * item.unit_price,
              }
            : item,
        )
      } else {
        return [
          ...prev,
          {
            product_id: product.id,
            code: product.code,
            description: product.description,
            quantity: 1,
            unit_price: product.selling_price,
            total: product.selling_price,
            stock_origin: defaultSource.origin,
            reseller_id: defaultSource.reseller_id,
            reseller_name: defaultSource.reseller_name,
          },
        ]
      }
    })

    setBarcodeOrSearch('')
    barcodeInputRef.current?.focus()
  }

  const updateCartItemOrigin = (
    productId: string,
    origin: 'general' | 'ecommerce' | 'reseller',
    resellerId?: string,
    resellerName?: string,
  ) => {
    const prod = products.find((p) => p.id === productId)
    if (!prod) return

    const maxAvailable = getMaxQtyForOrigin(prod, origin, resellerId)
    if (maxAvailable <= 0) {
      toast.warning('Esta origem não possui unidades disponíveis para esta joia.')
      return
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item
        const newQty = Math.min(item.quantity, maxAvailable)
        return {
          ...item,
          stock_origin: origin,
          reseller_id: resellerId,
          reseller_name: resellerName,
          quantity: newQty,
          total: newQty * item.unit_price,
        }
      }),
    )
  }

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }

    const prod = products.find((p) => p.id === productId)
    const cartItem = cart.find((i) => i.product_id === productId)
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
        item.product_id === productId
          ? {
              ...item,
              quantity: newQty,
              total: newQty * item.unit_price,
            }
          : item,
      ),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId))
  }

  // Totals
  const subtotal = cart.reduce((acc, item) => acc + item.total, 0)
  const discountVal = Math.max(0, normalizeCurrencyValue(discount) || 0)
  const total = Math.round(Math.max(0, subtotal - discountVal) * 100) / 100
  const installmentValue = Math.round((total / installments) * 100) / 100

  // Key press on Barcode input (Enter triggers exact match addition / scan jump)
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = barcodeOrSearch.trim()
      if (!q) return

      // 1. Salto no scan exato: verifica se corresponde exatamente a um único código
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

      // 2. Se houver exatamente 1 produto filtrado na lista
      if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0])
        toast.success(`Joia adicionada: ${filteredProducts[0].code}`)
        return
      }

      if (exactMatches.length > 1) {
        toast.info('Mais de um produto encontrado com este código. Selecione na lista.')
      } else {
        toast.info('Nenhuma joia encontrada com esse código de barras exato.')
      }
    }
  }

  // Save as Pending Sale
  const handleSavePending = async () => {
    if (cart.length === 0) {
      toast.error('O carrinho está vazio.')
      return
    }

    try {
      await salesService.savePendingSale({
        customer_id: selectedCustomerId || undefined,
        items: cart,
        subtotal,
        discount: discountVal,
        total,
        payment_method: paymentMethod,
        installments,
        sale_id: activePendingSaleId || undefined,
      })

      toast.success('Venda salva como pendente! O estoque NÃO foi alterado.')
      resetSaleForm()
      loadPendingSales()
    } catch (err: any) {
      toast.error('Erro ao salvar venda pendente: ' + (err.message || ''))
    }
  }

  // Resume Pending Sale
  const handleResumePending = (pSale: Sale) => {
    try {
      const items = Array.isArray(pSale.items)
        ? pSale.items
        : JSON.parse((pSale.items as any) || '[]')
      setCart(items)
      setSelectedCustomerId(pSale.customer || '')
      setPaymentMethod(pSale.payment_method || 'pix')
      setInstallments(pSale.installments || 1)
      setDiscount(pSale.discount ? pSale.discount.toString() : '0')
      setActivePendingSaleId(pSale.id)
      setPendingModalOpen(false)
      toast.info(`Venda retomada: ${pSale.code}`)
    } catch (err) {
      toast.error('Erro ao ler itens da venda pendente.')
    }
  }

  // Complete Checkout (Atomic backend execution)
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      toast.error('Adicione pelo menos um item ao carrinho.')
      return
    }

    setIsProcessing(true)
    try {
      const itemsToCheckout = cart.map((item) => ({
        product_id: item.product_id,
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        stock_origin: item.stock_origin || 'general',
        reseller_id: item.reseller_id || undefined,
        reseller_name: item.reseller_name || undefined,
      }))

      const result = await salesService.checkout({
        customer_id: selectedCustomerId || undefined,
        items: itemsToCheckout,
        discount: discountVal,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : 1,
        sale_id: activePendingSaleId || undefined,
      })

      const cust = customers.find((c) => c.id === selectedCustomerId)
      const currentCart = [...cart]

      setCompletedSale({
        ...result,
        items: currentCart,
        customer: cust,
        date: new Date().toISOString(),
      })
      setRecipientEmail(cust?.email || '')

      // Verifica se houve itens vendidos de origem externa (e-commerce ou revendedora)
      const externalItems = currentCart.filter(
        (it) => it.stock_origin === 'ecommerce' || it.stock_origin === 'reseller',
      )
      if (externalItems.length > 0) {
        setFulfillmentItems(externalItems)
        setReminderModalOpen(true)
      } else {
        setReceiptModalOpen(true)
      }

      setActiveScreen('products')
      toast.success('Venda concluída com sucesso! Estoque atualizado.')

      resetSaleForm()
      loadInitialData()
      loadPendingSales()
    } catch (err: any) {
      console.error('Erro ao concluir venda:', err)
      const msg = err?.data?.error || err?.message || 'Falha ao processar venda.'
      toast.error(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const resetSaleForm = () => {
    setCart([])
    setSelectedCustomerId('')
    setDiscount('0')
    setInstallments(1)
    setPaymentMethod('pix')
    setActivePendingSaleId(null)
    setBarcodeOrSearch('')
    setActiveScreen('products')
  }

  // Handle Save / Download Receipt as text/file
  const handleDownloadReceipt = () => {
    if (!completedSale) return
    const textLines = [
      '========================================',
      '           SCAGLIONI JOIAS              ',
      '      ALTA JOALHERIA & CONIGNAÇÃO       ',
      '========================================',
      `Venda: ${completedSale.code}`,
      `Data: ${formatDateTime(completedSale.date)}`,
      completedSale.customer
        ? `Cliente: ${completedSale.customer.name}`
        : 'Cliente: Consumidor Final',
      '----------------------------------------',
      'ITENS:',
      ...completedSale.items.map(
        (it: any) =>
          `${it.quantity}x ${it.description} - R$ ${Number(it.total || it.unit_price * it.quantity).toFixed(2)}`,
      ),
      '----------------------------------------',
      `Subtotal: R$ ${Number(completedSale.subtotal || 0).toFixed(2)}`,
      completedSale.discount > 0
        ? `Desconto: - R$ ${Number(completedSale.discount).toFixed(2)}`
        : null,
      `TOTAL PAGO: R$ ${Number(completedSale.total || 0).toFixed(2)}`,
      `Forma: ${completedSale.payment_method.toUpperCase()}${completedSale.installments > 1 ? ` (${completedSale.installments}x)` : ''}`,
      '========================================',
      '    Obrigado pela preferência!          ',
      '========================================',
    ].filter(Boolean)

    const blob = new Blob([textLines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `comprovante-${completedSale.code}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Comprovante salvo com sucesso!')
  }

  // Handle Send Receipt by Email
  const handleSendEmailReceipt = async () => {
    if (!completedSale) return
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.warning('Informe um e-mail válido para enviar o comprovante.')
      return
    }

    setIsSendingEmail(true)
    try {
      const res = await salesService.sendReceiptEmail({
        email: recipientEmail.trim(),
        customer_name: completedSale.customer?.name || 'Cliente',
        sale_code: completedSale.code,
        total: completedSale.total,
        items: completedSale.items,
        payment_method: completedSale.payment_method,
        date: completedSale.date,
      })

      if (res.warning) {
        toast.info(res.warning)
      } else {
        toast.success(res.message || 'Comprovante enviado com sucesso!')
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao enviar comprovante: ' + (err.message || 'Falha de rede.'))
    } finally {
      setIsSendingEmail(false)
    }
  }

  // Quick Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustName.trim()) return

    try {
      const cust = await salesService.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        email: newCustEmail.trim(),
      })
      toast.success('Cliente cadastrado!')
      setCustomers((prev) => [...prev, cust])
      setSelectedCustomerId(cust.id)
      setNewCustomerModalOpen(false)
      setNewCustName('')
      setNewCustPhone('')
      setNewCustEmail('')
    } catch (err) {
      toast.error('Falha ao cadastrar cliente.')
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Title Bar compacta para tela única */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5DFD5] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-gradient-to-tr from-[#7A5C2E]/20 to-[#C6A664]/30 text-[#7A5C2E] shadow-xs">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif text-xl md:text-2xl font-bold text-[#2D2A26]">
              Ponto de Venda (PDV)
            </h1>
            <p className="text-xs text-[#6B655E]">
              {activeScreen === 'products'
                ? 'Selecione produtos ou escaneie o código de barras'
                : 'Conclua o pagamento e confirme a venda'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingSales.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingModalOpen(true)}
              className="border-[#B26A00] text-[#B26A00] hover:bg-[#B26A00]/10 font-semibold text-xs h-9"
            >
              <Clock className="h-3.5 w-3.5 mr-1" />
              Pendentes ({pendingSales.length})
            </Button>
          )}

          {activePendingSaleId && (
            <Badge className="bg-[#B26A00] text-white text-xs">Retomando Venda</Badge>
          )}
        </div>
      </div>

      {/* Main Single-Screen PDV Container com efeito suave de virar página / flip container */}
      <div className="relative overflow-hidden min-h-[560px] rounded-2xl">
        {/* LADO A: Produtos & Carrinho */}
        <div
          className={`transition-all duration-500 ease-in-out ${
            activeScreen === 'products'
              ? 'opacity-100 scale-100 translate-x-0 relative z-10 pointer-events-auto'
              : 'opacity-0 scale-95 -translate-x-full absolute inset-0 z-0 pointer-events-none'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Coluna Esquerda: Busca/Scanner + Tabela de Itens (8 colunas) */}
            <div className="lg:col-span-8 space-y-3">
              {/* Barcode / Search Box */}
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardContent className="p-3 space-y-2">
                  <div className="relative">
                    <Barcode className="absolute left-3.5 top-2.5 h-5 w-5 text-[#7A5C2E]" />
                    <Input
                      ref={barcodeInputRef}
                      value={barcodeOrSearch}
                      onChange={(e) => setBarcodeOrSearch(e.target.value)}
                      onKeyDown={handleBarcodeKeyDown}
                      placeholder="Escaneie o código de barras ou busque por código / descrição... (Enter para adicionar)"
                      className="pl-11 h-10 border-[#C6A664] focus-visible:ring-[#C6A664] text-sm font-medium bg-white"
                    />
                  </div>

                  {/* Autocomplete Dropdown preview com foto e badges */}
                  {filteredProducts.length > 0 && (
                    <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl bg-[#FDFBF7] overflow-hidden shadow-sm max-h-60 overflow-y-auto">
                      {filteredProducts.map((p) => {
                        const photo = getProductDisplayPhoto(p)
                        const hasPhoto = Boolean(photo)

                        return (
                          <div
                            key={p.id}
                            onClick={() => addToCart(p)}
                            className="p-2 flex items-center justify-between hover:bg-[#F3EAD8] cursor-pointer transition-colors gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (hasPhoto) handleOpenLightbox(p)
                                }}
                                disabled={!hasPhoto}
                                className={`relative group h-9 w-9 rounded-lg bg-white border border-[#E5DFD5] shrink-0 overflow-hidden flex items-center justify-center ${
                                  hasPhoto ? 'hover:border-[#C6A664]' : ''
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
                                  <PackageCheck className="h-4 w-4 text-[#C6A664]" />
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                                    {p.code}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-[#E5DFD5]/60 text-[10px] text-[#2D2A26]">
                                    {p.expand?.type?.name || 'Joia'}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-[#E5DFD5]/60 text-[10px] text-[#2D2A26]">
                                    {p.expand?.material?.name || '—'}
                                  </span>
                                </div>
                                {(() => {
                                  const bk = getProductStockBreakdown(
                                    p,
                                    resellerStockMap.get(p.id) || [],
                                  )
                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      <span className="text-[11px] text-[#6B655E] font-medium">
                                        Disp:{' '}
                                        <strong>
                                          {canSellFromExternal ? bk.total : bk.general}
                                        </strong>
                                      </span>
                                      {bk.general > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 h-4 border-[#2E7D4F]/40 text-[#2E7D4F] bg-[#2E7D4F]/5"
                                        >
                                          Geral: {bk.general}
                                        </Badge>
                                      )}
                                      {bk.ecommerce > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 h-4 border-[#1E40AF]/40 text-[#1E40AF] bg-[#DBEAFE]"
                                        >
                                          <Globe className="h-2.5 w-2.5 mr-0.5" /> E-commerce:{' '}
                                          {bk.ecommerce}
                                        </Badge>
                                      )}
                                      {bk.reseller > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 h-4 border-[#B26A00]/40 text-[#B26A00] bg-[#FEF3C7]"
                                        >
                                          <Users className="h-2.5 w-2.5 mr-0.5" /> Revendedora:{' '}
                                          {bk.reseller}
                                        </Badge>
                                      )}
                                    </div>
                                  )
                                })()}
                                <span className="text-xs font-medium text-[#2D2A26] block whitespace-normal break-words mt-0.5">
                                  {p.description}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-sm text-[#2E7D4F]">
                                {formatCurrency(p.selling_price)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-[#7A5C2E]"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cart Table com descrição completa sem truncar */}
              <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
                <CardHeader className="p-3 border-b border-[#E5DFD5] flex flex-row items-center justify-between">
                  <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-[#7A5C2E]" />
                    <span>Itens no Carrinho</span>
                    <Badge variant="secondary" className="bg-[#F3EAD8] text-[#7A5C2E] ml-1">
                      {cart.length}
                    </Badge>
                  </CardTitle>

                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCart([])}
                      className="text-xs text-[#B3261E] hover:bg-[#B3261E]/10 h-7 px-2"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Limpar Carrinho
                    </Button>
                  )}
                </CardHeader>

                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] font-semibold z-10">
                      <tr>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Descrição Completa</th>
                        <th className="py-2.5 px-3 text-center">Qtd</th>
                        <th className="py-2.5 px-3 text-right">Unitário</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DFD5]">
                      {cart.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-[#6B655E]">
                            <ShoppingCart className="h-8 w-8 mx-auto text-[#C6A664] opacity-40 mb-2" />
                            <p className="font-medium text-[#2D2A26] text-sm">Carrinho vazio</p>
                            <p className="text-xs text-[#6B655E] mt-0.5">
                              Busque joias ou escaneie o código de barras acima.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        cart.map((item) => (
                          <tr key={item.product_id} className="hover:bg-[#FDFBF7]">
                            <td className="py-2 px-3 font-mono font-bold text-[#7A5C2E]">
                              {item.code}
                            </td>

                            {/* Descrição completa sem truncamento + Badge de Origem & Seletor de Origem */}
                            <td className="py-2 px-3">
                              <div className="space-y-1">
                                <span className="font-medium text-[#2D2A26] whitespace-normal break-words block leading-relaxed">
                                  {item.description}
                                </span>

                                {/* Badges e Seleção de Origem */}
                                {(() => {
                                  const prod = products.find((p) => p.id === item.product_id)
                                  if (!prod) return null
                                  const bk = getProductStockBreakdown(
                                    prod,
                                    resellerStockMap.get(prod.id) || [],
                                  )
                                  const currentOrigin = item.stock_origin || 'general'

                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                      {/* Badge atual */}
                                      {currentOrigin === 'general' && (
                                        <Badge className="text-[10px] px-1.5 py-0 bg-[#2E7D4F]/10 text-[#2E7D4F] border border-[#2E7D4F]/30 hover:bg-[#2E7D4F]/20 flex items-center gap-1">
                                          <Building2 className="h-3 w-3" />
                                          <span>Estoque Geral</span>
                                        </Badge>
                                      )}
                                      {currentOrigin === 'ecommerce' && (
                                        <Badge className="text-[10px] px-1.5 py-0 bg-[#DBEAFE] text-[#1E40AF] border border-[#1E40AF]/40 hover:bg-[#BFDBFE] font-bold flex items-center gap-1">
                                          <Globe className="h-3 w-3" />
                                          <span>E-commerce</span>
                                        </Badge>
                                      )}
                                      {currentOrigin === 'reseller' && (
                                        <Badge className="text-[10px] px-1.5 py-0 bg-[#FEF3C7] text-[#B26A00] border border-[#B26A00]/40 hover:bg-[#FDE68A] font-bold flex items-center gap-1">
                                          <Users className="h-3 w-3" />
                                          <span>
                                            Com Revendedora: {item.reseller_name || 'Designada'}
                                          </span>
                                        </Badge>
                                      )}

                                      {/* Seletor de origem para admin quando há mais de uma fonte com saldo */}
                                      {canSellFromExternal && (
                                        <div className="inline-flex items-center gap-1 text-[10px] text-[#6B655E] ml-1">
                                          <span>Origem:</span>
                                          <select
                                            value={
                                              currentOrigin === 'reseller' && item.reseller_id
                                                ? `reseller:${item.reseller_id}`
                                                : currentOrigin
                                            }
                                            onChange={(e) => {
                                              const val = e.target.value
                                              if (val === 'general') {
                                                updateCartItemOrigin(item.product_id, 'general')
                                              } else if (val === 'ecommerce') {
                                                updateCartItemOrigin(item.product_id, 'ecommerce')
                                              } else if (val.startsWith('reseller:')) {
                                                const rId = val.split(':')[1]
                                                const rMatch = bk.resellerDetails.find(
                                                  (r) => r.reseller_id === rId,
                                                )
                                                updateCartItemOrigin(
                                                  item.product_id,
                                                  'reseller',
                                                  rId,
                                                  rMatch?.reseller_name,
                                                )
                                              }
                                            }}
                                            className="h-6 rounded border border-[#E5DFD5] bg-white px-1.5 py-0 text-[10px] text-[#2D2A26] focus:outline-none focus:ring-1 focus:ring-[#C6A664]"
                                          >
                                            {bk.general > 0 && (
                                              <option value="general">Geral ({bk.general})</option>
                                            )}
                                            {bk.ecommerce > 0 && (
                                              <option value="ecommerce">
                                                E-commerce ({bk.ecommerce})
                                              </option>
                                            )}
                                            {bk.resellerDetails.map((r) => (
                                              <option
                                                key={r.reseller_id}
                                                value={`reseller:${r.reseller_id}`}
                                              >
                                                {r.reseller_name} ({r.quantity})
                                              </option>
                                            ))}
                                            {bk.general === 0 &&
                                              bk.ecommerce === 0 &&
                                              bk.resellerDetails.length === 0 && (
                                                <option value="general">Geral (0)</option>
                                              )}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
                              </div>
                            </td>

                            <td className="py-2 px-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(item.product_id, item.quantity - 1)}
                                  className="h-6 w-6 rounded bg-[#F3EAD8] hover:bg-[#E5DFD5] flex items-center justify-center text-[#2D2A26]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-6 text-center font-bold text-[#2D2A26]">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                                  className="h-6 w-6 rounded bg-[#F3EAD8] hover:bg-[#E5DFD5] flex items-center justify-center text-[#2D2A26]"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>

                            <td className="py-2 px-3 text-right text-[#6B655E]">
                              {formatCurrency(item.unit_price)}
                            </td>

                            <td className="py-2 px-3 text-right font-bold text-[#2D2A26]">
                              {formatCurrency(item.total)}
                            </td>

                            <td className="py-2 px-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.product_id)}
                                className="p-1 rounded text-[#B3261E] hover:bg-[#B3261E]/10"
                                title="Remover item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Coluna Direita: Resumo Rápido da Venda + Botões só com ícone (4 colunas) */}
            <div className="lg:col-span-4 space-y-3">
              {/* Cliente Rápido */}
              <Card className="border-[#E5DFD5] bg-white shadow-xs">
                <CardHeader className="p-3 pb-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-[#6B655E] uppercase tracking-wider">
                      Cliente
                    </Label>
                    <button
                      type="button"
                      onClick={() => setNewCustomerModalOpen(true)}
                      className="text-xs font-semibold text-[#7A5C2E] hover:underline flex items-center gap-1"
                    >
                      <UserPlus className="h-3 w-3" /> Novo
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full h-9 rounded-md border border-[#E5DFD5] bg-white px-2.5 text-xs text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    <option value="">Consumidor Final (Sem cadastro)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {/* Resumo Financeiro */}
              <Card className="border-[#C6A664] bg-gradient-to-br from-[#FFFFFF] to-[#FDFBF7] shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1.5 border-b border-[#E5DFD5] pb-3 text-xs">
                    <div className="flex justify-between text-[#6B655E]">
                      <span>
                        Subtotal ({cart.reduce((sum, it) => sum + it.quantity, 0)} itens):
                      </span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Label htmlFor="disc" className="text-xs text-[#6B655E]">
                        Desconto (R$):
                      </Label>
                      <Input
                        id="disc"
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        className="w-24 h-8 text-right font-semibold text-xs border-[#E5DFD5]"
                      />
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

                      {/* Botão com ÍCONE DE FIADO / PENDENTE (sem texto) */}
                      <Button
                        type="button"
                        onClick={handleSavePending}
                        disabled={cart.length === 0}
                        title="Venda a Prazo / Fiado (Salvar como Pendente sem baixar estoque)"
                        variant="outline"
                        className="h-14 border-2 border-[#B26A00] text-[#B26A00] hover:bg-[#B26A00]/10 flex items-center justify-center rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Clock className="h-7 w-7" />
                      </Button>
                    </div>

                    <p className="text-[10px] text-[#6B655E] text-center pt-0.5">
                      <span className="font-medium text-[#2E7D4F]">Pagamento</span> ou{' '}
                      <span className="font-medium text-[#B26A00]">Venda a Prazo / Fiado</span>
                    </p>
                  </div>
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

                  <div className="flex items-center gap-3">
                    <span className="font-serif font-bold text-base text-[#2D2A26]">
                      {formatCurrency(ps.total)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleResumePending(ps)}
                      className="bg-[#7A5C2E] text-white"
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

            <div>
              <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
              <Input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">E-mail</Label>
              <Input
                type="email"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                placeholder="luiza@exemplo.com"
                className="mt-1"
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
              e-commerce ou do mostruário de uma revendedora. Não se esqueça de recolher a peça para
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
                      {item.stock_origin === 'ecommerce' && (
                        <Badge className="bg-[#DBEAFE] text-[#1E40AF] border border-[#1E40AF]/30 text-[10px] font-semibold flex items-center gap-1 w-fit">
                          <Globe className="h-3 w-3" />
                          <span>Retirar do Estoque E-commerce (separar/embalar)</span>
                        </Badge>
                      )}
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
    </div>
  )
}
