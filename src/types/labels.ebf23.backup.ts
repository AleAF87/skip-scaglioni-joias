/**
 * BACKUP das configurações da etiqueta Singularis EBF23 (anel) — estado
 * FINAL da v0.0.272, calibração física fechada pelo usuário contra a folha
 * Carta real, ANTES da introdução dos "Ajustes avançados de impressão".
 *
 * Este arquivo NÃO é importado por nenhum código — é um registro para permitir
 * REVERSÃO fácil, conforme pedido do usuário ("Salve essas configurações como
 * backup, pois precisamos alterar").
 *
 * Backup criado em 27/11/2026 (v0.0.272 → v0.0.273).
 *
 * ==========================================================================
 * EBF23 — VALORES EM VIGOR ATÉ A v0.0.272 (inclusive):
 * ==========================================================================
 *
 * Gabarito (src/types/labels.ts, entry 'EBF23'):
 *   folha: CARTA (não A4), retrato — 215,9 × 279,4 mm
 *   grade: 2 colunas × 20 linhas — 40 etiquetas por folha
 *   etiqueta: 80,0 × 10,0 mm
 *     (80mm = 27 aba esquerda + 1mm picote/dobra + 27 aba direita + 25 haste;
 *      a Tecson descreve 27+27+25 = 79mm, a implementação usa 80mm COM o 1mm
 *      de picote — NÃO reduzir para 79mm)
 *   marginTopMm: 15,5   (v0.0.269: +1mm sobre o 14,5 original)
 *   marginLeftMm: 24,5  (v0.0.271: −1mm sobre o 25,5 original)
 *   gapHorizontalMm: 4,9
 *   gapVerticalMm: 2,73 (v0.0.270: passo real ~12,73mm medido na folha física)
 *   isJewelryTag: true
 *
 * Margens do @page na impressão (LabelPrintModal, em mm, ordem CSS sup dir inf esq):
 *   margin: 15,5mm 25,5mm 11,5mm 24,5mm !important;
 *   → sup 15,5 / dir 25,5 / inf 11,5 / esq 24,5
 *   (Horizontal: 24,5 + 2×80 + 4,9 + 25,5 = 214,9mm ≤ 215,9mm da Carta ✓
 *    Vertical: 15,5 + 20×10 + 19×2,73 + 11,5 ≈ 278,9mm ≤ 279,4mm ✓)
 *
 * Arte da célula (LabelPrintModal, branch template.isJewelryTag):
 *   padding da célula: 0mm — cada aba cuida da própria margem interna;
 *   aba esquerda 27mm: SOMENTE código de barras centralizado (sem SKU/número
 *     embaixo), padding interno '1mm 2mm 1mm 1mm';
 *   picote: 1mm de largura, linha pontilhada visível SÓ NA PRÉVIA
 *     (print:border-l-0 — o espaço de 1mm permanece para não deslocar a aba
 *     direita);
 *   aba direita 27mm: código da peça, nome resumido, preço de venda —
 *     alinhado à esquerda, padding interno 1mm;
 *   haste final 25mm: SEM NENHUMA impressão (envolve a peça/anel).
 *
 * LabelGenerationPage (v0.0.272):
 *   NÃO passava manualOffsets para o LabelPrintModal — a EBF23 imprimia
 *   sempre com os valores-base acima, sem ajustes avançados na tela.
 *
 * ==========================================================================
 * PARA REVERTER (voltar ao estado da v0.0.272):
 * ==========================================================================
 *   1. Em src/pages/LabelGenerationPage.tsx: remover a seção "Ajustes
 *      avançados de impressão" e a prop manualOffsets do LabelPrintModal.
 *   2. Em src/components/LabelPrintModal.tsx: para a EBF23, o @page volta a
 *      usar as constantes fixas 15,5 / 25,5 / 11,5 / 24,5 em vez de
 *      effectiveMarginTop/effectiveMarginLeft e o effectiveGapY/effectiveGapX.
 *   3. Em src/types/labels.ts: os valores do gabarito EBF23 acima JÁ são
 *      esses — não precisa mudar (os ajustes avançados são SOMADOS por cima,
 *      com default 0 em todos).
 * ==========================================================================
 */

export {}
