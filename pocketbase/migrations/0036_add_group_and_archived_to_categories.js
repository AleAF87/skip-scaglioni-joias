migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_categories')

    // 1. Adicionar campo 'group' (select: 'metal' ou 'tipo', default 'tipo')
    if (!col.fields.getByName('group')) {
      col.fields.add(
        new SelectField({
          name: 'group',
          required: false,
          values: ['metal', 'tipo'],
          maxSelect: 1,
        }),
      )
    }

    // 2. Adicionar campo 'archived' (bool, default false, NUNCA required)
    if (!col.fields.getByName('archived')) {
      col.fields.add(
        new BoolField({
          name: 'archived',
          required: false,
        }),
      )
    }

    app.save(col)

    // 3. Backfill idempotente: definir group = 'tipo' e archived = false onde estiver nulo ou vazio
    try {
      app
        .db()
        .newQuery(
          "UPDATE product_categories SET [group] = 'tipo' WHERE [group] IS NULL OR [group] = ''",
        )
        .execute()
    } catch (e1) {
      console.log('Aviso ao atualizar [group] default:', e1)
    }

    try {
      app
        .db()
        .newQuery('UPDATE product_categories SET archived = 0 WHERE archived IS NULL')
        .execute()
    } catch (e2) {
      console.log('Aviso ao atualizar archived default:', e2)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('product_categories')
      const groupField = col.fields.getByName('group')
      if (groupField) col.fields.remove(groupField)
      const archField = col.fields.getByName('archived')
      if (archField) col.fields.remove(archField)
      app.save(col)
    } catch (_) {}
  },
)
