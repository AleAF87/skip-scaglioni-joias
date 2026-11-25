import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Printer,
  Search,
  Plus,
  Trash2,
  Tag,
  AlertTriangle,
  Layers,
  SlidersHorizontal,
  Check,
  RotateCcw,
  ListChecks,
  Barcode,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Product, Brand, ProductCategory } from '@/types'
import { LABEL_TEMPLATES, LabelTemplateModel } from '@/types/labels'

import {
  DEFAULT_LABEL_CONTENT,
  LabelContentOptions,
  getProductFullName,
  formatVariationAttributeLabel,
} from '@/types/labelContent'
import { LabelPrintModal, PrintQueueItem } from '@/components/LabelPrintModal'
import { BarcodeScannerModal } from '@/components/pos/BarcodeScannerModal'
import { productService } from '@/services/productService'
import { fetchResellerStockQuantityMap, getProductTotalStock } from '@/services/totalStockService'
import { formatCurrency, formatDate, getProductDisplayPhoto } from '@/lib/formatters'
import { stripLeadingZeros, matchesProductQuery } from '@/lib/barcodeSearch'
import pb from '@/lib/pocketbase/client'

// Mesmo formato do estoque (v0.0.238): numérico puro ou código + sufixo de variação
// ("1106", "1106 V1", "1106-V1"). Texto livre (nome/descrição) NÃO dispara o resolvedor.
const BARCODE_CODE_PATTERN = /^\d+([\s\-_].+)?$/

const loadPersistedSearch = (): string => {
  try {
    return sessionStorage.getItem('label_generation_search') || ''
  } catch {
    return ''
  }
}

