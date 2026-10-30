migrate(
  (app) => {
    // 0012: Limpeza retroativa de vendas de teste e listas de consignação órfãs
    // que restaram de seeds anteriores após a limpeza de produtos
    try {
      app.db().newQuery('DELETE FROM consignment_documents').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM consignment_lists').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM sales').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM reseller_sales').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM reseller_deliveries').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM reseller_issues').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM reseller_returns').execute()
    } catch (_) {}

    try {
      app.db().newQuery('DELETE FROM reseller_stock_items').execute()
    } catch (_) {}
  },
  (app) => {
    // down (idempotente)
  },
)
