// Operação de dados (execução única, idempotente) — complemento da 0051:
// Na 0051 os produtos com qtde_inicial = 0 foram PULADOS (para não apagar estoque real).
// Eram os produtos importados da Scaglioni cujo importador não gravou a quantidade inicial,
// embora o CSV trouxesse 3–5 unidades por peça (pararam no estoque geral / quantity).
// Esta operação, para TODO produto com publicar_no_ecommerce = true E qtde_inicial = 0 E quantity > 0:
//   1) qtde_inicial = quantity (o estoque atual é de fato o que a empresa recebeu)
//   2) mesmo rebalanceamento da 0051: qtde_loja_virtual = qtde_inicial e quantity = 0
//   3) movimentação em initial_stocks com id_origem determinístico
//      "ecom-rebalance-backfill-<product_id>" (não duplica em reexecução),
//      origem "Ajuste E-commerce", localização "Estoque separado para e-commerce"
// Resumo no log com [ECOM-REBALANCE-BACKFILL]. Down: no-op (operação pontual de dados).

migrate(
  (app) => {
    const initStockCol = app.findCollectionByNameOrId('initial_stocks')

    let adjusted = 0
    let unitsMoved = 0
    let alreadyOk = 0
    let skippedZeroQty = 0
    const errors = []
    const adjustedCodes = []

    let offset = 0
    const pageSize = 200
    while (true) {
      const page = app.findRecordsByFilter(
        'products',
        'publicar_no_ecommerce = true && qtde_inicial = 0',
        '-created',
        pageSize,
        offset,
      )
      if (!page || page.length === 0) break

      for (let i = 0; i < page.length; i++) {
        const p = page[i]
        try {
          const curGeneral = p.getInt('quantity') || 0

          // Nada a mover: produto sem estoque físico (fica como está, e-commerce 0)
          if (curGeneral <= 0) {
            skippedZeroQty++
            continue
          }

          const targetEcom = curGeneral

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
                const idOrigem = 'ecom-rebalance-backfill-' + p.id + '-' + vari.id
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
              const idOrigem = 'ecom-rebalance-backfill-' + p.id
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

            // Saldos do produto: recalculados a partir da quantidade inicial (nunca somados),
            // mesmo padrão dos hooks products_totals
            p.set('qtde_inicial', targetEcom)
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
      backfilled_products: adjusted,
      units_backfilled: unitsMoved,
      already_ok: alreadyOk,
      skipped_no_physical_stock: skippedZeroQty,
      errors: errors.length,
    }
    console.log('[ECOM-REBALANCE-BACKFILL] Resumo da execução: ' + JSON.stringify(summary))
    if (adjustedCodes.length > 0) {
      console.log(
        '[ECOM-REBALANCE-BACKFILL] Produtos backfillados (' +
          adjustedCodes.length +
          '): ' +
          adjustedCodes.join(','),
      )
    }
    if (errors.length > 0) {
      console.log('[ECOM-REBALANCE-BACKFILL] Erros: ' + JSON.stringify(errors).slice(0, 2000))
    }
  },
  (app) => {
    // Down: operação pontual de dados — não desfaz saldos (reversão segura como no-op).
  },
)
