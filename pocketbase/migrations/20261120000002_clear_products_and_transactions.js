// 20261120000002: Limpeza COMPLETA do banco para recomeçar os testes do zero na
// joalheria Scaglioni. O repovoamento será feito pelos importadores Tecson e
// Scaglioni — portanto TODA a base de produtos e histórico de transações sai,
// mas cadastros-base permanecem.
//
// APAGA (produtos e todo histórico de transações):
//   - products (estoque geral) e derivados: product_images, product_variations,
//     product_category_links, product_price_history, initial_stocks
//   - posse das revendedoras e movimentações: reseller_stock_items,
//     reseller_deliveries, reseller_sales, reseller_returns, reseller_issues,
//     reseller_settlement_payments
//   - PDV da loja: sales; consignação (legado): consignment_lists,
//     consignment_documents
//   - contadores sequenciais reiniciados (deletados — os hooks recriam a partir
//     do 1): product_numeric_code e reseller_movement_seq
//
// MANTÉM (não apaga): revendedoras (contas/usuários, inclusive Camila Silveira),
// usuários admin/operador, customers, product_categories, brands, product_types,
// product_materials, product_sizes, settings.
//
// Idempotente: em banco vazio, os DELETEs são no-op.
// Observação: migrations rodam sem request/auth context, então os hooks
// onRecordCreateRequest/onRecordUpdateRequest (que exigem $apis / e.auth) não
// entram em conflito; o único hook de DELETE (users_protection, coleção users)
// não é afetado — nenhuma coleção apagada aqui tem hook de deleção.
migrate(
  (app) => {
    // 1. Histórico de transações e movimentações de revendedoras (filhos primeiro)
    const tables = [
      'reseller_settlement_payments',
      'reseller_issues',
      'reseller_returns',
      'reseller_sales',
      'reseller_deliveries',
      'reseller_stock_items',
      'consignment_documents',
      'consignment_lists',
      'sales',
    ]
    for (let t = 0; t < tables.length; t++) {
      try {
        app
          .db()
          .newQuery('DELETE FROM ' + tables[t])
          .execute()
      } catch (err) {
        console.log('Aviso ao limpar ' + tables[t] + ':', err.message)
      }
    }

    // 2. Produtos e registros derivados (após o histórico, respeitando relations)
    const productTables = [
      'product_category_links',
      'product_images',
      'product_variations',
      'product_price_history',
      'initial_stocks',
      'products',
    ]
    for (let p = 0; p < productTables.length; p++) {
      try {
        app
          .db()
          .newQuery('DELETE FROM ' + productTables[p])
          .execute()
      } catch (err) {
        console.log('Aviso ao limpar ' + productTables[p] + ':', err.message)
      }
    }

    // 3. Zerar contadores sequenciais: remove as linhas de app_sequences —
    //    os hooks recriam product_numeric_code e reseller_movement_seq no
    //    primeiro uso a partir do valor 1 (próximo código = 1, sem zeros à
    //    esquerda; próxima entrega/devolução = 1).
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM app_sequences WHERE name IN ('product_numeric_code', 'reseller_movement_seq', 'reseller_delivery_seq', 'reseller_return_seq')",
        )
        .execute()
    } catch (err) {
      console.log('Aviso ao zerar sequências:', err.message)
    }
  },
  (app) => {
    // down: idempotente — dados de teste apagados de propósito, nada a restaurar
  },
)
