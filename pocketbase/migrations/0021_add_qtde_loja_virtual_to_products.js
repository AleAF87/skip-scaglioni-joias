migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (!products.fields.getByName('qtde_loja_virtual')) {
      products.fields.add(
        new NumberField({
          name: 'qtde_loja_virtual',
          type: 'number',
          onlyInt: true,
          min: 0,
        }),
      )
      app.save(products)
    }

    // Backfill idempotente: se qtde_loja_virtual estiver nulo, preencher com 0
    try {
      app
        .db()
        .newQuery(
          `
        UPDATE products
        SET qtde_loja_virtual = 0
        WHERE qtde_loja_virtual IS NULL
      `,
        )
        .execute()
    } catch (err) {
      console.log('Aviso ao executar backfill de qtde_loja_virtual em products:', err)
    }
  },
  (app) => {
    try {
      const products = app.findCollectionByNameOrId('products')
      const field = products.fields.getByName('qtde_loja_virtual')
      if (field) {
        products.fields.removeByName('qtde_loja_virtual')
        app.save(products)
      }
    } catch (_) {}
  },
)
