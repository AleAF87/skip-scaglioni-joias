import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Plus, Trash2, ScanLine, Search, Upload, Tags, PackageOpen } from 'lucide-react'
import { productService } from '@/services/productService'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { PrintQueueItem, LabelPrintModal } from '@/components/LabelPrintModal'
import { LABEL_TEMPLATES, LabelTemplateModel } from '@/types/labels'
import {
  DEFAULT_LABEL_CONTENT,
  LabelContentOptions,
  getProductFullName,
} from '@/types/labelContent'
import { getProductBarcodeValue } from '@/lib/barcodeSearch'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { BarcodeBatchUploadModal } from '@/components/labels/BarcodeBatchUploadModal'
import { MatchResult } from '@/lib/barcodeBatchMatcher'

/**
 * Geração de Etiquetas (v0.0.247 — página reconstruída).
 * Regras consolidadas:
 * - Produto adicionado entra no TOPO da fila; etiqueta em branco entra no FINAL.
 * - Contagem no badge: "N etiquetas · M preenchidas · K vazias".
 * - Busca CONSULTA O SERVIDOR (productService.getProducts com filter no backend).
 * - Leitor de código: igual ao PDV — lê sem campo selecionado, apaga o valor
 *   anterior e preenche o novo; Enter aciona resolveBarcode (inclusive variação).
 * - Tabela SEM "Produto ID"; "Valor unitário" após "Estoque atual".
 * - Impressão via LabelPrintModal (geometria e ordem intocadas).
 */
