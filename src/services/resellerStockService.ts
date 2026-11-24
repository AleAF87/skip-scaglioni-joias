import pb from '@/lib/pocketbase/client'
import {
  ResellerStockItem,
  ResellerDelivery,
  ResellerSale,
  ResellerReturn,
  ResellerIssue,
  Reseller,
} from '@/types'

export const resellerStockService = {
  // 1. Obter estoque próprio da revendedora
  async getResellerStock(resellerId: string) {
    const list = await pb.collection('reseller_stock_items').getFullList<ResellerStockItem>({
      filter: `reseller = '${resellerId}' && quantity > 0`,
      sort: '-updated',
      expand: 'product,product.type,product.material,product.size',
    })
    return list
  },

  // Obter todos os itens (inclusive saldo 0) para conferência/devolução
  async getAllResellerStockItems(resellerId: string) {
    const list = await pb.collection('reseller_stock_items').getFullList<ResellerStockItem>({
      filter: `reseller = '${resellerId}'`,
      sort: '-quantity',
      expand: 'product,product.type,product.material,product.size',
    })
    return list
  },

  // Obter estoques daquele produto específico em posse das revendedoras (saldo > 0)
  async getStockByProduct(productId: string) {
    const list = await pb.collection('reseller_stock_items').getFullList<ResellerStockItem>({
      filter: `product = '${productId}' && quantity > 0`,
      sort: '-quantity',
      expand: 'reseller',
    })
    return list
  },

  // 2. Entregas para revendedoras
  async getDeliveries(params?: { resellerId?: string; status?: string }) {
    const filters: string[] = []
    if (params?.resellerId) {
      filters.push(`reseller = '${params.resellerId}'`)
    }
    if (params?.status) {
      filters.push(`status = '${params.status}'`)
    }
    const filter = filters.join(' && ')

    const rawList = await pb.collection('reseller_deliveries').getFullList({
      filter,
      sort: '-created',
      expand: 'reseller,operator',
    })

    return rawList.map((rec: any) => ({
      ...rec,
      items: typeof rec.items === 'string' ? JSON.parse(rec.items || '[]') : rec.items,
    })) as unknown as ResellerDelivery[]
  },

  async getDeliveryById(id: string) {
    const rec = await pb.collection('reseller_deliveries').getOne(id, {
      expand: 'reseller,operator',
    })
    return {
      ...rec,
      items: typeof rec.items === 'string' ? JSON.parse(rec.items || '[]') : rec.items,
    } as unknown as ResellerDelivery
  },

  // Atomic delivery via backend hook
  async createDelivery(data: {
    reseller_id: string
    items: Array<{
      product_id: string
      quantity: number
      selling_price?: number
    }>
    notes?: string
    signature_data?: string
    signer_name?: string
  }) {
    return pb.send<{
      success: boolean
      delivery_id: string
      code: string
      status: string
      total_items_count: number
      total_value: number
    }>('/backend/v1/reseller-stock/delivery', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Assinar entrega via hook
  async signDelivery(data: { delivery_id: string; signature_data: string; signer_name?: string }) {
    return pb.send<{
      success: boolean
      delivery_id: string
      code: string
      status: string
    }>('/backend/v1/reseller-stock/sign-delivery', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 3. Vendas no PDV da revendedora
  async getResellerSales(params?: { resellerId?: string }) {
    const filter = params?.resellerId ? `reseller = '${params.resellerId}'` : ''
    const rawList = await pb.collection('reseller_sales').getFullList({
      filter,
      sort: '-created',
      expand: 'reseller',
    })
    return rawList.map((rec: any) => ({
      ...rec,
      items: typeof rec.items === 'string' ? JSON.parse(rec.items || '[]') : rec.items,
    })) as unknown as ResellerSale[]
  },

  // Realizar venda atômica no PDV da revendedora
  async checkoutResellerSale(payload: {
    reseller_id?: string
    // Vínculo do cliente SEMPRE pelo ID (nunca CPF); ausente = Consumidor Final
    customer_id?: string
    customer_name?: string
    customer_phone?: string
    items: Array<{
      product_id: string
      quantity: number
      unit_price?: number
    }>
    discount?: number
    payment_method: string
    installments?: number
    notes?: string
  }) {
    return pb.send<{
      success: boolean
      sale_id: string
      code: string
      total: number
      reseller_profit: number
      scaglioni_due: number
      commission_rate: number
    }>('/backend/v1/reseller-stock/pos-sale', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // 4. Devoluções e conferências
  async getReturns(params?: { resellerId?: string }) {
    const filter = params?.resellerId ? `reseller = '${params.resellerId}'` : ''
    const rawList = await pb.collection('reseller_returns').getFullList({
      filter,
      sort: '-created',
      expand: 'reseller,operator',
    })
    return rawList.map((rec: any) => ({
      ...rec,
      items: typeof rec.items === 'string' ? JSON.parse(rec.items || '[]') : rec.items,
    })) as unknown as ResellerReturn[]
  },

  async processReturn(data: {
    reseller_id: string
    items: Array<{
      product_id: string
      variation_id?: string
      variation_sku?: string
      variacao?: string
      codigo_barras?: string
      returned_qty: number
      pending_qty: number
      pending_reason?: 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
      pending_notes?: string
      pending_charge?: boolean
    }>
    notes?: string
    // Comissão escolhida pelo admin/superadmin na hora do fechamento (30% / 35% / 40%)
    commission_rate?: number
    sale_ids?: string[]
    payments?: Array<{
      method: 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other'
      amount: number
      notes?: string
    }>
    // Entrega de origem (v0.0.144): gravada na devolução p/ rastreio ("Devolução 2 · Entrega 1")
    delivery_id?: string
    delivery_code?: string
  }) {
    return pb.send<{
      success: boolean
      return_id: string
      code: string
      delivery_code?: string
      total_returned_qty: number
      total_pending_qty: number
      total_pending_value_due: number
      commission_rate: number
      total_financial_due: number
      total_paid: number
      balance_due: number
      financial_status: 'open' | 'partial' | 'settled'
      nothing_due: boolean
    }>('/backend/v1/reseller-stock/return', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Registrar uma quitação posterior sem reabrir ou alterar a devolução.
  async addSettlementPayment(data: {
    return_id: string
    method: 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other'
    amount: number
    notes?: string
  }) {
    return pb.send<{
      success: boolean
      return_id: string
      total_paid: number
      balance_due: number
      financial_status: 'partial' | 'settled'
    }>('/backend/v1/reseller-stock/settlement-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 5. Pendências (extraviada / venda avulsa / outros)
  async getIssues(params?: { resellerId?: string; status?: string }) {
    const filters: string[] = []
    if (params?.resellerId) {
      filters.push(`reseller = '${params.resellerId}'`)
    }
    if (params?.status) {
      filters.push(`status = '${params.status}'`)
    }
    return pb.collection('reseller_issues').getFullList<ResellerIssue>({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'reseller,product,return_ref',
    })
  },

  async resolveIssue(data: { issue_id: string; status: 'paid' | 'forgiven'; paid_notes?: string }) {
    return pb.send<{
      success: boolean
      issue_id: string
      status: string
    }>('/backend/v1/reseller-stock/resolve-issue', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 6. Resumo Financeiro da Revendedora
  async getFinancialSummary(resellerId: string) {
    const [sales, issues, stock, returns] = await Promise.all([
      this.getResellerSales({ resellerId }),
      this.getIssues({ resellerId }),
      this.getResellerStock(resellerId),
      this.getReturns({ resellerId }),
    ])

    // Total de vendas brutas realizadas no PDV dela
    const totalSalesGross = sales.reduce((acc, s) => acc + (s.total || 0), 0)
    // Lucro total da vendedora gerado pelas vendas no PDV
    const totalProfit = sales.reduce((acc, s) => acc + (s.reseller_profit || 0), 0)
    // Valor devido à Scaglioni pelas vendas normais consignadas
    const totalScaglioniFromSales = sales.reduce((acc, s) => acc + (s.scaglioni_due || 0), 0)

    // Pendências (venda avulsa sem PDV, extravios, etc)
    const pendingIssues = issues.filter((i) => i.status === 'pending')
    const paidIssues = issues.filter((i) => i.status === 'paid')

    const totalPendingIssuesDue = pendingIssues.reduce(
      (acc, i) => acc + (i.scaglioni_due_total || 0),
      0,
    )
    const totalPaidIssues = paidIssues.reduce((acc, i) => acc + (i.scaglioni_due_total || 0), 0)

    // Total a pagar à Scaglioni atualmente pendente
    const totalDueToScaglioni = totalScaglioniFromSales + totalPendingIssuesDue

    // Peças e valor em posse atual
    const currentStockPieces = stock.reduce((acc, it) => acc + (it.quantity || 0), 0)
    const currentStockValue = stock.reduce(
      (acc, it) =>
        acc + (it.quantity || 0) * (it.selling_price || it.expand?.product?.selling_price || 0),
      0,
    )

    // Saldo devedor real é controlado pelo fechamento: evita somar novamente
    // vendas/extravios que já compõem uma devolução registrada.
    const pendingSettlements = returns.filter(
      (ret) => ret.financial_status !== 'settled' && (ret.balance_due || 0) > 0,
    )
    const totalSettlementBalance = pendingSettlements.reduce(
      (acc, ret) => acc + (ret.balance_due || 0),
      0,
    )

    return {
      totalSalesGross,
      totalProfit,
      totalScaglioniFromSales,
      totalPendingIssuesDue,
      totalPaidIssues,
      totalDueToScaglioni,
      currentStockPieces,
      currentStockValue,
      salesCount: sales.length,
      pendingIssuesCount: pendingIssues.length,
      recentSales: sales.slice(0, 5),
      pendingIssuesList: pendingIssues,
      totalSettlementBalance,
      pendingSettlements,
    }
  },

  // 7. Buscar revendedora pública ou por ID
  async getResellerPublicProfile(resellerId: string) {
    return pb.collection('resellers').getOne<Reseller>(resellerId)
  },

  // Atualizar comissão da revendedora (Admin/Operador)
  async updateCommissionRate(resellerId: string, rate: number) {
    return pb.collection('resellers').update<Reseller>(resellerId, {
      commission_rate: Math.min(100, Math.max(0, rate)),
    })
  },
}
