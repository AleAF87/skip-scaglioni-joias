import React, { useRef } from 'react'
import { GalleryImageItem } from '@/services/productCreationService'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Upload, Star, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'

interface GalleryManagerProps {
  images: GalleryImageItem[]
  onChange: (images: GalleryImageItem[]) => void
  isEcommercePublished: boolean
}

export function GalleryManager({ images, onChange, isEcommercePublished }: GalleryManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newItems: GalleryImageItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const previewUrl = URL.createObjectURL(file)
      newItems.push({
        id: `img-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        previewUrl,
        isPrincipal: images.length === 0 && i === 0, // primeira imagem torna-se principal por padrão
      })
    }

    const updated = [...images, ...newItems]
    // Garante que pelo menos uma imagem seja principal
    if (!updated.some((img) => img.isPrincipal) && updated.length > 0) {
      updated[0].isPrincipal = true
    }

    onChange(updated)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSetPrincipal = (id: string) => {
    onChange(
      images.map((img) => ({
        ...img,
        isPrincipal: img.id === id,
      })),
    )
  }

  const handleRemove = (id: string) => {
    const remaining = images.filter((img) => img.id !== id)
    if (remaining.length > 0 && !remaining.some((img) => img.isPrincipal)) {
      remaining[0].isPrincipal = true
    }
    onChange(remaining)
  }

  const handleMove = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= images.length) return
    const next = [...images]
    const temp = next[index]
    next[index] = next[targetIdx]
    next[targetIdx] = temp
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-[#2D2A26] flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-[#7A5C2E]" />
            Galeria de imagens {isEcommercePublished && <span className="text-[#B3261E]">*</span>}
          </label>
          <p className="text-[11px] text-[#6B655E]">
            {isEcommercePublished
              ? 'Imagem principal é obrigatória quando "Publicar no e-commerce" estiver Sim.'
              : 'Adicione fotos do produto, ordene e escolha a principal.'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] h-8"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Adicionar Fotos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />
      </div>

      {images.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#E5DFD5] hover:border-[#C6A664] rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#FDFBF7]"
        >
          <Upload className="h-8 w-8 mx-auto text-[#8C8275] mb-2" />
          <p className="text-xs font-semibold text-[#2D2A26]">
            Clique para fazer upload de imagens
          </p>
          <p className="text-[11px] text-[#6B655E]">
            PNG, JPG, WEBP ou JFIF (até 10MB por arquivo)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`relative group rounded-xl border overflow-hidden bg-white aspect-square flex flex-col justify-between ${
                img.isPrincipal
                  ? 'border-[#7A5C2E] ring-2 ring-[#C6A664]/50 shadow-md'
                  : 'border-[#E5DFD5]'
              }`}
            >
              <img
                src={img.previewUrl}
                alt={`Foto ${idx + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Badge Principal */}
              {img.isPrincipal && (
                <span className="absolute top-1.5 left-1.5 bg-[#7A5C2E] text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-md flex items-center gap-1">
                  <Star className="h-2.5 w-2.5 fill-current" /> Principal
                </span>
              )}

              {/* Botões de Ação na Imagem */}
              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'left')}
                    className="p-1 rounded bg-black/60 text-white hover:bg-black disabled:opacity-30"
                    title="Mover para esquerda"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === images.length - 1}
                    onClick={() => handleMove(idx, 'right')}
                    className="p-1 rounded bg-black/60 text-white hover:bg-black disabled:opacity-30"
                    title="Mover para direita"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {!img.isPrincipal && (
                    <button
                      type="button"
                      onClick={() => handleSetPrincipal(img.id)}
                      className="p-1 rounded bg-amber-600 text-white hover:bg-amber-700"
                      title="Definir como principal"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(img.id)}
                    className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                    title="Remover imagem"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
