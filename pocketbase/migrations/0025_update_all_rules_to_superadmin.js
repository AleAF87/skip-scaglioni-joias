migrate(
  (app) => {
    // 0025 atualiza explicitamente todas as coleções que utilizam @request.auth.role = 'admin'
    const helper = (rule) => {
      if (!rule || typeof rule !== 'string') return rule
      if (rule.indexOf("'superadmin'") !== -1) return rule
      return rule
        .split("@request.auth.role = 'admin'")
        .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
    }

    const colNames = [
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

    for (let i = 0; i < colNames.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(colNames[i])
        let changed = false
        const ruleNames = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
        for (let j = 0; j < ruleNames.length; j++) {
          const r = ruleNames[j]
          const oldRule = col[r]
          if (oldRule) {
            const newRule = helper(oldRule)
            if (newRule !== oldRule) {
              col[r] = newRule
              changed = true
            }
          }
        }
        if (changed) {
          app.save(col)
        }
      } catch (_) {}
    }
  },
  (app) => {},
)
