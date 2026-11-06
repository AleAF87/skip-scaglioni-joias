// Remove da collection customers os campos dispensados pelo usuário na revisão
// do importador de planilha (nenhum desses campos tem dados ainda):
//   remember_birthday, seller_name, site, payment_type,
//   billing_street/number/complement/neighborhood/city/state/zip/country,
//   contact_purchases_name/phone/email, contact_finance_name/phone/email, status
// (STATUS "EXCLUÍDO" nem é importado — a linha é pulada, então o campo não se
// justifica).
// MANTÉM rg, cnpj, customer_since e os demais campos originais.
// Rollback recria os campos (vazios — os dados apagados não voltam).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('customers')

    const textFields = [
      'seller_name',
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
      if (col.fields.getByName(name)) {
        col.fields.removeByName(name)
      }
    }
    if (col.fields.getByName('remember_birthday')) {
      col.fields.removeByName('remember_birthday')
    }

    // Regras de acesso permanecem as da v0.0.114 — salvar sem tocá-las.
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('customers')

    const textFields = [
      'seller_name',
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
      col.fields.add(new BoolField({ name: 'remember_birthday' }))
    }

    app.save(col)
  },
)
