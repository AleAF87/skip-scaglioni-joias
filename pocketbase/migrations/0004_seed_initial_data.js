migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Seed Admin user
    let adminUser
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'drcesartadeu@gmail.com')
      adminUser.set('role', 'admin')
      adminUser.set('status', 'active')
      adminUser.set('name', 'Dr. César Tadeu (Admin)')
      adminUser.setVerified(true)
      app.save(adminUser)
    } catch (_) {
      adminUser = new Record(users)
      adminUser.setEmail('drcesartadeu@gmail.com')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Dr. César Tadeu (Admin)')
      adminUser.set('role', 'admin')
      adminUser.set('status', 'active')
      adminUser.set('city', 'São Paulo')
      adminUser.set('state', 'SP')
      app.save(adminUser)
    }

    // 2. Seed Example Operator
    let operatorUser
    try {
      operatorUser = app.findAuthRecordByEmail('_pb_users_auth_', 'operador@scaglionijoias.com.br')
    } catch (_) {
      operatorUser = new Record(users)
      operatorUser.setEmail('operador@scaglionijoias.com.br')
      operatorUser.setPassword('Skip@Pass')
      operatorUser.setVerified(true)
      operatorUser.set('name', 'Mariana Castro (Operadora)')
      operatorUser.set('role', 'operator')
      operatorUser.set('status', 'active')
      operatorUser.set('city', 'São Paulo')
      operatorUser.set('state', 'SP')
      app.save(operatorUser)
    }

    // 3. Seed Example Reseller User
    let resellerUser
    try {
      resellerUser = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'revendedora@scaglionijoias.com.br',
      )
    } catch (_) {
      resellerUser = new Record(users)
      resellerUser.setEmail('revendedora@scaglionijoias.com.br')
      resellerUser.setPassword('Skip@Pass')
      resellerUser.setVerified(true)
      resellerUser.set('name', 'Camila Silveira (Revendedora)')
      resellerUser.set('role', 'reseller')
      resellerUser.set('status', 'active')
      resellerUser.set('phone', '(11) 98765-4321')
      resellerUser.set('document', '123.456.789-00')
      resellerUser.set('city', 'Campinas')
      resellerUser.set('state', 'SP')
      app.save(resellerUser)
    }

    // 4. Auxiliary records: Types
    const productTypes = app.findCollectionByNameOrId('product_types')
    const defaultTypes = ['Anel', 'Brinco', 'Colar', 'Pulseira', 'Gargantilha', 'Pingente']
    const typeMap = {}
    defaultTypes.forEach((tName) => {
      try {
        const rec = app.findFirstRecordByData('product_types', 'name', tName)
        typeMap[tName] = rec.id
      } catch (_) {
        const rec = new Record(productTypes)
        rec.set('name', tName)
        app.save(rec)
        typeMap[tName] = rec.id
      }
    })

    // 5. Auxiliary records: Materials
    const productMaterials = app.findCollectionByNameOrId('product_materials')
    const defaultMaterials = [
      'Ouro 18k',
      'Prata 925',
      'Folheado a Ouro',
      'Ouro Branco 18k',
      'Aço Cirúrgico',
    ]
    const materialMap = {}
    defaultMaterials.forEach((mName) => {
      try {
        const rec = app.findFirstRecordByData('product_materials', 'name', mName)
        materialMap[mName] = rec.id
      } catch (_) {
        const rec = new Record(productMaterials)
        rec.set('name', mName)
        app.save(rec)
        materialMap[mName] = rec.id
      }
    })

    // 6. Auxiliary records: Sizes
    const productSizes = app.findCollectionByNameOrId('product_sizes')
    const defaultSizes = [
      'Único',
      '14',
      '16',
      '18',
      '20',
      '22',
      'P',
      'M',
      'G',
      '45cm',
      '50cm',
      '60cm',
    ]
    const sizeMap = {}
    defaultSizes.forEach((sName) => {
      try {
        const rec = app.findFirstRecordByData('product_sizes', 'name', sName)
        sizeMap[sName] = rec.id
      } catch (_) {
        const rec = new Record(productSizes)
        rec.set('name', sName)
        app.save(rec)
        sizeMap[sName] = rec.id
      }
    })

    // 7. Settings seed
    const settings = app.findCollectionByNameOrId('settings')
    try {
      const existingSettings = app.findRecordsByFilter('settings', '', '', 1, 0)
      if (!existingSettings || existingSettings.length === 0) {
        const setRec = new Record(settings)
        setRec.set('min_stock_alert', 5)
        app.save(setRec)
      }
    } catch (_) {}

    // 8. Reseller record
    const resellers = app.findCollectionByNameOrId('resellers')
    let resellerRecord
    try {
      resellerRecord = app.findFirstRecordByData(
        'resellers',
        'email',
        'revendedora@scaglionijoias.com.br',
      )
    } catch (_) {
      resellerRecord = new Record(resellers)
      resellerRecord.set('user', resellerUser.id)
      resellerRecord.set('name', 'Camila Silveira')
      resellerRecord.set('email', 'revendedora@scaglionijoias.com.br')
      resellerRecord.set('phone', '(11) 98765-4321')
      resellerRecord.set('document', '123.456.789-00')
      resellerRecord.set('city', 'Campinas')
      resellerRecord.set('state', 'SP')
      resellerRecord.set('status', 'active')
      app.save(resellerRecord)
    }

    // 9. Customers seed
    const customers = app.findCollectionByNameOrId('customers')
    let sampleCustomer
    try {
      sampleCustomer = app.findFirstRecordByData('customers', 'name', 'Patrícia Albuquerque')
    } catch (_) {
      sampleCustomer = new Record(customers)
      sampleCustomer.set('name', 'Patrícia Albuquerque')
      sampleCustomer.set('phone', '(11) 99123-8877')
      sampleCustomer.set('email', 'patricia.albuquerque@gmail.com')
      sampleCustomer.set('city', 'São Paulo')
      sampleCustomer.set('state', 'SP')
      sampleCustomer.set('notes', 'Cliente VIP, prefere peças em ouro 18k.')
      app.save(sampleCustomer)
    }

    // 10. Sample Products seed (5 realistic products)
    const products = app.findCollectionByNameOrId('products')
    const sampleProducts = [
      {
        code: 'JOIA-1001',
        description: 'Anel de ouro 18k com zircônia',
        type: typeMap['Anel'],
        target_audience: 'feminino',
        material: materialMap['Ouro 18k'],
        size: sizeMap['16'],
        entry_date: '2025-01-15 10:00:00.000Z',
        invested_value: 450.0,
        selling_price: 1250.0,
        quantity: 8,
        minimum_quantity: 3,
        observations: 'Acabamento polido espelhado, cravação em quatro garras reforçada.',
        status: 'available',
      },
      {
        code: 'JOIA-1002',
        description: 'Brinco folheado a ouro, feminino, tamanho único',
        type: typeMap['Brinco'],
        target_audience: 'feminino',
        material: materialMap['Folheado a Ouro'],
        size: sizeMap['Único'],
        entry_date: '2025-02-01 10:00:00.000Z',
        invested_value: 20.0,
        selling_price: 60.0,
        quantity: 25,
        minimum_quantity: 5,
        observations: 'Banho de 10 milésimos, camada antialérgica de verniz suíço.',
        status: 'available',
      },
      {
        code: 'JOIA-1003',
        description: 'Colar de prata 925 com pingente de coração',
        type: typeMap['Colar'],
        target_audience: 'feminino',
        material: materialMap['Prata 925'],
        size: sizeMap['45cm'],
        entry_date: '2025-02-10 10:00:00.000Z',
        invested_value: 95.0,
        selling_price: 240.0,
        quantity: 14,
        minimum_quantity: 4,
        observations: 'Corrente veneziana diamantada de 45cm com fecho boia.',
        status: 'available',
      },
      {
        code: 'JOIA-1004',
        description: 'Pulseira de ouro 18k, unissex',
        type: typeMap['Pulseira'],
        target_audience: 'unissex',
        material: materialMap['Ouro 18k'],
        size: sizeMap['20'],
        entry_date: '2025-02-15 10:00:00.000Z',
        invested_value: 890.0,
        selling_price: 2600.0,
        quantity: 4,
        minimum_quantity: 2,
        observations: 'Malha elo português com fecho gaveta de dupla trava.',
        status: 'available',
      },
      {
        code: 'JOIA-1005',
        description: 'Gargantilha folheada a ouro com cristais',
        type: typeMap['Gargantilha'],
        target_audience: 'feminino',
        material: materialMap['Folheado a Ouro'],
        size: sizeMap['50cm'],
        entry_date: '2025-02-20 10:00:00.000Z',
        invested_value: 55.0,
        selling_price: 180.0,
        quantity: 12,
        minimum_quantity: 5,
        observations: 'Choker elegante com cristais austríacos facetados.',
        status: 'available',
      },
    ]

    const seededProductIds = []
    sampleProducts.forEach((prodData) => {
      try {
        const existing = app.findFirstRecordByData('products', 'code', prodData.code)
        seededProductIds.push(existing.id)
      } catch (_) {
        const rec = new Record(products)
        Object.keys(prodData).forEach((k) => {
          if (prodData[k] !== undefined) rec.set(k, prodData[k])
        })
        app.save(rec)
        seededProductIds.push(rec.id)
      }
    })

    // 11. Sample Consignment List seed
    const consignmentLists = app.findCollectionByNameOrId('consignment_lists')
    try {
      app.findFirstRecordByData('consignment_lists', 'code', 'CONS-2025-001')
    } catch (_) {
      const cList = new Record(consignmentLists)
      cList.set('code', 'CONS-2025-001')
      cList.set('reseller', resellerRecord.id)
      cList.set('status', 'accepted')
      cList.set('valid_until', '2025-04-30 23:59:59.000Z')
      cList.set('operator', adminUser.id)
      cList.set(
        'items',
        JSON.stringify([
          {
            product_id: seededProductIds[1] || '',
            code: 'JOIA-1002',
            description: 'Brinco folheado a ouro, feminino, tamanho único',
            quantity: 5,
            selling_price: 60.0,
            sold: 0,
            returned: 0,
          },
          {
            product_id: seededProductIds[4] || '',
            code: 'JOIA-1005',
            description: 'Gargantilha folheada a ouro com cristais',
            quantity: 3,
            selling_price: 180.0,
            sold: 0,
            returned: 0,
          },
        ]),
      )
      app.save(cList)
    }

    // 12. Sample Sale seed
    const sales = app.findCollectionByNameOrId('sales')
    try {
      app.findFirstRecordByData('sales', 'code', 'VENDA-2025-001')
    } catch (_) {
      const sale = new Record(sales)
      sale.set('code', 'VENDA-2025-001')
      sale.set('customer', sampleCustomer.id)
      sale.set('status', 'completed')
      sale.set('subtotal', 1250.0)
      sale.set('discount', 50.0)
      sale.set('total', 1200.0)
      sale.set('payment_method', 'credit_card')
      sale.set('installments', 6)
      sale.set('installment_value', 200.0)
      sale.set('operator', adminUser.id)
      sale.set(
        'items',
        JSON.stringify([
          {
            product_id: seededProductIds[0] || '',
            code: 'JOIA-1001',
            description: 'Anel de ouro 18k com zircônia',
            quantity: 1,
            unit_price: 1250.0,
            total: 1250.0,
          },
        ]),
      )
      app.save(sale)
    }
  },
  (app) => {
    // down
  },
)
