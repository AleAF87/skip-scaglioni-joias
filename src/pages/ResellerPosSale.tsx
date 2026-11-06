import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  DollarSign,
  User,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  Store,
  ScanLine,
  Camera,
  Package,
  History,
  RotateCcw,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePdvGuard } from '@/contexts/PdvGuardContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { customerService } from '@/services/customerService'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { ImageLightbox } from '@/components/ImageLightbox'
import { filterCustomersLive, getMaskedCustomerLabel } from '@/lib/customerSearch'
import { matchesProductQuery, isExactCodeMatch } from '@/lib/barcodeSearch'
import { formatCurrency, formatDateTime, getProductDisplayPhoto } from '@/lib/formatters'
import pb from '@/lib/pocketbase/client'
import { Customer, Product, ResellerStockItem, Reseller, ResellerSale, SaleItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

interface CartItem {
  uid: string
  stockItem: ResellerStockItem
  quantity: number
  unit_price: number
}

const round2 = (v: number) => Math.round((v || 0) * 100) / 100

// "Categoria — Nome do produto" a partir dos links de categoria expandidos
// (inclui o caso de expand aninhado via product, usado no estoque da revendedora).
function getProductDisplayLabel(prod?: Product | null): string {
  if (!prod) return 'Produto'
  const name = prod.nome_produto || prod.description || 'Produto Scaglioni'
  const links =
    (prod.expand?.['product_category_links(product)'] as any[] | undefined) ||
    ((prod.expand as any)?.product?.expand?.['product_category_links(product)'] as
      | any[]
      | undefined) ||
    []
  const cat = links.find((l) => l.expand?.category?.name)?.expand?.category?.name?.trim()
  return cat ? `${cat} — ${name}` : name
}

// Todas as URLs de foto do produto (galeria + fallback image_url dos importados)
function getProductPhotoUrls(prod?: Product | null): string[] {
  if (!prod) return []
  if (prod.photos && prod.photos.length > 0 && prod.id) {
    return prod.photos.map((f) =>
      pb.files.getURL({ collectionId: 'products', id: prod.id }, f as any),
    )
  }
  return prod.image_url ? [prod.image_url] : []
}

export default function ResellerPosSale() {
  const { user, isAdmin, isOperator, isReseller } = useAuth()
  const { setIsCartDirty, registerLeaveHandler } = usePdvGuard()
  const canManage = isAdmin || isOperator

  const [resellers, setResellers] = useState<Reseller[]>([])
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [selectedResellerId, setSelectedResellerId] = useState<string>('')

  // Stock items of the reseller
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')

  // Cart state — código repetido = nova linha individual (não soma quantidade)
  const [cart, setCart] = useState<CartItem[]>([])
  const uidRef = useRef(1)
  const nextUid = () => `line-${uidRef.current++}`

  // Cliente ao vivo (vínculo SEMPRE pelo ID — nunca CPF)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', cpf: '', phone: '', email: '' })
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)

  const [discount, setDiscount] = useState<number>(0)
  const [discountPercent, setDiscountPercent] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cash' | 'credit_card' | 'debit_card'>(
    'pix',
  )
  const [installments, setInstallments] = useState<number>(1)
  const [saleNotes, setSaleNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Scanner por câmera
  const [scannerOpen, setScannerOpen] = useState(false)

  // Lightbox de foto
  const [lightbox, setLightbox] = useState<{ photos: string[]; title: string } | null>(null)

  // Últimas compras/reservas
  const [recentSales, setRecentSales] = useState<ResellerSale[]>([])
  const [reserveToDelete, setReserveToDelete] = useState<ResellerSale | null>(null)

  // Dupla confirmação de saída
  const [exitStep, setExitStep] = useState(0) // 0 fechado, 1 e 2 = etapas
  const exitConfirmRef = useRef<(() => void) | null>(null)
  const leaveViaPopRef = useRef(false)
  const cartRef = useRef<CartItem[]>([])
  cartRef.current = cart

  // Last completed sale modal
  const [completedSale, setCompletedSale] = useState<{
    code: string
    total: number
    reseller_profit: number
    scaglioni_due: number
    commission_rate: number
  } | null>(null)

  useEffect(() => {
    loadResellerContext()
  }, [user])

  const loadResellerContext = async () => {
    try {
      if (canManage) {
        const list = await resellerService.getResellers({ status: 'active' })
        setResellers(list)
        if (list.length > 0) {
          setSelectedResellerId(list[0].id)
          setCurrentReseller(list[0])
        }
      } else if (isReseller && user) {
        const r = await resellerService.getResellerByUserId(user.id)
        setCurrentReseller(r)
        setSelectedResellerId(r.id)
      }
    } catch (err) {
      console.error('Erro ao identificar revendedora:', err)
    }
  }

  useEffect(() => {
    if (selectedResellerId) {
      loadStock(selectedResellerId)
      const found = resellers.find((r) => r.id === selectedResellerId)
      if (found) setCurrentReseller(found)
      setCart([]) // Clear cart when switching reseller
    }
  }, [selectedResellerId])

  // Clientes visíveis: revendedora só vê os que ELA cadastrou (regra também no backend);
  // operador/admin/superadmin veem todos.
  const loadCustomers = useCallback(async () => {
    try {
      if (!user) return
      if (isReseller) {
        const list = await pb.collection('customers').getFullList<Customer>({
          filter: `created_by = '${user.id}'`,
          sort: 'name',
        })
        setCustomers(list)
      } else {
        setCustomers(await customerService.getAllCustomers())
      }
    } catch (err) {
      console.error('Erro ao carregar clientes:', err)
    }
  }, [user, isReseller])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const loadStock = async (resellerId: string) => {
    setIsLoadingStock(true)
    try {
      const items = await resellerStockService.getResellerStock(resellerId)
      setStockItems(items)
    } catch (err) {
      console.error('Erro ao carregar estoque da revendedora:', err)
      toast.error('Erro ao carregar estoque para venda.')
    } finally {
      setIsLoadingStock(false)
    }
  }

  // Últimas compras/reservas DA REVENDEDORA (a regra da collection já restringe
  // revendedoras às próprias vendas; admin/operação vê da revendedora selecionada)
  const loadRecentSales = useCallback(async (resellerId: string) => {
    try {
      const list = await pb.collection('reseller_sales').getFullList<ResellerSale>({
        filter: `reseller = '${resellerId}'`,
        sort: '-created',
        expand: 'customer',
      })
      setRecentSales(list.slice(0, 5))
    } catch (err) {
      console.error('Erro ao carregar últimas compras/reservas:', err)
    }
  }, [])

  useEffect(() => {
    if (selectedResellerId) loadRecentSales(selectedResellerId)
  }, [selectedResellerId, loadRecentSales])

  // Cart operations
  const getUsedQty = (itemId: string, ignoreUid?: string) =>
    cart
      .filter((c) => c.stockItem.id === itemId && c.uid !== ignoreUid)
      .reduce((acc, c) => acc + c.quantity, 0)

  const addCartLine = (item: ResellerStockItem): boolean => {
    const used = getUsedQty(item.id)
    if (used >= item.quantity) {
      toast.warning(`Você possui apenas ${item.quantity} unidade(s) desta joia em seu estoque.`)
      return false
    }
    const unitPrice = item.selling_price || item.expand?.product?.selling_price || 0
    setCart((prev) => [
      ...prev,
      { uid: nextUid(), stockItem: item, quantity: 1, unit_price: unitPrice },
    ])
    return true
  }

  const handleAddToCart = (item: ResellerStockItem) => {
    addCartLine(item)
  }

  const handleUpdateQty = (uid: string, qty: number) => {
    const found = cart.find((c) => c.uid === uid)
    if (!found) return

    const othersUsed = getUsedQty(found.stockItem.id, uid)
    const maxQty = found.stockItem.quantity - othersUsed
    if (qty > maxQty) {
      toast.warning(`Saldo máximo em seu estoque é de ${found.stockItem.quantity} un.`)
      qty = Math.max(0, maxQty)
    }

    if (qty <= 0) {
      setCart(cart.filter((c) => c.uid !== uid))
    } else {
      setCart(cart.map((c) => (c.uid === uid ? { ...c, quantity: qty } : c)))
    }
  }

  const handleRemoveFromCart = (uid: string) => {
    setCart(cart.filter((c) => c.uid !== uid))
  }

  // Leitura (câmera ou Enter no campo de busca): procura o produto NO ESTOQUE DA REVENDEDORA
  const handleScanCode = (
    barcode: string,
    options?: { forceDuplicate?: boolean },
  ): boolean | { requiresDuplicateConfirmation: boolean; product?: any } => {
    const code = (barcode || '').trim()
    if (!code) return false

    const found = stockItems.find(
      (it) => it.expand?.product && isExactCodeMatch(it.expand.product, code),
    )

    if (!found) {
      toast.error('Produto não encontrado no seu estoque de revendedora.')
      return false
    }

    const prod = found.expand?.product
    const alreadyInCart = cart.some((c) => c.stockItem.product === found.product)

    // A pergunta de duplicado SÓ vale para leitura por câmera (scanner modal);
    // leitor físico/Enter no campo não pergunta e não tem delay.
    if (alreadyInCart && !options?.forceDuplicate && options?.viaCamera) {
      return { requiresDuplicateConfirmation: true, product: prod }
    }

    const ok = addCartLine(found)
    return ok
  }

  // Calculations
  const subtotal = cart.reduce((acc, c) => acc + c.quantity * c.unit_price, 0)
  const total = Math.max(0, round2(subtotal - (discount || 0)))
  const commissionRate = currentReseller?.commission_rate || 40 // default 40%
  const resellerProfit = round2((total * commissionRate) / 100)
  const scaglioniDue = round2(total - resellerProfit)

  // Filter products by search (universal barcode / numeric zeros-stripped / Ç->C search)
  const filteredStock = stockItems.filter((it) => {
    const prod = it.expand?.product
    if (!prod) return false
    if (!searchFilter.trim()) return true
    return matchesProductQuery(prod, searchFilter.trim())
  })

  const resetSaleState = () => {
    setCart([])
    setCustomerQuery('')
    setSelectedCustomer(null)
    setDiscount(0)
    setDiscountPercent(0)
    setSaleNotes('')
  }

  // Checkout sale
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('O carrinho está vazio.')
      return
    }
    if (!selectedResellerId) {
      toast.error('Revendedora não selecionada.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        reseller_id: selectedResellerId,
        customer_name: selectedCustomer?.name || '',
        customer_phone: selectedCustomer?.phone || '',
        items: cart.map((c) => ({
          product_id: c.stockItem.product,
          quantity: c.quantity,
          unit_price: c.unit_price,
        })),
        discount,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : 1,
        notes: saleNotes,
      }

      const res = await resellerStockService.checkoutResellerSale(payload)

      // Vínculo da venda com o cliente SEMPRE pelo ID (nunca CPF)
      if (res.sale_id && selectedCustomer) {
        pb.collection('reseller_sales')
          .update(res.sale_id, { customer: selectedCustomer.id })
          .catch((e) => console.error('Erro ao vincular cliente à venda:', e))
      }

      setCompletedSale({
        code: res.code,
        total: res.total,
        reseller_profit: res.reseller_profit,
        scaglioni_due: res.scaglioni_due,
        commission_rate: res.commission_rate,
      })

      resetSaleState()
      toast.success(`Venda ${res.code} concluída com sucesso!`)
      await loadStock(selectedResellerId)
      await loadRecentSales(selectedResellerId)
    } catch (err: any) {
      console.error('Erro no PDV da revendedora:', err)
      toast.error(err.message || 'Falha ao processar venda no PDV.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reserva: EXIGE cliente cadastrado (nunca Consumidor Final)
  const handleReserve = async () => {
    if (cart.length === 0) {
      toast.error('O carrinho está vazio.')
      return
    }
    if (!selectedCustomer) {
      toast.error(
        'Reserva exige cliente cadastrado. Selecione um cliente no campo CLIENTE ou finalize como venda.',
      )
      return
    }
    if (!selectedResellerId) {
      toast.error('Revendedora não selecionada.')
      return
    }

    setIsSubmitting(true)
    try {
      const items: SaleItem[] = cart.map((c) => ({
        product_id: c.stockItem.product,
        code: c.stockItem.expand?.product?.code || '',
        description: getProductDisplayLabel(c.stockItem.expand?.product),
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: round2(c.quantity * c.unit_price),
      }))

      await pb.collection('reseller_sales').create({
        code: `RS-${Date.now()}`,
        reseller: selectedResellerId,
        customer: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone || '',
        status: 'pending',
        items,
        subtotal: round2(subtotal),
        discount: round2(discount),
        total,
        payment_method: paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : 1,
        notes: saleNotes || 'Reserva criada no PDV da revendedora',
      })

      toast.success('Reserva registrada com sucesso! Ela aparece em "Últimas compras/reservas".')
      resetSaleState()
      await loadRecentSales(selectedResellerId)
    } catch (err: any) {
      console.error('Erro ao criar reserva:', err)
      toast.error(err.message || 'Falha ao criar reserva.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Excluir reserva pendente
  const handleDeleteReserve = async () => {
    if (!reserveToDelete) return
    try {
      await pb.collection('reseller_sales').delete(reserveToDelete.id)
      toast.success('Reserva excluída.')
      setReserveToDelete(null)
      await loadRecentSales(selectedResellerId)
    } catch (err: any) {
      console.error('Erro ao excluir reserva:', err)
      toast.error(err.message || 'Falha ao excluir reserva.')
    }
  }

  // Retomar reserva pendente: volta os itens para o carrinho (respeitando o saldo atual)
  const handleResumeReserve = async (sale: ResellerSale) => {
    try {
      const items: any[] = Array.isArray(sale.items)
        ? sale.items
        : JSON.parse((sale.items as any) || '[]')
      let added = 0
      for (const it of items) {
        const stockItem = stockItems.find((s) => s.product === it.product_id)
        if (!stockItem) {
          toast.warning(`Produto ${it.code || it.product_id} não está mais no seu estoque.`)
          continue
        }
        const used = getUsedQty(stockItem.id)
        if (used >= stockItem.quantity) {
          toast.warning(`Sem saldo para retomar o produto ${it.code || ''}.`)
          continue
        }
        const unitPrice =
          it.unit_price || stockItem.selling_price || stockItem.expand?.product?.selling_price || 0
        setCart((prev) => [
          ...prev,
          { uid: nextUid(), stockItem, quantity: 1, unit_price: unitPrice },
        ])
        added++
      }
      if (added > 0) {
        // A reserva retomada sai da lista pendente (a venda será concluída no checkout)
        await pb.collection('reseller_sales').delete(sale.id)
        toast.success(`Reserva retomada: ${added} item(ns) voltaram para a lista.`)
        await loadRecentSales(selectedResellerId)
      }
    } catch (err: any) {
      console.error('Erro ao retomar reserva:', err)
      toast.error(err.message || 'Falha ao retomar reserva.')
    }
  }

  // Cadastrar novo cliente dentro do próprio fluxo do PDV
  const handleCreateCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast.error('Informe pelo menos o nome do cliente.')
      return
    }
    setIsSavingCustomer(true)
    try {
      const created = await customerService.createCustomer({
        name: newCustomer.name.trim(),
        cpf: newCustomer.cpf.trim() || undefined,
        phone: newCustomer.phone.trim() || undefined,
        email: newCustomer.email.trim() || undefined,
        created_by: user?.id,
      } as any)
      setCustomers((prev) => [...prev, created])
      setSelectedCustomer(created)
      setCustomerQuery(getMaskedCustomerLabel(created))
      setShowCustomerDropdown(false)
      setNewCustomerOpen(false)
      setNewCustomer({ name: '', cpf: '', phone: '', email: '' })
      toast.success('Cliente cadastrado e vinculado à venda.')
    } catch (err: any) {
      console.error('Erro ao cadastrar cliente:', err)
      toast.error(err.message || 'Falha ao cadastrar cliente.')
    } finally {
      setIsSavingCustomer(false)
    }
  }

  // ----- Guarda de saída: dupla confirmação com itens na lista -----
  useEffect(() => {
    registerLeaveHandler((onConfirm) => {
      if (cartRef.current.length > 0) {
        leaveViaPopRef.current = false
        exitConfirmRef.current = onConfirm
        setExitStep(1)
      } else {
        onConfirm()
      }
    })
    return () => registerLeaveHandler(null)
  }, [registerLeaveHandler])

  const cartDirty = cart.length > 0
  useEffect(() => {
    setIsCartDirty(cartDirty)
  }, [cartDirty, setIsCartDirty])

  // Botão voltar do browser e recarregamento da página
  useEffect(() => {
    if (!cartDirty) return
    window.history.pushState({ pdvGuard: true }, '')
    const onPop = () => {
      if (cartRef.current.length > 0) {
        leaveViaPopRef.current = true
        setExitStep(1)
        window.history.pushState({ pdvGuard: true }, '')
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [cartDirty])

  const confirmExit = () => {
    setExitStep(0)
    setCart([])
    if (leaveViaPopRef.current) {
      leaveViaPopRef.current = false
      window.history.back()
    } else if (exitConfirmRef.current) {
      exitConfirmRef.current()
      exitConfirmRef.current = null
    }
  }

  const cancelExit = () => {
    setExitStep(0)
    leaveViaPopRef.current = false
  }

  // Clientes triados ao vivo no campo CLIENTE
  const liveCustomers = filterCustomersLive(customers, selectedCustomer ? '' : customerQuery, 50)

  const renderThumb = (prod: Product | undefined, size: string, label: string) => {
    const urls = getProductPhotoUrls(prod)
    if (urls.length === 0) {
      return (
        <div
          className={`${size} shrink-0 rounded-md border border-[#E5DFD5] bg-[#FDFBF7] flex items-center justify-center`}
        >
          <Package className="h-4 w-4 text-[#A8A196]" />
        </div>
      )
    }
    return (
      <button
        type="button"
        title="Ver foto em tamanho grande"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setLightbox({ photos: urls, title: label })
        }}
        className={`${size} shrink-0 rounded-md overflow-hidden border border-[#E5DFD5] hover:border-[#C6A664] transition-all`}
      >
        <img src={urls[0]} alt={label} className="h-full w-full object-cover" />
      </button>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <ShoppingCart className="h-5 w-5" />
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
              PDV da Revendedora
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Venda exclusiva de joias sob sua posse. Calcula automaticamente seu lucro e o valor a
            repassar à Scaglioni.
          </p>
        </div>

        {currentReseller && (
          <div className="flex items-center gap-3">
            <Link to={`/loja/${currentReseller.id}`} target="_blank">
              <Button
                variant="outline"
                size="sm"
                className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
              >
                <Store className="h-3.5 w-3.5" />
                Catálogo Virtual
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Reseller switcher (for Admin/Operator) */}
      {canManage && (
        <Card className="border-[#E5DFD5] bg-[#FDFBF7]">
          <CardContent className="p-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-[#7A5C2E]">Revendedora Atual:</Label>
              <select
                value={selectedResellerId}
                onChange={(e) => setSelectedResellerId(e.target.value)}
                className="h-8 rounded-md border border-[#E5DFD5] bg-white px-2 text-xs font-medium"
              >
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.commission_rate || 40}% comissão)
                  </option>
                ))}
              </select>
            </div>
            {currentReseller && (
              <span className="text-xs text-[#6B655E]">
                Comissão da revendedora: <strong>{currentReseller.commission_rate || 40}%</strong>
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Split Grid: Items Picker (Left) & Cart / Checkout (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Reseller Stock Items */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-[#E5DFD5] shadow-xs">
            <CardHeader className="p-4 border-b border-[#E5DFD5]">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center gap-2">
                  <span>Joias no Meu Estoque</span>
                  <Badge variant="outline" className="border-[#C6A664] text-[#7A5C2E] text-xs">
                    {stockItems.length} modelos disponíveis
                  </Badge>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setScannerOpen(true)}
                  className="h-8 bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Ler código (câmera)
                </Button>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                <Input
                  placeholder="Pesquisar por código ou nome da joia... (Enter = leitor físico)"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchFilter.trim()) {
                      e.preventDefault()
                      handleScanCode(searchFilter)
                      setSearchFilter('')
                    }
                  }}
                  className="pl-9 text-xs"
                />
              </div>
              <p className="text-[10px] text-[#8C8275] mt-1">
                Leitor físico: aponte para o código e pressione Enter — inclui direto, sem pergunta.
                Câmera: usa o botão "Ler código (câmera)".
              </p>
            </CardHeader>

            <CardContent className="p-4 max-h-[620px] overflow-y-auto">
              {isLoadingStock ? (
                <div className="py-12 text-center text-xs text-[#8C8275]">
                  Carregando joias do estoque...
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#8C8275] space-y-1">
                  <p className="font-semibold text-sm text-[#2D2A26]">
                    Nenhuma joia encontrada no estoque desta revendedora.
                  </p>
                  <p>
                    {canManage
                      ? 'Registre uma nova entrega para repor peças neste estoque.'
                      : 'Solicite uma reposição de peças à equipe Scaglioni.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredStock.map((it) => {
                    const prod = it.expand?.product
                    if (!prod) return null
                    const price = it.selling_price || prod.selling_price || 0
                    const label = getProductDisplayLabel(prod)
                    const inCart = cart
                      .filter((c) => c.stockItem.id === it.id)
                      .reduce((acc, c) => acc + c.quantity, 0)
                    const remaining = it.quantity - inCart

                    return (
                      <div
                        key={it.id}
                        className="p-3 rounded-xl border border-[#E5DFD5] bg-white hover:border-[#C6A664] hover:shadow-2xs transition-all flex gap-3"
                      >
                        {renderThumb(prod, 'h-16 w-16', label)}
                        <div className="min-w-0 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono font-bold text-[#7A5C2E]">
                                {prod.code}
                              </span>
                              <span
                                className={`font-semibold text-[11px] ${
                                  remaining > 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {remaining} em mãos
                              </span>
                            </div>
                            <h4 className="font-medium text-xs text-[#2D2A26] line-clamp-2 leading-tight">
                              {label}
                            </h4>
                          </div>

                          <div className="mt-2 pt-2 border-t border-[#E5DFD5]/60 flex items-center justify-between">
                            <span className="font-bold text-sm text-[#2D2A26]">
                              {formatCurrency(price)}
                            </span>
                            <Button
                              size="sm"
                              disabled={remaining <= 0}
                              onClick={() => addCartLine(it)}
                              className="h-7 px-2.5 text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Vender
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Cart, Customer & Checkout */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-[#E5DFD5] bg-white sticky top-20 shadow-sm">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-[#7A5C2E]" />
                  <span>Venda da Revendedora</span>
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {cart.reduce((acc, c) => acc + c.quantity, 0)} itens
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 text-xs">
              {/* Cliente: digitação livre com triagem ao vivo (nome/CPF/e-mail/telefone) */}
              <div className="relative">
                <Label className="text-[11px] text-[#6B655E]">Cliente:</Label>
                <Input
                  placeholder="Digite nome, CPF, e-mail ou telefone..."
                  value={
                    selectedCustomer ? getMaskedCustomerLabel(selectedCustomer) : customerQuery
                  }
                  onChange={(e) => {
                    setSelectedCustomer(null)
                    setCustomerQuery(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  className="h-8 text-xs mt-1"
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null)
                      setCustomerQuery('')
                    }}
                    className="absolute right-2 top-6 text-[#8C8275] hover:text-[#B3261E]"
                    title="Remover cliente selecionado"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {showCustomerDropdown && (
                  <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-[#E5DFD5] bg-white shadow-lg">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedCustomer(null)
                        setCustomerQuery('')
                        setShowCustomerDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs border-b border-[#E5DFD5] bg-[#FDFBF7] hover:bg-[#F3EAD8] text-[#6B655E]"
                    >
                      Não informar cliente — Consumidor Final (Sem cadastro)
                    </button>

                    {liveCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedCustomer(c)
                          setCustomerQuery(getMaskedCustomerLabel(c))
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#F3EAD8] text-[#2D2A26]"
                      >
                        <span className="font-semibold">{getMaskedCustomerLabel(c)}</span>
                        {c.cpf ? (
                          <span className="text-[#8C8275] ml-1">• CPF {c.cpf}</span>
                        ) : c.email ? (
                          <span className="text-[#8C8275] ml-1">• {c.email}</span>
                        ) : null}
                      </button>
                    ))}

                    {liveCustomers.length === 0 && customerQuery.trim() && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewCustomer({ ...newCustomer, name: customerQuery.trim() })
                          setNewCustomerOpen(true)
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#F3EAD8] text-[#7A5C2E] font-semibold"
                      >
                        <Plus className="h-3 w-3 inline mr-1" />
                        Cadastrar novo cliente "{customerQuery.trim()}"
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Items in Cart */}
              <div className="border border-[#E5DFD5] rounded-xl p-2 bg-[#FDFBF7] max-h-52 overflow-y-auto space-y-2">
                {cart.length === 0 ? (
                  <p className="text-center py-6 text-xs text-[#8C8275]">
                    Nenhuma peça no carrinho. Toque em "Vender" ao lado.
                  </p>
                ) : (
                  cart.map((c) => {
                    const prod = c.stockItem.expand?.product
                    const label = getProductDisplayLabel(prod)
                    const urls = getProductPhotoUrls(prod)
                    return (
                      <div
                        key={c.uid}
                        className="flex items-center gap-2 p-2 bg-white rounded-lg border border-[#E5DFD5]"
                      >
                        {renderThumb(prod, 'h-10 w-10', label)}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-[#2D2A26] truncate">{label}</p>
                          <p className="text-[10px] text-[#6B655E]">
                            {formatCurrency(c.unit_price)} un • Sub:{' '}
                            {formatCurrency(c.unit_price * c.quantity)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(c.uid, c.quantity - 1)}
                            className="h-6 w-6 rounded bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-center hover:bg-[#F3EAD8]"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-bold text-xs w-5 text-center">{c.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(c.uid, c.quantity + 1)}
                            className="h-6 w-6 rounded bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-center hover:bg-[#F3EAD8]"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(c.uid)}
                            className="text-[#B3261E] hover:bg-[#B3261E]/10 p-1 rounded ml-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Payment Method */}
              <div>
                <Label className="text-[11px] text-[#6B655E]">Forma de Pagamento:</Label>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {[
                    { id: 'pix', label: 'PIX', icon: QrCode },
                    { id: 'credit_card', label: 'Cartão Crédito', icon: CreditCard },
                    { id: 'debit_card', label: 'Cartão Débito', icon: CreditCard },
                    { id: 'cash', label: 'Dinheiro', icon: Banknote },
                  ].map((m) => {
                    const Icon = m.icon
                    const isSel = paymentMethod === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                          isSel
                            ? 'border-[#7A5C2E] bg-[#F3EAD8] text-[#7A5C2E] font-semibold'
                            : 'border-[#E5DFD5] bg-white text-[#6B655E] hover:bg-[#FDFBF7]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Installments if credit card */}
              {paymentMethod === 'credit_card' && (
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-[#6B655E] whitespace-nowrap">Parcelas:</Label>
                  <select
                    value={installments}
                    onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                    className="h-8 rounded-md border border-[#E5DFD5] bg-white px-2 text-xs flex-1"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <option key={num} value={num}>
                        {num}x de {formatCurrency(total / num)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Discount: R$ e % sincronizados bidirecionalmente */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[#6B655E]">Desconto (R$):</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={discount || ''}
                    onChange={(e) => {
                      const v = round2(parseFloat(e.target.value) || 0)
                      setDiscount(v)
                      setDiscountPercent(subtotal > 0 ? round2((v / subtotal) * 100) : 0)
                    }}
                    className="h-8 text-xs text-right"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[#6B655E]">Desconto (%):</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0,00"
                    value={discountPercent || ''}
                    onChange={(e) => {
                      const v = round2(Math.min(100, parseFloat(e.target.value) || 0))
                      setDiscountPercent(v)
                      setDiscount(round2((subtotal * v) / 100))
                    }}
                    className="h-8 text-xs text-right"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-[11px] text-[#6B655E]">Observações:</Label>
                <Input
                  placeholder="Observações da venda/reserva..."
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>

              {/* Profit & Scaglioni Due Breakdown */}
              <div className="p-3 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] space-y-1.5">
                <div className="flex justify-between text-[#6B655E]">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[#B3261E]">
                    <span>Desconto:</span>
                    <span>- {formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-[#2D2A26] border-t border-[#E5DFD5] pt-1.5">
                  <span>Total Pago pelo Cliente:</span>
                  <span>{formatCurrency(total)}</span>
                </div>

                {/* Reseller Profit & Scaglioni breakdown */}
                <div className="pt-2 border-t border-dashed border-[#C6A664]/60 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                    <span className="text-emerald-800 font-medium block">
                      Seu Lucro ({commissionRate}%):
                    </span>
                    <strong className="text-emerald-900 font-bold text-sm block">
                      {formatCurrency(resellerProfit)}
                    </strong>
                  </div>
                  <div className="bg-[#F3EAD8]/60 border border-[#C6A664]/40 p-2 rounded-lg">
                    <span className="text-[#7A5C2E] font-medium block">Pagar à Scaglioni:</span>
                    <strong className="text-[#7A5C2E] font-bold text-sm block">
                      {formatCurrency(scaglioniDue)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={handleCheckout}
                  disabled={isSubmitting || cart.length === 0}
                  className="w-full bg-[#7A5C2E] hover:bg-[#634923] text-white font-semibold text-xs h-10 shadow-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSubmitting ? 'Finalizando Venda...' : 'Concluir Venda no PDV'}
                </Button>
                <Button
                  onClick={handleReserve}
                  disabled={isSubmitting || cart.length === 0}
                  variant="outline"
                  className="w-full border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] font-semibold text-xs h-9 flex items-center justify-center gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  Fazer Reserva
                </Button>
                <p className="text-[10px] text-[#8C8275] text-center">
                  A reserva exige cliente cadastrado selecionado no campo CLIENTE.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Últimas compras/reservas — APENAS da revendedora logada/selecionada */}
          <Card className="border-[#E5DFD5] bg-white shadow-sm">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center gap-2">
                <History className="h-4 w-4 text-[#7A5C2E]" />
                <span>Últimas compras/reservas</span>
                <Badge variant="outline" className="border-[#C6A664] text-[#7A5C2E] text-xs">
                  {recentSales.length} registro(s)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              {recentSales.length === 0 ? (
                <p className="text-center py-4 text-xs text-[#8C8275]">
                  Nenhuma venda ou reserva registrada ainda.
                </p>
              ) : (
                recentSales.map((s) => {
                  const statusLabel =
                    s.status === 'pending'
                      ? 'Reserva'
                      : s.status === 'cancelled'
                        ? 'Cancelada'
                        : 'Venda'
                  const items: any[] = Array.isArray(s.items)
                    ? s.items
                    : JSON.parse((s.items as any) || '[]')
                  const customerLabel =
                    s.expand?.customer?.name || s.customer_name || 'Consumidor Final'
                  const isPending = s.status === 'pending'
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[#E5DFD5] bg-[#FDFBF7]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#2D2A26] truncate">
                          <span className="font-mono text-[#7A5C2E] mr-1">{s.code}</span>
                          {customerLabel}
                        </p>
                        <p className="text-[10px] text-[#6B655E]">
                          {formatDateTime(s.created)} • {items.length} item(ns) •{' '}
                          <span
                            className={
                              s.status === 'cancelled'
                                ? 'text-[#B3261E] font-semibold'
                                : isPending
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-emerald-700 font-semibold'
                            }
                          >
                            {statusLabel}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#2D2A26]">{formatCurrency(s.total)}</span>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              title="Retomar reserva"
                              onClick={() => handleResumeReserve(s)}
                              className="p-1.5 rounded text-[#7A5C2E] hover:bg-[#F3EAD8]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Excluir reserva"
                              onClick={() => setReserveToDelete(s)}
                              className="p-1.5 rounded text-[#B3261E] hover:bg-[#B3261E]/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Scanner por câmera (modo sequencieira, lanterna, bip/vibração, 3s de travamento) */}
      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={handleScanCode}
          selectedOriginLabel="Estoque da Revendedora"
          originTitle="Estoque da Revendedora"
        />
      )}

      {/* Lightbox de foto */}
      <ImageLightbox
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        photos={lightbox?.photos || []}
        title={lightbox?.title}
      />

      {/* Modal de cadastro rápido de cliente */}
      {newCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl border border-[#E5DFD5] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-[#2D2A26] flex items-center gap-2">
                <User className="h-4 w-4 text-[#7A5C2E]" />
                Cadastrar novo cliente
              </h3>
              <button
                type="button"
                onClick={() => setNewCustomerOpen(false)}
                className="text-[#8C8275] hover:text-[#B3261E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <Label className="text-[11px] text-[#6B655E]">Nome completo:</Label>
                <Input
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="h-8 text-xs mt-0.5"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[#6B655E]">CPF:</Label>
                  <Input
                    value={newCustomer.cpf}
                    onChange={(e) => setNewCustomer({ ...newCustomer, cpf: e.target.value })}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[#6B655E]">Telefone:</Label>
                  <Input
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-[#6B655E]">E-mail:</Label>
                <Input
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setNewCustomerOpen(false)}
                className="flex-1 h-8 text-xs border-[#E5DFD5]"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCustomer}
                disabled={isSavingCustomer}
                className="flex-1 h-8 text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white"
              >
                {isSavingCustomer ? 'Salvando...' : 'Salvar e vincular'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar exclusão de reserva pendente */}
      {reserveToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl border border-[#E5DFD5] p-5 text-center space-y-4">
            <div className="h-10 w-10 rounded-full bg-[#B3261E]/10 text-[#B3261E] flex items-center justify-center mx-auto">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="font-serif font-bold text-base text-[#2D2A26]">
              Excluir esta reserva? Esta ação não pode ser desfeita
            </h3>
            <p className="text-xs text-[#6B655E]">
              Reserva <span className="font-mono font-semibold">{reserveToDelete.code}</span> de{' '}
              {reserveToDelete.expand?.customer?.name || reserveToDelete.customer_name || '—'}.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setReserveToDelete(null)}
                className="flex-1 h-9 text-xs border-[#E5DFD5]"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDeleteReserve}
                className="flex-1 h-9 text-xs bg-[#B3261E] hover:bg-[#8f1d17] text-white"
              >
                Excluir reserva
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dupla confirmação de saída com itens na lista (etapas 1 e 2) */}
      {exitStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl border border-[#E5DFD5] p-5 text-center space-y-4">
            <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <DollarSign className="h-5 w-5" />
            </div>
            {exitStep === 1 ? (
              <>
                <h3 className="font-serif font-bold text-base text-[#2D2A26]">
                  Você tem {cart.reduce((acc, c) => acc + c.quantity, 0)} item(ns) na lista. Deseja
                  realmente sair da página e perder toda a lista?
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={cancelExit}
                    className="flex-1 h-9 text-xs border-[#E5DFD5]"
                  >
                    Continuar aqui
                  </Button>
                  <Button
                    onClick={() => setExitStep(2)}
                    className="flex-1 h-9 text-xs bg-[#B3261E] hover:bg-[#8f1d17] text-white"
                  >
                    Quero sair
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-serif font-bold text-base text-[#2D2A26]">
                  Tem certeza? Deseja realmente sair da página e perder toda a lista? Esta ação não
                  pode ser desfeita.
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={cancelExit}
                    className="flex-1 h-9 text-xs border-[#E5DFD5]"
                  >
                    Continuar aqui
                  </Button>
                  <Button
                    onClick={confirmExit}
                    className="flex-1 h-9 text-xs bg-[#B3261E] hover:bg-[#8f1d17] text-white"
                  >
                    Sair e perder a lista
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sale Success Modal */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2A26]/60 backdrop-blur-xs">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[#E5DFD5] p-6 text-center space-y-4 animate-fade-in">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div>
              <span className="inline-block px-2 py-0.5 rounded bg-[#F3EAD8] text-[#7A5C2E] font-mono text-xs font-bold">
                {completedSale.code}
              </span>
              <h3 className="font-serif font-bold text-lg text-[#2D2A26] mt-1">
                Venda Realizada com Sucesso!
              </h3>
              <p className="text-xs text-[#6B655E]">
                As joias foram baixadas do seu estoque de revendedora.
              </p>
            </div>

            <div className="p-4 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] space-y-2 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-[#6B655E]">Total Recebido:</span>
                <strong className="text-[#2D2A26]">{formatCurrency(completedSale.total)}</strong>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Seu Lucro da Venda ({completedSale.commission_rate}%):</span>
                <span>{formatCurrency(completedSale.reseller_profit)}</span>
              </div>
              <div className="flex justify-between text-[#7A5C2E] font-semibold border-t border-[#E5DFD5] pt-1.5">
                <span>Valor a pagar à Scaglioni:</span>
                <span>{formatCurrency(completedSale.scaglioni_due)}</span>
              </div>
            </div>

            <Button
              onClick={() => setCompletedSale(null)}
              className="w-full bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs h-9"
            >
              Nova Venda
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
