import React, { useState, useEffect } from 'react'
import {
  ShoppingCart,
  Sparkles,
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
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { ResellerStockItem, Reseller } from '@/types'
import { formatCurrency, getFileUrl } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

interface CartItem {
  stockItem: ResellerStockItem
  quantity: number
  unit_price: number
}

export default function ResellerPosSale() {
  const { user, isAdmin, isOperator, isReseller } = useAuth()
  const canManage = isAdmin || isOperator

  const [resellers, setResellers] = useState<Reseller[]>([])
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [selectedResellerId, setSelectedResellerId] = useState<string>('')

  // Stock items of the reseller
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discount, setDiscount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cash' | 'credit_card' | 'debit_card'>(
    'pix',
  )
  const [installments, setInstallments] = useState<number>(1)
  const [saleNotes, setSaleNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  // Cart operations
  const handleAddToCart = (item: ResellerStockItem) => {
    const existing = cart.find((c) => c.stockItem.id === item.id)
    if (existing) {
      if (existing.quantity >= item.quantity) {
        toast.warning(`Você possui apenas ${item.quantity} unidades desta joia em seu estoque.`)
        return
      }
      setCart(
        cart.map((c) => (c.stockItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)),
      )
    } else {
      const unitPrice = item.selling_price || item.expand?.product?.selling_price || 0
      setCart([...cart, { stockItem: item, quantity: 1, unit_price: unitPrice }])
    }
  }

  const handleUpdateQty = (itemId: string, qty: number) => {
    const found = cart.find((c) => c.stockItem.id === itemId)
    if (!found) return

    if (qty > found.stockItem.quantity) {
      toast.warning(`Saldo máximo em seu estoque é de ${found.stockItem.quantity} un.`)
      qty = found.stockItem.quantity
    }

    if (qty <= 0) {
      setCart(cart.filter((c) => c.stockItem.id !== itemId))
    } else {
      setCart(cart.map((c) => (c.stockItem.id === itemId ? { ...c, quantity: qty } : c)))
    }
  }

  const handleRemoveFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.stockItem.id !== itemId))
  }

  // Calculations
  const subtotal = cart.reduce((acc, c) => acc + c.quantity * c.unit_price, 0)
  const total = Math.max(0, subtotal - (discount || 0))
  const commissionRate = currentReseller?.commission_rate || 40 // default 40%
  const resellerProfit = Math.round(((total * commissionRate) / 100) * 100) / 100
  const scaglioniDue = Math.round((total - resellerProfit) * 100) / 100

  // Filter products by search
  const filteredStock = stockItems.filter((it) => {
    const prod = it.expand?.product
    if (!prod) return false
    const q = searchFilter.toLowerCase()
    return prod.description.toLowerCase().includes(q) || prod.code.toLowerCase().includes(q)
  })

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
        customer_name: customerName,
        customer_phone: customerPhone,
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
      setCompletedSale({
        code: res.code,
        total: res.total,
        reseller_profit: res.reseller_profit,
        scaglioni_due: res.scaglioni_due,
        commission_rate: res.commission_rate,
      })

      // Reset cart and reload stock
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setDiscount(0)
      setSaleNotes('')
      toast.success(`Venda ${res.code} concluída com sucesso!`)
      await loadStock(selectedResellerId)
    } catch (err: any) {
      console.error('Erro no PDV da revendedora:', err)
      toast.error(err.message || 'Falha ao processar venda no PDV.')
    } finally {
      setIsSubmitting(false)
    }
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
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
                <Input
                  placeholder="Pesquisar por código ou descrição da joia..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
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
                    const inCart = cart.find((c) => c.stockItem.id === it.id)
                    const remaining = it.quantity - (inCart ? inCart.quantity : 0)

                    return (
                      <div
                        key={it.id}
                        className="p-3 rounded-xl border border-[#E5DFD5] bg-white hover:border-[#C6A664] hover:shadow-2xs transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-mono font-bold text-[#7A5C2E]">{prod.code}</span>
                            <span
                              className={`font-semibold text-[11px] ${
                                remaining > 0 ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {remaining} em mãos
                            </span>
                          </div>
                          <h4 className="font-medium text-xs text-[#2D2A26] line-clamp-2 leading-tight">
                            {prod.description}
                          </h4>
                          <p className="text-[10px] text-[#6B655E] mt-0.5">
                            {prod.expand?.type?.name || 'Joia'} •{' '}
                            {prod.expand?.material?.name || ''}
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[#E5DFD5]/60 flex items-center justify-between">
                          <span className="font-bold text-sm text-[#2D2A26]">
                            {formatCurrency(price)}
                          </span>
                          <Button
                            size="sm"
                            disabled={remaining <= 0}
                            onClick={() => handleAddToCart(it)}
                            className="h-7 px-2.5 text-xs bg-[#7A5C2E] hover:bg-[#634923] text-white"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Vender
                          </Button>
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
              {/* Customer fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[#6B655E]">Nome do Cliente:</Label>
                  <Input
                    placeholder="Ex: Beatriz Lima"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[#6B655E]">Telefone / WhatsApp:</Label>
                  <Input
                    placeholder="(11) 99999-9999"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              {/* Items in Cart */}
              <div className="border border-[#E5DFD5] rounded-xl p-2 bg-[#FDFBF7] max-h-52 overflow-y-auto space-y-2">
                {cart.length === 0 ? (
                  <p className="text-center py-6 text-xs text-[#8C8275]">
                    Nenhuma peça no carrinho. Toque em "Vender" ao lado.
                  </p>
                ) : (
                  cart.map((c) => (
                    <div
                      key={c.stockItem.id}
                      className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-[#E5DFD5]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-[#2D2A26] truncate">
                          {c.stockItem.expand?.product?.description}
                        </p>
                        <p className="text-[10px] text-[#6B655E]">
                          {formatCurrency(c.unit_price)} un • Sub:{' '}
                          {formatCurrency(c.unit_price * c.quantity)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(c.stockItem.id, c.quantity - 1)}
                          className="h-6 w-6 rounded bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-center hover:bg-[#F3EAD8]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-bold text-xs w-5 text-center">{c.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(c.stockItem.id, c.quantity + 1)}
                          className="h-6 w-6 rounded bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-center hover:bg-[#F3EAD8]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(c.stockItem.id)}
                          className="text-[#B3261E] hover:bg-[#B3261E]/10 p-1 rounded ml-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
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

              {/* Discount Input */}
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-[#6B655E] whitespace-nowrap">
                  Desconto (R$):
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={discount || ''}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs flex-1 text-right"
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

              {/* Submit Button */}
              <Button
                onClick={handleCheckout}
                disabled={isSubmitting || cart.length === 0}
                className="w-full bg-[#7A5C2E] hover:bg-[#634923] text-white font-semibold text-xs h-10 shadow-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Finalizando Venda...' : 'Concluir Venda no PDV'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

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
                As joias foram baixadas do seu estoque consignado.
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
