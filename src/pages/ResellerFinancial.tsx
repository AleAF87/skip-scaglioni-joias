import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Boxes,
  Sparkles,
  Calendar,
  CreditCard,
  CheckCircle2,
  Receipt,
  Store,
  User,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { Reseller, ResellerSale, ResellerIssue } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

export default function ResellerFinancial() {
  const { user, isAdmin, isOperator, isReseller } = useAuth()
  const canManage = isAdmin || isOperator

  const [resellers, setResellers] = useState<Reseller[]>([])
  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [selectedResellerId, setSelectedResellerId] = useState<string>('')

  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<{
    totalSalesGross: number
    totalProfit: number
    totalScaglioniFromSales: number
    totalPendingIssuesDue: number
    totalPaidIssues: number
    totalDueToScaglioni: number
    currentStockPieces: number
    currentStockValue: number
    salesCount: number
    pendingIssuesCount: number
    recentSales: ResellerSale[]
    pendingIssuesList: ResellerIssue[]
  } | null>(null)

  useEffect(() => {
    loadResellerContext()
  }, [user])

  const loadResellerContext = async () => {
    try {
      if (canManage) {
        const list = await resellerService.getResellers({ status: 'active' })
        setResellers(list)
        if (list.length > 0) {
          setSelectedResellerId(list[0].id)
          setCurrentReseller(list[0])
        }
      } else if (isReseller && user) {
        const r = await resellerService.getResellerByUserId(user.id)
        setCurrentReseller(r)
        setSelectedResellerId(r.id)
      }
    } catch (err) {
      console.error('Erro ao identificar revendedora:', err)
    }
  }

  useEffect(() => {
    if (selectedResellerId) {
      loadFinancialData(selectedResellerId)
      const found = resellers.find((r) => r.id === selectedResellerId)
      if (found) setCurrentReseller(found)
    }
  }, [selectedResellerId])

  const loadFinancialData = async (resellerId: string) => {
    setIsLoading(true)
    try {
      const data = await resellerStockService.getFinancialSummary(resellerId)
      setSummary(data)
    } catch (err) {
      console.error('Erro ao calcular financeiro:', err)
      toast.error('Erro ao carregar dados financeiros.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <DollarSign className="h-5 w-5" />
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
              Financeiro & Lucro da Revendedora
            </h1>
          </div>
          <p className="text-sm text-[#6B655E] mt-1">
            {canManage
              ? 'Acompanhamento do lucro gerado pela vendedora, repasses devidos à Scaglioni e pendências em aberto.'
              : 'Acompanhe seu lucro acumulado das vendas e o valor a pagar à Scaglioni quando prestar contas.'}
          </p>
        </div>

        {currentReseller && (
          <div className="flex items-center gap-2">
            <Link to={`/loja/${currentReseller.id}`} target="_blank">
              <Button
                variant="outline"
                size="sm"
                className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] text-xs flex items-center gap-1.5"
              >
                <Store className="h-3.5 w-3.5" />
                Catálogo da Loja
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Reseller Switcher for Admin/Operator */}
      {canManage && (
        <Card className="border-[#E5DFD5] bg-[#FDFBF7]">
          <CardContent className="p-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-[#7A5C2E]">Revendedora em Foco:</Label>
              <select
                value={selectedResellerId}
                onChange={(e) => setSelectedResellerId(e.target.value)}
                className="h-8 rounded-md border border-[#E5DFD5] bg-white px-2 text-xs font-medium"
              >
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.commission_rate || 40}% comissão)
                  </option>
                ))}
              </select>
            </div>
            {currentReseller && (
              <span className="text-xs text-[#6B655E]">
                Percentual de lucro da vendedora:{' '}
                <strong>{currentReseller.commission_rate || 40}%</strong>
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-[#8C8275]">
          Calculando balanço financeiro...
        </div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Lucro da Revendedora */}
            <Card className="border-emerald-200 bg-emerald-50/50 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-emerald-800">
                  <span className="text-xs font-semibold">Meu Lucro Acumulado</span>
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="font-serif text-2xl font-bold text-emerald-950">
                  {formatCurrency(summary.totalProfit)}
                </div>
                <p className="text-[11px] text-emerald-700">
                  Ganhos confirmados ({currentReseller?.commission_rate || 40}% sobre vendas)
                </p>
              </CardContent>
            </Card>

            {/* 2. Total Devido à Scaglioni */}
            <Card className="border-[#C6A664] bg-[#FDFBF7] shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-[#7A5C2E]">
                  <span className="text-xs font-semibold">Total a Pagar à Scaglioni</span>
                  <DollarSign className="h-4 w-4" />
                </div>
                <div className="font-serif text-2xl font-bold text-[#7A5C2E]">
                  {formatCurrency(summary.totalDueToScaglioni)}
                </div>
                <p className="text-[11px] text-[#6B655E]">
                  Vendas da revendedora + pendências em aberto
                </p>
              </CardContent>
            </Card>

            {/* 3. Pendências / Extravios */}
            <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-amber-800">
                  <span className="text-xs font-semibold">Pendências / Extravios</span>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="font-serif text-2xl font-bold text-amber-950">
                  {formatCurrency(summary.totalPendingIssuesDue)}
                </div>
                <p className="text-[11px] text-amber-700">
                  {summary.pendingIssuesCount} pendência(s) aguardando quitação
                </p>
              </CardContent>
            </Card>

            {/* 4. Estoque Ativo em Posse */}
            <Card className="border-[#E5DFD5] bg-white shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-[#6B655E]">
                  <span className="text-xs font-semibold">Joias sob sua Posse</span>
                  <Boxes className="h-4 w-4 text-[#7A5C2E]" />
                </div>
                <div className="font-serif text-2xl font-bold text-[#2D2A26]">
                  {summary.currentStockPieces} peças
                </div>
                <p className="text-[11px] text-[#6B655E]">
                  Total de {formatCurrency(summary.currentStockValue)} em poder
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Explanation */}
          <Card className="border-[#E5DFD5] bg-white">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <CardTitle className="font-serif text-base text-[#2D2A26] flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#7A5C2E]" />
                <span>Demonstrativo do Valor Devido à Scaglioni Joias</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] space-y-2">
                  <span className="font-bold text-sm text-[#2D2A26] block">
                    1. Vendas no PDV da Revendedora
                  </span>
                  <div className="flex justify-between text-[#6B655E]">
                    <span>Total vendido aos clientes:</span>
                    <strong className="text-[#2D2A26]">
                      {formatCurrency(summary.totalSalesGross)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>- Seu Lucro ({currentReseller?.commission_rate || 40}%):</span>
                    <strong>- {formatCurrency(summary.totalProfit)}</strong>
                  </div>
                  <div className="flex justify-between text-[#7A5C2E] font-bold border-t border-[#E5DFD5] pt-1.5">
                    <span>= Repasse das vendas à Scaglioni:</span>
                    <span>{formatCurrency(summary.totalScaglioniFromSales)}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[#E5DFD5] bg-[#FDFBF7] space-y-2">
                  <span className="font-bold text-sm text-[#2D2A26] block">
                    2. Peças Extraviadas ou Vendas Avulsas
                  </span>
                  <div className="flex justify-between text-[#6B655E]">
                    <span>Pendências classificadas:</span>
                    <strong className="text-[#2D2A26]">
                      {summary.pendingIssuesCount} item(ns)
                    </strong>
                  </div>
                  <div className="flex justify-between text-[#6B655E]">
                    <span>Débitos já quitados:</span>
                    <strong className="text-emerald-700">
                      {formatCurrency(summary.totalPaidIssues)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-amber-800 font-bold border-t border-[#E5DFD5] pt-1.5">
                    <span>= Pendências em aberto a pagar:</span>
                    <span>{formatCurrency(summary.totalPendingIssuesDue)}</span>
                  </div>
                </div>
              </div>

              {/* Total final */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#F3EAD8] to-[#FDFBF7] border border-[#C6A664] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="font-serif font-bold text-base text-[#2D2A26]">
                    Valor Total Pendente de Acerto com a Scaglioni
                  </h4>
                  <p className="text-[11px] text-[#6B655E]">
                    Soma das vendas da revendedora realizadas + pendências não pagas.
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-serif text-2xl font-bold text-[#7A5C2E]">
                    {formatCurrency(summary.totalDueToScaglioni)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Issues Table if any */}
          {summary.pendingIssuesList.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="p-4 border-b border-amber-200 bg-amber-50/50">
                <CardTitle className="font-serif text-sm text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-800" />
                  <span>Pendências Pendentes de Regularização</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FDFBF7] text-[#6B655E] uppercase font-semibold border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Código / Joia</th>
                      <th className="py-2.5 px-3">Classificação</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-3 text-right">Valor a Pagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {summary.pendingIssuesList.map((iss) => (
                      <tr key={iss.id}>
                        <td className="py-2.5 px-3 text-[#6B655E]">
                          {formatDateTime(iss.created)}
                        </td>
                        <td className="py-2.5 px-3">
                          <strong className="text-[#7A5C2E] block">
                            {iss.expand?.product?.code}
                          </strong>
                          <span className="text-[#2D2A26]">{iss.expand?.product?.description}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {iss.reason.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{iss.quantity} un</td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#7A5C2E]">
                          {formatCurrency(iss.scaglioni_due_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Recent Sales by this reseller */}
          <Card className="border-[#E5DFD5]">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <CardTitle className="font-serif text-sm text-[#2D2A26]">
                Últimas Vendas Realizadas no PDV
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {summary.recentSales.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#8C8275]">
                  Nenhuma venda realizada até o momento.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FDFBF7] text-[#6B655E] uppercase font-semibold border-b border-[#E5DFD5]">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3 text-right">Total da Venda</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Seu Lucro</th>
                      <th className="py-2.5 px-3 text-right text-[#7A5C2E]">Repasse Scaglioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DFD5]">
                    {summary.recentSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-[#FDFBF7]">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#7A5C2E]">
                          {sale.code}
                        </td>
                        <td className="py-2.5 px-3 text-[#6B655E]">
                          {formatDateTime(sale.created)}
                        </td>
                        <td className="py-2.5 px-3 text-[#2D2A26]">
                          {sale.customer_name || 'Consumidor'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#2D2A26]">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                          {formatCurrency(sale.reseller_profit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#7A5C2E]">
                          {formatCurrency(sale.scaglioni_due)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
