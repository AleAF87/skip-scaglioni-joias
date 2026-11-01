migrate(
  (app) => {
    // 1. Atualizar o campo role na collection users para incluir 'superadmin'
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = users.fields.getByName('role')
    if (roleField) {
      roleField.values = ['superadmin', 'admin', 'operator', 'reseller']
    }

    // Regras de acesso em users:
    // superadmin e admin têm acesso total; usuários normais vêem e atualizam a si mesmos
    users.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || id = @request.auth.id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || id = @request.auth.id)"
    users.createRule = '' // Aberto para signup / admin
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || id = @request.auth.id)"
    users.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"

    app.save(users)

    // Atualizar as API rules de todas as coleções do app
    const collectionsToUpdate = [
      'product_types',
      'product_materials',
      'product_sizes',
      'settings',
      'customers',
      'products',
      'resellers',
      'sales',
      'consignment_lists',
      'reseller_stock_items',
      'reseller_deliveries',
      'reseller_sales',
      'reseller_returns',
      'reseller_issues',
      'consignment_documents',
      'brands',
      'product_categories',
      'product_category_links',
      'product_images',
      'product_variations',
      'product_price_history',
      'initial_stocks',
      'app_sequences',
    ]

    collectionsToUpdate.forEach((colName) => {
      try {
        const col = app.findCollectionByNameOrId(colName)
        let changed = false
        const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
        ruleNames.forEach((r) => {
          const val = col[r]
          if (val && typeof val === 'string' && val.includes("@request.auth.role = 'admin'")) {
            if (!val.includes("@request.auth.role = 'superadmin'")) {
              col[r] = val.replace(
                /@request\.auth\.role = 'admin'/g,
                "(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')",
              )
              changed = true
            }
          }
        })
        if (changed) {
          app.save(col)
        }
      } catch (err) {
        console.log('Erro ao processar coleção:', colName, err)
      }
    })
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const roleField = users.fields.getByName('role')
      if (roleField) {
        roleField.values = ['admin', 'operator', 'reseller']
        app.save(users)
      }
    } catch (_) {}
  },
)
