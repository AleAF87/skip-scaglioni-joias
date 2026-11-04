migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('customers')
    if (!col.fields.getByName('cpf')) {
      col.fields.add(new TextField({ name: 'cpf' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('customers')
    col.fields.removeByName('cpf')
    app.save(col)
  },
)
