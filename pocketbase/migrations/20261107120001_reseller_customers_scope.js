// Migração: escopo de clientes por revendedora no PDV.
// 1. customers ganha o campo created_by (relação com users) — quem cadastrou o cliente.
// 2. Regras de customers: superadmin/admin/operator veem TODOS os clientes;
//    revendedora lista/vê/cadastra APENAS os clientes que ELA cadastrou
//    (created_by = @request.auth.id). Edição/exclusão continua restrita à equipe.
// 3. create: revendedora é obrigada a marcar a si própria como criadora
//    (created_by ausente ou igual ao próprio id).

migrate(
  (app) => {
    const customers = app.findCollectionByNameOrId('customers')

    if (!customers.fields.getByName('created_by')) {
      customers.fields.add(
        new Field({
          type: 'relation',
          name: 'created_by',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: false,
        }),
      )
    }

    const fullRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    const resellerScope = "@request.auth.role = 'reseller' && created_by = @request.auth.id"

    customers.listRule = `(${fullRule} || (${resellerScope}))`
    customers.viewRule = `(${fullRule} || (${resellerScope}))`
    customers.createRule = `(${fullRule} || (@request.auth.role = 'reseller' && (@request.body.created_by = @request.auth.id || @request.body.created_by:isset = false)))`
    // update/delete permanecem exclusivos da equipe (superadmin/admin/operator)
    customers.updateRule = fullRule
    customers.deleteRule = fullRule

    customers.addIndex('idx_customers_created_by', false, 'created_by', '')
    app.save(customers)
  },
  (app) => {
    const customers = app.findCollectionByNameOrId('customers')
    customers.removeIndex('idx_customers_created_by')
    const customerField = customers.fields.getByName('created_by')
    if (customerField) {
      customers.fields.removeByName('created_by')
    }
    const oldRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator' || @request.auth.role = 'reseller')"
    customers.listRule = oldRule
    customers.viewRule = oldRule
    customers.createRule = oldRule
    customers.updateRule = oldRule
    customers.deleteRule = oldRule
    app.save(customers)
  },
)
