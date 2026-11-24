import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Printer,
  Search,
  Plus,
  Trash2,
  Tag,
  AlertTriangle,
  Layers,
  SlidersHorizontal,
  ImageIcon,
  Check,
  RotateCcw,
  Eye,
  ListChecks,
} from 'lucide-react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Product, Brand, ProductCategory } from '@/types'
import { LABEL_TEMPLATES, LabelTemplateModel } from '@/types/labels'
import {
  DEFAULT_LABEL_CONTENT,
  LabelContentOptions,
  getProductFullName,
} from '@/types/labelContent'
import { LabelPrintModal, PrintQueueItem } from '@/components/LabelPrintModal'
import { productService } from '@/services/productService'
import { fetchResellerStockQuantityMap, getProductTotalStock } from '@/services/totalStockService'
import { getProductDisplayPhoto, formatCurrency, formatDate } from '@/lib/formatters'
import { stripLeadingZeros, matchesProductQuery } from '@/lib/barcodeSearch'
import pb from '@/lib/pocketbase/client'

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

  // Filtros e busca de produtos
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [productPage, setProductPage] = useState<number>(1)
  const itemsPerPage = 8

  // Modal de visualização de foto ampliada
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null)

  // 3. Fila de etiquetas a imprimir
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([])

  // Modal de prévia e impressão
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false)

  // Carrega produtos reais, revendedoras, marcas e categorias
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [productsRes, resellerMap, brandsRes, categoriesRes] = await Promise.all([
        productService.getProducts({ perPage: 500, sort: '-created' }),
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

      setProducts(productsRes.items || [])
      setResellerStockMap(resellerMap)
      setBrands(brandsRes)
      setCategories(categoriesRes)
    } catch (err) {
      console.error('Erro ao carregar produtos para etiquetas:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Produtos filtrados (ordenados do mais recente para o mais antigo por padrão)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
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

      // Busca universal por nome, Produto ID, SKU novo e código de barras
      if (searchTerm.trim()) {
        return matchesProductQuery(p, searchTerm)
      }

      return true
    })
  }, [products, selectedBrand, selectedCategory, searchTerm])

  // Paginação da tabela de produtos
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * itemsPerPage
    return filteredProducts.slice(start, start + itemsPerPage)
  }, [filteredProducts, productPage])

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1

  // Código de barras formatado de um produto (SEM zeros à esquerda)
  const getProductDisplayBarcode = (p: Product): { code: string; barcodeValue: string } => {
    // Prioridade do código numérico sem zeros à esquerda:
    // 1. codigo_barras cadastrado (se houver)
    // 2. sku_novo
    // 3. code legado
    // 4. codigo_barras_tecson
    const rawCode = (p.codigo_barras || p.sku_novo || p.code || p.codigo_barras_tecson || '').trim()
    const cleanCode = stripLeadingZeros(rawCode) || '0'
    return {
      code: cleanCode,
      barcodeValue: cleanCode,
    }
  }

  // Ação 2: Adicionar produto à fila
  const handleAddProduct = (p: Product) => {
    const { code, barcodeValue } = getProductDisplayBarcode(p)
    const initialQty = p.qtde_inicial && p.qtde_inicial > 0 ? Math.floor(p.qtde_inicial) : 1
    const price = typeof p.selling_price === 'number' ? p.selling_price : 0
    const photo = getProductDisplayPhoto(p)
    const fullName = getProductFullName(p)

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
          skuEcommerce: (p.sku_ecommerce || '').trim(),
          description: p.nome_produto || p.description || 'Produto Scaglioni',
          fullName,
          price,
          quantity: initialQty,
          imageUrl: photo,
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
              <Input
                type="text"
                placeholder="Buscar por nome, Produto ID, SKU novo ou código de barras..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setProductPage(1)
                }}
                className="pl-9 h-10 bg-white border-[#D9D1C5] text-sm"
              />
            </div>

            <div className="sm:col-span-3">
              <Select
                value={selectedBrand}
                onValueChange={(val) => {
                  setSelectedBrand(val)
                  setProductPage(1)
                }}
              >
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
              <Select
                value={selectedCategory}
                onValueChange={(val) => {
                  setSelectedCategory(val)
                  setProductPage(1)
                }}
              >
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
                    <th scope="col" className="p-3 w-14 text-center">
                      Imagem
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
                        Carregando produtos reais do sistema...
                      </td>
                    </tr>
                  ) : paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-[#6B655E]">
                        Nenhum produto encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => {
                      const photoUrl = getProductDisplayPhoto(p)
                      const brandObj = brands.find((b) => b.id === p.marca_id)
                      const resellerQty = resellerStockMap.get(p.id) || 0
                      const totalStock = getProductTotalStock(p, resellerQty)
                      const added = isProductInQueue(p.id)

                      return (
                        <tr key={p.id} className="hover:bg-[#FCFAF6] transition-colors">
                          <td className="p-2 text-center">
                            {photoUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setLightboxImage({
                                    url: photoUrl,
                                    title: p.nome_produto || p.description || p.code,
                                  })
                                }
                                className="group relative h-10 w-10 mx-auto rounded border border-[#E5DFD5] overflow-hidden bg-white block"
                                title="Clique para ampliar"
                              >
                                <img
                                  src={photoUrl}
                                  alt={p.nome_produto || p.code}
                                  className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Eye className="h-3.5 w-3.5 text-white" />
                                </div>
                              </button>
                            ) : (
                              <div className="h-10 w-10 mx-auto rounded border border-[#E5DFD5] bg-[#F7F4EE] flex items-center justify-center text-[#A8A196]">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-[#6B655E] whitespace-nowrap">
                            {formatDate(p.created)}
                          </td>
                          <td className="p-3 font-mono text-xs text-[#4A453E]">
                            {p.produto_id || '—'}
                          </td>
                          <td className="p-3 font-mono text-xs font-semibold text-[#2D2A26]">
                            {p.sku_novo || p.code || '—'}
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
        <CardHeader className="pb-3 border-b border-[#F0EBE1] bg-[#FCFAF6]/60">
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
                  <thead className="bg-[#F7F4EE] text-[#5A544A] border-b border-[#E5DFD5] font-semibold text-xs">
                    <tr>
                      <th scope="col" className="p-3 w-14 text-center">
                        Imagem
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
                            ) : item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.description}
                                className="h-10 w-10 mx-auto rounded border border-[#E5DFD5] object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 mx-auto rounded border border-[#E5DFD5] bg-[#F7F4EE] flex items-center justify-center text-[#A8A196]">
                                <ImageIcon className="h-4 w-4" />
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

      {/* MODAL DE IMAGEM AMPLIADA */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-md bg-white border-[#E5DFD5]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-[#2D2A26] truncate">
              {lightboxImage?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {lightboxImage?.url && (
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default LabelGenerationPage
