import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Sparkles,
  Phone,
  MessageCircle,
  Search,
  Gem,
  Check,
  Share2,
  Boxes,
  MapPin,
  Heart,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react'
import { resellerStockService } from '@/services/resellerStockService'
import { Reseller, ResellerStockItem, Product } from '@/types'
import { formatCurrency, getFileUrl } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ImageLightbox } from '@/components/ImageLightbox'
import { toast } from 'sonner'
import { LOGO_FULL_URL, LOGO_ICON_URL } from '@/constants/branding'

export default function PublicResellerStore() {
  const { resellerId } = useParams<{ resellerId: string }>()

  const [reseller, setReseller] = useState<Reseller | null>(null)
  const [stockItems, setStockItems] = useState<ResellerStockItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Lightbox for photos
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxPhotos, setLightboxPhotos] = useState<{ url: string; alt?: string }[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)

  useEffect(() => {
    if (resellerId) {
      loadStoreData(resellerId)
    }
  }, [resellerId])

  const loadStoreData = async (id: string) => {
    setIsLoading(true)
    try {
      const [r, items] = await Promise.all([
        resellerStockService.getResellerPublicProfile(id),
        resellerStockService.getResellerStock(id),
      ])
      setReseller(r)
      setStockItems(items)
    } catch (err) {
      console.error('Erro ao carregar loja da revendedora:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Categories list derived from current products
  const categories = Array.from(
    new Set(
      stockItems
        .map((it) => it.expand?.product?.expand?.type?.name)
        .filter((c): c is string => Boolean(c)),
    ),
  )

  const filteredItems = stockItems.filter((it) => {
    const prod = it.expand?.product
    if (!prod) return false
    const matchSearch =
      prod.description.toLowerCase().includes(search.toLowerCase()) ||
      prod.code.toLowerCase().includes(search.toLowerCase())

    const matchCategory = selectedCategory === 'all' || prod.expand?.type?.name === selectedCategory

    return matchSearch && matchCategory
  })

  // WhatsApp purchase message link
  const getWhatsAppLink = (product: Product, price: number) => {
    if (!reseller?.phone) return ''
    const cleanPhone = reseller.phone.replace(/\D/g, '')
    const phoneWithCountry = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone
    const text = encodeURIComponent(
      `Olá ${reseller.name}! Vi a joia "${product.description}" (Cód: ${product.code}) por ${formatCurrency(price)} na sua vitrine virtual Scaglioni Joias e gostaria de encomendar / saber mais detalhes!`,
    )
    return `https://wa.me/${phoneWithCountry}?text=${text}`
  }

  const handleShareStore = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `Loja Virtual de ${reseller?.name || 'Revendedora'} - Scaglioni Joias`,
          text: `Confira meu catálogo exclusivo de joias e semijoias finas com pronta-entrega!`,
          url: window.location.href,
        })
        .catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      toast.success('Link da vitrine copiado para a área de transferência!')
    }
  }

  const openPhotos = (product: Product) => {
    if (!product.photos || product.photos.length === 0) return
    const photos = product.photos.map((p) => ({
      url: getFileUrl('products', product.id, p),
      alt: `${product.code} - ${product.description}`,
    }))
    setLightboxPhotos(photos)
    setLightboxIndex(0)
    setLightboxOpen(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
        <div className="bg-black p-3 rounded-2xl shadow-md border border-[#C6A664]/50 mb-3 animate-pulse">
          <img src={LOGO_ICON_URL} alt="Scaglioni Joias" className="h-12 w-12 object-contain" />
        </div>
        <p className="font-serif text-lg font-bold text-[#2D2A26]">Scaglioni Joias</p>
        <p className="text-xs text-[#6B655E] mt-1">Carregando catálogo da revendedora...</p>
      </div>
    )
  }

  if (!reseller) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center">
        <Gem className="h-12 w-12 text-[#C6A664] mb-3 opacity-60" />
        <h2 className="font-serif text-xl font-bold text-[#2D2A26]">Loja não encontrada</h2>
        <p className="text-xs text-[#6B655E] max-w-sm mt-1">
          O link acessado é inválido ou esta revendedora não está mais ativa.
        </p>
        <Link to="/login" className="mt-4">
          <Button size="sm" className="bg-[#7A5C2E] text-white text-xs">
            Acessar Sistema
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2D2A26] flex flex-col">
      {/* Top Banner & Header com a logo oficial completa */}
      <header className="sticky top-0 z-40 bg-[#000000] border-b border-[#333333] shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_FULL_URL}
              alt="Scaglioni Joias"
              className="h-9 sm:h-10 w-auto max-w-[190px] sm:max-w-[240px] object-contain"
            />
            <div className="hidden sm:block border-l border-[#C6A664]/40 pl-3">
              <span className="text-[10px] text-[#C6A664] font-semibold uppercase tracking-wider block leading-tight">
                Vitrine Exclusiva de Joias
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareStore}
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs h-8 px-2.5 flex items-center gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compartilhar</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Reseller Showcase Hero Banner */}
      <section className="bg-gradient-to-b from-[#FFFFFF] to-[#FDFBF7] border-b border-[#E5DFD5] py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F3EAD8] text-[#7A5C2E] text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Consultora & Revendedora Autorizada</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#2D2A26] tracking-tight">
            {reseller.name}
          </h1>

          <p className="text-xs sm:text-sm text-[#6B655E] max-w-xl mx-auto">
            Seja muito bem-vinda à minha vitrine virtual de joias finas. Todas as peças exibidas
            abaixo estão em meu estoque à pronta-entrega.
          </p>

          {/* Contact shortcuts */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            {reseller.phone && (
              <a
                href={`https://wa.me/55${reseller.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold shadow-sm transition-all"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Falar no WhatsApp: {reseller.phone}</span>
              </a>
            )}

            {reseller.city && (
              <div className="inline-flex items-center gap-1.5 text-xs text-[#6B655E] px-3 py-1.5 rounded-xl bg-white border border-[#E5DFD5]">
                <MapPin className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span>
                  {reseller.city}
                  {reseller.state ? ` - ${reseller.state}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Catalog Section */}
      <main className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Search and Category Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A8A196]" />
            <Input
              placeholder="Buscar joia por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs bg-white h-9"
            />
          </div>

          {/* Category badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#7A5C2E] text-white font-semibold'
                  : 'bg-white border border-[#E5DFD5] text-[#6B655E] hover:bg-[#F3EAD8]'
              }`}
            >
              Todas ({stockItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#7A5C2E] text-white font-semibold'
                    : 'bg-white border border-[#E5DFD5] text-[#6B655E] hover:bg-[#F3EAD8]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#E5DFD5] p-6 space-y-2">
            <Gem className="h-10 w-10 text-[#C6A664] mx-auto opacity-50 mb-2" />
            <p className="font-serif font-bold text-base text-[#2D2A26]">
              Nenhuma joia encontrada no momento
            </p>
            <p className="text-xs text-[#6B655E]">
              {search
                ? 'Tente buscar por outros termos ou limpe o filtro.'
                : 'Esta revendedora atualizará o mostruário em breve.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((it) => {
              const prod = it.expand?.product
              if (!prod) return null
              const price = it.selling_price || prod.selling_price || 0
              const photoUrl =
                prod.photos && prod.photos.length > 0
                  ? getFileUrl('products', prod.id, prod.photos[0])
                  : null

              const waLink = getWhatsAppLink(prod, price)

              return (
                <Card
                  key={it.id}
                  className="border-[#E5DFD5] bg-white overflow-hidden hover:shadow-md transition-all duration-200 flex flex-col justify-between group"
                >
                  <div>
                    {/* Photo with aspect-square */}
                    <div
                      onClick={() => openPhotos(prod)}
                      className="relative aspect-square bg-[#FDFBF7] cursor-pointer overflow-hidden border-b border-[#E5DFD5]/60 flex items-center justify-center"
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={prod.description}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-[#A8A196] p-4 text-center">
                          <img
                            src={LOGO_ICON_URL}
                            alt="Scaglioni Joias"
                            className="h-10 w-10 rounded-lg object-contain mb-1 opacity-80"
                          />
                          <span className="text-[10px] text-[#7A5C2E] font-medium">
                            Scaglioni Joias
                          </span>
                        </div>
                      )}

                      {/* Stock badge & code */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        <span className="bg-[#2D2A26]/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold">
                          {prod.code}
                        </span>
                      </div>

                      <div className="absolute top-2 right-2">
                        <span className="bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Pronta-entrega
                        </span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <CardContent className="p-4 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-[#7A5C2E] uppercase font-semibold">
                        <span>{prod.expand?.type?.name || 'Alta Joalheria'}</span>
                        {prod.expand?.material && <span>• {prod.expand.material.name}</span>}
                      </div>

                      <h3 className="font-serif font-bold text-sm text-[#2D2A26] line-clamp-2 leading-snug">
                        {prod.description}
                      </h3>

                      {prod.observations && (
                        <p className="text-[11px] text-[#6B655E] line-clamp-2">
                          {prod.observations}
                        </p>
                      )}
                    </CardContent>
                  </div>

                  {/* Price & Action */}
                  <div className="p-4 pt-0">
                    <div className="pt-2 border-t border-[#E5DFD5]/60 flex items-center justify-between mb-3">
                      <div>
                        <span className="text-[10px] text-[#6B655E] block leading-none">
                          Preço:
                        </span>
                        <strong className="font-serif text-lg font-bold text-[#7A5C2E]">
                          {formatCurrency(price)}
                        </strong>
                      </div>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                        {it.quantity} em estoque
                      </span>
                    </div>

                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold shadow-xs transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>Quero Esta Joia</span>
                      </a>
                    ) : (
                      <Button size="sm" disabled className="w-full text-xs bg-[#7A5C2E] text-white">
                        Contato Indisponível
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer com logo institucional */}
      <footer className="bg-[#000000] border-t border-[#333333] py-6 px-4 mt-auto text-white">
        <div className="max-w-6xl mx-auto text-center space-y-3">
          <div className="flex justify-center">
            <img
              src={LOGO_FULL_URL}
              alt="Scaglioni Joias"
              className="h-8 w-auto max-w-[180px] object-contain"
            />
          </div>
          <p className="text-[11px] text-[#C6A664]">
            Catálogo virtual exclusivo de {reseller.name} • Alta Joalheria & Consignação
          </p>
        </div>
      </footer>

      {/* Lightbox for full size photo preview */}
      <ImageLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}
