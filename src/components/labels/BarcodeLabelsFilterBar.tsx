import React from 'react'
import { Search, Filter, CheckSquare, Square, RotateCcw, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export type GridColumns = 2 | 3 | 4

interface BarcodeLabelsFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  onlyAvailable: boolean
  onToggleOnlyAvailable: () => void
  gridColumns: GridColumns
  onGridColumnsChange: (cols: GridColumns) => void
  showPreviewOnly: boolean
  onTogglePreviewOnly: () => void
  filteredCount: number
  totalCount: number
  selectedCount: number
  allFilteredSelected: boolean
  onSelectAllFiltered: () => void
  onClearSelection: () => void
}

export const BarcodeLabelsFilterBar: React.FC<BarcodeLabelsFilterBarProps> = ({
  search,
  onSearchChange,
  onlyAvailable,
  onToggleOnlyAvailable,
  gridColumns,
  onGridColumnsChange,
  showPreviewOnly,
  onTogglePreviewOnly,
  filteredCount,
  totalCount,
  selectedCount,
  allFilteredSelected,
  onSelectAllFiltered,
  onClearSelection,
}) => {
  return (
    <Card className="border-[#E5DFD5] bg-white shadow-xs no-print">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Input de busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B655E]" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por código (ex. 776981 PRATA 19), nome ou descrição..."
              className="pl-9 border-[#E5DFD5] focus-visible:ring-[#C6A664]"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-2.5 text-xs text-[#6B655E] hover:text-black"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro: Apenas disponíveis */}
          <Button
            type="button"
            variant={onlyAvailable ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleOnlyAvailable}
            className={
              onlyAvailable
                ? 'bg-[#7A5C2E] text-white hover:bg-[#634924]'
                : 'border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]'
            }
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            {onlyAvailable ? 'Apenas Disponíveis (Ativo)' : 'Apenas Disponíveis'}
          </Button>

          {/* Controle de colunas da grade */}
          <div className="flex items-center gap-1 border border-[#E5DFD5] rounded-lg p-1 bg-[#FDFBF7]">
            <span className="text-[11px] font-semibold text-[#6B655E] px-1.5 hidden sm:inline">
              Grade:
            </span>
            {([2, 3, 4] as GridColumns[]).map((cols) => (
              <button
                key={cols}
                type="button"
                onClick={() => onGridColumnsChange(cols)}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  gridColumns === cols
                    ? 'bg-[#7A5C2E] text-white shadow-xs'
                    : 'text-[#6B655E] hover:bg-[#E5DFD5]'
                }`}
                title={`${cols} colunas por linha`}
              >
                {cols} col
              </button>
            ))}
          </div>

          {/* Toggle Modo Prévia */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTogglePreviewOnly}
            className="text-[#6B655E] hover:bg-[#F3EAD8]"
            title="Alternar entre modo compacto ou detalhado"
          >
            <Eye className="h-4 w-4 mr-1.5" />
            {showPreviewOnly ? 'Exibir Lista + Grade' : 'Apenas Grade'}
          </Button>
        </div>

        {/* Barra de Seleção e Totais */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5DFD5] text-xs">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectAllFiltered}
              className="h-8 border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
            >
              {allFilteredSelected ? (
                <CheckSquare className="h-4 w-4 mr-1.5 text-[#7A5C2E]" />
              ) : (
                <Square className="h-4 w-4 mr-1.5 text-[#6B655E]" />
              )}
              {allFilteredSelected
                ? 'Desmarcar todos os filtrados'
                : `Selecionar todos os filtrados (${filteredCount})`}
            </Button>

            {selectedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-8 text-[#B3261E] hover:bg-[#B3261E]/10"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Limpar seleção ({selectedCount})
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[#6B655E]">
            <span>
              Mostrando <strong className="text-[#2D2A26]">{filteredCount}</strong> de{' '}
              <strong className="text-[#2D2A26]">{totalCount}</strong> produtos do banco com código
            </span>
            {selectedCount > 0 && (
              <Badge className="bg-[#7A5C2E] text-white">
                {selectedCount} selecionado(s) para impressão
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
