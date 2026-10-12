import React, { useState, useEffect } from 'react'
import { productService } from '@/services/productService'
import { salesService } from '@/services/salesService'
import { resellerService } from '@/services/resellerService'
import pb from '@/lib/pocketbase/client'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  DollarSign,
  Gem,
  Boxes,
  Handshake,
  AlertTriangle,
  ArrowUpRight,
  ShoppingCart,
  Mic,
  Sparkles,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const [salesToday, setSalesToday] = useState(0)
  const [salesMonth, setSalesMonth] = useState(0)
  const [totalStockPieces, setTotalStockPieces] = useState(0)
  const [totalStockValue, setTotalStockValue] = useState(0)
  const [consignedPieces, setConsignedPieces] = useState(0)
  const [openConsignmentsCount, setOpenConsignmentsCount] = useState(0)
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([])
  const [chartSales7Days, setChartSales7Days] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardMetrics()
  }, [])

  const loadDashboardMetrics = async () => {
    setLoading(true)
    try {
      const [prodRes, salesRes, consignRes, settingsRes] = await Promise.all([
        pb.collection('products').getFullList({ expand: 'type' }),
        pb.collection('sales').getFullList({ sort: '-created', expand: 'customer' }),
        pb.collection('consignment_lists').getFullList(),
        pb.collection('settings').getFullList(),
      ])

      const minStockAlert = settingsRes[0]?.min_stock_alert || 5

      // Stock totals
      let pieces = 0
      let value = 0
      const lowStock: any[] = []
      const typeCounter: { [key: string]: number } = {}

      prodRes.forEach((p: any) => {
        pieces += p.quantity || 0
        value += (p.quantity || 0) * (p.selling_price || 0)
        if (p.quantity <= minStockAlert) {
          lowStock.push(p)
        }
        const typeName = p.expand?.type?.name || 'Outros'
        typeCounter[typeName] = (typeCounter[typeName] || 0) + (p.quantity || 0)
      })

      setTotalStockPieces(pieces)
      setTotalStockValue(value)
      setLowStockProducts(lowStock.slice(0, 5))

      // Category chart data
      const catChart = Object.keys(typeCounter).map((name) => ({
        name,
        value: typeCounter[name],
      }))
      setCategoryData(catChart)

      // Sales metrics
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

      let todaySum = 0
      let monthSum = 0

      // Last 7 days bucket
      const days7Map: { [key: string]: number } = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })
        days7Map[dayLabel] = 0
      }

      salesRes.forEach((s: any) => {
        if (s.status === 'completed') {
          const sDate = new Date(s.created)
          const sTime = sDate.getTime()
          const sVal = s.total || 0

          if (sTime >= startOfDay) todaySum += sVal
          if (sTime >= startOfMonth) monthSum += sVal

          // Check if in 7 days
          const diffDays = Math.floor((now.getTime() - sTime) / (1000 * 60 * 60 * 24))
          if (diffDays <= 6 && diffDays >= 0) {
            const dayLabel = sDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })
            if (days7Map[dayLabel] !== undefined) {
              days7Map[dayLabel] += sVal
            }
          }
        }
      })

      setSalesToday(todaySum)
      setSalesMonth(monthSum)
      setRecentSales(salesRes.slice(0, 5))

      setChartSales7Days(
        Object.keys(days7Map).map((day) => ({
          day,
          total: days7Map[day],
        })),
      )

      // Consignments metrics
      let openConsignCount = 0
      let totalConsignedPieces = 0

      consignRes.forEach((c: any) => {
        if (c.status === 'pending' || c.status === 'accepted' || c.status === 'in_progress') {
          openConsignCount++
          try {
            const items = Array.isArray(c.items) ? c.items : JSON.parse(c.items || '[]')
            items.forEach((it: any) => {
              totalConsignedPieces += it.quantity || 0
            })
          } catch {
            /* intentionally ignored */
          }
        }
      })

      setOpenConsignmentsCount(openConsignCount)
      setConsignedPieces(totalConsignedPieces)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const COLORS = ['#C6A664', '#7A5C2E', '#E8D5A3', '#B08F4E', '#4A3B22', '#2E7D4F']

  return (
    <div className="space-y-6">
      {/* Title & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5DFD5] pb-4">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#2D2A26]">
            Painel Executivo
          </h1>
          <p className="text-sm text-[#6B655E] mt-1">
            Visão geral em tempo real da Scaglioni Joias: vendas, estoque, consignação e alertas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/voz">
            <Button className="bg-gradient-to-r from-[#7A5C2E] to-[#C6A664] hover:opacity-90 text-white font-semibold shadow-xs">
              <Mic className="h-4 w-4 mr-1.5" /> Cadastro por Voz
            </Button>
          </Link>
          <Link to="/pdv">
            <Button
              variant="outline"
              className="border-[#C6A664] text-[#7A5C2E] hover:bg-[#F3EAD8] font-semibold"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Abrir PDV
            </Button>
          </Link>
        </div>
      </div>

      {/* 6 Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">Vendas Hoje</span>
            <span className="p-1.5 rounded-lg bg-[#2E7D4F]/10 text-[#2E7D4F]">
              <DollarSign className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {formatCurrency(salesToday)}
          </p>
        </Card>

        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">Vendas Mês</span>
            <span className="p-1.5 rounded-lg bg-[#C6A664]/10 text-[#7A5C2E]">
              <TrendingUp className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {formatCurrency(salesMonth)}
          </p>
        </Card>

        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">Em Estoque</span>
            <span className="p-1.5 rounded-lg bg-[#7A5C2E]/10 text-[#7A5C2E]">
              <Boxes className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {totalStockPieces}{' '}
            <span className="text-xs font-sans font-normal text-[#6B655E]">peças</span>
          </p>
        </Card>

        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">
              Valor Estoque
            </span>
            <span className="p-1.5 rounded-lg bg-[#C6A664]/15 text-[#7A5C2E]">
              <Gem className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {formatCurrency(totalStockValue)}
          </p>
        </Card>

        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">Consignados</span>
            <span className="p-1.5 rounded-lg bg-[#B26A00]/10 text-[#B26A00]">
              <Handshake className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {consignedPieces}{' '}
            <span className="text-xs font-sans font-normal text-[#6B655E]">peças</span>
          </p>
        </Card>

        <Card className="border-[#E5DFD5] bg-white shadow-xs p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-[#6B655E]">
              Listas Abertas
            </span>
            <span className="p-1.5 rounded-lg bg-[#7A5C2E]/10 text-[#7A5C2E]">
              <Handshake className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="font-serif text-lg font-bold text-[#2D2A26] mt-2 truncate">
            {openConsignmentsCount}{' '}
            <span className="text-xs font-sans font-normal text-[#6B655E]">listas</span>
          </p>
        </Card>
      </div>

      {/* Charts Section: 7-Day sales (Bar) + Product Types (Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7 Days Sales Chart */}
        <Card className="lg:col-span-7 border-[#E5DFD5] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-lg text-[#2D2A26]">
              Vendas nos Últimos 7 Dias
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Faturamento diário consolidado das vendas em reais (R$)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSales7Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5DFD5" />
                <XAxis dataKey="day" stroke="#6B655E" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#6B655E"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `R$${val}`}
                />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Vendas']}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5DFD5',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="total" fill="#C6A664" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Categories Distribution */}
        <Card className="lg:col-span-5 border-[#E5DFD5] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-lg text-[#2D2A26]">
              Distribuição por Tipo de Joia
            </CardTitle>
            <CardDescription className="text-xs text-[#6B655E]">
              Proporção de peças cadastradas por categoria no estoque
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center pt-2">
            {categoryData.length === 0 ? (
              <p className="text-xs text-[#6B655E]">Nenhuma joia com tipo cadastrado.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} peças`, 'Quantidade']}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two columns: Recent Sales & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Sales Table */}
        <Card className="lg:col-span-7 border-[#E5DFD5] bg-white shadow-xs overflow-hidden">
          <CardHeader className="p-4 border-b border-[#E5DFD5] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-serif text-lg text-[#2D2A26]">
                Últimas Vendas Realizadas
              </CardTitle>
            </div>
            <Link
              to="/pdv"
              className="text-xs font-semibold text-[#7A5C2E] hover:underline flex items-center"
            >
              Novo Atendimento <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
            </Link>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F3EAD8] text-[#2D2A26] font-semibold border-b border-[#E5DFD5]">
                  <th className="py-2.5 px-4">Código</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Pagamento</th>
                  <th className="py-2.5 px-4">Data</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD5]">
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#6B655E]">
                      Nenhuma venda registrada ainda.
                    </td>
                  </tr>
                ) : (
                  recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-[#FDFBF7]">
                      <td className="py-2.5 px-4 font-mono font-bold text-[#7A5C2E]">{s.code}</td>
                      <td className="py-2.5 px-4 font-medium text-[#2D2A26]">
                        {s.expand?.customer?.name || 'Consumidor Final'}
                      </td>
                      <td className="py-2.5 px-4 uppercase text-[#6B655E]">
                        {s.payment_method} {s.installments > 1 ? `(${s.installments}x)` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-[#6B655E]">{formatDateTime(s.created)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-[#2D2A26]">
                        {formatCurrency(s.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="lg:col-span-5 border-[#E5DFD5] bg-white shadow-xs">
          <CardHeader className="p-4 border-b border-[#E5DFD5] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-serif text-lg text-[#B26A00] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Alertas de Estoque Baixo
              </CardTitle>
            </div>
            <Link to="/estoque" className="text-xs font-semibold text-[#7A5C2E] hover:underline">
              Ver Estoque Completo
            </Link>
          </CardHeader>

          <CardContent className="p-4 divide-y divide-[#E5DFD5]">
            {lowStockProducts.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#2E7D4F] font-semibold">
                ✓ Todos os produtos estão com níveis de estoque adequados!
              </p>
            ) : (
              lowStockProducts.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#7A5C2E] block">
                      {p.code}
                    </span>
                    <p className="text-sm font-semibold text-[#2D2A26] line-clamp-1">
                      {p.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant="outline"
                      className="border-[#B26A00] text-[#B26A00] bg-[#B26A00]/10 text-xs"
                    >
                      Restam {p.quantity} unid.
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
