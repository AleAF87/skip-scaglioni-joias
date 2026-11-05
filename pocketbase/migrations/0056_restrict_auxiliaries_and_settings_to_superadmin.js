migrate(
  (app) => {
    // 1. Atualizar regras de product_types, product_materials e product_sizes:
    // Apenas superadmin pode criar, editar ou excluir (Página /auxiliares - Catálogo de Joias interno)
    // list e view continuam acessíveis por usuários autenticados para que produtos e vitrine funcionem normalmente
    const auxCollections = ['product_types', 'product_materials', 'product_sizes']

    auxCollections.forEach((colName) => {
      try {
        const col = app.findCollectionByNameOrId(colName)
        col.createRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
        col.updateRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
        col.deleteRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
        app.save(col)
      } catch (err) {
        console.log('Erro ao atualizar regras de ' + colName + ':', err)
      }
    })

    // 2. Atualizar regras de settings:
    // Apenas superadmin pode alterar as configurações contratuais/institucionais da empresa (/empresa)
    // list e view continuam acessíveis para emissão de contratos e exibição institucional
    try {
      const settings = app.findCollectionByNameOrId('settings')
      settings.createRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
      settings.updateRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
      settings.deleteRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
      app.save(settings)
    } catch (err) {
      console.log('Erro ao atualizar regras de settings:', err)
    }

    // 3. Atualizar regras de deleteRule em users:
    // Apenas superadmin pode excluir usuários permanentemente no banco
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'superadmin'"
      app.save(users)
    } catch (err) {
      console.log('Erro ao atualizar deleteRule de users:', err)
    }
  },
  (app) => {
    const auxCollections = ['product_types', 'product_materials', 'product_sizes', 'settings']
    auxCollections.forEach((colName) => {
      try {
        const col = app.findCollectionByNameOrId(colName)
        col.createRule =
          "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
        col.updateRule =
          "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
        col.deleteRule =
          "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
        app.save(col)
      } catch (_) {}
    })

    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.deleteRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
      app.save(users)
    } catch (_) {}
  },
)
