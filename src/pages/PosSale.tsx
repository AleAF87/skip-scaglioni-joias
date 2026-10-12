import React, { useState, useEffect, useRef } from 'react'
import { salesService } from '@/services/salesService'
import { productService } from '@/services/productService'
import { Product, Customer, Sale, SaleItem } from '@/types'
import { formatCurrency, formatDateTime, getFileUrl } from '@/lib/formatters'
import { ImageLightbox } from '@/components/ImageLightbox'
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
} from 'lucide-react'
import { toast } from 'sonner'

export default function PosSale() {
  // Cart state
  const [cart, setCart] = useState<SaleItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
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

  // Success Receipt modal
  const [completedSale, setCompletedSale] = useState<any | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)

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
      const [prodRes, custRes] = await Promise.all([
        productService.getProducts({ perPage: 100 }),
        salesService.getCustomers(),
      ])
      setProducts(prodRes.items)
      setCustomers(custRes)
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

  // Handle Search or Barcode Scan
  useEffect(() => {
    const q = barcodeOrSearch.trim().toLowerCase()
    if (!q) {
      setFilteredProducts([])
      return
    }

    // Exact barcode match (simulate instant add on barcode enter)
    const exactMatch = products.find((p) => p.code.toLowerCase() === q && p.quantity > 0)

    const matches = products.filter(
      (p) =>
        (p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
        p.quantity > 0,
    )
    setFilteredProducts(matches.slice(0, 6))
  }, [barcodeOrSearch, products])

  // Add product to cart
  const addToCart = (product: Product) => {
    if (product.quantity <= 0) {
      toast.error('Produto esgotado no estoque.')
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id)
      if (existing) {
        if (existing.quantity >= product.quantity) {
          toast.warning(`Limite de estoque atingido para esta joia (${product.quantity} unid).`)
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
          },
        ]
      }
    })

    setBarcodeOrSearch('')
    barcodeInputRef.current?.focus()
  }

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }

    const prod = products.find((p) => p.id === productId)
    if (prod && newQty > prod.quantity) {
      toast.warning(`Apenas ${prod.quantity} unidades disponíveis em estoque.`)
      return
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
  const discountVal = Math.max(0, parseFloat(discount) || 0)
  const total = Math.max(0, subtotal - discountVal)
  const installmentValue = Math.round((total / installments) * 100) / 100

  // Key press on Barcode input (Enter triggers exact match addition)
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = barcodeOrSearch.trim().toUpperCase()
      const match = products.find((p) => p.code === q && p.quantity > 0)
      if (match) {
        addToCart(match)
        toast.success(`Joia adicionada: ${match.code}`)
      } else if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0])
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
      const result = await salesService.checkout({
        customer_id: selectedCustomerId || undefined,
        items: cart.map((item) => ({
          product_id: item.product_id,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        discount: discountVal,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : 1,
        sale_id: activePendingSaleId || undefined,
      })

      setCompletedSale({
        ...result,
        items: cart,
        customer: customers.find((c) => c.id === selectedCustomerId),
        date: new Date().toISOString(),
      })
      setReceiptModalOpen(true)
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
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Ponto de Venda (PDV)
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Leitura de código de barras ou busca rápida, checkout com baixa de estoque consistente e
            recibo imprimível.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingSales.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingModalOpen(true)}
              className="border-[#B26A00] text-[#B26A00] hover:bg-[#B26A00]/10 font-semibold"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              Vendas Pendentes ({pendingSales.length})
            </Button>
          )}

          {activePendingSaleId && (
            <Badge className="bg-[#B26A00] text-white">Retomando Venda</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Products Search + Cart Items) - 7 cols */}
        <div className="lg:col-span-7 space-y-4">
          {/* Barcode / Search Box */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Barcode className="absolute left-3.5 top-3 h-5 w-5 text-[#7A5C2E]" />
                <Input
                  ref={barcodeInputRef}
                  value={barcodeOrSearch}
                  onChange={(e) => setBarcodeOrSearch(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="Escaneie o código de barras ou busque pelo nome/código (Pressione Enter)..."
                  className="pl-11 h-11 border-[#C6A664] focus-visible:ring-[#C6A664] text-base font-medium"
                />
              </div>

              {/* Autocomplete Dropdown preview com miniatura amplificável e colunas/badges separadas */}
              {filteredProducts.length > 0 && (
                <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl bg-[#FDFBF7] overflow-hidden shadow-sm max-h-80 overflow-y-auto">
                  {filteredProducts.map((p) => {
                    const photo =
                      p.photos && p.photos.length > 0
                        ? getFileUrl('products', p.id, p.photos[0])
                        : null
                    const hasPhoto = Boolean(photo)

                    return (
                      <div
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className="p-2.5 flex items-center justify-between hover:bg-[#F3EAD8] cursor-pointer transition-colors gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (hasPhoto) handleOpenLightbox(p)
                            }}
                            disabled={!hasPhoto}
                            className={`relative group h-10 w-10 rounded-lg bg-white border border-[#E5DFD5] shrink-0 overflow-hidden flex items-center justify-center ${
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
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                                {p.code}
                              </span>
                              <span className="text-xs text-[#6B655E] font-light">
                                ({p.quantity} em estoque)
                              </span>
                            </div>
                            <span className="text-sm font-medium text-[#2D2A26] block truncate">
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
                          <span className="font-bold text-sm text-[#2E7D4F]">
                            {formatCurrency(p.selling_price)}
                          </span>
                          <Button size="sm" variant="ghost" className="h-7 text-[#7A5C2E]">
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

          {/* Cart Table */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
            <CardHeader className="p-4 border-b border-[#E5DFD5] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-serif text-lg text-[#2D2A26] flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-[#7A5C2E]" /> Itens no Carrinho (
                  {cart.length})
                </CardTitle>
              </div>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCart([])}
                  className="text-xs text-[#B3261E] hover:bg-[#B3261E]/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar Carrinho
                </Button>
              )}
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3EAD8] text-[#2D2A26] border-b border-[#E5DFD5] text-xs font-semibold">
                    <th className="py-2.5 px-4">Joia</th>
                    <th className="py-2.5 px-4 text-center">Qtd</th>
                    <th className="py-2.5 px-4 text-right">Unitário</th>
                    <th className="py-2.5 px-4 text-right">Subtotal</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5] text-sm">
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#6B655E]">
                        <ShoppingCart className="h-10 w-10 mx-auto text-[#C6A664] opacity-40 mb-2" />
                        <p className="font-medium text-[#2D2A26]">Carrinho vazio</p>
                        <p className="text-xs text-[#6B655E] mt-0.5">
                          Escaneie etiquetas ou busque joias pelo campo acima.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => (
                      <tr key={item.product_id} className="hover:bg-[#FDFBF7]">
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-bold text-[#7A5C2E] block">
                            {item.code}
                          </span>
                          <span className="font-medium text-[#2D2A26] line-clamp-1">
                            {item.description}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => updateCartQty(item.product_id, item.quantity - 1)}
                              className="h-7 w-7 rounded-md bg-[#F3EAD8] hover:bg-[#E5DFD5] flex items-center justify-center text-[#2D2A26]"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center font-bold text-[#2D2A26]">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                              className="h-7 w-7 rounded-md bg-[#F3EAD8] hover:bg-[#E5DFD5] flex items-center justify-center text-[#2D2A26]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right text-[#6B655E]">
                          {formatCurrency(item.unit_price)}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-[#2D2A26]">
                          {formatCurrency(item.total)}
                        </td>

                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => removeFromCart(item.product_id)}
                            className="p-1 rounded-md text-[#B3261E] hover:bg-[#B3261E]/10"
                          >
                            <Trash2 className="h-4 w-4" />
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

        {/* Right Column (Customer, Payment & Summary Checkout) - 5 cols */}
        <div className="lg:col-span-5 space-y-4">
          {/* Customer Selection */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider">
                  Cliente (Opcional)
                </Label>
                <button
                  type="button"
                  onClick={() => setNewCustomerModalOpen(true)}
                  className="text-xs font-semibold text-[#7A5C2E] hover:underline flex items-center gap-1"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Novo Cliente
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
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

          {/* Payment Method & Installments */}
          <Card className="border-[#E5DFD5] bg-white shadow-xs">
            <CardHeader className="p-4 pb-2">
              <Label className="text-xs font-semibold text-[#6B655E] uppercase tracking-wider">
                Forma de Pagamento *
              </Label>
            </CardHeader>

            <CardContent className="p-4 pt-1 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('pix')
                    setInstallments(1)
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-sm font-semibold ${
                    paymentMethod === 'pix'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/10 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <QrCode className="h-5 w-5" />
                  <span>Pix</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('credit_card')
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-sm font-semibold ${
                    paymentMethod === 'credit_card'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/10 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>Cartão de Crédito</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('debit_card')
                    setInstallments(1)
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-sm font-semibold ${
                    paymentMethod === 'debit_card'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/10 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>Cartão de Débito</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('cash')
                    setInstallments(1)
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-sm font-semibold ${
                    paymentMethod === 'cash'
                      ? 'border-[#7A5C2E] bg-[#C6A664]/10 text-[#7A5C2E] shadow-xs'
                      : 'border-[#E5DFD5] hover:bg-[#FDFBF7] text-[#6B655E]'
                  }`}
                >
                  <Banknote className="h-5 w-5" />
                  <span>Dinheiro</span>
                </button>
              </div>

              {/* Installments Selector (Up to 12x with parcel values) */}
              {paymentMethod === 'credit_card' && (
                <div className="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E5DFD5] space-y-2">
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

              {/* Discount Input */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <Label htmlFor="disc" className="text-xs font-semibold text-[#6B655E]">
                  Desconto Opcional (R$):
                </Label>
                <Input
                  id="disc"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-28 text-right font-semibold border-[#E5DFD5]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Checkout Totals & Final Buttons */}
          <Card className="border-[#C6A664] bg-gradient-to-br from-[#FFFFFF] to-[#FDFBF7] shadow-md">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2 border-b border-[#E5DFD5] pb-3 text-sm">
                <div className="flex justify-between text-[#6B655E]">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountVal > 0 && (
                  <div className="flex justify-between text-[#B3261E]">
                    <span>Desconto:</span>
                    <span>- {formatCurrency(discountVal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1">
                  <span className="font-serif text-lg font-bold text-[#2D2A26]">
                    Total a Pagar:
                  </span>
                  <span className="font-serif text-2xl font-bold text-[#7A5C2E]">
                    {formatCurrency(total)}
                  </span>
                </div>
                {paymentMethod === 'credit_card' && installments > 1 && (
                  <p className="text-right text-xs text-[#6B655E]">
                    Em {installments}x de {formatCurrency(installmentValue)}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={handleCompleteSale}
                  disabled={isProcessing || cart.length === 0}
                  className="w-full h-12 bg-[#2E7D4F] hover:bg-[#256640] text-white font-bold text-base shadow-md"
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  {isProcessing ? 'Finalizando...' : 'Concluir Venda'}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSavePending}
                    disabled={cart.length === 0}
                    className="border-[#B26A00] text-[#B26A00] hover:bg-[#B26A00]/10 text-xs font-semibold"
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" /> Salvar Pendente
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetSaleForm}
                    className="text-xs text-[#6B655E] hover:bg-[#E5DFD5]"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
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
                <h2 className="font-serif text-lg font-bold uppercase tracking-wider text-[#2D2A26]">
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

              {/* Items List */}
              <div className="space-y-1 pb-2 border-b border-[#2D2A26]/20">
                {completedSale.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate max-w-[180px]">
                      {item.quantity}x {item.description}
                    </span>
                    <span>{formatCurrency(item.total)}</span>
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

          <DialogFooter className="print:hidden mt-3 flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="border-[#2D2A26] text-[#2D2A26]"
            >
              <Printer className="h-4 w-4 mr-2" /> Imprimir Recibo
            </Button>
            <Button onClick={() => setReceiptModalOpen(false)} className="bg-[#2E7D4F] text-white">
              Nova Venda
            </Button>
          </DialogFooter>
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
