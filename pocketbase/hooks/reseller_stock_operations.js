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

        // Código da entrega (v0.0.152): numeração PURA (1, 2, 3…) — sem prefixo e
        // sem zeros à esquerda — de um contador COMPARTILHADO com devoluções
        // (reseller_movement_seq), garantindo número único por movimentação.
        let deliveryCode = ''
        try {
          let seqRec = null
          try {
            seqRec = txApp.findFirstRecordByFilter(
              'app_sequences',
              "name = 'reseller_movement_seq'",
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
            newSeqRec.set('name', 'reseller_movement_seq')
            newSeqRec.set('current_value', nextVal)
            txApp.save(newSeqRec)
          }
          deliveryCode = String(nextVal)
        } catch (seqErr) {
          console.log(
            'Erro na sequência de movimentações, usando fallback por timestamp:',
            seqErr.message,
          )
          const tsFallback = new Date().getTime().toString().slice(-6)
          const randFallback = Math.floor(1000 + Math.random() * 9000).toString()
          deliveryCode = tsFallback + '-' + randFallback
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
//    Regra: a assinatura de recebimento é sempre aceita, inclusive em entrega
//    cujas peças já foram totalmente devolvidas (status derivado "Devolvida /
//    Finalizada") — nesse caso é apenas um registro histórico e a UI não exibe
//    mais o botão Assinar. Nunca responde 400 sem mensagem legível em português.
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

        // Entrega já assinada: assinatura é inócua — responde OK sem repetir o fluxo.
        if (delivery.getString('status') === 'accepted') {
          return e.json(200, {
            success: true,
            delivery_id: delivery.id,
            code: delivery.getString('code'),
            status: 'accepted',
          })
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
      // Sempre devolve erro com mensagem legível em português (nunca erro cru de validação).
      let msg = err && err.message ? String(err.message) : ''
      if (!msg) {
        msg = 'Falha ao salvar assinatura da entrega.'
      }
      if (
        msg.indexOf('sql:') !== -1 ||
        msg.toLowerCase().indexOf('something went wrong') !== -1 ||
        msg.toLowerCase().indexOf('failed to authenticate') !== -1
      ) {
        msg = 'Não foi possível salvar a assinatura. Verifique os dados e tente novamente.'
      }
      console.log('Erro ao assinar entrega:', msg)
      return e.json(400, { error: msg })
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
    const { reseller_id, items, notes, sale_ids = [], payments = [], delivery_id } = body
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
        const paymentsCol = txApp.findCollectionByNameOrId('reseller_settlement_payments')

        // Código da devolução (v0.0.152): numeração PURA (1, 2, 3…) do MESMO
        // contador compartilhado com entregas (reseller_movement_seq) — sem
        // prefixo, sem zeros à esquerda, número único por movimentação.
        let returnCode = ''
        try {
          let seqRec = null
          try {
            seqRec = txApp.findFirstRecordByFilter(
              'app_sequences',
              "name = 'reseller_movement_seq'",
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
            newSeqRec.set('name', 'reseller_movement_seq')
            newSeqRec.set('current_value', nextVal)
            txApp.save(newSeqRec)
          }
          returnCode = String(nextVal)
        } catch (seqErr) {
          console.log(
            'Erro na sequência de movimentações, usando fallback por timestamp:',
            seqErr.message,
          )
          const tsFallback = new Date().getTime().toString().slice(-6)
          const randFallback = Math.floor(1000 + Math.random() * 9000).toString()
          returnCode = tsFallback + '-' + randFallback
        }

        // Referência à entrega de origem (código dela, ex. "1"), enviada pelo fluxo de devolução
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
        if (delivery_id) {
          returnRec.set('delivery_ref', delivery_id)
        }

        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const productId = it.product_id
          const returnedQty = Math.max(0, parseInt(it.returned_qty, 10) || 0)
          const pendingQty = Math.max(0, parseInt(it.pending_qty, 10) || 0)
          const pendingReason = it.pending_reason || 'extraviada' // 'extraviada' | 'venda_avulsa_sem_pdv' | 'outros'
          const pendingNotes = it.pending_notes || ''
          // A pendência pode ser apenas registrada (sem cobrança financeira).
          const pendingCharge = it.pending_charge !== false

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
            scaglioniDueForThisItem = pendingCharge
              ? Math.round((itemGrossTotal - itemResellerCut) * 100) / 100
              : 0
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
            issueRec.set('charged', pendingCharge)
            issueRec.set('status', pendingCharge ? 'pending' : 'forgiven')
            issueRec.set('notes', pendingNotes + (pendingCharge ? '' : ' [Não cobrar]'))
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
            pending_charge: pendingCharge,
          })
        }

        // Vendas incluídas neste fechamento: cada venda só pode compor um acerto.
        const selectedSaleIds = Array.isArray(sale_ids)
          ? [...new Set(sale_ids.filter((id) => typeof id === 'string' && id))]
          : []
        const selectedSales = []
        let totalSalesDue = 0
        let totalSoldQty = 0
        for (let i = 0; i < selectedSaleIds.length; i++) {
          const sale = txApp.findRecordById('reseller_sales', selectedSaleIds[i])
          if (
            sale.getString('reseller') !== reseller_id ||
            sale.getString('status') !== 'completed'
          ) {
            throw new Error('Venda inválida para este acerto.')
          }
          if (sale.getString('settlement_return')) {
            throw new Error('Uma das vendas selecionadas já foi incluída em outro acerto.')
          }
          selectedSales.push(sale)
          const due = (sale.getFloat('total') * (100 - commissionRate)) / 100
          totalSalesDue += Math.round(due * 100) / 100
          try {
            const saleItems = JSON.parse(sale.getString('items') || '[]')
            totalSoldQty += saleItems.reduce(
              (total, item) => total + (parseInt(item.quantity, 10) || 0),
              0,
            )
          } catch (_) {}
        }

        const paymentEntries = Array.isArray(payments) ? payments : []
        let totalPaid = 0
        for (let i = 0; i < paymentEntries.length; i++) {
          const amount = Math.max(0, parseFloat(paymentEntries[i].amount) || 0)
          if (amount > 0) totalPaid += amount
        }
        totalPaid = Math.round(totalPaid * 100) / 100
        const totalFinancialDue = Math.round((totalSalesDue + totalPendingValueDue) * 100) / 100
        if (totalPaid > totalFinancialDue + 0.009) {
          throw new Error('O valor pago não pode ser maior que o valor devido.')
        }
        const balanceDue = Math.round(Math.max(0, totalFinancialDue - totalPaid) * 100) / 100
        const financialStatus = balanceDue === 0 ? 'settled' : totalPaid > 0 ? 'partial' : 'open'

        returnRec.set('items', JSON.stringify(processedItems))
        returnRec.set('total_returned_qty', totalReturnedQty)
        returnRec.set('total_pending_qty', totalPendingQty)
        returnRec.set('total_sold_qty', totalSoldQty)
        returnRec.set('total_pending_value_due', totalPendingValueDue)
        returnRec.set('commission_rate', commissionRate)
        returnRec.set('total_financial_due', totalFinancialDue)
        returnRec.set('total_paid', totalPaid)
        returnRec.set('balance_due', balanceDue)
        returnRec.set('financial_status', financialStatus)
        txApp.save(returnRec)

        // Vendas já fechadas deixam de entrar nas próximas conferências.
        for (let i = 0; i < selectedSales.length; i++) {
          selectedSales[i].set('settlement_return', returnRec.id)
          txApp.save(selectedSales[i])
        }

        // Cada forma de pagamento é um registro auditável próprio.
        for (let i = 0; i < paymentEntries.length; i++) {
          const entry = paymentEntries[i]
          const amount = Math.max(0, parseFloat(entry.amount) || 0)
          if (amount <= 0) continue
          const paymentRec = new Record(paymentsCol)
          paymentRec.set('reseller', reseller_id)
          paymentRec.set('return_ref', returnRec.id)
          paymentRec.set('operator', authUser.id)
          paymentRec.set('method', entry.method || 'other')
          paymentRec.set('amount', amount)
          paymentRec.set('notes', entry.notes || '')
          paymentRec.set('paid_at', new Date().toISOString())
          txApp.save(paymentRec)
        }
        finalReturnRec = returnRec
      })

      return e.json(200, {
        success: true,
        return_id: finalReturnRec.id,
        code: finalReturnRec.getString('code'),
        // Código real da entrega de origem gravado no registro (ex. "1") p/ o comprovante
        delivery_code: finalReturnRec.getString('delivery_code') || undefined,
        total_returned_qty: finalReturnRec.getInt('total_returned_qty'),
        total_pending_qty: finalReturnRec.getInt('total_pending_qty'),
        total_pending_value_due: finalReturnRec.getFloat('total_pending_value_due'),
        commission_rate: finalReturnRec.getFloat('commission_rate'),
        total_financial_due: finalReturnRec.getFloat('total_financial_due'),
        total_paid: finalReturnRec.getFloat('total_paid'),
        balance_due: finalReturnRec.getFloat('balance_due'),
        financial_status: finalReturnRec.getString('financial_status'),
        nothing_due: finalReturnRec.getFloat('balance_due') === 0,
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

// 6. PAGAMENTO POSTERIOR DE UM ACERTO JÁ REGISTRADO
routerAdd(
  'POST',
  '/backend/v1/reseller-stock/settlement-payment',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })
    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, { error: 'Apenas a equipe pode registrar pagamentos.' })
    }

    const body = e.requestInfo().body || {}
    const returnId = body.return_id
    const amount = Math.round(Math.max(0, parseFloat(body.amount) || 0) * 100) / 100
    if (!returnId || amount <= 0) {
      return e.json(400, { error: 'Informe o acerto e um valor de pagamento maior que zero.' })
    }

    try {
      let result = null
      $app.runInTransaction((txApp) => {
        const returnRec = txApp.findRecordById('reseller_returns', returnId)
        const balance = Math.round(Math.max(0, returnRec.getFloat('balance_due')) * 100) / 100
        if (balance <= 0) throw new Error('Este acerto já está quitado.')
        if (amount > balance + 0.009) {
          throw new Error('O pagamento não pode ser maior que o saldo pendente.')
        }

        const paymentsCol = txApp.findCollectionByNameOrId('reseller_settlement_payments')
        const paymentRec = new Record(paymentsCol)
        paymentRec.set('reseller', returnRec.getString('reseller'))
        paymentRec.set('return_ref', returnRec.id)
        paymentRec.set('operator', authUser.id)
        paymentRec.set('method', body.method || 'other')
        paymentRec.set('amount', amount)
        paymentRec.set('notes', body.notes || '')
        paymentRec.set('paid_at', new Date().toISOString())
        txApp.save(paymentRec)

        const totalPaid = Math.round((returnRec.getFloat('total_paid') + amount) * 100) / 100
        const newBalance =
          Math.round(Math.max(0, returnRec.getFloat('total_financial_due') - totalPaid) * 100) / 100
        returnRec.set('total_paid', totalPaid)
        returnRec.set('balance_due', newBalance)
        returnRec.set('financial_status', newBalance === 0 ? 'settled' : 'partial')
        txApp.save(returnRec)
        result = {
          return_id: returnRec.id,
          total_paid: totalPaid,
          balance_due: newBalance,
          financial_status: returnRec.getString('financial_status'),
        }
      })
      return e.json(200, { success: true, ...result })
    } catch (err) {
      return e.json(400, { error: err.message || 'Falha ao registrar pagamento.' })
    }
  },
  $apis.requireAuth(),
)
