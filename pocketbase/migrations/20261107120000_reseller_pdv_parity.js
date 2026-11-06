// Migração: paridade do PDV da Revendedora com o PDV do admin.
// 1. reseller_sales.status ganha o valor 'pending' (reserva pendente).
// 2. reseller_sales ganha o campo customer (relação com customers) — vínculo de
//    compra/reserva sempre pelo ID imutável do cliente (nunca CPF).
// 3. Regra de delete de reseller_sales passa a permitir que a própria revendedora
//    exclua as PRÓPRIAS reservas pendentes (status = 'pending').
// 4. customers: revendedoras passam a poder listar/ver/cadastrar clientes
//    (necessário para a busca ao vivo e "Cadastrar novo" dentro do PDV delas).

migrate(
  (app) => {
    // --- reseller_sales ---
    const sales = app.findCollectionByNameOrId('reseller_sales')

    const statusField = sales.fields.getByName('status')
    if (statusField && statusField.values.indexOf('pending') === -1) {
      statusField.values.push('pending')
    }

    if (!sales.fields.getByName('customer')) {
      const customerField = new Field({
        type: 'relation',
        name: 'customer',
        collectionId: app.findCollectionByNameOrId('customers').id,
        maxSelect: 1,
        required: false,
      })
      sales.fields.add(customerField)
    }

    sales.deleteRule =
      "@request.auth.id != '' && ((@request.auth.role = 'superadmin' || @request.auth.role = 'admin') || (reseller.user = @request.auth.id && status = 'pending'))"

    app.save(sales)

    // --- customers: liberar leitura/cadastro para revendedoras ---
    const customers = app.findCollectionByNameOrId('customers')
    const customerRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.role = 'reseller')"
    customers.listRule = customerRule
    customers.viewRule = customerRule
    customers.createRule = customerRule
    app.save(customers)
  },
  (app) => {
    // --- rollback ---
    const sales = app.findCollectionByNameOrId('reseller_sales')
    const statusField = sales.fields.getByName('status')
    if (statusField) {
      statusField.values = statusField.values.filter((v) => v !== 'pending')
    }
    const customerField = sales.fields.getByName('customer')
    if (customerField) {
      sales.fields.removeByName('customer')
    }
    sales.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
    app.save(sales)

    const customers = app.findCollectionByNameOrId('customers')
    const customerRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    customers.listRule = customerRule
    customers.viewRule = customerRule
    customers.createRule = customerRule
    app.save(customers)
  },
)
