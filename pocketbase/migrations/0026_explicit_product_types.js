migrate(
  (app) => {
    // 0026 testa atualização direta em product_types
    const pt = app.findCollectionByNameOrId('product_types')
    pt.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
    pt.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    pt.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    app.save(pt)
  },
  (app) => {},
)
