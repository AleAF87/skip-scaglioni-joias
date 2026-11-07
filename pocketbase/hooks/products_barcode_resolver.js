// Endpoint de backend para resolução de códigos de barras (Opção A Tecson)
// Regra:
// 1. Procurar primeiro a combinação exata número + variação (ex.: "8112 N14" -> code=8112, variacao=N14, ou codigo_barras='8112 N14')
// 2. Se a leitura for apenas número (ex.: "8112"), só cair para "só o número" quando esse número NÃO tiver nenhuma variação cadastrada.
//    Se tiver variações cadastradas (ex.: N14, N15), retornar 'ambiguous' com a lista de variações para o PDV/usuário escolher, evitando ambiguidade.
// 3. Suporta leitura por GET (?query=...) e POST ({ query: '...' })
// 4. Retorna { matched: true, product: {...}, resolution: 'exact_code_and_variation' | 'exact_code_without_variation' }
//    ou { matched: false, ambiguous: true, reason: 'multiple_variations', variations: [...], product_count: N }
//    ou { matched: false, reason: 'not_found' }

routerAdd(
  'POST',
  '/backend/v1/products/resolve-barcode',
  (e) => {
    const sanitizeProduct = (record) => ({
      id: record.id,
      produto_id: record.getString('produto_id'),
      code: record.getString('code'),
      variacao: record.getString('variacao') || '',
      codigo_barras: record.getString('codigo_barras'),
      codigo_barras_tecson: record.getString('codigo_barras_tecson'),
      nome_produto: record.getString('nome_produto'),
      description: record.getString('description'),
      selling_price: record.getFloat('selling_price'),
      custo_unitario: record.getFloat('custo_unitario'),
      quantity: record.getInt('quantity'),
      qtde_inicial: record.getInt('qtde_inicial'),
      qtde_loja_virtual: record.getInt('qtde_loja_virtual'),
      status: record.getString('status'),
      image_url: record.getString('image_url'),
      fornecedor: record.getString('fornecedor'),
    })

    const resolveInDb = (rawInput) => {
      const normalized = String(rawInput).trim().replace(/\s+/g, ' ')
      const firstSpace = normalized.indexOf(' ')
      let numPart = normalized
      let varPart = ''

      if (firstSpace !== -1) {
        numPart = normalized.slice(0, firstSpace).trim()
        varPart = normalized.slice(firstSpace + 1).trim()
      }

      const cleanNum = numPart.replace(/^0+/, '') || (numPart ? '0' : '')
      const fullBarcodeClean = varPart ? cleanNum + ' ' + varPart : cleanNum
      const escapeFilter = (str) => String(str).replace(/'/g, "\\'")

      // PASSO 1: Se tem variação explícita na leitura
      if (varPart) {
        const filterExact =
          "code = '" + escapeFilter(cleanNum) + "' && variacao = '" + escapeFilter(varPart) + "'"
        const exactRecords = $app.findRecordsByFilter('products', filterExact, '-created', 1, 0)
        if (exactRecords && exactRecords.length > 0) {
          return {
            matched: true,
            resolution: 'exact_code_and_variation',
            product: sanitizeProduct(exactRecords[0]),
          }
        }

        const filterBarcode =
          "codigo_barras = '" +
          escapeFilter(fullBarcodeClean) +
          "' || codigo_barras_tecson = '" +
          escapeFilter(fullBarcodeClean) +
          "'"
        const barcodeRecords = $app.findRecordsByFilter('products', filterBarcode, '-created', 1, 0)
        if (barcodeRecords && barcodeRecords.length > 0) {
          return {
            matched: true,
            resolution: 'exact_barcode_field',
            product: sanitizeProduct(barcodeRecords[0]),
          }
        }
      }

      // PASSO 2: Entrada é só número ou variação não bateu
      const filterByCode = "code = '" + escapeFilter(cleanNum) + "'"
      const codeMatches = $app.findRecordsByFilter('products', filterByCode, 'variacao', 50, 0)

      if (codeMatches && codeMatches.length > 0) {
        const withVariation = codeMatches.filter((p) => {
          const v = (p.getString('variacao') || '').trim()
          return v.length > 0
        })

        // Regra aprovada: "só cair para 'só o número' quando esse número NÃO tiver nenhuma variação cadastrada"
        if (withVariation.length === 0) {
          return {
            matched: true,
            resolution: 'exact_code_without_variation',
            product: sanitizeProduct(codeMatches[0]),
          }
        }

        // Há variações cadastradas: retorna ambiguidade para evitar debitar estoque errado
        const variationList = codeMatches.map((p) => ({
          id: p.id,
          code: p.getString('code'),
          variacao: p.getString('variacao') || '(sem variação)',
          description: p.getString('description') || p.getString('nome_produto'),
          selling_price: p.getFloat('selling_price'),
          quantity: p.getInt('quantity'),
          codigo_barras: p.getString('codigo_barras'),
        }))

        return {
          matched: false,
          ambiguous: true,
          reason: 'multiple_variations',
          message:
            'O código ' +
            cleanNum +
            ' possui múltiplas variações cadastradas. Selecione a variação desejada.',
          code: cleanNum,
          variations: variationList,
          product_count: codeMatches.length,
        }
      }

      // PASSO 3: Fallback por id, sku_interno, sku_novo ou id_tecson
      const filterFallback =
        "id = '" +
        escapeFilter(normalized) +
        "' || sku_novo = '" +
        escapeFilter(cleanNum) +
        "' || sku_interno = '" +
        escapeFilter(cleanNum) +
        "' || id_tecson = '" +
        escapeFilter(normalized) +
        "'"
      const fallbackMatches = $app.findRecordsByFilter('products', filterFallback, '-created', 1, 0)
      if (fallbackMatches && fallbackMatches.length > 0) {
        return {
          matched: true,
          resolution: 'fallback_identifier',
          product: sanitizeProduct(fallbackMatches[0]),
        }
      }

      return {
        matched: false,
        ambiguous: false,
        reason: 'not_found',
        message: 'Nenhum produto encontrado para o código informado: ' + rawInput,
      }
    }

    try {
      const authUser = e.auth
      if (!authUser) {
        return e.json(401, { error: 'Não autorizado.' })
      }

      const body = e.requestInfo().body || {}
      const rawQuery = (body.query || body.barcode || body.code || '').trim()

      if (!rawQuery) {
        return e.json(400, { error: 'Parâmetro query/barcode é obrigatório.' })
      }

      const result = resolveInDb(rawQuery)
      return e.json(200, result)
    } catch (err) {
      console.log('Erro em POST resolve-barcode:', err.message)
      return e.json(500, { error: 'Falha ao resolver código de barras: ' + err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/products/resolve-barcode',
  (e) => {
    const sanitizeProduct = (record) => ({
      id: record.id,
      produto_id: record.getString('produto_id'),
      code: record.getString('code'),
      variacao: record.getString('variacao') || '',
      codigo_barras: record.getString('codigo_barras'),
      codigo_barras_tecson: record.getString('codigo_barras_tecson'),
      nome_produto: record.getString('nome_produto'),
      description: record.getString('description'),
      selling_price: record.getFloat('selling_price'),
      custo_unitario: record.getFloat('custo_unitario'),
      quantity: record.getInt('quantity'),
      qtde_inicial: record.getInt('qtde_inicial'),
      qtde_loja_virtual: record.getInt('qtde_loja_virtual'),
      status: record.getString('status'),
      image_url: record.getString('image_url'),
      fornecedor: record.getString('fornecedor'),
    })

    const resolveInDb = (rawInput) => {
      const normalized = String(rawInput).trim().replace(/\s+/g, ' ')
      const firstSpace = normalized.indexOf(' ')
      let numPart = normalized
      let varPart = ''

      if (firstSpace !== -1) {
        numPart = normalized.slice(0, firstSpace).trim()
        varPart = normalized.slice(firstSpace + 1).trim()
      }

      const cleanNum = numPart.replace(/^0+/, '') || (numPart ? '0' : '')
      const fullBarcodeClean = varPart ? cleanNum + ' ' + varPart : cleanNum
      const escapeFilter = (str) => String(str).replace(/'/g, "\\'")

      if (varPart) {
        const filterExact =
          "code = '" + escapeFilter(cleanNum) + "' && variacao = '" + escapeFilter(varPart) + "'"
        const exactRecords = $app.findRecordsByFilter('products', filterExact, '-created', 1, 0)
        if (exactRecords && exactRecords.length > 0) {
          return {
            matched: true,
            resolution: 'exact_code_and_variation',
            product: sanitizeProduct(exactRecords[0]),
          }
        }

        const filterBarcode =
          "codigo_barras = '" +
          escapeFilter(fullBarcodeClean) +
          "' || codigo_barras_tecson = '" +
          escapeFilter(fullBarcodeClean) +
          "'"
        const barcodeRecords = $app.findRecordsByFilter('products', filterBarcode, '-created', 1, 0)
        if (barcodeRecords && barcodeRecords.length > 0) {
          return {
            matched: true,
            resolution: 'exact_barcode_field',
            product: sanitizeProduct(barcodeRecords[0]),
          }
        }
      }

      const filterByCode = "code = '" + escapeFilter(cleanNum) + "'"
      const codeMatches = $app.findRecordsByFilter('products', filterByCode, 'variacao', 50, 0)

      if (codeMatches && codeMatches.length > 0) {
        const withVariation = codeMatches.filter((p) => {
          const v = (p.getString('variacao') || '').trim()
          return v.length > 0
        })

        if (withVariation.length === 0) {
          return {
            matched: true,
            resolution: 'exact_code_without_variation',
            product: sanitizeProduct(codeMatches[0]),
          }
        }

        const variationList = codeMatches.map((p) => ({
          id: p.id,
          code: p.getString('code'),
          variacao: p.getString('variacao') || '(sem variação)',
          description: p.getString('description') || p.getString('nome_produto'),
          selling_price: p.getFloat('selling_price'),
          quantity: p.getInt('quantity'),
          codigo_barras: p.getString('codigo_barras'),
        }))

        return {
          matched: false,
          ambiguous: true,
          reason: 'multiple_variations',
          message:
            'O código ' +
            cleanNum +
            ' possui múltiplas variações cadastradas. Selecione a variação desejada.',
          code: cleanNum,
          variations: variationList,
          product_count: codeMatches.length,
        }
      }

      const filterFallback =
        "id = '" +
        escapeFilter(normalized) +
        "' || sku_novo = '" +
        escapeFilter(cleanNum) +
        "' || sku_interno = '" +
        escapeFilter(cleanNum) +
        "' || id_tecson = '" +
        escapeFilter(normalized) +
        "'"
      const fallbackMatches = $app.findRecordsByFilter('products', filterFallback, '-created', 1, 0)
      if (fallbackMatches && fallbackMatches.length > 0) {
        return {
          matched: true,
          resolution: 'fallback_identifier',
          product: sanitizeProduct(fallbackMatches[0]),
        }
      }

      return {
        matched: false,
        ambiguous: false,
        reason: 'not_found',
        message: 'Nenhum produto encontrado para o código informado: ' + rawInput,
      }
    }

    try {
      const authUser = e.auth
      if (!authUser) {
        return e.json(401, { error: 'Não autorizado.' })
      }

      const queryParam = (
        e.request.url.query().get('query') ||
        e.request.url.query().get('code') ||
        ''
      ).trim()

      if (!queryParam) {
        return e.json(400, { error: 'Parâmetro query é obrigatório na URL.' })
      }

      const result = resolveInDb(queryParam)
      return e.json(200, result)
    } catch (err) {
      console.log('Erro em GET resolve-barcode:', err.message)
      return e.json(500, { error: 'Falha ao resolver código de barras: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
