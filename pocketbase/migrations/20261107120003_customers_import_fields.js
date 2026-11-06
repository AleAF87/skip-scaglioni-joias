// Adiciona à collection customers os campos novos usados pelo importador de
// planilha de clientes (planilha "Clientes 23385" — ERP externo):
//   Dados do documento: rg, cnpj
//   Dados comerciais: seller_name, country, site, payment_type,
//     remember_birthday (bool), customer_since (date), status
//   Endereço de cobrança: billing_street/number/complement/neighborhood/
//     city/state/zip/country
//   Contatos: contact_purchases_name/phone/email,
//     contact_finance_name/phone/email
// Idempotente: cada campo só é criado se ainda não existir (base vazia ou
// banco já migrado). status é texto livre ('' = ativo; 'EXCLUÍDO' = excluído)
// para aceitar exatamente o que vier da planilha.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('customers')

    const textFields = [
      'rg',
      'cnpj',
      'seller_name',
      'country',
      'site',
      'payment_type',
      'billing_street',
      'billing_number',
      'billing_complement',
      'billing_neighborhood',
      'billing_city',
      'billing_state',
      'billing_zip',
      'billing_country',
      'contact_purchases_name',
      'contact_purchases_phone',
      'contact_purchases_email',
      'contact_finance_name',
      'contact_finance_phone',
      'contact_finance_email',
      'status',
    ]

    for (const name of textFields) {
      if (!col.fields.getByName(name)) {
        col.fields.add(new TextField({ name }))
      }
    }

    if (!col.fields.getByName('remember_birthday')) {
      // Nunca required: bool obrigatório rejeitaria false/ausente.
      col.fields.add(new BoolField({ name: 'remember_birthday' }))
    }

    if (!col.fields.getByName('customer_since')) {
      col.fields.add(new DateField({ name: 'customer_since' }))
    }

    // Importação de clientes marca a origem no registro; o hook
    // customers_created_by lê este campo para NÃO preencher created_by
    // (decisão do usuário: clientes importados ficam sem criador).
    if (!col.fields.getByName('import_source')) {
      col.fields.add(new TextField({ name: 'import_source' }))
    }

    // Regras de acesso permanecem as da v0.0.114 — salvar sem tocá-las.
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('customers')
    const names = [
      'rg',
      'cnpj',
      'seller_name',
      'country',
      'site',
      'payment_type',
      'billing_street',
      'billing_number',
      'billing_complement',
      'billing_neighborhood',
      'billing_city',
      'billing_state',
      'billing_zip',
      'billing_country',
      'contact_purchases_name',
      'contact_purchases_phone',
      'contact_purchases_email',
      'contact_finance_name',
      'contact_finance_phone',
      'contact_finance_email',
      'remember_birthday',
      'customer_since',
      'status',
      'import_source',
    ]
    for (const name of names) {
      const f = col.fields.getByName(name)
      if (f) {
        col.fields.removeByName(name)
      }
    }
    app.save(col)
  },
)
