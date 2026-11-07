// Torna o campo quantity de reseller_stock_items opcional (required: false).
// Motivo: no PocketBase, campo number com required rejeita o valor 0 ("quantity:
// cannot be blank"). Ao registrar uma devolução que zera o saldo em poder da
// revendedora, o hook reseller_stock_operations gravava quantity = 0 e o save
// falhava com 400 — o que derrubava a tela de devoluções com "Something went
// wrong.". 0 é um valor legítimo (saldo esvaziado pela devolução/conferência).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_stock_items')
    const qtyField = col.fields.getByName('quantity')
    if (qtyField) {
      qtyField.required = false
      app.save(col)
    }
  },
  (app) => {
    // Reverte: recusa apenas se houver registros com quantity nulo/vazio.
    const col = app.findCollectionByNameOrId('reseller_stock_items')
    const qtyField = col.fields.getByName('quantity')
    if (qtyField) {
      qtyField.required = true
      app.save(col)
    }
  },
)
