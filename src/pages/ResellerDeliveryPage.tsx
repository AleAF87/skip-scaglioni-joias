import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PackagePlus, ArrowLeft, ArrowRight, Barcode, Camera, AlertTriangle, Boxes, Search, ZoomIn, Package, Plus, Trash2, PenTool, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { productService } from '@/services/productService'
import { resellerStockService } from '@/services/resellerStockService'
import { Reseller, Product, ResellerStockItem, ResellerReturn } from '@/types'
import { formatCurrency, getFileUrl, getProductDisplayPhoto } from '@/lib/formatters'
import { getProductFullName } from '@/types/labelContent'
import { isExactCodeMatch } from '@/lib/barcodeSearch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TouchSignaturePad } from '@/components/TouchSignaturePad'
import { ImageLightbox } from '@/components/ImageLightbox'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { toast } from 'sonner'
export default function ResellerDeliveryPage() {
  const { isAdmin, isOperator } = useAuth()
  const [params] = useSearchParams()
  const resellerId = params.get('reseller') || ''
  const navigate = useNavigate()
  const backUrl = '/revendedoras?reseller=' + encodeURIComponent(resellerId)
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [returnsHistory, setReturnsHistory] = useState<ResellerReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
  const saving = useRef(false)
  const busy = useRef(false)
  const dirty = useRef(false)
  const basketRef = useRef(deliveryItems)
  basketRef.current = deliveryItems
  dirty.current = !!(deliveryItems.length || deliveryNotes || deliverySignature)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setCurrentReseller(null)
    setDeliveryItems([]); setDeliveryNotes(''); setDeliverySignature(null)
    if (!(isAdmin || isOperator) || !resellerId) { setError('Acesso não autorizado ou revendedora não identificada.'); setLoading(false); return }
    Promise.all([resellerService.getResellerById(resellerId), resellerStockService.getResellerStock(resellerId), resellerStockService.getReturns({resellerId})]).then(([r, stock, returns]) => {
      if (!active) return
      if (!r || r.status !== 'active') throw new Error('Revendedora indisponível.')
      setCurrentReseller(r); setStockItems(stock); setReturnsHistory(returns); loadAvailableProducts()
    }).catch(e => { if (active) setError(e.message || 'Falha ao carregar entrega.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [resellerId, isAdmin, isOperator])
  const leave = () => { if (!saving.current && (!dirty.current || window.confirm('Descartar a entrega não registrada?'))) { dirty.current = false; navigate(backUrl) } }
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current || saving.current) { e.preventDefault(); e.returnValue = '' } }
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.href === location.href) return
      if (saving.current || (dirty.current && !window.confirm('Descartar a entrega não registrada?'))) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [])
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

  // Leitura por CÂMERA - Modal de Entrega (mesmo modelo do PDV: 3s de cooldown, bip e pergunta de duplicado)
  // onScan pode retornar Promise (consulta ao banco) — o scanner espera o resultado.
  const handleDeliveryCameraScan = async (
    barcode: string,
    options?: { forceDuplicate?: boolean; viaCamera?: boolean },
  ): Promise<boolean | { requiresDuplicateConfirmation: boolean; product?: Product }> => {
    const rawCode = (barcode || '').trim()
    if (!rawCode || saving.current) return false

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
    const existingInDelivery = basketRef.current.find((it) => it.product.id === found!.id)
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

  const processCode = async (code: string) => {
    if (!code.trim() || saving.current || busy.current) return
    busy.current = true; setIsSearchingDeliveryBarcode(true)
    try { const ok = await handleDeliveryCameraScan(code, {viaCamera:false}); if (ok === true) toast.success('+1 lido: ' + code); else toast.error('Não foi possível adicionar ' + code) }
    catch { setDeliveryScanAlert('Erro ao pesquisar código de barras.') }
    finally { busy.current = false; setIsSearchingDeliveryBarcode(false) }
  }
  const processRef = useRef(processCode)
  processRef.current = processCode
  const handleDeliveryBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault(); const code = e.currentTarget.value; setDeliveryBarcodeScan(''); void processCode(code)
  }
  useEffect(() => {
    if (!currentReseller || loading || isDeliveryCameraOpen || showSignPadInForm || lightboxOpen || isSubmittingDelivery) return
    let buffer = '', first = 0, last = 0
    let timer: number | undefined
    const typing = () => { const el = document.activeElement as HTMLElement | null; return !!el && (['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable) }
    const rearm = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!typing() && !document.querySelector('[role="dialog"]')) deliveryBarcodeInputRef.current?.focus() }, 500) }
    const key = (e: KeyboardEvent) => {
      if (typing() || document.querySelector('[role="dialog"]') || e.ctrlKey || e.altKey || e.metaKey) { buffer = ''; return }
      const now = Date.now()
      if (e.key === 'Enter') { if (buffer.length >= 4 && now-first < 1000) { e.preventDefault(); e.stopPropagation(); void processRef.current(buffer) }; buffer = ''; rearm(); return }
      if (e.key.length !== 1) { buffer = ''; return }
      if (!buffer || now-last > 60 || now-first >= 1000) { buffer = ''; first = now }
      buffer += e.key; last = now
    }
    rearm(); window.addEventListener('keydown', key, true); document.addEventListener('focusin', rearm)
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', key, true); document.removeEventListener('focusin', rearm) }
  }, [currentReseller, loading, isDeliveryCameraOpen, showSignPadInForm, lightboxOpen, isSubmittingDelivery])
  const handleAddProductToDelivery = (prod: Product) => {
    if (saving.current || prod.quantity <= 0) return
    const prev = basketRef.current
    const existing = prev.find(it => it.product.id === prod.id)
    if (existing && existing.quantity >= prod.quantity) { toast.warning('Limite de estoque atingido.'); return }
    const next = existing ? prev.map(it => it.product.id === prod.id ? {...it, product:prod, quantity:it.quantity+1} : it) : [...prev,{product:prod,quantity:1,selling_price:prod.selling_price}]
    basketRef.current = next; setDeliveryItems(next)
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
  const pendingBalance = returnsHistory.reduce((total, ret) => total + (ret.financial_status !== 'settled' ? ret.balance_due || 0 : 0), 0)
  const handleCreateDelivery = async () => {
    if (!currentReseller || !deliveryItems.length || saving.current || busy.current || isDeliveryCameraOpen) return
    saving.current = true; setIsSubmittingDelivery(true)
    try {
      const latest = await resellerStockService.getReturns({resellerId})
      const pending = latest.reduce((total, ret) => total + (ret.financial_status !== 'settled' ? ret.balance_due || 0 : 0), 0)
      setReturnsHistory(latest)
      if (pending > 0 && !window.confirm('Esta revendedora possui ' + formatCurrency(pending) + ' em pendências. Continuar?')) return
      const res = await resellerStockService.createDelivery({reseller_id:currentReseller.id,items:deliveryItems.map(it=>({product_id:it.product.id,quantity:it.quantity,selling_price:it.selling_price})),notes:deliveryNotes,signature_data:deliverySignature || undefined,signer_name:currentReseller.name})
      dirty.current = false; toast.success('Entrega ' + res.code + ' registrada com sucesso!'); navigate(backUrl,{replace:true})
    } catch (err:any) { toast.error(err.message || 'Falha ao registrar entrega.') }
    finally { saving.current = false; setIsSubmittingDelivery(false) }
  }
  const totalDeliveryItemsCount = deliveryItems.reduce((acc, it) => acc + it.quantity, 0)
  const totalDeliveryValue = deliveryItems.reduce(
    (acc, it) => acc + it.quantity * it.selling_price,
    0,
  )
  if (loading) return <div className="p-6">Carregando entrega...</div>
  if (error || !currentReseller) return <div className="p-6 space-y-4"><p>{error || 'Revendedora não localizada.'}</p><Button onClick={()=>navigate('/revendedoras')}>Voltar</Button></div>
  return <div className="space-y-4 max-w-7xl mx-auto">
    <div className="flex items-center gap-3"><Button variant="outline" onClick={leave} disabled={isSubmittingDelivery}><ArrowLeft className="h-4 w-4 mr-2"/>Voltar</Button><h1 className="text-xl font-serif font-bold flex items-center gap-2"><PackagePlus className="h-5 w-5"/>Nova Entrega para {currentReseller.name}</h1></div>
    {pendingBalance > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">Pendência financeira: {formatCurrency(pendingBalance)}. Confirmação necessária antes de registrar.</div>}
    <fieldset disabled={isSubmittingDelivery} className="min-w-0">

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
                        disabled={isSubmittingDelivery || isSearchingDeliveryBarcode}
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
                          disabled={isSubmittingDelivery || isSearchingDeliveryBarcode}
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
              <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4 self-start">
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
                      disabled={isSubmittingDelivery || isSearchingDeliveryBarcode || deliveryItems.length === 0}
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
    </fieldset>
    <Button variant="outline" onClick={leave} disabled={isSubmittingDelivery}>Cancelar entrega</Button>
    {isDeliveryCameraOpen && <BarcodeScannerModal onClose={()=>setIsDeliveryCameraOpen(false)} onScan={handleDeliveryCameraScan} originTitle={'Entrega para '+currentReseller.name} viaCamera />}
    <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />
  </div>
}
