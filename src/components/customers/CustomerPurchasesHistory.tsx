import React from 'react'
import { Sale } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Calendar, CreditCard, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

interface CustomerPurchasesHistoryProps {
  sales: Sale[]
  loading?: boolean
}

export function CustomerPurchasesHistory({ sales, loading }: CustomerPurchasesHistoryProps) {
  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-[#6B655E]">
        Carregando histórico de compras...
      </div>
    )
  }

  if (!sales || sales.length === 0) {
    return (
      <div className="py-8 text-center bg-[#FDFBF7] rounded-lg border border-dashed border-[#E5DFD5]">
        <ShoppingBag className="h-8 w-8 text-[#C6A664] mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium text-[#2D2A26]">Nenhuma compra ou reserva registrada</p>
        <p className="text-xs text-[#6B655E] mt-0.5">
          As vendas e reservas vinculadas a este cliente no PDV aparecerão aqui automaticamente.
        </p>
      </div>
    )
  }

  const completedSales = sales.filter((s) => s.status === 'completed')
  const pendingReservations = sales.filter((s) => s.status === 'pending')
  const totalCompletedValue = completedSales.reduce((acc, s) => acc + (s.total || 0), 0)

  return (
    <div className="space-y-3">
      {/* Resumo Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white p-2.5 rounded-lg border border-[#E5DFD5]">
          <span className="text-[11px] text-[#6B655E] block">Vendas Concluídas</span>
          <span className="text-sm font-bold text-[#2D2A26]">{completedSales.length}</span>
        </div>
        <div className="bg-white p-2.5 rounded-lg border border-[#E5DFD5]">
          <span className="text-[11px] text-[#6B655E] block">Total Comprado</span>
          <span className="text-sm font-bold text-[#2E7D4F]">
            {formatCurrency(totalCompletedValue)}
          </span>
        </div>
        <div className="bg-white p-2.5 rounded-lg border border-[#E5DFD5]">
          <span className="text-[11px] text-[#6B655E] block">Reservas Pendentes</span>
          <span className="text-sm font-bold text-[#B3261E]">{pendingReservations.length}</span>
        </div>
      </div>

      {/* Lista de Registros */}
      <div className="border border-[#E5DFD5] rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8F5F0] text-[#6B655E] border-b border-[#E5DFD5] sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Código</th>
              <th className="py-2.5 px-3 font-semibold">Data / Hora</th>
              <th className="py-2.5 px-3 font-semibold">Tipo</th>
              <th className="py-2.5 px-3 font-semibold">Itens</th>
              <th className="py-2.5 px-3 font-semibold">Pagamento</th>
              <th className="py-2.5 px-3 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5DFD5]">
            {sales.map((sale) => {
              const itemsList = Array.isArray(sale.items)
                ? sale.items
                : typeof sale.items === 'string'
                  ? JSON.parse(sale.items || '[]')
                  : []
              const itemsCount = itemsList.reduce(
                (sum: number, it: any) => sum + (it.quantity || 1),
                0,
              )
              const isPending = sale.status === 'pending'
              const isCancelled = sale.status === 'cancelled'

              return (
                <tr key={sale.id} className="hover:bg-[#FDFBF7]/70 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-[#2D2A26]">{sale.code}</td>
                  <td className="py-2.5 px-3 text-[#6B655E]">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-[#C6A664]" />
                      {formatDateTime(sale.created)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {isPending ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-medium text-[11px] gap-1">
                        <Clock className="h-3 w-3" /> Reserva
                      </Badge>
                    ) : isCancelled ? (
                      <Badge className="bg-red-100 text-red-800 border-red-300 font-medium text-[11px] gap-1">
                        <AlertCircle className="h-3 w-3" /> Cancelada
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-medium text-[11px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Venda
                      </Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[#2D2A26]">
                    {itemsCount} {itemsCount === 1 ? 'peça' : 'peças'}
                  </td>
                  <td className="py-2.5 px-3 text-[#6B655E]">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-[#C6A664]" />
                      {sale.payment_method ? sale.payment_method.toUpperCase() : '—'}
                      {sale.installments && sale.installments > 1 ? ` (${sale.installments}x)` : ''}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#2D2A26]">
                    {formatCurrency(sale.total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
