import pb from '@/lib/pocketbase/client'
import { Reseller, ConsignmentList } from '@/types'

export const resellerService = {
  // Resellers Management
  async getResellers(params?: { status?: string; search?: string }) {
    const filters: string[] = []
    if (params?.status) {
      filters.push(`status = '${params.status}'`)
    }
    if (params?.search) {
      const q = params.search.replace(/'/g, "\\'")
      filters.push(`(name ~ '${q}' || email ~ '${q}' || document ~ '${q}')`)
    }
    return pb.collection('resellers').getFullList<Reseller>({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'user',
    })
  },

  async getResellerByUserId(userId: string) {
    return pb.collection('resellers').getFirstListItem<Reseller>(`user = '${userId}'`, {
      expand: 'user',
    })
  },

  async createResellerRequest(formData: FormData) {
    return pb.collection('resellers').create<Reseller>(formData)
  },

  async updateResellerStatus(
    id: string,
    status: 'active' | 'rejected' | 'disabled',
    rejectionReason?: string,
  ) {
    const reseller = await pb.collection('resellers').getOne<Reseller>(id)
    const updated = await pb.collection('resellers').update<Reseller>(id, {
      status,
      rejection_reason: rejectionReason || null,
    })

    // If linked user exists, synchronize user status & role
    if (reseller.user) {
      try {
        await pb.collection('users').update(reseller.user, {
          status,
          role: status === 'active' ? 'reseller' : undefined,
        })
      } catch (err) {
        console.error('Erro ao sincronizar status do usuário:', err)
      }
    }

    return updated
  },

  // Consignment Lists Management
  async getConsignmentLists(params?: { resellerId?: string; status?: string }) {
    const filters: string[] = []
    if (params?.resellerId) {
      filters.push(`reseller = '${params.resellerId}'`)
    }
    if (params?.status) {
      filters.push(`status = '${params.status}'`)
    }
    return pb.collection('consignment_lists').getFullList<ConsignmentList>({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'reseller,operator',
    })
  },

  async createConsignmentList(data: {
    reseller_id: string
    items: Array<{
      product_id: string
      code: string
      description: string
      quantity: number
      selling_price: number
    }>
    valid_until?: string
  }) {
    const timestamp = new Date().getTime().toString().slice(-6)
    const code = 'CONS-' + new Date().getFullYear() + '-' + timestamp

    const payload = {
      code,
      reseller: data.reseller_id,
      status: 'pending',
      items: JSON.stringify(
        data.items.map((it) => ({
          ...it,
          sold: 0,
          returned: 0,
        })),
      ),
      valid_until: data.valid_until || null,
      operator: pb.authStore.model?.id,
    }

    return pb.collection('consignment_lists').create<ConsignmentList>(payload)
  },

  async updateConsignmentStatus(id: string, status: 'accepted' | 'rejected' | 'in_progress') {
    return pb.collection('consignment_lists').update<ConsignmentList>(id, { status })
  },

  // Atomic Closing with stock returns and sales registration
  async closeConsignmentList(data: {
    consignment_id: string
    items_closing: Array<{
      product_id: string
      code: string
      sold: number
      returned: number
    }>
  }) {
    return pb.send<{
      success: boolean
      consignment_id: string
      code: string
      status: string
      total_sold_amount: number
    }>('/backend/v1/consignments/close', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}
