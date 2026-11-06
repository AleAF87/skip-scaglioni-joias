// Limpeza de dados de teste: apaga TODOS os registros da collection customers
// antes da importação da planilha real (decisão do usuário).
// Idempotente: em banco vazio (cópia nova/restore) é no-op.
// Registros de sales/reseller_sales que apontavam para clientes ficam com o
// vínculo órfão — o sistema já trata cliente inexistente como Consumidor Final.
migrate(
  (app) => {
    if (!app.hasTable('customers')) return
    const col = app.findCollectionByNameOrId('customers')
    app.truncateCollection(col)
  },
  (app) => {
    // Rollback não recupera os dados apagados (eram dados de teste).
  },
)
