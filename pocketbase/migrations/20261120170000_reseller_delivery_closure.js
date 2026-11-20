/// Estado auditável do fechamento de entregas e cobrança de extravios.
migrate(
  (app) => {
    const deliveries = app.findCollectionByNameOrId('reseller_deliveries')
    const returns = app.findCollectionByNameOrId('reseller_returns')
    const issues = app.findCollectionByNameOrId('reseller_issues')

    if (!returns.fields.getByName('delivery_ref')) {
      returns.fields.add(
        new RelationField({
          name: 'delivery_ref',
          collectionId: deliveries.id,
          maxSelect: 1,
        }),
      )
      app.save(returns)
    }

    if (!issues.fields.getByName('charged')) {
      issues.fields.add(
        new BoolField({
          name: 'charged',
        }),
      )
      app.save(issues)
    }
  },
  (app) => {
    try {
      const returns = app.findCollectionByNameOrId('reseller_returns')
      if (returns.fields.getByName('delivery_ref')) {
        returns.fields.removeByName('delivery_ref')
        app.save(returns)
      }
      const issues = app.findCollectionByNameOrId('reseller_issues')
      if (issues.fields.getByName('charged')) {
        issues.fields.removeByName('charged')
        app.save(issues)
      }
    } catch (_) {}
  },
)
