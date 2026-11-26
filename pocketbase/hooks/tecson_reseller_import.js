// Hook de importação Tecson → posse de revendedora.
// Chamado pela página /importar-tecson-revendedora com pb.send('/backend/v1/tecson/reseller-import').
// Recebe as linhas JÁ parseadas por cabeçalho no frontend (tecsonCsvParser.ts) e
// executa TUDO-OU-NADA numa única transação.
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
//  - JSVM: cada handler roda isolado — tudo duplicado inline aqui.

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
            product.set('criado_em_origem', 'Migração Tecson — posse de revendedora')
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
