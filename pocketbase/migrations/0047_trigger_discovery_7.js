migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('app_sequences')
    const record = new Record(col)
    record.set('name', 'trigger_discovery_7')
    record.set('current_value', 7)
    app.save(record)
  },
  (app) => {},
)
