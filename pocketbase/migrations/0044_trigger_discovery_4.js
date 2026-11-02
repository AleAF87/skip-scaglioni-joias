migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('app_sequences')
    const record = new Record(col)
    record.set('name', 'trigger_discovery_4')
    record.set('current_value', 4)
    app.save(record)
  },
  (app) => {},
)
