/// Acerto financeiro de devoluções de revendedoras.
/// Preserva o histórico de pagamentos parciais e libera a leitura da equipe
/// (inclusive superadmin) sem abrir escrita para a revendedora.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const resellers = app.findCollectionByNameOrId('resellers')
    const returns = app.findCollectionByNameOrId('reseller_returns')
    const sales = app.findCollectionByNameOrId('reseller_sales')

    // A equipe deve conseguir consultar os dados de qualquer revendedora.
    const readRule =
      "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)"
    ;[
      'reseller_stock_items',
      'reseller_deliveries',
      'reseller_sales',
      'reseller_returns',
      'reseller_issues',
    ].forEach((name) => {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = readRule
      collection.viewRule = readRule
      app.save(collection)
    })

    if (!sales.fields.getByName('settlement_return')) {
      sales.fields.add(
        new RelationField({
          name: 'settlement_return',
          collectionId: returns.id,
          maxSelect: 1,
        }),
      )
      app.save(sales)
    }

    if (!returns.fields.getByName('total_financial_due')) {
      returns.fields.add(new NumberField({ name: 'total_financial_due', min: 0 }))
      returns.fields.add(new NumberField({ name: 'total_paid', min: 0 }))
      returns.fields.add(new NumberField({ name: 'balance_due', min: 0 }))
      returns.fields.add(
        new SelectField({
          name: 'financial_status',
          values: ['open', 'partial', 'settled'],
          maxSelect: 1,
        }),
      )
      app.save(returns)
    }

    try {
      app.findCollectionByNameOrId('reseller_settlement_payments')
    } catch (_) {
      const payments = new Collection({
        name: 'reseller_settlement_payments',
        type: 'base',
        listRule: readRule,
        viewRule: readRule,
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'superadmin'",
        fields: [
          { name: 'reseller', type: 'relation', collectionId: resellers.id, required: true, maxSelect: 1 },
          { name: 'return_ref', type: 'relation', collectionId: returns.id, required: true, maxSelect: 1 },
          { name: 'operator', type: 'relation', collectionId: users.id, maxSelect: 1 },
          {
            name: 'method',
            type: 'select',
            values: ['pix', 'cash', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
            maxSelect: 1,
            required: true,
          },
          { name: 'amount', type: 'number', min: 0, required: true },
          { name: 'notes', type: 'text' },
          { name: 'paid_at', type: 'date', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_reseller_settlement_payments_reseller ON reseller_settlement_payments (reseller)',
          'CREATE INDEX idx_reseller_settlement_payments_return ON reseller_settlement_payments (return_ref)',
        ],
      })
      app.save(payments)
    }
  },
  (app) => {
    try {
      const payments = app.findCollectionByNameOrId('reseller_settlement_payments')
      app.delete(payments)
    } catch (_) {}
    try {
      const sales = app.findCollectionByNameOrId('reseller_sales')
      if (sales.fields.getByName('settlement_return')) {
        sales.fields.removeByName('settlement_return')
        app.save(sales)
      }
      const returns = app.findCollectionByNameOrId('reseller_returns')
      ;['total_financial_due', 'total_paid', 'balance_due', 'financial_status'].forEach((name) => {
        if (returns.fields.getByName(name)) returns.fields.removeByName(name)
      })
      app.save(returns)
    } catch (_) {}
  },
)
