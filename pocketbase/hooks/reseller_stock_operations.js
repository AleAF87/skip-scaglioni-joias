// Hook para operações transacionais do Módulo de Estoque Próprio da Revendedora
// Inclui:
// 1. POST /backend/v1/reseller-stock/delivery
//    Cria entrega, baixa do estoque geral de produtos, credita no estoque individual da revendedora e registra assinatura se fornecida.
// 2. POST /backend/v1/reseller-stock/sign-delivery
//    Registra a assinatura de uma entrega pendente.
// 3. POST /backend/v1/reseller-stock/pos-sale
//    Venda realizada no PDV exclusivo da revendedora (baixa do estoque dela, calcula comissão dela e valor Scaglioni).
// 4. POST /backend/v1/reseller-stock/return
//    Conferência e devolução de jóias do estoque da revendedora (devolve para estoque geral, remove do estoque dela e cria pendências classificadas).
// 5. POST /backend/v1/reseller-stock/resolve-issue
//    Quitação ou perdão de pendência financeira.

// 1. ENTREGA DE JÓIAS PARA A REVENDEDORA
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/delivery',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, {
        error: 'Apenas operadores ou administradores podem despachar entregas.',
      })
    }

    const body = e.requestInfo().body || {}
    const { reseller_id, items, notes, signature_data, signer_name } = body

    if (!reseller_id) {
      return e.json(400, { error: 'Selecione a revendedora.' })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Adicione pelo menos uma joia para entrega.' })
    }

    let finalDeliveryRecord = null

    try {
      $app.runInTransaction((txApp) => {
        // Validação da revendedora
        const reseller = txApp.findRecordById('resellers', reseller_id)
        if (reseller.getString('status') !== 'active') {
          throw new Error('A revendedora selecionada não está com cadastro ativo.')
        }

        const stockCol = txApp.findCollectionByNameOrId('reseller_stock_items')
        const deliveryCol = txApp.findCollectionByNameOrId('reseller_deliveries')

        let totalItemsCount = 0
        let totalValue = 0
        const processedItems = []

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const productId = it.product_id
          const qty = parseInt(it.quantity, 10)

          if (!productId || isNaN(qty) || qty <= 0) {
            throw new Error('Item com quantidade inválida na entrega.')
          }

          const product = txApp.findRecordById('products', productId)
          const generalStock = product.getInt('quantity')

          if (generalStock < qty) {
            throw new Error(
              'Estoque geral insuficiente para o produto: ' +
                product.getString('description') +
                ' (Disponível na loja: ' +
                generalStock +
                ', Solicitado para entrega: ' +
                qty +
                ')',
            )
          }

          // 1. Baixar do estoque geral
          const newGeneralQty = generalStock - qty
          product.set('quantity', newGeneralQty)
          if (newGeneralQty === 0) {
            product.set('status', 'unavailable')
          }
          txApp.save(product)

          // 2. Creditar no estoque da revendedora (upsert)
          let stockRecord = null
          const existingStockList = txApp.findRecordsByFilter(
            'reseller_stock_items',
            "reseller = '" + reseller_id + "' && product = '" + productId + "'",
            '',
            1,
            0,
          )

          const sellingPrice = parseFloat(it.selling_price) || product.getFloat('selling_price')

          if (existingStockList.length > 0) {
            stockRecord = existingStockList[0]
            const curQty = stockRecord.getInt('quantity')
            stockRecord.set('quantity', curQty + qty)
            stockRecord.set('selling_price', sellingPrice)
          } else {
            stockRecord = new Record(stockCol)
            stockRecord.set('reseller', reseller_id)
            stockRecord.set('product', productId)
            stockRecord.set('quantity', qty)
            stockRecord.set('selling_price', sellingPrice)
          }
          txApp.save(stockRecord)

          totalItemsCount += qty
          totalValue += sellingPrice * qty

          processedItems.push({
            product_id: productId,
            code: product.getString('code'),
            description: product.getString('description'),
            quantity: qty,
            selling_price: sellingPrice,
            subtotal: sellingPrice * qty,
          })
        }

        // Código sequencial curto da entrega (ENT-0001, ENT-0002…) via app_sequences (atômico).
        // Entregas antigas (formato ENT-NNNNNN-NNNN) não são alteradas.
        let deliveryCode = ''
        try {
          const pad4 = (n) => {
            let s = String(n)
            while (s.length < 4) s = '0' + s
            return s
          }
          let seqRec = null
          try {
            seqRec = txApp.findFirstRecordByFilter(
              'app_sequences',
              "name = 'reseller_delivery_seq'",
            )
          } catch (_) {}
          let nextVal = 1
          if (seqRec) {
            nextVal = (seqRec.getInt('current_value') || 0) + 1
            seqRec.set('current_value', nextVal)
            txApp.save(seqRec)
          } else {
            const seqCol = txApp.findCollectionByNameOrId('app_sequences')
            const newSeqRec = new Record(seqCol)
            newSeqRec.set('name', 'reseller_delivery_seq')
            newSeqRec.set('current_value', nextVal)
            txApp.save(newSeqRec)
          }
          deliveryCode = 'ENT-' + pad4(nextVal)
        } catch (seqErr) {
          console.log('Erro na sequência ENT, usando fallback por timestamp:', seqErr.message)
          const tsFallback = new Date().getTime().toString().slice(-6)
          const randFallback = Math.floor(1000 + Math.random() * 9000).toString()
          deliveryCode = 'ENT-' + tsFallback + '-' + randFallback
        }

        const deliveryRec = new Record(deliveryCol)
        deliveryRec.set('code', deliveryCode)
        deliveryRec.set('reseller', reseller_id)
        deliveryRec.set('operator', authUser.id)
        deliveryRec.set('items', JSON.stringify(processedItems))
        deliveryRec.set('total_items_count', totalItemsCount)
        deliveryRec.set('total_value', totalValue)
        deliveryRec.set('notes', notes || '')

        if (signature_data) {
          deliveryRec.set('status', 'accepted')
          deliveryRec.set('signature_data', signature_data)
          deliveryRec.set('signed_at', new Date().toISOString())
          deliveryRec.set('signer_name', signer_name || reseller.getString('name'))
        } else {
          deliveryRec.set('status', 'pending_signature')
        }

        txApp.save(deliveryRec)
        finalDeliveryRecord = deliveryRec
      })

      return e.json(200, {
        success: true,
        delivery_id: finalDeliveryRecord.id,
        code: finalDeliveryRecord.getString('code'),
        status: finalDeliveryRecord.getString('status'),
        total_items_count: finalDeliveryRecord.getInt('total_items_count'),
        total_value: finalDeliveryRecord.getFloat('total_value'),
      })
    } catch (err) {
      console.log('Erro ao registrar entrega:', err.message)
      return e.json(400, { error: err.message || 'Falha ao processar entrega para revendedora.' })
    }
  },
  $apis.requireAuth(),
)

