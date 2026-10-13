migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const codeField = products.fields.getByName('code')
    if (codeField) {
      codeField.required = false
      app.save(products)
    }
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const codeField = products.fields.getByName('code')
    if (codeField) {
      codeField.required = true
      app.save(products)
    }
  },
)
