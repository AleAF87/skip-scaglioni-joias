migrate(
  (app) => {
    // Campo delivery_code em reseller_returns: guarda o código da entrega de origem
    // (ex.: "Devolução DEV-0002 · Entrega ENT-0001"). Idempotente: só adiciona se não existir.
    // Histórico (entregas/devoluções antigas) mantém os códigos originais.
    const returns = app.findCollectionByNameOrId('reseller_returns')
    if (!returns.fields.getByName('delivery_code')) {
      returns.fields.add(
        new TextField({
          name: 'delivery_code',
        }),
      )
      app.save(returns)
    }
  },
  (app) => {
    try {
      const returns = app.findCollectionByNameOrId('reseller_returns')
      const field = returns.fields.getByName('delivery_code')
      if (field) {
        returns.fields.removeByName('delivery_code')
        app.save(returns)
      }
    } catch (_) {}
  },
)
