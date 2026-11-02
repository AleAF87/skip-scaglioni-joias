migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('app_sequences')
    const record = new Record(col)
    record.set('name', 'trigger_discovery')
    record.set('current_value', 1)
    app.save(record)
  },
  (app) => {},
)
