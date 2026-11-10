import React from 'react'
import { Printer, X, Sparkles, CheckCircle2, Calendar, User, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResellerDelivery } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { LOGO_ICON_URL } from '@/constants/branding'

interface DeliveryReceiptModalProps {
  delivery: ResellerDelivery | null
  isOpen: boolean
  onClose: () => void
}

export const DeliveryReceiptModal: React.FC<DeliveryReceiptModalProps> = ({
  delivery,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !delivery) return null

  const handlePrint = () => {
    window.print()
  }

  const items = delivery.items || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#2D2A26]/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#E5DFD5] overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Header bar - Screen only */}
        <div className="px-6 py-4 border-b border-[#E5DFD5] flex items-center justify-between bg-[#FDFBF7] print:hidden">
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <Sparkles className="h-5 w-5" />
            <h2 className="font-serif font-bold text-lg text-[#2D2A26]">
              Comprovante de Entrega de Joias
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
          id="receipt-print-area"
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
                    Alta Joalheria • Comprovante Oficial de Entrega
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md bg-[#F3EAD8] text-[#7A5C2E] font-mono font-bold text-xs">
                {delivery.code}
              </span>
              <p className="text-[11px] text-[#6B655E] mt-1 font-mono">Entrega {delivery.code}</p>
              <p className="text-[11px] text-[#6B655E] mt-1">
                Data: {formatDateTime(delivery.created)}
              </p>
            </div>
          </div>

          {/* Delivery meta details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5]/80 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[#6B655E]">
                <User className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span className="font-medium">Revendedora:</span>
              </div>
              <p className="font-bold text-sm text-[#2D2A26]">
                {delivery.expand?.reseller?.name || delivery.signer_name || 'Revendedora Scaglioni'}
              </p>
              {delivery.expand?.reseller?.phone && (
                <p className="text-[#6B655E]">Tel: {delivery.expand.reseller.phone}</p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[#6B655E]">
                <Calendar className="h-3.5 w-3.5 text-[#7A5C2E]" />
                <span className="font-medium">Status do Recebimento:</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2
                  className={`h-4 w-4 ${delivery.status === 'accepted' ? 'text-emerald-600' : 'text-amber-600'}`}
                />
                <span className="font-semibold capitalize text-sm">
                  {delivery.status === 'accepted'
                    ? 'Recebido e Assinado'
                    : 'Pendente de Assinatura'}
                </span>
              </div>
              {delivery.operator && delivery.expand?.operator && (
                <p className="text-[#6B655E]">Entregue por: {delivery.expand.operator.name}</p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-[#7A5C2E]" />
              <h3 className="font-serif font-bold text-sm text-[#2D2A26]">
                Joias Entregues e Transferidas para a Vendedora
              </h3>
            </div>
            <div className="border border-[#E5DFD5] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F3EAD8]/60 text-[#7A5C2E] uppercase font-semibold border-b border-[#E5DFD5]">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descrição da Joia</th>
                    <th className="py-2.5 px-3 text-center">Qtd</th>
                    <th className="py-2.5 px-3 text-right">Preço Venda (un)</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD5]">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#FDFBF7]/60">
                      <td className="py-2.5 px-3 font-mono font-medium text-[#7A5C2E]">
                        {item.code || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#2D2A26]">{item.description}</td>
                      <td className="py-2.5 px-3 text-center font-bold">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right text-[#6B655E]">
                        {formatCurrency(item.selling_price)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#2D2A26]">
                        {formatCurrency(item.subtotal || item.selling_price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#FDFBF7] font-semibold border-t border-[#E5DFD5]">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 text-right font-serif text-[#7A5C2E]">
                      Totais da Entrega:
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-sm">
                      {delivery.total_items_count} peças
                    </td>
                    <td
                      colSpan={2}
                      className="py-3 px-3 text-right font-bold text-sm text-[#7A5C2E]"
                    >
                      {formatCurrency(delivery.total_value)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {delivery.notes && (
            <div className="p-3 bg-[#FDFBF7] rounded-xl border border-[#E5DFD5] text-xs">
              <span className="font-semibold text-[#6B655E]">Observações: </span>
              <span className="text-[#2D2A26]">{delivery.notes}</span>
            </div>
          )}

          {/* Signature Section */}
          <div className="border border-[#E5DFD5] rounded-xl p-5 bg-[#FDFBF7] space-y-3">
            <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-[#7A5C2E]">
              Termo de Recebimento e Conferência
            </h4>
            <p className="text-[11px] text-[#6B655E] leading-relaxed">
              Declaro que conferi e recebi integralmente as joias descritas neste documento em
              perfeito estado de conservação, ficando as mesmas sob minha responsabilidade de
              estoque em poder da revendedora para comercialização conforme as regras da Scaglioni
              Joias.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#E5DFD5]">
              <div className="text-center sm:text-left">
                <p className="text-xs font-semibold text-[#2D2A26]">
                  {delivery.signer_name ||
                    delivery.expand?.reseller?.name ||
                    'Vendedora Responsável'}
                </p>
                {delivery.signed_at && (
                  <p className="text-[10px] text-[#6B655E]">
                    Assinado em: {formatDateTime(delivery.signed_at)}
                  </p>
                )}
              </div>

              {/* Display Signature Image */}
              {delivery.signature_data ? (
                <div className="flex flex-col items-center">
                  <div className="border border-[#C6A664]/60 bg-white rounded-lg p-1.5 shadow-2xs">
                    <img
                      src={delivery.signature_data}
                      alt="Assinatura da Revendedora"
                      className="h-16 w-48 object-contain"
                    />
                  </div>
                  <span className="text-[10px] text-[#7A5C2E] font-medium mt-1">
                    Assinatura digital capturada na tela
                  </span>
                </div>
              ) : (
                <div className="w-56 border-b-2 border-dashed border-[#A8A196] h-12 flex items-end justify-center pb-1">
                  <span className="text-[10px] text-[#8C8275] italic">
                    Assinatura da Revendedora
                  </span>
                </div>
              )}
            </div>
          </div>
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
