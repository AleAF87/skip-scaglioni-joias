import pb from '@/lib/pocketbase/client'
import { Customer, Sale } from '@/types'

export interface CustomerInput {
  name: string
  cpf?: string
  phone?: string
  email?: string
  birth_date?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_zip?: string
  city?: string
  state?: string
  notes?: string
}

export const customerService = {
  async getCustomers(params?: { search?: string; page?: number; perPage?: number }) {
    const page = params?.page || 1
    const perPage = params?.perPage || 30
    const filters: string[] = []

    if (params?.search) {
      const q = params.search.replace(/'/g, "\\'")
      filters.push(
        `(name ~ '${q}' || cpf ~ '${q}' || phone ~ '${q}' || email ~ '${q}' || city ~ '${q}')`,
      )
    }

    return pb.collection('customers').getList<Customer>(page, perPage, {
      filter: filters.join(' && '),
      sort: 'name',
    })
  },

  async getAllCustomers() {
    return pb.collection('customers').getFullList<Customer>({
      sort: 'name',
    })
  },

  async getCustomerById(id: string) {
    return pb.collection('customers').getOne<Customer>(id)
  },

  async createCustomer(data: CustomerInput) {
    return pb.collection('customers').create<Customer>(data)
  },

  async updateCustomer(id: string, data: Partial<CustomerInput>) {
    return pb.collection('customers').update<Customer>(id, data)
  },

  async deleteCustomer(id: string) {
    return pb.collection('customers').delete(id)
  },

  // Retorna todas as compras e reservas vinculadas ao ID imutável do cliente
  async getCustomerPurchases(customerId: string) {
    if (!customerId) return []
    return pb.collection('sales').getFullList<Sale>({
      filter: `customer = '${customerId}'`,
      sort: '-created',
      expand: 'operator',
    })
  },
}
