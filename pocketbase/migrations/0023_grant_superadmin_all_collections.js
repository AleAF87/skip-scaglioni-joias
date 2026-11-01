migrate(
  (app) => {
    // 0022 adicionou 'superadmin' ao SelectField de users e atualizou as rules de users.
    // Atualizar todas as regras restantes para incluir superadmin onde quer que admin apareça
    const collections = [
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

    collections.forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        let changed = false
        const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
        ruleNames.forEach((r) => {
          const oldRule = col[r]
          if (oldRule && typeof oldRule === 'string') {
            if (
              oldRule.indexOf("@request.auth.role = 'admin'") !== -1 &&
              oldRule.indexOf("'superadmin'") === -1
            ) {
              col[r] = oldRule
                .split("@request.auth.role = 'admin'")
                .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
              changed = true
            }
          }
        })
        if (changed) {
          app.save(col)
        }
      } catch (e) {
        // ignora se coleção não existir
      }
    })
  },
  (app) => {},
)
