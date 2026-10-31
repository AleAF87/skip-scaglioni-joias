// Hook para importação de produtos Tecson e Scaglioni com conciliação manual e idempotência

// 1. Limpeza geral com segurança
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
      sales: 0,
      reseller_sales: 0,
      consignment_documents: 0,
      consignment_lists: 0,
      reseller_deliveries: 0,
      reseller_returns: 0,
      reseller_stock_items: 0,
      reseller_issues: 0,
      initial_stocks: 0,
      product_category_links: 0,
      product_images: 0,
      product_variations: 0,
      product_price_history: 0,
      products: 0,
    }

    try {
      $app.runInTransaction((txApp) => {
        // 1. Vendas da loja
        try {
          const resSales = txApp.db().newQuery('DELETE FROM sales').execute()
          deletedCounts.sales = resSales?.rowsAffected ? resSales.rowsAffected() : 0
        } catch (_) {}

        // 2. Vendas de revendedoras (PDV Revendedora)
        try {
          const resResellerSales = txApp.db().newQuery('DELETE FROM reseller_sales').execute()
          deletedCounts.reseller_sales = resResellerSales?.rowsAffected
            ? resResellerSales.rowsAffected()
            : 0
        } catch (_) {}

        // 3. Documentos / contratos de listas de consignação
        try {
          const resDocs = txApp.db().newQuery('DELETE FROM consignment_documents').execute()
          deletedCounts.consignment_documents = resDocs?.rowsAffected ? resDocs.rowsAffected() : 0
        } catch (_) {}

        // 4. Listas de consignação
        try {
          const resConsign = txApp.db().newQuery('DELETE FROM consignment_lists').execute()
          deletedCounts.consignment_lists = resConsign?.rowsAffected ? resConsign.rowsAffected() : 0
        } catch (_) {}

        // 5. Entregas / recebimentos de revendedora
        try {
          const resDeliveries = txApp.db().newQuery('DELETE FROM reseller_deliveries').execute()
          deletedCounts.reseller_deliveries = resDeliveries?.rowsAffected
            ? resDeliveries.rowsAffected()
            : 0
        } catch (_) {}

        // 6. Pendências financeiras / extravios / avulsas de revendedoras
        try {
          const resIssues = txApp.db().newQuery('DELETE FROM reseller_issues').execute()
          deletedCounts.reseller_issues = resIssues?.rowsAffected ? resIssues.rowsAffected() : 0
        } catch (_) {}

        // 7. Devoluções / acertos de revendedoras
        try {
          const resReturns = txApp.db().newQuery('DELETE FROM reseller_returns').execute()
          deletedCounts.reseller_returns = resReturns?.rowsAffected ? resReturns.rowsAffected() : 0
        } catch (_) {}

        // 8. Estoque em posse de revendedoras
        try {
          const resStock = txApp.db().newQuery('DELETE FROM reseller_stock_items').execute()
          deletedCounts.reseller_stock_items = resStock?.rowsAffected ? resStock.rowsAffected() : 0
        } catch (_) {}

        // 9. Saldos iniciais de produtos
        try {
          const resInit = txApp.db().newQuery('DELETE FROM initial_stocks').execute()
          deletedCounts.initial_stocks = resInit?.rowsAffected ? resInit.rowsAffected() : 0
        } catch (_) {}

        // 10. Links produto <-> categoria
        try {
          const resLinks = txApp.db().newQuery('DELETE FROM product_category_links').execute()
          deletedCounts.product_category_links = resLinks?.rowsAffected
            ? resLinks.rowsAffected()
            : 0
        } catch (_) {}

        // 11. Imagens de produtos
        try {
          const resImgs = txApp.db().newQuery('DELETE FROM product_images').execute()
          deletedCounts.product_images = resImgs?.rowsAffected ? resImgs.rowsAffected() : 0
        } catch (_) {}

        // 12. Variações de produtos
        try {
          const resVars = txApp.db().newQuery('DELETE FROM product_variations').execute()
          deletedCounts.product_variations = resVars?.rowsAffected ? resVars.rowsAffected() : 0
        } catch (_) {}

        // 13. Histórico de preços
        try {
          const resHist = txApp.db().newQuery('DELETE FROM product_price_history').execute()
          deletedCounts.product_price_history = resHist?.rowsAffected ? resHist.rowsAffected() : 0
        } catch (_) {}

        // 14. Produtos principais
        const resProducts = txApp.db().newQuery('DELETE FROM products').execute()
        deletedCounts.products = resProducts?.rowsAffected ? resProducts.rowsAffected() : 0
      })

      return e.json(200, {
        success: true,
        message: 'Produtos, vendas, consignações e registros relacionados limpos com sucesso.',
        deleted: deletedCounts,
      })
    } catch (err) {
      console.log('Erro ao executar limpeza de produtos:', err.message)
      return e.json(500, { error: 'Falha ao executar limpeza: ' + err.message })
    }
  },
  $apis.requireAuth(),
)

