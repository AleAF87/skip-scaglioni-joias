import pb from '@/lib/pocketbase/client'
import { Product, ProductType, ProductMaterial, ProductSize } from '@/types'

export const productService = {
  async getProducts(params?: {
    search?: string
    type?: string
    types?: string[]
    material?: string
    materials?: string[]
    size?: string
    sizes?: string[]
    targetAudience?: string[]
    status?: string
    statuses?: string[]
    ecommerce?: string[]
    page?: number
    perPage?: number
    sort?: string
  }) {
    const page = params?.page || 1
    const perPage = params?.perPage || 30
    const filters: string[] = []

    if (params?.search) {
      const rawSearch = params.search.trim()
      const q = rawSearch.replace(/'/g, "\\'")
      const searchClauses: string[] = [
        `code ~ '${q}'`,
        `description ~ '${q}'`,
        `nome_produto ~ '${q}'`,
        `codigo_barras ~ '${q}'`,
        `codigo_barras_tecson ~ '${q}'`,
        `codigo_produto_tecson ~ '${q}'`,
        `id_tecson ~ '${q}'`,
        `id_scaglioni ~ '${q}'`,
        `sku_scaglioni ~ '${q}'`,
        `sku_novo ~ '${q}'`,
        `produto_id ~ '${q}'`,
      ]

      // Se a busca for puramente numérica, adiciona cláusulas para ignorar zeros à esquerda (ex.: "123" -> "00123", "00123" -> "123")
      if (/^\d+$/.test(rawSearch)) {
        const numVal = parseInt(rawSearch, 10)
        const stripped = rawSearch.replace(/^0+/, '') || '0'
        const padded5 = String(numVal).padStart(5, '0')

        if (stripped !== rawSearch) {
          searchClauses.push(`code = '${stripped}'`)
          searchClauses.push(`codigo_barras_tecson = '${stripped}'`)
          searchClauses.push(`sku_novo = '${stripped}'`)
          searchClauses.push(`produto_id = '${stripped}'`)
        }
        if (padded5 !== rawSearch) {
          searchClauses.push(`code = '${padded5}'`)
          searchClauses.push(`codigo_barras_tecson = '${padded5}'`)
          searchClauses.push(`sku_novo = '${padded5}'`)
        }
      }

      // Se contiver C ou Ç, adiciona variação normalizada
      if (/[cç]/i.test(rawSearch)) {
        const withC = rawSearch.replace(/ç/gi, 'c').replace(/'/g, "\\'")
        const withCedilla = rawSearch.replace(/c/gi, 'ç').replace(/'/g, "\\'")
        searchClauses.push(`sku_scaglioni ~ '${withC}'`)
        searchClauses.push(`sku_scaglioni ~ '${withCedilla}'`)
        searchClauses.push(`code ~ '${withC}'`)
      }

      filters.push(`(${searchClauses.join(' || ')})`)
    }
    // Single or multi types
    if (params?.types && params.types.length > 0) {
      const typeClauses = params.types.map((t) => `type = '${t.replace(/'/g, "\\'")}'`)
      filters.push(`(${typeClauses.join(' || ')})`)
    } else if (params?.type) {
      filters.push(`type = '${params.type.replace(/'/g, "\\'")}'`)
    }

    // Single or multi materials
    if (params?.materials && params.materials.length > 0) {
      const matClauses = params.materials.map((m) => `material = '${m.replace(/'/g, "\\'")}'`)
      filters.push(`(${matClauses.join(' || ')})`)
    } else if (params?.material) {
      filters.push(`material = '${params.material.replace(/'/g, "\\'")}'`)
    }

    // Single or multi sizes
    if (params?.sizes && params.sizes.length > 0) {
      const sizeClauses = params.sizes.map((s) => `size = '${s.replace(/'/g, "\\'")}'`)
      filters.push(`(${sizeClauses.join(' || ')})`)
    } else if (params?.size) {
      filters.push(`size = '${params.size.replace(/'/g, "\\'")}'`)
    }

    // Target audience (perfil)
    if (params?.targetAudience && params.targetAudience.length > 0) {
      const audClauses = params.targetAudience.map(
        (a) => `target_audience = '${a.replace(/'/g, "\\'")}'`,
      )
      filters.push(`(${audClauses.join(' || ')})`)
    }

    // Single or multi statuses
    if (params?.statuses && params.statuses.length > 0) {
      const stClauses = params.statuses.map((s) => `status = '${s.replace(/'/g, "\\'")}'`)
      filters.push(`(${stClauses.join(' || ')})`)
    } else if (params?.status) {
      filters.push(`status = '${params.status.replace(/'/g, "\\'")}'`)
    }

    // E-commerce publication filter
    if (params?.ecommerce && params.ecommerce.length > 0) {
      // If both 'published' and 'not_published' are selected, don't restrict (both options selected)
      const wantsPublished = params.ecommerce.includes('published')
      const wantsNotPublished = params.ecommerce.includes('not_published')
      if (wantsPublished && !wantsNotPublished) {
        filters.push('publicar_no_ecommerce = true')
      } else if (!wantsPublished && wantsNotPublished) {
        filters.push('publicar_no_ecommerce = false')
      }
    }

    const filterStr = filters.join(' && ')
    return pb.collection('products').getList<Product>(page, perPage, {
      filter: filterStr,
      sort: params?.sort || '-created',
      expand: 'type,material,size,marca_id',
    })
  },

  buildProductFilterString(params?: {
    search?: string
    type?: string
    types?: string[]
    material?: string
    materials?: string[]
    size?: string
    sizes?: string[]
    targetAudience?: string[]
    status?: string
    statuses?: string[]
    ecommerce?: string[]
  }) {
    const filters: string[] = []

    if (params?.search) {
      const rawSearch = params.search.trim()
      const q = rawSearch.replace(/'/g, "\\'")
      const searchClauses: string[] = [
        `code ~ '${q}'`,
        `description ~ '${q}'`,
        `nome_produto ~ '${q}'`,
        `codigo_barras ~ '${q}'`,
        `codigo_barras_tecson ~ '${q}'`,
        `codigo_produto_tecson ~ '${q}'`,
        `id_tecson ~ '${q}'`,
        `id_scaglioni ~ '${q}'`,
        `sku_scaglioni ~ '${q}'`,
        `sku_novo ~ '${q}'`,
        `produto_id ~ '${q}'`,
      ]

      if (/^\d+$/.test(rawSearch)) {
        const numVal = parseInt(rawSearch, 10)
        const stripped = rawSearch.replace(/^0+/, '') || '0'
        const padded5 = String(numVal).padStart(5, '0')

        if (stripped !== rawSearch) {
          searchClauses.push(`code = '${stripped}'`)
          searchClauses.push(`codigo_barras_tecson = '${stripped}'`)
          searchClauses.push(`sku_novo = '${stripped}'`)
          searchClauses.push(`produto_id = '${stripped}'`)
        }
        if (padded5 !== rawSearch) {
          searchClauses.push(`code = '${padded5}'`)
          searchClauses.push(`codigo_barras_tecson = '${padded5}'`)
          searchClauses.push(`sku_novo = '${padded5}'`)
        }
      }

      if (/[cç]/i.test(rawSearch)) {
        const withC = rawSearch.replace(/ç/gi, 'c').replace(/'/g, "\\'")
        const withCedilla = rawSearch.replace(/c/gi, 'ç').replace(/'/g, "\\'")
        searchClauses.push(`sku_scaglioni ~ '${withC}'`)
        searchClauses.push(`sku_scaglioni ~ '${withCedilla}'`)
        searchClauses.push(`code ~ '${withC}'`)
      }

      filters.push(`(${searchClauses.join(' || ')})`)
    }
    if (params?.types && params.types.length > 0) {
      const typeClauses = params.types.map((t) => `type = '${t.replace(/'/g, "\\'")}'`)
      filters.push(`(${typeClauses.join(' || ')})`)
    } else if (params?.type) {
      filters.push(`type = '${params.type.replace(/'/g, "\\'")}'`)
    }

    if (params?.materials && params.materials.length > 0) {
      const matClauses = params.materials.map((m) => `material = '${m.replace(/'/g, "\\'")}'`)
      filters.push(`(${matClauses.join(' || ')})`)
    } else if (params?.material) {
      filters.push(`material = '${params.material.replace(/'/g, "\\'")}'`)
    }

    if (params?.sizes && params.sizes.length > 0) {
      const sizeClauses = params.sizes.map((s) => `size = '${s.replace(/'/g, "\\'")}'`)
      filters.push(`(${sizeClauses.join(' || ')})`)
    } else if (params?.size) {
      filters.push(`size = '${params.size.replace(/'/g, "\\'")}'`)
    }

    if (params?.targetAudience && params.targetAudience.length > 0) {
      const audClauses = params.targetAudience.map(
        (a) => `target_audience = '${a.replace(/'/g, "\\'")}'`,
      )
      filters.push(`(${audClauses.join(' || ')})`)
    }

    if (params?.statuses && params.statuses.length > 0) {
      const stClauses = params.statuses.map((s) => `status = '${s.replace(/'/g, "\\'")}'`)
      filters.push(`(${stClauses.join(' || ')})`)
    } else if (params?.status) {
      filters.push(`status = '${params.status.replace(/'/g, "\\'")}'`)
    }

    if (params?.ecommerce && params.ecommerce.length > 0) {
      const wantsPublished = params.ecommerce.includes('published')
      const wantsNotPublished = params.ecommerce.includes('not_published')
      if (wantsPublished && !wantsNotPublished) {
        filters.push('publicar_no_ecommerce = true')
      } else if (!wantsPublished && wantsNotPublished) {
        filters.push('publicar_no_ecommerce = false')
      }
    }

    return filters.join(' && ')
  },

  async getFilteredTotals(params?: {
    search?: string
    type?: string
    types?: string[]
    material?: string
    materials?: string[]
    size?: string
    sizes?: string[]
    targetAudience?: string[]
    status?: string
    statuses?: string[]
    ecommerce?: string[]
  }) {
    const filter = this.buildProductFilterString(params)

    // First attempt: call backend endpoint for atomic aggregation
    try {
      const res = await pb.send<{
        total_invested: number
        total_selling: number
        total_profit?: number
        total_invested_unit: number
        total_selling_unit: number
        total_invested_stock: number
        total_selling_stock: number
        total_profit_unit?: number
        total_profit_stock?: number
        total_stock_pieces: number
        total_items: number
      }>('/backend/v1/products/totals', {
        method: 'POST',
        body: JSON.stringify({ filter }),
      })
      if (res && typeof res.total_stock_pieces === 'number') {
        const totalInvested = res.total_invested ?? 0
        const totalSelling = res.total_selling ?? 0
        const totalProfit =
          typeof res.total_profit === 'number' ? res.total_profit : totalSelling - totalInvested
        return {
          ...res,
          total_profit: totalProfit,
        }
      }
    } catch (err) {
      console.warn('Endpoint /backend/v1/products/totals falhou, calculando via SDK:', err)
    }

    // Fallback: fetch filtered products (only required fields for fast performance)
    const list = await pb.collection('products').getFullList<Product>({
      filter,
      fields: 'id,invested_value,selling_price,quantity',
    })

    let totalInvestedUnit = 0
    let totalSellingUnit = 0
    let totalInvestedStock = 0
    let totalSellingStock = 0
    let totalQuantity = 0

    list.forEach((p) => {
      const qty = p.quantity || 0
      const invested = p.invested_value || 0
      const selling = p.selling_price || 0

      totalQuantity += qty
      totalInvestedUnit += invested
      totalSellingUnit += selling
      totalInvestedStock += invested * qty
      totalSellingStock += selling * qty
    })

    const totalInvested = totalInvestedStock > 0 ? totalInvestedStock : totalInvestedUnit
    const totalSelling = totalSellingStock > 0 ? totalSellingStock : totalSellingUnit
    const totalProfit = totalSelling - totalInvested

    return {
      total_invested: totalInvested,
      total_selling: totalSelling,
      total_profit: totalProfit,
      total_invested_unit: totalInvestedUnit,
      total_selling_unit: totalSellingUnit,
      total_invested_stock: totalInvestedStock,
      total_selling_stock: totalSellingStock,
      total_profit_unit: totalSellingUnit - totalInvestedUnit,
      total_profit_stock: totalSellingStock - totalInvestedStock,
      total_stock_pieces: totalQuantity,
      total_items: list.length,
    }
  },

  async getProductById(id: string) {
    return pb.collection('products').getOne<Product>(id, {
      expand: 'type,material,size,marca_id',
    })
  },

  async getProductFullDetails(id: string) {
    const product = await pb.collection('products').getOne<Product>(id, {
      expand: 'type,material,size,marca_id',
    })
    const [initialStocks, images, categories] = await Promise.all([
      pb
        .collection('initial_stocks')
        .getFullList({
          filter: `product = '${id}'`,
          sort: '-created',
        })
        .catch(() => []),
      pb
        .collection('product_images')
        .getFullList({
          filter: `product = '${id}'`,
          sort: 'sort_order',
        })
        .catch(() => []),
      pb
        .collection('product_category_links')
        .getFullList({
          filter: `product = '${id}'`,
          expand: 'category',
        })
        .catch(() => []),
    ])
    return {
      product,
      initialStocks,
      images,
      categories,
    }
  },

  async associateManual(
    tecsonProductId: string,
    scaglioniProductId: string,
    chosenOrigin: 'Tecson' | 'Scaglioni',
  ) {
    return pb.send<{
      success: boolean
      message: string
      product: any
    }>('/backend/v1/products/associate-manual', {
      method: 'POST',
      body: JSON.stringify({
        tecson_product_id: tecsonProductId,
        scaglioni_product_id: scaglioniProductId,
        chosen_initial_stock_origin: chosenOrigin,
      }),
    })
  },

  async importTecsonBatch(items: any[], dryRun: boolean) {
    return pb.send<{
      success: boolean
      dry_run: boolean
      total_received: number
      created: number
      updated: number
      ignored: number
      conflicts: any[]
      image_failures: any[]
      sample_reports: any[]
    }>('/backend/v1/products/import/tecson', {
      method: 'POST',
      body: JSON.stringify({ items, dry_run: dryRun }),
    })
  },

  async importScaglioniBatch(items: any[], dryRun: boolean) {
    return pb.send<{
      success: boolean
      dry_run: boolean
      total_received: number
      created: number
      updated: number
      ignored: number
      conflicts: any[]
      image_failures: any[]
      sample_reports: any[]
    }>('/backend/v1/products/import/scaglioni', {
      method: 'POST',
      body: JSON.stringify({ items, dry_run: dryRun }),
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

  async transcribeAudio(audioBlob: Blob, filename = 'audio.mp4') {
    const formData = new FormData()
    formData.append('audio', audioBlob, filename)

    try {
      return await pb.send<{
        text: string
        configured: boolean
        error?: string
        useBrowserStt?: boolean
      }>('/backend/v1/ai/transcribe-audio', {
        method: 'POST',
        body: formData,
      })
    } catch (err: any) {
      // Quando a transcrição no servidor retornar 503 (não configurada ou sem chave STT),
      // capturamos silenciosamente para não poluir o console com erro não tratado de rede,
      // logando apenas como info e retornando o objeto de fallback amigável.
      if (err?.status === 503 || err?.data?.configured === false) {
        console.info(
          '[STT Info] Transcrição por IA no servidor não configurada (503 esperado). Utilizando reconhecimento nativo do navegador.',
        )
        return {
          text: '',
          configured: false,
          error:
            'Transcrição no servidor ainda não está configurada. O texto reconhecido no aparelho foi aproveitado — revise e edite antes de continuar.',
          useBrowserStt: true,
        }
      }
      throw err
    }
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
      analysis?: {
        type?: {
          id: string | null
          name: string
          status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
          matched: boolean
          ambiguous: boolean
          not_found: boolean
          candidates: Array<{ id: string; name: string }>
        }
        material?: {
          id: string | null
          name: string
          status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
          matched: boolean
          ambiguous: boolean
          not_found: boolean
          candidates: Array<{ id: string; name: string }>
        }
        size?: {
          id: string | null
          name: string
          status: 'matched' | 'ambiguous' | 'not_found' | 'empty'
          matched: boolean
          ambiguous: boolean
          not_found: boolean
          candidates: Array<{ id: string; name: string }>
        }
      }
    }>('/backend/v1/ai/interpret-product', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  async clearAllProductsAndStock(confirmation: string) {
    return pb.send<{
      success: boolean
      message: string
      deleted: {
        sales?: number
        reseller_sales?: number
        consignment_documents?: number
        consignment_lists?: number
        reseller_deliveries?: number
        reseller_returns?: number
        reseller_stock_items?: number
        reseller_issues?: number
        initial_stocks?: number
        product_category_links?: number
        product_images?: number
        product_variations?: number
        product_price_history?: number
        products?: number
      }
    }>('/backend/v1/products/import/clear-all', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    })
  },

  async importProductsBatch(
    items: Array<{
      code: string
      description: string
      quantity: number
      selling_price: number
      invested_value: number
      image_url?: string
      import_image_path?: string
    }>,
  ) {
    return pb.send<{
      success: boolean
      imported: number
      updated: number
      skipped: number
      total_received: number
      errors: Array<{ index: number; code?: string; description?: string; error: string }>
    }>('/backend/v1/products/import/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
  },

  async getImportImageMap() {
    return pb.send<{
      total: number
      items: Array<{
        id: string
        code: string
        description: string
        import_image_path: string
        image_url: string
        photos: string[]
      }>
    }>('/backend/v1/products/import/image-map', {
      method: 'GET',
    })
  },

  async uploadProductPhoto(productId: string, file: File | Blob, filename: string) {
    const formData = new FormData()
    formData.append('photos', file, filename)
    return pb.collection('products').update<Product>(productId, formData)
  },

  async updateBatch(ids: string[], updates: Partial<Product>) {
    const promises = ids.map((id) => pb.collection('products').update(id, updates))
    return Promise.all(promises)
  },

  async getNextProductCode(): Promise<string> {
    try {
      // Prioritize backend endpoint for atomic code preview
      const res = await pb.send<{ next_code: string; next_number?: number }>(
        '/backend/v1/products/next-code',
        {
          method: 'GET',
        },
      )
      if (res?.next_code) {
        return res.next_code
      }
    } catch {
      // Fallback: query highest numerical code from collection
    }

    try {
      const list = await pb.collection('products').getFullList<Product>({
        fields: 'code,sku_novo',
      })

      let maxNum = 0
      for (const item of list) {
        const c = item.code || ''
        const sn = item.sku_novo || ''
        if (/^\d+$/.test(c)) {
          const val = parseInt(c, 10)
          if (!isNaN(val) && val > maxNum) maxNum = val
        }
        if (/^\d+$/.test(sn)) {
          const val = parseInt(sn, 10)
          if (!isNaN(val) && val > maxNum) maxNum = val
        }
      }

      const nextVal = maxNum + 1
      return String(nextVal)
    } catch (err) {
      console.error('Erro ao consultar próximo código numérico sequencial:', err)
      return '1'
    }
  },
}
