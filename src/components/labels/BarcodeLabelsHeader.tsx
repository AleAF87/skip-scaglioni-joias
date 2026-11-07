import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Tag, Boxes, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarcodeLabelsHeaderProps {
  countToPrint: number
  onPrint: () => void
}

export const BarcodeLabelsHeader: React.FC<BarcodeLabelsHeaderProps> = ({
  countToPrint,
  onPrint,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4 no-print">
      <div className="flex items-center gap-2">
        <Link
          to="/estoque"
          className="p-1.5 rounded-lg text-[#6B655E] hover:text-[#2D2A26] hover:bg-[#F3EAD8] transition-colors"
          title="Voltar para o Estoque"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="p-2 rounded-lg bg-[#C6A664]/20 text-[#7A5C2E]">
          <Tag className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
            Etiquetas de Código de Barras
          </h1>
          <p className="text-xs sm:text-sm text-[#6B655E] mt-0.5">
            Geração e impressão com Code 128 exato dos produtos do banco para teste em leitores e
            PDV.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/estoque">
          <Button
            variant="outline"
            size="sm"
            className="border-[#E5DFD5] text-[#2D2A26] hover:bg-[#F3EAD8]"
          >
            <Boxes className="h-4 w-4 mr-1.5" />
            Ver Estoque
          </Button>
        </Link>

        <Button
          onClick={onPrint}
          disabled={countToPrint === 0}
          className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-95 text-white font-bold shadow-md h-10 px-4"
          title="Abre o diálogo de impressão do navegador para imprimir ou salvar como PDF"
        >
          <Printer className="h-4 w-4 mr-2" />
          <span>Imprimir / Salvar PDF</span>
          <span className="ml-2 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-mono">
            {countToPrint}
          </span>
        </Button>
      </div>
    </div>
  )
}
