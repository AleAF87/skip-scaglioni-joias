migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const qtyField = products.fields.getByName('quantity')
    if (qtyField) {
      qtyField.required = false
    }
    const priceField = products.fields.getByName('selling_price')
    if (priceField) {
      priceField.required = false
    }
    app.save(products)
  },
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    const qtyField = products.fields.getByName('quantity')
    if (qtyField) {
      qtyField.required = true
    }
    const priceField = products.fields.getByName('selling_price')
    if (priceField) {
      priceField.required = true
    }
    app.save(products)
  },
)