export default function LabelGenerationPage() {
  // ---------- Fila de impressão ----------
  const [queue, setQueue] = useState<PrintQueueItem[]>([])
  const [templateId, setTemplateId] = useState<string>('A4349')
  const [contentOptions, setContentOptions] = useState<LabelContentOptions>(DEFAULT_LABEL_CONTENT)
  const [printOpen, setPrintOpen] = useState(false)

  // ---------- Busca (servidor) ----------
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [totalFound, setTotalFound] = useState(0)
  const [loading, setLoading] = useState(false)

  // ---------- Leitor / destaque ----------
  const [scannerOpen, setScannerOpen] = useState(false)
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null)
  const [scannedVariation, setScannedVariation] = useState<{
    code: string
    variacao: string
    quantity: number
  } | null>(null)

  // ---------- Upload em lote ----------
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchProducts, setBatchProducts] = useState<Product[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  const template: LabelTemplateModel = LABEL_TEMPLATES[templateId] || LABEL_TEMPLATES.A4349

  // ---------- Contadores ----------
  const counts = useMemo(() => {
    const filled = queue.filter((i) => i.type === 'product').length
    const empty = queue.filter((i) => i.type === 'empty').length
    return { total: queue.length, filled, empty }
  }, [queue])

  // ---------- Busca com debounce (filter no backend) ----------
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const res = await productService.getProducts({
          search: debouncedSearch || undefined,
          perPage: 50,
          sort: '-created',
        })
        if (!cancelled) {
          setResults(res.items)
          setTotalFound(res.totalItems)
        }
      } catch (err) {
        console.error('Erro ao buscar produtos:', err)
        if (!cancelled) {
          setResults([])
          setTotalFound(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  // ---------- Fila: helpers ----------
  const toQueueItem = useCallback((p: Product, qty?: number): PrintQueueItem => {
    const barcodeValue = getProductBarcodeValue(p)
    return {
      id: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'product',
      productId: p.id,
      code: p.code || barcodeValue,
      barcodeValue,
      skuEcommerce: p.sku_novo || '',
      description: p.description || '',
      fullName: getProductFullName(p),
      price: p.selling_price || 0,
      quantity: qty ?? Math.max(1, p.quantity || 0),
    }
  }, [])

  // Produto vai ao TOPO da fila, com a quantidade = estoque atual.
  const addProductToQueue = useCallback(
    (p: Product) => {
      setQueue((prev) => [toQueueItem(p), ...prev])
      toast({ title: `Etiqueta adicionada: ${p.code || p.description}` })
    },
    [toQueueItem],
  )

  // Etiqueta em branco vai ao FINAL da fila.
  const addBlankToQueue = useCallback(() => {
    setQueue((prev) => [
      ...prev,
      {
        id: `blank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'empty',
        code: '',
        barcodeValue: '',
        description: 'Etiqueta em branco',
        fullName: '',
        price: 0,
        quantity: 1,
      },
    ])
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const updateQueueQty = useCallback((id: string, qty: number) => {
    setQueue((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.floor(qty || 1)) } : i)),
    )
  }, [])

  // ---------- Leitor de código (mesmo comportamento do PDV/Estoque) ----------
  const handleScan = useCallback(async (barcode: string): Promise<boolean> => {
    const code = barcode.trim()
    if (!code) return true
    // APAGA o que estava e preenche o novo valor capturado (nunca acumular).
    setSearch(code)
    try {
      const res = await productService.resolveBarcode(code)
      if (res?.matched && res.product) {
        const resolved = res.product
        setScannedVariation(null)
        setHighlightedProductId(resolved.id)
        setTimeout(() => {
          document
            .getElementById(`label-row-${resolved.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
        if (res.resolution === 'variation' && res.variations?.length) {
          const v = res.variations[0]
          setScannedVariation({
            code: v.code || '',
            variacao: v.variacao || '',
            quantity: v.quantity ?? 0,
          })
          toast({ title: `Variação localizada: ${resolved.code} — ${v.variacao || ''}` })
        } else {
          toast({ title: `Produto localizado: ${resolved.code}` })
        }
        return true
      }
      if (res?.matched && res.ambiguous) {
        toast({ title: 'Código ambíguo: refine a busca (leia a etiqueta completa do produto).' })
        return true
      }
      toast({ title: 'Código não encontrado.' })
      return false
    } catch (err) {
      console.error('Erro ao resolver código de barras:', err)
      toast({ title: 'Código não encontrado.' })
      return false
    }
  }, [])

  // Leitor físico: lê INDEPENDENTE de o campo estar selecionado.
  // Buffer global de teclas rápidas; Enter finaliza a leitura e resolve.
  useEffect(() => {
    let buffer = ''
    let lastTime = 0
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTypingField =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      // Digitando num campo (busca/quantidade): o Enter do campo resolve; não intercepta.
      if (isTypingField) return
      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        if (code) {
          e.preventDefault()
          void handleScan(code)
        }
        return
      }
      if (e.key.length === 1) {
        const now = Date.now()
        // Nova leitura (pausa longa): descarta o buffer anterior — nunca acumular.
        if (now - lastTime > 100) buffer = ''
        buffer += e.key
        lastTime = now
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleScan])

  // Enter no campo de busca também resolve (digitação manual no formato do PDV).
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) void handleScan(search.trim())
  }

  // ---------- Upload em lote ----------
  const openBatchModal = useCallback(async () => {
    setBatchOpen(true)
    setBatchLoading(true)
    try {
      const records = await productService.getProducts({ perPage: 500, sort: '-created' })
      setBatchProducts(records.items)
    } catch (err) {
      console.error('Erro ao carregar produtos para o lote:', err)
      toast({ title: 'Não foi possível carregar os produtos para conferência do lote.' })
    } finally {
      setBatchLoading(false)
    }
  }, [])

  const handleApplyBatch = useCallback(
    (matchedIds: string[], result: MatchResult) => {
      const matched = matchedIds
        .map((id) => batchProducts.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p))
      // Produtos do lote entram no TOPO da fila (mais recentes primeiro);
      // etiquetas em branco que já estavam no final permanecem no final.
      setQueue((prev) => [...matched.map((p) => toQueueItem(p)), ...prev])
      toast({
        title: `${result.matchedCount} produto(s) adicionado(s) de ${result.totalInputCodes} códigos da lista; ${result.unmatchedCount} sem correspondência.`,
      })
    },
    [batchProducts, toQueueItem],
  )

  const contentToggle = (key: keyof LabelContentOptions, labelText: string) => (
    <div key={key} className="flex items-center gap-2">
      <Checkbox
        id={`label-opt-${key}`}
        checked={contentOptions[key]}
        onCheckedChange={(v) => setContentOptions((prev) => ({ ...prev, [key]: !!v }))}
      />
      <Label htmlFor={`label-opt-${key}`} className="text-xs text-[#6B655E] cursor-pointer">
        {labelText}
      </Label>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
              <Tags className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
              Geração de Etiquetas
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            Monte a fila de etiquetas, adicione em branco para reaproveitar folhas e imprima no
            gabarito Pimaco.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Badge de contagem: três quantidades */}
          <Badge
            variant="outline"
            className="border-[#C6A664] bg-[#FDFBF7] text-[#7A5C2E] text-xs px-3 py-1.5 h-auto"
          >
            {counts.total} etiquetas · {counts.filled} preenchidas · {counts.empty} vazias
          </Badge>

          <Button
            type="button"
            variant="outline"
            onClick={addBlankToQueue}
            className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
          >
            <PackageOpen className="h-4 w-4 mr-1.5" />
            Etiqueta em branco
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={openBatchModal}
            className="border-[#7A5C2E] text-[#7A5C2E] bg-[#FDFBF7] hover:bg-[#F3EAD8] font-semibold"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            Upload em lote
          </Button>

          <Button
            type="button"
            onClick={() => setPrintOpen(true)}
            disabled={counts.total === 0}
            className="bg-[#7A5C2E] hover:bg-[#634924] text-white font-bold"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir fila ({counts.total})
          </Button>
        </div>
      </div>

      {/* Busca com leitor de código de barras */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código, SKU, nome ou descrição (Enter resolve leitura de variação, ex.: 1106 V1)"
                className="pl-9 pr-24 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
                aria-label="Buscar produtos"
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute right-2 top-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#7A5C2E] hover:bg-[#F3EAD8]"
                aria-label="Abrir leitor de código de barras"
              >
                <ScanLine className="h-4 w-4" />
                Ler código
              </button>
            </div>
            <Button
              type="submit"
              variant="outline"
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
            >
              Resolver código
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabela de produtos buscados (servidor) */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-[#E5DFD5] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#2D2A26]">
              Produtos encontrados{' '}
              <span className="text-[#6B655E] font-normal">
                ({loading ? 'buscando…' : `${results.length} de ${totalFound} no servidor`})
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5DFD5] bg-[#FDFBF7] text-left text-xs uppercase tracking-wide text-[#6B655E]">
                  <th className="py-2.5 px-4 font-semibold">Código</th>
                  <th className="py-2.5 px-4 font-semibold">Nome do produto</th>
                  <th className="py-2.5 px-4 font-semibold">Estoque atual</th>
                  <th className="py-2.5 px-4 font-semibold">Valor unitário</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[#6B655E]">
                      {loading ? 'Buscando produtos…' : 'Nenhum produto encontrado.'}
                    </td>
                  </tr>
                ) : (
                  results.map((p) => {
                    const isHighlighted = highlightedProductId === p.id
                    const varBadge = isHighlighted
                      ? scannedVariation?.variacao || scannedVariation?.code || ''
                      : ''
                    return (
                      <tr
                        key={p.id}
                        id={`label-row-${p.id}`}
                        className={`border-b border-[#F3EAD8] transition-colors hover:bg-[#FDFBF7] ${
                          isHighlighted ? 'bg-[#C6A664]/25 ring-1 ring-inset ring-[#7A5C2E]' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <span className="font-mono text-xs font-bold text-[#7A5C2E]">
                            {p.codigo_barras ||
                              p.codigo_barras_tecson ||
                              p.sku_novo ||
                              p.sku_scaglioni ||
                              p.code}
                          </span>
                          {varBadge && (
                            <Badge
                              variant="outline"
                              className="ml-2 border-[#7A5C2E] text-[#7A5C2E] bg-white text-[9px] px-1.5 py-0 h-4 font-semibold"
                            >
                              {varBadge}
                              {typeof scannedVariation?.quantity === 'number' &&
                                ` · ${scannedVariation.quantity} un.`}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[#2D2A26]">
                          {p.nome_produto?.trim() || p.description}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-[#2E7D4F] text-center">
                          {p.quantity ?? 0}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#2D2A26]">
                          {(p.selling_price ?? 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => addProductToQueue(p)}
                            className="h-8 bg-[#7A5C2E] hover:bg-[#634924] text-white"
                            aria-label={`Adicionar etiqueta do produto ${p.code || p.description}`}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fila de impressão */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-[#E5DFD5] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#2D2A26]">
              Fila de impressão{' '}
              <span className="text-[#6B655E] font-normal">
                (produtos no topo · brancas no final)
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="h-8 rounded-md border border-[#E5DFD5] bg-white px-2 text-xs text-[#2D2A26]"
                aria-label="Gabarito de impressão"
              >
                {Object.values(LABEL_TEMPLATES).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {queue.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQueue([])}
                  className="h-8 text-[#B3261E] hover:bg-[#B3261E]/10"
                >
                  Limpar fila
                </Button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center gap-4 border-b border-[#F3EAD8]">
            {contentToggle('showCode', 'Imprimir código abaixo do código de barras')}
            {contentToggle('showFullName', 'Imprimir nome/categoria')}
            {contentToggle('showSellingPrice', 'Imprimir preço de venda')}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5DFD5] bg-[#FDFBF7] text-left text-xs uppercase tracking-wide text-[#6B655E]">
                  <th className="py-2.5 px-4 font-semibold w-16">#</th>
                  <th className="py-2.5 px-4 font-semibold">Conteúdo</th>
                  <th className="py-2.5 px-4 font-semibold w-24 text-center">Qtd</th>
                  <th className="py-2.5 px-4 font-semibold text-right w-20">Ação</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-[#6B655E]">
                      Fila vazia. Adicione produtos pela busca ou etiquetas em branco.
                    </td>
                  </tr>
                ) : (
                  queue.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-b border-[#F3EAD8] ${
                        item.type === 'empty' ? 'bg-[#FDFBF7]/60' : ''
                      }`}
                    >
                      <td className="py-2 px-4 font-mono text-xs text-[#6B655E]">{idx + 1}</td>
                      <td className="py-2 px-4">
                        {item.type === 'empty' ? (
                          <span className="text-[#6B655E] italic">Etiqueta em branco</span>
                        ) : (
                          <div className="min-w-0">
                            <span className="font-mono text-xs font-bold text-[#7A5C2E] mr-2">
                              {item.code}
                            </span>
                            <span className="text-[#2D2A26]">
                              {item.fullName || item.description}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => updateQueueQty(item.id, parseInt(e.target.value, 10))}
                          className="h-8 w-16 mx-auto text-center"
                          aria-label={`Quantidade de etiquetas — ${item.type === 'empty' ? 'em branco' : item.code}`}
                        />
                      </td>
                      <td className="py-2 px-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromQueue(item.id)}
                          className="h-8 w-8 text-[#B3261E] hover:bg-[#B3261E]/10"
                          aria-label={`Remover item ${item.type === 'empty' ? 'etiqueta em branco' : item.code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Leitor de código de barras (câmera) — mesmo componente do PDV */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => handleScan(code)}
        originTitle="Geração de Etiquetas"
      />

      {/* Upload em lote (planilha/lista de códigos) */}
      <BarcodeBatchUploadModal
        open={batchOpen}
        onOpenChange={setBatchOpen}
        products={batchProducts}
        onApplySelection={handleApplyBatch}
      />

      {/* Prévia de impressão — geometria e ordem intocadas */}
      <LabelPrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        template={template}
        items={queue}
        contentOptions={contentOptions}
      />
    </div>
  )
}
