migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('customers')

    // Campos adicionais do cliente
    if (!col.fields.getByName('birth_date')) {
      col.fields.add(new TextField({ name: 'birth_date' }))
    }
    if (!col.fields.getByName('address_street')) {
      col.fields.add(new TextField({ name: 'address_street' }))
    }
    if (!col.fields.getByName('address_number')) {
      col.fields.add(new TextField({ name: 'address_number' }))
    }
    if (!col.fields.getByName('address_complement')) {
      col.fields.add(new TextField({ name: 'address_complement' }))
    }
    if (!col.fields.getByName('address_neighborhood')) {
      col.fields.add(new TextField({ name: 'address_neighborhood' }))
    }
    if (!col.fields.getByName('address_zip')) {
      col.fields.add(new TextField({ name: 'address_zip' }))
    }

    // Regras de acesso alinhadas: admin, superadmin e operator podem listar, ver, criar, atualizar e excluir
    col.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    col.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    col.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    col.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    col.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('customers')
    ;[
      'birth_date',
      'address_street',
      'address_number',
      'address_complement',
      'address_neighborhood',
      'address_zip',
    ].forEach((f) => {
      try {
        col.fields.removeByName(f)
      } catch (_) {}
    })
    app.save(col)
  },
)
