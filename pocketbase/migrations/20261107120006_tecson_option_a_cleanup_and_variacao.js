migrate(
  (app) => {
    // 1. Limpeza geral autorizada de produtos e vínculos de produtos
    // Clientes, revendedoras, usuários, categorias e configurações permanecem intactos.
    try {
      app.db().newQuery('DELETE FROM product_price_history').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM product_variations').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM product_images').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM product_category_links').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM initial_stocks').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM reseller_stock_items').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM consignment_documents').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM consignment_lists').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM reseller_deliveries').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM reseller_issues').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM reseller_returns').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM reseller_sales').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM sales').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM products').execute()
    } catch (err) {
      console.log('Aviso ao limpar products:', err)
    }

    // 2. Atualização da coleção 'products' para a Opção A Tecson
    const products = app.findCollectionByNameOrId('products')

    // 2.1 Adiciona campo 'variacao' (texto opcional)
    if (!products.fields.getByName('variacao')) {
      products.fields.add(
        new TextField({
          name: 'variacao',
          type: 'text',
          required: false,
        }),
      )
    }

    // 2.2 Substitui o índice UNIQUE antigo (idx_products_code) que travava múltiplos produtos com mesmo código
    // pelo índice composto code + variacao (idx_products_code_variacao), permitindo ex.: 8112 + '' e 8112 + 'N14' e 8112 + 'N15'
    try {
      products.indexes = (products.indexes || []).filter(
        (idx) => !idx.includes('idx_products_code'),
      )
    } catch (_) {}

    const compositeIndex =
      'CREATE UNIQUE INDEX idx_products_code_variacao ON products (code, variacao)'
    const hasComposite = (products.indexes || []).some((idx) =>
      idx.includes('idx_products_code_variacao'),
    )
    if (!hasComposite) {
      products.indexes.push(compositeIndex)
    }

    const codeIndex = 'CREATE INDEX idx_products_code_search ON products (code)'
    const hasCodeSearch = (products.indexes || []).some((idx) =>
      idx.includes('idx_products_code_search'),
    )
    if (!hasCodeSearch) {
      products.indexes.push(codeIndex)
    }

    const varIndex = 'CREATE INDEX idx_products_variacao ON products (variacao)'
    const hasVarSearch = (products.indexes || []).some((idx) =>
      idx.includes('idx_products_variacao'),
    )
    if (!hasVarSearch) {
      products.indexes.push(varIndex)
    }

    app.save(products)
  },
  (app) => {
    try {
      const products = app.findCollectionByNameOrId('products')
      const varField = products.fields.getByName('variacao')
      if (varField) {
        products.fields.removeByName('variacao')
      }
      products.indexes = (products.indexes || []).filter(
        (idx) =>
          !idx.includes('idx_products_code_variacao') &&
          !idx.includes('idx_products_code_search') &&
          !idx.includes('idx_products_variacao'),
      )
      products.indexes.push('CREATE UNIQUE INDEX idx_products_code ON products (code)')
      app.save(products)
    } catch (_) {}
  },
)
