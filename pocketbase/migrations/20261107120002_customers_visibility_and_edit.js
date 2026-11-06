// Migração: modelo de visibilidade/edição de clientes (customers) — v0.0.114.
// Reverte o escopo restritivo da migração 20261107120001 (revendedora só via os
// clientes que ela mesma cadastrou) SEM alterar a migração anterior.
//
// 1. list/view: qualquer usuário autenticado vê TODOS os clientes (equipe e
//    revendedoras) — tanto no PDV (busca ao vivo) quanto na página Clientes.
// 2. create: qualquer usuário autenticado pode cadastrar cliente; created_by é
//    gravado automaticamente pelo hook customers_created_by (não confia no body).
// 3. update: somente o criador (created_by = @request.auth.id) OU a equipe
//    (superadmin/admin/operator). Revendedora que não criou vê e vincula, mas
//    não edita (regra aplicada na API, não só na UI).
// 4. delete: mantém a regra anterior (exclusiva da equipe).
// 5. Clientes antigos sem created_by continuam editáveis apenas pela equipe —
//    a regra de update abaixo já cobre isso (created_by vazio não casa com o id).

migrate(
  (app) => {
    const customers = app.findCollectionByNameOrId('customers')

    if (!customers.fields.getByName('created_by')) {
      // Campo garantido também aqui (idempotente com a migração 20261107120001)
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

    const auth = "@request.auth.id != ''"
    const staff =
      "@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator'"

    // 1. Visibilidade TOTAL para qualquer usuário autenticado (sem filtro created_by)
    customers.listRule = auth
    customers.viewRule = auth

    // 2. CREATE: qualquer usuário autenticado (o hook grava o created_by real)
    customers.createRule = auth

    // 3. UPDATE: criador do registro OU equipe
    customers.updateRule = `${auth} && ((${staff}) || created_by = @request.auth.id)`

    // 4. DELETE: mantém como estava — exclusivo da equipe
    customers.deleteRule = `${auth} && (${staff})`

    customers.addIndex('idx_customers_created_by', false, 'created_by', '')
    app.save(customers)
  },
  (app) => {
    // Volta ao estado imposto pela migração 20261107120001
    const customers = app.findCollectionByNameOrId('customers')
    const fullRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
    const resellerScope = "@request.auth.role = 'reseller' && created_by = @request.auth.id"

    customers.listRule = `(${fullRule} || (${resellerScope}))`
    customers.viewRule = `(${fullRule} || (${resellerScope}))`
    customers.createRule = `(${fullRule} || (@request.auth.role = 'reseller' && (@request.body.created_by = @request.auth.id || @request.body.created_by:isset = false)))`
    customers.updateRule = fullRule
    customers.deleteRule = fullRule
    app.save(customers)
  },
)
