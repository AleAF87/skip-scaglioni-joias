migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const descField = products.fields.getByName('description')
    if (descField) {
      descField.required = false
      app.save(products)
    }
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const descField = products.fields.getByName('description')
    if (descField) {
      descField.required = true
      app.save(products)
    }
  },
)
