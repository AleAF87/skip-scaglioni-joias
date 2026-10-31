migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')

    if (!products.fields.getByName('qtde_inicial')) {
      products.fields.add(
        new NumberField({
          name: 'qtde_inicial',
          type: 'number',
          onlyInt: true,
          min: 0,
        }),
      )
      app.save(products)
    }

    // Backfill idempotente para produtos existentes:
    // Se qtde_inicial estiver nulo ou zero, preencher com o valor existente em initial_stocks (se houver) ou quantity
    try {
      app
        .db()
        .newQuery(
          `
        UPDATE products
        SET qtde_inicial = COALESCE(
          (SELECT quantidade FROM initial_stocks WHERE initial_stocks.product = products.id AND quantidade > 0 ORDER BY created ASC LIMIT 1),
          quantity,
          0
        )
        WHERE qtde_inicial IS NULL OR qtde_inicial = 0
      `,
        )
        .execute()
    } catch (err) {
      console.log('Aviso ao executar backfill de qtde_inicial em products:', err)
    }
  },
  (app) => {
    try {
      const products = app.findCollectionByNameOrId('products')
      const field = products.fields.getByName('qtde_inicial')
      if (field) {
        products.fields.removeByName('qtde_inicial')
        app.save(products)
      }
    } catch (_) {}
  },
)
