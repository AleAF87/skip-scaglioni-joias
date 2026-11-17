// Hook for atomic sale completion and inventory deduction
routerAdd(
  'POST',
  '/backend/v1/sales/checkout',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, { error: 'Apenas administradores e operadores podem concluir vendas.' })
    }

    const body = e.requestInfo().body || {}
    const { customer_id, items, discount = 0, payment_method, installments = 1, sale_id } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'O carrinho está vazio.' })
    }

    if (!payment_method) {
      return e.json(400, { error: 'Forma de pagamento é obrigatória.' })
    }

    let finalSaleRecord = null

    try {
      $app.runInTransaction((txApp) => {
        let subtotal = 0

        // 1. Verify stock and lock/update items per origin
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const productId = item.product_id
          const qtyToBuy = parseInt(item.quantity, 10)

          if (!productId || isNaN(qtyToBuy) || qtyToBuy <= 0) {
            throw new Error('Item inválido no carrinho.')
          }

          const product = txApp.findRecordById('products', productId)
          const origin = item.stock_origin || 'general'
          const resellerId = item.reseller_id

          // ESTOQUE ÚNICO: só existem duas origens reais — estoque geral (admin/superadmin,
          // inclusive vendas de e-commerce, que descontam do quantity) e posse de revendedora.
          // 'ecommerce' é aceito por compatibilidade e tratado como estoque geral.
          if (origin !== 'general' && origin !== 'ecommerce') {
            // 'reseller'
            if (role !== 'superadmin' && role !== 'admin') {
              throw new Error(
                'Apenas administradores podem vender produtos em posse de revendedora.',
              )
            }
          }

          if (origin === 'reseller') {
            // Localiza saldo da revendedora
            let stockRec = null
            if (resellerId) {
              const list = txApp.findRecordsByFilter(
                'reseller_stock_items',
                "reseller = '" + resellerId + "' && product = '" + productId + "'",
                '',
                1,
                0,
              )
              if (list.length > 0) stockRec = list[0]
            } else {
              // Se não informou reseller_id específico, busca a primeira revendedora com saldo suficiente
              const list = txApp.findRecordsByFilter(
                'reseller_stock_items',
                "product = '" + productId + "' && quantity >= " + qtyToBuy,
                '-quantity',
                1,
                0,
              )
              if (list.length > 0) stockRec = list[0]
            }

            if (!stockRec) {
              throw new Error(
                'Nenhum saldo em revendedora encontrado para o produto: ' +
                  product.getString('description'),
              )
            }

            const curResellerQty = stockRec.getInt('quantity') || 0
            if (curResellerQty < qtyToBuy) {
              throw new Error(
                'Estoque da revendedora insuficiente para: ' +
                  product.getString('description') +
                  ' (Disponível com revendedora: ' +
                  curResellerQty +
                  ', Solicitado: ' +
                  qtyToBuy +
                  ')',
              )
            }

            const newResellerQty = curResellerQty - qtyToBuy
            stockRec.set('quantity', newResellerQty)
            txApp.save(stockRec)

            // Preenche metadados da revendedora no item caso não estivessem
            if (!item.reseller_id) {
              item.reseller_id = stockRec.getString('reseller')
            }
            try {
              if (!item.reseller_name) {
                const rRec = txApp.findRecordById('resellers', item.reseller_id)
                item.reseller_name = rRec.getString('name')
              }
            } catch (_) {}
          } else {
            // Default: 'general' (estoque físico da loja)
            const currentQty = product.getInt('quantity') || 0

            if (currentQty < qtyToBuy) {
              throw new Error(
                'Estoque insuficiente para o produto: ' +
                  product.getString('description') +
                  ' (Disponível: ' +
                  currentQty +
                  ', Solicitado: ' +
                  qtyToBuy +
                  ')',
              )
            }

            const newQty = currentQty - qtyToBuy
            product.set('quantity', newQty)
            if (newQty === 0) {
              product.set('status', 'unavailable')
            }
            txApp.save(product)
          }

          const unitPrice = parseFloat(item.unit_price) || product.getFloat('selling_price')
          subtotal += unitPrice * qtyToBuy
        }

        const numDiscount = Math.max(0, parseFloat(discount) || 0)
        const total = Math.max(0, subtotal - numDiscount)
        const numInstallments = Math.max(1, parseInt(installments, 10) || 1)
        const installmentValue = Math.round((total / numInstallments) * 100) / 100

        // 2. Generate unique sale code
        const timestamp = new Date().getTime().toString().slice(-6)
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
        const saleCode = 'VND-' + timestamp + '-' + randomSuffix

        const salesCol = txApp.findCollectionByNameOrId('sales')
        let saleRec

        if (sale_id) {
          // Resume pending sale if id provided
          try {
            saleRec = txApp.findRecordById('sales', sale_id)
          } catch (_) {
            saleRec = new Record(salesCol)
          }
        } else {
          saleRec = new Record(salesCol)
        }

        saleRec.set('code', saleRec.getString('code') || saleCode)
        if (customer_id) saleRec.set('customer', customer_id)
        saleRec.set('status', 'completed')
        saleRec.set('items', JSON.stringify(items))
        saleRec.set('subtotal', subtotal)
        saleRec.set('discount', numDiscount)
        saleRec.set('total', total)
        saleRec.set('payment_method', payment_method)
        saleRec.set('installments', numInstallments)
        saleRec.set('installment_value', installmentValue)
        saleRec.set('operator', authUser.id)

        txApp.save(saleRec)
        finalSaleRecord = saleRec
      })

      return e.json(200, {
        success: true,
        sale_id: finalSaleRecord.id,
        code: finalSaleRecord.getString('code'),
        total: finalSaleRecord.getFloat('total'),
        subtotal: finalSaleRecord.getFloat('subtotal'),
        payment_method: finalSaleRecord.getString('payment_method'),
        installments: finalSaleRecord.getInt('installments'),
        installment_value: finalSaleRecord.getFloat('installment_value'),
      })
    } catch (err) {
      console.log('Erro no checkout da venda:', err.message)
      return e.json(400, { error: err.message || 'Falha ao processar venda.' })
    }
  },
  $apis.requireAuth(),
)
