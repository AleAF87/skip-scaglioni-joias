import React, { useState, useEffect } from 'react'
import { productService } from '@/services/productService'
import { Product, ProductType, ProductMaterial } from '@/types'
import { formatCurrency, getFileUrl } from '@/lib/formatters'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImageLightbox } from '@/components/ImageLightbox'
import {
  Store,
  Search,
  Filter,
  Gem,
  Eye,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from 'lucide-react'

export default function CatalogVitrine() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<ProductType[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [targetAudience, setTargetAudience] = useState('')

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
  }, [search, selectedType, selectedMaterial, targetAudience])

  const loadAuxiliaries = async () => {
    try {
      const data = await productService.getAuxiliaryData()
      setTypes(data.types)
      setMaterials(data.materials)
    } catch (err) {
      console.error(err)
    }
  }

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const res = await productService.getProducts({
        search,
        type: selectedType,
        material: selectedMaterial,
        status: 'available', // Vitrine showcases available items
        perPage: 40,
      })
      setProducts(res.items)
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
        <div>
          <Badge
            variant="outline"
            className="border-[#C6A664] text-[#7A5C2E] bg-white/60 mb-2 font-medium"
          >
            <Sparkles className="h-3 w-3 mr-1" /> Catálogo & Vitrine Exclusiva
          </Badge>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#2D2A26]">
            Coleção Scaglioni Joias
          </h1>
          <p className="text-sm text-[#6B655E] mt-1 max-w-xl">
            Apresentação refinada para clientes e revendedores com fotos em alta definição, detalhes
            técnicos e valores de venda.
          </p>
        </div>

        <div className="h-14 w-14 rounded-2xl bg-[#C6A664]/20 border border-[#C6A664]/40 flex items-center justify-center text-[#7A5C2E] shrink-0">
          <Store className="h-7 w-7" />
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-[#E5DFD5] bg-white shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Tipos</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todos os Materiais</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full h-10 rounded-md border border-[#E5DFD5] bg-white px-3 py-2 text-sm text-[#2D2A26] focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              >
                <option value="">Todo Perfil</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="unissex">Unissex</option>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p) => {
            const photoUrl =
              p.photos && p.photos.length > 0 ? getFileUrl('products', p.id, p.photos[0]) : null

            return (
              <Card
                key={p.id}
                onClick={() => {
                  setSelectedProduct(p)
                  setActivePhotoIndex(0)
                }}
                className="group border-[#E5DFD5] bg-white overflow-hidden rounded-2xl shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col"
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
                    <div className="flex flex-col items-center justify-center text-[#C6A664]/60">
                      <Gem className="h-12 w-12 stroke-[1.5]" />
                      <span className="text-[10px] uppercase font-bold tracking-wider mt-2">
                        Scaglioni
                      </span>
                    </div>
                  )}

                  <div className="absolute top-2 left-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/90 backdrop-blur-xs text-[#7A5C2E] shadow-xs">
                      {p.code}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2">
                    <Badge
                      variant="secondary"
                      className="bg-[#FFFFFF]/90 text-[#2D2A26] text-[10px] font-medium capitalize"
                    >
                      {p.expand?.type?.name || 'Joia'}
                    </Badge>
                  </div>
                </div>

                {/* Info Container — Colunas/badges separados para Tipo, Tamanho e Perfil */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-1.5">
                      <span className="px-1.5 py-0.5 rounded-md bg-[#F3EAD8] text-[#7A5C2E] font-medium">
                        {p.expand?.type?.name || 'Joia'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-[#2D2A26]">
                        Tam: {p.expand?.size?.name || 'Único'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-[#2D2A26] capitalize">
                        Perfil: {p.target_audience || 'Unissex'}
                      </span>
                    </div>
                    <h3 className="font-serif text-base font-bold text-[#2D2A26] mt-1 leading-snug whitespace-normal break-words">
                      {p.description}
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
                      className="text-xs text-[#7A5C2E] hover:bg-[#F3EAD8] font-semibold"
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
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#C6A664]/20 text-[#7A5C2E]">
                    {selectedProduct.code}
                  </span>
                  <Badge variant="outline" className="capitalize text-xs">
                    {selectedProduct.expand?.type?.name || 'Joia'}
                  </Badge>
                </div>
                <DialogTitle className="font-serif text-xl md:text-2xl text-[#2D2A26] mt-2">
                  {selectedProduct.description}
                </DialogTitle>
              </DialogHeader>

              {/* Gallery view */}
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

              {/* Specs Grid — Separado Tipo, Tamanho e Perfil */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] text-xs">
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
                <div>
                  <span className="text-[#6B655E] block">Disponibilidade:</span>
                  <span className="font-semibold text-[#2E7D4F]">
                    Em estoque ({selectedProduct.quantity} unid.)
                  </span>
                </div>
              </div>

              {selectedProduct.observations && (
                <div className="p-3 bg-white border border-[#E5DFD5] rounded-xl text-xs text-[#6B655E]">
                  <strong className="text-[#2D2A26] block mb-1">Observações do artesão:</strong>
                  {selectedProduct.observations}
                </div>
              )}

              {/* Price footer */}
              <div className="pt-3 border-t border-[#E5DFD5] flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#6B655E] block">Preço de Venda</span>
                  <span className="font-serif text-2xl font-bold text-[#7A5C2E]">
                    {formatCurrency(selectedProduct.selling_price)}
                  </span>
                </div>

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
