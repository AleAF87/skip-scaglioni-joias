import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  RotateCcw,
  Barcode,
  Search,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Package,
  ArrowLeft,
  ScanLine,
  Boxes,
  DollarSign,
  TrendingUp,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { productService } from '@/services/productService'
import { Reseller, ResellerStockItem, ResellerSale, Product } from '@/types'
import { formatCurrency, getProductDisplayPhoto } from '@/lib/formatters'
import { getProductFullName } from '@/types/labelContent'
import { getBackendErrorMessage } from '@/lib/backendErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface ConferenceEntry {
  returned_qty: number
  pending_qty: number
  pending_reason: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
  pending_notes: string
}

const emptyEntry = (): ConferenceEntry => ({
  returned_qty: 0,
  pending_qty: 0,
  pending_reason: 'extraviada',
  pending_notes: '',
})

const digitsOf = (s: string) => String(s || '').replace(/\D/g, '')

interface StatCardProps {
  label: string
  value: number
  qty: number
  icon: React.ReactNode
  tone: string
}

function StatCard({ label, value, qty, icon, tone }: StatCardProps) {
  return (
    <div className={`p-4 rounded-xl border shadow-xs ${tone}`}>
      <div className="flex items-center justify-between text-xs font-semibold opacity-80">
        <span>{label}</span>
        {icon}
      </div>
      <div className="font-serif text-2xl font-bold mt-1 leading-tight">
        {formatCurrency(value)}
      </div>
      <p className="text-[11px] opacity-70 mt-0.5">
        {qty} peça{qty === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export default function ResellerConferencePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resellerId = searchParams.get('reseller') || ''

  const [reseller, setReseller] = useState<Reseller | null>(null)
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [sales, setSales] = useState<ResellerSale[]>([])
  const [salesProducts, setSalesProducts] = useState<Record<string, Product>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [conferenceMap, setConferenceMap] = useState<Record<string, ConferenceEntry>>({})
  const [searchText, setSearchText] = useState('')
  const [commission, setCommission] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'save' | null>(null)

  // Leitor global (mesmo padrão do PDV da revendedora): rajada de teclas ≤60ms,
  // ≥4 chars e Enter em <1s, sem precisar de clique/foco. Rearme ~0,5s.
  const [scanStatus, setScanStatus] = useState<'ready' | 'ok' | 'notfound'>('ready')
  const [scanMsg, setScanMsg] = useState('')
  const rearmTimerRef = useRef<number | null>(null)
  const stockRef = useRef<ResellerStockItem[]>([])
  const conferenceRef = useRef<Record<string, ConferenceEntry>>({})

  useEffect(() => {
    stockRef.current = stockItems
  }, [stockItems])
  useEffect(() => {
    conferenceRef.current = conferenceMap
  }, [conferenceMap])

  useEffect(() => {
    if (!resellerId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      resellerService.getResellerById(resellerId),
      resellerStockService.getAllResellerStockItems(resellerId),
      resellerStockService.getResellerSales({ resellerId }),
      resellerStockService.getReturns({ resellerId }),
    ])
      .then(async ([r, stock, salesList]) => {
        if (cancelled) return
        setReseller(r)
        setStockItems(stock)
        setSales(salesList)
        const productIds = Array.from(new Set(salesList.flatMap((sale) => (sale.items || []).map((item) => item.product_id)).filter(Boolean)))
        const products = await Promise.all(productIds.map((id) => productService.getProductById(id).catch(() => null)))
        if (cancelled) return
        setSalesProducts(Object.fromEntries(products.filter((product): product is Product => Boolean(product)).map((product) => [product.id, product])))
        setLoadError(null)
      })
      .catch((err) => {
        console.error('Erro ao carregar conferência:', err)
        if (!cancelled) setLoadError('Não foi possível carregar os dados da conferência. Verifique a sessão e as permissões de acesso antes de considerar a lista vazia.')
        toast.error('Erro ao carregar dados da conferência.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [resellerId, loadAttempt])

  const handleItemChange = useCallbackLike(
    (productId: string, field: keyof ConferenceEntry, value: any) => {
      setConferenceMap((prev) => {
        const cur = prev[productId] || emptyEntry()
        return { ...prev, [productId]: { ...cur, [field]: value } }
      })
    },
    [],
  )

  const flashScan = (status: 'ok' | 'notfound', msg: string) => {
    setScanStatus(status)
    setScanMsg(msg)
    if (rearmTimerRef.current) window.clearTimeout(rearmTimerRef.current)
    rearmTimerRef.current = window.setTimeout(() => setScanStatus('ready'), 500)
  }

  const registerOne = (productId: string, label: string) => {
    const it = stockRef.current.find((s) => s.product === productId)
    const conf = conferenceRef.current[productId] || emptyEntry()
    const availableQty = (it?.quantity || 0) - (conf.returned_qty || 0) - (conf.pending_qty || 0)
    if (!it || availableQty <= 0) {
      flashScan('notfound', `${label}: não há saldo disponível para devolução.`)
      return
    }
    handleItemChange(productId, 'returned_qty', (conf.returned_qty || 0) + 1)
    flashScan('ok', `+1 devolvida: ${label}`)
  }

  const handleScannedCode = (raw: string) => {
    const digits = digitsOf(raw)
    if (!digits) return
    const found = stockRef.current.find((it) => {
      const p = it.expand?.product
      if (!p) return false
      return digitsOf(p.code) === digits
    })
    if (!found) {
      const p = stockRef.current.find((it) =>
        getProductFullName(it.expand?.product!)?.toLowerCase().includes(raw.toLowerCase()),
      )
      if (p) {
        registerOne(
          p.product,
          getProductFullName(p.expand?.product!) || p.expand?.product?.code || '',
        )
        return
      }
      flashScan('notfound', `Código ${raw} não está na lista em poder desta revendedora.`)
      return
    }
    const prod = found.expand?.product
    registerOne(
      found.product,
      prod?.code
        ? `${prod.code}${prod.variacao ? ` — ${prod.variacao}` : ''}`
        : prod?.description || 'Joia',
    )
  }

  // Captura GLOBAL do leitor físico — igual ao PDV da revendedora (sem clique/foco)
  useEffect(() => {
    let buffer = ''
    let lastKeyTime = 0
    let firstKeyTime = 0
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const now = Date.now()
      if (e.key === 'Enter') {
        if (buffer.length >= 4 && now - firstKeyTime < 1000) {
          handleScannedCode(buffer)
        }
        buffer = ''
        firstKeyTime = 0
        lastKeyTime = 0
        return
      }
      if (e.key.length === 1) {
        if (now - lastKeyTime > 60) {
          buffer = e.key
          firstKeyTime = now
        } else {
          buffer += e.key
        }
        lastKeyTime = now
        if (buffer.length > 80) buffer = buffer.slice(-80)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dropdown ao vivo da busca (mesmo padrão de customerSearch: filtro tolerante)
  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return []
    return stockItems
      .filter((it) => {
        const p = it.expand?.product
        if (!p) return false
        const hay = `${p.code || ''} ${p.variacao || ''} ${getProductFullName(p) || ''} ${
          p.description || ''
        } ${p.nome_produto || ''}`.toLowerCase()
        return hay.includes(q) || digitsOf(p.code).includes(digitsOf(q))
      })
      .slice(0, 8)
  }, [searchText, stockItems])

  const soldItems = useMemo(() => {
    const map = new Map<
      string,
      { code: string; description: string; quantity: number; unit_price: number }
    >()
    sales
      .filter((s) => s.status !== 'pending' && s.status !== 'cancelled')
      .forEach((s) =>
        (s.items || []).forEach((it) => {
          const cur = map.get(it.product_id)
          if (cur) {
            cur.quantity += it.quantity
          } else {
            map.set(it.product_id, {
              code: it.code,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
            })
          }
        }),
      )
    return Array.from(map.entries()).map(([product_id, v]) => ({ product_id, ...v }))
  }, [sales])

  const reservedItems = useMemo(() => {
    const map = new Map<
      string,
      { code: string; description: string; quantity: number; unit_price: number }
    >()
    sales
      .filter((s) => s.status === 'pending')
      .forEach((s) =>
        (s.items || []).forEach((it) => {
          const cur = map.get(it.product_id)
          if (cur) cur.quantity += it.quantity
          else
            map.set(it.product_id, {
              code: it.code,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
            })
        }),
      )
    return Array.from(map.entries()).map(([product_id, v]) => ({ product_id, ...v }))
  }, [sales])

  const returningItems = stockItems.filter((it) => (conferenceMap[it.product]?.returned_qty || 0) > 0)
  const issueItems = stockItems.filter((it) => (conferenceMap[it.product]?.pending_qty || 0) > 0)
  const remainingOf = (it: ResellerStockItem) => Math.max(0, it.quantity - (conferenceMap[it.product]?.returned_qty || 0) - (conferenceMap[it.product]?.pending_qty || 0))
  const soldSaleRows = useMemo(
    () => sales.filter((sale) => sale.status !== 'pending' && sale.status !== 'cancelled').flatMap((sale) =>
      (sale.items || []).map((item) => ({ ...item, saleCode: sale.code || '—', saleCreated: sale.created, product: salesProducts[item.product_id] })),
    ),
    [sales, salesProducts],
  )

  const priceOf = (it: ResellerStockItem) =>
    it.selling_price || it.expand?.product?.selling_price || 0

  const totalReceivedQty = stockItems.reduce((acc, it) => acc + (it.quantity || 0), 0)
  const totalReceivedValue = stockItems.reduce(
    (acc, it) => acc + (it.quantity || 0) * priceOf(it),
    0,
  )
  const totalSoldQty = soldItems.reduce((acc, it) => acc + it.quantity, 0)
  const totalSoldValue = soldItems.reduce((acc, it) => acc + it.quantity * it.unit_price, 0)
  const totalIssuedQty = issueItems.reduce(
    (acc, it) => acc + (conferenceMap[it.product]?.pending_qty || 0),
    0,
  )
  const totalIssuedValue = issueItems.reduce(
    (acc, it) => acc + (conferenceMap[it.product]?.pending_qty || 0) * priceOf(it),
    0,
  )
  const totalReturningQty = returningItems.reduce(
    (acc, it) => acc + (conferenceMap[it.product]?.returned_qty || 0),
    0,
  )
  const totalReturningValue = returningItems.reduce(
    (acc, it) => acc + (conferenceMap[it.product]?.returned_qty || 0) * priceOf(it),
    0,
  )
  const activeCommission = commission ?? reseller?.commission_rate ?? 40
  const totalProfit = (totalSoldValue * activeCommission) / 100

  const buildItemsPayload = () =>
    Object.entries(conferenceMap)
      .filter(([, c]) => (c.returned_qty || 0) > 0 || (c.pending_qty || 0) > 0)
      .map(([product_id, c]) => ({
        product_id,
        returned_qty: c.returned_qty || 0,
        pending_qty: c.pending_qty || 0,
        pending_reason: (c.pending_qty || 0) > 0 ? c.pending_reason : undefined,
        pending_notes: (c.pending_qty || 0) > 0 ? c.pending_notes || undefined : undefined,
      }))

  const doSave = async () => {
    if (!reseller) return
    const unclassifiedQty = stockItems.reduce((total, item) => total + remainingOf(item), 0)
    if (unclassifiedQty > 0) {
      toast.error(`Há ${unclassifiedQty} peça(s) em posse sem destinação — marque a devolução ou justifique o extravio.`)
      setConfirmAction(null)
      return
    }
    if (issueItems.some((item) => !(conferenceMap[item.product]?.pending_notes || '').trim())) {
      toast.error('Informe a observação obrigatória para cada peça marcada como extraviada.')
      setConfirmAction(null)
      return
    }
    const items = buildItemsPayload()
    if (items.length === 0) {
      toast.error('Nenhuma peça marcada para devolução ou extravio.')
      setConfirmAction(null)
      return
    }
    setIsSubmitting(true)
    try {
      await resellerStockService.processReturn({
        reseller_id: reseller.id,
        items,
        notes: notes || undefined,
        commission_rate: commission ?? reseller.commission_rate ?? undefined,
      })
      toast.success('Devolução salva com sucesso!')
      setConferenceMap({})
      setNotes('')
      setConfirmAction(null)
      const fresh = await resellerStockService.getAllResellerStockItems(reseller.id)
      setStockItems(fresh)
    } catch (err: any) {
      toast.error(getBackendErrorMessage(err) || 'Erro ao salvar devolução.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const doCancel = () => {
    setConferenceMap({})
    setNotes('')
    setConfirmAction(null)
    navigate(`/revendedoras?reseller=${resellerId}`)
  }

  if (!resellerId) {
    return (
      <div className="py-16 text-center text-xs text-[#8C8275] max-w-md mx-auto space-y-2">
        <p>Nenhuma revendedora selecionada.</p>
        <p className="text-[11px]">
          Abra a conferência pelo card da revendedora na página{' '}
          <Link to="/revendedoras" className="text-[#7A5C2E] font-bold underline">
            Revendedoras
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5DFD5] pb-4">
        <div className="space-y-1">
          <Link
            to={`/revendedoras?reseller=${resellerId}`}
            className="text-xs text-[#7A5C2E] hover:text-[#634923] font-medium flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a ficha da revendedora
          </Link>
          <h2 className="font-serif text-xl font-bold text-[#2D2A26] flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-[#7A5C2E]" />
            Conferência &amp; Devolução — {reseller?.name || '...'}
          </h2>
          <p className="text-xs text-[#6B655E]">
            Escaneie ou busque as peças para dar baixa, marque extravios e escolha o percentual de
            lucro do acerto.
          </p>
        </div>
        {/* Indicador do leitor global */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border shrink-0 ${
            scanStatus === 'ready'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : scanStatus === 'ok'
                ? 'bg-[#F3EAD8] border-[#C6A664] text-[#7A5C2E]'
                : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          <ScanLine className="h-4 w-4" />
          {scanStatus === 'ready' ? 'Pronto para escanear' : scanMsg}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-[#8C8275]">Carregando conferência...</div>
      ) : (
        <>
          {loadError && (
            <div className="p-4 rounded-xl border border-red-300 bg-red-50 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="text-xs text-red-800"><strong>Falha ao carregar a conferência.</strong><br />{loadError}</div>
              <Button type="button" size="sm" variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="border-red-300 text-red-700"><RefreshCw className="h-3.5 w-3.5 mr-1" />Tentar novamente</Button>
            </div>
          )}
          {/* Busca com dropdown ao vivo + leitor */}
          <div className="p-3 bg-[#F3EAD8]/50 rounded-xl border border-[#C6A664]/60 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative">
                <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5 mb-1">
                  <Search className="h-3.5 w-3.5" /> Buscar peça (código ou nome)
                </Label>
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Ex: 1234 ou Anel..."
                  className="text-xs bg-white"
                />
                {searchText && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E5DFD5] rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="p-3 text-xs text-[#8C8275]">Nenhuma peça encontrada.</p>
                    ) : (
                      searchResults.map((it, idx) => {
                        const p = it.expand?.product
                        return (
                          <button
                            key={`${it.id || 'sem-id'}-${p?.code || it.product || 'sem-cod'}-${idx}`}
                            type="button"
                            onClick={() => {
                              registerOne(it.product, p?.code || getProductFullName(p!) || 'Joia')
                              setSearchText('')
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-[#FDFBF7] border-b border-[#E5DFD5]/60 last:border-0 flex items-center gap-2"
                          >
                            <Package className="h-3.5 w-3.5 text-[#C6A664] shrink-0" />
                            <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                              {p?.code}
                            </span>
                            <span className="text-xs text-[#2D2A26] truncate flex-1">
                              {getProductFullName(p!) || p?.description || p?.nome_produto}
                            </span>
                            <span className="text-[11px] text-[#6B655E] shrink-0">
                              {it.quantity} un
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5 mb-1">
                  <Barcode className="h-3.5 w-3.5" /> Leitor de código de barras (global)
                </Label>
                <div className="h-9 flex items-center px-3 rounded-md border border-dashed border-[#C6A664] bg-white text-xs text-[#6B655E] font-medium">
                  Escaneie sem clicar em nada — cada leitura = +1 devolução
                </div>
              </div>
            </div>
            {scanStatus === 'notfound' && (
              <div className="p-3 rounded-xl bg-red-600 text-white font-semibold text-xs flex items-center gap-2.5 shadow-md">
                <AlertTriangle className="h-5 w-5 text-amber-200 shrink-0" />
                <div className="flex-1 leading-relaxed">
                  <p className="font-bold uppercase tracking-wider text-[11px] text-amber-200">
                    Atenção — Peça não autorizada
                  </p>
                  <p>{scanMsg}</p>
                </div>
              </div>
            )}
          </div>

          {stockItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8C8275] border border-[#E5DFD5] rounded-xl bg-[#FDFBF7]">
              <Boxes className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-60" />
              <p className="font-semibold text-sm text-[#2D2A26]">
                Nenhuma joia em poder desta revendedora.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-[#F3EAD8]/60 border-b border-[#E5DFD5] text-xs font-bold text-[#7A5C2E]">Peças em posse</div>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-[#FDFBF7] text-[#7A5C2E]"><tr><th className="p-2">Foto</th><th className="p-2">Código / Joia</th><th className="p-2 text-center">Posse</th><th className="p-2 text-center">Restante</th><th className="p-2"></th></tr></thead>
                      <tbody className="divide-y divide-[#E5DFD5]">{stockItems.map((it, idx) => { const p=it.expand?.product; const photo=p?getProductDisplayPhoto(p):null; const remaining=remainingOf(it); const pending=remaining>0; return <tr key={`${it.id || it.product}-${idx}`} className={pending ? 'bg-amber-50/70' : ''}><td className="p-2">{photo ? <img src={photo} alt={getProductFullName(p) || 'Joia'} className="h-9 w-9 rounded-lg object-cover border border-[#E5DFD5]" /> : <div className="h-9 w-9 rounded-lg bg-neutral-100 flex items-center justify-center"><Package className="h-4 w-4 text-[#C6A664]" /></div>}</td><td className="p-2"><p className="font-mono font-bold text-[#7A5C2E]">{p?.code || '—'}</p><p className="text-[#2D2A26]">{getProductFullName(p!) || p?.description || p?.nome_produto || 'Joia'}</p></td><td className="p-2 text-center font-bold">{it.quantity}</td><td className={`p-2 text-center font-bold ${pending ? 'text-amber-800' : 'text-emerald-700'}`}>{remaining}</td><td className="p-2 text-right space-y-1"><Button type="button" size="sm" disabled={remaining === 0} onClick={() => registerOne(it.product, p?.code || 'Joia')} className="h-7 text-[11px] bg-[#7A5C2E] hover:bg-[#634923]">+1 →</Button>{remaining > 0 && <Button type="button" size="sm" variant="outline" onClick={() => { handleItemChange(it.product, 'pending_qty', remaining); handleItemChange(it.product, 'pending_reason', 'extraviada') }} className="h-7 text-[10px] border-amber-300 text-amber-800 block ml-auto">Extraviar</Button>}</td></tr>})}</tbody>
                    </table>
                  </div>
                </div>
                <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-bold text-emerald-800 flex justify-between"><span>Sendo devolvido agora</span><span>{totalReturningQty} peça(s)</span></div>
                  {returningItems.length === 0 ? <p className="p-6 text-center text-xs text-[#8C8275]">Escaneie, busque ou use “+1 →” para iniciar a devolução.</p> : <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-[#FDFBF7] text-[#7A5C2E]"><tr><th className="p-2">Foto</th><th className="p-2">Código / Joia</th><th className="p-2 text-center">Qtd.</th></tr></thead><tbody className="divide-y divide-[#E5DFD5]">{returningItems.map((it, idx) => { const p=it.expand?.product; const photo=p?getProductDisplayPhoto(p):null; const conf=conferenceMap[it.product]; const canAdd=remainingOf(it)>0; return <tr key={`${it.id || it.product}-${idx}`}><td className="p-2">{photo ? <img src={photo} alt={getProductFullName(p) || 'Joia'} className="h-9 w-9 rounded-lg object-cover border border-[#E5DFD5]" /> : <Package className="h-4 w-4 text-[#C6A664]" />}</td><td className="p-2"><p className="font-mono font-bold text-[#7A5C2E]">{p?.code || '—'}</p><p className="text-[#2D2A26]">{getProductFullName(p!) || p?.description || p?.nome_produto || 'Joia'}</p></td><td className="p-2"><div className="flex items-center justify-center gap-1"><Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => handleItemChange(it.product, 'returned_qty', Math.max(0, (conf.returned_qty || 0) - 1))}><Minus className="h-3 w-3" /></Button><span className="font-bold w-7 text-center">{conf.returned_qty}</span><Button type="button" variant="outline" size="sm" disabled={!canAdd} className="h-7 w-7 p-0" onClick={() => registerOne(it.product, p?.code || 'Joia')}><Plus className="h-3 w-3" /></Button></div></td></tr>})}</tbody></table></div>}
                </div>
              </div>

              {/* 3ª tabela: EXTRAVIOS */}
              {issueItems.length > 0 && (
                <div className="border border-amber-300 rounded-xl overflow-hidden bg-white">
                  <div className="px-3 py-2 bg-amber-50 border-b border-amber-300 text-xs font-bold text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Extravios (não serão cobrados no acerto de devolução — geram pendência)
                  </div>
                  <div className="divide-y divide-[#E5DFD5]">
                    {issueItems.map((it, idx) => {
                      const p = it.expand?.product
                      const conf = conferenceMap[it.product]
                      return (
                        <div
                          key={`${it.id || 'sem-id'}-${p?.code || it.product || 'sem-cod'}-${idx}`}
                          className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                        >
                          <div className="min-w-[140px] flex-1">
                            <p className="font-mono font-bold text-[#7A5C2E]">
                              {p?.code}
                              {p?.variacao ? ` — ${p.variacao}` : ''}
                            </p>
                            <p className="truncate text-[#2D2A26]">
                              {getProductFullName(p!) || p?.description || p?.nome_produto}
                            </p>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={Math.max(0, it.quantity - (conf.returned_qty || 0))}
                            value={conf.pending_qty || ''}
                            onChange={(e) =>
                              handleItemChange(
                                it.product,
                                'pending_qty',
                                Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), Math.max(0, it.quantity - (conf.returned_qty || 0))),
                              )
                            }
                            className="w-16 h-8 text-center rounded-md border border-amber-300 bg-white font-bold"
                            title="Quantidade extraviada"
                          />
                          <select
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
                          <input
                            type="text"
                            placeholder="Obs..."
                            value={conf.pending_notes}
                            onChange={(e) =>
                              handleItemChange(it.product, 'pending_notes', e.target.value)
                            }
                            className="flex-1 min-w-[120px] h-8 rounded-md border border-amber-300 bg-white text-[11px] px-2"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#B3261E]"
                            onClick={() => handleItemChange(it.product, 'pending_qty', 0)}
                            title="Remover do extravio"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="border border-[#E5DFD5] rounded-xl overflow-hidden bg-white">
                <div className="px-3 py-2 bg-emerald-50/70 border-b border-emerald-200 text-xs font-bold text-emerald-800">Vendidas</div>
                {soldSaleRows.length === 0 ? <p className="p-5 text-center text-xs text-[#8C8275]">Nenhuma venda concluída no PDV desta revendedora.</p> : <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-[#FDFBF7] text-[#7A5C2E]"><tr><th className="p-2">Foto</th><th className="p-2">Código</th><th className="p-2">Nome</th><th className="p-2 text-center">Qtd.</th><th className="p-2">Data da venda</th><th className="p-2">Venda</th></tr></thead><tbody className="divide-y divide-[#E5DFD5]">{soldSaleRows.map((row, idx) => { const photo=row.product?getProductDisplayPhoto(row.product):null; return <tr key={`${row.saleCode}-${row.product_id}-${idx}`}><td className="p-2">{photo ? <img src={photo} alt={getProductFullName(row.product) || row.description || 'Joia'} className="h-9 w-9 rounded-lg object-cover border border-[#E5DFD5]" /> : <Package className="h-4 w-4 text-[#C6A664]" />}</td><td className="p-2 font-mono font-bold text-[#7A5C2E]">{row.code || row.product?.code || '—'}</td><td className="p-2 text-[#2D2A26]">{getProductFullName(row.product!) || row.description || 'Joia'}</td><td className="p-2 text-center font-bold">{row.quantity}</td><td className="p-2 text-[#6B655E]">{row.saleCreated ? new Date(row.saleCreated).toLocaleString('pt-BR') : '—'}</td><td className="p-2 font-mono text-[#7A5C2E]">{row.saleCode}</td></tr>})}</tbody></table></div>}
              </div>

              {/* Percentuais de lucro */}
              <div className="p-3 rounded-xl bg-[#F3EAD8]/50 border border-[#C6A664]/60">
                <Label className="text-xs font-bold text-[#7A5C2E] flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4" />
                  Percentual de lucro da devolução
                </Label>
                <div className="flex gap-2 mt-2">
                  {[30, 35, 40].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCommission(pct)}
                      className={`h-9 flex-1 rounded-lg text-xs font-bold border transition-colors ${
                        activeCommission === pct
                          ? 'bg-[#7A5C2E] text-white border-[#7A5C2E] shadow-xs'
                          : 'bg-white text-[#7A5C2E] border-[#C6A664] hover:bg-[#7A5C2E]/10'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards de totais */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard
                  label="Total Recebido"
                  value={totalReceivedValue}
                  qty={totalReceivedQty}
                  icon={<Boxes className="h-4 w-4" />}
                  tone="border-[#E5DFD5] bg-white text-[#6B655E]"
                />
                <StatCard
                  label="Total Vendido"
                  value={totalSoldValue}
                  qty={totalSoldQty}
                  icon={<DollarSign className="h-4 w-4" />}
                  tone="border-emerald-200 bg-emerald-50/60 text-emerald-800"
                />
                <StatCard
                  label="Total Extraviado"
                  value={totalIssuedValue}
                  qty={totalIssuedQty}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  tone="border-amber-200 bg-amber-50/60 text-amber-800"
                />
                <StatCard
                  label="Total à Devolver"
                  value={totalReturningValue}
                  qty={totalReturningQty}
                  icon={<RotateCcw className="h-4 w-4" />}
                  tone="border-[#C6A664] bg-[#FDFBF7] text-[#7A5C2E]"
                />
                <StatCard
                  label={`Total de Lucro (${activeCommission}%)`}
                  value={totalProfit}
                  qty={totalSoldQty}
                  icon={<TrendingUp className="h-4 w-4" />}
                  tone="border-emerald-300 bg-emerald-50 text-emerald-900"
                />
              </div>

              <div>
                <Label className="text-xs text-[#6B655E]">Observações gerais da devolução:</Label>
                <Input
                  placeholder="Ex: Devolução periódica recebida no balcão da loja..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs mt-1"
                />
              </div>

              {/* Confirmação sim/não */}
              {confirmAction && (
                <div className="p-4 rounded-xl border border-[#C6A664] bg-[#FDFBF7] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#2D2A26]">
                    {confirmAction === 'save'
                      ? 'Deseja prosseguir e salvar a devolução (baixa no estoque da revendedora)?'
                      : 'Deseja prosseguir e cancelar? As contagens desta tela serão descartadas.'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={confirmAction === 'save' ? doSave : doCancel}
                      className="bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs"
                    >
                      Sim
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => setConfirmAction(null)}
                      className="text-xs border-[#E5DFD5]"
                    >
                      Não
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5DFD5]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction('cancel')}
                  className="text-xs border-[#E5DFD5]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => setConfirmAction('save')}
                  disabled={isSubmitting || stockItems.length === 0}
                  className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-medium text-xs h-9 px-6 shadow-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSubmitting ? 'Salvando...' : 'Salvar Devolução'}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Pequeno wrapper p/ manter assinatura estável de handleItemChange sem importar useCallback
// no topo do arquivo de forma redundante.
function useCallbackLike<T extends (...args: any[]) => any>(fn: T, deps: any[]): T {
  const ref = useRef(fn)
  ref.current = fn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return ref.current
}
