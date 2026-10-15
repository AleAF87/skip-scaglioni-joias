migrate(
  (app) => {
    const stockItems = app.findCollectionByNameOrId('reseller_stock_items')
    stockItems.listRule = ''
    stockItems.viewRule = ''
    app.save(stockItems)
  },
  (app) => {
    try {
      const stockItems = app.findCollectionByNameOrId('reseller_stock_items')
      stockItems.listRule =
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)"
      stockItems.viewRule =
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)"
      app.save(stockItems)
    } catch (_) {}
  },
)
