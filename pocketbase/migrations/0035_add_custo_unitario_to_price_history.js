migrate(
  (app) => {
    const history = app.findCollectionByNameOrId('product_price_history')
    if (!history.fields.getByName('custo_unitario_anterior')) {
      history.fields.add(new NumberField({ name: 'custo_unitario_anterior' }))
    }
    if (!history.fields.getByName('custo_unitario_novo')) {
      history.fields.add(new NumberField({ name: 'custo_unitario_novo' }))
    }
    app.save(history)
  },
  (app) => {
    try {
      const history = app.findCollectionByNameOrId('product_price_history')
      const f1 = history.fields.getByName('custo_unitario_anterior')
      if (f1) history.fields.remove(f1)
      const f2 = history.fields.getByName('custo_unitario_novo')
      if (f2) history.fields.remove(f2)
      app.save(history)
    } catch (_) {}
  },
)
