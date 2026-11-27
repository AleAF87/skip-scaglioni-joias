// Hook de importação Tecson → posse de revendedora.
// Chamado pela página /importar-tecson-revendedora com pb.send('/backend/v1/tecson/reseller-import').
// Recebe as linhas JÁ parseadas por cabeçalho no frontend (tecsonCsvParser.ts) e
// executa TUDO-OU-NADA numa única transação (apenas quando dry_run = false).
//
// Regras do modelo invertido (decisão do usuário):
//  - products.quantity = ESTOQUE FÍSICO (gravado/editável)
//  - Total = Físico + soma das posses em reseller_stock_items (calculado, nunca gravado)
//  - Produto existente: aumenta a POSSE da revendedora; Físico não muda
//  - Produto novo: Físico 0, quantidade só na posse, não publicado
//  - CHAVE PRINCIPAL = CODIGO_BARRAS (v0.0.276 — substitui COD_PRODUTO):
//      comparação remove apenas zeros à esquerda ('0000000442497' = '442497');
//      o valor ORIGINAL da Tecson é preservado para auditoria (inclusive zeros).
//      COD_PRODUTO (código Tecson) é dado complementar/origem — NUNCA localiza
//      produto nem vira quantidade. FORNECEDOR é informativo.
//  - IMAGEM: produto novo → URL importada como imagem principal (image_url);
//    produto existente → mantém a imagem cadastrada; só usa a importada se o
//    produto não tiver nenhuma.
//  - Quantidade 0: NÃO cria posse nem altera estoque — só cadastro/mapeamento.
//  - v0.0.279 (BUG CORRIGIDO): dry_run=true executa SOMENTE a validação —
//    nenhum save() é feito. Antes, a prévia gravava produtos/posses de verdade.
//  - JSVM: cada handler roda isolado — tudo duplicado inline aqui.
//    (JSVM: const IMPORT_ORIGIN_TAG é duplicada DENTRO de cada callback —
//    declaração top-level não é visível aos handlers.)

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

    // Marcador de origem gravado em TODOS os produtos criados por este import —
    // é ele que a rotina de limpeza usa como filtro (JSVM: declarado inline,
    // dentro do callback, pois top-level não é visível aos handlers).
    const IMPORT_ORIGIN_TAG = 'Migração Tecson — posse de revendedora'

    const body = e.requestInfo().body || {}
    const resellerId = String(body.reseller_id || '')
    const rows = Array.isArray(body.rows) ? body.rows : []
    const dryRun = !!body.dry_run

    if (!resellerId) return e.json(400, { error: 'Revendedora é obrigatória.' })
    if (rows.length === 0) return e.json(400, { error: 'Nenhuma linha para importar.' })

    const result = {
      success: false,
      dry_run: dryRun,
      reseller_id: resellerId,
      products_updated: 0,
      products_created: 0,
      variations_created: 0,
      stock_items_created: 0,
      stock_items_updated: 0,
      skipped: [],
    }

    // Código de barras: preserva o ORIGINAL (auditoria, zeros à esquerda) e deriva
    // a chave de comparação removendo APENAS zeros à esquerda.
    const parseBarcode = (raw, normFallback) => {
      const original = String(raw || '').trim()
      if (!original) {
        // Frontend já envia codigo_barras_norm (só zeros à esquerda removidos):
        // usado como fallback da chave quando o original vier vazio.
        const nf = String(normFallback || '').trim()
        return { original: original || nf, key: nf }
      }
      if (!/^\d+$/.test(original)) return { original: original, key: original }
      return { original: original, key: original.replace(/^0+/, '') || '0' }
    }

    // COD_PRODUTO Tecson: complementar. Deriva base + variação (ex.: '631587 37').
    const parseCodProduto = (raw) => {
      const original = String(raw || '')
        .trim()
        .replace(/\s+/g, ' ')
      if (!original) return { original: '', base: '', variation: '' }
      const parts = original.split(' ')
      const baseNum = (parts[0] || '').replace(/\D/g, '')
      const base = baseNum ? baseNum.replace(/^0+/, '') || '0' : ''
      const variation = parts.length > 1 ? parts.slice(1).join(' ') : ''
      return { original: original, base: base, variation: variation }
    }

    const escapeFilter = (s) => String(s).replace(/'/g, "\\'")
    const normForCompare = (v) =>
      String(v || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    // Pré-validação fora da transação: agrupa por CÓDIGO DE BARRAS normalizado
    // (+ variação do COD_PRODUTO, quando houver).
    const perBarcode = {}
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = row.line || i + 2
      const bc = parseBarcode(row.codigo_barras, row.codigo_barras_norm)
      if (!bc.key || bc.key === '0') {
        result.skipped.push({
          line: line,
          code: String(row.cod_produto || ''),
          barcode: bc.original,
          reason: 'CODIGO_BARRAS ilegível — é a chave principal da importação.',
        })
        continue
      }
      const qty = parseInt(row.quantity, 10) || 0
      if (qty < 0) {
        result.skipped.push({
          line: line,
          code: String(row.cod_produto || ''),
          barcode: bc.original,
          reason: 'Quantidade negativa.',
        })
        continue
      }
      const cod = parseCodProduto(row.cod_produto)
      const key = bc.key + (cod.variation ? ' | ' + normForCompare(cod.variation) : '')
      if (!perBarcode[key]) {
        perBarcode[key] = {
          barcode_key: bc.key,
          barcode_original: bc.original,
          cod_produto_original: cod.original,
          cod_base: cod.base,
          variation: cod.variation,
          quantity: 0,
          row: row,
        }
      }
      perBarcode[key].quantity += qty
    }

    const validKeys = Object.keys(perBarcode)
    if (validKeys.length === 0) {
      return e.json(200, { ...result, success: true, message: 'Nada importável.' })
    }

    // Encontra uma variação do produto cujo label/sku bata com a variação do COD_PRODUTO.
    const findVariation = (txApp, productId, variationRaw) => {
      const vNorm = normForCompare(variationRaw)
      if (!vNorm) return null
      try {
        const list = txApp.findRecordsByFilter(
          'product_variations',
          "product = '" + escapeFilter(productId) + "'",
          '',
          50,
          0,
        )
        for (let i = 0; i < list.length; i++) {
          const v = list[i]
          const sku = v.getString('sku') || ''
          let label = ''
          try {
            const attrs = JSON.parse(v.getString('attributes') || '{}')
            const values = Object.keys(attrs)
              .filter((k) => String(attrs[k]).trim() !== '')
              .map((k) => String(attrs[k]).trim())
            label = values.join(' / ')
          } catch (_) {}
          const skuSuffix = sku.replace(
            new RegExp('^' + escapeFilter(productId) + '[\\s\\-_]*'),
            '',
          )
          const candidates = [label, sku, skuSuffix]
          for (let j = 0; j < candidates.length; j++) {
            if (candidates[j] && normForCompare(candidates[j]) === vNorm) return v
          }
        }
      } catch (_) {}
      return null
    }

    // Localiza produto APENAS por código de barras (codigo_barras e
    // codigo_barras_tecson), comparando sem zeros à esquerda. COD_PRODUTO/id
    // Tecson NÃO são usados como chave.
    const findProductsByBarcode = (txApp, barcodeKey) => {
      if (!barcodeKey) return []
      const esc = escapeFilter(barcodeKey)
      // '~' traz candidatos que CONTÊM o valor; a igualdade exata (sem zeros) é
      // conferida em JS abaixo — cobre '442497' e '0000000442497' gravados.
      const filter = "codigo_barras ~ '" + esc + "' || codigo_barras_tecson ~ '" + esc + "'"
      let candidates = []
      try {
        candidates = txApp.findRecordsByFilter('products', filter, '-created', 50, 0)
      } catch (_) {
        candidates = []
      }
      const matches = []
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i]
        const bcs = [p.getString('codigo_barras'), p.getString('codigo_barras_tecson')]
        for (let j = 0; j < bcs.length; j++) {
          const parsed = parseBarcode(bcs[j])
          if (parsed.key && parsed.key === barcodeKey) {
            matches.push(p)
            break
          }
        }
      }
      return matches
    }

    try {
      // Resolvedor de produto APENAS-LEITURA (usado pela prévia): nunca salva.
      const resolveRow = (appLike, entry, qty) => {
        const outcome = { status: '', product: null, variation: null }
        const matches = findProductsByBarcode(appLike, entry.barcode_key)
        if (matches.length > 1) {
          outcome.status = 'conflict'
          return outcome
        }
        if (matches.length === 1) {
          outcome.product = matches[0]
          if (entry.variation) {
            const variationRecord = findVariation(appLike, matches[0].id, entry.variation)
            if (!variationRecord) {
              outcome.status = 'new_variation'
              return outcome
            }
            outcome.variation = variationRecord
          }
          outcome.status = qty === 0 ? 'existing_zero' : 'existing'
          return outcome
        }
        outcome.status = qty === 0 ? 'new_zero' : 'new'
        return outcome
      }

      // Prévia (dry_run): valida e classifica cada linha — NENHUM save().
      if (dryRun) {
        const resellerName = (function () {
          try {
            return $app.findRecordById('resellers', resellerId).getString('name')
          } catch (_) {
            return ''
          }
        })()
        for (let k = 0; k < validKeys.length; k++) {
          const entry = perBarcode[validKeys[k]]
          const qty = entry.quantity
          const row = entry.row
          const line = row.line
          const outcome = resolveRow($app, entry, qty)

          if (outcome.status === 'conflict') {
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason:
                'Conflito: mais de um produto com o código de barras ' +
                entry.barcode_original +
                '. Resolva manualmente.',
            })
            continue
          }

          if (outcome.status === 'new' || outcome.status === 'new_zero') {
            const classification =
              qty === 0
                ? 'novo — cadastro/mapeamento somente (qty 0)'
                : 'novo — estoque físico 0, quantidade na posse'
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason: 'Prévia: ' + classification,
            })
            result.products_created++
            if (entry.variation) result.variations_created++
            continue
          }

          if (outcome.status === 'new_variation') {
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason: 'Prévia: variação nova no produto existente (' + entry.variation + ')',
            })
            result.variations_created++
            if (qty > 0) result.products_updated++
            continue
          }

          // existing / existing_zero
          const product = outcome.product
          if (qty === 0) {
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason: 'Prévia: existente — cadastro/mapeamento somente (qty 0).',
            })
            continue
          }
          try {
            const existing = $app.findRecordsByFilter(
              'reseller_stock_items',
              "reseller = '" +
                escapeFilter(resellerId) +
                "' && product = '" +
                escapeFilter(product.id) +
                "'",
              '',
              1,
              0,
            )
            if (existing.length > 0) {
              const cur = existing[0].getInt('quantity') || 0
              if (cur === qty) {
                result.skipped.push({
                  line: line,
                  code: entry.cod_produto_original,
                  barcode: entry.barcode_original,
                  reason: 'Prévia: já importado (mesmo saldo) — nada muda.',
                })
                continue
              }
              result.skipped.push({
                line: line,
                code: entry.cod_produto_original,
                barcode: entry.barcode_original,
                reason: 'Prévia: posse atual ' + cur + ' → ' + (cur + qty) + ' (aumenta posse)',
              })
              result.stock_items_updated++
              result.products_updated++
            } else {
              result.skipped.push({
                line: line,
                code: entry.cod_produto_original,
                barcode: entry.barcode_original,
                reason: 'Prévia: posse nova de ' + qty + ' unidade(s)',
              })
              result.stock_items_created++
              result.products_updated++
            }
          } catch (_) {
            result.stock_items_created++
            result.products_updated++
          }
        }
        result.success = true
        return e.json(200, {
          ...result,
          message: 'Prévia validada no servidor — nenhum registro foi gravado.',
        })
      }

      // IMPORTAÇÃO REAL (dry_run=false): transação tudo-ou-nada.
      $app.runInTransaction((txApp) => {
        const reseller = txApp.findRecordById('resellers', resellerId)
        const resellerName = reseller.getString('name')

        for (let k = 0; k < validKeys.length; k++) {
          const key = validKeys[k]
          const entry = perBarcode[key]
          const qty = entry.quantity
          const row = entry.row
          const line = row.line

          const matches = findProductsByBarcode(txApp, entry.barcode_key)

          if (matches.length > 1) {
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason:
                'Conflito: ' +
                matches.length +
                ' produtos com o código de barras ' +
                entry.barcode_original +
                '. Resolva manualmente.',
            })
            continue
          }

          let product = matches.length === 1 ? matches[0] : null
          let isNew = false
          let isNewVariation = false
          let variationRecord = null
          const importedImage = String(row.imagem || '').trim()

          if (!product) {
            // Produto novo: Físico 0, quantidade só na posse, não publicado.
            // CHAVE = CODIGO_BARRAS original da Tecson (preservado com zeros à
            // esquerda para auditoria). COD_PRODUTO vira complemento/origem.
            isNew = true
            const col = txApp.findCollectionByNameOrId('products')
            product = new Record(col)
            product.set('description', row.description || 'Produto importado Tecson')
            product.set('nome_produto', row.description || 'Produto importado Tecson')
            product.set('variacao', entry.variation || '')
            product.set('codigo_barras', entry.barcode_original)
            product.set('codigo_barras_tecson', entry.barcode_original)
            if (entry.cod_base) product.set('codigo_produto_tecson', entry.cod_base)
            product.set('quantity', 0)
            product.set('qtde_inicial', 0)
            product.set('qtde_loja_virtual', 0)
            product.set('publicar_no_ecommerce', false)
            product.set('estado_ativo_ecommerce', false)
            product.set('status', 'unavailable')
            product.set('criado_em_origem', IMPORT_ORIGIN_TAG)
            product.set('sku_ecommerce', '')
            if (entry.cod_base) {
              product.set('sku_interno', entry.cod_base)
              product.set('sku_novo', entry.cod_base)
            }
            // IMAGEM: produto novo → URL importada como imagem principal.
            if (importedImage) product.set('image_url', importedImage)
            if (row.description) product.set('nome_original_tecson', row.description)
            if (row.selling_price) product.set('selling_price', parseFloat(row.selling_price) || 0)
            // FORNECEDOR: informativo, vindo do CSV (ex.: 'Scaglioni Joias').
            if (row.fornecedor) product.set('fornecedor', String(row.fornecedor).trim())
            txApp.save(product)
            result.products_created++

            if (entry.variation) {
              const colVar = txApp.findCollectionByNameOrId('product_variations')
              const varRec = new Record(colVar)
              varRec.set('product', product.id)
              varRec.set('sku', entry.cod_produto_original || entry.barcode_original)
              varRec.set('attributes', JSON.stringify({ Variacao: entry.variation }))
              varRec.set('price', parseFloat(row.selling_price) || 0)
              varRec.set('quantity', 0)
              txApp.save(varRec)
              result.variations_created++
            }
          } else {
            // Produto existente: variação derivada do COD_PRODUTO, se houver.
            if (entry.variation) {
              variationRecord = findVariation(txApp, product.id, entry.variation)
              if (!variationRecord) {
                isNewVariation = true
                const colVar = txApp.findCollectionByNameOrId('product_variations')
                const varRec = new Record(colVar)
                varRec.set('product', product.id)
                varRec.set('sku', entry.cod_produto_original || entry.barcode_original)
                varRec.set('attributes', JSON.stringify({ Variacao: entry.variation }))
                varRec.set('price', parseFloat(row.selling_price) || 0)
                varRec.set('quantity', 0)
                txApp.save(varRec)
                result.variations_created++
              }
            }
            // Auditoria: grava o código de barras da Tecson se o produto não tinha.
            if (entry.barcode_original && !product.getString('codigo_barras_tecson')) {
              product.set('codigo_barras_tecson', entry.barcode_original)
              txApp.save(product)
            }
            // IMAGEM: mantém a imagem cadastrada; só usa a importada se não houver.
            if (importedImage && !product.getString('image_url')) {
              product.set('image_url', importedImage)
              txApp.save(product)
            }
            // FORNECEDOR: só preenche se o produto não tinha nenhum.
            if (row.fornecedor && !product.getString('fornecedor')) {
              product.set('fornecedor', String(row.fornecedor).trim())
              txApp.save(product)
            }
          }

          if (qty === 0) {
            result.skipped.push({
              line: line,
              code: entry.cod_produto_original,
              barcode: entry.barcode_original,
              reason: 'Quantidade zero — cadastro/mapeamento somente. Sem posse criada.',
            })
            continue
          }

          // Posse da revendedora: registro único por (reseller, product).
          const existing = txApp.findRecordsByFilter(
            'reseller_stock_items',
            "reseller = '" +
              escapeFilter(resellerId) +
              "' && product = '" +
              escapeFilter(product.id) +
              "'",
            '',
            1,
            0,
          )
          if (existing.length > 0) {
            const rec = existing[0]
            const cur = rec.getInt('quantity') || 0
            if (cur === qty) {
              result.skipped.push({
                line: line,
                code: entry.cod_produto_original,
                barcode: entry.barcode_original,
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
        }
      })

      result.success = true
      return e.json(200, result)
    } catch (err) {
      console.log('tecson/reseller-import erro:', err.message)
      return e.json(400, { error: err.message || 'Falha na importação.' })
    }
  },
  $apis.requireAuth(),
)

