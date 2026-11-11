import React, { useState, useEffect, useMemo } from 'react'
import {
  PackagePlus,
  Boxes,
  Sparkles,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  PenTool,
  Store,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { productService } from '@/services/productService'
import { resellerStockService } from '@/services/resellerStockService'
import { Reseller, Product, ResellerDelivery, ResellerStockItem, ResellerReturn } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchSignaturePad } from '@/components/TouchSignaturePad'
import { getBackendErrorMessage } from '@/lib/backendErrors'
import { getDeliveryDisplayStatus } from '@/lib/deliveryStatus'
import { compressSignatureDataUrl } from '@/lib/signatureCompression'
import { DeliveryReceiptModal } from '@/components/DeliveryReceiptModal'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

export default function ResellerDeliveriesAndStock() {
  const { user, isAdmin, isOperator, isReseller } = useAuth()
  const canManage = isAdmin || isOperator

  const [activeTab, setActiveTab] = useState<'deliveries' | 'stock' | 'new_delivery'>('deliveries')
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [selectedResellerId, setSelectedResellerId] = useState<string>('')

  // Deliveries list
  const [deliveries, setDeliveries] = useState<ResellerDelivery[]>([])
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(true)

  // Stock items list
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoadingStock, setIsLoadingStock] = useState(false)

  // Modal receipt & Sign pad
  const [selectedReceiptDelivery, setSelectedReceiptDelivery] = useState<ResellerDelivery | null>(
    null,
  )
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [signingDelivery, setSigningDelivery] = useState<ResellerDelivery | null>(null)

  // New Delivery Form state
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
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 1. Load initial data
  useEffect(() => {
    loadInitial()
  }, [user])

  const loadInitial = async () => {
    try {
      if (canManage) {
        const resList = await resellerService.getResellers({ status: 'active' })
        setResellers(resList)
        if (resList.length > 0 && !selectedResellerId) {
          setSelectedResellerId(resList[0].id)
          setCurrentReseller(resList[0])
        }
      } else if (isReseller && user) {
        try {
          const res = await resellerService.getResellerByUserId(user.id)
          setCurrentReseller(res)
          setSelectedResellerId(res.id)
        } catch (err) {
          console.error('Revendedora não localizada:', err)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar revendedoras:', err)
    }
  }

  // 2. Load deliveries and stock when reseller selected
  useEffect(() => {
    if (selectedResellerId) {
      loadDeliveries()
      loadStock()
      const found = resellers.find((r) => r.id === selectedResellerId)
      if (found) setCurrentReseller(found)
    } else if (canManage && resellers.length > 0) {
      loadDeliveries() // load all
    }
  }, [selectedResellerId])

  const loadDeliveries = async () => {
    setIsLoadingDeliveries(true)
    try {
      const resellerFilter = canManage && !selectedResellerId ? undefined : selectedResellerId
      const [res, returnsRes] = await Promise.all([
        resellerStockService.getDeliveries({ resellerId: resellerFilter }),
        resellerStockService.getReturns({ resellerId: resellerFilter }),
      ])
      setDeliveries(res)
      setReturnsHistory(returnsRes)
    } catch (err) {
      console.error('Erro ao carregar entregas:', err)
      toast.error('Erro ao listar entregas.')
    } finally {
      setIsLoadingDeliveries(false)
    }
  }

  const loadStock = async () => {
    if (!selectedResellerId) return
    setIsLoadingStock(true)
    try {
      const items = await resellerStockService.getResellerStock(selectedResellerId)
      setStockItems(items)
    } catch (err) {
      console.error('Erro ao carregar estoque:', err)
    } finally {
      setIsLoadingStock(false)
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
      // Only products with quantity > 0 in general stock
      setAvailableProducts(res.items.filter((p) => p.quantity > 0))
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'new_delivery') {
      loadAvailableProducts()
    }
  }, [activeTab])

  // Add item to delivery form
  const handleAddProductToDelivery = (prod: Product) => {
    const existing = deliveryItems.find((it) => it.product.id === prod.id)
    if (existing) {
      if (existing.quantity >= prod.quantity) {
        toast.warning(`Estoque geral da loja só possui ${prod.quantity} unidades deste item.`)
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
    if (!selectedResellerId) {
      toast.error('Selecione uma revendedora.')
      return
    }
    if (deliveryItems.length === 0) {
      toast.error('Adicione ao menos uma joia para a entrega.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        reseller_id: selectedResellerId,
        items: deliveryItems.map((it) => ({
          product_id: it.product.id,
          quantity: it.quantity,
          selling_price: it.selling_price,
        })),
        notes: deliveryNotes,
        signature_data: deliverySignature || undefined,
        signer_name: currentReseller?.name,
      }

      const res = await resellerStockService.createDelivery(payload)
      toast.success(
        `Entrega ${res.code} registrada com sucesso! Estoque transferido para a revendedora.`,
      )

      // Reset form
      setDeliveryItems([])
      setDeliveryNotes('')
      setDeliverySignature(null)
      setShowSignPadInForm(false)
      setActiveTab('deliveries')
      await loadDeliveries()
      await loadStock()
    } catch (err: any) {
      console.error('Erro ao criar entrega:', err)
      toast.error(err.message || 'Falha ao registrar entrega.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle standalone sign on pending delivery
  const handleSaveSignature = async (dataUrl: string) => {
    if (!signingDelivery) return
    try {
      // Rede de segurança: comprime a assinatura (largura máx. 400px, JPEG)
      // para que o payload caiba em qualquer limite residual do campo de texto.
      const compressedSignature = await compressSignatureDataUrl(dataUrl)
      await resellerStockService.signDelivery({
        delivery_id: signingDelivery.id,
        signature_data: compressedSignature,
        signer_name: currentReseller?.name || user?.name,
      })
      toast.success('Assinatura salva com sucesso!')
      setSigningDelivery(null)
      loadDeliveries()
    } catch (err: any) {
      // Aviso claro em português (não silencioso): o hook responde { error: "..." }
      // e o SDK exibiria "Something went wrong." sem o helper.
      console.error('Erro ao salvar assinatura da entrega:', err)
      toast.error(getBackendErrorMessage(err))
    }
  }

  // Entregas realizadas (v0.0.155): SOMENTE entregas com peças ainda em aberto
  // (aguardando assinatura ou com peças em posse da revendedora). Entrega 100%
  // devolvida sai desta lista e fica consultável apenas no histórico de
  // devoluções — mesmo filtro já aplicado em ResellersUnifiedPage.tsx.
  const openDeliveries = useMemo(
    () =>
      deliveries.filter((del) => !getDeliveryDisplayStatus(del, returnsHistory).isFullyReturned),
    [deliveries, returnsHistory],
  )

  const totalDeliveryItemsCount = deliveryItems.reduce((acc, it) => acc + it.quantity, 0)
  const totalDeliveryValue = deliveryItems.reduce(
    (acc, it) => acc + it.quantity * it.selling_price,
    0,
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Sparkles className="h-5 w-5" />
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
              Estoque Próprio & Entregas de Joias
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            {canManage
              ? 'Transfira joias do estoque geral para a revendedora com assinatura touch e controle individual.'
              : 'Visualize as joias entregues em sua posse, seu estoque atual e assine recebimentos pendentes.'}
          </p>
        </div>

        {/* Quick action shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          {currentReseller && (
            <Link to={`/loja/${currentReseller.id}`} target="_blank">
              <Button
                variant="outline"
                size="sm"
                className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
              >
                <Store className="h-3.5 w-3.5" />
                Abrir Minha Loja Virtual
              </Button>
            </Link>
          )}

          {canManage && (
            <Button
              size="sm"
              onClick={() => setActiveTab('new_delivery')}
              className="bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5 shadow-xs"
            >
              <PackagePlus className="h-4 w-4" />
              Nova Entrega para Vendedora
            </Button>
          )}
        </div>
      </div>

      {/* Reseller Selector (for Admin/Operator) */}
      {canManage && (
        <Card className="border-[#E5DFD5] bg-[#FDFBF7]">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
            <div className="w-full sm:w-auto flex items-center gap-2">
              <Label className="text-xs font-semibold text-[#7A5C2E] whitespace-nowrap">
                Filtrar Revendedora:
              </Label>
              <select
                value={selectedResellerId}
                onChange={(e) => setSelectedResellerId(e.target.value)}
                className="flex h-9 w-full sm:w-64 rounded-md border border-[#E5DFD5] bg-white px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C6A664]"
              >
                <option value="">Todas as Revendedoras</option>
                {resellers.map((r, idxRes) => (
                  <option key={`${r.id || 'sem-id'}-${idxRes}`} value={r.id}>
                    {r.name} {r.commission_rate ? `(${r.commission_rate}% comissão)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {currentReseller && (
              <div className="text-xs text-[#6B655E] flex items-center gap-3">
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
                    {currentReseller.phone || currentReseller.email}
                  </strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E5DFD5] gap-4">
        <button
          onClick={() => setActiveTab('deliveries')}
          className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'deliveries'
              ? 'border-[#7A5C2E] text-[#7A5C2E]'
              : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
          }`}
        >
          <FileText className="h-4 w-4" />
          Histórico de Entregas ({openDeliveries.length})
        </button>

        <button
          onClick={() => setActiveTab('stock')}
          className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'stock'
              ? 'border-[#7A5C2E] text-[#7A5C2E]'
              : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
          }`}
        >
          <Boxes className="h-4 w-4" />
          Estoque Atual em Poder da Vendedora ({stockItems.length})
        </button>

        {canManage && (
          <button
            onClick={() => setActiveTab('new_delivery')}
            className={`pb-3 font-serif text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'new_delivery'
                ? 'border-[#7A5C2E] text-[#7A5C2E]'
                : 'border-transparent text-[#6B655E] hover:text-[#2D2A26]'
            }`}
          >
            <PackagePlus className="h-4 w-4" />+ Cadastrar Nova Entrega
          </button>
        )}
      </div>

      {/* TAB 1: HISTÓRICO DE ENTREGAS */}
      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          {isLoadingDeliveries ? (
            <div className="p-12 text-center text-[#8C8275]">Carregando entregas...</div>
          ) : openDeliveries.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center">
              <FileText className="h-10 w-10 text-[#C6A664] mx-auto mb-3 opacity-60" />
              <p className="text-base font-semibold text-[#2D2A26]">Nenhuma entrega registrada</p>
              <p className="text-xs text-[#6B655E] mt-1">
                {canManage
                  ? 'Realize a primeira entrega de joias para transferir peças do estoque da loja para a vendedora.'
                  : 'Você ainda não possui entregas cadastradas no sistema.'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {openDeliveries.map((del, idxDel) => {
                const isAccepted = del.status === 'accepted'
                return (
                  <Card
                    key={`${del.id || 'sem-id'}-${del.code || 'sem-cod'}-${idxDel}`}
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
                              <CheckCircle2 className="h-3 w-3" /> Assinada
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Aguardando Assinatura
                            </span>
                          )}
                        </Badge>
                      </div>
                      <CardTitle className="font-serif text-base text-[#2D2A26] mt-2 truncate">
                        {del.expand?.reseller?.name || 'Revendedora'}
                      </CardTitle>
                      <p className="text-[11px] text-[#6B655E]">{formatDateTime(del.created)}</p>
                    </CardHeader>

                    <CardContent className="py-3 text-xs space-y-2 flex-1">
                      <div className="flex justify-between items-center text-[#6B655E]">
                        <span>Total de Joias:</span>
                        <strong className="text-[#2D2A26] font-semibold text-sm">
                          {del.total_items_count} peças
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-[#6B655E]">
                        <span>Valor Total da Entrega:</span>
                        <strong className="text-[#7A5C2E] font-bold text-sm">
                          {formatCurrency(totalDeliveryValue)}
                        </strong>
                      </div>
                      {del.notes && (
                        <p className="text-[11px] text-[#8C8275] bg-[#FDFBF7] p-2 rounded border border-[#E5DFD5]/60 italic truncate">
                          "{del.notes}"
                        </p>
                      )}

                      {/* Signature thumbnail if signed */}
                      {del.signature_data && (
                        <div className="pt-2 border-t border-[#E5DFD5]/40 flex items-center justify-between">
                          <span className="text-[10px] text-[#6B655E]">Assinado por:</span>
                          <span className="text-[10px] font-semibold text-[#2D2A26]">
                            {del.signer_name || 'Vendedora'}
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
                          Assinar com o Dedo
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

      {/* TAB 2: ESTOQUE ATUAL DA REVENDEDORA */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FDFBF7] p-4 rounded-xl border border-[#E5DFD5]">
            <div>
              <h3 className="font-serif font-bold text-sm text-[#2D2A26]">
                Joias Atualmente em Poder de {currentReseller?.name || 'Revendedora'}
              </h3>
              <p className="text-xs text-[#6B655E]">
                Peças ativas disponíveis para venda pelo PDV dela ou apresentação aos clientes.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="text-[#6B655E]">
                Total de peças:{' '}
                <strong className="text-[#2D2A26] text-sm">
                  {stockItems.reduce((acc, it) => acc + it.quantity, 0)}
                </strong>
              </span>
              <span className="text-[#6B655E]">
                Valor total:{' '}
                <strong className="text-[#7A5C2E] text-sm">
                  {formatCurrency(
                    stockItems.reduce(
                      (acc, it) =>
                        acc +
                        it.quantity * (it.selling_price || it.expand?.product?.selling_price || 0),
                      0,
                    ),
                  )}
                </strong>
              </span>
            </div>
          </div>

          {isLoadingStock ? (
            <div className="p-12 text-center text-[#8C8275]">
              Carregando estoque da revendedora...
            </div>
          ) : stockItems.length === 0 ? (
            <Card className="border-[#E5DFD5] p-12 text-center">
              <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-3 opacity-60" />
              <p className="text-base font-semibold text-[#2D2A26]">Nenhuma joia em estoque</p>
              <p className="text-xs text-[#6B655E] mt-1">
                Todas as joias foram vendidas ou devolvidas. Realize uma nova entrega para repor o
                estoque.
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
                    {stockItems.map((item, idxStock) => {
                      const prod = item.expand?.product
                      const price = item.selling_price || prod?.selling_price || 0
                      return (
                        <tr
                          key={`${item.id || 'sem-id'}-${item.product || 'sem-prod'}-${idxStock}`}
                          className="hover:bg-[#FDFBF7]"
                        >
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

      {/* TAB 3: CADASTRO DE NOVA ENTREGA (ADMIN / OPERADOR) */}
      {activeTab === 'new_delivery' && canManage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Picker from general store inventory */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-[#E5DFD5]">
              <CardHeader className="pb-3 border-b border-[#E5DFD5]">
                <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center justify-between">
                  <span>Selecionar Joias do Estoque Geral da Loja</span>
                  <span className="text-xs font-normal text-[#6B655E]">
                    Disponíveis para transferência
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
              <CardContent className="p-3 max-h-[480px] overflow-y-auto space-y-2">
                {availableProducts.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[#8C8275]">
                    Nenhum produto disponível em estoque no momento.
                  </p>
                ) : (
                  availableProducts.map((prod, idxProd) => (
                    <div
                      key={`${prod.id || 'sem-id'}-${prod.code || 'sem-cod'}-${idxProd}`}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-[#E5DFD5] hover:border-[#C6A664] hover:bg-[#FDFBF7] transition-all"
                    >
                      <div className="min-w-0 flex-1 pr-3">
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
                            Preço Venda: <strong>{formatCurrency(prod.selling_price)}</strong>
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddProductToDelivery(prod)}
                        className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] h-8 px-2.5"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                  ))
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
                <div className="mt-2">
                  <Label className="text-xs text-[#6B655E]">Destinatária (Revendedora):</Label>
                  <select
                    value={selectedResellerId}
                    onChange={(e) => setSelectedResellerId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-[#E5DFD5] bg-white px-3 py-1 text-xs shadow-xs mt-1"
                  >
                    <option value="">Selecione...</option>
                    {resellers.map((r, idxRes) => (
                      <option key={`${r.id || 'sem-id'}-${idxRes}`} value={r.id}>
                        {r.name} ({r.phone || r.email})
                      </option>
                    ))}
                  </select>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {deliveryItems.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#8C8275]">
                    Nenhuma joia adicionada à entrega ainda. Selecione peças ao lado.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {deliveryItems.map((it, idxItem) => (
                      <div
                        key={`${it.product?.id || 'sem-id'}-${it.product?.code || 'sem-cod'}-${idxItem}`}
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
                              handleUpdateItemQty(it.product.id, parseInt(e.target.value, 10) || 1)
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
                    <span>Total de Itens:</span>
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
                    placeholder="Ex: Entregue no estojo de veludo, estojo #3..."
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    className="text-xs mt-1"
                  />
                </div>

                {/* Signature on mobile or desktop */}
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
                      Capturar Assinatura com o Dedo Agora
                    </Button>
                  )}

                  {showSignPadInForm && !deliverySignature && (
                    <TouchSignaturePad
                      signerName={currentReseller?.name}
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
                  disabled={isSubmitting || deliveryItems.length === 0 || !selectedResellerId}
                  className="w-full bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-10 shadow-sm flex items-center justify-center gap-2"
                >
                  <ArrowRight className="h-4 w-4" />
                  {isSubmitting ? 'Transferindo Estoque...' : 'Confirmar Entrega e Baixar do Geral'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Standalone Signature Modal if user clicks 'Assinar com o Dedo' from list */}
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
    </div>
  )
}
