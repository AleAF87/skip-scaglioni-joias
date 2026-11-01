// Hook for atomic consignment closing with inventory updates
routerAdd(
  'POST',
  '/backend/v1/consignments/close',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
      return e.json(403, {
        error: 'Apenas administradores e operadores podem fechar listas de consignação.',
      })
    }

    const body = e.requestInfo().body || {}
    const { consignment_id, items_closing } = body

    if (!consignment_id) {
      return e.json(400, { error: 'ID da lista de consignação é obrigatório.' })
    }

    if (!items_closing || !Array.isArray(items_closing) || items_closing.length === 0) {
      return e.json(400, { error: 'Dados de fechamento dos itens são obrigatórios.' })
    }

    let finalConsignmentRecord = null
    let totalSoldAmount = 0

    try {
      $app.runInTransaction((txApp) => {
        const consignment = txApp.findRecordById('consignment_lists', consignment_id)
        const currentStatus = consignment.getString('status')

        if (currentStatus === 'closed') {
          throw new Error('Esta lista de consignação já foi finalizada.')
        }

        const existingItems = JSON.parse(consignment.getString('items') || '[]')
        const updatedItems = []

        // Validate each item closing numbers: sold + returned === consigned total
        for (let i = 0; i < existingItems.length; i++) {
          const item = existingItems[i]
          const closingData = items_closing.find(
            (c) => c.product_id === item.product_id || c.code === item.code,
          )

          if (!closingData) {
            throw new Error('Fechamento ausente para o item: ' + (item.description || item.code))
          }

          const consignedQty = parseInt(item.quantity, 10) || 0
          const soldQty = parseInt(closingData.sold, 10) || 0
          const returnedQty = parseInt(closingData.returned, 10) || 0

          if (soldQty < 0 || returnedQty < 0) {
            throw new Error('Quantidades não podem ser negativas para o item: ' + item.code)
          }

          if (soldQty + returnedQty !== consignedQty) {
            throw new Error(
              'Erro de consistência no item ' +
                item.code +
                ': vendidos (' +
                soldQty +
                ') + devolvidos (' +
                returnedQty +
                ') deve ser igual ao total consignado (' +
                consignedQty +
                ').',
            )
          }

          // Inventory adjustment:
          // Consignment items were either in the reseller's hands or previously set aside.
          // Rule: sold items represent permanent outflow (deducted/confirmed sales).
          // If stock is maintained, returned items are put back or stay.
          // Let's ensure product stock is consistent:
          if (item.product_id) {
            try {
              const product = txApp.findRecordById('products', item.product_id)
              // If consignment reserved stock on creation:
              // returned items are added back to available inventory.
              const currentStock = product.getInt('quantity')
              const newStock = currentStock + returnedQty
              product.set('quantity', newStock)
              if (newStock > 0 && product.getString('status') === 'unavailable') {
                product.set('status', 'available')
              }
              txApp.save(product)
            } catch (pErr) {
              console.log('Aviso ao atualizar estoque no fechamento:', pErr.message)
            }
          }

          const unitPrice = parseFloat(item.selling_price) || 0
          totalSoldAmount += unitPrice * soldQty

          updatedItems.push({
            ...item,
            sold: soldQty,
            returned: returnedQty,
            sold_amount: unitPrice * soldQty,
          })
        }

        consignment.set('items', JSON.stringify(updatedItems))
        consignment.set('status', 'closed')
        txApp.save(consignment)
        finalConsignmentRecord = consignment
      })

      return e.json(200, {
        success: true,
        consignment_id: finalConsignmentRecord.id,
        code: finalConsignmentRecord.getString('code'),
        status: 'closed',
        total_sold_amount: totalSoldAmount,
      })
    } catch (err) {
      console.log('Erro ao fechar lista de consignação:', err.message)
      return e.json(400, { error: err.message || 'Falha ao fechar lista de consignação.' })
    }
  },
  $apis.requireAuth(),
)
