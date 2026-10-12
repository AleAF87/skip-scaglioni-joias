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

  async updateProductWithPhotos(
    id: string,
    fields: Record<string, any>,
    newPhotoFiles: File[],
    retainedExistingPhotoNames: string[],
  ) {
    const formData = new FormData()

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value.toString())
      }
    })

    // Retained photos (names as strings) tell PocketBase which existing files to keep
    retainedExistingPhotoNames.forEach((name) => {
      formData.append('photos', name)
    })

    // New photo files
    newPhotoFiles.forEach((file) => {
      formData.append('photos', file)
    })

    return pb.collection('products').update<Product>(id, formData)
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
      target_audience: 'feminino' | 'masculino' | 'unissex' | '' | null
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

  async getNextProductCode(): Promise<string> {
    try {
      // Find highest numerical code or fallback starting from 100001
      const list = await pb.collection('products').getFullList<Product>({
        fields: 'code',
      })

      let maxNum = 100000
      for (const item of list) {
        if (!item.code) continue
        // Check if code is purely digits
        if (/^\d+$/.test(item.code)) {
          const val = parseInt(item.code, 10)
          if (!isNaN(val) && val > maxNum) {
            maxNum = val
          }
        }
      }

      const nextCode = (maxNum + 1).toString()

      // Validate uniqueness just in case
      try {
        const existing = await pb.collection('products').getFirstListItem(`code = '${nextCode}'`)
        if (existing) {
          return (maxNum + 2).toString()
        }
      } catch {
        // Not found means it's available
      }

      return nextCode
    } catch (err) {
      console.error('Erro ao gerar código numérico sequencial:', err)
      // Fallback: 6-digit random number starting at 100000+
      return (100000 + Math.floor(Math.random() * 899999)).toString()
    }
  },
}
