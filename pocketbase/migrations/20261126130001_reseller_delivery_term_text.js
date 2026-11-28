migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    if (!col.fields.getByName('term_text')) {
      col.fields.add(
        new TextField({
          name: 'term_text',
          required: false,
          max: 20000,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    if (col.fields.getByName('term_text')) {
      col.fields.removeByName('term_text')
      app.save(col)
    }
  },
)
