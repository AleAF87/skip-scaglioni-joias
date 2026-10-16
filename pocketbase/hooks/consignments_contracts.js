// Hook for signing and managing consignment electronic contracts
// Enforces server-side validations, real IP recording, immutability and stock transition.

routerAdd(
  'POST',
  '/backend/v1/consignments/sign',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const body = e.requestInfo().body || {}
    const {
      consignment_id,
      signature_data,
      signer_name,
      signer_document,
      session_id,
      document_hash,
      snapshot_data,
    } = body

    if (!consignment_id) {
      return e.json(400, { error: 'ID da lista de consignação é obrigatório.' })
    }
    if (!signature_data) {
      return e.json(400, { error: 'Assinatura desenhada é obrigatória.' })
    }
    if (!document_hash) {
      return e.json(400, { error: 'Hash de integridade do documento é obrigatório.' })
    }

    // Determine client IP
    const clientIp =
      e.requestInfo().headers['x-forwarded-for'] ||
      e.requestInfo().headers['x-real-ip'] ||
      e.remoteIP() ||
      '127.0.0.1'

    let result = null

    try {
      $app.runInTransaction((txApp) => {
        const list = txApp.findRecordById('consignment_lists', consignment_id)
        const currentStatus = list.getString('status')

        // Idempotency: verify if already signed
        if (currentStatus !== 'pending_signature' && currentStatus !== 'pending') {
          throw new Error('Esta lista de consignação já foi assinada ou está finalizada/cancelada.')
        }

        // Permission check: if user is reseller, ensure it matches
        const userRole = authUser.getString('role')
        const listResellerId = list.getString('reseller')
        const resellerRecord = txApp.findRecordById('resellers', listResellerId)

        if (userRole === 'reseller') {
          const resellerUserId = resellerRecord.getString('user')
          if (resellerUserId !== authUser.id) {
            throw new Error('Você só pode assinar listas vinculadas ao seu cadastro.')
          }
        }

        // Check if a document record already exists for this list
        let docRecord = null
        try {
          docRecord = txApp.findFirstRecordByData(
            'consignment_documents',
            'consignment_list',
            consignment_id,
          )
        } catch (_) {}

        if (docRecord && docRecord.getString('status') === 'signed') {
          throw new Error('O contrato desta lista já foi assinado e possui registro imutável.')
        }

        const nowIso = new Date().toISOString()
        const contractVersion = (snapshot_data && snapshot_data.contract_version) || '1.0'

        // 1. Deduct stock now that the contract is signed and products are being released
        const rawItems = JSON.parse(list.getString('items') || '[]')
        for (let i = 0; i < rawItems.length; i++) {
          const item = rawItems[i]
          if (item.product_id) {
            try {
              const prod = txApp.findRecordById('products', item.product_id)
              const currentStock = prod.getInt('quantity')
              const deductQty = parseInt(item.quantity, 10) || 0
              const newStock = Math.max(0, currentStock - deductQty)
              prod.set('quantity', newStock)
              if (newStock === 0) {
                prod.set('status', 'unavailable')
              }
              txApp.save(prod)
            } catch (pErr) {
              console.log('Aviso ao abater estoque do produto na assinatura:', pErr.message)
            }
          }
        }

        // 2. Update list status to 'open' (or 'accepted' for backward compatibility)
        list.set('status', 'open')
        txApp.save(list)

        // 3. Create or update consignment_documents record with full immutable snapshot
        const docsCollection = txApp.findCollectionByNameOrId('consignment_documents')
        if (!docRecord) {
          docRecord = new Record(docsCollection)
          docRecord.set('consignment_list', list.id)
          docRecord.set('reseller', listResellerId)
          docRecord.set('document_code', list.getString('code'))
          docRecord.set('created_by', list.getString('operator'))
          docRecord.set('creator_ip', list.getString('created_ip') || '')
        }

        docRecord.set('contract_version', contractVersion)
        docRecord.set('status', 'signed')
        docRecord.set('document_hash', document_hash)
        docRecord.set('session_id', session_id || $security.randomString(20))
        docRecord.set('signer_name', signer_name || resellerRecord.getString('name'))
        docRecord.set('signer_document', signer_document || resellerRecord.getString('document'))
        docRecord.set('signed_at', nowIso)
        docRecord.set('signed_ip', clientIp)
        docRecord.set('signature_image_data', signature_data)
        docRecord.set('snapshot_data', JSON.stringify(snapshot_data || {}))

        txApp.save(docRecord)

        result = {
          success: true,
          consignment_id: list.id,
          document_id: docRecord.id,
          status: 'open',
          signed_at: nowIso,
          signed_ip: clientIp,
          document_hash: document_hash,
          contract_version: contractVersion,
        }
      })

      return e.json(200, result)
    } catch (err) {
      console.log('Erro ao assinar lista de consignação:', err.message)
      return e.json(400, { error: err.message || 'Falha ao processar assinatura do contrato.' })
    }
  },
  $apis.requireAuth(),
)

