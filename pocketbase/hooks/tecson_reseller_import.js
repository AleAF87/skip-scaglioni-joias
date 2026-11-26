// Hook de importação Tecson → posse de revendedora.
// Chamado pela página /importar-tecson-revendedora com pb.send('/backend/v1/tecson/reseller-import').
// Recebe uma prévia pronta do frontend (linhas agrupadas por COD_PRODUTO do Tecson)
// e executa TUDO-OU-NADA numa única transação.
//
// Regras do modelo invertido (decisão do usuário):
//  - products.quantity = ESTOQUE FÍSICO (gravado/editável)
//  - Total = Físico + soma das posses em reseller_stock_items (calculado, nunca gravado)
//  - Produto existente: aumenta a POSSE da revendedora; Físico não muda
//  - Produto novo: Físico 0, qtde_inicial = quantidade importada, não publicado
//  - CHAVE PRINCIPAL = COD_PRODUTO (código interno Scaglioni, 6 dígitos ou o que vier);
//    CODIGO_BARRAS_TECSON é apenas auditoria/legado. Nunca inventa EAN/GTIN.
//  - Quantidade 0: NÃO cria posse nem altera estoque — só cadastro/mapeamento.
//  - Não é criada maleta/entrega (reseller_deliveries) nesta migração; a posse fica
//    registrada em reseller_stock_items com origem/auditoria na própria importação.
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

    // Normalização: preserva o código ORIGINAL do Tecson como veio (com variação),
    // mas deriva base numérica para busca/criação do produto (sem zeros à esquerda).
    const parseCodProduto = (raw) => {
      const original = String(raw || '')
        .trim()
        .replace(/\s+/g, ' ')
      if (!original) return null
      const parts = original.split(' ')
      const baseNum = (parts[0] || '').replace(/\D/g, '')
      const base = baseNum ? baseNum.replace(/^0+/, '') || '0' : ''
      const variation = parts.length > 1 ? parts.slice(1).join(' ') : ''
      return { original, base, variation }
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

    // Pré-validação fora da transação: falha rápido se algo inválido.
    const perCod = {}
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const line = row.line || i + 2
      const parsed = parseCodProduto(row.cod_produto)
      if (!parsed || !parsed.base) {
        result.skipped.push({ line, code: row.cod_produto || '', reason: 'COD_PRODUTO inválido.' })
        continue
      }
      const qty = parseInt(row.quantity, 10) || 0
      if (qty < 0) {
        result.skipped.push({ line, code: parsed.original, reason: 'Quantidade negativa.' })
        continue
      }
      const key = parsed.base + (parsed.variation ? ' | ' + normForCompare(parsed.variation) : '')
      if (!perCod[key]) {
        perCod[key] = {
          base: parsed.base,
          variation: parsed.variation,
          cod_original: parsed.original,
          codigo_barras_tecson: String(row.codigo_barras_tecson || '').trim(),
          quantity: 0,
          row: row,
        }
      }
      perCod[key].quantity += qty
    }

    const validKeys = Object.keys(perCod)
    if (validKeys.length === 0) {
      return e.json(200, { ...result, success: true, message: 'Nada importável.' })
    }

    // Encontra uma variação do produto cujo label/sku bata com a variação do CSV.
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
          const candidates = [label, sku, skuSuffix, v.getString('codigo_barras') || '']
          for (let j = 0; j < candidates.length; j++) {
            if (candidates[j] && normForCompare(candidates[j]) === vNorm) return v
          }
        }
      } catch (_) {}
      return null
    }

    // Resolve TODOS os produtos com o mesmo código base (para detectar conflito).
    // Busca por: code, sku_novo, sku_interno, codigo_produto_tecson, id_tecson.
    // NOTA: codigo_barras_tecson NÃO é usado para localizar produto (auditoria).
    const findProductsByBase = (txApp, base) => {
      const esc = escapeFilter(base)
      const filter =
        "code = '" +
        esc +
        "' || sku_novo = '" +
        esc +
        "' || sku_interno = '" +
        esc +
        "' || codigo_produto_tecson = '" +
        esc +
        "' || id_tecson = '" +
        esc +
        "'"
      return txApp.findRecordsByFilter('products', filter, '-created', 50, 0)
    }

    try {
      $app.runInTransaction((txApp) => {
        const reseller = txApp.findRecordById('resellers', resellerId)
        const resellerName = reseller.getString('name')

        for (let k = 0; k < validKeys.length; k++) {
          const key = validKeys[k]
          const entry = perCod[key]
          const qty = entry.quantity
          const row = entry.row
          const line = row.line

          const matches = findProductsByBase(txApp, entry.base)

          if (matches.length > 1) {
            result.skipped.push({
              line,
              code: entry.cod_original,
              reason:
                'Conflito: ' +
                matches.length +
                ' produtos com o código ' +
                entry.base +
                '. Resolva manualmente.',
            })
            continue
          }

          let product = matches.length === 1 ? matches[0] : null
          let isNew = false
          let isNewVariation = false
          let variationRecord = null

          if (!product) {
            // Produto novo: Físico 0, qtde_inicial = quantidade importada,
            // não publicado, origem "Migração Tecson — posse de revendedora".
            // NÃO inventa EAN/GTIN: codigo_barras fica vazio (products_code_sequence
            // gera o código sequencial numérico quando não há código puro).
            isNew = true
            const col = txApp.findCollectionByNameOrId('products')
            product = new Record(col)
            product.set('description', row.description || 'Produto importado Tecson')
            product.set('nome_produto', row.description || 'Produto importado Tecson')
            product.set('variacao', entry.variation || '')
            product.set('codigo_barras', '')
            product.set('codigo_barras_tecson', entry.codigo_barras_tecson)
            product.set('codigo_produto_tecson', entry.base)
            product.set('quantity', 0)
            product.set('qtde_inicial', qty)
            product.set('qtde_loja_virtual', 0)
            product.set('publicar_no_ecommerce', false)
            product.set('estado_ativo_ecommerce', false)
            product.set('status', 'unavailable')
            product.set('criado_em_origem', 'Migração Tecson — posse de revendedora')
            product.set('sku_ecommerce', '')
            product.set('sku_interno', entry.base)
            product.set('sku_novo', entry.base)
            product.set('code', entry.base)
            if (row.description) product.set('nome_original_tecson', row.description)
            if (row.selling_price) product.set('selling_price', parseFloat(row.selling_price) || 0)
            txApp.save(product)
            result.products_created++

            if (entry.variation) {
              const colVar = txApp.findCollectionByNameOrId('product_variations')
              const varRec = new Record(colVar)
              varRec.set('product', product.id)
              varRec.set('sku', entry.cod_original)
              varRec.set('attributes', JSON.stringify({ Variacao: entry.variation }))
              varRec.set('price', parseFloat(row.selling_price) || 0)
              varRec.set('quantity', 0)
              txApp.save(varRec)
              result.variations_created++
            }
          } else {
            // Produto existente: se o COD_PRODUTO trouxe variação, busca a variação real.
            if (entry.variation) {
              variationRecord = findVariation(txApp, product.id, entry.variation)
              if (!variationRecord) {
                // Variação não existe no produto: cria a variação (novo, com preço Tecson).
                isNewVariation = true
                const colVar = txApp.findCollectionByNameOrId('product_variations')
                const varRec = new Record(colVar)
                varRec.set('product', product.id)
                varRec.set('sku', entry.cod_original)
                varRec.set('attributes', JSON.stringify({ Variacao: entry.variation }))
                varRec.set('price', parseFloat(row.selling_price) || 0)
                varRec.set('quantity', 0)
                txApp.save(varRec)
                result.variations_created++
              }
            }
            // Auditoria: se o produto existente não tinha codigo_barras_tecson, grava.
            if (entry.codigo_barras_tecson && !product.getString('codigo_barras_tecson')) {
              product.set('codigo_barras_tecson', entry.codigo_barras_tecson)
              txApp.save(product)
            }
          }

          if (qty === 0) {
            result.skipped.push({
              line,
              code: entry.cod_original,
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
                line,
                code: entry.cod_original,
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
