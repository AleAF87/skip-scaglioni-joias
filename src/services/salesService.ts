import pb from '@/lib/pocketbase/client'
import { Sale, Customer, Product } from '@/types'

export const salesService = {
  async getCustomers() {
    return pb.collection('customers').getFullList<Customer>({ sort: 'name' })
  },

  async createCustomer(data: Partial<Customer>) {
    return pb.collection('customers').create<Customer>(data)
  },

  async getSales(params?: { status?: string; page?: number; perPage?: number }) {
    const page = params?.page || 1
    const perPage = params?.perPage || 30
    const filter = params?.status ? `status = '${params.status}'` : ''
    return pb.collection('sales').getList<Sale>(page, perPage, {
      filter,
      sort: '-created',
      expand: 'customer,operator',
    })
  },

  async getRecentSalesAndReservations(limit: number = 5) {
    return pb.collection('sales').getList<Sale>(1, limit, {
      sort: '-created',
      expand: 'customer,operator',
    })
  },

  async getPendingSales() {
    return pb.collection('sales').getFullList<Sale>({
      filter: "status = 'pending'",
      sort: '-created',
      expand: 'customer,operator',
    })
  },

  async savePendingSale(data: {
    customer_id?: string
    items: any[]
    subtotal: number
    discount: number
    total: number
    payment_method: string
    installments: number
    sale_id?: string
  }) {
    const timestamp = new Date().getTime().toString().slice(-6)
    const code = 'VND-PEND-' + timestamp

    const payload = {
      code,
      customer: data.customer_id || null,
      status: 'pending',
      items: JSON.stringify(data.items),
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      payment_method: data.payment_method,
      installments: data.installments,
      installment_value: Math.round((data.total / data.installments) * 100) / 100,
      operator: pb.authStore.model?.id,
    }

    if (data.sale_id) {
      return pb.collection('sales').update<Sale>(data.sale_id, payload)
    }
    return pb.collection('sales').create<Sale>(payload)
  },

  async cancelSale(id: string) {
    return pb.collection('sales').update(id, { status: 'cancelled' })
  },

  // Atomic checkout call via backend hook
  async checkout(payload: {
    customer_id?: string
    items: Array<{
      product_id: string
      quantity: number
      unit_price: number
      code?: string
      description?: string
      stock_origin?: 'general' | 'ecommerce' | 'reseller'
      reseller_id?: string
      reseller_name?: string
    }>
    discount: number
    payment_method: string
    installments: number
    sale_id?: string
  }) {
    return pb.send<{
      success: boolean
      sale_id: string
      code: string
      total: number
      subtotal: number
      payment_method: string
      installments: number
      installment_value: number
    }>('/backend/v1/sales/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async sendReceiptEmail(data: {
    email: string
    customer_name: string
    sale_code: string
    total: number
    items: any[]
    payment_method: string
    date: string
  }): Promise<{ success: boolean; sent: boolean; message: string; warning?: string }> {
    return pb.send('/backend/v1/scaglioni/send-receipt', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}