// Hook for cancelling a consignment list with full audit trail and reason
routerAdd(
  'POST',
  '/backend/v1/consignments/cancel',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'admin' && role !== 'operator') {
      return e.json(403, {
        error: 'Apenas administradores e operadores podem cancelar listas de consignação.',
      })
    }

    const body = e.requestInfo().body || {}
    const { consignment_id, cancellation_reason } = body

    if (!consignment_id) {
      return e.json(400, { error: 'ID da lista de consignação é obrigatório.' })
    }
    if (!cancellation_reason || !cancellation_reason.trim()) {
      return e.json(400, { error: 'O motivo do cancelamento é obrigatório.' })
    }

    try {
      let cancelledList = null
      $app.runInTransaction((txApp) => {
        const list = txApp.findRecordById('consignment_lists', consignment_id)
        const currentStatus = list.getString('status')

        if (currentStatus === 'closed') {
          throw new Error('Listas finalizadas não podem ser canceladas.')
        }
        if (currentStatus === 'cancelled') {
          throw new Error('Esta lista já está cancelada.')
        }

        // If list was signed ('open' or 'accepted'), returning goods back to product stock
        if (currentStatus === 'open' || currentStatus === 'accepted') {
          const rawItems = JSON.parse(list.getString('items') || '[]')
          for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i]
            if (item.product_id) {
              try {
                const prod = txApp.findRecordById('products', item.product_id)
                const currentStock = prod.getInt('quantity')
                const restoreQty = parseInt(item.quantity, 10) || 0
                const newStock = currentStock + restoreQty
                prod.set('quantity', newStock)
                if (newStock > 0 && prod.getString('status') === 'unavailable') {
                  prod.set('status', 'available')
                }
                txApp.save(prod)
              } catch (pErr) {
                console.log('Aviso ao restaurar estoque no cancelamento:', pErr.message)
              }
            }
          }
        }

        const nowIso = new Date().toISOString()
        list.set('status', 'cancelled')
        list.set('cancellation_reason', cancellation_reason.trim())
        list.set('cancelled_at', nowIso)
        list.set('cancelled_by', authUser.id)
        txApp.save(list)

        // Also update associated consignment_documents status if present, preserving original snapshot
        try {
          const docRecord = txApp.findFirstRecordByData(
            'consignment_documents',
            'consignment_list',
            consignment_id,
          )
          if (docRecord) {
            docRecord.set('status', 'cancelled')
            txApp.save(docRecord)
          }
        } catch (_) {}

        cancelledList = list
      })

      return e.json(200, {
        success: true,
        consignment_id: cancelledList.id,
        code: cancelledList.getString('code'),
        status: 'cancelled',
      })
    } catch (err) {
      console.log('Erro ao cancelar lista de consignação:', err.message)
      return e.json(400, { error: err.message || 'Falha ao cancelar lista.' })
    }
  },
  $apis.requireAuth(),
)
