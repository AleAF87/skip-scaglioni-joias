migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const resellers = app.findCollectionByNameOrId('resellers')
    const settings = app.findCollectionByNameOrId('settings')
    const consignmentLists = app.findCollectionByNameOrId('consignment_lists')

    // 1. Expand settings with company data
    const settingsFields = [
      { name: 'company_legal_name', type: 'text' },
      { name: 'company_trade_name', type: 'text' },
      { name: 'company_cnpj', type: 'text' },
      { name: 'company_address_street', type: 'text' },
      { name: 'company_address_number', type: 'text' },
      { name: 'company_address_complement', type: 'text' },
      { name: 'company_address_neighborhood', type: 'text' },
      { name: 'company_address_city', type: 'text' },
      { name: 'company_address_state', type: 'text' },
      { name: 'company_address_zip', type: 'text' },
      { name: 'company_email', type: 'text' },
      { name: 'company_phone', type: 'text' },
      { name: 'forum_city', type: 'text' },
      { name: 'forum_state', type: 'text' },
      { name: 'contract_version', type: 'text' },
    ]

    settingsFields.forEach((f) => {
      if (!settings.fields.getByName(f.name)) {
        settings.fields.add(new TextField({ name: f.name }))
      }
    })
    app.save(settings)

    // 2. Expand resellers with birth date and full address
    const resellerNewFields = [
      { name: 'birth_date', type: 'text' },
      { name: 'address_street', type: 'text' },
      { name: 'address_number', type: 'text' },
      { name: 'address_complement', type: 'text' },
      { name: 'address_neighborhood', type: 'text' },
      { name: 'address_zip', type: 'text' },
    ]

    resellerNewFields.forEach((f) => {
      if (!resellers.fields.getByName(f.name)) {
        resellers.fields.add(new TextField({ name: f.name }))
      }
    })
    app.save(resellers)

    // 3. Expand users auth collection with the same fields
    const usersNewFields = [
      { name: 'birth_date', type: 'text' },
      { name: 'address_street', type: 'text' },
      { name: 'address_number', type: 'text' },
      { name: 'address_complement', type: 'text' },
      { name: 'address_neighborhood', type: 'text' },
      { name: 'address_zip', type: 'text' },
    ]

    usersNewFields.forEach((f) => {
      if (!users.fields.getByName(f.name)) {
        users.fields.add(new TextField({ name: f.name }))
      }
    })
    app.save(users)

    // 4. Update consignment_lists status select values to include pending_signature, cancelled
    // Note: consignment_lists values were ['pending', 'accepted', 'in_progress', 'closed', 'rejected']
    // We add 'pending_signature', 'open', 'cancelled'
    const statusField = consignmentLists.fields.getByName('status')
    if (statusField) {
      statusField.values = [
        'pending_signature',
        'pending',
        'accepted',
        'open',
        'in_progress',
        'closed',
        'rejected',
        'cancelled',
      ]
      statusField.maxSelect = 1
    }

    // Add extra tracking fields on consignment_lists
    if (!consignmentLists.fields.getByName('created_ip')) {
      consignmentLists.fields.add(new TextField({ name: 'created_ip' }))
    }
    if (!consignmentLists.fields.getByName('financial_due_date')) {
      consignmentLists.fields.add(new DateField({ name: 'financial_due_date' }))
    }
    if (!consignmentLists.fields.getByName('return_due_date')) {
      consignmentLists.fields.add(new DateField({ name: 'return_due_date' }))
    }
    if (!consignmentLists.fields.getByName('notes')) {
      consignmentLists.fields.add(new TextField({ name: 'notes' }))
    }
    if (!consignmentLists.fields.getByName('cancellation_reason')) {
      consignmentLists.fields.add(new TextField({ name: 'cancellation_reason' }))
    }
    if (!consignmentLists.fields.getByName('cancelled_at')) {
      consignmentLists.fields.add(new DateField({ name: 'cancelled_at' }))
    }
    if (!consignmentLists.fields.getByName('cancelled_by')) {
      consignmentLists.fields.add(
        new RelationField({
          name: 'cancelled_by',
          collectionId: users.id,
          maxSelect: 1,
        }),
      )
    }
    app.save(consignmentLists)

    // 5. Create collection consignment_documents
    try {
      app.findCollectionByNameOrId('consignment_documents')
    } catch (_) {
      const consignmentDocs = new Collection({
        name: 'consignment_documents',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator' || reseller.user = @request.auth.id)",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operator')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'consignment_list',
            type: 'relation',
            collectionId: consignmentLists.id,
            required: true,
            maxSelect: 1,
          },
          {
            name: 'reseller',
            type: 'relation',
            collectionId: resellers.id,
            required: true,
            maxSelect: 1,
          },
          { name: 'document_code', type: 'text', required: true },
          { name: 'contract_version', type: 'text', required: true },
          { name: 'status', type: 'text', required: true }, // 'pending_signature' | 'signed' | 'closed' | 'cancelled'
          { name: 'document_hash', type: 'text' },
          { name: 'session_id', type: 'text' },
          { name: 'signer_name', type: 'text' },
          { name: 'signer_document', type: 'text' },
          { name: 'signed_at', type: 'date' },
          { name: 'signed_ip', type: 'text' },
          { name: 'creator_ip', type: 'text' },
          {
            name: 'created_by',
            type: 'relation',
            collectionId: users.id,
            maxSelect: 1,
          },
          { name: 'signature_image_data', type: 'text' },
          { name: 'snapshot_data', type: 'json' }, // complete immutable snapshot of company, reseller, list, products, totals
          {
            name: 'pdf_file',
            type: 'file',
            maxSelect: 1,
            maxSize: 15728640,
            mimeTypes: ['application/pdf'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_consignment_docs_list ON consignment_documents (consignment_list)',
          'CREATE INDEX idx_consignment_docs_reseller ON consignment_documents (reseller)',
          'CREATE INDEX idx_consignment_docs_hash ON consignment_documents (document_hash)',
        ],
      })
      app.save(consignmentDocs)
    }

    // 6. Set initial default company info if not set
    try {
      const records = app.findRecordsByFilter('settings', '', '', 1, 0)
      if (records && records.length > 0) {
        const s = records[0]
        if (!s.getString('company_trade_name')) {
          s.set('company_trade_name', 'Scaglioni Joias')
        }
        if (!s.getString('contract_version')) {
          s.set('contract_version', '1.0')
        }
        app.save(s)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const cd = app.findCollectionByNameOrId('consignment_documents')
      app.delete(cd)
    } catch (_) {}
  },
)