// 2. IMPORTADOR TECSON (Idempotente, com dryRun e detecção de conflitos)
routerAdd(
  'POST',
  '/backend/v1/products/import/tecson',
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
    const isDryRun = !!body.dry_run

    if (!Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Nenhum item enviado para importação.' })
    }

    const productsCol = $app.findCollectionByNameOrId('products')
    const initStockCol = $app.findCollectionByNameOrId('initial_stocks')
    const imagesCol = $app.findCollectionByNameOrId('product_images')

    let createdCount = 0
    let updatedCount = 0
    let ignoredCount = 0
    const conflicts = []
    const lineReports = []
    const imageFailures = []

    try {
      $app.runInTransaction((txApp) => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const idTecson = item.id_tecson ? String(item.id_tecson).trim() : ''
          const codProdTecson = item.codigo_produto_tecson
            ? String(item.codigo_produto_tecson).trim()
            : ''
          const codBarrasTecson = item.codigo_barras_tecson
            ? String(item.codigo_barras_tecson).trim()
            : ''
          const nomeOriginal = item.nome_original_tecson
            ? String(item.nome_original_tecson).trim()
            : ''
          const nomeProduto = (item.nome_produto || nomeOriginal).trim()

          if (!idTecson && !codProdTecson && !codBarrasTecson && !nomeProduto) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'ignored',
              reason: 'Linha sem identificadores nem nome.',
            })
            continue
          }

          const precoVenda = Math.max(0, parseFloat(item.preco_venda) || 0)
          const custoUnitario = Math.max(0, parseFloat(item.custo_unitario) || 0)
          const saldoInicialQty = Math.max(0, parseInt(item.quantidade_estoques, 10) || 0)
          const imageUrl = item.image_url ? String(item.image_url).trim() : ''
          const importImagePath = item.import_image_path
            ? String(item.import_image_path).trim()
            : ''
          const fornecedor = item.fornecedor ? String(item.fornecedor).trim() : ''
          const dataInclusao = item.data_inclusao_tecson
            ? String(item.data_inclusao_tecson).trim()
            : ''

          try {
            let existing = null
            if (idTecson) {
              try {
                existing = txApp.findFirstRecordByData('products', 'id_tecson', idTecson)
              } catch (_) {}
            }
            if (!existing && codBarrasTecson) {
              try {
                existing = txApp.findFirstRecordByData(
                  'products',
                  'codigo_barras_tecson',
                  codBarrasTecson,
                )
              } catch (_) {}
            }

            if (existing) {
              const localNome =
                existing.getString('nome_produto') || existing.getString('description')
              const localPreco = existing.getFloat('selling_price')
              const hasConflict =
                (localNome && nomeProduto && localNome !== nomeProduto) ||
                (localPreco > 0 && precoVenda > 0 && Math.abs(localPreco - precoVenda) > 0.01)

              if (hasConflict) {
                conflicts.push({
                  index: i,
                  product_id: existing.getString('produto_id') || existing.id,
                  field: localNome !== nomeProduto ? 'nome' : 'preco_venda',
                  local_value: localNome !== nomeProduto ? localNome : localPreco,
                  origin_value: localNome !== nomeProduto ? nomeProduto : precoVenda,
                })
              }

              if (!isDryRun) {
                existing.set('id_tecson', idTecson)
                existing.set('codigo_produto_tecson', codProdTecson)
                existing.set('codigo_barras_tecson', codBarrasTecson)
                existing.set(
                  'nome_original_tecson',
                  nomeOriginal || existing.getString('nome_original_tecson'),
                )
                existing.set(
                  'data_inclusao_tecson',
                  dataInclusao || existing.getString('data_inclusao_tecson'),
                )
                if (fornecedor && !existing.getString('fornecedor')) {
                  existing.set('fornecedor', fornecedor)
                }
                if (custoUnitario > 0 && !existing.getFloat('custo_unitario')) {
                  existing.set('custo_unitario', custoUnitario)
                  existing.set('invested_value', custoUnitario)
                }
                if (importImagePath && !existing.getString('import_image_path')) {
                  existing.set('import_image_path', importImagePath)
                }
                if (imageUrl && !existing.getString('image_url')) {
                  existing.set('image_url', imageUrl)
                }
                if (item.variacao_resumo_bruto) {
                  existing.set('variacao_resumo_bruto', String(item.variacao_resumo_bruto))
                }
                if (item.tipo_produto_bruto && !existing.getString('tipo_produto_bruto')) {
                  existing.set('tipo_produto_bruto', String(item.tipo_produto_bruto))
                }
                if (item.nome_produto_pai_bruto && !existing.getString('nome_produto_pai_bruto')) {
                  existing.set('nome_produto_pai_bruto', String(item.nome_produto_pai_bruto))
                }
                if (item.cod_produto_pai_bruto && !existing.getString('cod_produto_pai_bruto')) {
                  existing.set('cod_produto_pai_bruto', String(item.cod_produto_pai_bruto))
                }
                if (
                  item.codigo_barras_pai_bruto &&
                  !existing.getString('codigo_barras_pai_bruto')
                ) {
                  existing.set('codigo_barras_pai_bruto', String(item.codigo_barras_pai_bruto))
                }

                // Saldo inicial não deve duplicar em reimportação
                const initStockFilter = "product = '" + existing.id + "' && origem = 'Tecson'"
                const existInitStocks = txApp.findRecordsByFilter(
                  'initial_stocks',
                  initStockFilter,
                  '',
                  1,
                  0,
                )
                if (existInitStocks.length > 0) {
                  const initRec = existInitStocks[0]
                  initRec.set('quantidade', saldoInicialQty)
                  initRec.set('id_origem', idTecson)
                  txApp.save(initRec)
                } else {
                  const initRec = new Record(initStockCol)
                  initRec.set('product', existing.id)
                  initRec.set('origem', 'Tecson')
                  initRec.set('id_origem', idTecson)
                  initRec.set('quantidade', saldoInicialQty)
                  initRec.set('localizacao', 'A definir')
                  initRec.set('data_registro', new Date().toISOString())
                  initRec.set('is_ativo', true)
                  txApp.save(initRec)
                }

                if (existing.getInt('quantity') === 0 && saldoInicialQty > 0) {
                  existing.set('quantity', saldoInicialQty)
                  existing.set('status', 'available')
                }

                txApp.save(existing)
              }

              updatedCount++
              lineReports.push({
                index: i,
                status: 'updated',
                code: codBarrasTecson || codProdTecson,
                name: nomeProduto,
                product_id: existing.id,
              })
            } else {
              if (!isDryRun) {
                const ts = new Date().getTime().toString().slice(-6)
                const rand1 = Math.floor(1000 + Math.random() * 9000).toString()
                const produtoId = 'PROD-' + ts + '-' + rand1
                const rand2 = Math.floor(100000 + Math.random() * 900000).toString()
                const skuInterno = 'SCG-' + rand2

                const newProd = new Record(productsCol)
                newProd.set('produto_id', produtoId)
                newProd.set('sku_interno', skuInterno)
                newProd.set('nome_produto', nomeProduto)
                newProd.set(
                  'description',
                  nomeProduto || codBarrasTecson || codProdTecson || 'Produto Tecson',
                )
                newProd.set('code', codBarrasTecson || codProdTecson || skuInterno)
                newProd.set('codigo_barras', codBarrasTecson)
                newProd.set('id_tecson', idTecson)
                newProd.set('codigo_produto_tecson', codProdTecson)
                newProd.set('codigo_barras_tecson', codBarrasTecson)
                newProd.set('nome_original_tecson', nomeOriginal)
                newProd.set('data_inclusao_tecson', dataInclusao)
                newProd.set('fornecedor', fornecedor)
                newProd.set('selling_price', precoVenda)
                newProd.set('custo_unitario', custoUnitario)
                newProd.set('invested_value', custoUnitario)
                newProd.set(
                  'quantity',
                  typeof saldoInicialQty === 'number' && !isNaN(saldoInicialQty)
                    ? saldoInicialQty
                    : 0,
                )
                newProd.set('status', saldoInicialQty > 0 ? 'available' : 'unavailable')
                newProd.set('ativo_interno', true)
                newProd.set('publicar_no_ecommerce', false)
                newProd.set('destaque_ecommerce', false)
                newProd.set('image_url', imageUrl)
                newProd.set('import_image_path', importImagePath)

                if (item.tipo_produto_bruto)
                  newProd.set('tipo_produto_bruto', String(item.tipo_produto_bruto))
                if (item.variacao_resumo_bruto)
                  newProd.set('variacao_resumo_bruto', String(item.variacao_resumo_bruto))
                if (item.nome_produto_pai_bruto)
                  newProd.set('nome_produto_pai_bruto', String(item.nome_produto_pai_bruto))
                if (item.cod_produto_pai_bruto)
                  newProd.set('cod_produto_pai_bruto', String(item.cod_produto_pai_bruto))
                if (item.codigo_barras_pai_bruto)
                  newProd.set('codigo_barras_pai_bruto', String(item.codigo_barras_pai_bruto))

                txApp.save(newProd)

                const initRec = new Record(initStockCol)
                initRec.set('product', newProd.id)
                initRec.set('origem', 'Tecson')
                initRec.set('id_origem', idTecson)
                initRec.set('quantidade', saldoInicialQty)
                initRec.set('localizacao', 'A definir')
                initRec.set('data_registro', new Date().toISOString())
                initRec.set('is_ativo', true)
                txApp.save(initRec)

                if (imageUrl) {
                  const imgRec = new Record(imagesCol)
                  imgRec.set('product', newProd.id)
                  imgRec.set('image_url', imageUrl)
                  imgRec.set('is_principal', true)
                  imgRec.set('sort_order', 1)
                  imgRec.set('origem', 'Tecson')
                  txApp.save(imgRec)
                }
              }

              createdCount++
              lineReports.push({
                index: i,
                status: 'created',
                code: codBarrasTecson || codProdTecson,
                name: nomeProduto,
              })
            }
          } catch (rowErr) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'error',
              code: codBarrasTecson || codProdTecson,
              name: nomeProduto,
              reason: rowErr.message || 'Erro ao processar item',
            })
          }
        }

        if (isDryRun) {
          throw new Error('DRY_RUN_COMPLETED')
        }
      })
    } catch (txErr) {
      if (txErr.message !== 'DRY_RUN_COMPLETED') {
        console.log('Erro ao processar lote Tecson:', txErr.message)
        return e.json(500, { error: 'Falha na gravação do lote Tecson: ' + txErr.message })
      }
    }

    return e.json(200, {
      success: true,
      dry_run: isDryRun,
      total_received: items.length,
      created: createdCount,
      updated: updatedCount,
      ignored: ignoredCount,
      conflicts,
      image_failures: imageFailures,
      sample_reports: lineReports.slice(0, 100),
    })
  },
  $apis.requireAuth(),
)