// 2. ASSINATURA DE ENTREGA (TOUCH/CANVAS)
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/sign-delivery',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const { delivery_id, signature_data, signer_name } = body

    if (!delivery_id) {
      return e.json(400, { error: 'ID da entrega é obrigatório.' })
    }
    if (!signature_data) {
      return e.json(400, { error: 'Assinatura é obrigatória.' })
    }

    try {
      let updatedDelivery = null
      $app.runInTransaction((txApp) => {
        const delivery = txApp.findRecordById('reseller_deliveries', delivery_id)
        const resellerId = delivery.getString('reseller')
        const reseller = txApp.findRecordById('resellers', resellerId)

        // Verificação de permissão: admin, operador ou a própria revendedora
        const role = authUser.getString('role')
        const resellerUserId = reseller.getString('user')
        const isOwner = resellerUserId === authUser.id

        if (role !== 'superadmin' && role !== 'admin' && role !== 'operator' && !isOwner) {
          throw new Error('Você não tem permissão para assinar esta entrega.')
        }

        delivery.set('status', 'accepted')
        delivery.set('signature_data', signature_data)
        delivery.set('signed_at', new Date().toISOString())
        delivery.set('signer_name', signer_name || reseller.getString('name'))
        txApp.save(delivery)
        updatedDelivery = delivery
      })

      return e.json(200, {
        success: true,
        delivery_id: updatedDelivery.id,
        code: updatedDelivery.getString('code'),
        status: 'accepted',
      })
    } catch (err) {
      console.log('Erro ao assinar entrega:', err.message)
      return e.json(400, { error: err.message || 'Falha ao salvar assinatura da entrega.' })
    }
  },
  $apis.requireAuth(),
)

