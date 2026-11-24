// Adiciona o campo sku_ecommerce (texto, opcional) na collection products.
// É a SKU ALFABÉTICA do e-commerce (ex.: BRPFD01), DISTINTA do código numérico
// do produto (code/sku_novo/sku_interno/codigo_barras, que não são tocados).
// Índice único parcial: apenas valores não vazios precisam ser únicos
// (nullif converte '' em NULL e NULLs não colidem em índice unique do SQLite).
migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (!products.fields.getByName('sku_ecommerce')) {
      products.fields.add(new TextField({ name: 'sku_ecommerce' }))
    }

    // Índice único parcial (nullif('') vira NULL e NULLs não colidem em índice unique)
    const idxSql =
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_ecommerce_unique ON products (nullif(sku_ecommerce, ''))"
    const idx = []
    for (const ix of products.indexes) {
      if (!ix.includes('idx_products_sku_ecommerce_unique')) {
        idx.push(ix)
      }
    }
    idx.push(idxSql)
    products.indexes = idx

    app.save(products)
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    const idx = []
    for (const ix of products.indexes) {
      if (!ix.includes('idx_products_sku_ecommerce_unique')) {
        idx.push(ix)
      }
    }
    products.indexes = idx

    if (products.fields.getByName('sku_ecommerce')) {
      products.fields.removeByName('sku_ecommerce')
    }

    app.save(products)
  },
)