// 3. IMPORTADOR SCAGLIONI (Idempotente por (origem=Scaglioni, id_scaglioni), com dryRun, proteção contra sobrescrita manual e relatório completo)
routerAdd(
  'POST',
  '/backend/v1/products/import/scaglioni',
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
    const isDryRun = !!body.dry_run

    if (!Array.isArray(items) || items.length === 0) {
      return e.json(400, { error: 'Nenhum item enviado para importação.' })
    }

    const productsCol = $app.findCollectionByNameOrId('products')
    const initStockCol = $app.findCollectionByNameOrId('initial_stocks')
    const imagesCol = $app.findCollectionByNameOrId('product_images')
    const brandsCol = $app.findCollectionByNameOrId('brands')
    const catsCol = $app.findCollectionByNameOrId('product_categories')
    const linksCol = $app.findCollectionByNameOrId('product_category_links')

    let createdCount = 0
    let updatedCount = 0
    let ignoredCount = 0
    const conflicts = []
    const lineReports = []
    const imageFailures = []

    try {
      $app.runInTransaction((txApp) => {
        // Carrega sequência atual de produtos para geração numérica sequencial contínua dentro da transação
        let currentSeq = 0
        const seqRows = []
        try {
          txApp
            .db()
            .newQuery(
              "SELECT current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
            )
            .all(seqRows)
          if (seqRows && seqRows.length > 0 && seqRows[0].current_value !== undefined) {
            currentSeq = parseInt(seqRows[0].current_value, 10) || 0
          }
        } catch (_) {}

        // Verifica também maior número existente em products
        try {
          const maxProdRows = []
          txApp.db().newQuery('SELECT sku_novo, code FROM products').all(maxProdRows)
          for (let pIdx = 0; pIdx < maxProdRows.length; pIdx++) {
            const sn = (maxProdRows[pIdx].sku_novo || '').trim()
            const c = (maxProdRows[pIdx].code || '').trim()
            if (/^\d+$/.test(sn)) {
              const v = parseInt(sn, 10)
              if (!isNaN(v) && v > currentSeq) currentSeq = v
            }
            if (/^\d+$/.test(c)) {
              const v = parseInt(c, 10)
              if (!isNaN(v) && v > currentSeq) currentSeq = v
            }
          }
        } catch (_) {}

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const idScaglioni = item.id_scaglioni ? String(item.id_scaglioni).trim() : ''
          const skuScaglioni = item.sku_scaglioni ? String(item.sku_scaglioni).trim() : ''
          const slugScaglioni =
            item.slug_scaglioni || item.slug ? String(item.slug_scaglioni || item.slug).trim() : ''
          const nomeOriginal = item.nome_original_scaglioni
            ? String(item.nome_original_scaglioni).trim()
            : ''
          const nomeProduto = (item.nome_produto || item.nome || nomeOriginal).trim()

          // Linha vazia ou sem identificadores nem nome
          if (!idScaglioni && !skuScaglioni && !nomeProduto) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'ignored',
              reason: 'Linha sem ID Scaglioni nem nome de produto.',
            })
            continue
          }

          const precoVenda = Math.max(0, parseFloat(item.preco_venda || item.preco) || 0)

          // Preco promocional: vazio permanece vazio (null), nunca zero
          let precoPromo = null
          if (
            item.preco_promocional !== undefined &&
            item.preco_promocional !== null &&
            String(item.preco_promocional).trim() !== ''
          ) {
            const parsedPromo = parseFloat(item.preco_promocional)
            if (!isNaN(parsedPromo) && parsedPromo > 0) {
              precoPromo = parsedPromo
            }
          }

          if (precoPromo !== null && precoPromo >= precoVenda && precoVenda > 0) {
            conflicts.push({
              index: i,
              field: 'preco_promocional',
              reason: 'Preço promocional deve ser menor que o preço de venda.',
              preco_venda: precoVenda,
              preco_promocional: precoPromo,
            })
          }

          const saldoInicialQty = Math.max(
            0,
            parseInt(item.estoque || item.quantidade || item.saldo_inicial_scaglioni, 10) || 0,
          )

          // Descrição com preservação integral de parágrafos/quebras de linha
          const descricao = item.descricao ? String(item.descricao) : ''

          const altura = parseFloat(item.altura_cm) || null
          const largura = parseFloat(item.largura_cm) || null
          const comprimento = parseFloat(item.comprimento_cm) || null
          const peso = parseFloat(item.peso_g) || null

          // ativo: estado observado no e-commerce (não confundir com ativo_interno)
          // Se booleano já veio no payload ou string 'true'/'false'
          let estadoAtivoEcommerce = true
          if (typeof item.ativo === 'boolean') {
            estadoAtivoEcommerce = item.ativo
          } else if (typeof item.estado_ativo_ecommerce === 'boolean') {
            estadoAtivoEcommerce = item.estado_ativo_ecommerce
          } else if (item.ativo !== undefined && item.ativo !== null) {
            const s = String(item.ativo).trim().toLowerCase()
            estadoAtivoEcommerce = s === 'true' || s === '1' || s === 'sim'
          }

          const destaqueEcommerce =
            item.destaque === true ||
            item.destaque === 'true' ||
            item.destaque_ecommerce === true ||
            item.destaque_ecommerce === 'true'

          const createdAtScaglioni = item.created_at ? String(item.created_at).trim() : ''
          const updatedAtScaglioni = item.updated_at ? String(item.updated_at).trim() : ''

          // Função auxiliar para sanitizar e normalizar URL de imagem
          const sanitizeImageUrl = (u) => {
            if (!u) return ''
            let str = String(u).trim()
            // Remove BOM, CR, LF
            str = str
              .replace(/^[\uFEFF\u0000-\u001F]+/, '')
              .replace(/[\r\n\t]+/g, '')
              .trim()
            // Remove aspas ou apóstrofos envolventes
            str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
            // Remove colchetes envolventes se sobrou de lista serializada
            str = str.replace(/^[\[({<]+|[\])}>]+$/g, '').trim()
            // Remove novamente aspas se estavam dentro de colchetes ["url"]
            str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
            return str
          }

          // Função auxiliar para extrair lista de URLs de galeria (suporta Array, JSON string, pipe |, vírgula, ponto e vírgula, quebras de linha)
          const extractGalleryUrls = (input) => {
            if (!input) return []
            const results = []

            const addCandidate = (val) => {
              if (!val) return
              if (Array.isArray(val)) {
                for (const sub of val) addCandidate(sub)
                return
              }
              const strVal = String(val).trim()
              if (!strVal) return

              // Tentar interpretar se for JSON array string ex: ["https://...","https://..."]
              if (strVal.startsWith('[') && strVal.endsWith(']')) {
                try {
                  const parsed = JSON.parse(strVal)
                  if (Array.isArray(parsed)) {
                    for (const sub of parsed) addCandidate(sub)
                    return
                  }
                } catch (_) {
                  // Se falhar o JSON.parse, remove colchetes e continua split
                  const unbracketed = strVal.replace(/^\[\s*|\s*\]$/g, '')
                  return addCandidate(unbracketed)
                }
              }

              // Se tiver delimitadores como | ou quebra de linha ou vírgula entre aspas/urls
              if (strVal.includes('|') || strVal.includes('\n') || strVal.includes('\r')) {
                const parts = strVal.split(/[|\r\n]+/)
                for (const p of parts) addCandidate(p)
                return
              }

              // Se tiver múltiplas URLs separadas por vírgula ou ponto e vírgula (sem quebrar a querystring da própria URL)
              // Exemplo: "https://...token=abc","https://...token=def" ou https://...;https://...
              if (strVal.includes('http://') || strVal.includes('https://')) {
                // Se houver mais de uma ocorrência de http(s)://
                const httpMatches = strVal.match(/https?:\/\/[^\s"'`|,;\]\>]+/gi)
                if (httpMatches && httpMatches.length > 1) {
                  for (const match of httpMatches) {
                    const cleaned = sanitizeImageUrl(match)
                    if (cleaned) results.push(cleaned)
                  }
                  return
                }
              }

              const cleaned = sanitizeImageUrl(strVal)
              if (cleaned) {
                results.push(cleaned)
              }
            }

            if (Array.isArray(input)) {
              for (const item of input) {
                addCandidate(item)
              }
            } else {
              addCandidate(input)
            }

            return results
          }

          const rawImagemPrincipal = item.imagem_url || item.image_url || ''
          const imagemPrincipal = sanitizeImageUrl(rawImagemPrincipal)

          // Galeria em ordem, sem duplicar a imagem principal
          const rawUrlsGaleria = extractGalleryUrls(item.urls_imagens)

          const urlsGaleria = []
          const seenGalleryUrls = new Set()
          if (imagemPrincipal) {
            seenGalleryUrls.add(imagemPrincipal)
          }

          for (const rawUrl of rawUrlsGaleria) {
            const cleanU = sanitizeImageUrl(rawUrl)
            if (cleanU && !seenGalleryUrls.has(cleanU)) {
              seenGalleryUrls.add(cleanU)
              urlsGaleria.push(cleanU)
            }
          }

          // Validação de protocolo estrita mas tolerante (http:// ou https://)
          const isValidHttpUrl = (u) => {
            if (!u || typeof u !== 'string') return false
            return /^https?:\/\//i.test(u.trim())
          }

          // Validação / registro de falhas de imagem com URLs malformadas
          if (imagemPrincipal && !isValidHttpUrl(imagemPrincipal)) {
            imageFailures.push({
              index: i,
              code: skuScaglioni || idScaglioni,
              name: nomeProduto,
              url: imagemPrincipal,
              type: 'principal',
              reason: 'URL não inicia com protocolo http/https válido.',
            })
          }
          for (const extraU of urlsGaleria) {
            if (extraU && !isValidHttpUrl(extraU)) {
              imageFailures.push({
                index: i,
                code: skuScaglioni || idScaglioni,
                name: nomeProduto,
                url: extraU,
                type: 'galeria',
                reason: 'URL de galeria não inicia com protocolo http/https válido.',
              })
            }
          }

          // Vincular ou criar Marca
          let brandRecord = null
          const brandName = item.marca ? String(item.marca).trim() : ''
          if (brandName) {
            try {
              brandRecord = txApp.findFirstRecordByData('brands', 'name', brandName)
            } catch (_) {
              if (!isDryRun) {
                brandRecord = new Record(brandsCol)
                brandRecord.set('name', brandName)
                const brandSlug = brandName
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                brandRecord.set('slug', brandSlug)
                txApp.save(brandRecord)
              }
            }
          }

          try {
            // Chave de reimportação idempotente: (origem=Scaglioni, id_scaglioni)
            let existing = null
            if (idScaglioni) {
              try {
                existing = txApp.findFirstRecordByData('products', 'id_scaglioni', idScaglioni)
              } catch (_) {}
            }
            if (!existing && skuScaglioni) {
              try {
                existing = txApp.findFirstRecordByData('products', 'sku_scaglioni', skuScaglioni)
              } catch (_) {}
            }

            if (existing) {
              // REIMPORTAÇÃO IDEMPOTENTE:
              // Verificar conflitos de edição manual para NUNCA sobrescrever silenciosamente
              const localNome =
                existing.getString('nome_produto') || existing.getString('description')
              const localPreco = existing.getFloat('selling_price')
              const localDesc = existing.getString('description')

              if (localNome && nomeProduto && localNome !== nomeProduto) {
                conflicts.push({
                  index: i,
                  product_id: existing.getString('produto_id') || existing.id,
                  code: skuScaglioni || idScaglioni,
                  field: 'nome_produto',
                  local_value: localNome,
                  origin_value: nomeProduto,
                  reason: 'Nome local alterado manualmente difere do valor de origem Scaglioni.',
                })
              }
              if (localPreco > 0 && precoVenda > 0 && Math.abs(localPreco - precoVenda) > 0.01) {
                conflicts.push({
                  index: i,
                  product_id: existing.getString('produto_id') || existing.id,
                  code: skuScaglioni || idScaglioni,
                  field: 'preco_venda',
                  local_value: localPreco,
                  origin_value: precoVenda,
                  reason: 'Preço local alterado manualmente difere do valor de origem Scaglioni.',
                })
              }

              if (!isDryRun) {
                // Atualiza campos de rastreabilidade de origem sem sobrescrever edições manuais
                existing.set('id_scaglioni', idScaglioni)
                existing.set('sku_scaglioni', skuScaglioni)

                // Garante que sku_novo e sku_interno estejam preenchidos pelo sistema com código numérico sequencial
                if (
                  !existing.getString('sku_novo') ||
                  !/^\d+$/.test(existing.getString('sku_novo'))
                ) {
                  currentSeq++
                  const generatedNumCode =
                    currentSeq < 100000 ? String(currentSeq).padStart(5, '0') : String(currentSeq)
                  existing.set('sku_novo', generatedNumCode)
                  if (!existing.getString('sku_interno')) {
                    existing.set('sku_interno', generatedNumCode)
                  }
                }

                // Garante produto_id gerado pelo sistema se estiver ausente
                if (!existing.getString('produto_id')) {
                  const ts = new Date().getTime().toString().slice(-6)
                  const rand1 = Math.floor(1000 + Math.random() * 9000).toString()
                  existing.set('produto_id', 'PROD-' + ts + '-' + rand1)
                }

                existing.set(
                  'nome_original_scaglioni',
                  nomeOriginal || existing.getString('nome_original_scaglioni'),
                )
                existing.set(
                  'created_at_scaglioni',
                  createdAtScaglioni || existing.getString('created_at_scaglioni'),
                )
                if (createdAtScaglioni) {
                  existing.set('criado_em_origem', createdAtScaglioni)
                }
                existing.set('publicar_no_ecommerce', estadoAtivoEcommerce)
                existing.set('estado_ativo_ecommerce', estadoAtivoEcommerce)
                existing.set('destaque_ecommerce', destaqueEcommerce)

                // Regra crítica: nome preenche exclusivamente nome_produto; descricao preenche exclusivamente descricao e nunca sobrescreve nome_produto
                if (descricao) {
                  existing.set('description', descricao)
                }

                if (brandRecord) {
                  existing.set('marca_id', brandRecord.id)
                }
                if (altura) existing.set('altura_cm', altura)
                if (largura) existing.set('largura_cm', largura)
                if (comprimento) existing.set('comprimento_cm', comprimento)
                if (peso) existing.set('peso_g', peso)

                // Saldo inicial Scaglioni: idempotente — atualiza o registro único existente em initial_stocks
                const initStockFilter = "product = '" + existing.id + "' && origem = 'Scaglioni'"
                const existInitStocks = txApp.findRecordsByFilter(
                  'initial_stocks',
                  initStockFilter,
                  '',
                  1,
                  0,
                )
                if (existInitStocks.length > 0) {
                  const initRec = existInitStocks[0]
                  initRec.set('quantidade', saldoInicialQty)
                  initRec.set('id_origem', idScaglioni)
                  initRec.set('localizacao', 'A definir')
                  txApp.save(initRec)
                } else {
                  const initRec = new Record(initStockCol)
                  initRec.set('product', existing.id)
                  initRec.set('origem', 'Scaglioni')
                  initRec.set('id_origem', idScaglioni)
                  initRec.set('quantidade', saldoInicialQty)
                  initRec.set('localizacao', 'A definir')
                  initRec.set('data_registro', new Date().toISOString())
                  initRec.set('is_ativo', true)
                  txApp.save(initRec)
                }

                // Não duplicar imagens da galeria na reimportação: atualiza ou insere galeria mantendo idempotência
                let existingOrder = 1
                const currentProductImgs = txApp.findRecordsByFilter(
                  'product_images',
                  "product = '" + existing.id + "'",
                  'sort_order',
                  100,
                  0,
                )
                const currentUrlsSet = new Set(
                  currentProductImgs.map((img) => img.getString('image_url')).filter(Boolean),
                )
                if (currentProductImgs.length > 0) {
                  existingOrder = currentProductImgs.length + 1
                }

                if (imagemPrincipal && !currentUrlsSet.has(imagemPrincipal)) {
                  const imgRec = new Record(imagesCol)
                  imgRec.set('product', existing.id)
                  imgRec.set('image_url', imagemPrincipal)
                  imgRec.set('is_principal', currentProductImgs.length === 0)
                  imgRec.set('sort_order', 1)
                  imgRec.set('origem', 'Scaglioni')
                  txApp.save(imgRec)
                  currentUrlsSet.add(imagemPrincipal)
                }

                for (const extraUrl of urlsGaleria) {
                  if (extraUrl && !currentUrlsSet.has(extraUrl)) {
                    const extraRec = new Record(imagesCol)
                    extraRec.set('product', existing.id)
                    extraRec.set('image_url', extraUrl)
                    extraRec.set('is_principal', false)
                    extraRec.set('sort_order', existingOrder++)
                    extraRec.set('origem', 'Scaglioni')
                    txApp.save(extraRec)
                    currentUrlsSet.add(extraUrl)
                  }
                }

                txApp.save(existing)
              }

              updatedCount++
              lineReports.push({
                index: i,
                status: 'updated',
                code: skuScaglioni || idScaglioni,
                name: nomeProduto,
                product_id: existing.id,
              })
            } else {
              // NOVO PRODUTO SCAGLIONI
              if (!isDryRun) {
                // NÃO importar id do CSV como produto_id. O produto_id deve ser GERADO pelo sistema.
                const ts = new Date().getTime().toString().slice(-6)
                const rand1 = Math.floor(1000 + Math.random() * 9000).toString()
                const produtoId = 'PROD-' + ts + '-' + rand1

                // Gerar sku_novo numérico, sequencial e crescente pelo próprio sistema (00001..99999, 100000...)
                currentSeq++
                const skuNovo =
                  currentSeq < 100000 ? String(currentSeq).padStart(5, '0') : String(currentSeq)
                const skuInterno = skuNovo

                const newProd = new Record(productsCol)
                newProd.set('produto_id', produtoId)
                newProd.set('sku_novo', skuNovo)
                newProd.set('sku_interno', skuInterno)

                // Regras críticas do usuário:
                // - A coluna nome deve preencher EXCLUSIVAMENTE o campo nome_produto.
                // - A coluna descricao deve preencher EXCLUSIVAMENTE o campo descricao e NUNCA pode sobrescrever nome_produto.
                newProd.set('nome_produto', nomeProduto)
                newProd.set('nome_original_scaglioni', nomeOriginal || nomeProduto)
                newProd.set('description', descricao || '')

                // code do sistema: utiliza o código numérico novo sequencial (ou sku_scaglioni se especificado)
                newProd.set('code', skuNovo)

                // NÃO importar slug nem updated_at
                // Armazenar id e sku de rastreabilidade Scaglioni
                newProd.set('id_scaglioni', idScaglioni)
                newProd.set('sku_scaglioni', skuScaglioni)

                // preco -> preco_venda (selling_price)
                newProd.set('selling_price', precoVenda)
                if (precoPromo !== null) {
                  newProd.set('preco_promocional', precoPromo)
                }

                if (altura) newProd.set('altura_cm', altura)
                if (largura) newProd.set('largura_cm', largura)
                if (comprimento) newProd.set('comprimento_cm', comprimento)
                if (peso) newProd.set('peso_g', peso)

                // estoque -> qtde_inicial (initial_stocks e quantity)
                newProd.set('quantity', saldoInicialQty)
                newProd.set('status', saldoInicialQty > 0 ? 'available' : 'unavailable')
                newProd.set('ativo_interno', true)

                // ativo -> publicar_no_ecommerce
                newProd.set('publicar_no_ecommerce', estadoAtivoEcommerce)
                newProd.set('estado_ativo_ecommerce', estadoAtivoEcommerce)

                // destaque -> destaque_ecommerce
                newProd.set('destaque_ecommerce', destaqueEcommerce)

                // created_at -> criado_em_origem (e created_at_scaglioni)
                newProd.set('created_at_scaglioni', createdAtScaglioni)
                if (createdAtScaglioni) {
                  newProd.set('criado_em_origem', createdAtScaglioni)
                }

                // imagem_url -> imagem_principal (image_url e product_images)
                newProd.set('image_url', imagemPrincipal)
                if (item.arquivos_imagens) {
                  newProd.set('import_image_path', String(item.arquivos_imagens).trim())
                }
                if (brandRecord) {
                  newProd.set('marca_id', brandRecord.id)
                }

                txApp.save(newProd)

                // Criar Saldo Inicial Scaglioni (localização: 'A definir')
                const initRec = new Record(initStockCol)
                initRec.set('product', newProd.id)
                initRec.set('origem', 'Scaglioni')
                initRec.set('id_origem', idScaglioni)
                initRec.set('quantidade', saldoInicialQty)
                initRec.set('localizacao', 'A definir')
                initRec.set('data_registro', new Date().toISOString())
                initRec.set('is_ativo', true)
                txApp.save(initRec)

                // Associar imagens: imagem_url (principal) e urls_imagens (galeria sem duplicar principal)
                let sortOrder = 1
                if (imagemPrincipal) {
                  const imgRec = new Record(imagesCol)
                  imgRec.set('product', newProd.id)
                  imgRec.set('image_url', imagemPrincipal)
                  imgRec.set('is_principal', true)
                  imgRec.set('sort_order', sortOrder++)
                  imgRec.set('origem', 'Scaglioni')
                  txApp.save(imgRec)
                }

                for (const extraUrl of urlsGaleria) {
                  if (extraUrl && extraUrl !== imagemPrincipal) {
                    const extraRec = new Record(imagesCol)
                    extraRec.set('product', newProd.id)
                    extraRec.set('image_url', extraUrl)
                    extraRec.set('is_principal', false)
                    extraRec.set('sort_order', sortOrder++)
                    extraRec.set('origem', 'Scaglioni')
                    txApp.save(extraRec)
                  }
                }

                // Mapear Categorias: converte ID numérico para a categoria correspondente e cadastra se necessário
                let catsToLink = []
                if (Array.isArray(item.categorias)) {
                  catsToLink = item.categorias
                } else if (typeof item.categorias === 'string' && item.categorias.trim()) {
                  catsToLink = item.categorias.split('|').map((c) => c.trim())
                } else if (item.categoria) {
                  catsToLink = [String(item.categoria).trim()]
                }

                const catPrincipalTarget =
                  item.categoria_principal || (catsToLink.length > 0 ? catsToLink[0] : null)

                for (const catName of catsToLink) {
                  const cleanCat = String(catName || '').trim()
                  if (!cleanCat) continue

                  let catRecord = null
                  try {
                    catRecord = txApp.findFirstRecordByData('product_categories', 'name', cleanCat)
                  } catch (_) {
                    catRecord = new Record(catsCol)
                    catRecord.set('name', cleanCat)
                    const catSlug = cleanCat
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                    catRecord.set(
                      'slug',
                      catSlug || 'cat-' + Math.floor(1000 + Math.random() * 9000),
                    )
                    txApp.save(catRecord)
                  }

                  try {
                    const link = new Record(linksCol)
                    link.set('product', newProd.id)
                    link.set('category', catRecord.id)
                    link.set('is_principal', cleanCat === catPrincipalTarget)
                    txApp.save(link)
                  } catch (_) {}
                }
              }

              createdCount++
              lineReports.push({
                index: i,
                status: 'created',
                code: skuScaglioni || idScaglioni,
                name: nomeProduto,
              })
            }
          } catch (rowErr) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'error',
              code: skuScaglioni || idScaglioni,
              name: nomeProduto,
              reason: rowErr.message || 'Erro ao processar item',
            })
          }
        }

        // Atualiza a sequência persistida caso não seja dry-run
        if (!isDryRun) {
          try {
            txApp
              .db()
              .newQuery(
                "UPDATE app_sequences SET current_value = {:val}, updated = {:updated} WHERE name = 'product_numeric_code'",
              )
              .bind({ val: currentSeq, updated: new Date().toISOString() })
              .execute()
          } catch (_) {}
        }

        if (isDryRun) {
          throw new Error('DRY_RUN_COMPLETED')
        }
      })
    } catch (txErr) {
      if (txErr.message !== 'DRY_RUN_COMPLETED') {
        console.log('Erro ao processar lote Scaglioni:', txErr.message)
        return e.json(500, { error: 'Falha na gravação do lote Scaglioni: ' + txErr.message })
      }
    }

    return e.json(200, {
      success: true,
      dry_run: isDryRun,
      total_received: items.length,
      created: createdCount,
      updated: updatedCount,
      ignored: ignoredCount,
      conflicts,
      image_failures: imageFailures,
      sample_reports: lineReports.slice(0, 100),
    })
  },
  $apis.requireAuth(),
)

