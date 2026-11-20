/// Quantidade vendida no PDV que compõe o fechamento da entrega.
migrate(
  (app) => {
    const returns = app.findCollectionByNameOrId('reseller_returns')
    if (!returns.fields.getByName('total_sold_qty')) {
      returns.fields.add(new NumberField({ name: 'total_sold_qty', min: 0 }))
      app.save(returns)
    }
  },
  (app) => {
    try {
      const returns = app.findCollectionByNameOrId('reseller_returns')
      if (returns.fields.getByName('total_sold_qty')) {
        returns.fields.removeByName('total_sold_qty')
        app.save(returns)
      }
    } catch (_) {}
  },
)
