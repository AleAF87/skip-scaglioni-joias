// 20261107120012: Limpeza de TODAS as movimentações de teste de consignação com
// revendedoras (entregas ENT-*, devoluções DEV-*, pendências, vendas do PDV de
// revendedora e estoque em posse), recompondo o estoque geral a partir do que
// estava em posse das revendedoras.
//
// Disciplina (mesma da 0012 / regra de estoque do projeto):
// - A quantidade em reseller_stock_items volta para products.quantity (estoque
//   geral) ANTES de apagar — entregas baixaram quantity e devoluções já
//   devolveram; somar o saldo em posse recomposta o estado exato.
// - Registros derivados são recalculáveis: status volta a 'available' quando a
//   quantity fica > 0 (a entrega tinha zerado e marcado 'unavailable').
// - Sequências ENT/DEV zeradas (registros apagados) e substituídas por UMA
//   sequência compartilhada 'reseller_movement_seq' (código numérico puro,
//   v0.0.152) — o próximo teste começa no 1.
// - NÃO apaga: revendedoras, produtos, clientes, vendas do PDV da loja, usuários.
migrate(
  (app) => {
    // 1. Recompor o estoque geral com o que estava em posse das revendedoras
    try {
      app
        .db()
        .newQuery(
          'UPDATE products SET quantity = quantity + COALESCE((SELECT SUM(quantity) FROM reseller_stock_items WHERE product = products.id), 0) WHERE EXISTS (SELECT 1 FROM reseller_stock_items WHERE product = products.id AND quantity > 0)',
        )
        .execute()
    } catch (_) {}

    // 2. Reabrir produtos que tinham ficado 'unavailable' quando a entrega zerou o saldo
    try {
      app
        .db()
        .newQuery(
          "UPDATE products SET status = 'available' WHERE quantity > 0 AND status = 'unavailable'",
        )
        .execute()
    } catch (_) {}

    // 3. Apagar as movimentações de teste (ordem: dependentes primeiro)
    const tables = [
      'reseller_stock_items',
      'reseller_deliveries',
      'reseller_returns',
      'reseller_issues',
      'reseller_sales',
      'consignment_documents',
      'consignment_lists',
    ]
    for (let t = 0; t < tables.length; t++) {
      try {
        app
          .db()
          .newQuery('DELETE FROM ' + tables[t])
          .execute()
      } catch (_) {}
    }

    // 4. Zerar contadores de código: remove as sequências antigas ENT/DEV e não
    // cria a nova — o hook cria 'reseller_movement_seq' no primeiro uso, a partir de 1.
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM app_sequences WHERE name IN ('reseller_delivery_seq', 'reseller_return_seq', 'reseller_movement_seq')",
        )
        .execute()
    } catch (_) {}
  },
  (app) => {
    // down: idempotente — nada a restaurar (dados de teste apagados de propósito)
  },
)