// 4. CONCILIAÇÃO MANUAL / ASSOCIAÇÃO TECSON <-> SCAGLIONI
routerAdd(
  'POST',
  '/backend/v1/products/associate-manual',
  (e) => {
    const authUser = e.auth
    if (!authUser) {
      return e.json(401, { error: 'Não autorizado.' })
    }

    const role = authUser.getString('role')
    if (role !== 'admin' && role !== 'operator') {
      return e.json(403, { error: 'Permissão negada.' })
    }

    const body = e.requestInfo().body || {}
    const { tecson_product_id, scaglioni_product_id, chosen_initial_stock_origin } = body

    if (!tecson_product_id || !scaglioni_product_id) {
      return e.json(400, { error: 'IDs dos produtos Tecson e Scaglioni são obrigatórios.' })
    }
    if (
      !chosen_initial_stock_origin ||
      (chosen_initial_stock_origin !== 'Tecson' && chosen_initial_stock_origin !== 'Scaglioni')
    ) {
      return e.json(400, {
        error:
          'É obrigatório escolher qual saldo inicial prevalecerá (Tecson ou Scaglioni). Os saldos não podem ser somados automaticamente.',
      })
    }

    try {
      let unifiedRecord = null
      $app.runInTransaction((txApp) => {
        const prodTecson = txApp.findRecordById('products', tecson_product_id)
        const prodScaglioni = txApp.findRecordById('products', scaglioni_product_id)

        const tecsonInitStocks = txApp.findRecordsByFilter(
          'initial_stocks',
          "product = '" + tecson_product_id + "' && origem = 'Tecson'",
          '',
          1,
          0,
        )
        const scaglioniInitStocks = txApp.findRecordsByFilter(
          'initial_stocks',
          "product = '" + scaglioni_product_id + "' && origem = 'Scaglioni'",
          '',
          1,
          0,
        )

        const qtyTecson =
          tecsonInitStocks.length > 0
            ? tecsonInitStocks[0].getInt('quantidade')
            : prodTecson.getInt('quantity')
        const qtyScaglioni =
          scaglioniInitStocks.length > 0
            ? scaglioniInitStocks[0].getInt('quantidade')
            : prodScaglioni.getInt('quantity')

        const finalInitialQty = chosen_initial_stock_origin === 'Tecson' ? qtyTecson : qtyScaglioni

        // Mesclar dados Scaglioni no registro Tecson unificado
        prodTecson.set('id_scaglioni', prodScaglioni.getString('id_scaglioni'))
        prodTecson.set('sku_scaglioni', prodScaglioni.getString('sku_scaglioni'))
        prodTecson.set('slug_scaglioni', prodScaglioni.getString('slug_scaglioni'))
        prodTecson.set(
          'slug',
          prodScaglioni.getString('slug') || prodScaglioni.getString('slug_scaglioni'),
        )
        prodTecson.set(
          'nome_original_scaglioni',
          prodScaglioni.getString('nome_original_scaglioni'),
        )
        prodTecson.set('created_at_scaglioni', prodScaglioni.getString('created_at_scaglioni'))
        prodTecson.set('updated_at_scaglioni', prodScaglioni.getString('updated_at_scaglioni'))
        prodTecson.set('estado_ativo_ecommerce', prodScaglioni.getBool('estado_ativo_ecommerce'))
        prodTecson.set('publicar_no_ecommerce', true)
        prodTecson.set('destaque_ecommerce', prodScaglioni.getBool('destaque_ecommerce'))

        if (
          !prodTecson.getString('description') ||
          prodTecson.getString('description') === prodTecson.getString('nome_produto')
        ) {
          prodTecson.set('description', prodScaglioni.getString('description'))
        }
        if (prodScaglioni.getFloat('preco_promocional') > 0) {
          prodTecson.set('preco_promocional', prodScaglioni.getFloat('preco_promocional'))
        }
        if (prodScaglioni.getString('marca_id')) {
          prodTecson.set('marca_id', prodScaglioni.getString('marca_id'))
        }

        prodTecson.set('quantity', finalInitialQty)
        prodTecson.set('status', finalInitialQty > 0 ? 'available' : 'unavailable')

        txApp.save(prodTecson)

        try {
          txApp
            .db()
            .newQuery(
              'UPDATE product_category_links SET product = {:newId} WHERE product = {:oldId}',
            )
            .bind({ newId: prodTecson.id, oldId: prodScaglioni.id })
            .execute()
        } catch (_) {}

        try {
          txApp
            .db()
            .newQuery('UPDATE product_images SET product = {:newId} WHERE product = {:oldId}')
            .bind({ newId: prodTecson.id, oldId: prodScaglioni.id })
            .execute()
        } catch (_) {}

        if (tecsonInitStocks.length > 0) {
          const tRec = tecsonInitStocks[0]
          tRec.set('is_ativo', chosen_initial_stock_origin === 'Tecson')
          txApp.save(tRec)
        }
        if (scaglioniInitStocks.length > 0) {
          const sRec = scaglioniInitStocks[0]
          sRec.set('product', prodTecson.id)
          sRec.set('is_ativo', chosen_initial_stock_origin === 'Scaglioni')
          txApp.save(sRec)
        }

        txApp.delete(prodScaglioni)
        unifiedRecord = prodTecson
      })

      return e.json(200, {
        success: true,
        message: 'Produtos associados com sucesso e saldo inicial resolvido.',
        product: {
          id: unifiedRecord.id,
          produto_id: unifiedRecord.getString('produto_id'),
          nome: unifiedRecord.getString('nome_produto'),
          codigo_barras: unifiedRecord.getString('codigo_barras'),
          id_tecson: unifiedRecord.getString('id_tecson'),
          id_scaglioni: unifiedRecord.getString('id_scaglioni'),
          quantity: unifiedRecord.getInt('quantity'),
          chosen_origin: chosen_initial_stock_origin,
        },
      })
    } catch (err) {
      console.log('Erro na associação de produtos:', err.message)
      return e.json(400, { error: 'Falha ao associar produtos: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
