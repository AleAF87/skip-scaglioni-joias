import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface LightboxPhoto {
  url: string
  alt?: string
}

interface ImageLightboxProps {
  open: boolean
  onClose: () => void
  photos: (string | LightboxPhoto)[]
  initialIndex?: number
  title?: string
}

export function ImageLightbox({
  open,
  onClose,
  photos,
  initialIndex = 0,
  title,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // Normalize photos
  const normalizedPhotos: LightboxPhoto[] = photos.map((p) =>
    typeof p === 'string' ? { url: p, alt: title || 'Foto da joia' } : p,
  )

  useEffect(() => {
    if (open) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, normalizedPhotos.length - 1)))
    }
  }, [open, initialIndex, normalizedPhotos.length])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : normalizedPhotos.length - 1))
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev < normalizedPhotos.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, normalizedPhotos.length, onClose])

  if (!open || normalizedPhotos.length === 0) return null

  const currentPhoto = normalizedPhotos[currentIndex] || normalizedPhotos[0]
  const hasMultiple = normalizedPhotos.length > 1

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : normalizedPhotos.length - 1))
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev < normalizedPhotos.length - 1 ? prev + 1 : 0))
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent
        className="max-w-none w-[100vw] h-[100vh] max-h-none rounded-none border-0 bg-black/95 text-white focus:outline-none"
        aria-describedby={undefined}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {title || `Visualização de foto (${currentIndex + 1} de ${normalizedPhotos.length})`}
        </DialogTitle>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2">
            {title && (
              <span className="font-serif font-semibold text-sm text-[#F3EAD8] line-clamp-1 max-w-[260px] sm:max-w-md">
                {title}
              </span>
            )}
            {hasMultiple && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-mono">
                {currentIndex + 1} / {normalizedPhotos.length}
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-black/50 text-white hover:bg-white/20 hover:text-white"
            title="Fechar (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Main image presentation */}
        <div
          className="relative flex-1 flex items-center justify-center min-h-[50vh] py-16 select-none cursor-pointer"
          onClick={onClose}
        >
          <img
            src={currentPhoto.url}
            alt={currentPhoto.alt || title || 'Foto da joia'}
            className="max-h-full max-w-full object-contain mx-auto rounded-md shadow-2xl transition-all duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 backdrop-blur-xs transition-transform hover:scale-110"
                title="Foto anterior (Seta esquerda)"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 backdrop-blur-xs transition-transform hover:scale-110"
                title="Próxima foto (Seta direita)"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {/* Bottom thumbnails strip */}
        {hasMultiple && (
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-2 p-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent overflow-x-auto">
            {normalizedPhotos.map((photo, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentIndex(idx)
                }}
                className={`h-11 w-11 rounded-md overflow-hidden border-2 shrink-0 transition-all ${
                  currentIndex === idx
                    ? 'border-[#C6A664] scale-105 shadow-md'
                    : 'border-white/30 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
