migrate(
  (app) => {
    // 1. brands collection
    if (!app.hasTable('brands')) {
      const brands = new Collection({
        name: 'brands',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_brands_name ON brands (name)'],
      })
      app.save(brands)
    }

    // 2. product_categories collection
    if (!app.hasTable('product_categories')) {
      const cats = new Collection({
        name: 'product_categories',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_product_categories_name ON product_categories (name)'],
      })
      app.save(cats)
    }

    const products = app.findCollectionByNameOrId('products')
    const brandsCol = app.findCollectionByNameOrId('brands')

    // Add new fields to products collection if not exist
    const newFields = [
      { name: 'produto_id', ctor: () => new TextField({ name: 'produto_id' }) },
      { name: 'nome_produto', ctor: () => new TextField({ name: 'nome_produto' }) },
      { name: 'fornecedor', ctor: () => new TextField({ name: 'fornecedor' }) },
      {
        name: 'marca_id',
        ctor: () =>
          new RelationField({
            name: 'marca_id',
            collectionId: brandsCol.id,
            maxSelect: 1,
          }),
      },
      {
        name: 'preco_promocional',
        ctor: () => new NumberField({ name: 'preco_promocional', min: 0 }),
      },
      { name: 'custo_unitario', ctor: () => new NumberField({ name: 'custo_unitario', min: 0 }) },
      { name: 'altura_cm', ctor: () => new NumberField({ name: 'altura_cm', min: 0 }) },
      { name: 'largura_cm', ctor: () => new NumberField({ name: 'largura_cm', min: 0 }) },
      { name: 'comprimento_cm', ctor: () => new NumberField({ name: 'comprimento_cm', min: 0 }) },
      { name: 'peso_g', ctor: () => new NumberField({ name: 'peso_g', min: 0 }) },
      { name: 'ativo_interno', ctor: () => new BoolField({ name: 'ativo_interno' }) },
      {
        name: 'publicar_no_ecommerce',
        ctor: () => new BoolField({ name: 'publicar_no_ecommerce' }),
      },
      { name: 'destaque_ecommerce', ctor: () => new BoolField({ name: 'destaque_ecommerce' }) },
      { name: 'slug', ctor: () => new TextField({ name: 'slug' }) },
      { name: 'sku_interno', ctor: () => new TextField({ name: 'sku_interno' }) },
      { name: 'codigo_barras', ctor: () => new TextField({ name: 'codigo_barras' }) },
      { name: 'id_tecson', ctor: () => new TextField({ name: 'id_tecson' }) },
      {
        name: 'codigo_produto_tecson',
        ctor: () => new TextField({ name: 'codigo_produto_tecson' }),
      },
      { name: 'codigo_barras_tecson', ctor: () => new TextField({ name: 'codigo_barras_tecson' }) },
      { name: 'nome_original_tecson', ctor: () => new TextField({ name: 'nome_original_tecson' }) },
      { name: 'data_inclusao_tecson', ctor: () => new TextField({ name: 'data_inclusao_tecson' }) },
      { name: 'id_scaglioni', ctor: () => new TextField({ name: 'id_scaglioni' }) },
      { name: 'sku_scaglioni', ctor: () => new TextField({ name: 'sku_scaglioni' }) },
      { name: 'slug_scaglioni', ctor: () => new TextField({ name: 'slug_scaglioni' }) },
      {
        name: 'nome_original_scaglioni',
        ctor: () => new TextField({ name: 'nome_original_scaglioni' }),
      },
      { name: 'created_at_scaglioni', ctor: () => new TextField({ name: 'created_at_scaglioni' }) },
      { name: 'updated_at_scaglioni', ctor: () => new TextField({ name: 'updated_at_scaglioni' }) },
      {
        name: 'estado_ativo_ecommerce',
        ctor: () => new BoolField({ name: 'estado_ativo_ecommerce' }),
      },
      { name: 'tipo_produto_bruto', ctor: () => new TextField({ name: 'tipo_produto_bruto' }) },
      {
        name: 'variacao_resumo_bruto',
        ctor: () => new TextField({ name: 'variacao_resumo_bruto' }),
      },
      {
        name: 'nome_produto_pai_bruto',
        ctor: () => new TextField({ name: 'nome_produto_pai_bruto' }),
      },
      {
        name: 'cod_produto_pai_bruto',
        ctor: () => new TextField({ name: 'cod_produto_pai_bruto' }),
      },
      {
        name: 'codigo_barras_pai_bruto',
        ctor: () => new TextField({ name: 'codigo_barras_pai_bruto' }),
      },
    ]

    for (const f of newFields) {
      if (!products.fields.getByName(f.name)) {
        products.fields.add(f.ctor())
      }
    }
    app.save(products)

    const catsCol = app.findCollectionByNameOrId('product_categories')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 3. product_category_links collection (produto <-> categorias com is_principal)
    if (!app.hasTable('product_category_links')) {
      const links = new Collection({
        name: 'product_category_links',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        fields: [
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            cascadeDelete: true,
            required: true,
            maxSelect: 1,
          },
          {
            name: 'category',
            type: 'relation',
            collectionId: catsCol.id,
            cascadeDelete: false,
            required: true,
            maxSelect: 1,
          },
          { name: 'is_principal', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_product_cat_link ON product_category_links (product, category)',
        ],
      })
      app.save(links)
    }

    // 4. product_images collection (imagem principal + adicionais ordenadas)
    if (!app.hasTable('product_images')) {
      const pImages = new Collection({
        name: 'product_images',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        fields: [
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            cascadeDelete: true,
            required: true,
            maxSelect: 1,
          },
          { name: 'image_url', type: 'text' },
          {
            name: 'file',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          },
          { name: 'is_principal', type: 'bool' },
          { name: 'sort_order', type: 'number', onlyInt: true },
          { name: 'origem', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_product_images_prod ON product_images (product, sort_order)'],
      })
      app.save(pImages)
    }

    // 5. product_variations collection
    if (!app.hasTable('product_variations')) {
      const vars = new Collection({
        name: 'product_variations',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        fields: [
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            cascadeDelete: true,
            required: true,
            maxSelect: 1,
          },
          { name: 'sku', type: 'text', required: true },
          { name: 'attributes', type: 'json' }, // { aro: '16', cor: 'dourado' }
          { name: 'price', type: 'number', min: 0 },
          { name: 'quantity', type: 'number', min: 0 },
          { name: 'image_url', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_product_variations_sku ON product_variations (sku)'],
      })
      app.save(vars)
    }

    // 6. product_price_history collection
    if (!app.hasTable('product_price_history')) {
      const hist = new Collection({
        name: 'product_price_history',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            cascadeDelete: true,
            required: true,
            maxSelect: 1,
          },
          { name: 'preco_venda_anterior', type: 'number', min: 0 },
          { name: 'preco_venda_novo', type: 'number', min: 0 },
          { name: 'preco_promocional_anterior', type: 'number', min: 0 },
          { name: 'preco_promocional_novo', type: 'number', min: 0 },
          {
            name: 'responsavel',
            type: 'relation',
            collectionId: usersCol.id,
            maxSelect: 1,
          },
          { name: 'motivo', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_price_history_prod ON product_price_history (product, created DESC)',
        ],
      })
      app.save(hist)
    }

    // 7. initial_stocks collection (registros de saldo inicial por origem com localização)
    if (!app.hasTable('initial_stocks')) {
      const initStock = new Collection({
        name: 'initial_stocks',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            cascadeDelete: true,
            required: true,
            maxSelect: 1,
          },
          { name: 'origem', type: 'text', required: true }, // 'Tecson' | 'Scaglioni' | 'Manual'
          { name: 'id_origem', type: 'text' },
          { name: 'quantidade', type: 'number', min: 0, required: false },
          { name: 'localizacao', type: 'text' }, // 'A definir' default
          { name: 'data_registro', type: 'text' },
          { name: 'is_ativo', type: 'bool' }, // quando unificado, apenas o saldo escolhido fica ativo
          { name: 'detalhes_distribuicao', type: 'json' }, // { loja_fisica: 5, revendedora_id: 2, expedicao: 1 }
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_initial_stocks_prod ON initial_stocks (product, origem)'],
      })
      app.save(initStock)
    }
  },
  (app) => {
    ;[
      'initial_stocks',
      'product_price_history',
      'product_variations',
      'product_images',
      'product_category_links',
      'product_categories',
      'brands',
    ].forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    })
  },
)