// ─────────────────────────────────────────────────────────────────────────────
// ROTINA DE LIMPEZA — remove os produtos-lixo criados por PRÉVIAS com o bug
// v0.0.278 (a prévia gravava de verdade em 2026-11-26 ~20:47 UTC).
//
// Só apaga produtos com criado_em_origem = IMPORT_ORIGIN_TAG (marcador gravado
// pelo próprio hook) criados na DATA informada (default 2026-11-26) — produtos
// de importações legítimas (ex. 2026-11-24) têm outra origem e NÃO são tocados.
// Para cada produto apagado, remove também:
//   - product_variations do produto
//   - reseller_stock_items do produto (posse da revendedora)
//   - product_category_links do produto (evita órfãos)
// e recomputa o saldo da revendedora afetada via recalcResellerStockBalance.
// Protegido: apenas admin/superadmin.
// ─────────────────────────────────────────────────────────────────────────────
routerAdd(
  'POST',
  '/backend/v1/tecson/reseller-import/cleanup-preview',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })

    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin') {
      return e.json(403, { error: 'Apenas superadmin/admin podem executar a limpeza.' })
    }

    // Mesmo marcador gravado pelo import (declaração duplicada inline — JSVM
    // não compartilha top-level entre handlers).
    const IMPORT_ORIGIN_TAG = 'Migração Tecson — posse de revendedora'

    const body = e.requestInfo().body || {}
    const dayStart = String(body.day_start || '2026-11-26 00:00:00.000Z')
    const dayEnd = String(body.day_end || '2026-11-27 00:00:00.000Z')

    const response = {
      success: false,
      day_start: dayStart,
      day_end: dayEnd,
      products_deleted: 0,
      variations_deleted: 0,
      stock_items_deleted: 0,
      category_links_deleted: 0,
      resellers_affected: [],
    }

    try {
      $app.runInTransaction((txApp) => {
        // Busca APENAS produtos do marcador de origem do import Tecson revendedora.
        const targets = txApp.findRecordsByFilter(
          'products',
          "criado_em_origem = '" +
            IMPORT_ORIGIN_TAG +
            "' && created >= '" +
            dayStart +
            "' && created < '" +
            dayEnd +
            "'",
          '-created',
          1000,
          0,
        )
        for (let i = 0; i < targets.length; i++) {
          const product = targets[i]
          const pid = product.id

          // Posses ligadas a este produto (para saber as revendedoras afetadas).
          let posses = []
          try {
            posses = txApp.findRecordsByFilter(
              'reseller_stock_items',
              "product = '" + pid + "'",
              '',
              100,
              0,
            )
          } catch (_) {
            posses = []
          }
          const affectedResellers = {}
          for (let j = 0; j < posses.length; j++) {
            affectedResellers[posses[j].getString('reseller')] = true
            txApp.delete(posses[j])
            response.stock_items_deleted++
          }

          // Variações do produto.
          try {
            const vars = txApp.findRecordsByFilter(
              'product_variations',
              "product = '" + pid + "'",
              '',
              100,
              0,
            )
            for (let j = 0; j < vars.length; j++) {
              txApp.delete(vars[j])
              response.variations_deleted++
            }
          } catch (_) {}

          // Links de categoria (relações cascade não configuradas).
          try {
            const links = txApp.findRecordsByFilter(
              'product_category_links',
              "product = '" + pid + "'",
              '',
              50,
              0,
            )
            for (let j = 0; j < links.length; j++) {
              txApp.delete(links[j])
              response.category_links_deleted++
            }
          } catch (_) {}

          txApp.delete(product)
          response.products_deleted++

          // Recalcula o saldo derivado das revendedoras que tinham posse do produto.
          for (const rid in affectedResellers) {
            recalcResellerStockBalance(txApp, rid)
            if (response.resellers_affected.indexOf(rid) === -1) {
              response.resellers_affected.push(rid)
            }
          }
        }
      })

      response.success = true
      console.log(
        'tecson cleanup-preview:',
        response.products_deleted,
        'produtos,',
        response.stock_items_deleted,
        'posses apagadas',
      )
      return e.json(200, response)
    } catch (err) {
      console.log('tecson/cleanup-preview erro:', err.message)
      return e.json(400, { error: err.message || 'Falha na limpeza.' })
    }
  },
  $apis.requireAuth(),
)
