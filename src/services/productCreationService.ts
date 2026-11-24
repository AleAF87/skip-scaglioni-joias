import pb from '@/lib/pocketbase/client'
import { Brand, Reseller, ProductCategory, Product, ProductVariation, InitialStock } from '@/types'

export interface StockDistributionItem {
  id: string
  localizacao:
    | 'Estoque geral'
    | 'Loja física'
    | 'Revendedora'
    | 'Estoque separado para e-commerce'
    | string
  resellerId?: string
  resellerName?: string
  quantidade: number
}

export interface ProductVariationInput {
  attributeName: string // 'tamanho' | 'aro' | 'cor' | 'modelo' | string
  attributeValue: string // '15', '16', 'prata', 'dourado'
  sku: string
  price: number
  initialQuantity: number // Qtde. Inicial Geral (estoque único)
  distribution?: StockDistributionItem[] // legado/opcional
  imageFile?: File | null
  imageUrl?: string
}

export interface GalleryImageItem {
  id: string
  file?: File
  previewUrl: string
  isPrincipal: boolean
}

export interface CreateProductPayload {
  produto_id: string
  nome_produto: string
  marca_id?: string
  fornecedor?: string
  categoria_ids: string[]
  description: string
  custo_unitario?: number
  selling_price: number
  preco_promocional?: number
  altura_cm?: number
  largura_cm?: number
  comprimento_cm?: number
  peso_g?: number
  publicar_no_ecommerce: boolean
  destaque_ecommerce: boolean
  slug: string
  qtde_inicial: number
  qtde_loja_virtual?: number // interruptor: 1 = publicado no e-commerce, 0 = não
  distribution?: StockDistributionItem[]
  has_variations: boolean
  variations: ProductVariationInput[]
  galleryImages: GalleryImageItem[]
}

