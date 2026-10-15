migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const resellers = app.findCollectionByNameOrId('resellers')
    const products = app.findCollectionByNameOrId('products')

    // 1. reseller_stock_items
    // Saldo atual de estoque em poder da revendedora
    const resellerStockItems = new Collection({
      name: 'reseller_stock_items',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'reseller',
          type: 'relation',
          collectionId: resellers.id,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'product',
          type: 'relation',
          collectionId: products.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'quantity', type: 'number', onlyInt: true, min: 0, required: true },
        { name: 'selling_price', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_reseller_product ON reseller_stock_items (reseller, product)',
        'CREATE INDEX idx_reseller_stock_reseller ON reseller_stock_items (reseller)',
      ],
    })
    app.save(resellerStockItems)

    // 2. reseller_deliveries
    // Registros de entrega de jóias (sai do estoque geral -> estoque revendedora)
    const resellerDeliveries = new Collection({
      name: 'reseller_deliveries',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'code', type: 'text', required: true },
        {
          name: 'reseller',
          type: 'relation',
          collectionId: resellers.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'operator', type: 'relation', collectionId: users.id, maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['pending_signature', 'accepted', 'cancelled'],
          maxSelect: 1,
          required: true,
        },
        { name: 'items', type: 'json', required: true },
        { name: 'total_items_count', type: 'number', onlyInt: true, min: 0 },
        { name: 'total_value', type: 'number', min: 0 },
        { name: 'notes', type: 'text' },
        {
          name: 'signature_image',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        },
        { name: 'signature_data', type: 'text' }, // base64 fallback or data url
        { name: 'signed_at', type: 'date' },
        { name: 'signer_name', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_reseller_deliveries_code ON reseller_deliveries (code)',
        'CREATE INDEX idx_reseller_deliveries_reseller ON reseller_deliveries (reseller)',
        'CREATE INDEX idx_reseller_deliveries_status ON reseller_deliveries (status)',
      ],
    })
    app.save(resellerDeliveries)

    // 3. reseller_sales
    // Vendas feitas pelo PDV da própria revendedora com jóias do estoque dela
    const resellerSales = new Collection({
      name: 'reseller_sales',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'code', type: 'text', required: true },
        {
          name: 'reseller',
          type: 'relation',
          collectionId: resellers.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'customer_name', type: 'text' },
        { name: 'customer_phone', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['completed', 'cancelled'],
          maxSelect: 1,
          required: true,
        },
        { name: 'items', type: 'json', required: true },
        { name: 'subtotal', type: 'number', min: 0 },
        { name: 'discount', type: 'number', min: 0 },
        { name: 'total', type: 'number', min: 0 },
        { name: 'commission_rate', type: 'number', min: 0, max: 100 },
        { name: 'reseller_profit', type: 'number', min: 0 }, // Lucro da vendedora
        { name: 'scaglioni_due', type: 'number', min: 0 }, // Valor a repassar à Scaglioni
        {
          name: 'payment_method',
          type: 'select',
          values: ['pix', 'cash', 'credit_card', 'debit_card'],
          maxSelect: 1,
          required: true,
        },
        { name: 'installments', type: 'number', onlyInt: true, min: 1, max: 12 },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_reseller_sales_code ON reseller_sales (code)',
        'CREATE INDEX idx_reseller_sales_reseller ON reseller_sales (reseller)',
        'CREATE INDEX idx_reseller_sales_status ON reseller_sales (status)',
      ],
    })
    app.save(resellerSales)

    // 4. reseller_returns
    // Conferência e devolução das jóias em poder da vendedora
    const resellerReturns = new Collection({
      name: 'reseller_returns',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'code', type: 'text', required: true },
        {
          name: 'reseller',
          type: 'relation',
          collectionId: resellers.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'operator', type: 'relation', collectionId: users.id, maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['completed', 'cancelled'],
          maxSelect: 1,
          required: true,
        },
        { name: 'items', type: 'json', required: true },
        { name: 'total_returned_qty', type: 'number', onlyInt: true, min: 0 },
        { name: 'total_pending_qty', type: 'number', onlyInt: true, min: 0 },
        { name: 'total_pending_value_due', type: 'number', min: 0 },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_reseller_returns_code ON reseller_returns (code)',
        'CREATE INDEX idx_reseller_returns_reseller ON reseller_returns (reseller)',
      ],
    })
    app.save(resellerReturns)

    // 5. reseller_issues
    // Pendências classificadas: extraviada | venda_avulsa_sem_pdv | outros
    const resellerIssues = new Collection({
      name: 'reseller_issues',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'reseller',
          type: 'relation',
          collectionId: resellers.id,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'product',
          type: 'relation',
          collectionId: products.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'return_ref', type: 'relation', collectionId: resellerReturns.id, maxSelect: 1 },
        { name: 'quantity', type: 'number', onlyInt: true, min: 1, required: true },
        {
          name: 'reason',
          type: 'select',
          values: ['extraviada', 'venda_avulsa_sem_pdv', 'outros'],
          maxSelect: 1,
          required: true,
        },
        { name: 'unit_selling_price', type: 'number', min: 0 },
        { name: 'commission_rate', type: 'number', min: 0, max: 100 },
        { name: 'scaglioni_due_total', type: 'number', min: 0, required: true },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'paid', 'forgiven'],
          maxSelect: 1,
          required: true,
        },
        { name: 'paid_at', type: 'date' },
        { name: 'paid_notes', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_reseller_issues_reseller ON reseller_issues (reseller)',
        'CREATE INDEX idx_reseller_issues_status ON reseller_issues (status)',
      ],
    })
    app.save(resellerIssues)
  },
  (app) => {
    ;[
      'reseller_issues',
      'reseller_returns',
      'reseller_sales',
      'reseller_deliveries',
      'reseller_stock_items',
    ].forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    })
  },
)
