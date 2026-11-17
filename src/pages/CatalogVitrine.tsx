import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { productService } from '@/services/productService'
import { productCreationService } from '@/services/productCreationService'
import { Product, ProductCategory } from '@/types'
import { getProductFullName } from '@/types/labelContent'
import { formatCurrency, getFileUrl, getProductDisplayPhoto } from '@/lib/formatters'
import {
  fetchResellerStockQuantityMap,
  getEcommerceAvailableStock,
  getProductTotalStock,
} from '@/services/totalStockService'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageLightbox } from '@/components/ImageLightbox'
import { Search, Gem, Eye, ZoomIn, Store, Share2 } from 'lucide-react'
import { LOGO_ICON_URL } from '@/constants/branding'

export default function CatalogVitrine() {
  const { isReseller } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  // Categorias de cada produto: vínculos product_category_links → product_categories,
  // carregados uma vez e mapeados por produto (usados nos cards e no modal).
  const [categoryNamesByProduct, setCategoryNamesByProduct] = useState<Map<string, string[]>>(
    new Map(),
  )
  // Soma de tudo que está em posse das revendedoras (por produto) para o estoque geral do modal
  const [resellerQtyMap, setResellerQtyMap] = useState<Map<string, number>>(new Map())
  // Filtros Metal e Tipo vêm da página de Categorias (product_categories.group)
  const [metalCategories, setMetalCategories] = useState<ProductCategory[]>([])
  const [tipoCategories, setTipoCategories] = useState<ProductCategory[]>([])

  // Loja Virtual: própria para revendedora logada; para admin/equipe, a mais recente com loja pública.
  const [storeUrl, setStoreUrl] = useState('')
  useEffect(() => {
    if (isReseller && pb.authStore.record) {
      setStoreUrl(`/loja/${pb.authStore.record.id}`)
      return
    }
    pb.collection('resellers')
      .getList(1, 1, { sort: '-created', filter: "status = 'active'" })
      .then((res) => {
        if (res.items.length > 0) setStoreUrl(`/loja/${res.items[0].id}`)
      })
      .catch(() => {})
  }, [isReseller])

  const handleShareStore = () => {
    if (!storeUrl) {
      toast.info('Nenhuma loja virtual disponível para compartilhar.')
      return
    }
    const link = window.location.origin + storeUrl
    if (navigator.share) {
      navigator
        .share({
          title: 'Scaglioni Joias',
          text: 'Confira nossa Loja Virtual Scaglioni Joias',
          url: link,
        })
        .catch(() => {})
    } else {
      navigator.clipboard?.writeText(link).catch(() => {})
      toast.success('Link copiado')
    }
  }

  // Filters
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')

  // Detail Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([])
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const handleOpenLightbox = (p: Product, initialIdx: number = 0) => {
    if (!p.photos || p.photos.length === 0) return
    const urls = p.photos.map((ph) => getFileUrl('products', p.id, ph))
    setLightboxPhotos(urls)
    setLightboxTitle(`${p.code} — ${p.description}`)
    setLightboxIndex(initialIdx)
    setLightboxOpen(true)
  }

  useEffect(() => {
    loadAuxiliaries()
    loadCatalog()
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [search, selectedType, selectedMaterial])

  const loadAuxiliaries = async () => {
    try {
      // Mesma fonte de dados da página de Categorias: product_categories (não arquivadas)
      const cats = await productCreationService.getCategories()
      setMetalCategories(cats.filter((c) => c.group === 'metal'))
      setTipoCategories(cats.filter((c) => c.group !== 'metal'))
    } catch (err) {
      console.error(err)
    }
  }

  // Carrega os vínculos de categorias uma vez e mapeia product → nomes das categorias
  // (sem duplicidade, apenas com nomes preenchidos).
  const loadCategoryLinksMap = async (): Promise<Map<string, string[]>> => {
    const map = new Map<string, string[]>()
    try {
      const links = await pb.collection('product_category_links').getFullList<{
        product: string
        expand?: { category?: ProductCategory }
      }>({ expand: 'category' })
      links.forEach((l) => {
        const name = l.expand?.category?.name?.trim()
        if (!name || !l.product) return
        const names = map.get(l.product) || []
        if (!names.includes(name)) names.push(name)
        map.set(l.product, names)
      })
    } catch (err) {
      console.error(err)
    }
    return map
  }

  // Busca os ids de produtos vinculados a uma categoria via product_category_links.
  // Categoria sem vínculo devolve lista vazia (o filtro resultará em nenhum produto).
  const fetchCategoryProductIds = async (categoryId: string): Promise<string[]> => {
    try {
      const links = await pb.collection('product_category_links').getFullList<{
        product: string
      }>({ filter: `category = '${categoryId}'` })
      return links.map((l) => l.product)
    } catch (err) {
      console.error(err)
      return []
    }
  }

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const filters: string[] = []
      const baseFilter = productService.buildProductFilterString({
        search,
        status: 'available', // Vitrine showcases available items
      })
      if (baseFilter) filters.push(baseFilter)

      // Estoque único: só aparece na vitrine quem está publicado no e-commerce
      // (qtde_loja_virtual é o interruptor "Publicar no e-commerce": 1 = ativado)
      filters.push('qtde_loja_virtual = 1')

      // Filtro Metal / Tipo: busca os produtos vinculados às categorias escolhidas
      // (product_category_links — mesma fonte da página de Categorias)
      const activeCategoryIds = [selectedType, selectedMaterial].filter(Boolean)
      if (activeCategoryIds.length > 0) {
        const linkFilters = await Promise.all(
          activeCategoryIds.map(async (categoryId) => {
            const prodIds = await fetchCategoryProductIds(categoryId)
            return `(${prodIds.length > 0 ? prodIds.map((id) => `id = '${id}'`).join(' || ') : "id = ''"})`
          }),
        )
        filters.push(linkFilters.join(' && '))
      }

      const [res, resellerMap, catMap] = await Promise.all([
        pb.collection('products').getList<Product>(1, 40, {
          filter: filters.join(' && ') || undefined,
          sort: '-created',
          expand: 'type,material,size,marca_id,product_category_links(product).category',
        }),
        fetchResellerStockQuantityMap(),
        loadCategoryLinksMap(),
      ])
      setProducts(res.items)
      setResellerQtyMap(resellerMap)
      setCategoryNamesByProduct(catMap)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Vitrine Hero Header */}
      <div className="rounded-2xl p-6 md:p-8 bg-gradient-to-r from-[#F3EAD8] via-[#FDFBF7] to-[#F3EAD8] border border-[#E5DFD5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <a href={storeUrl} target="_blank" rel="noopener noreferrer">
            <Button className="w-full sm:w-auto bg-[#7A5C2E] hover:bg-[#5E441D]">
              <Store className="h-4 w-4 mr-2" />
              Loja Virtual
            </Button>
          </a>
          <Button
            variant="outline"
            className="w-full sm:w-auto border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
            onClick={handleShareStore}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Compartilhar
          </Button>
        </div>

        <div className="h-16 w-16 rounded-2xl bg-black border border-[#C6A664]/50 p-2 flex items-center justify-center shrink-0 shadow-md">
          <img src={LOGO_ICON_URL} alt="Scaglioni Joias" className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar joia pelo nome..."
                className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
              />
            </div>

            <div>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Metais</option>
                {metalCategories.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Tipos</option>
                {tipoCategories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid of Products (Luxury Jewelry Display) */}
      {loading ? (
        <div className="py-20 text-center text-[#6B655E]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C6A664] border-t-transparent mx-auto mb-2" />
          <span>Carregando vitrine de joias...</span>
        </div>
      ) : products.length === 0 ? (
        <div className="py-20 text-center text-[#6B655E] bg-white rounded-2xl border border-[#E5DFD5]">
          <Gem className="h-12 w-12 text-[#C6A664] mx-auto mb-2 opacity-50" />
          <p className="font-serif text-lg text-[#2D2A26] font-bold">
            Nenhuma joia encontrada nesta seleção
          </p>
          <p className="text-sm text-[#6B655E] mt-1">
            Experimente remover alguns filtros aplicados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {products.map((p) => {
            const photoUrl = getProductDisplayPhoto(p)
            // Disponibilidade no e-commerce = estoque único − posse das revendedoras
            const ecomAvail = getEcommerceAvailableStock(p, resellerQtyMap.get(p.id) || 0)
            const soldOut = ecomAvail <= 0

            return (
              <Card
                key={p.id}
                onClick={() => {
                  if (soldOut) return
                  setSelectedProduct(p)
                  setActivePhotoIndex(0)
                }}
                className={`group border-[#E5DFD5] bg-white overflow-hidden rounded-2xl shadow-xs cursor-pointer flex flex-col transition-all duration-200 ${
                  soldOut ? 'opacity-55 saturate-50' : 'hover:shadow-lg hover:-translate-y-1'
                }`}
              >
                {/* Photo container */}
                <div className="relative aspect-square w-full bg-[#FDFBF7] overflow-hidden flex items-center justify-center border-b border-[#E5DFD5]/60">
                  {photoUrl ? (
                    <>
                      <img
                        src={photoUrl}
                        alt={p.description}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenLightbox(p, 0)
                        }}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-all opacity-80 group-hover:opacity-100 shadow-md"
                        title="Ampliar foto em lightbox"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                      <img
                        src={LOGO_ICON_URL}
                        alt="Scaglioni Joias"
                        className="h-12 w-12 rounded-xl object-contain opacity-85 mb-1"
                      />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A5C2E]">
                        Scaglioni Joias
                      </span>
                    </div>
                  )}

                  <div className="absolute top-2 left-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/90 backdrop-blur-xs text-[#7A5C2E] shadow-xs">
                      {p.code}
                    </span>
                  </div>

                  {soldOut && (
                    <div className="absolute top-2 right-2">
                      <span className="bg-[#2D2A26]/85 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        Esgotado
                      </span>
                    </div>
                  )}
                </div>

                {/* Info Container — apenas nome do produto (Categoria — Nome), sem descrição */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Categorias cadastradas do produto (somente o nome de cada uma) */}
                    {(categoryNamesByProduct.get(p.id) || []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-1.5">
                        {(categoryNamesByProduct.get(p.id) || []).map((catName) => (
                          <span
                            key={catName}
                            className="px-1.5 py-0.5 rounded-md bg-[#C6A664]/15 text-[#7A5C2E] font-semibold"
                          >
                            {catName}
                          </span>
                        ))}
                      </div>
                    )}
                    <h3 className="font-serif text-base font-bold text-[#2D2A26] leading-snug whitespace-normal break-words">
                      {getProductFullName(p)}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#E5DFD5] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[#6B655E] block uppercase">Preço</span>
                      <span className="font-serif text-lg font-bold text-[#7A5C2E]">
                        {formatCurrency(p.selling_price)}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={soldOut}
                      className={`text-xs font-semibold ${
                        soldOut ? 'text-[#A8A196]' : 'text-[#7A5C2E] hover:bg-[#F3EAD8]'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Product Detail Modal Gallery */}
      <Dialog open={Boolean(selectedProduct)} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <div className="space-y-5">
              {/* (1) Imagem do produto — galeria */}
              <div className="space-y-3">
                <div
                  className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#FDFBF7] border border-[#E5DFD5] flex items-center justify-center cursor-pointer group"
                  onClick={() => handleOpenLightbox(selectedProduct, activePhotoIndex)}
                  title="Clique para ver em tela cheia (Lightbox)"
                >
                  {selectedProduct.photos && selectedProduct.photos.length > 0 ? (
                    <>
                      <img
                        src={getFileUrl(
                          'products',
                          selectedProduct.id,
                          selectedProduct.photos[activePhotoIndex],
                        )}
                        alt={selectedProduct.description}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <span className="px-3 py-1.5 rounded-full bg-black/60 text-xs font-semibold flex items-center gap-1.5">
                          <ZoomIn className="h-4 w-4" /> Ampliar Imagem
                        </span>
                      </div>
                    </>
                  ) : selectedProduct.image_url ? (
                    <>
                      <img
                        src={selectedProduct.image_url}
                        alt={selectedProduct.description}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <span className="px-3 py-1.5 rounded-full bg-black/60 text-xs font-semibold flex items-center gap-1.5">
                          <ZoomIn className="h-4 w-4" /> Ampliar Imagem
                        </span>
                      </div>
                    </>
                  ) : (
                    <Gem className="h-16 w-16 text-[#C6A664] opacity-50" />
                  )}
                </div>

                {/* Thumbnails */}
                {selectedProduct.photos && selectedProduct.photos.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {selectedProduct.photos.map((photo, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`h-14 w-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                          activePhotoIndex === idx
                            ? 'border-[#C6A664] ring-2 ring-[#C6A664]/30'
                            : 'border-[#E5DFD5] opacity-70 hover:opacity-100'
                        }`}
                        title="Ver foto"
                      >
                        <img
                          src={getFileUrl('products', selectedProduct.id, photo)}
                          alt="thumbnail"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* (2) Código */}
              <div>
                <span className="text-[10px] text-[#6B655E] uppercase tracking-wider block">
                  Código
                </span>
                <span className="font-mono text-sm font-bold text-[#7A5C2E]">
                  {selectedProduct.code}
                </span>
              </div>

              {/* (3) Categorias cadastradas do produto */}
              {(categoryNamesByProduct.get(selectedProduct.id) || []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(categoryNamesByProduct.get(selectedProduct.id) || []).map((catName) => (
                    <span
                      key={catName}
                      className="px-2 py-0.5 rounded-md bg-[#C6A664]/15 text-[#7A5C2E] text-xs font-semibold"
                    >
                      {catName}
                    </span>
                  ))}
                </div>
              )}

              {/* (4) Nome do produto */}
              <DialogTitle className="font-serif text-xl md:text-2xl text-[#2D2A26] leading-snug">
                {selectedProduct.nome_produto || selectedProduct.description || 'Produto Scaglioni'}
              </DialogTitle>

              {/* (5) Descrição */}
              {selectedProduct.description && (
                <div className="p-3 bg-white border border-[#E5DFD5] rounded-xl text-xs text-[#6B655E] whitespace-pre-line">
                  <strong className="text-[#2D2A26] block mb-1">Descrição:</strong>
                  {selectedProduct.description}
                </div>
              )}

              {/* (6) Preço de venda em destaque */}
              <div className="p-4 rounded-xl bg-[#F3EAD8] border border-[#C6A664]/50">
                <span className="text-[10px] text-[#7A5C2E] uppercase tracking-wider block">
                  Preço de Venda
                </span>
                <span className="font-serif text-3xl font-bold text-[#7A5C2E]">
                  {formatCurrency(selectedProduct.selling_price)}
                </span>
              </div>

              {/* (7) Quantidade em estoque geral (soma de todos os estoques da peça) */}
              <div>
                <span className="text-[10px] text-[#6B655E] uppercase tracking-wider block">
                  Estoque Único
                </span>
                <span className="font-serif text-xl font-bold text-[#2E7D4F]">
                  {getProductTotalStock(
                    selectedProduct,
                    resellerQtyMap.get(selectedProduct.id) || 0,
                  )}{' '}
                  unid.
                </span>
                <span className="text-[11px] text-[#6B655E] block mt-0.5">
                  Loja física + Revendedoras (posse)
                </span>
              </div>

              {/* Tipo, Tamanho e Perfil */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] text-xs">
                <div>
                  <span className="text-[#6B655E] block">Tipo:</span>
                  <span className="font-semibold text-[#2D2A26]">
                    {selectedProduct.expand?.type?.name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B655E] block">Tamanho:</span>
                  <span className="font-semibold text-[#2D2A26]">
                    {selectedProduct.expand?.size?.name || 'Único'}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B655E] block">Perfil:</span>
                  <span className="font-semibold text-[#2D2A26] capitalize">
                    {selectedProduct.target_audience || 'Unissex'}
                  </span>
                </div>
              </div>

              {selectedProduct.observations && (
                <div className="p-3 bg-white border border-[#E5DFD5] rounded-xl text-xs text-[#6B655E]">
                  <strong className="text-[#2D2A26] block mb-1">Observações do artesão:</strong>
                  {selectedProduct.observations}
                </div>
              )}

              <div className="pt-3 border-t border-[#E5DFD5] flex justify-end">
                <Button
                  onClick={() => setSelectedProduct(null)}
                  className="bg-[#7A5C2E] text-white"
                >
                  Fechar Visualização
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox Modal Reutilizável */}
      <ImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        title={lightboxTitle}
      />
    </div>
  )
}
