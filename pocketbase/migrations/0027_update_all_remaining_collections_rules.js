migrate(
  (app) => {
    const list = [
      'product_materials',
      'product_sizes',
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

    for (let i = 0; i < list.length; i++) {
      try {
        const col = app.findCollectionByNameOrId(list[i])
        let changed = false
        if (
          col.listRule &&
          col.listRule.indexOf("'admin'") !== -1 &&
          col.listRule.indexOf("'superadmin'") === -1
        ) {
          col.listRule = col.listRule
            .split("@request.auth.role = 'admin'")
            .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
          changed = true
        }
        if (
          col.viewRule &&
          col.viewRule.indexOf("'admin'") !== -1 &&
          col.viewRule.indexOf("'superadmin'") === -1
        ) {
          col.viewRule = col.viewRule
            .split("@request.auth.role = 'admin'")
            .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
          changed = true
        }
        if (
          col.createRule &&
          col.createRule.indexOf("'admin'") !== -1 &&
          col.createRule.indexOf("'superadmin'") === -1
        ) {
          col.createRule = col.createRule
            .split("@request.auth.role = 'admin'")
            .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
          changed = true
        }
        if (
          col.updateRule &&
          col.updateRule.indexOf("'admin'") !== -1 &&
          col.updateRule.indexOf("'superadmin'") === -1
        ) {
          col.updateRule = col.updateRule
            .split("@request.auth.role = 'admin'")
            .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
          changed = true
        }
        if (
          col.deleteRule &&
          col.deleteRule.indexOf("'admin'") !== -1 &&
          col.deleteRule.indexOf("'superadmin'") === -1
        ) {
          col.deleteRule = col.deleteRule
            .split("@request.auth.role = 'admin'")
            .join("(@request.auth.role = 'superadmin' || @request.auth.role = 'admin')")
          changed = true
        }
        if (changed) {
          app.save(col)
        }
      } catch (err) {}
    }
  },
  (app) => {},
)
