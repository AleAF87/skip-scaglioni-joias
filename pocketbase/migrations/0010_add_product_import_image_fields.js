migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (!products.fields.getByName('import_image_path')) {
      products.fields.add(
        new TextField({
          name: 'import_image_path',
          required: false,
        }),
      )
    }

    if (!products.fields.getByName('image_url')) {
      products.fields.add(
        new TextField({
          name: 'image_url',
          required: false,
        }),
      )
    }

    app.save(products)
  },
  (app) => {
    try {
      const products = app.findCollectionByNameOrId('products')
      const p1 = products.fields.getByName('import_image_path')
      if (p1) products.fields.remove(p1)
      const p2 = products.fields.getByName('image_url')
      if (p2) products.fields.remove(p2)
      app.save(products)
    } catch (_) {}
  },
)
