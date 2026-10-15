migrate(
  (app) => {
    const resellers = app.findCollectionByNameOrId('resellers')
    if (!resellers.fields.getByName('commission_rate')) {
      resellers.fields.add(
        new NumberField({
          name: 'commission_rate',
          min: 0,
          max: 100,
        }),
      )
      app.save(resellers)
    }

    // Set default commission_rate = 40 for existing records if null or 0
    try {
      app
        .db()
        .newQuery(
          'UPDATE resellers SET commission_rate = 40 WHERE commission_rate IS NULL OR commission_rate = 0',
        )
        .execute()
    } catch (_) {}
  },
  (app) => {
    try {
      const resellers = app.findCollectionByNameOrId('resellers')
      const field = resellers.fields.getByName('commission_rate')
      if (field) {
        resellers.fields.removeByName('commission_rate')
        app.save(resellers)
      }
    } catch (_) {}
  },
)
