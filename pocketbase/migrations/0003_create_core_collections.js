migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const productTypes = app.findCollectionByNameOrId('product_types')
    const productMaterials = app.findCollectionByNameOrId('product_materials')
    const productSizes = app.findCollectionByNameOrId('product_sizes')
    const customers = app.findCollectionByNameOrId('customers')

    // Products collection
    const products = new Collection({
      name: 'products',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'code', type: 'text', required: true },
        { name: 'description', type: 'text', required: true },
        { name: 'type', type: 'relation', collectionId: productTypes.id, maxSelect: 1 },
        {
          name: 'target_audience',
          type: 'select',
          values: ['feminino', 'masculino', 'unissex'],
          maxSelect: 1,
        },
        { name: 'material', type: 'relation', collectionId: productMaterials.id, maxSelect: 1 },
        { name: 'size', type: 'relation', collectionId: productSizes.id, maxSelect: 1 },
        { name: 'entry_date', type: 'date' },
        { name: 'invested_value', type: 'number', min: 0 },
        { name: 'selling_price', type: 'number', min: 0, required: true },
        { name: 'quantity', type: 'number', onlyInt: true, min: 0, required: true },
        { name: 'minimum_quantity', type: 'number', onlyInt: true, min: 0 },
        { name: 'observations', type: 'text' },
        {
          name: 'photos',
          type: 'file',
          maxSelect: 5,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
        { name: 'status', type: 'select', values: ['available', 'unavailable'], maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_products_code ON products (code)',
        'CREATE INDEX idx_products_type ON products (type)',
        'CREATE INDEX idx_products_material ON products (material)',
        'CREATE INDEX idx_products_status ON products (status)',
        'CREATE INDEX idx_products_quantity ON products (quantity)',
      ],
    })
    app.save(products)

    // Resellers collection
    const resellers = new Collection({
      name: 'resellers',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || user = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || user = @request.auth.id)",
      createRule: "@request.auth.id != ''", // logged in user or admin can register
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || user = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'text' },
        { name: 'document', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'state', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'active', 'rejected', 'disabled'],
          maxSelect: 1,
        },
        { name: 'attachments', type: 'file', maxSelect: 5, maxSize: 10485760 },
        { name: 'rejection_reason', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_resellers_email ON resellers (email)',
        'CREATE INDEX idx_resellers_status ON resellers (status)',
      ],
    })
    app.save(resellers)

    // Sales collection
    const sales = new Collection({
      name: 'sales',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'code', type: 'text', required: true },
        { name: 'customer', type: 'relation', collectionId: customers.id, maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'completed', 'cancelled'],
          maxSelect: 1,
        },
        { name: 'items', type: 'json', required: true },
        { name: 'subtotal', type: 'number', min: 0 },
        { name: 'discount', type: 'number', min: 0 },
        { name: 'total', type: 'number', min: 0 },
        {
          name: 'payment_method',
          type: 'select',
          values: ['pix', 'cash', 'credit_card', 'debit_card'],
          maxSelect: 1,
        },
        { name: 'installments', type: 'number', onlyInt: true, min: 1, max: 12 },
        { name: 'installment_value', type: 'number', min: 0 },
        { name: 'operator', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_sales_code ON sales (code)',
        'CREATE INDEX idx_sales_status ON sales (status)',
        'CREATE INDEX idx_sales_operator ON sales (operator)',
      ],
    })
    app.save(sales)

    // Consignment Lists collection
    const consignmentLists = new Collection({
      name: 'consignment_lists',
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
        { name: 'code', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'accepted', 'in_progress', 'closed', 'rejected'],
          maxSelect: 1,
        },
        { name: 'items', type: 'json', required: true },
        { name: 'valid_until', type: 'date' },
        { name: 'operator', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_consignment_lists_code ON consignment_lists (code)',
        'CREATE INDEX idx_consignment_lists_reseller ON consignment_lists (reseller)',
        'CREATE INDEX idx_consignment_lists_status ON consignment_lists (status)',
      ],
    })
    app.save(consignmentLists)
  },
  (app) => {
    ;['consignment_lists', 'sales', 'resellers', 'products'].forEach((name) => {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    })
  },
)