// 3. PDV DA REVENDEDORA (Venda exclusiva de itens do estoque dela)
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/pos-sale',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const {
      reseller_id,
      customer_name,
      customer_phone,
      customer_id,
      items,
      discount = 0,
      payment_method,
      installments = 1,
      notes,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Carrinho de compras vazio.' })
    }
    if (!payment_method) {
      return e.json(400, { error: 'Informe a forma de pagamento.' })
    }

    let finalSale = null

    try {
      $app.runInTransaction((txApp) => {
        // Obter e validar a revendedora
        let resellerRecord = null
        if (reseller_id) {
          resellerRecord = txApp.findRecordById('resellers', reseller_id)
        } else {
          // Se não enviou reseller_id, tenta localizar pela auth do usuário logado
          const found = txApp.findRecordsByFilter(
            'resellers',
            "user = '" + authUser.id + "'",
            '',
            1,
            0,
          )
          if (found.length === 0) {
            throw new Error('Cadastro de revendedora não vinculado ao seu usuário.')
          }
          resellerRecord = found[0]
        }

        const role = authUser.getString('role')
        const isOwner = resellerRecord.getString('user') === authUser.id
        if (role !== 'superadmin' && role !== 'admin' && role !== 'operator' && !isOwner) {
          throw new Error('Você não tem permissão para lançar vendas para esta revendedora.')
        }

        const actualResellerId = resellerRecord.id
        const commissionRate = resellerRecord.getFloat('commission_rate') || 40 // default 40%

        let subtotal = 0
        const processedItems = []

        // Baixar do estoque individual da revendedora
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const productId = it.product_id
          const qtyToBuy = parseInt(it.quantity, 10)

          if (!productId || isNaN(qtyToBuy) || qtyToBuy <= 0) {
            throw new Error('Item inválido no pedido.')
          }

          const stockList = txApp.findRecordsByFilter(
            'reseller_stock_items',
            "reseller = '" + actualResellerId + "' && product = '" + productId + "'",
            '',
            1,
            0,
          )

          if (stockList.length === 0) {
            throw new Error('O produto não consta no estoque desta revendedora.')
          }

          const stockRec = stockList[0]
          const currentStock = stockRec.getInt('quantity')

          if (currentStock < qtyToBuy) {
            const prod = txApp.findRecordById('products', productId)
            throw new Error(
              'Estoque da revendedora insuficiente para: ' +
                prod.getString('description') +
                ' (Saldo dela: ' +
                currentStock +
                ', Solicitado: ' +
                qtyToBuy +
                ')',
            )
          }

          const newStock = currentStock - qtyToBuy
          stockRec.set('quantity', newStock)
          txApp.save(stockRec)

          const prod = txApp.findRecordById('products', productId)
          const unitPrice =
            parseFloat(it.unit_price) ||
            stockRec.getFloat('selling_price') ||
            prod.getFloat('selling_price')
          const itemTotal = unitPrice * qtyToBuy
          subtotal += itemTotal

          processedItems.push({
            product_id: productId,
            code: prod.getString('code'),
            description: prod.getString('description'),
            quantity: qtyToBuy,
            unit_price: unitPrice,
            total: itemTotal,
          })
        }

        const numDiscount = Math.max(0, parseFloat(discount) || 0)
        const total = Math.max(0, subtotal - numDiscount)

        // Lucro da vendedora e valor devido à Scaglioni
        // Regra do usuário: "toda venda é consignado por enquanto: a parte da vendedora (comissão/lucro) e o valor a repassar à Scaglioni = total - lucro"
        const resellerProfit = Math.round(((total * commissionRate) / 100) * 100) / 100
        const scaglioniDue = Math.round((total - resellerProfit) * 100) / 100

        const timestamp = new Date().getTime().toString().slice(-6)
        const rand = Math.floor(1000 + Math.random() * 9000).toString()
        const saleCode = 'VR-' + timestamp + '-' + rand

        const salesCol = txApp.findCollectionByNameOrId('reseller_sales')
        const saleRec = new Record(salesCol)
        saleRec.set('code', saleCode)
        saleRec.set('reseller', actualResellerId)
        // Vínculo do cliente SEMPRE pelo ID (nunca CPF); ausente = Consumidor Final
        if (customer_id) {
          saleRec.set('customer', customer_id)
        }
        saleRec.set('customer_name', customer_name || '')
        saleRec.set('customer_phone', customer_phone || '')
        saleRec.set('status', 'completed')
        saleRec.set('items', JSON.stringify(processedItems))
        saleRec.set('subtotal', subtotal)
        saleRec.set('discount', numDiscount)
        saleRec.set('total', total)
        saleRec.set('commission_rate', commissionRate)
        saleRec.set('reseller_profit', resellerProfit)
        saleRec.set('scaglioni_due', scaglioniDue)
        saleRec.set('payment_method', payment_method)
        saleRec.set('installments', Math.max(1, parseInt(installments, 10) || 1))
        saleRec.set('notes', notes || '')

        txApp.save(saleRec)
        finalSale = saleRec
      })

      return e.json(200, {
        success: true,
        sale_id: finalSale.id,
        code: finalSale.getString('code'),
        total: finalSale.getFloat('total'),
        reseller_profit: finalSale.getFloat('reseller_profit'),
        scaglioni_due: finalSale.getFloat('scaglioni_due'),
        commission_rate: finalSale.getFloat('commission_rate'),
      })
    } catch (err) {
      console.log('Erro no PDV da revendedora:', err.message)
      return e.json(400, {
        error: err.message || 'Falha ao registrar venda no PDV da revendedora.',
      })
    }
  },
  $apis.requireAuth(),
)

