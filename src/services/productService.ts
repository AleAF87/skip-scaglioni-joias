import pb from '@/lib/pocketbase/client'
import { Product, ProductType, ProductMaterial, ProductSize } from '@/types'

export const productService = {
  async getProducts(params?: {
    search?: string
    type?: string
    material?: string
    status?: string
    page?: number
    perPage?: number
    sort?: string
  }) {
    const page = params?.page || 1
    const perPage = params?.perPage || 30
    const filters: string[] = []

    if (params?.search) {
      const q = params.search.replace(/'/g, "\\'")
      filters.push(`(code ~ '${q}' || description ~ '${q}')`)
    }
    if (params?.type) {
      filters.push(`type = '${params.type}'`)
    }
    if (params?.material) {
      filters.push(`material = '${params.material}'`)
    }
    if (params?.status) {
      filters.push(`status = '${params.status}'`)
    }

    const filterStr = filters.join(' && ')
    return pb.collection('products').getList<Product>(page, perPage, {
      filter: filterStr,
      sort: params?.sort || '-created',
      expand: 'type,material,size',
    })
  },

  async getProductById(id: string) {
    return pb.collection('products').getOne<Product>(id, {
      expand: 'type,material,size',
    })
  },

  async createProduct(formData: FormData) {
    return pb.collection('products').create<Product>(formData)
  },

  async updateProduct(id: string, data: FormData | Partial<Product>) {
    return pb.collection('products').update<Product>(id, data)
  },

  async deleteProduct(id: string) {
    return pb.collection('products').delete(id)
  },

  async getAuxiliaryData() {
    const [types, materials, sizes] = await Promise.all([
      pb.collection('product_types').getFullList<ProductType>({ sort: 'name' }),
      pb.collection('product_materials').getFullList<ProductMaterial>({ sort: 'name' }),
      pb.collection('product_sizes').getFullList<ProductSize>({ sort: 'name' }),
    ])
    return { types, materials, sizes }
  },

  async interpretVoiceDescription(text: string) {
    return pb.send<{
      raw_text: string
      description: string
      type_id: string | null
      type_name: string
      material_id: string | null
      material_name: string
      size_id: string | null
      size_name: string
      target_audience: 'feminino' | 'masculino' | 'unissex' | ''
      invested_value: number | null
      selling_price: number | null
      quantity: number | null
      observations: string
      missing_fields: string[]
    }>('/backend/v1/ai/interpret-product', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  async updateBatch(ids: string[], updates: Partial<Product>) {
    const promises = ids.map((id) => pb.collection('products').update(id, updates))
    return Promise.all(promises)
  },
}
