import React from 'react'
import {
  Printer,
  X,
  Sparkles,
  Calendar,
  User,
  Package,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResellerReturn } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { LOGO_ICON_URL } from '@/constants/branding'

interface SettlementReceiptModalProps {
  settlement: ResellerReturn | null
  resellerNameFallback?: string
  closedByName?: string
  isOpen: boolean
  onClose: () => void
}

// Comprovante do Fechamento/Acerto da revendedora (Conferência & Devolução).
// Mesmo padrão visual/impressão do DeliveryReceiptModal (janela print() para salvar como PDF).
export const SettlementReceiptModal: React.FC<SettlementReceiptModalProps> = ({
  settlement,
  resellerNameFallback,
  closedByName,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !settlement) return null

  const handlePrint = () => {
    window.print()
  }

  const items = settlement.items || []
  const resellerName = settlement.expand?.reseller?.name || resellerNameFallback || 'Revendedora'
  const resellerPhone = settlement.expand?.reseller?.phone
  const closedBy = settlement.expand?.operator?.name || closedByName || '—'
  const totalPieces = settlement.total_returned_qty + settlement.total_pending_qty
  // Fechamento sem vendas e sem pendências: nada a acertar com a revendedora.
  const hasNothingDue =
    settlement.total_pending_value_due <= 0 &&
    settlement.total_pending_qty <= 0 &&
    (settlement.commission_rate ?? 0) >= 0
  const commissionRate = settlement.commission_rate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#2D2A26]/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#E5DFD5] overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Header bar - Screen only */}
        <div className="px-6 py-4 border-b border-[#E5DFD5] flex items-center justify-between bg-[#FDFBF7] print:hidden">
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Sparkles className="h-5 w-5" />
            <h2 className="font-serif font-bold text-lg text-[#2D2A26]">
              Comprovante de Fechamento / Acerto
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / Salvar PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-[#6B655E] h-8 w-8 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div
          id="settlement-receipt-print-area"
          className="p-6 md:p-8 overflow-y-auto space-y-6 text-[#2D2A26]"
        >
          {/* Brand header */}
          <div className="flex items-start justify-between border-b border-[#E5DFD5] pb-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-black p-1.5 rounded-xl border border-[#C6A664]/50 shrink-0">
                  <img
                    src={LOGO_ICON_URL}
                    alt="Scaglioni Joias"
                    className="h-10 w-10 object-contain"
                  />
                </div>
                <div>
                  <h1 className="font-serif text-xl font-bold tracking-tight text-[#2D2A26]">
                    Scaglioni Joias
                  </h1>
                  <p className="text-[11px] text-[#6B655E] uppercase tracking-wider font-medium">
                    Alta Joalheria • Comprovante de Fechamento de Consignação
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md bg-[#F3EAD8] text-[#7A5C2E] font-mono font-bold text-xs">
                {settlement.code}
              </span>
              <p className="text-[11px] text-[#6B655E] mt-1">
                Data: {formatDateTime(settlement.created)}
              </p>
            </div>
          </div>

          {/* Meta details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5]/80 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[#6B655E]">
                <User className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span className="font-medium">Revendedora:</span>
              </div>
              <p className="font-bold text-sm text-[#2D2A26]">{resellerName}</p>
              {resellerPhone && <p className="text-[#6B655E]">Tel: {resellerPhone}</p>}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[#6B655E]">
                <Calendar className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span className="font-medium">Fechamento:</span>
              </div>
              <p className="text-sm text-[#2D2A26]">
                Concluído por <strong>{closedBy}</strong>
              </p>
              <p className="text-[#6B655E]">Em: {formatDateTime(settlement.created)}</p>
            </div>
          </div>

          {/* Composição do acerto */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-[#7A5C2E]" />
              <h3 className="font-serif font-bold text-sm text-[#2D2A26]">Composição do Acerto</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <p className="text-[10px] uppercase font-semibold text-emerald-800">
                  Peças Devolvidas
                </p>
                <p className="text-lg font-bold font-serif text-emerald-900 mt-1">
                  {settlement.total_returned_qty} un
                </p>
                <p className="text-[10px] text-emerald-700">retornaram ao estoque da loja</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <p className="text-[10px] uppercase font-semibold text-amber-800">
                  Pendências / Extravios
                </p>
                <p className="text-lg font-bold font-serif text-amber-900 mt-1">
                  {settlement.total_pending_qty} un
                </p>
                <p className="text-[10px] text-amber-700">registrados nesta conferência</p>
              </div>
              <div className="p-3 bg-[#F3EAD8]/50 rounded-xl border border-[#C6A664]/50 text-center">
                <p className="text-[10px] uppercase font-semibold text-[#7A5C2E]">
                  Valor Devido à Scaglioni
                </p>
                <p className="text-lg font-bold font-serif text-[#7A5C2E] mt-1">
                  {formatCurrency(settlement.total_pending_value_due)}
                </p>
                <p className="text-[10px] text-[#7A5C2E]">pendências quitadas no acerto</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw className="h-4 w-4 text-[#7A5C2E]" />
                <h3 className="font-serif font-bold text-sm text-[#2D2A26]">
                  Detalhamento por Peça ({totalPieces} un)
                </h3>
              </div>
              <div className="border border-[#E5DFD5] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descrição da Joia</th>
                      <th className="py-2.5 px-3 text-center">Devolvidas</th>
                      <th className="py-2.5 px-3 text-center">Pendentes</th>
                      <th className="py-2.5 px-3">Motivo</th>
                      <th className="py-2.5 px-3 text-right">Valor Pendente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[#FDFBF7]/60">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#7A5C2E]">
                          {item.code || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#2D2A26]">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                          {item.returned_qty}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-800">
                          {item.pending_qty}
                        </td>
                        <td className="py-2.5 px-3 text-[#6B655E]">
                          {item.pending_qty > 0
                            ? item.pending_reason === 'extraviada'
                              ? 'Extraviada'
                              : item.pending_reason === 'venda_avulsa_sem_pdv'
                                ? 'Venda avulsa sem PDV'
                                : 'Outros'
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#2D2A26]">
                          {item.pending_qty > 0
                            ? formatCurrency(
                                item.scaglioni_due ?? item.selling_price * item.pending_qty,
                              )
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#FDFBF7] font-semibold border-t border-[#E5DFD5]">
                    <tr>
                      <td colSpan={2} className="py-3 px-3 text-right font-serif text-[#7A5C2E]">
                        Totais do Fechamento:
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-sm text-emerald-700">
                        {settlement.total_returned_qty}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-sm text-amber-800">
                        {settlement.total_pending_qty}
                      </td>
                      <td></td>
                      <td className="py-3 px-3 text-right font-bold text-sm text-[#7A5C2E]">
                        {formatCurrency(settlement.total_pending_value_due)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Nada a acertar — fechamento sem vendas e sem pendências */}
          {hasNothingDue && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
              <p className="font-bold text-emerald-800 uppercase tracking-wider text-[11px] mb-1">
                Nada a acertar
              </p>
              <p className="text-emerald-800 leading-relaxed">
                Nenhuma venda foi realizada e todas as peças foram devolvidas ao estoque geral da
                loja. Não há valores a pagar ou a receber — o acerto é encerrado sem saldo.
                {typeof commissionRate === 'number' && totalPieces > 0
                  ? ` Comissão considerada neste fechamento: ${commissionRate}%.`
                  : ''}
              </p>
            </div>
          )}

          {/* Notes */}
          {settlement.notes && (
            <div className="p-3 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] text-xs">
              <span className="font-semibold text-[#6B655E]">Observações: </span>
              <span className="text-[#2D2A26]">{settlement.notes}</span>
            </div>
          )}

          {/* Termo */}
          <div className="border border-[#E5DFD5] rounded-xl p-5 bg-[#FDFBF7] space-y-3">
            <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-[#7A5C2E]">
              Termo de Conferência e Acerto
            </h4>
            <p className="text-[11px] text-[#6B655E] leading-relaxed">
              Declaro que a conferência das joias em poder da revendedora foi concluída conforme o
              detalhamento deste documento: as peças devolvidas retornaram ao estoque geral da loja
              e as pendências/extravios registrados foram quitados conforme as regras da Scaglioni
              Joias.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#E5DFD5]">
              <div className="text-center sm:text-left">
                <p className="text-xs font-semibold text-[#2D2A26]">{resellerName}</p>
                <p className="text-[10px] text-[#6B655E]">Revendedora</p>
              </div>
              <div className="w-56 border-b-2 border-dashed border-[#A8A196] h-12 flex items-end justify-center pb-1">
                <span className="text-[10px] text-[#8C8275] italic">Assinatura</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[10px] text-[#8C8275] flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Documento gerado automaticamente pelo sistema Scaglioni Joias — conserve para auditoria.
          </p>
        </div>

        {/* Footer actions - screen only */}
        <div className="px-6 py-3 border-t border-[#E5DFD5] bg-[#FDFBF7] flex justify-end gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Fechar
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-[#7A5C2E] hover:bg-[#634923] text-white text-xs flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir Comprovante
          </Button>
        </div>
      </div>
    </div>
  )
}
