/**
 * BACKUP das configurações de impressão da A4349 ANTES do ajuste fino da
 * v0.0.246 (margin-right interna da arte: 1mm → 2mm).
 *
 * Este arquivo NÃO é importado por nenhum código — é um registro para permitir
 * REVERSÃO fácil numa próxima rodada, conforme pedido do usuário.
 *
 * Para reverter: em src/components/LabelPrintModal.tsx, trocar
 *   const labelInnerPadding = isA4349 ? '1mm 2mm 1mm 1mm' : ...
 * por
 *   const labelInnerPadding = isA4349 ? '1mm' : ...
 *
 * ==========================================================================
 * A4349 — VALORES EM VIGOR ATÉ A v0.0.245 (inclusive):
 * ==========================================================================
 *
 * Margens do @page (em mm, na ordem CSS: sup dir inf esq):
 *   margin: 13mm 8mm 14mm 8mm !important;
 *   → sup 13 / dir 8 / inf 14 / esq 8
 *
 * Grade de etiquetas (gabarito src/types/labels.ts):
 *   7 colunas × 18 linhas (126 etiquetas por folha)
 *   etiqueta: 26,0 × 15,0 mm
 *   gap horizontal: 2,0 mm
 *   gap vertical: 0 mm
 *   folha: A4 210 × 297 mm
 *
 * Respiro interno da arte (padding da célula, LabelPrintModal):
 *   padding: 1mm  (1mm em TODOS os lados: sup, dir, inf, esq)
 *
 * Ordem de impressão:
 *   LabelPrintModal imprime com [...items].reverse() — final da fila no topo
 *   da 1ª folha (etiquetas em branco ficam no final da fila na tela e por isso
 *   imprimem nas primeiras posições da 1ª folha).
 *
 * ==========================================================================
 * A4349 — ÚNICA MUDANÇA FEITA NA v0.0.246:
 * ==========================================================================
 *   padding da célula: '1mm' → '1mm 2mm 1mm 1mm'
 *   (somente a margem interna DIREITA foi de 1mm para 2mm, afastando o código
 *   de barras + número 1mm a mais da borda direita da etiqueta)
 *
 * Nada mais mudou: @page 13/8/14/8, grade 7×18, gap 2mm horizontal, 0mm
 * vertical, ordem de impressão, e os gabaritos 6187/A4351/EBF23 intocados.
 * ==========================================================================
 */

export {}
