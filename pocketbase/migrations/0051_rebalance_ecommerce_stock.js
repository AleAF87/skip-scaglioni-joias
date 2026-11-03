// Operação de dados (execução única, idempotente):
// Para TODO produto com publicar_no_ecommerce = true:
//   - qtde_loja_virtual (e-commerce) = qtde_inicial
//   - quantity (estoque geral / físico) = 0
// A movimentação correspondente é registrada em initial_stocks (padrão do projeto),
// com id_origem determinístico por produto ("ecom-rebalance-<product_id>") para que uma
// nova execução NÃO duplique registros. Produtos não publicados não são tocados.
// Com variações: o saldo de variação hoje vive em product_variations.quantity (quantidade
// inicial por variação) e o split físico/e-commerce por variação vive em
// initial_stocks.detalhes_distribuicao — segue o mesmo padrão do cadastro manual
// (origem 'Manual - Variação'), então a movimentação é gravada uma linha por variação,
// com a soma das linhas = quantidade movida do produto.

migrate(
  (app) => {
    const initStockCol = app.findCollectionByNameOrId('initial_stocks')

    let adjusted = 0
    let unitsMoved = 0
    let alreadyOk = 0
    let skippedZeroInitial = 0
    let skippedWithResellerStock = 0
    const errors = []
    const adjustedCodes = []

    // Produtos com unidades em posse de revendedoras (apenas informativo no resumo;
    // reseller_stock_items não é alterado por esta operação)
    let resellerAllocatedCount = 0
    try {
      const allocated = app.findRecordsByFilter(
        'reseller_stock_items',
        'quantity > 0',
        '',
        10000,
        0,
      )
      const allocatedProducts = {}
      for (let i = 0; i < allocated.length; i++) {
        allocatedProducts[allocated[i].getString('product')] = true
      }
      resellerAllocatedCount = Object.keys(allocatedProducts).length
    } catch (_) {}

    let offset = 0
    const pageSize = 200
    while (true) {
      const page = app.findRecordsByFilter(
        'products',
        'publicar_no_ecommerce = true',
        '-created',
        pageSize,
        offset,
      )
      if (!page || page.length === 0) break

      for (let i = 0; i < page.length; i++) {
        const p = page[i]
        try {
          const qtdeInicial = p.getInt('qtde_inicial') || 0
          const curGeneral = p.getInt('quantity') || 0
          const curEcom = p.getInt('qtde_loja_virtual') || 0

          // Nada a mover: quantidade inicial zerada/nula
          if (qtdeInicial <= 0) {
            skippedZeroInitial++
            continue
          }

          // Idempotência: já está no estado-alvo (recalculado a partir da qtde_inicial)
          if (curEcom === qtdeInicial && curGeneral === 0) {
            alreadyOk++
            continue
          }

          const targetEcom = qtdeInicial

          app.runInTransaction((txApp) => {
            let hasVariations = false
            let variations = []
            try {
              variations = txApp.findRecordsByFilter(
                'product_variations',
                "product = '" + p.id + "'",
                '',
                500,
                0,
              )
              hasVariations = variations && variations.length > 0
            } catch (_) {
              hasVariations = false
            }

            if (hasVariations) {
              // Uma linha de movimentação por variação (soma = quantidade movida do produto)
              for (let v = 0; v < variations.length; v++) {
                const vari = variations[v]
                const varQty = vari.getInt('quantity') || 0
                if (varQty <= 0) continue
                const idOrigem = 'ecom-rebalance-' + p.id + '-' + vari.id
                const exists = txApp.findRecordsByFilter(
                  'initial_stocks',
                  "product = '" + p.id + "' && id_origem = '" + idOrigem + "'",
                  '',
                  1,
                  0,
                )
                if (exists && exists.length > 0) continue

                const mv = new Record(initStockCol)
                mv.set('product', p.id)
                mv.set('origem', 'Ajuste E-commerce - Variação')
                mv.set('id_origem', idOrigem)
                mv.set('quantidade', varQty)
                mv.set('localizacao', 'Estoque separado para e-commerce')
                mv.set('data_registro', new Date().toISOString())
                mv.set('is_ativo', true)
                mv.set(
                  'detalhes_distribuicao',
                  JSON.stringify({
                    loja_fisica: 0,
                    expedicao: varQty,
                    revendedoras: [],
                    variacao_sku: vari.getString('sku') || '',
                  }),
                )
                txApp.save(mv)
              }
            } else {
              const idOrigem = 'ecom-rebalance-' + p.id
              const exists = txApp.findRecordsByFilter(
                'initial_stocks',
                "product = '" + p.id + "' && id_origem = '" + idOrigem + "'",
                '',
                1,
                0,
              )
              if (!exists || exists.length === 0) {
                const mv = new Record(initStockCol)
                mv.set('product', p.id)
                mv.set('origem', 'Ajuste E-commerce')
                mv.set('id_origem', idOrigem)
                mv.set('quantidade', targetEcom)
                mv.set('localizacao', 'Estoque separado para e-commerce')
                mv.set('data_registro', new Date().toISOString())
                mv.set('is_ativo', true)
                mv.set(
                  'detalhes_distribuicao',
                  JSON.stringify({
                    loja_fisica: 0,
                    expedicao: targetEcom,
                    revendedoras: [],
                  }),
                )
                txApp.save(mv)
              }
            }

            // Saldos do produto: recalculados a partir da quantidade inicial (nunca somados)
            p.set('qtde_loja_virtual', targetEcom)
            p.set('quantity', 0)
            txApp.save(p)
          })

          adjusted++
          unitsMoved += targetEcom
          adjustedCodes.push(p.getString('code') || p.getString('sku_novo') || p.id)
        } catch (rowErr) {
          errors.push({
            product: p.id,
            code: p.getString('code') || '',
            error: String(rowErr && rowErr.message ? rowErr.message : rowErr),
          })
        }
      }

      if (page.length < pageSize) break
      offset += pageSize
    }

    const summary = {
      adjusted_products: adjusted,
      units_moved_to_ecommerce: unitsMoved,
      already_ok: alreadyOk,
      skipped_zero_initial: skippedZeroInitial,
      products_with_reseller_stock: resellerAllocatedCount,
      errors: errors.length,
    }
    console.log('[ECOM-REBALANCE] Resumo da execução: ' + JSON.stringify(summary))
    if (adjustedCodes.length > 0) {
      console.log(
        '[ECOM-REBALANCE] Produtos ajustados (' +
          adjustedCodes.length +
          '): ' +
          adjustedCodes.join(','),
      )
    }
    if (errors.length > 0) {
      console.log('[ECOM-REBALANCE] Erros: ' + JSON.stringify(errors).slice(0, 2000))
    }
  },
  (app) => {
    // Down: operação pontual de dados — não desfaz saldos (reversão segura como no-op).
  },
)
