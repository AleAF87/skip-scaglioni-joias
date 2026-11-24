import React, { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, AlertTriangle, Boxes, Receipt, Store, Package } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { resellerService } from '@/services/resellerService'
import { resellerStockService } from '@/services/resellerStockService'
import { Reseller, ResellerSale, ResellerIssue, ResellerReturn } from '@/types'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

interface ResellerFinancialContentProps {
  reseller: Reseller
  onBack?: () => void
  /** Esconde o botão "Catálogo da Loja" quando renderizado como aba do perfil
   *  (o topo da ficha já tem "Loja Virtual"). Padrão true mantém a página standalone. */
  showCatalogButton?: boolean
}

/**
 * Conteúdo integral do "Financeiro & Lucro da Revendedora" para UMA revendedora.
 * Reutilizado por:
 *  - Página /revendedora/financeiro (revendedora logada vê os próprios dados)
 *  - Aba "Financeiro & Lucro" dentro do perfil da revendedora na página Revendedoras
 * A lógica de cálculo vem de resellerStockService.getFinancialSummary — nunca duplique aqui.
 */
export function ResellerFinancialContent({
  reseller,
  onBack,
  showCatalogButton = true,
}: ResellerFinancialContentProps) {
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
    totalSettlementBalance: number
    pendingSettlements: ResellerReturn[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Venda selecionada na tabela "Últimas Vendas Realizadas no PDV" — abre modal com as peças
  const [viewSale, setViewSale] = useState<ResellerSale | null>(null)

  useEffect(() => {
    let isMounted = true
    let debounceTimer: any = null

    const fetchFinancial = async (silent = false) => {
      if (!silent) {
        setIsLoading(true)
      }
      try {
        const data = await resellerStockService.getFinancialSummary(reseller.id)
        if (isMounted) {
          setSummary(data)
        }
      } catch (err) {
        console.error('Erro ao calcular financeiro:', err)
        if (!silent) {
          toast.error('Erro ao carregar dados financeiros.')
        }
      } finally {
        if (isMounted && !silent) {
          setIsLoading(false)
        }
      }
    }

    // Carga inicial
    fetchFinancial(false)

    // Debounce leve (350ms) para não recarregar em rajada de eventos em tempo real
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (isMounted) {
          fetchFinancial(true)
        }
      }, 350)
    }

    // Subscrição em tempo real no PocketBase para as coleções que alimentam o financeiro:
    // reseller_sales (vendas no PDV), reseller_stock_items (estoque em posse) e reseller_issues (pendências/extravios)
    const collectionsToWatch = ['reseller_sales', 'reseller_stock_items', 'reseller_issues']
    let subscriptionsActive = true

    collectionsToWatch.forEach((colName) => {
      try {
        pb.collection(colName)
          .subscribe('*', (e) => {
            // Se o evento carrega reseller, filtra para o reseller atual quando aplicável
            const recordReseller = (e.record as any)?.reseller
            if (!recordReseller || recordReseller === reseller.id) {
              scheduleRefresh()
            }
          })
          .catch((err) => {
            console.warn(`[Realtime Financial] Erro ao assinar ${colName}:`, err)
          })
      } catch (err) {
        console.warn(`[Realtime Financial] Falha ao iniciar subscribe em ${colName}:`, err)
      }
    })

    // Polling leve de fallback (a cada 20s) garantindo atualização contínua mesmo se websocket oscilar
    const pollInterval = setInterval(() => {
      if (isMounted) {
        fetchFinancial(true)
      }
    }, 20000)

    return () => {
      isMounted = false
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(pollInterval)
      if (subscriptionsActive) {
        subscriptionsActive = false
        collectionsToWatch.forEach((colName) => {
          try {
            pb.collection(colName)
              .unsubscribe('*')
              .catch(() => {})
          } catch {
            /* ignore */
          }
        })
      }
    }
  }, [reseller.id])

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
        <div className="space-y-1">
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-[#7A5C2E] hover:text-[#634923] hover:bg-[#F3EAD8] p-0 h-auto font-medium flex items-center gap-1.5"
            >
              ← Voltar
            </button>
          )}
          <div className="flex items-center gap-2 text-[#7A5C2E]">
            <DollarSign className="h-5 w-5" />
            {showCatalogButton ? (
              <h2 className="font-serif text-2xl font-bold tracking-tight text-[#2D2A26]">
                Financeiro &amp; Lucro da Revendedora
              </h2>
            ) : (
              <h3 className="font-serif text-base font-bold tracking-tight text-[#2D2A26]">
                Financeiro &amp; Lucro da Revendedora
              </h3>
            )}
          </div>
          <p
            className={
              showCatalogButton ? 'text-sm text-[#6B655E] mt-1' : 'text-xs text-[#6B655E] mt-1'
            }
          >
            Acompanhe {reseller.name ? `os dados de ${reseller.name}` : 'os dados da revendedora'} —
            lucro acumulado, repasses devidos à Scaglioni e pendências em aberto.
          </p>
        </div>

        {showCatalogButton && (
          <div className="flex items-center gap-2">
            <Link to={`/loja/${reseller.id}`} target="_blank">
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
                  Ganhos confirmados ({reseller.commission_rate || 40}% sobre vendas)
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

            {/* 3. Saldo devedor dos acertos já registrados */}
            <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-amber-800">
                  <span className="text-xs font-semibold">Saldo devedor</span>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="font-serif text-2xl font-bold text-amber-950">
                  {formatCurrency(summary.totalSettlementBalance)}
                </div>
                <p className="text-[11px] text-amber-700">
                  {summary.pendingSettlements.length} acerto(s) aguardando quitação
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

          {summary.pendingSettlements.length > 0 && (
            <Card className="border-amber-200 bg-white">
              <CardHeader className="p-4 border-b border-amber-100 bg-amber-50/50">
                <CardTitle className="font-serif text-base font-bold text-amber-900">
                  Acertos pendentes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-[#E5DFD5]">
                {summary.pendingSettlements.map((ret) => (
                  <div key={ret.id} className="p-3 text-xs flex flex-wrap justify-between gap-2">
                    <span>
                      <strong>Devolução {ret.code}</strong> · {formatDateTime(ret.created)}
                    </span>
                    <span>
                      Devido {formatCurrency(ret.total_financial_due || 0)} · Pago{' '}
                      {formatCurrency(ret.total_paid || 0)}
                    </span>
                    <strong className="text-amber-800">
                      Pendente {formatCurrency(ret.balance_due || 0)}
                    </strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Breakdown Explanation */}
          <Card className="border-[#E5DFD5] bg-white">
            <CardHeader className="p-4 border-b border-[#E5DFD5] bg-[#FDFBF7]">
              <CardTitle className="font-serif text-base font-bold text-[#2D2A26] flex items-center gap-2">
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
                    <span>- Seu Lucro ({reseller.commission_rate || 40}%):</span>
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
                <CardTitle className="font-serif text-base font-bold text-amber-950 flex items-center gap-2">
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
                    {summary.pendingIssuesList.map((iss, idxIss) => (
                      <tr key={`${iss.id || 'sem-id'}-${idxIss}`}>
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
              <CardTitle className="font-serif text-base font-bold text-[#2D2A26]">
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
                    {summary.recentSales.map((sale, idxSale) => (
                      <tr
                        key={`${sale.id || 'sem-id'}-${sale.code || 'sem-cod'}-${idxSale}`}
                        className="hover:bg-[#FDFBF7] cursor-pointer"
                        onClick={() => setViewSale(sale)}
                        title="Clique para ver as peças vendidas"
                      >
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

      {/* Modal de detalhe da venda: peças vendidas */}
      <Dialog open={!!viewSale} onOpenChange={(open) => !open && setViewSale(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-bold text-[#2D2A26] flex items-center gap-2">
              <Package className="h-4 w-4 text-[#7A5C2E]" />
              Venda {viewSale?.code} — Peças Vendidas
            </DialogTitle>
          </DialogHeader>
          {viewSale && (
            <div className="space-y-3">
              <div className="text-xs text-[#6B655E] flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong className="text-[#2D2A26]">Data:</strong>{' '}
                  {formatDateTime(viewSale.created)}
                </span>
                <span>
                  <strong className="text-[#2D2A26]">Cliente:</strong>{' '}
                  {viewSale.customer_name || 'Consumidor'}
                </span>
              </div>
              {(viewSale.items || []).length === 0 ? (
                <p className="py-4 text-center text-xs text-[#8C8275]">
                  Sem detalhes de peças registrados nesta venda.
                </p>
              ) : (
                <div className="border border-[#E5DFD5] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FDFBF7] text-[#6B655E] uppercase font-semibold border-b border-[#E5DFD5]">
                      <tr>
                        <th className="py-2 px-2.5">Código / Joia</th>
                        <th className="py-2 px-2.5 text-center">Qtd</th>
                        <th className="py-2 px-2.5 text-right">Valor Un.</th>
                        <th className="py-2 px-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DFD5]">
                      {(viewSale.items || []).map((it, idxIt) => (
                        <tr key={`${it.product_id || 'sem-id'}-${idxIt}`}>
                          <td className="py-2 px-2.5">
                            <strong className="font-mono text-[#7A5C2E] block">{it.code}</strong>
                            <span className="text-[#2D2A26]">{it.description}</span>
                          </td>
                          <td className="py-2 px-2.5 text-center font-bold">{it.quantity}</td>
                          <td className="py-2 px-2.5 text-right">
                            {formatCurrency(it.unit_price)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-[#2D2A26]">
                            {formatCurrency(it.quantity * it.unit_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[#E5DFD5] bg-[#FDFBF7]">
                      <tr className="text-xs font-bold">
                        <td className="py-2 px-2.5" colSpan={2}>
                          Total da venda
                        </td>
                        <td className="py-2 px-2.5 text-right text-[#2D2A26]" colSpan={2}>
                          {formatCurrency(viewSale.total)}
                        </td>
                      </tr>
                      <tr className="text-xs">
                        <td className="py-1.5 px-2.5 text-emerald-700" colSpan={2}>
                          Seu lucro ({reseller.commission_rate || 40}%)
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-emerald-700" colSpan={2}>
                          {formatCurrency(viewSale.reseller_profit)}
                        </td>
                      </tr>
                      <tr className="text-xs">
                        <td className="py-1.5 px-2.5 pb-2 text-[#7A5C2E]" colSpan={2}>
                          Repasse Scaglioni
                        </td>
                        <td className="py-1.5 px-2.5 pb-2 text-right text-[#7A5C2E]" colSpan={2}>
                          {formatCurrency(viewSale.scaglioni_due)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ResellerFinancial() {
  const { user, isReseller, canManageInternal } = useAuth()

  const [currentReseller, setCurrentReseller] = useState<Reseller | null>(null)
  const [isLoadingContext, setIsLoadingContext] = useState(true)

  useEffect(() => {
    loadResellerContext()
  }, [user])

  const loadResellerContext = async () => {
    setIsLoadingContext(true)
    try {
      // Revendedora logada: sempre os próprios dados (nunca seletor).
      if (isReseller && user) {
        const r = await resellerService.getResellerByUserId(user.id)
        setCurrentReseller(r)
      }
      // Admin/operador/superadmin: suporte legado à rota /revendedora/financeiro com
      // ?reseller=<id> (mantém funcionando internamente, mas o acesso natural é o card
      // na página Revendedoras, que embute o mesmo conteúdo por aba).
      else if (canManageInternal) {
        const params = new URLSearchParams(window.location.search)
        const targetId = params.get('reseller')
        if (targetId) {
          try {
            const r = await pb.collection('resellers').getOne<Reseller>(targetId, {
              expand: 'user',
            })
            setCurrentReseller(r)
          } catch {
            /* revendedora não encontrada */
          }
        }
      }
    } catch (err) {
      console.error('Erro ao identificar revendedora:', err)
    } finally {
      setIsLoadingContext(false)
    }
  }

  if (isLoadingContext) {
    return <div className="py-16 text-center text-xs text-[#8C8275]">Carregando contexto...</div>
  }

  if (!currentReseller) {
    return (
      <div className="py-16 text-center text-xs text-[#8C8275] max-w-md mx-auto space-y-2">
        <p>Nenhuma revendedora em foco.</p>
        <p className="text-[11px]">
          {isReseller
            ? 'Não foi possível localizar o cadastro da sua revendedora. Contate o administrador.'
            : 'Acesse o financeiro pelo card da revendedora na página "Revendedoras".'}
        </p>
      </div>
    )
  }

  return <ResellerFinancialContent reseller={currentReseller} />
}
