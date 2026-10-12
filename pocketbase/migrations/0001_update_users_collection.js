migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['admin', 'operator', 'reseller'],
          maxSelect: 1,
        }),
      )
    }

    if (!users.fields.getByName('status')) {
      users.fields.add(
        new SelectField({
          name: 'status',
          values: ['pending', 'active', 'rejected', 'disabled'],
          maxSelect: 1,
        }),
      )
    }

    if (!users.fields.getByName('phone')) {
      users.fields.add(new TextField({ name: 'phone' }))
    }

    if (!users.fields.getByName('document')) {
      users.fields.add(new TextField({ name: 'document' }))
    }

    if (!users.fields.getByName('city')) {
      users.fields.add(new TextField({ name: 'city' }))
    }

    if (!users.fields.getByName('state')) {
      users.fields.add(new TextField({ name: 'state' }))
    }

    if (!users.fields.getByName('notes')) {
      users.fields.add(new TextField({ name: 'notes' }))
    }

    // Update users rules:
    // Admin can list/view/update/delete all.
    // Auth users can view their own record.
    // Role & status locked for normal self-updates
    users.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)"
    users.createRule = '' // Public can sign up or admin can create
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)"
    users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    users.addIndex('idx_users_role', false, 'role', '')
    users.addIndex('idx_users_status', false, 'status', '')

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.removeIndex('idx_users_role')
    users.removeIndex('idx_users_status')
    const fields = ['role', 'status', 'phone', 'document', 'city', 'state', 'notes']
    fields.forEach((f) => {
      const field = users.fields.getByName(f)
      if (field) users.fields.removeByName(f)
    })
    app.save(users)
  },
)
