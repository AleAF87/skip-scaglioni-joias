import React from 'react'
import { Save, RotateCcw, Ruler, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Ajustes avançados de impressão (calibração) — exibido quando o gabarito
 * EBF23 está selecionado na Geração de Etiquetas.
 *
 * - 4 campos em mm (Margem superior, Margem esquerda, Espaçamento entre
 *   linhas, Espaçamento entre colunas), default 0, aceitando positivos e
 *   negativos com casas decimais.
 * - Os valores são SOMADOS aos valores-base do gabarito (superior 15,5 /
 *   esquerda 24,5 / vertical 2,73 / horizontal 4,9) — ex.: +1mm de margem
 *   superior → 16,5mm impresso.
 * - Persistência POR NAVEGADOR/DISPOSITIVO e POR MODELO, via localStorage
 *   (chave: "label-print-calibration-EBF23").
 * - Os valores chegam ao LabelPrintModal via prop manualOffsets e valem para
 *   a PRÉVIA e para o CSS de impressão (@page + gaps da grade).
 */

export interface ManualOffsets {
  marginTop: number
  marginLeft: number
  gapHorizontal: number
  gapVertical: number
}

export const ZERO_OFFSETS: ManualOffsets = {
  marginTop: 0,
  marginLeft: 0,
  gapHorizontal: 0,
  gapVertical: 0,
}

const storageKey = (templateId: string) => `label-print-calibration-${templateId}`

/** Lê a calibração salva neste navegador/dispositivo para o gabarito. */
export function loadCalibration(templateId: string): ManualOffsets {
  try {
    const raw = localStorage.getItem(storageKey(templateId))
    if (!raw) return { ...ZERO_OFFSETS }
    const parsed = JSON.parse(raw) as Partial<ManualOffsets>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    return {
      marginTop: num(parsed.marginTop),
      marginLeft: num(parsed.marginLeft),
      gapHorizontal: num(parsed.gapHorizontal),
      gapVertical: num(parsed.gapVertical),
    }
  } catch {
    return { ...ZERO_OFFSETS }
  }
}

/** Salva a calibração por navegador/dispositivo e por modelo. */
export function saveCalibration(templateId: string, offsets: ManualOffsets): void {
  try {
    localStorage.setItem(storageKey(templateId), JSON.stringify(offsets))
  } catch {
    // localStorage indisponível (modo privado etc.): calibração fica só na sessão.
  }
}

/** Remove a calibração salva (restaurar padrão). */
export function clearCalibration(templateId: string): void {
  try {
    localStorage.removeItem(storageKey(templateId))
  } catch {
    // ignora
  }
}

const fmtMm = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString('pt-BR')} mm`

interface LabelCalibrationSettingsProps {
  templateId: string
  offsets: ManualOffsets
  onChange: (offsets: ManualOffsets) => void
  onSave: () => void
  onReset: () => void
  onPrintCalibration: () => void
  base: {
    marginTop: number
    marginLeft: number
    gapHorizontal: number
    gapVertical: number
  }
}

const FIELDS: Array<{ key: keyof ManualOffsets; label: string }> = [
  { key: 'marginTop', label: 'Margem superior (mm)' },
  { key: 'marginLeft', label: 'Margem esquerda (mm)' },
  { key: 'gapVertical', label: 'Espaçamento entre linhas (mm)' },
  { key: 'gapHorizontal', label: 'Espaçamento entre colunas (mm)' },
]

export const LabelCalibrationSettings: React.FC<LabelCalibrationSettingsProps> = ({
  templateId,
  offsets,
  onChange,
  onSave,
  onReset,
  onPrintCalibration,
  base,
}) => {
  const handleChange = (key: keyof ManualOffsets, raw: string) => {
    const v = raw.trim() === '' ? 0 : parseFloat(raw.replace(',', '.'))
    onChange({ ...offsets, [key]: Number.isFinite(v) ? v : 0 })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Ruler className="h-4 w-4 text-[#7A5C2E]" />
        <h3 className="text-sm font-bold text-[#2D2A26]">Ajustes avançados de impressão</h3>
        <span className="text-[11px] text-[#6B655E]">
          (soma aos valores-base do gabarito {templateId} — salvo neste navegador/dispositivo)
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`calib-${f.key}`} className="text-xs text-[#6B655E]">
              {f.label}
            </Label>
            <Input
              id={`calib-${f.key}`}
              type="number"
              step={0.01}
              inputMode="decimal"
              value={String(offsets[f.key])}
              onChange={(e) => handleChange(f.key, e.target.value)}
              className="h-8 text-xs"
              placeholder="0"
            />
            <p className="text-[10px] text-[#6B655E] leading-tight">
              base {fmtMm(base[f.key])} → final{' '}
              <span className="font-semibold text-[#2D2A26]">
                {fmtMm(base[f.key] + (offsets[f.key] || 0))}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          className="h-8 bg-[#7A5C2E] hover:bg-[#634924] text-white"
        >
          <Save className="h-4 w-4 mr-1.5" />
          Salvar calibração
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReset}
          className="h-8 border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8]"
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Restaurar padrão
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPrintCalibration}
          className="h-8 border-[#2E7D4F] text-[#2E7D4F] hover:bg-[#2E7D4F]/10"
        >
          <Printer className="h-4 w-4 mr-1.5" />
          Imprimir folha de calibração EBF23
        </Button>
      </div>

      <p className="text-[11px] text-[#6B655E] leading-snug">
        A folha de calibração imprime as 40 posições numeradas (linha × coluna) SEM dados de produto
        — use-a para conferir a primeira/última etiqueta, as duas colunas e o desvio acumulado antes
        de imprimir a fila real.
      </p>
    </div>
  )
}
