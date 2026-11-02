migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('app_sequences')
    const record = new Record(col)
    record.set('name', 'trigger_discovery_8')
    record.set('current_value', 8)
    app.save(record)
  },
  (app) => {},
)