// 4. CONFERÊNCIA E DEVOLUÇÃO DE JÓIAS (Com classificação de pendências)
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/return',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, {
        error: 'Apenas administradores ou operadores podem processar devoluções.',
      })
    }

    const body = e.requestInfo().body || {}
    const { reseller_id, items, notes } = body
    // Comissão escolhida pelo admin/superadmin na hora do fechamento (30% / 35% / 40%).
    // Quando informada, é usada no cálculo deste fechamento e passa a ser a comissão cadastrada da revendedora.
    let overrideCommissionRate = null
    if (
      body.commission_rate !== undefined &&
      body.commission_rate !== null &&
      body.commission_rate !== ''
    ) {
      const parsed = parseFloat(body.commission_rate)
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        overrideCommissionRate = parsed
      }
    }

    if (!reseller_id) {
      return e.json(400, { error: 'Selecione a revendedora.' })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Nenhum item informado para devolução ou conferência.' })
    }

    let finalReturnRec = null

    try {
      $app.runInTransaction((txApp) => {
        const reseller = txApp.findRecordById('resellers', reseller_id)
        // Comissão deste fechamento: a enviada pelo admin/superadmin (override) ou a cadastrada
        const commissionRate = overrideCommissionRate || reseller.getFloat('commission_rate') || 40
        if (
          overrideCommissionRate &&
          reseller.getFloat('commission_rate') !== overrideCommissionRate
        ) {
          reseller.set('commission_rate', overrideCommissionRate)
          txApp.save(reseller)
        }

        const returnsCol = txApp.findCollectionByNameOrId('reseller_returns')
        const issuesCol = txApp.findCollectionByNameOrId('reseller_issues')

        // Código sequencial curto da devolução (DEV-0001, DEV-0002…) via app_sequences (atômico).
        // Devoluções antigas (formato DEV-NNNNNN-NNNN) não são alteradas.
        let returnCode = ''
        try {
          const pad4 = (n) => {
            let s = String(n)
            while (s.length < 4) s = '0' + s
            return s
          }
          let seqRec = null
          try {
            seqRec = txApp.findFirstRecordByFilter('app_sequences', "name = 'reseller_return_seq'")
          } catch (_) {}
          let nextVal = 1
          if (seqRec) {
            nextVal = (seqRec.getInt('current_value') || 0) + 1
            seqRec.set('current_value', nextVal)
            txApp.save(seqRec)
          } else {
            const seqCol = txApp.findCollectionByNameOrId('app_sequences')
            const newSeqRec = new Record(seqCol)
            newSeqRec.set('name', 'reseller_return_seq')
            newSeqRec.set('current_value', nextVal)
            txApp.save(newSeqRec)
          }
          returnCode = 'DEV-' + pad4(nextVal)
        } catch (seqErr) {
          console.log('Erro na sequência DEV, usando fallback por timestamp:', seqErr.message)
          const tsFallback = new Date().getTime().toString().slice(-6)
          const randFallback = Math.floor(1000 + Math.random() * 9000).toString()
          returnCode = 'DEV-' + tsFallback + '-' + randFallback
        }

        // Referência à entrega de origem (código dela, ex. ENT-0001), enviada pelo fluxo de devolução
        let originDeliveryCode = (body.delivery_code || '').toString().trim()
        if (body.delivery_id) {
          try {
            const originDelivery = txApp.findRecordById('reseller_deliveries', body.delivery_id)
            originDeliveryCode = originDelivery.getString('code')
          } catch (_) {}
        }

        let totalReturnedQty = 0
        let totalPendingQty = 0
        let totalPendingValueDue = 0
        const processedItems = []

        // Criar registro de devolução primeiro
        const returnRec = new Record(returnsCol)
        returnRec.set('code', returnCode)
        returnRec.set('reseller', reseller_id)
        returnRec.set('operator', authUser.id)
        returnRec.set('status', 'completed')
        returnRec.set('notes', notes || '')
        if (originDeliveryCode) {
          returnRec.set('delivery_code', originDeliveryCode)
        }

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const productId = it.product_id
          const returnedQty = Math.max(0, parseInt(it.returned_qty, 10) || 0)
          const pendingQty = Math.max(0, parseInt(it.pending_qty, 10) || 0)
          const pendingReason = it.pending_reason || 'extraviada' // 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
          const pendingNotes = it.pending_notes || ''

          if (returnedQty === 0 && pendingQty === 0) {
            continue
          }

          // Consultar saldo da revendedora
          const stockList = txApp.findRecordsByFilter(
            'reseller_stock_items',
            "reseller = '" + reseller_id + "' && product = '" + productId + "'",
            '',
            1,
            0,
          )

          if (stockList.length === 0) {
            throw new Error('Produto não encontrado no estoque da revendedora: ID ' + productId)
          }

          const stockRec = stockList[0]
          const curResellerStock = stockRec.getInt('quantity')
          const totalAccounted = returnedQty + pendingQty

          if (curResellerStock < totalAccounted) {
            const p = txApp.findRecordById('products', productId)
            throw new Error(
              'A soma devolvida (' +
                returnedQty +
                ') + pendente (' +
                pendingQty +
                ') é maior que o saldo em poder da vendedora (' +
                curResellerStock +
                ') para: ' +
                p.getString('description'),
            )
          }

          const product = txApp.findRecordById('products', productId)
          const sellingPrice =
            stockRec.getFloat('selling_price') || product.getFloat('selling_price')

          // 1. Abater do estoque da revendedora
          stockRec.set('quantity', curResellerStock - totalAccounted)
          txApp.save(stockRec)

          // 2. Se houve devolução física, retornar ao estoque geral da loja
          if (returnedQty > 0) {
            const currentGeneral = product.getInt('quantity')
            const newGeneral = currentGeneral + returnedQty
            product.set('quantity', newGeneral)
            if (newGeneral > 0 && product.getString('status') === 'unavailable') {
              product.set('status', 'available')
            }
            txApp.save(product)
            totalReturnedQty += returnedQty
          }

          // 3. Se houve pendência (extraviada / venda avulsa sem PDV / outros), cria pendência a cobrar
          let scaglioniDueForThisItem = 0
          if (pendingQty > 0) {
            totalPendingQty += pendingQty

            // Cálculo do valor a pagar à Scaglioni:
            // Preço de venda menos a comissão da revendedora (ou valor total dependendo da regra; padrão: preço de venda - comissão)
            const itemGrossTotal = sellingPrice * pendingQty
            const itemResellerCut = (itemGrossTotal * commissionRate) / 100
            scaglioniDueForThisItem = Math.round((itemGrossTotal - itemResellerCut) * 100) / 100
            totalPendingValueDue += scaglioniDueForThisItem

            // Criar registro na tabela reseller_issues
            const issueRec = new Record(issuesCol)
            issueRec.set('reseller', reseller_id)
            issueRec.set('product', productId)
            issueRec.set('return_ref', returnRec.id)
            issueRec.set('quantity', pendingQty)
            issueRec.set('reason', pendingReason)
            issueRec.set('unit_selling_price', sellingPrice)
            issueRec.set('commission_rate', commissionRate)
            issueRec.set('scaglioni_due_total', scaglioniDueForThisItem)
            issueRec.set('status', 'pending')
            issueRec.set('notes', pendingNotes)
            txApp.save(issueRec)
          }

          processedItems.push({
            product_id: productId,
            code: product.getString('code'),
            description: product.getString('description'),
            selling_price: sellingPrice,
            returned_qty: returnedQty,
            pending_qty: pendingQty,
            pending_reason: pendingQty > 0 ? pendingReason : null,
            scaglioni_due: scaglioniDueForThisItem,
          })
        }

        returnRec.set('items', JSON.stringify(processedItems))
        returnRec.set('total_returned_qty', totalReturnedQty)
        returnRec.set('total_pending_qty', totalPendingQty)
        returnRec.set('total_pending_value_due', totalPendingValueDue)
        returnRec.set('commission_rate', commissionRate)

        txApp.save(returnRec)
        finalReturnRec = returnRec
      })

      return e.json(200, {
        success: true,
        return_id: finalReturnRec.id,
        code: finalReturnRec.getString('code'),
        total_returned_qty: finalReturnRec.getInt('total_returned_qty'),
        total_pending_qty: finalReturnRec.getInt('total_pending_qty'),
        total_pending_value_due: finalReturnRec.getFloat('total_pending_value_due'),
        commission_rate: finalReturnRec.getFloat('commission_rate'),
        nothing_due: finalReturnRec.getFloat('total_pending_value_due') === 0,
      })
    } catch (err) {
      console.log('Erro ao processar devolução/conferência:', err.message)
      return e.json(400, { error: err.message || 'Falha ao registrar devolução de jóias.' })
    }
  },
  $apis.requireAuth(),
)

// 5. QUITAÇÃO DE PENDÊNCIAS FINANCEIRAS
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/resolve-issue',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, {
        error: 'Apenas administradores e operadores podem quitar ou perdoar pendências.',
      })
    }

    const body = e.requestInfo().body || {}
    const { issue_id, status = 'paid', paid_notes } = body

    if (!issue_id) {
      return e.json(400, { error: 'ID da pendência é obrigatório.' })
    }

    try {
      let updatedIssue = null
      $app.runInTransaction((txApp) => {
        const issue = txApp.findRecordById('reseller_issues', issue_id)
        issue.set('status', status)
        if (status === 'paid') {
          issue.set('paid_at', new Date().toISOString())
        }
        if (paid_notes) {
          issue.set('paid_notes', paid_notes)
        }
        txApp.save(issue)
        updatedIssue = issue
      })

      return e.json(200, {
        success: true,
        issue_id: updatedIssue.id,
        status: updatedIssue.getString('status'),
      })
    } catch (err) {
      console.log('Erro ao resolver pendência:', err.message)
      return e.json(400, { error: err.message || 'Falha ao atualizar pendência.' })
    }
  },
  $apis.requireAuth(),
)