export const LabelGenerationPage: React.FC = () => {
  // 1. Estado do modelo de etiqueta
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateError, setTemplateError] = useState<string>('')

  // Conteúdo da etiqueta (sempre inicia com apenas o código marcado — não persiste entre sessões)
  const [contentOptions, setContentOptions] = useState<LabelContentOptions>(DEFAULT_LABEL_CONTENT)

  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false)
  const [manualOffsets, setManualOffsets] = useState({
    marginTop: 0,
    marginLeft: 0,
    gapHorizontal: 0,
    gapVertical: 0,
  })

  // 2. Estado dos produtos reais
  const [products, setProducts] = useState<Product[]>([])
  const [resellerStockMap, setResellerStockMap] = useState<Map<string, number>>(new Map())
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  // Erro de carregamento exibido na tabela de produtos
  const [loadError, setLoadError] = useState<string>('')
  // Busca em andamento no servidor (debounce da digitação)
  const [isSearching, setIsSearching] = useState<boolean>(false)

  // Filtros e busca de produtos
  // O valor lido pelo leitor fica FIXO no campo: só sai quando o usuário lê o próximo
  // código, digita por cima ou limpa à mão. sessionStorage cobre remontagens da rota.
  const [searchTerm, setSearchTerm] = useState<string>(loadPersistedSearch)
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [productPage, setProductPage] = useState<number>(1)
  const itemsPerPage = 8

  // 3. Fila de etiquetas a imprimir
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([])

  // Modal de prévia e impressão
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false)

  // Leitor de código de barras (consulta/filtro)
  const [scannerOpen, setScannerOpen] = useState<boolean>(false)
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null)

  // Resolve o produto-pai de uma linha de variação (id composto "produtoId:variaçãoId")
  const findParentProduct = useCallback(
    (rowId: string): Product | undefined => {
      const parentId = rowId.includes(':') ? rowId.split(':')[0] : rowId
      return products.find((prod) => prod.id === parentId)
    },
    [products],
  )

  // Busca no SERVIDOR quando há texto na busca (achar TODOS os produtos, independente
  // de idade — não só os 500 mais recentes). Sem busca, listagem paginada local dos
  // 500 mais recentes, como antes.
  const hasActiveSearch = searchTerm.trim().length > 0
  const searchRequestRef = useRef(0)

  const loadProducts = useCallback(async (search: string) => {
    const trimmed = search.trim()
    setIsLoading(true)
    try {
      if (trimmed) {
        const requestId = ++searchRequestRef.current
        setIsSearching(true)
        const filterStr = productService.buildProductFilterString({
          search: trimmed,
        })
        const allFiltered = await pb.collection('products').getFullList<Product>({
          filter: filterStr,
          sort: '-created',
          expand:
            'type,material,size,marca_id,product_category_links(product).category,product_variations(product)',
        })
        if (requestId !== searchRequestRef.current) return
        setProducts(allFiltered)
      } else {
        const productsRes = await productService.getProducts({ perPage: 500, sort: '-created' })
        setProducts(productsRes.items || [])
      }
      setLoadError('')
    } catch (err) {
      console.error('Erro ao carregar produtos para etiquetas:', err)
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar produtos para etiquetas.')
    } finally {
      if (trimmed) {
        setIsSearching(false)
      }
      setIsLoading(false)
    }
  }, [])

  // Debounce da digitação: busca no servidor 400ms após parar de digitar
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts(searchTerm)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm, loadProducts])

  // Persiste o valor do campo de busca (inclusive o código lido pelo leitor) entre
  // remontagens da rota — trocar de página no menu e voltar NÃO apaga o valor lido.
  useEffect(() => {
    try {
      sessionStorage.setItem('label_generation_search', searchTerm)
    } catch {
      // sessionStorage indisponível: o valor simplesmente não sobrevive à remontagem
    }
  }, [searchTerm])

  // Carrega marcas, categorias e mapa de estoque de revendedoras (uma vez)
  const loadAuxData = useCallback(async () => {
    try {
      const [resellerMap, brandsRes, categoriesRes] = await Promise.all([
        fetchResellerStockQuantityMap(),
        pb
          .collection('brands')
          .getFullList<Brand>({ sort: 'name' })
          .catch(() => []),
        pb
          .collection('product_categories')
          .getFullList<ProductCategory>({
            filter: 'archived = false',
            sort: 'name',
          })
          .catch(() => []),
      ])
      setResellerStockMap(resellerMap)
      setBrands(brandsRes)
      setCategories(categoriesRes)
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares das etiquetas:', err)
    }
  }, [])

  useEffect(() => {
    void loadAuxData()
  }, [loadAuxData])

  // Para produtos com variações, cada variação é uma linha/etiqueta independente.
  // O produto-pai nunca gera uma etiqueta genérica que poderia movimentar estoque errado.
  const productsForLabels = useMemo(() => {
    return products.flatMap((product) => {
      const variations = product.expand?.['product_variations(product)'] || []
      if (variations.length === 0) return [product]
      return variations.map((variation) => ({
        ...product,
        id: `${product.id}:${variation.id}`,
        quantity: Number(variation.quantity) || 0,
        qtde_inicial: Number(variation.quantity) || 0,
        selling_price: Number(variation.price) || product.selling_price,
        variacao: formatVariationAttributeLabel(variation.attributes) || variation.sku,
        selected_variation_id: variation.id,
        selected_variation_sku: variation.sku,
        selected_variation: variation,
      }))
    })
  }, [products])

  // Produtos filtrados por marca/categoria e (sem busca ativa no servidor) pelo texto local.
  // Com busca ativa, o servidor já filtra por texto — aqui sobra só marca/categoria.
  const filteredProducts = useMemo(() => {
    const filterLocally = !hasActiveSearch
    return productsForLabels.filter((p) => {
      // Filtro de marca
      if (selectedBrand !== 'all' && p.marca_id !== selectedBrand) {
        return false
      }

      // Filtro de categoria
      if (selectedCategory !== 'all') {
        const catLinks = p.expand?.['product_category_links(product)'] || []
        const hasCat = catLinks.some((l) => l.category === selectedCategory)
        if (!hasCat) return false
      }

      // Sem busca no servidor, filtra localmente por nome, Produto ID, SKU novo e código de barras
      if (filterLocally && searchTerm.trim()) {
        return matchesProductQuery(p, searchTerm)
      }

      return true
    })
  }, [productsForLabels, selectedBrand, selectedCategory, searchTerm, hasActiveSearch])

  // Paginação da tabela de produtos
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * itemsPerPage
    return filteredProducts.slice(start, start + itemsPerPage)
  }, [filteredProducts, productPage])

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1

  // Reset da paginação quando a busca ou filtros mudam
  useEffect(() => {
    setProductPage(1)
  }, [searchTerm, selectedBrand, selectedCategory])

  // Código da etiqueta: deve ser EXATAMENTE o código que os leitores resolvem
  // (backend products_barcode_resolver.js), SEM zeros à esquerda:
  // - variação manual (product_variations): "código sufixo" (ex. "1106 V1")
  // - produto sem variação: código puro (ex. "1107")
  const getProductDisplayBarcode = (p: Product): { code: string; barcodeValue: string } => {
    const cleanCode = stripLeadingZeros(p.code || p.sku_novo || '') || '0'
    // Sufixo do SKU da variação (ex. "1106-V1" -> "V1"), formando "1106 V1".
    // Sem SKU de variação, cai para o campo variacao (Tecson: "8112 N14").
    const skuVariacao = (p.selected_variation_sku || '').trim()
    const skuSuffix = skuVariacao.replace(new RegExp('^' + cleanCode + '[\\s\\-_]+'), '')
    const variacao = skuSuffix && skuSuffix !== skuVariacao ? skuSuffix : (p.variacao || '').trim()
    const full = variacao ? `${cleanCode} ${variacao}` : cleanCode
    return {
      code: full,
      barcodeValue: full,
    }
  }

  // Foto de exibição da linha da tabela/fila: cobre photos[] E image_url (produtos
  // importados Scaglioni têm photos=[] e só image_url). Variações (id composto
  // "produtoId:variaçãoId") herdam a foto do produto-pai, removendo o sufixo do id.
  const getProductRowPhoto = (p: Product): string => {
    if (p.id.includes(':')) {
      const parent = findParentProduct(p.id)
      if (parent) return getProductDisplayPhoto(parent)
    }
    return getProductDisplayPhoto(p)
  }
  // Ação 2: Adicionar produto à fila
  const handleAddProduct = (p: Product) => {
    const { code, barcodeValue } = getProductDisplayBarcode(p)
    const initialQty = p.qtde_inicial && p.qtde_inicial > 0 ? Math.floor(p.qtde_inicial) : 1
    const price = typeof p.selling_price === 'number' ? p.selling_price : 0
    const fullName = getProductFullName(p, p.selected_variation)

    // Se já estiver na fila, incrementa ou atualiza
    setPrintQueue((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === p.id && item.type === 'product',
      )
      if (existingIdx >= 0) {
        const updated = [...prev]
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + initialQty,
        }
        return updated
      }

      return [
        ...prev,
        {
          id: `prod-${p.id}-${Date.now()}`,
          type: 'product',
          productId: p.id,
          code,
          barcodeValue,
          description: p.nome_produto || p.description || 'Produto Scaglioni',
          fullName,
          price,
          quantity: initialQty,
        },
      ]
    })
  }

  // Verifica se o produto já foi adicionado
  const isProductInQueue = (productId: string) => {
    return printQueue.some((item) => item.productId === productId && item.type === 'product')
  }

  // Ação 4: Adicionar etiqueta vazia no topo
  const handleAddEmptyLabelOnTop = () => {
    setPrintQueue((prev) => [
      {
        id: `empty-${Date.now()}-${Math.random()}`,
        type: 'empty',
        code: '',
        barcodeValue: '',
        description: 'Etiqueta vazia (espaço livre na folha)',
        fullName: '',
        price: 0,
        quantity: 1,
      },
      ...prev,
    ])
  }

  // Atualiza quantidade de uma linha da fila
  const handleUpdateQuantity = (id: string, newQty: number) => {
    const safeQty = Math.max(1, Math.floor(newQty || 1))
    setPrintQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: safeQty } : item)),
    )
  }

  // Remove linha da fila
  const handleRemoveQueueItem = (id: string) => {
    setPrintQueue((prev) => prev.filter((item) => item.id !== id))
  }

  // Limpar toda a lista
  const handleClearAll = () => {
    if (
      printQueue.length > 0 &&
      !window.confirm('Deseja limpar todos os itens da lista de etiquetas?')
    ) {
      return
    }
    setPrintQueue([])
  }

  // Total dinâmico de etiquetas na fila
  const totalLabelsCount = useMemo(() => {
    return printQueue.reduce((sum, item) => sum + (Math.max(1, item.quantity) || 1), 0)
  }, [printQueue])

  // Total de produtos distintos
  const productItemsCount = useMemo(() => {
    return printQueue.filter((item) => item.type === 'product').length
  }, [printQueue])

  // Total de etiquetas vazias
  const emptyLabelsCount = useMemo(() => {
    return printQueue
      .filter((item) => item.type === 'empty')
      .reduce((sum, item) => sum + item.quantity, 0)
  }, [printQueue])

  // Ação 5: Validar e abrir modal de visualização e impressão
  const handleOpenPreview = () => {
    if (!selectedTemplateId) {
      setTemplateError('Você precisa selecionar o modelo da etiqueta.')
      // Rola até o seletor
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setTemplateError('')

    const productLabelsCount = printQueue.filter((item) => item.type === 'product').length
    if (productLabelsCount === 0) {
      alert('Adicione pelo menos um produto na lista de etiquetas a imprimir.')
      return
    }

    setIsPreviewOpen(true)
  }

  const currentTemplate: LabelTemplateModel | undefined = selectedTemplateId
    ? LABEL_TEMPLATES[selectedTemplateId]
    : undefined

  // Alterna uma opção de conteúdo da etiqueta
  const handleToggleContentOption = (key: keyof LabelContentOptions, checked: boolean) => {
    setContentOptions((prev) => ({ ...prev, [key]: checked }))
  }

  // Leitor de código de barras e Enter no formato de código (consulta/filtro):
  // resolve via productService.resolveBarcode e posiciona a lista no produto/variação,
  // preenchendo o campo de busca com o texto EXATAMENTE lido (que fica FIXO no campo,
  // substituindo o anterior — nunca acumula/anexa, a leitura seguinte troca o valor).
  const handleBarcodeScan = async (barcode: string): Promise<boolean> => {
    const code = barcode.trim()
    if (!code) return true
    try {
      const res = await productService.resolveBarcode(code)
      if (res?.matched && res.product) {
        // O valor lido SUBSTITUI o conteúdo do campo de busca (requisito do usuário:
        // "quando ler, sempre apaga o que estiver preenchido anteriormente").
        // O texto EXATAMENTE lido (ex. "1106", "1106 V1") permanece fixo no campo.
        setSearchTerm(code)
        setHighlightedProductId(res.product.id)
        setProductPage(1)
        // Rola até a linha destacada depois que a lista re-renderiza filtrada
        setTimeout(() => {
          document
            .getElementById(`label-row-${res.product!.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
        if (res.resolution === 'variation' && res.variations?.length) {
          const v = res.variations[0]
          toast.success(`Variação localizada: ${res.product.code} — ${v.variacao || v.code || ''}`)
        } else {
          toast.success(`Produto localizado: ${res.product.code}`)
        }
        return true
      }
      if (res?.matched && res.ambiguous) {
        toast.info('Código ambíguo: refine a busca (leia a etiqueta completa do produto).')
        return true
      }
      toast.error('Código não encontrado.')
      return false
    } catch (err) {
      console.error('Erro ao resolver código de barras:', err)
      toast.error('Código não encontrado.')
      return false
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. SEÇÃO SUPERIOR — CABEÇALHO E MODELO DA ETIQUETA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2D2A26] flex items-center gap-2.5">
            <Tag className="h-7 w-7 text-[#7A5C2E]" />
            Emissão de etiquetas
          </h1>
          <p className="text-sm text-[#6B655E] mt-1">
            Gere etiquetas com código de barras Code 128 em gabaritos pautados Pimaco, Maxprint e
            Singularis
          </p>
        </div>

        {/* Botão de Ação Principal */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleOpenPreview}
            className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-semibold shadow-sm hover:shadow transition-all px-5 py-2.5 h-auto text-sm"
          >
            <Printer className="h-4 w-4 mr-2" />
            Visualizar e imprimir etiquetas
          </Button>
        </div>
      </div>

      {/* Card de Configurações do Gabarito */}
      <Card className="border-[#E5DFD5] shadow-xs bg-white">
        <CardHeader className="pb-3 border-b border-[#F0EBE1] bg-[#FCFAF6]/60">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-[#2D2A26] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#7A5C2E]" />
              Configuração da Folha e Modelo
            </CardTitle>
            {currentTemplate && (
              <Badge variant="secondary" className="bg-[#F3EAD8] text-[#7A5C2E] border-[#E5DFD5]">
                {currentTemplate.labelsPerSheet} etiquetas / folha ({currentTemplate.columns}{' '}
                colunas × {currentTemplate.rows} linhas)
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-[#6B655E]">
            Selecione o fabricante e formato da folha que será utilizada na sua impressora
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            {/* Campo obrigatório: Modelo da etiqueta */}
            <div className="md:col-span-7 space-y-2">
              <Label
                htmlFor="model-select"
                className="text-sm font-semibold text-[#2D2A26] flex items-center justify-between"
              >
                <span>
                  Modelo da etiqueta <span className="text-red-500">*</span>
                </span>
                {templateError && (
                  <span className="text-xs text-red-600 font-normal flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {templateError}
                  </span>
                )}
              </Label>
              <Select
                value={selectedTemplateId}
                onValueChange={(val) => {
                  setSelectedTemplateId(val)
                  setTemplateError('')
                }}
              >
                <SelectTrigger
                  id="model-select"
                  className={`h-11 bg-white border ${
                    templateError
                      ? 'border-red-500 ring-2 ring-red-200'
                      : 'border-[#D9D1C5] focus:border-[#7A5C2E]'
                  }`}
                >
                  <SelectValue placeholder="Selecione o modelo da etiqueta..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6187">
                    A4 — Pimaco/Maxprint 6187 — 80 etiquetas por folha
                  </SelectItem>
                  <SelectItem value="A4349">A4 — Pimaco A4349 — 126 etiquetas por folha</SelectItem>
                  <SelectItem value="A4351">A4 — Pimaco A4351 — 65 etiquetas por folha</SelectItem>
                  <SelectItem value="EBF23">
                    A4 — Singularis EBF23 — Etiqueta para anel — 40 etiquetas por folha
                  </SelectItem>
                </SelectContent>
              </Select>
              {currentTemplate && (
                <p className="text-xs text-[#6B655E] pt-0.5">
                  Dimensões:{' '}
                  <strong>
                    {currentTemplate.labelWidthMm} × {currentTemplate.labelHeightMm} mm
                  </strong>{' '}
                  • Formato: {currentTemplate.sheetType} • Margem sup: {currentTemplate.marginTopMm}
                  mm, esq: {currentTemplate.marginLeftMm}mm
                </p>
              )}
            </div>

            {/* Conteúdo da etiqueta: o que o usuário quer imprimir */}
            <div className="md:col-span-5 space-y-2.5 p-3 bg-[#FCFAF6] border border-[#E5DFD5] rounded-lg">
              <div className="flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-[#7A5C2E]" />
                <Label className="text-sm font-semibold text-[#2D2A26]">
                  O que colocar na etiqueta
                </Label>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <label
                  htmlFor="label-content-code"
                  className="flex items-center gap-2 text-sm text-[#2D2A26] cursor-pointer"
                >
                  <Checkbox
                    id="label-content-code"
                    checked={contentOptions.showCode}
                    onCheckedChange={(checked) =>
                      handleToggleContentOption('showCode', checked === true)
                    }
                    className="data-[state=checked]:bg-[#7A5C2E] data-[state=checked]:border-[#7A5C2E]"
                  />
                  Código
                </label>
                <label
                  htmlFor="label-content-name"
                  className="flex items-center gap-2 text-sm text-[#2D2A26] cursor-pointer"
                >
                  <Checkbox
                    id="label-content-name"
                    checked={contentOptions.showFullName}
                    onCheckedChange={(checked) =>
                      handleToggleContentOption('showFullName', checked === true)
                    }
                    className="data-[state=checked]:bg-[#7A5C2E] data-[state=checked]:border-[#7A5C2E]"
                  />
                  Nome completo (categoria + nome)
                </label>
                <label
                  htmlFor="label-content-price"
                  className="flex items-center gap-2 text-sm text-[#2D2A26] cursor-pointer"
                >
                  <Checkbox
                    id="label-content-price"
                    checked={contentOptions.showSellingPrice}
                    onCheckedChange={(checked) =>
                      handleToggleContentOption('showSellingPrice', checked === true)
                    }
                    className="data-[state=checked]:bg-[#7A5C2E] data-[state=checked]:border-[#7A5C2E]"
                  />
                  Valor de venda
                </label>
              </div>
              <p className="text-[11px] text-[#6B655E]">
                O código de barras Code 128 continua sempre presente na etiqueta.
              </p>
            </div>
          </div>

          {/* Botão de Ajustes Avançados (margens e micro-ajuste) */}
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedSettings((v) => !v)}
              className="text-xs text-[#7A5C2E] hover:text-[#634923] hover:bg-[#F3EAD8]/60 h-8 px-2.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              {showAdvancedSettings
                ? 'Ocultar ajustes de margem'
                : '+ Ajustes avançados de margem (mm)'}
            </Button>

            {showAdvancedSettings && (
              <div className="mt-3 p-4 bg-[#FDFBF7] border border-[#E5DFD5] rounded-lg space-y-3">
                <p className="text-xs text-[#6B655E]">
                  Use estes deslocamentos apenas se sua impressora física apresentar pequeno desvio
                  mecânico ao puxar a folha:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-[#2D2A26]">Margem Superior (mm)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={manualOffsets.marginTop}
                      onChange={(e) =>
                        setManualOffsets((prev) => ({
                          ...prev,
                          marginTop: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-[#2D2A26]">Margem Esquerda (mm)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={manualOffsets.marginLeft}
                      onChange={(e) =>
                        setManualOffsets((prev) => ({
                          ...prev,
                          marginLeft: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-[#2D2A26]">Espaçamento Colunas (mm)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={manualOffsets.gapHorizontal}
                      onChange={(e) =>
                        setManualOffsets((prev) => ({
                          ...prev,
                          gapHorizontal: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-[#2D2A26]">Espaçamento Linhas (mm)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={manualOffsets.gapVertical}
                      onChange={(e) =>
                        setManualOffsets((prev) => ({
                          ...prev,
                          gapVertical: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. SELEÇÃO DE PRODUTOS */}
      <Card className="border-[#E5DFD5] shadow-xs bg-white">
        <CardHeader className="pb-3 border-b border-[#F0EBE1] bg-[#FCFAF6]/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-[#2D2A26]">
                Localizar e adicionar produtos à impressão
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                Listagem ordenada do mais recente para o mais antigo • {filteredProducts.length}{' '}
                produtos encontrados
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C8275]" />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="absolute left-9 top-1.5 h-8 w-8 rounded-md text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C6A664]"
                title="Ler código de barras com a câmera"
                aria-label="Ler código de barras com a câmera"
              >
                <Barcode className="h-4.5 w-4.5" />
              </button>
              <Input
                type="text"
                placeholder="Buscar por nome, Produto ID, SKU novo ou código de barras..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                }}
                onKeyDown={(e) => {
                  // Formato de código de barras: numérico puro ou código + variação
                  // ("1106", "1106 V1", "1106-V1"). Busca por texto livre (nome/descrição)
                  // NÃO dispara o resolvedor ao dar Enter.
                  const looksLikeCode = BARCODE_CODE_PATTERN.test(searchTerm.trim())
                  if (e.key === 'Enter' && searchTerm.trim() && looksLikeCode) {
                    e.preventDefault()
                    void handleBarcodeScan(searchTerm)
                  }
                }}
                className="pl-16 pr-9 h-10 bg-white border-[#D9D1C5] text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('')
                    setHighlightedProductId(null)
                  }}
                  className="absolute right-2 top-2 h-6 w-6 rounded-md text-[#7A5C2E] hover:bg-[#F3EAD8] flex items-center justify-center"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="sm:col-span-3">
              <Select value={selectedBrand} onValueChange={(val) => setSelectedBrand(val)}>
                <SelectTrigger className="h-10 bg-white border-[#D9D1C5] text-sm">
                  <SelectValue placeholder="Marca..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as marcas</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-3">
              <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val)}>
                <SelectTrigger className="h-10 bg-white border-[#D9D1C5] text-sm">
                  <SelectValue placeholder="Categoria..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <div className="border border-[#E5DFD5] rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#F7F4EE] text-[#5A544A] border-b border-[#E5DFD5] font-semibold text-xs">
                  <tr>
                    <th scope="col" className="p-3 w-20 text-center">
                      Foto
                    </th>
                    <th scope="col" className="p-3">
                      Data cadastro
                    </th>
                    <th scope="col" className="p-3">
                      Produto ID
                    </th>
                    <th scope="col" className="p-3">
                      SKU novo
                    </th>
                    <th scope="col" className="p-3">
                      Nome do produto
                    </th>
                    <th scope="col" className="p-3">
                      Marca
                    </th>
                    <th scope="col" className="p-3 text-center">
                      Estoque atual
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE1]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[#6B655E]">
                        Carregando produtos do sistema...
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-red-600">
                        {loadError}
                      </td>
                    </tr>
                  ) : paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[#6B655E]">
                        {isSearching
                          ? 'Buscando no servidor...'
                          : 'Nenhum produto encontrado com os filtros selecionados.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => {
                      const brandObj = brands.find((b) => b.id === p.marca_id)
                      const resellerQty = resellerStockMap.get(p.id) || 0
                      const totalStock = getProductTotalStock(p, resellerQty)
                      const added = isProductInQueue(p.id)
                      const isHighlighted = highlightedProductId === p.id
                      const parent = findParentProduct(p.id)

                      return (
                        <tr
                          key={p.id}
                          id={`label-row-${p.id}`}
                          className={`transition-colors ${
                            isHighlighted ? 'bg-[#F3EAD8] hover:bg-[#F3EAD8]' : 'hover:bg-[#FCFAF6]'
                          }`}
                        >
                          <td className="p-2 text-center">
                            {getProductRowPhoto(p) ? (
                              <img
                                src={getProductRowPhoto(p)}
                                alt={`Foto de ${p.nome_produto || p.description || 'produto'}`}
                                width={48}
                                height={48}
                                loading="lazy"
                                className="h-12 w-12 mx-auto rounded object-cover border border-[#E5DFD5] bg-[#F7F4EE]"
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className="h-12 w-12 mx-auto rounded bg-[#F3EAD8] flex items-center justify-center"
                              >
                                <Tag className="h-5 w-5 text-[#A8A196]" />
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-[#6B655E] whitespace-nowrap">
                            {formatDate(p.created)}
                            {parent && p.id.includes(':') && (
                              <span className="block text-[10px] text-[#8C8275]">
                                variação de {parent.code}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs text-[#4A453E]">
                            {p.produto_id || '—'}
                          </td>
                          <td className="p-3 font-mono text-xs font-semibold text-[#2D2A26]">
                            {getProductDisplayBarcode(p).code || '—'}
                          </td>
                          <td className="p-3 font-medium text-[#2D2A26] max-w-[240px] truncate">
                            {p.nome_produto || p.description || 'Sem nome'}
                          </td>
                          <td className="p-3 text-[#6B655E]">{brandObj?.name || 'Scaglioni'}</td>
                          <td className="p-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                totalStock > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {totalStock} un
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAddProduct(p)}
                              className={`h-8 text-xs font-medium ${
                                added
                                  ? 'bg-[#2E7D4F] hover:bg-[#256841] text-white'
                                  : 'bg-[#7A5C2E] hover:bg-[#634923] text-white'
                              }`}
                            >
                              {added ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  Adicionar +
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Adicionar
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-[#E5DFD5] bg-[#FCFAF6] text-xs text-[#6B655E]">
                <span>
                  Página {productPage} de {totalPages} ({filteredProducts.length} itens)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productPage === 1}
                    onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2 text-xs"
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productPage === totalPages}
                    onClick={() => setProductPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2 text-xs"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. BOTÃO: ADICIONAR ETIQUETA VAZIA NO TOPO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#F9F7F2] border border-[#E5DFD5] rounded-xl">
        <div className="flex items-center gap-2 text-xs text-[#6B655E]">
          <span className="font-semibold text-[#7A5C2E]">Reaproveitamento de folhas:</span>
          Se a primeira folha já teve etiquetas destacadas anteriormente, adicione etiquetas vazias
          no topo para pular essas posições.
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddEmptyLabelOnTop}
          className="bg-white border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] font-semibold shrink-0 h-9"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar etiqueta vazia no topo
        </Button>
      </div>

      {/* 3. LISTA DE ETIQUETAS A IMPRIMIR */}
      <Card className="border-[#E5DFD5] shadow-xs bg-white">
        <CardHeader className="pb-3 border-b border-[#F0EBE1] bg-[#FCFCFC]/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-[#2D2A26]">
                Lista de etiquetas a imprimir
              </CardTitle>
              <CardDescription className="text-xs text-[#6B655E]">
                {productItemsCount} produto(s) • {emptyLabelsCount} posição(ões) vazia(s) no topo
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className="bg-[#F3EAD8] text-[#7A5C2E] font-bold text-sm px-3 py-1"
              >
                Total de etiquetas: {totalLabelsCount}
              </Badge>
              {printQueue.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Limpar lista
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {printQueue.length === 0 ? (
            <div className="text-center py-10 px-4 border-2 border-dashed border-[#E5DFD5] rounded-lg">
              <Tag className="h-8 w-8 text-[#A8A196] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#2D2A26]">Nenhuma etiqueta na lista</p>
              <p className="text-xs text-[#6B655E] mt-1 max-w-md mx-auto">
                Localize produtos na tabela acima e clique em &quot;Adicionar&quot; para compor sua
                folha de impressão.
              </p>
            </div>
          ) : (
            <div className="border border-[#E5DFD5] rounded-lg overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#F7F4EE] products table-left text-xs">
                    <tr>
                      <th scope="col" className="p-3 w-20 text-center">
                        Foto
                      </th>
                      <th scope="col" className="p-3 w-28">
                        Código
                      </th>
                      <th scope="col" className="p-3">
                        Descrição
                      </th>
                      <th scope="col" className="p-3 w-32 text-center">
                        Qtde Etiquetas
                      </th>
                      <th scope="col" className="p-3 w-28 text-right">
                        Preço Unit.
                      </th>
                      <th scope="col" className="p-3 w-16 text-center">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEAE1]">
                    {printQueue.map((item) => {
                      const isEmpty = item.type === 'empty'

                      return (
                        <tr
                          key={item.id}
                          className={
                            isEmpty
                              ? 'bg-amber-50/50 hover:bg-amber-50/70 transition-colors'
                              : 'hover:bg-[#FCFAF6] transition-colors'
                          }
                        >
                          <td className="p-2 text-center">
                            {isEmpty ? (
                              <div className="h-10 w-10 mx-auto rounded border border-dashed border-amber-300 bg-amber-50 flex items-center justify-center text-amber-600 text-[10px] font-bold">
                                VAZIA
                              </div>
                            ) : (
                              <div className="h-10 w-10 mx-auto flex items-center justify-center py-1">
                                {(() => {
                                  const photo = getProductRowPhoto(
                                    products.find((prod) => prod.id === item.productId) ||
                                      ({
                                        id: item.productId,
                                        photos: [],
                                        image_url: '',
                                      } as Product),
                                  )
                                  return photo ? (
                                    <img
                                      src={photo}
                                      alt={`Foto de ${item.description || 'produto'}`}
                                      width={40}
                                      height={40}
                                      loading="lazy"
                                      className="h-10 w-10 rounded object-cover border border-[#E5DFD5] bg-[#F7F4EE]"
                                    />
                                  ) : (
                                    <div
                                      aria-hidden="true"
                                      className="h-10 w-10 rounded bg-[#F3EAD8] flex items-center justify-center"
                                    >
                                      <Tag className="h-4 w-4 text-[#A8A196]" />
                                    </div>
                                  )
                                })()}
                              </div>
                            )}
                          </td>

                          <td className="p-3 font-mono text-xs font-bold text-[#2D2A26]">
                            {isEmpty ? <span className="text-[#8C8275] italic">—</span> : item.code}
                          </td>

                          <td className="p-3">
                            {isEmpty ? (
                              <div className="text-xs text-amber-900 font-medium">
                                Etiqueta vazia no topo{' '}
                                <span className="text-[11px] text-amber-700 font-normal">
                                  (pula {item.quantity} posição/ões da folha)
                                </span>
                              </div>
                            ) : (
                              <div className="font-medium text-[#2D2A26]">{item.description}</div>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateQuantity(item.id, parseInt(e.target.value, 10) || 1)
                                }
                                className="h-8 w-20 text-center font-semibold bg-white border-[#D9D1C5] text-xs"
                              />
                              <span className="text-xs text-[#6B655E]">un</span>
                            </div>
                          </td>

                          <td className="p-3 text-right font-medium text-[#2D2A26]">
                            {isEmpty ? '—' : formatCurrency(item.price)}
                          </td>

                          <td className="p-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveQueueItem(item.id)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Remover linha"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botão de Rodapé para Concluir */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-[#E5DFD5]">
            <Button
              type="button"
              size="lg"
              disabled={printQueue.length === 0}
              onClick={handleOpenPreview}
              className="bg-[#7A5C2E] hover:bg-[#634923] text-white font-bold w-full sm:w-auto px-8"
            >
              <Printer className="h-4 w-4 mr-2" />
              Visualizar e imprimir etiquetas ({totalLabelsCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* BarcodeScannerModal (leitor por câmera) — somente consulta/filtro */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
        originTitle="Emissão de etiquetas"
      />

      {/* MODAL DE PRÉVIA E IMPRESSÃO PAGINADA */}
      {currentTemplate && (
        <LabelPrintModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          template={currentTemplate}
          items={printQueue}
          contentOptions={contentOptions}
          manualOffsets={manualOffsets}
        />
      )}
    </div>
  )
}
export default LabelGenerationPage
