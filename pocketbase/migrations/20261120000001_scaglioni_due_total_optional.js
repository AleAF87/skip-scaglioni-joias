/// O campo scaglioni_due_total de reseller_issues é obrigatório; no PocketBase,
/// número obrigatório = "não zero". Um item pendente marcado como "não cobrar"
/// (pending_charge=false) é gravado com valor 0 e falhava com
/// "scaglioni_due_total: cannot be blank.", derrubando toda a devolução.
/// O hook já calcula e grava o valor sempre; o campo só precisa aceitar 0.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_issues')
    const field = col.fields.getByName('scaglioni_due_total')
    if (field) {
      field.required = false
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_issues')
    const field = col.fields.getByName('scaglioni_due_total')
    if (field) {
      field.required = true
      app.save(col)
    }
  },
)
