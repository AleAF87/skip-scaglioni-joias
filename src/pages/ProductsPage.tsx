import React, { useState, useEffect, useMemo, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { Product, Brand, ProductCategory } from '@/types'
import { productService } from '@/services/productService'
import { productCreationService } from '@/services/productCreationService'
import { formatCurrency, formatDate, getProductDisplayPhoto } from '@/lib/formatters'
import { ProductCreateModal } from '@/components/products/ProductCreateModal'
import { ProductViewModal } from '@/components/products/ProductViewModal'
import { ProductEditModal } from '@/components/products/ProductEditModal'
import { ProductStockLocationModal } from '@/components/products/ProductStockLocationModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Boxes,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  MapPin,
  Globe,
  Star,
  Package,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const perPage = 25

  // Auxiliares para filtros
  const [brands, setBrands] = useState<Brand[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [categoryLinksMap, setCategoryLinksMap] = useState<Record<string, string[]>>({})

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedEcommerce, setSelectedEcommerce] = useState<string>('all') // 'all' | 'published' | 'not_published'

  // Modais
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)

  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const [locationProduct, setLocationProduct] = useState<Product | null>(null)
  const [isLocationOpen, setIsLocationOpen] = useState(false)

  // Carrega metadados (marcas e categorias)
  useEffect(() => {
    loadMetadata()
  }, [])

  const loadMetadata = async () => {
    try {
      const [bList, cList] = await Promise.all([
        productCreationService.getBrands(),
        productCreationService.getCategories(),
      ])
      setBrands(bList)
      setCategories(cList)
    } catch (err) {
      console.warn('Erro ao carregar marcas e categorias:', err)
    }
  }

  // Carrega lista de produtos ordenada por data decrescente (-created)
  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const filters: string[] = []

      // Busca por nome, Produto ID, SKU novo, SKU herdado (Scaglioni) e código de barras
      if (searchQuery.trim()) {
        const rawSearch = searchQuery.trim()
        const q = rawSearch.replace(/'/g, "\\'")
        const clauses = [
          `nome_produto ~ '${q}'`,
          `description ~ '${q}'`,
          `produto_id ~ '${q}'`,
          `sku_novo ~ '${q}'`,
          `sku_scaglioni ~ '${q}'`,
          `code ~ '${q}'`,
          `codigo_barras ~ '${q}'`,
          `codigo_barras_tecson ~ '${q}'`,
          `codigo_produto_tecson ~ '${q}'`,
          `sku_interno ~ '${q}'`,
        ]

        // Se a busca for puramente numérica, adiciona cláusulas para match ignorando zeros à esquerda
        if (/^\d+$/.test(rawSearch)) {
          const stripped = rawSearch.replace(/^0+/, '') || '0'

          clauses.push(`code = '${stripped}'`)
          clauses.push(`codigo_barras = '${stripped}'`)
          clauses.push(`codigo_barras_tecson = '${stripped}'`)
          clauses.push(`sku_novo = '${stripped}'`)
          clauses.push(`sku_interno = '${stripped}'`)
          clauses.push(`produto_id = '${stripped}'`)

          // Caso ainda existissem registros com zeros ou substrings
          if (stripped !== rawSearch) {
            clauses.push(`code ~ '${stripped}'`)
            clauses.push(`codigo_barras ~ '${stripped}'`)
            clauses.push(`codigo_barras_tecson ~ '${stripped}'`)
            clauses.push(`sku_novo ~ '${stripped}'`)
          }
        }

        // Se contiver C ou Ç, adiciona variação normalizada para SKUs do site
        if (/[cç]/i.test(rawSearch)) {
          const withC = rawSearch.replace(/ç/gi, 'c').replace(/'/g, "\\'")
          const withCedilla = rawSearch.replace(/c/gi, 'ç').replace(/'/g, "\\'")
          clauses.push(`sku_scaglioni ~ '${withC}'`)
          clauses.push(`sku_scaglioni ~ '${withCedilla}'`)
          clauses.push(`code ~ '${withC}'`)
        }

        filters.push(`(${clauses.join(' || ')})`)
      }

      // Filtro por marca
      if (selectedBrand) {
        filters.push(`marca_id = '${selectedBrand}'`)
      }

      // Filtro por publicação no e-commerce
      if (selectedEcommerce === 'published') {
        filters.push('publicar_no_ecommerce = true')
      } else if (selectedEcommerce === 'not_published') {
        filters.push('publicar_no_ecommerce = false')
      }

      // Filtro por categoria (se selecionada, busca os IDs de produtos vinculados)
      if (selectedCategory) {
        const catLinks = await pb
          .collection('product_category_links')
          .getFullList({
            filter: `category = '${selectedCategory}'`,
            fields: 'product',
          })
          .catch(() => [])

        const prodIds = catLinks.map((l: any) => l.product)
        if (prodIds.length > 0) {
          const idClauses = prodIds.map((id) => `id = '${id}'`)
          filters.push(`(${idClauses.join(' || ')})`)
        } else {
          // Nenhuma peça vinculada a esta categoria
          setProducts([])
          setTotalItems(0)
          setIsLoading(false)
          return
        }
      }

      const filterStr = filters.join(' && ')

      const res = await pb.collection('products').getList<Product>(page, perPage, {
        filter: filterStr || undefined,
        sort: '-created', // Mais recentemente cadastrado para o mais antigo
        expand: 'marca_id,type,material',
      })

      setProducts(res.items)
      setTotalItems(res.totalItems)

      // Carrega vínculos de categorias para as peças desta página
      if (res.items.length > 0) {
        const pageIds = res.items.map((p) => p.id)
        const filterLinks = pageIds.map((id) => `product = '${id}'`).join(' || ')
        const allLinks = await pb
          .collection('product_category_links')
          .getFullList({
            filter: filterLinks,
            expand: 'category',
          })
          .catch(() => [])

        const map: Record<string, string[]> = {}
        allLinks.forEach((l: any) => {
          const pId = l.product
          const catName = l.expand?.category?.name || ''
          if (catName) {
            if (!map[pId]) map[pId] = []
            map[pId].push(catName)
          }
        })
        setCategoryLinksMap(map)
      }
    } catch (err: any) {
      console.error('Erro ao carregar produtos:', err)
      toast.error('Erro ao listar produtos.')
    } finally {
      setIsLoading(false)
    }
  }, [page, searchQuery, selectedBrand, selectedCategory, selectedEcommerce])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Após salvar produto novo no modal: fechar o modal, atualizar a tabela e exibir o novo produto na primeira linha
  const handleProductCreated = (newProduct: Product) => {
    // Insere no topo imediatamente sem recarregar a página inteira
    setProducts((prev) => [newProduct, ...prev.filter((p) => p.id !== newProduct.id)])
    setTotalItems((prev) => prev + 1)
  }

  // Após editar
  const handleProductUpdated = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedBrand('')
    setSelectedCategory('')
    setSelectedEcommerce('all')
    setPage(1)
  }

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedBrand) ||
    Boolean(selectedCategory) ||
    selectedEcommerce !== 'all'

  const totalPages = Math.ceil(totalItems / perPage) || 1

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-xl bg-gradient-to-tr from-[#7A5C2E]/20 via-[#C6A664]/30 to-[#E8D5A3]/40 text-[#7A5C2E] shadow-xs">
              <Boxes className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">Produtos</h1>
              <p className="text-xs text-[#6B655E] uppercase tracking-wider font-medium">
                Scaglioni Joias • Catálogo & Cadastro de Produtos
              </p>
            </div>
          </div>
          <p className="text-sm text-[#6B655E] mt-2 max-w-2xl">
            Gestão completa do catálogo de joias, precificação, estoques por localização e
            publicação no e-commerce.
          </p>
        </div>

        {/* Botão Principal no Topo */}
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-gradient-to-r from-[#7A5C2E] via-[#A88742] to-[#7A5C2E] hover:from-[#634924] hover:to-[#634924] text-white px-5 h-11 rounded-xl font-bold shadow-md flex items-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>+ Adicionar novo produto</span>
        </Button>
      </div>

      {/* Card de Filtros e Busca */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Campo de Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B655E]" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="Buscar por nome, ID, SKU ou código de barras..."
                className="pl-9 h-10 text-xs bg-[#FDFBF7] border-[#E5DFD5]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#6B655E] hover:text-[#2D2A26]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filtro Marca */}
            <div>
              <select
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 text-xs rounded-md border border-[#E5DFD5] bg-[#FDFBF7] text-[#2D2A26]"
              >
                <option value="">Todas as marcas</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Categoria */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 text-xs rounded-md border border-[#E5DFD5] bg-[#FDFBF7] text-[#2D2A26]"
              >
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Publicação E-commerce */}
            <div className="flex items-center gap-2">
              <select
                value={selectedEcommerce}
                onChange={(e) => {
                  setSelectedEcommerce(e.target.value)
                  setPage(1)
                }}
                className="flex-1 h-10 px-3 text-xs rounded-md border border-[#E5DFD5] bg-[#FDFBF7] text-[#2D2A26]"
              >
                <option value="all">E-commerce: Todos</option>
                <option value="published">E-commerce: Publicados</option>
                <option value="not_published">E-commerce: Não publicados</option>
              </select>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-10 px-2 text-xs text-[#6B655E] hover:text-[#B3261E]"
                  title="Limpar filtros"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Produtos */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-5 border-b border-[#E5DFD5] bg-gradient-to-r from-white via-[#FDFBF7] to-white flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg text-[#2D2A26]">Lista de Produtos</CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Ordenados do mais recentemente cadastrado para o mais antigo ({totalItems} produtos)
            </CardDescription>
          </div>
          <div className="text-xs font-mono text-[#8C8275]">
            Página {page} de {totalPages}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[#6B655E] gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-[#C6A664]" />
              <span className="text-xs font-medium">Carregando produtos...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-[#6B655E] space-y-2">
              <Package className="h-10 w-10 mx-auto text-[#C6A664]/50" />
              <p className="text-sm font-semibold text-[#2D2A26]">Nenhum produto encontrado</p>
              <p className="text-xs text-[#8C8275]">
                {hasActiveFilters
                  ? 'Tente remover os filtros ou buscar por outro termo.'
                  : 'Comece adicionando o primeiro produto clicando no botão acima.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DFD5] bg-[#FDFBF7] text-[#6B655E] font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 w-14 text-center">Foto</th>
                    <th className="py-3 px-3">CÓDIGO</th>
                    <th className="py-3 px-3 min-w-[200px]">Nome do produto</th>
                    <th className="py-3 px-3">SKU novo</th>
                    <th className="py-3 px-3">Marca</th>
                    <th className="py-3 px-3 min-w-[140px]">Categorias</th>
                    <th className="py-3 px-3 text-right">Preço de venda</th>
                    <th className="py-3 px-3 text-center">Estoque total</th>
                    <th className="py-3 px-3 text-center">E-commerce</th>
                    <th className="py-3 px-3 text-center">Destaque</th>
                    <th className="py-3 px-3">Data cadastro</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5]/70">
                  {products.map((p) => {
                    const photo = getProductDisplayPhoto(p)
                    const pCategories = categoryLinksMap[p.id] || []
                    const brandName = p.expand?.marca_id?.name || 'Scaglioni'

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[#FDFBF7]/80 transition-colors group text-[#2D2A26]"
                      >
                        {/* Imagem Principal */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="h-10 w-10 rounded-lg border border-[#E5DFD5] bg-white overflow-hidden mx-auto flex items-center justify-center shrink-0">
                            {photo ? (
                              <img
                                src={photo}
                                alt={p.nome_produto || 'Joia'}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-4 w-4 text-[#C6A664]/60" />
                            )}
                          </div>
                        </td>

                        {/* CÓDIGO (código da peça / código de barras de referência) */}
                        <td className="py-2.5 px-3 font-mono font-bold text-[#7A5C2E]">
                          {p.codigo_barras ||
                            p.codigo_barras_tecson ||
                            p.code ||
                            p.sku_novo ||
                            p.sku_interno ||
                            '—'}
                        </td>

                        {/* Nome do produto (sem prefixo Cód. Barras: #) */}
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-xs text-[#2D2A26] block truncate max-w-[260px]">
                            {p.nome_produto || p.description}
                          </span>
                        </td>

                        {/* SKU Novo / SKU Herdado / Código */}
                        <td className="py-2.5 px-3 font-mono font-bold text-[#2D2A26]">
                          <span
                            title={
                              p.sku_novo
                                ? `SKU Novo: ${p.sku_novo}`
                                : p.sku_scaglioni
                                  ? `SKU Scaglioni: ${p.sku_scaglioni}`
                                  : ''
                            }
                          >
                            {p.sku_novo || p.sku_scaglioni || p.code || p.codigo_barras || '—'}
                          </span>
                          {p.sku_scaglioni && p.sku_novo && p.sku_scaglioni !== p.sku_novo && (
                            <span
                              className="text-[10px] text-[#8C8275] font-normal block truncate max-w-[120px]"
                              title={`SKU Scaglioni herdado: ${p.sku_scaglioni}`}
                            >
                              Scaglioni: {p.sku_scaglioni}
                            </span>
                          )}
                        </td>

                        {/* Marca */}
                        <td className="py-2.5 px-3 text-[#6B655E] font-medium">{brandName}</td>

                        {/* Categorias */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {pCategories.length > 0 ? (
                              pCategories.slice(0, 2).map((cName, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded bg-[#F3EAD8] text-[#7A5C2E] text-[10px] font-medium truncate"
                                >
                                  {cName}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-[#8C8275] italic">—</span>
                            )}
                            {pCategories.length > 2 && (
                              <span className="text-[10px] text-[#8C8275]">
                                +{pCategories.length - 2}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Preço de venda */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2E7D4F]">
                          {formatCurrency(p.selling_price)}
                          {p.preco_promocional && p.preco_promocional > 0 ? (
                            <span className="block text-[10px] text-amber-600 font-normal">
                              Promo: {formatCurrency(p.preco_promocional)}
                            </span>
                          ) : null}
                        </td>

                        {/* Estoque atual total */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`font-mono font-bold text-xs px-2 py-0.5 rounded-full ${
                              (p.quantity || 0) <= (p.minimum_quantity || 0)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {p.quantity || 0} un.
                          </span>
                        </td>

                        {/* Publicar no e-commerce */}
                        <td className="py-2.5 px-3 text-center">
                          {p.publicar_no_ecommerce ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                              <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Sim
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-normal">
                              Não
                            </Badge>
                          )}
                        </td>

                        {/* Destaque */}
                        <td className="py-2.5 px-3 text-center">
                          {p.destaque_ecommerce ? (
                            <Star className="h-4 w-4 text-amber-500 fill-current mx-auto" />
                          ) : (
                            <span className="text-[#8C8275] text-[10px]">—</span>
                          )}
                        </td>

                        {/* Data de cadastro */}
                        <td className="py-2.5 px-3 text-[#6B655E] text-[11px] whitespace-nowrap">
                          {formatDate(p.created)}
                        </td>

                        {/* Ações */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setViewProduct(p)
                                setIsViewOpen(true)
                              }}
                              className="h-7 w-7 text-[#6B655E] hover:text-[#7A5C2E] hover:bg-[#F3EAD8]"
                              title="Visualizar produto"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditProduct(p)
                                setIsEditOpen(true)
                              }}
                              className="h-7 w-7 text-[#6B655E] hover:text-[#7A5C2E] hover:bg-[#F3EAD8]"
                              title="Editar produto"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLocationProduct(p)
                                setIsLocationOpen(true)
                              }}
                              className="h-7 w-7 text-[#7A5C2E] hover:bg-[#F3EAD8]"
                              title="Ver estoque por localização"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-[#E5DFD5] flex items-center justify-between text-xs text-[#6B655E]">
              <span>
                Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, totalItems)} de{' '}
                {totalItems} produtos
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-mono font-bold text-[#2D2A26]">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal 1: Adicionar Novo Produto */}
      <ProductCreateModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={handleProductCreated}
      />

      {/* Modal 2: Visualizar Produto */}
      <ProductViewModal
        product={viewProduct}
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        categoryNames={viewProduct ? categoryLinksMap[viewProduct.id] : []}
      />

      {/* Modal 3: Editar Produto */}
      <ProductEditModal
        product={editProduct}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={handleProductUpdated}
      />

      {/* Modal 4: Ver Estoque por Localização */}
      <ProductStockLocationModal
        product={locationProduct}
        open={isLocationOpen}
        onOpenChange={setIsLocationOpen}
      />
    </div>
  )
}
export default ProductsPage
