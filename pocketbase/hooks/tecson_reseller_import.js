// Hook de importação Tecson → posse de revendedora.
// Chamado pela página /importar-tecson-revendedora com pb.send('/backend/v1/tecson/reseller-import').
// Recebe uma prévia pronta do frontend (linhas agrupadas por código de barras
// normalizado) e executa TUDO-OU-NADA numa única transação.
//
// Regras do modelo invertido (decisão do usuário):
//  - products.quantity = ESTOQUE FÍSICO (gravado/editável)
//  - Total = Físico + soma das posses em reseller_stock_items (calculado, nunca gravado)
//  - Produto existente: aumenta a POSSE da revendedora; Físico não muda
//  - Produto novo: Físico 0, qtde_inicial = quantidade importada, não publicado
//  - Sem código de barras válido: nada é criado (vai para pendências no frontend)
//  - Reimportação idempotente: produto+revendedora já com MESMO saldo é ignorado
//
// ATENÇÃO (JSVM): cada handler roda isolado — nada de require() nem globais
// compartilhados; tudo duplicado inline aqui.

routerAdd(
  'POST',
  '/backend/v1/tecson/reseller-import',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin') {
      return e.json(403, { error: 'Apenas superadmin/admin podem importar.' })
    }

    const body = e.requestInfo().body || {}
    const resellerId = String(body.reseller_id || '')
    const rows = Array.isArray(body.rows) ? body.rows : []
    const dryRun = !!body.dry_run
    const notes = String(body.notes || '')

    if (!resellerId) return e.json(400, { error: 'Revendedora é obrigatória.' })
    if (rows.length === 0) return e.json(400, { error: 'Nenhuma linha para importar.' })

    const audit = (raw) => String(raw || '').replace(/\D+/g, '')
    const norm = (raw) => audit(raw).replace(/^0+/, '')
    const isValid = (raw) => {
      const n = norm(raw)
      if (n.length < 8) return false
      if (/^(\d)\1+$/.test(n)) return false
      return true
    }

    const result = {
      success: false,
      dry_run: dryRun,
      reseller_id: resellerId,
      products_updated: 0,
      products_created: 0,
      stock_items_created: 0,
      stock_items_updated: 0,
      maleta_id: '',
      maleta_code: '',
      skipped: [],
    }

    // Pré-validação fora da transação: falha rápido se algo inválido.
    const perBarcode = {}
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const bc = row.barcode
      if (!isValid(bc)) {
        result.skipped.push({
          line: row.line || i + 2,
          barcode: audit(bc),
          reason: 'Código de barras inválido.',
        })
        continue
      }
      const key = norm(bc)
      const qty = parseInt(row.quantity, 10) || 0
      if (qty <= 0) {
        result.skipped.push({ line: row.line || i + 2, barcode: key, reason: 'Quantidade <= 0.' })
        continue
      }
      if (!perBarcode[key]) perBarcode[key] = { quantity: 0, row: row }
      perBarcode[key].quantity += qty
    }

    const validKeys = Object.keys(perBarcode)
    if (validKeys.length === 0) {
      return e.json(200, { ...result, success: true, message: 'Nada importável.' })
    }

    try {
      $app.runInTransaction((txApp) => {
        const reseller = txApp.findRecordById('resellers', resellerId)
        const resellerName = reseller.getString('name')

        // Produtos por código de barras normalizado (só um match por código é permitido).
        for (let k = 0; k < validKeys.length; k++) {
          const key = validKeys[k]
          const entry = perBarcode[key]
          const qty = entry.quantity
          const row = entry.row

          // Busca única pelo código de barras normalizado (comparação por dígitos,
          // sem zeros à esquerda — igual ao frontend).
          const all = txApp.findRecordsByFilter('products', "codigo_barras != ''", '-created', 0, 0)
          let matches = []
          for (let j = 0; j < all.length; j++) {
            if (norm(all[j].getString('codigo_barras')) === key) matches.push(all[j])
          }

          if (matches.length > 1) {
            result.skipped.push({
              line: row.line,
              barcode: key,
              reason:
                'Conflito: ' +
                matches.length +
                ' produtos com este código de barras. Resolva manualmente.',
            })
            continue
          }

          let product = matches.length === 1 ? matches[0] : null
          let isNew = false

          if (!product) {
            // Produto novo: Físico 0, qtde_inicial = quantidade importada,
            // não publicado, origem "Migração Tecson — posse de revendedora".
            isNew = true
            const col = txApp.findCollectionByNameOrId('products')
            product = new Record(col)
            product.set('description', row.description || 'Produto importado Tecson')
            product.set('codigo_barras', key) // normalizado (zeros à esquerda removidos)
            product.set('codigo_barras_tecson', audit(row.barcode)) // original p/ auditoria
            product.set('quantity', 0)
            product.set('qtde_inicial', qty)
            product.set('qtde_loja_virtual', 0)
            product.set('publicar_no_ecommerce', false)
            product.set('estado_ativo_ecommerce', false)
            product.set('status', 'unavailable')
            product.set('criado_em_origem', 'Migração Tecson — posse de revendedora')
            if (row.selling_price) product.set('selling_price', parseFloat(row.selling_price) || 0)
            product.set('sku_ecommerce', '') // SKU real é gerada por products_code_sequence
            txApp.save(product)
            result.products_created++
          }

          // Posse da revendedora: registro único por (reseller, product).
          const existing = txApp.findRecordsByFilter(
            'reseller_stock_items',
            "reseller = '" + resellerId + "' && product = '" + product.id + "'",
            '',
            1,
            0,
          )
          if (existing.length > 0) {
            const rec = existing[0]
            const cur = rec.getInt('quantity') || 0
            if (cur === qty) {
              // Reimportação idempotente: nada a fazer.
              result.skipped.push({
                line: row.line,
                barcode: key,
                reason: 'Já importado (mesmo saldo).',
              })
              continue
            }
            rec.set('quantity', cur + qty)
            txApp.save(rec)
            result.stock_items_updated++
            if (!isNew) result.products_updated++
          } else {
            const colSi = txApp.findCollectionByNameOrId('reseller_stock_items')
            const rec = new Record(colSi)
            rec.set('reseller', resellerId)
            rec.set('product', product.id)
            rec.set('quantity', qty)
            if (row.selling_price) rec.set('selling_price', parseFloat(row.selling_price) || 0)
            txApp.save(rec)
            result.stock_items_created++
            if (!isNew) result.products_updated++
          }

          // Auditoria da linha
          result.last_row = row.line
          result.last_barcode = key
        }

        // Cria maleta de migração por revendedora (somente na importação real).
        if (!dryRun) {
          const deliveriesCol = txApp.findCollectionByNameOrId('reseller_deliveries')
          const totalQty = validKeys.reduce((acc, key) => acc + perBarcode[key].quantity, 0)
          const today = new Date()
          const dd = String(today.getDate()).padStart(2, '0')
          const mm = String(today.getMonth() + 1).padStart(2, '0')
          const yyyy = today.getFullYear()
          const maletaNotes = 'Saldo inicial importado do Tecson — ' + dd + '/' + mm + '/' + yyyy

          // Idempotência da maleta: se já existe uma com mesmas notas e revendedora, não duplica.
          const dup = txApp.findRecordsByFilter(
            'reseller_deliveries',
            "reseller = '" + resellerId + "' && notes = '" + maletaNotes + "'",
            '',
            1,
            0,
          )
          if (dup.length === 0) {
            const seqList = txApp.findRecordsByFilter(
              'app_sequences',
              "name = 'reseller_movement_seq'",
              '',
              1,
              0,
            )
            let seq = 1
            let seqRec = null
            if (seqList.length > 0) {
              seqRec = seqList[0]
              seq = (seqRec.getInt('current_value') || 0) + 1
              seqRec.set('current_value', seq)
              txApp.save(seqRec)
            } else {
              const seqCol = txApp.findCollectionByNameOrId('app_sequences')
              seqRec = new Record(seqCol)
              seqRec.set('name', 'reseller_movement_seq')
              seqRec.set('current_value', seq)
              txApp.save(seqRec)
            }

            const maleta = new Record(deliveriesCol)
            maleta.set('code', String(seq))
            maleta.set('reseller', resellerId)
            maleta.set('operator', authUser.id)
            maleta.set('status', 'accepted') // aceita — sem assinatura/cobrança retroativa
            maleta.set(
              'items',
              JSON.stringify(
                validKeys.map((key) => ({
                  barcode: key,
                  quantity: perBarcode[key].quantity,
                })),
              ),
            )
            maleta.set('total_items_count', totalQty)
            maleta.set('total_value', 0) // sem cobrança retroativa
            maleta.set('notes', maletaNotes)
            maleta.set('origin', 'tecson_import')
            txApp.save(maleta)
            result.maleta_id = maleta.id
            result.maleta_code = maleta.getString('code')
          }
        }
      })

      result.success = true
      if (dryRun) {
        return e.json(200, { ...result, message: 'Prévia validada no servidor.' })
      }
      return e.json(200, result)
    } catch (err) {
      console.log('tecson/reseller-import erro:', err.message)
      return e.json(400, { error: err.message || 'Falha na importação.' })
    }
  },
  $apis.requireAuth(),
)
