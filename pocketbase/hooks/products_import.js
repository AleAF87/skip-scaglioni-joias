// Hooks para importação de produtos e limpeza controlada pelo Administrador

// 1. Endpoint para limpeza completa de produtos e movimentações relacionadas
// Somente ADMIN com dupla confirmação
routerAdd(
  'POST',
  '/backend/v1/products/import/clear-all',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem executar a limpeza de produtos.' })
    }

    const body = e.requestInfo().body || {}
    if (body.confirmation !== 'APAGAR_TUDO_DEFINITIVAMENTE') {
      return e.json(400, {
        error: 'Confirmação inválida. É necessário confirmar com a frase de segurança.',
      })
    }

    let deletedCounts = {
      reseller_stock_items: 0,
      reseller_issues: 0,
      products: 0,
    }

    try {
      $app.runInTransaction((txApp) => {
        // Excluir registros que possuem chave estrangeira para produtos
        try {
          const resStock = txApp.db().newQuery('DELETE FROM reseller_stock_items').execute()
          deletedCounts.reseller_stock_items = resStock?.rowsAffected ? resStock.rowsAffected() : 0
        } catch (errStock) {
          console.log('Aviso ao limpar reseller_stock_items:', errStock.message)
        }

        try {
          const resIssues = txApp.db().newQuery('DELETE FROM reseller_issues').execute()
          deletedCounts.reseller_issues = resIssues?.rowsAffected ? resIssues.rowsAffected() : 0
        } catch (errIssues) {
          console.log('Aviso ao limpar reseller_issues:', errIssues.message)
        }

        // Excluir todos os produtos
        const resProducts = txApp.db().newQuery('DELETE FROM products').execute()
        deletedCounts.products = resProducts?.rowsAffected ? resProducts.rowsAffected() : 0
      })

      return e.json(200, {
        success: true,
        message: 'Produtos e estoques relacionados limpos com sucesso.',
        deleted: deletedCounts,
      })
    } catch (err) {
      console.log('Erro ao executar limpeza de produtos:', err.message)
      return e.json(500, { error: 'Falha ao executar limpeza: ' + err.message })
    }
  },
  $apis.requireAuth(),
)

// 2. Endpoint de importação em lote de produtos via JSON
// Recebe array de produtos do CSV já parseados
routerAdd(
  'POST',
  '/backend/v1/products/import/batch',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem importar produtos.' })
    }

    const body = e.requestInfo().body || {}
    const items = body.items || []

    if (!Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Nenhum item enviado para importação.' })
    }

    const productsCol = $app.findCollectionByNameOrId('products')

    let importedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const errors = []

    $app.runInTransaction((txApp) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const rawCode = item.code != null ? String(item.code).trim() : ''
        const description = item.description != null ? String(item.description).trim() : ''

        if (!rawCode && !description) {
          skippedCount++
          errors.push({
            index: i,
            code: rawCode,
            error: 'Linha sem código e sem descrição.',
          })
          continue
        }

        const quantity = Math.max(0, parseInt(item.quantity, 10) || 0)
        const sellingPrice = Math.max(0, parseFloat(item.selling_price) || 0)
        const investedValue = Math.max(0, parseFloat(item.invested_value) || 0)
        const importImagePath = item.import_image_path ? String(item.import_image_path).trim() : ''
        const imageUrl = item.image_url ? String(item.image_url).trim() : ''

        try {
          let record = null
          let isUpdate = false

          if (rawCode) {
            try {
              record = txApp.findFirstRecordByData('products', 'code', rawCode)
              isUpdate = true
            } catch (_) {
              record = null
            }
          }

          if (!record) {
            record = new Record(productsCol)
            if (rawCode) {
              record.set('code', rawCode)
            }
          }

          record.set('description', description || 'Produto ' + (rawCode || 'Importado'))
          record.set('quantity', quantity)
          record.set('selling_price', sellingPrice)
          record.set('invested_value', investedValue)
          record.set('status', quantity > 0 ? 'available' : 'unavailable')

          if (importImagePath) {
            record.set('import_image_path', importImagePath)
          }
          if (imageUrl) {
            record.set('image_url', imageUrl)
          }

          // Campos opcionais deixados vazios conforme diretriz do usuário
          // (tipo, material, tamanho, perfil, observações não preenchidos)

          txApp.save(record)

          if (isUpdate) {
            updatedCount++
          } else {
            importedCount++
          }
        } catch (itemErr) {
          skippedCount++
          errors.push({
            index: i,
            code: rawCode,
            description: description.substring(0, 30),
            error: itemErr.message || 'Erro ao salvar produto',
          })
        }
      }
    })

    return e.json(200, {
      success: true,
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedCount,
      total_received: items.length,
      errors: errors.slice(0, 50), // primeiros 50 erros se houver
    })
  },
  $apis.requireAuth(),
)

// 3. Endpoint para mapear import_image_path existentes
// Ajuda o frontend no casamento das imagens do ZIP
routerAdd(
  'GET',
  '/backend/v1/products/import/image-map',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'admin' && role !== 'operator') {
      return e.json(403, { error: 'Permissão negada.' })
    }

    try {
      const rows = []
      $app
        .db()
        .newQuery(
          "SELECT id, code, description, import_image_path, image_url, photos FROM products WHERE (import_image_path IS NOT NULL AND import_image_path != '') OR (image_url IS NOT NULL AND image_url != '')",
        )
        .all(rows)

      return e.json(200, {
        total: rows.length,
        items: rows,
      })
    } catch (err) {
      return e.json(500, { error: 'Erro ao buscar mapa de imagens: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
