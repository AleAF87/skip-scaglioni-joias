migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('sales')
    col.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('sales')
    col.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
    app.save(col)
  },
)
