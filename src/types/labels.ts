export interface LabelTemplateModel {
  id: string
  label: string
  description: string
  sheetType: 'A4' | 'Carta'
  sheetWidthMm: number
  sheetHeightMm: number
  labelsPerSheet: number
  columns: number
  rows: number
  labelWidthMm: number
  labelHeightMm: number
  marginTopMm: number
  marginLeftMm: number
  gapHorizontalMm: number
  gapVerticalMm: number
  isJewelryTag?: boolean // Ex: EBF23 etiqueta anel/óculos
}

export const LABEL_TEMPLATES: Record<string, LabelTemplateModel> = {
  '6187': {
    id: '6187',
    label: 'A4 — Pimaco/Maxprint 6187 — 80 etiquetas por folha',
    description: '4 colunas × 20 linhas | 44,45 × 12,7 mm',
    sheetType: 'Carta',
    // Folha formato Carta/A4 padrão compatível: Carta 215.9 x 279.4 mm
    sheetWidthMm: 215.9,
    sheetHeightMm: 279.4,
    labelsPerSheet: 80,
    columns: 4,
    rows: 20,
    labelWidthMm: 44.45,
    labelHeightMm: 12.7,
    marginTopMm: 12.7,
    marginLeftMm: 14.5,
    gapHorizontalMm: 3.05, // passo horizontal 47.5mm - largura 44.45 = 3.05mm
    gapVerticalMm: 0, // passo vertical 12.7mm = sem gap entre linhas
    isJewelryTag: false,
  },
  A4349: {
    id: 'A4349',
    label: 'A4 — Pimaco A4349 — 126 etiquetas por folha',
    description: '7 colunas × 18 linhas | 26,0 × 15,0 mm',
    sheetType: 'A4',
    // Folha A4 padrão: 210 x 297 mm
    sheetWidthMm: 210.0,
    sheetHeightMm: 297.0,
    labelsPerSheet: 126,
    columns: 7,
    rows: 18,
    labelWidthMm: 26.0,
    labelHeightMm: 15.0,
    marginTopMm: 13.0, // v0.0.241: geometria confirmada (sup 13 / inf 14 / esq 8 / dir 8)
    marginLeftMm: 8.0,
    gapHorizontalMm: 2.0, // passo horizontal 28.0mm - 26.0 = 2.0mm
    gapVerticalMm: 0, // passo vertical 15.0mm = sem gap
    isJewelryTag: false,
  },
  A4351: {
    id: 'A4351',
    label: 'A4 — Pimaco A4351 — 65 etiquetas por folha',
    description: '5 colunas × 13 linhas | 38,2 × 21,2 mm',
    sheetType: 'A4',
    // Folha A4 padrão: 210 x 297 mm
    sheetWidthMm: 210.0,
    sheetHeightMm: 297.0,
    labelsPerSheet: 65,
    columns: 5,
    rows: 13,
    labelWidthMm: 38.2,
    labelHeightMm: 21.2,
    marginTopMm: 10.7,
    marginLeftMm: 4.5,
    gapHorizontalMm: 2.5, // passo horizontal 40.7mm - 38.2 = 2.5mm
    gapVerticalMm: 0, // passo vertical 21.2mm = sem gap
    isJewelryTag: false,
  },
  EBF23: {
    id: 'EBF23',
    label: 'A4 — Singularis EBF23 — Etiqueta para anel — 40 etiquetas por folha',
    description:
      '2 colunas × 20 linhas | 80,0 × 10,0 mm (duas abas de 27mm + picote + haste de 25mm)',
    sheetType: 'Carta',
    // Folha Carta 215.9 x 279.4 mm — encaixe confirmado pelo usuário (v0.0.267):
    // @page sup 14,5 / esq 25,5 / dir 25,5 / inf 13,5.
    // Horizontal: 25,5 + (2×80) + 4,9 + 25,5 = 215,9mm ✓
    // Vertical: 14,5 + (20×10) + (19×2,5) + 13,5 = 279,4mm ✓
    sheetWidthMm: 215.9,
    sheetHeightMm: 279.4,
    labelsPerSheet: 40,
    columns: 2,
    rows: 20,
    labelWidthMm: 80.0,
    labelHeightMm: 10.0,
    marginTopMm: 14.5,
    marginLeftMm: 25.5,
    gapHorizontalMm: 4.9,
    gapVerticalMm: 2.5,
    isJewelryTag: true,
  },
}
