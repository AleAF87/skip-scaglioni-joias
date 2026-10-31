migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (!products.fields.getByName('sku_novo')) {
      products.fields.add(new TextField({ name: 'sku_novo' }))
    }

    if (!products.fields.getByName('criado_em_origem')) {
      products.fields.add(new TextField({ name: 'criado_em_origem' }))
    }

    app.save(products)
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (products.fields.getByName('sku_novo')) {
      products.fields.removeByName('sku_novo')
    }

    if (products.fields.getByName('criado_em_origem')) {
      products.fields.removeByName('criado_em_origem')
    }

    app.save(products)
  },
)
