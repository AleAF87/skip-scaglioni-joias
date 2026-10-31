// Hook to compute aggregated totals for products with optional filter query
// POST /backend/v1/products/totals
// Body: { filter?: string }
// Returns:
// {
//   total_invested_unit: number, // sum(invested_value)
//   total_selling_unit: number,  // sum(selling_price)
//   total_invested_stock: number, // sum(invested_value * quantity)
//   total_selling_stock: number,  // sum(selling_price * quantity)
//   total_quantity: number,       // sum(quantity)
//   total_items: number           // count of items
// }

routerAdd(
  'POST',
  '/backend/v1/products/totals',
  (e) => {
    try {
      const data = e.requestInfo().body || {}
      const filter = (data.filter || '').trim()

      let totalInvestedUnit = 0
      let totalSellingUnit = 0
      let totalInvestedStock = 0
      let totalSellingStock = 0
      let totalQuantity = 0
      let totalItems = 0

      // In PocketBase JSVM, findRecordsByFilter(collection, filter, sort, limit, offset)
      const records = $app.findRecordsByFilter('products', filter, '', 10000, 0)
      totalItems = records.length

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const qty = rec.getInt('quantity') || 0
        const invested = rec.getFloat('invested_value') || 0
        const selling = rec.getFloat('selling_price') || 0

        totalQuantity += qty
        totalInvestedUnit += invested
        totalSellingUnit += selling
        totalInvestedStock += invested * qty
        totalSellingStock += selling * qty
      }

      const totalInvested = totalInvestedStock > 0 ? totalInvestedStock : totalInvestedUnit
      const totalSelling = totalSellingStock > 0 ? totalSellingStock : totalSellingUnit
      const totalProfit = totalSelling - totalInvested
      const totalProfitUnit = totalSellingUnit - totalInvestedUnit
      const totalProfitStock = totalSellingStock - totalInvestedStock

      return e.json(200, {
        total_invested: totalInvested,
        total_selling: totalSelling,
        total_profit: totalProfit,
        total_invested_unit: totalInvestedUnit,
        total_selling_unit: totalSellingUnit,
        total_invested_stock: totalInvestedStock,
        total_selling_stock: totalSellingStock,
        total_profit_unit: totalProfitUnit,
        total_profit_stock: totalProfitStock,
        total_stock_pieces: totalQuantity,
        total_items: totalItems,
      })
    } catch (err) {
      console.log('Erro ao calcular totais de produtos:', err.message)
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