export const productCreationService = {
  /**
   * Helper para formatar slug
   */
  slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  },

  /**
   * Garante slug único verificando duplicatas no banco
   */
  async generateUniqueSlug(baseName: string): Promise<string> {
    const raw = this.slugify(baseName)
    const baseSlug = raw || 'produto'

    try {
      const existing = await pb.collection('products').getFullList({
        filter: `slug ~ '${baseSlug}' || slug_scaglioni ~ '${baseSlug}'`,
        fields: 'slug,slug_scaglioni',
      })

      const usedSlugs = new Set<string>()
      existing.forEach((p: any) => {
        if (p.slug) usedSlugs.add(p.slug)
        if (p.slug_scaglioni) usedSlugs.add(p.slug_scaglioni)
      })

      if (!usedSlugs.has(baseSlug)) {
        return baseSlug
      }

      let counter = 1
      while (usedSlugs.has(`${baseSlug}-${counter}`)) {
        counter++
      }
      return `${baseSlug}-${counter}`
    } catch {
      return baseSlug
    }
  },

  /**
   * Gera produto_id sequencial legível
   */
  generateProductIdentifier(): string {
    const ts = Date.now().toString().slice(-6)
    const rnd = Math.floor(1000 + Math.random() * 9000)
    return `PROD-${ts}-${rnd}`
  },

  /**
   * SKU alfabética de e-commerce (v0.0.215, NOVA REGRA): DISTINTA do código numérico.
   * Gerada SOMENTE pelo hook do servidor (products_code_sequence.js) na criação:
   * TIPO + METAL + iniciais do nome livre + numerador de 2 dígitos (ex.: BROULCPV01).
   * Aqui é apenas espelho da última SKU retornada pela criação, para exibição pós-salvar.
   */
  lastGeneratedEcommerceSku: '' as string,

  /**
   * Cache das categorias carregadas (para derivar tipo/metal da SKU e-commerce).
   */
  categoriesCache: [] as ProductCategory[],

  /**
   * NOVA REGRA de SKU e-commerce (v0.0.215): deriva dicas de TIPO e METAL
   * a partir das categorias selecionadas no cadastro manual. O TIPO é a
   * categoria não-metal e o METAL a categoria de grupo 'metal' (quando houver).
   * Enviadas ao backend como query params (skuTipo/skuMetal) — o backend é a
   * fonte da geração.
   */
  deriveSkuHints(
    payload: CreateProductPayload,
    categories: ProductCategory[],
  ): { tipo: string; metal: string } {
    const hints = { tipo: '', metal: '' }
    if (!payload.categoria_ids || payload.categoria_ids.length === 0) return hints
    for (const catId of payload.categoria_ids) {
      const cat = categories.find((c) => c.id === catId)
      if (!cat) continue
      const group = (cat.group || '').trim()
      const isMetal =
        group === 'metal' ||
        (!group && /^(PRATA|OURO|RODIO|RÓDIO|AÇO|ACO|INOX|BANHO|DOURAD)/i.test(cat.name || ''))
      if (isMetal && !hints.metal) {
        hints.metal = (cat.name || '').trim()
      } else if (!isMetal && !hints.tipo) {
        hints.tipo = (cat.name || '').trim()
      }
    }
    return hints
  },

  /**
   * SKU alfabética de e-commerce do último produto criado nesta sessão do modal
   * (somente leitura; nunca sobrescreve sku_novo nem codigo_barras).
   */
  previewEcommerceSkuFor(product: Product): string {
    return (product.sku_ecommerce || '').trim() || this.lastGeneratedEcommerceSku
  },

  /**
   * Valida código de barras duplicado
   */
  async checkBarcodeUnique(barcode: string, ignoreProductId?: string): Promise<boolean> {
    const clean = barcode.trim()
    if (!clean) return true

    try {
      const q = clean.replace(/'/g, "\\'")
      const filter = `codigo_barras = '${q}' || codigo_barras_tecson = '${q}'`
      const list = await pb.collection('products').getList(1, 2, { filter })
      if (list.totalItems === 0) return true
      if (ignoreProductId && list.items.length === 1 && list.items[0].id === ignoreProductId) {
        return true
      }
      return false
    } catch {
      return true
    }
  },

  /**
   * Busca marcas disponíveis
   */
  async getBrands(): Promise<Brand[]> {
    return pb.collection('brands').getFullList<Brand>({ sort: 'name' })
  },

  /**
   * Cadastra marca inline
   */
  async createBrandInline(name: string): Promise<Brand> {
    const trimmed = name.trim()
    const slug = this.slugify(trimmed)
    return pb.collection('brands').create<Brand>({
      name: trimmed,
      slug: slug || `marca-${Date.now()}`,
    })
  },

  /**
   * Busca revendedoras ativas
   */
  async getActiveResellers(): Promise<Reseller[]> {
    return pb.collection('resellers').getFullList<Reseller>({
      filter: "status = 'active'",
      sort: 'name',
    })
  },

  /**
   * Busca todas as categorias ativas (não arquivadas por padrão)
   */
  async getCategories(includeArchived = false): Promise<ProductCategory[]> {
    const filter = includeArchived ? undefined : 'archived != true'
    const cats = await pb.collection('product_categories').getFullList<ProductCategory>({
      filter,
      sort: 'name',
    })
    // Cache para derivar dicas de tipo/metal da SKU e-commerce no saveFullProduct
    this.categoriesCache = cats
    return cats
  },

  /**
   * Cadastra fornecedores conhecidos da lista de produtos atuais
   */
  async getKnownSuppliers(): Promise<string[]> {
    try {
      const records = await pb.collection('products').getFullList({
        fields: 'fornecedor',
        filter: "fornecedor != ''",
      })
      const set = new Set<string>()
      records.forEach((r: any) => {
        if (r.fornecedor && typeof r.fornecedor === 'string') {
          set.add(r.fornecedor.trim())
        }
      })
      return Array.from(set).sort()
    } catch {
      return []
    }
  },

  /**
   * Salva o produto completo com todas as entidades associadas
   */
  async saveFullProduct(payload: CreateProductPayload): Promise<Product> {
    // 1. Monta FormData com campos de texto e a imagem principal (se houver)
    const formData = new FormData()

    formData.append('produto_id', payload.produto_id)
    formData.append('nome_produto', payload.nome_produto.trim())
    formData.append('description', payload.description.trim() || payload.nome_produto.trim())
    // Código (code / sku_novo / codigo_barras / sku_interno) NÃO é enviado: o hook do servidor gera na criação
    if (payload.marca_id) {
      formData.append('marca_id', payload.marca_id)
    }
    if (payload.fornecedor?.trim()) {
      formData.append('fornecedor', payload.fornecedor.trim())
    }

    formData.append('selling_price', String(payload.selling_price || 0))
    if (typeof payload.custo_unitario === 'number') {
      formData.append('custo_unitario', String(payload.custo_unitario))
      formData.append('invested_value', String(payload.custo_unitario))
    }
    if (typeof payload.preco_promocional === 'number' && payload.preco_promocional > 0) {
      formData.append('preco_promocional', String(payload.preco_promocional))
    }

    if (payload.altura_cm) formData.append('altura_cm', String(payload.altura_cm))
    if (payload.largura_cm) formData.append('largura_cm', String(payload.largura_cm))
    if (payload.comprimento_cm) formData.append('comprimento_cm', String(payload.comprimento_cm))
    if (payload.peso_g) formData.append('peso_g', String(payload.peso_g))

    formData.append('publicar_no_ecommerce', payload.publicar_no_ecommerce ? 'true' : 'false')
    formData.append(
      'destaque_ecommerce',
      payload.publicar_no_ecommerce && payload.destaque_ecommerce ? 'true' : 'false',
    )
    formData.append('slug', payload.slug)
    formData.append('ativo_interno', 'true')
    formData.append('status', 'available')

    // Estoque inicial e alerta
    const totalQty = payload.has_variations
      ? payload.variations.reduce((sum, v) => sum + (v.initialQuantity || 0), 0)
      : payload.qtde_inicial || 0

    formData.append('quantity', String(totalQty))
    formData.append('qtde_inicial', String(totalQty))
    // qtde_loja_virtual é apenas interruptor (1 = publicado, 0 = não publicado)
    const virtualQty = payload.qtde_loja_virtual ? 1 : 0
    formData.append('qtde_loja_virtual', String(virtualQty))
    // Alerta de estoque Scaglioni: 30% da quantidade inicial
    const minAlert = Math.max(1, Math.round(totalQty * 0.3))
    formData.append('minimum_quantity', String(minAlert))

    // Se houver imagem principal selecionada na galeria
    const principalImage =
      payload.galleryImages.find((img) => img.isPrincipal) || payload.galleryImages[0]
    if (principalImage?.file) {
      formData.append('photos', principalImage.file)
    }

    // Criar o produto. O código é gerado SOMENTE pelo hook do servidor (products_code_sequence.js),
    // de forma transacional, no ato da criação. Se outro cadastro pegar o mesmo código ao mesmo tempo,
    // o servidor recusa com 400: tenta de novo (o hook então atribui o próximo código livre).
    // NOVA REGRA de SKU e-commerce (v0.0.215): dicas de tipo/metal vão como QUERY PARAMS
    // (skuTipo/skuMetal) para o hook gerar TIPO+METAL+iniciais+numerador no backend.
    const skuHints = this.deriveSkuHints(payload, this.categoriesCache)
    const createOptions: any = { query: {} as Record<string, string> }
    if (skuHints.tipo) createOptions.query.skuTipo = skuHints.tipo
    if (skuHints.metal) createOptions.query.skuMetal = skuHints.metal

    const MAX_CREATE_ATTEMPTS = 3
    let productRecord: Product | null = null
    let lastError: any = null
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
      try {
        productRecord = await pb.collection('products').create<Product>(formData, createOptions)
        break
      } catch (err: any) {
        lastError = err
        if (err?.status !== 400 || attempt === MAX_CREATE_ATTEMPTS) break
        await new Promise((resolve) =>
          setTimeout(resolve, 150 * attempt + Math.floor(Math.random() * 200)),
        )
      }
    }
    if (!productRecord) {
      if (lastError?.status === 400) {
        throw new Error(
          'Não foi possível salvar o produto: o código foi disputado por outro cadastro ao mesmo tempo. Tente salvar novamente.',
        )
      }
      throw lastError
    }
    const createdProduct = productRecord
    const productId = createdProduct.id
    // SKU alfabética de e-commerce (v0.0.215, nova regra TIPO+METAL+iniciais+numerador):
    // gerada pelo hook do servidor na criação (distinta do código numérico/código de
    // barras). O frontend NUNCA gera — apenas exibe o valor retornado pelo backend.
    const generatedEcommerceSku = (productRecord.sku_ecommerce || '').trim()
    productCreationService.lastGeneratedEcommerceSku = generatedEcommerceSku

    // Variações: a etiqueta precisa carregar o código completo e legível da peça
    // (ex.: "1107 Aro 16"), nunca apenas o código do produto-pai.
    const finalCode = createdProduct.code || createdProduct.sku_novo || ''
    const variations = payload.variations.map((v, idx) => ({
      ...v,
      sku: `${finalCode} ${v.attributeValue.trim() || `V${idx + 1}`}`,
    }))

    // 2. Vínculos de Categorias (product_category_links)
    if (payload.categoria_ids.length > 0) {
      try {
        await Promise.all(
          payload.categoria_ids.map((catId, idx) =>
            pb.collection('product_category_links').create({
              product: productId,
              category: catId,
              is_principal: idx === 0,
            }),
          ),
        )
      } catch (catErr) {
        console.warn('Erro ao criar links de categorias:', catErr)
      }
    }

    // 3. Salvar galeria de imagens na coleção product_images
    if (payload.galleryImages.length > 0) {
      for (let i = 0; i < payload.galleryImages.length; i++) {
        const item = payload.galleryImages[i]
        try {
          const imgFormData = new FormData()
          imgFormData.append('product', productId)
          imgFormData.append('is_principal', item.isPrincipal ? 'true' : 'false')
          imgFormData.append('sort_order', String(i))
          imgFormData.append('origem', 'Cadastro Manual')
          if (item.file) {
            imgFormData.append('file', item.file)
          }
          await pb.collection('product_images').create(imgFormData)
        } catch (imgErr) {
          console.warn('Erro ao salvar imagem da galeria:', imgErr)
        }
      }
    }

    // 4. Salvar Estoque Inicial e Distribuições por Localização (initial_stocks)
    try {
      if (payload.has_variations && payload.variations.length > 0) {
        // Registra estoque inicial detalhado por variação (estoque único)
        for (const variation of variations) {
          const varDistDetails: any = {
            loja_fisica: variation.initialQuantity || 0,
            expedicao: 0,
            revendedoras: [] as any[],
          }

          await pb.collection('initial_stocks').create({
            product: productId,
            origem: 'Manual - Variação',
            id_origem: variation.sku,
            quantidade: variation.initialQuantity,
            localizacao: 'Distribuição Inicial',
            data_registro: new Date().toISOString(),
            is_ativo: true,
            detalhes_distribuicao: varDistDetails,
          })
        }
      } else {
        // Distribuição do produto simples (estoque único):
        // tudo vai para o estoque geral; qtde_loja_virtual é apenas interruptor de publicação
        const distDetails: any = {
          loja_fisica: payload.qtde_inicial || 0,
          expedicao: 0,
          revendedoras: [] as any[],
        }

        if (Array.isArray(payload.distribution) && payload.distribution.length > 0) {
          distDetails.loja_fisica = 0
          distDetails.expedicao = 0
          for (const d of payload.distribution) {
            if (d.localizacao === 'Estoque geral' || d.localizacao === 'Loja física') {
              distDetails.loja_fisica += d.quantidade
            } else if (d.localizacao === 'Estoque separado para e-commerce') {
              distDetails.expedicao += d.quantidade
            } else if (d.localizacao === 'Revendedora' && d.resellerId) {
              distDetails.revendedoras.push({
                reseller_id: d.resellerId,
                reseller_name: d.resellerName,
                quantidade: d.quantidade,
              })
              await this.assignResellerStock(
                productId,
                d.resellerId,
                d.quantidade,
                payload.selling_price,
              )
            }
          }
        }

        await pb.collection('initial_stocks').create({
          product: productId,
          origem: 'Manual',
          id_origem: payload.produto_id,
          quantidade: payload.qtde_inicial,
          localizacao: 'Entrada Inicial',
          data_registro: new Date().toISOString(),
          is_ativo: true,
          detalhes_distribuicao: distDetails,
        })
      }
    } catch (stockErr) {
      console.warn('Erro ao salvar initial_stocks:', stockErr)
    }

    // 5. Salvar Variações se houver
    if (payload.has_variations && payload.variations.length > 0) {
      for (const v of variations) {
        try {
          const varPayload: any = {
            product: productId,
            sku: v.sku,
            attributes: { [v.attributeName]: v.attributeValue },
            price: v.price,
            quantity: v.initialQuantity,
          }
          await pb.collection('product_variations').create(varPayload)
        } catch (vErr) {
          console.warn('Erro ao salvar variação:', vErr)
        }
      }
    }

    // Retorna o produto recém-criado recarregado do banco com expansions
    return pb.collection('products').getOne<Product>(productId, {
      expand: 'type,material,size,marca_id',
    })
  },

  /**
   * Aloca estoque na tabela reseller_stock_items se distribuído para revendedora
   */
  async assignResellerStock(
    productId: string,
    resellerId: string,
    qty: number,
    sellingPrice: number,
  ) {
    if (!resellerId || qty <= 0) return
    try {
      const existing = await pb.collection('reseller_stock_items').getList(1, 1, {
        filter: `reseller = '${resellerId}' && product = '${productId}'`,
      })
      if (existing.totalItems > 0) {
        const item = existing.items[0]
        await pb.collection('reseller_stock_items').update(item.id, {
          quantity: (item.quantity || 0) + qty,
          selling_price: sellingPrice,
        })
      } else {
        await pb.collection('reseller_stock_items').create({
          reseller: resellerId,
          product: productId,
          quantity: qty,
          selling_price: sellingPrice,
        })
      }
    } catch (err) {
      console.warn('Erro ao atribuir estoque da revendedora:', err)
    }
  },

  /**
   * Registra alteração de preços no histórico
   */
  async recordPriceChange(
    productId: string,
    oldSell: number,
    newSell: number,
    oldPromo?: number,
    newPromo?: number,
    oldCost?: number,
    newCost?: number,
    motivo = 'Edição de produto',
  ) {
    try {
      const currentAuthUser = pb.authStore.model?.id
      await pb.collection('product_price_history').create({
        product: productId,
        preco_venda_anterior: oldSell,
        preco_venda_novo: newSell,
        preco_promocional_anterior: oldPromo,
        preco_promocional_novo: newPromo,
        custo_unitario_anterior: oldCost,
        custo_unitario_novo: newCost,
        responsavel: currentAuthUser || null,
        motivo,
      })
    } catch (err) {
      console.warn('Erro ao gravar product_price_history:', err)
    }
  },
}
