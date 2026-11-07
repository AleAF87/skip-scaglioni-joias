import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Sparkles, Tag, AlertCircle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarcodeLabelCard } from '@/components/BarcodeLabelCard'
import { getProductDisplayPhoto } from '@/lib/formatters'
import { BarcodeLabelsHeader } from '@/components/labels/BarcodeLabelsHeader'
import { BarcodeLabelsFilterBar, GridColumns } from '@/components/labels/BarcodeLabelsFilterBar'
import { BarcodeLabelsSelectionTable } from '@/components/labels/BarcodeLabelsSelectionTable'

export default function BarcodeLabelsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [gridColumns, setGridColumns] = useState<GridColumns>(3)
  const [showPreviewOnly, setShowPreviewOnly] = useState(false)

  // Carregar produtos direto do banco (apenas os que têm code preenchido)
  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const records = await pb.collection('products').getFullList<Product>({
        filter: "code != ''",
        sort: '-created',
        expand: 'type,material,size',
      })
      // Garante em memória que o campo code não é vazio
      const validCodeProducts = records.filter((p) => Boolean(p.code && p.code.trim()))
      setProducts(validCodeProducts)
    } catch (err: any) {
      console.error('Erro ao carregar produtos para etiquetas:', err)
      setError('Não foi possível carregar os produtos do banco de dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Produtos filtrados por busca e disponibilidade
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      // Regra 5: Produto sem code não entra
      if (!p.code || !p.code.trim()) return false

      if (onlyAvailable) {
        const qty = p.quantity ?? 0
        const isAvail = p.status === 'available' || qty > 0
        if (!isAvail) return false
      }

      if (!q) return true

      const codeMatch = p.code.toLowerCase().includes(q)
      const descMatch = (p.description || '').toLowerCase().includes(q)
      const nameMatch = (p.nome_produto || '').toLowerCase().includes(q)
      const skuNovoMatch = (p.sku_novo || '').toLowerCase().includes(q)
      const skuScagMatch = (p.sku_scaglioni || '').toLowerCase().includes(q)

      return codeMatch || descMatch || nameMatch || skuNovoMatch || skuScagMatch
    })
  }, [products, search, onlyAvailable])

  // Itens para impressão: se houver seleção, usa os selecionados; senão, todos os filtrados
  const productsToPrint = useMemo(() => {
    if (selectedIds.length > 0) {
      const selectedSet = new Set(selectedIds)
      return filteredProducts.filter((p) => selectedSet.has(p.id))
    }
    return filteredProducts
  }, [filteredProducts, selectedIds])

  // Toggle de seleção
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredProducts.map((p) => p.id)
    const allSelected = filteredIds.every((id) => selectedIds.includes(id))
    if (allSelected) {
      // Remove os filtrados da seleção
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
    } else {
      // Adiciona todos os filtrados à seleção
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleClearSelection = () => {
    setSelectedIds([])
  }

  // Disparo da impressão nativa do navegador (permite Salvar como PDF)
  const handlePrint = () => {
    window.print()
  }

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.includes(p.id))

  return (
    <div className="space-y-6">
      {/* Estilos CSS específicos de impressão: garante que NADA do layout saia no papel exceto a grade de etiquetas */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 8mm;
          }
          /* Oculta tudo que não for a área de impressão de etiquetas */
          body * {
            visibility: hidden !important;
          }
          #barcode-print-sheet,
          #barcode-print-sheet * {
            visibility: visible !important;
          }
          #barcode-print-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .barcode-label-card {
            border: 1px solid #000000 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header com Navegação e Título */}
      <BarcodeLabelsHeader countToPrint={productsToPrint.length} onPrint={handlePrint} />

      {/* Alerta explicativo do objetivo */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#F8F3EA] via-white to-[#F3EAD8] border border-[#C6A664]/40 flex items-start gap-3 no-print text-xs text-[#2D2A26]">
        <Sparkles className="h-4 w-4 text-[#7A5C2E] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#7A5C2E]">
            Códigos reais lidos por leitores físicos e câmeras do PDV &amp; Consignação
          </p>
          <p className="text-[#6B655E] leading-relaxed">
            Cada etiqueta desenha exatamente o código alfanumérico armazenado no campo{' '}
            <strong className="font-mono text-[#2D2A26]">code</strong> do produto em formato{' '}
            <strong>Code 128</strong> (compatível com números, letras maiúsculas/minúsculas e
            espaços). Use o botão <strong>Imprimir / Salvar PDF</strong> para imprimir em folha A4
            ou salvar como arquivo PDF.
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <BarcodeLabelsFilterBar
        search={search}
        onSearchChange={setSearch}
        onlyAvailable={onlyAvailable}
        onToggleOnlyAvailable={() => setOnlyAvailable((prev) => !prev)}
        gridColumns={gridColumns}
        onGridColumnsChange={setGridColumns}
        showPreviewOnly={showPreviewOnly}
        onTogglePreviewOnly={() => setShowPreviewOnly((prev) => !prev)}
        filteredCount={filteredProducts.length}
        totalCount={products.length}
        selectedCount={selectedIds.length}
        allFilteredSelected={allFilteredSelected}
        onSelectAllFiltered={handleSelectAllFiltered}
        onClearSelection={handleClearSelection}
      />

      {/* Conteúdo Principal */}
      {loading ? (
        <Card className="border-[#E5DFD5] bg-white p-12 text-center">
          <div className="flex flex-col items-center justify-center gap-3 text-[#6B655E]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent" />
            <p className="font-medium">
              Carregando produtos e gerando códigos de barras do banco...
            </p>
          </div>
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-8 text-center text-red-700">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-600" />
          <p className="font-semibold">{error}</p>
          <Button
            onClick={loadProducts}
            variant="outline"
            size="sm"
            className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
          >
            Tentar novamente
          </Button>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card className="border-[#E5DFD5] bg-white p-12 text-center text-[#6B655E]">
          <Tag className="h-10 w-10 text-[#C6A664] mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-[#2D2A26]">
            Nenhum produto encontrado com os filtros atuais.
          </p>
          <p className="text-xs text-[#6B655E] mt-1">
            Limpe a busca ou verifique se os produtos cadastrados possuem o campo de código
            preenchido.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch('')
              setOnlyAvailable(false)
            }}
            className="mt-3"
          >
            Limpar filtros
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Tabela de Seleção (visível quando NÃO estiver no modo apenas grade) */}
          {!showPreviewOnly && (
            <BarcodeLabelsSelectionTable
              products={filteredProducts}
              selectedIds={selectedIds}
              onToggleSelectOne={toggleSelectOne}
            />
          )}

          {/* Área de Impressão / Grade de Etiquetas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between no-print">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2D2A26] flex items-center gap-2">
                  <span>Grade de Etiquetas</span>
                  <Badge className="bg-[#2D2A26] text-white text-xs">
                    {productsToPrint.length}{' '}
                    {productsToPrint.length === 1 ? 'etiqueta' : 'etiquetas'}
                  </Badge>
                </h3>
                <p className="text-xs text-[#6B655E]">
                  Abaixo está a visualização exata que sairá no papel/PDF quando você clicar em
                  Imprimir.
                </p>
              </div>

              <Button
                onClick={handlePrint}
                className="bg-[#2D2A26] hover:bg-black text-white font-semibold shadow-xs"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir / Salvar PDF
              </Button>
            </div>

            {/* Container Folha de Impressão (A4) */}
            <div
              id="barcode-print-sheet"
              className="bg-white p-4 sm:p-6 rounded-xl border border-[#E5DFD5] shadow-xs print:p-0 print:border-none print:shadow-none"
            >
              <div
                className={`grid gap-3 sm:gap-4 ${
                  gridColumns === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : gridColumns === 4
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                }`}
              >
                {productsToPrint.map((p) => {
                  const photo = getProductDisplayPhoto(p)
                  const displayName = p.nome_produto?.trim() || p.description || 'Produto'
                  const subtitle = [p.expand?.type?.name, p.expand?.material?.name]
                    .filter(Boolean)
                    .join(' • ')

                  return (
                    <BarcodeLabelCard
                      key={p.id}
                      code={p.code}
                      name={displayName}
                      price={p.selling_price}
                      subtitle={subtitle}
                      photoUrl={photo}
                      barcodeHeight={46}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
