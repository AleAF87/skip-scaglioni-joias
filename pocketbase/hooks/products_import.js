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
    if (role !== 'superadmin' && role !== 'admin') {
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
    if (role !== 'superadmin' && role !== 'admin') {
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
          // Regra do usuário: O código deve vir da coluna 'codigo_barras'. Devemos descartar a coluna 'codigo_produto'.
          // A coluna codigo_produto não deve preencher nenhum campo.
          const codBarrasTecson = item.codigo_barras_tecson
            ? String(item.codigo_barras_tecson).trim()
            : ''
          const nomeOriginal = item.nome_original_tecson
            ? String(item.nome_original_tecson).trim()
            : ''
          const nomeProduto = (item.nome_produto || nomeOriginal).trim()

          // Remove zeros à esquerda se for numérico
          const stripZeros = (s) => {
            if (!s) return ''
            const t = String(s).trim()
            if (!/^\d+$/.test(t)) return t
            const stripped = t.replace(/^0+/, '')
            return stripped === '' ? '0' : stripped
          }
          const cleanCodBarrasTecson = stripZeros(codBarrasTecson)

          // Validação estrita: codigo_barras é OBRIGATÓRIO (valores de 611 a 999984)
          if (!codBarrasTecson) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'error',
              code: '—',
              name: nomeProduto || idTecson || 'Sem identificação',
              reason: 'Código obrigatório ausente: a coluna codigo_barras está vazia nesta linha.',
            })
            continue
          }

          if (!idTecson && !nomeProduto) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'ignored',
              reason: 'Linha sem identificador Tecson nem nome.',
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
            if (!existing && cleanCodBarrasTecson) {
              try {
                existing = txApp.findFirstRecordByData(
                  'products',
                  'codigo_barras_tecson',
                  cleanCodBarrasTecson,
                )
              } catch (_) {}
            }
            if (!existing && codBarrasTecson && codBarrasTecson !== cleanCodBarrasTecson) {
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
                existing.set('codigo_barras_tecson', cleanCodBarrasTecson)
                existing.set('code', cleanCodBarrasTecson)
                existing.set('codigo_barras', cleanCodBarrasTecson)
                if (existing.getString('sku_interno')) {
                  existing.set('sku_interno', stripZeros(existing.getString('sku_interno')))
                }
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
                // Se o produto não tiver minimum_quantity gravado, inicializa com 30% da quantidade inicial
                if (!existing.getInt('minimum_quantity') && saldoInicialQty > 0) {
                  existing.set('minimum_quantity', Math.max(1, Math.round(saldoInicialQty * 0.3)))
                }

                txApp.save(existing)
              }

              updatedCount++
              lineReports.push({
                index: i,
                status: 'updated',
                code: codBarrasTecson,
                name: nomeProduto,
                product_id: existing.id,
              })
            } else {
              if (!isDryRun) {
                const ts = new Date().getTime().toString().slice(-6)
                const rand1 = Math.floor(1000 + Math.random() * 9000).toString()
                const produtoId = 'PROD-' + ts + '-' + rand1

                const newProd = new Record(productsCol)
                newProd.set('produto_id', produtoId)
                // sku_interno recebe o próprio código de barras Tecson para rastreabilidade coerente sem zeros à esquerda
                newProd.set('sku_interno', cleanCodBarrasTecson)
                newProd.set('nome_produto', nomeProduto)
                newProd.set('description', nomeProduto || cleanCodBarrasTecson || 'Produto Tecson')
                newProd.set('code', cleanCodBarrasTecson)
                newProd.set('codigo_barras', cleanCodBarrasTecson)
                newProd.set('id_tecson', idTecson)
                newProd.set('codigo_barras_tecson', cleanCodBarrasTecson)
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
                newProd.set(
                  'minimum_quantity',
                  saldoInicialQty > 0 ? Math.max(1, Math.round(saldoInicialQty * 0.3)) : 1,
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
                code: codBarrasTecson,
                name: nomeProduto,
              })
            }
          } catch (rowErr) {
            ignoredCount++
            lineReports.push({
              index: i,
              status: 'error',
              code: codBarrasTecson || '—',
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
    try {
      const authUser = e.auth
      if (!authUser) {
        return e.json(401, { error: 'Não autorizado.' })
      }

      const role = authUser.getString('role')
      if (role !== 'superadmin' && role !== 'admin') {
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

      const criados = []
      const atualizados = []
      const falhados = []
      const conflicts = []
      const imageFailures = []

      // Função utilitária segura para cópia superficial de objeto sem dependência de helpers externos
      const shallowCopy = (source) => {
        const dest = {}
        if (source && typeof source === 'object') {
          const keys = Object.keys(source)
          for (let k = 0; k < keys.length; k++) {
            dest[keys[k]] = source[keys[k]]
          }
        }
        return dest
      }

      // Carrega sequência atual de produtos para geração numérica sequencial contínua linha a linha
      // Piso obrigatório: 9999 (para que o primeiro item receba 10000)
      let currentSeq = 9999
      try {
        const seqRecord = $app.findFirstRecordByFilter(
          'app_sequences',
          "name = 'product_numeric_code'",
        )
        if (seqRecord) {
          const valFromDb = seqRecord.getInt('current_value') || 0
          if (valFromDb > currentSeq) {
            currentSeq = valFromDb
          }
        }
      } catch (_) {}

      // Mapeia todos os códigos numéricos ocupados no banco (Tecson, Scaglioni, manuais etc.)
      // Interpretados como número inteiro puro (zeros à esquerda removidos)
      const usedNumericSet = {}
      try {
        // Carrega registros via SDK em páginas para cobrir a base completa de modo seguro
        let page = 1
        while (true) {
          const prodRecords = $app.findRecordsByFilter('products', '', '', 1000, (page - 1) * 1000)
          if (!prodRecords || prodRecords.length === 0) break

          for (let pIdx = 0; pIdx < prodRecords.length; pIdx++) {
            const rec = prodRecords[pIdx]
            const checkFields = [
              rec.getString('code'),
              rec.getString('sku_novo'),
              rec.getString('codigo_barras_tecson'),
              rec.getString('codigo_produto_tecson'),
              rec.getString('codigo_barras'),
              rec.getString('sku_interno'),
            ]
            for (let fIdx = 0; fIdx < checkFields.length; fIdx++) {
              const f = (checkFields[fIdx] || '').trim()
              if (/^\d+$/.test(f)) {
                const num = parseInt(f, 10)
                if (!isNaN(num)) {
                  usedNumericSet[num] = true
                }
              }
            }
          }
          if (prodRecords.length < 1000) break
          page++
        }
      } catch (errProdMap) {
        console.log('Aviso ao carregar números ocupados para importação:', errProdMap.message)
      }

      // Função auxiliar interna para obter o próximo código numérico livre pulando ocupados
      const getNextFreeSeq = () => {
        let cand = currentSeq + 1
        if (cand < 10000) cand = 10000
        while (usedNumericSet[cand]) {
          cand++
        }
        currentSeq = cand
        usedNumericSet[cand] = true
        return String(cand)
      }

      // Processamento LINHA A LINHA sem transação de lote:
      // Cada item possui seu próprio try/catch e grava independentemente.
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const lineItemIndex = typeof item.index === 'number' ? item.index : i
        const idScaglioni = item.id_scaglioni ? String(item.id_scaglioni).trim() : ''
        const skuScaglioni = item.sku_scaglioni ? String(item.sku_scaglioni).trim() : ''
        const slugScaglioni =
          item.slug_scaglioni || item.slug ? String(item.slug_scaglioni || item.slug).trim() : ''
        const nomeOriginal = item.nome_original_scaglioni
          ? String(item.nome_original_scaglioni).trim()
          : ''
        const nomeProduto = (item.nome_produto || item.nome || nomeOriginal).trim()
        const rowIdentifier = skuScaglioni || idScaglioni || nomeProduto || 'Linha ' + (i + 1)

        try {
          // Linha vazia ou sem identificadores nem nome
          if (!idScaglioni && !skuScaglioni && !nomeProduto) {
            falhados.push({
              index: lineItemIndex,
              sku: skuScaglioni || '—',
              name: nomeProduto || 'Sem identificação',
              reason: 'Linha sem ID Scaglioni, SKU nem nome de produto.',
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
              index: lineItemIndex,
              field: 'preco_promocional',
              reason: 'Preço promocional deve ser menor que o preço de venda.',
              preco_venda: precoVenda,
              preco_promocional: precoPromo,
            })
          }

          // Quantidade inicial: valor bruto preservado para validar presença/validade
          const rawEstoqueScag =
            item.estoque !== undefined && item.estoque !== null
              ? String(item.estoque)
              : item.quantidade !== undefined && item.quantidade !== null
                ? String(item.quantidade)
                : item.saldo_inicial_scaglioni !== undefined &&
                    item.saldo_inicial_scaglioni !== null
                  ? String(item.saldo_inicial_scaglioni)
                  : item.qtde_inicial !== undefined && item.qtde_inicial !== null
                    ? String(item.qtde_inicial)
                    : ''
          const rawEstoqueScagTrim = rawEstoqueScag.trim()
          const parsedEstoqueScag = parseInt(rawEstoqueScagTrim, 10)
          const estoqueInvalido =
            rawEstoqueScagTrim === '' || isNaN(parsedEstoqueScag) || parsedEstoqueScag < 0
          const saldoInicialQty = estoqueInvalido ? 0 : Math.max(0, parsedEstoqueScag)

          // Linha sem quantidade inicial válida NÃO grava produto com qtde_inicial 0:
          // aparece no relatório de linhas (falhados) com o motivo explícito.
          if (estoqueInvalido) {
            falhados.push({
              index: lineItemIndex,
              sku: skuScaglioni || idScaglioni || '—',
              name: nomeProduto || rowIdentifier,
              reason:
                'Quantidade inicial (estoque/quantidade) ausente ou inválida nesta linha do CSV — produto não gravado com qtde_inicial zerada.',
            })
            continue
          }

          // Descrição com preservação integral de parágrafos/quebras de linha
          const descricao = item.descricao ? String(item.descricao) : ''

          const altura = parseFloat(item.altura_cm) || null
          const largura = parseFloat(item.largura_cm) || null
          const comprimento = parseFloat(item.comprimento_cm) || null
          const peso = parseFloat(item.peso_g) || null

          // ativo: estado observado no e-commerce (não confundir com ativo_interno)
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
            str = str
              .replace(/^[\uFEFF\u0000-\u001F]+/, '')
              .replace(/[\r\n\t]+/g, '')
              .trim()
            str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
            str = str.replace(/^[\[({<]+|[\])}>]+$/g, '').trim()
            str = str.replace(/^["'`]+|["'`]+$/g, '').trim()
            return str
          }

          const extractGalleryUrls = (input) => {
            if (!input) return []
            const results = []

            const addCandidate = (val) => {
              if (!val) return
              if (Array.isArray(val)) {
                for (let v = 0; v < val.length; v++) addCandidate(val[v])
                return
              }
              const strVal = String(val).trim()
              if (!strVal || strVal === '[]' || strVal === '""' || strVal === "''") return

              if (strVal.startsWith('[') && strVal.endsWith(']')) {
                try {
                  const parsed = JSON.parse(strVal)
                  if (Array.isArray(parsed)) {
                    for (let p = 0; p < parsed.length; p++) addCandidate(parsed[p])
                    return
                  }
                } catch (_) {
                  const unbracketed = strVal.replace(/^\[\s*|\s*\]$/g, '')
                  return addCandidate(unbracketed)
                }
              }

              if (strVal.includes('|') || strVal.includes('\n') || strVal.includes('\r')) {
                const parts = strVal.split(/[|\r\n]+/)
                for (let p = 0; p < parts.length; p++) addCandidate(parts[p])
                return
              }

              if (strVal.includes('http://') || strVal.includes('https://')) {
                const httpMatches = strVal.match(/https?:\/\/[^\s"'`|,;\]\>]+/gi)
                if (httpMatches && httpMatches.length > 1) {
                  for (let h = 0; h < httpMatches.length; h++) {
                    const cleaned = sanitizeImageUrl(httpMatches[h])
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
              for (let v = 0; v < input.length; v++) {
                addCandidate(input[v])
              }
            } else {
              addCandidate(input)
            }

            return results
          }

          // Parsing resiliente de categorias: aceita array, string JSON, string delimitada ou valor único
          const normalizeCategoriesInput = (catInput, singleCatInput) => {
            const list = []
            const visited = {}

            const addCat = (c) => {
              if (c === undefined || c === null) return
              if (Array.isArray(c)) {
                for (let a = 0; a < c.length; a++) addCat(c[a])
                return
              }
              let s = String(c).trim()
              if (!s || s === '[]' || s === '""' || s === "''" || s === 'null') return

              if (s.startsWith('[') && s.endsWith(']')) {
                try {
                  const parsed = JSON.parse(s)
                  if (Array.isArray(parsed)) {
                    for (let p = 0; p < parsed.length; p++) addCat(parsed[p])
                    return
                  }
                } catch (_) {}
              }

              // Remove aspas ou colchetes residuais caso tenham sobrado
              s = s.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim()
              if (!s || s === '[]') return

              if (s.includes('|') || s.includes(',')) {
                const parts = s.split(/[|,]/)
                for (let p = 0; p < parts.length; p++) addCat(parts[p])
                return
              }

              if (!visited[s]) {
                visited[s] = true
                list.push(s)
              }
            }

            addCat(catInput)
            if (singleCatInput) addCat(singleCatInput)
            return list
          }

          const normalizeSingleCategory = (target) => {
            if (!target) return ''
            if (Array.isArray(target)) {
              for (let t = 0; t < target.length; t++) {
                const sub = normalizeSingleCategory(target[t])
                if (sub) return sub
              }
              return ''
            }
            let s = String(target).trim()
            if (!s || s === '[]' || s === '""' || s === "''" || s === 'null') return ''
            if (s.startsWith('[') && s.endsWith(']')) {
              try {
                const parsed = JSON.parse(s)
                return normalizeSingleCategory(parsed)
              } catch (_) {
                s = s.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim()
              }
            }
            s = s.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim()
            return s === '[]' ? '' : s
          }

          const rawImagemPrincipal = item.imagem_url || item.image_url || ''
          const imagemPrincipal = sanitizeImageUrl(rawImagemPrincipal)
          const rawUrlsGaleria = extractGalleryUrls(item.urls_imagens)

          const urlsGaleria = []
          const seenGalleryUrls = {}
          if (imagemPrincipal) {
            seenGalleryUrls[imagemPrincipal] = true
          }

          for (let g = 0; g < rawUrlsGaleria.length; g++) {
            const cleanU = sanitizeImageUrl(rawUrlsGaleria[g])
            if (cleanU && !seenGalleryUrls[cleanU]) {
              seenGalleryUrls[cleanU] = true
              urlsGaleria.push(cleanU)
            }
          }

          const isValidHttpUrl = (u) => {
            if (!u || typeof u !== 'string') return false
            return /^https?:\/\//i.test(u.trim())
          }

          if (imagemPrincipal && !isValidHttpUrl(imagemPrincipal)) {
            imageFailures.push({
              index: lineItemIndex,
              code: skuScaglioni || idScaglioni || '—',
              name: nomeProduto,
              url: imagemPrincipal,
              type: 'principal',
              reason: 'URL não inicia com protocolo http/https válido.',
            })
          }
          for (let uIdx = 0; uIdx < urlsGaleria.length; uIdx++) {
            const extraU = urlsGaleria[uIdx]
            if (extraU && !isValidHttpUrl(extraU)) {
              imageFailures.push({
                index: lineItemIndex,
                code: skuScaglioni || idScaglioni || '—',
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
              brandRecord = $app.findFirstRecordByData('brands', 'name', brandName)
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
                $app.save(brandRecord)
              }
            }
          }

          // Chave de reimportação idempotente: (origem=Scaglioni, id_scaglioni) ou sku_scaglioni
          let existing = null
          if (idScaglioni) {
            try {
              existing = $app.findFirstRecordByData('products', 'id_scaglioni', idScaglioni)
            } catch (_) {}
          }
          if (!existing && skuScaglioni) {
            try {
              existing = $app.findFirstRecordByData('products', 'sku_scaglioni', skuScaglioni)
            } catch (_) {}
          }

          if (existing) {
            // REIMPORTAÇÃO IDEMPOTENTE:
            const localNome =
              existing.getString('nome_produto') || existing.getString('description')
            const localPreco = existing.getFloat('selling_price')

            if (localNome && nomeProduto && localNome !== nomeProduto) {
              conflicts.push({
                index: lineItemIndex,
                product_id: existing.getString('produto_id') || existing.id,
                code: skuScaglioni || idScaglioni || '—',
                field: 'nome_produto',
                local_value: localNome,
                origin_value: nomeProduto,
                reason: 'Nome local alterado manualmente difere do valor de origem Scaglioni.',
              })
            }
            if (localPreco > 0 && precoVenda > 0 && Math.abs(localPreco - precoVenda) > 0.01) {
              conflicts.push({
                index: lineItemIndex,
                product_id: existing.getString('produto_id') || existing.id,
                code: skuScaglioni || idScaglioni || '—',
                field: 'preco_venda',
                local_value: localPreco,
                origin_value: precoVenda,
                reason: 'Preço local alterado manualmente difere do valor de origem Scaglioni.',
              })
            }

            if (!isDryRun) {
              existing.set('id_scaglioni', idScaglioni)
              existing.set('sku_scaglioni', skuScaglioni)

              // Garante sku_novo sequencial e sku_interno
              if (
                !existing.getString('sku_novo') ||
                !/^\d+$/.test(existing.getString('sku_novo'))
              ) {
                const generatedNumCode = getNextFreeSeq()
                existing.set('sku_novo', generatedNumCode)
                if (!existing.getString('sku_interno')) {
                  existing.set('sku_interno', generatedNumCode)
                }
              }

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

              // Permite gravar ou atualizar mesmo com descrição vazia
              existing.set('description', descricao || '')

              if (brandRecord) {
                existing.set('marca_id', brandRecord.id)
              }
              if (altura) existing.set('altura_cm', altura)
              if (largura) existing.set('largura_cm', largura)
              if (comprimento) existing.set('comprimento_cm', comprimento)
              if (peso) existing.set('peso_g', peso)

              if (!existing.getInt('minimum_quantity') && saldoInicialQty > 0) {
                existing.set('minimum_quantity', Math.max(1, Math.round(saldoInicialQty * 0.3)))
              }

              // Causa raiz corrigida:
              // Ao ATUALIZAR produto existente, só preencher qtde_inicial se estiver zerado/ausente
              // e o CSV trouxer valor > 0 — NUNCA sobrescrever uma qtde_inicial já preenchida.
              const currentInitQty = existing.getInt('qtde_inicial') || 0
              if (currentInitQty === 0 && saldoInicialQty > 0) {
                existing.set('qtde_inicial', saldoInicialQty)
              }

              // Se o produto já foi distribuído para e-commerce (Ajuste E-commerce),
              // não sobrescrevemos o saldo inicial como "A definir".
              // Só atualizamos ou criamos initial_stocks se a origem for Scaglioni.
              const isEcommercePublished = existing.getBool('publicar_no_ecommerce')
              const initStockFilter =
                "product = '" +
                existing.id +
                "' && (origem = 'Scaglioni' || origem = 'Ajuste E-commerce')"
              const existInitStocks = $app.findRecordsByFilter(
                'initial_stocks',
                initStockFilter,
                '-created',
                1,
                0,
              )
              if (existInitStocks.length > 0) {
                const initRec = existInitStocks[0]
                if (initRec.getString('origem') === 'Scaglioni') {
                  initRec.set('quantidade', saldoInicialQty)
                  initRec.set('id_origem', idScaglioni)
                  initRec.set('localizacao', 'A definir')
                  $app.save(initRec)
                }
                // Se origem for 'Ajuste E-commerce', preserva intacto
              } else {
                const initRec = new Record(initStockCol)
                initRec.set('product', existing.id)
                if (isEcommercePublished) {
                  initRec.set('origem', 'Ajuste E-commerce')
                  initRec.set('id_origem', 'ecom-import-' + existing.id)
                  initRec.set('localizacao', 'Estoque separado para e-commerce')
                  initRec.set(
                    'detalhes_distribuicao',
                    JSON.stringify({
                      loja_fisica: 0,
                      expedicao: saldoInicialQty,
                      revendedoras: [],
                    }),
                  )
                } else {
                  initRec.set('origem', 'Scaglioni')
                  initRec.set('id_origem', idScaglioni)
                  initRec.set('localizacao', 'A definir')
                }
                initRec.set('quantidade', saldoInicialQty)
                initRec.set('data_registro', new Date().toISOString())
                initRec.set('is_ativo', true)
                $app.save(initRec)
              }

              // Galeria idempotente
              let existingOrder = 1
              const currentProductImgs = $app.findRecordsByFilter(
                'product_images',
                "product = '" + existing.id + "'",
                'sort_order',
                100,
                0,
              )
              const currentUrlsMap = {}
              for (let pi = 0; pi < currentProductImgs.length; pi++) {
                const u = currentProductImgs[pi].getString('image_url')
                if (u) currentUrlsMap[u] = true
              }
              if (currentProductImgs.length > 0) {
                existingOrder = currentProductImgs.length + 1
              }

              if (imagemPrincipal && !currentUrlsMap[imagemPrincipal]) {
                const imgRec = new Record(imagesCol)
                imgRec.set('product', existing.id)
                imgRec.set('image_url', imagemPrincipal)
                imgRec.set('is_principal', currentProductImgs.length === 0)
                imgRec.set('sort_order', 1)
                imgRec.set('origem', 'Scaglioni')
                $app.save(imgRec)
                currentUrlsMap[imagemPrincipal] = true
              }

              for (let gIdx = 0; gIdx < urlsGaleria.length; gIdx++) {
                const extraUrl = urlsGaleria[gIdx]
                if (extraUrl && !currentUrlsMap[extraUrl]) {
                  const extraRec = new Record(imagesCol)
                  extraRec.set('product', existing.id)
                  extraRec.set('image_url', extraUrl)
                  extraRec.set('is_principal', false)
                  extraRec.set('sort_order', existingOrder++)
                  extraRec.set('origem', 'Scaglioni')
                  $app.save(extraRec)
                  currentUrlsMap[extraUrl] = true
                }
              }

              $app.save(existing)
            }

            atualizados.push({
              index: lineItemIndex,
              code: skuScaglioni || idScaglioni || '—',
              name: nomeProduto,
              product_id: existing.id,
            })
          } else {
            // NOVO PRODUTO SCAGLIONI
            let createdProductId = ''
            if (!isDryRun) {
              const ts = new Date().getTime().toString().slice(-6)
              const rand1 = Math.floor(1000 + Math.random() * 9000).toString()
              const produtoId = 'PROD-' + ts + '-' + rand1

              const skuNovo = getNextFreeSeq()
              const skuInterno = skuNovo

              const newProd = new Record(productsCol)
              newProd.set('produto_id', produtoId)
              newProd.set('sku_novo', skuNovo)
              newProd.set('sku_interno', skuInterno)
              newProd.set('nome_produto', nomeProduto)
              newProd.set('nome_original_scaglioni', nomeOriginal || nomeProduto)
              // Permite gravar novo produto mesmo com descrição vazia
              newProd.set('description', descricao || '')
              newProd.set('code', skuNovo)
              newProd.set('id_scaglioni', idScaglioni)
              newProd.set('sku_scaglioni', skuScaglioni)
              newProd.set('selling_price', precoVenda)
              if (precoPromo !== null) {
                newProd.set('preco_promocional', precoPromo)
              }

              if (altura) newProd.set('altura_cm', altura)
              if (largura) newProd.set('largura_cm', largura)
              if (comprimento) newProd.set('comprimento_cm', comprimento)
              if (peso) newProd.set('peso_g', peso)

              // Quantidade inicial SEMPRE gravada quando o CSV trouxe valor (causa raiz do
              // rebalanceamento 0051/0052: produtos publicados com qtde_inicial 0).
              if (saldoInicialQty > 0) {
                newProd.set('qtde_inicial', saldoInicialQty)
              }

              // Modelo confirmado pelo usuário:
              // Para produtos NOVOS publicados no e-commerce:
              // qtde_loja_virtual = qtde_inicial e quantity (físico/geral) = 0.
              // Para produtos não publicados: quantity = saldoInicialQty e qtde_loja_virtual = 0.
              if (estadoAtivoEcommerce && saldoInicialQty > 0) {
                newProd.set('qtde_loja_virtual', saldoInicialQty)
                newProd.set('quantity', 0)
              } else {
                newProd.set('quantity', saldoInicialQty)
                newProd.set('qtde_loja_virtual', 0)
              }

              newProd.set(
                'minimum_quantity',
                saldoInicialQty > 0 ? Math.max(1, Math.round(saldoInicialQty * 0.3)) : 1,
              )
              newProd.set('status', saldoInicialQty > 0 ? 'available' : 'unavailable')
              newProd.set('ativo_interno', true)
              newProd.set('publicar_no_ecommerce', estadoAtivoEcommerce)
              newProd.set('estado_ativo_ecommerce', estadoAtivoEcommerce)
              newProd.set('destaque_ecommerce', destaqueEcommerce)
              newProd.set('created_at_scaglioni', createdAtScaglioni)
              if (createdAtScaglioni) {
                newProd.set('criado_em_origem', createdAtScaglioni)
              }

              newProd.set('image_url', imagemPrincipal)
              if (item.arquivos_imagens) {
                newProd.set('import_image_path', String(item.arquivos_imagens).trim())
              }
              if (brandRecord) {
                newProd.set('marca_id', brandRecord.id)
              }

              $app.save(newProd)
              createdProductId = newProd.id

              // Saldo inicial Scaglioni:
              // Se publicado no e-commerce, registra a movimentação de estoque inicial
              // com origem "Ajuste E-commerce" e localização "Estoque separado para e-commerce",
              // espelhando o padrão das migrations 0051/0052.
              // Se não publicado, registra como origem "Scaglioni" e localização "A definir".
              const initRec = new Record(initStockCol)
              initRec.set('product', newProd.id)
              if (estadoAtivoEcommerce && saldoInicialQty > 0) {
                initRec.set('origem', 'Ajuste E-commerce')
                initRec.set('id_origem', 'ecom-import-' + newProd.id)
                initRec.set('localizacao', 'Estoque separado para e-commerce')
                initRec.set(
                  'detalhes_distribuicao',
                  JSON.stringify({
                    loja_fisica: 0,
                    expedicao: saldoInicialQty,
                    revendedoras: [],
                  }),
                )
              } else {
                initRec.set('origem', 'Scaglioni')
                initRec.set('id_origem', idScaglioni)
                initRec.set('localizacao', 'A definir')
              }
              initRec.set('quantidade', saldoInicialQty)
              initRec.set('data_registro', new Date().toISOString())
              initRec.set('is_ativo', true)
              $app.save(initRec)

              // Fotos
              let sortOrder = 1
              if (imagemPrincipal) {
                const imgRec = new Record(imagesCol)
                imgRec.set('product', newProd.id)
                imgRec.set('image_url', imagemPrincipal)
                imgRec.set('is_principal', true)
                imgRec.set('sort_order', sortOrder++)
                imgRec.set('origem', 'Scaglioni')
                $app.save(imgRec)
              }

              for (let g = 0; g < urlsGaleria.length; g++) {
                const extraUrl = urlsGaleria[g]
                if (extraUrl && extraUrl !== imagemPrincipal) {
                  const extraRec = new Record(imagesCol)
                  extraRec.set('product', newProd.id)
                  extraRec.set('image_url', extraUrl)
                  extraRec.set('is_principal', false)
                  extraRec.set('sort_order', sortOrder++)
                  extraRec.set('origem', 'Scaglioni')
                  $app.save(extraRec)
                }
              }

              // Categorias com normalização tolerante
              const catsToLink = normalizeCategoriesInput(item.categorias, item.categoria)
              const catPrincipalTarget =
                normalizeSingleCategory(item.categoria_principal) ||
                (catsToLink.length > 0 ? catsToLink[0] : '')

              for (let c = 0; c < catsToLink.length; c++) {
                const cleanCat = catsToLink[c]
                if (!cleanCat) continue

                let catRecord = null
                try {
                  catRecord = $app.findFirstRecordByData('product_categories', 'name', cleanCat)
                } catch (_) {
                  catRecord = new Record(catsCol)
                  catRecord.set('name', cleanCat)
                  const catSlug = cleanCat
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                  catRecord.set('slug', catSlug || 'cat-' + Math.floor(1000 + Math.random() * 9000))
                  $app.save(catRecord)
                }

                try {
                  const link = new Record(linksCol)
                  link.set('product', newProd.id)
                  link.set('category', catRecord.id)
                  link.set('is_principal', cleanCat === catPrincipalTarget)
                  $app.save(link)
                } catch (_) {}
              }
            }

            criados.push({
              index: lineItemIndex,
              code: skuScaglioni || idScaglioni || '—',
              name: nomeProduto,
              product_id: createdProductId,
            })
          }
        } catch (rowErr) {
          console.log('Falha na linha ' + i + ' (' + rowIdentifier + '):', rowErr.message)
          falhados.push({
            index: lineItemIndex,
            sku: skuScaglioni || idScaglioni || '—',
            name: nomeProduto || rowIdentifier,
            message: rowErr.message || 'Erro desconhecido ao processar linha',
            reason: rowErr.message || 'Erro desconhecido ao processar linha',
          })
        }
      }

      // Atualiza a sequência persistida caso não seja dry-run
      if (!isDryRun) {
        try {
          const seqRecToUpdate = $app.findFirstRecordByFilter(
            'app_sequences',
            "name = 'product_numeric_code'",
          )
          if (seqRecToUpdate) {
            seqRecToUpdate.set('current_value', currentSeq)
            $app.save(seqRecToUpdate)
          }
        } catch (_) {}
      }

      // Mantém compatibilidade com campos anteriores (sample_reports, created, updated, ignored)
      // e fornece as 3 listas explícitas solicitadas: criados, atualizados, falhados.
      // Concatenação e mapeamento manuais sem spread operator
      const lineReports = []
      for (let iC = 0; iC < criados.length; iC++) {
        const c = shallowCopy(criados[iC])
        c.status = 'created'
        lineReports.push(c)
      }
      for (let iA = 0; iA < atualizados.length; iA++) {
        const u = shallowCopy(atualizados[iA])
        u.status = 'updated'
        lineReports.push(u)
      }
      for (let iF = 0; iF < falhados.length; iF++) {
        const f = shallowCopy(falhados[iF])
        f.status = 'error'
        f.code = f.sku
        lineReports.push(f)
      }
      lineReports.sort((a, b) => a.index - b.index)

      return e.json(200, {
        success: true,
        dry_run: isDryRun,
        total_received: items.length,
        created: criados.length,
        updated: atualizados.length,
        ignored: falhados.length,
        criados,
        atualizados,
        falhados,
        conflicts,
        image_failures: imageFailures,
        sample_reports: lineReports.slice(0, 100),
      })
    } catch (endpointErr) {
      const errStack = endpointErr && endpointErr.stack ? endpointErr.stack : ''
      const errMsg = endpointErr && endpointErr.message ? endpointErr.message : String(endpointErr)
      console.log(
        'ERRO CRÍTICO no endpoint /backend/v1/products/import/scaglioni:',
        errMsg,
        errStack,
      )
      return e.json(500, {
        error: 'Erro no processamento do lote Scaglioni: ' + errMsg,
        message: errMsg,
        stack: errStack,
      })
    }
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
    if (role !== 'superadmin' && role !== 'admin' && role !== 'operator') {
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
        if (!prodTecson.getInt('minimum_quantity') || prodTecson.getInt('minimum_quantity') === 0) {
          const minQty =
            prodScaglioni.getInt('minimum_quantity') > 0
              ? prodScaglioni.getInt('minimum_quantity')
              : finalInitialQty > 0
                ? Math.max(1, Math.round(finalInitialQty * 0.3))
                : 1
          prodTecson.set('minimum_quantity', minQty)
        }

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
