// Helper e Hooks para geração atômica e sequencial de código numérico crescente
// Regra do negócio: a sequência inicia em 10000 (primeiro código = 10000; 10000, 10001... 99999, 100000...)
// Sem zeros à esquerda: o código é gravado e exibido como número puro
// All helper logic is declared inline inside callbacks to avoid JSVM top-level scoping errors.

// 1. Endpoint para preview do próximo código numérico sequencial (somente leitura / consulta prévia)
routerAdd(
  'GET',
  '/backend/v1/products/next-code',
  (e) => {
    // Piso inicial obrigatório: 9999 (para que o próximo seja 10000)
    let currentVal = 9999

    try {
      const rows = []
      $app
        .db()
        .newQuery(
          "SELECT current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
        )
        .all(rows)

      if (rows && rows.length > 0 && rows[0].current_value !== undefined) {
        const valFromDb = parseInt(rows[0].current_value, 10) || 0
        if (valFromDb > currentVal) {
          currentVal = valFromDb
        }
      }
    } catch (err) {
      console.log('Aviso ao consultar app_sequences:', err.message)
    }

    // Carrega todos os códigos numéricos ocupados (Tecson, Scaglioni, manuais)
    // Interpretados como número inteiro puro (zeros à esquerda removidos)
    const usedNumericSet = {}
    try {
      const prodRows = []
      $app
        .db()
        .newQuery(
          'SELECT code, sku_novo, codigo_barras_tecson, codigo_produto_tecson, codigo_barras, sku_interno, id_tecson, id_scaglioni FROM products',
        )
        .all(prodRows)

      for (let i = 0; i < prodRows.length; i++) {
        const r = prodRows[i]
        const checkFields = [
          r.code,
          r.sku_novo,
          r.codigo_barras_tecson,
          r.codigo_produto_tecson,
          r.codigo_barras,
          r.sku_interno,
        ]
        for (let j = 0; j < checkFields.length; j++) {
          const f = (checkFields[j] || '').trim()
          if (/^\d+$/.test(f)) {
            const num = parseInt(f, 10)
            if (!isNaN(num)) {
              usedNumericSet[num] = true
            }
          }
        }
      }
    } catch (err) {
      console.log('Aviso ao carregar números ocupados em products:', err.message)
    }

    // Encontra o próximo candidato livre pulando números já ocupados
    let candidate = currentVal + 1
    if (candidate < 10000) candidate = 10000

    while (usedNumericSet[candidate]) {
      candidate++
    }

    const nextVal = candidate
    const nextCode = String(nextVal)

    return e.json(200, { next_code: nextCode, next_number: nextVal })
  },
  $apis.requireAuth(),
)

// 2. onRecordCreateRequest hook for 'products' collection
// Garante que sku_novo e code sejam preenchidos com o código numérico sequencial crescente seguro contra concorrência
onRecordCreateRequest((e) => {
  const record = e.record
  if (record) {
    const incomingSkuNovo = (record.getString('sku_novo') || '').trim()
    const incomingCode = (record.getString('code') || '').trim()

    // Se já veio com código numérico puro, mantém
    const isPureNumeric = (s) => /^\d+$/.test(s)

    if (incomingSkuNovo && isPureNumeric(incomingSkuNovo)) {
      // Já possui numérico no sku_novo
      if (!incomingCode) {
        record.set('code', incomingSkuNovo)
      }
      return e.next()
    }

    // Gerar próximo número com lock/transação atômica em app_sequences
    try {
      $app.runInTransaction((txApp) => {
        // Piso inicial da sequência: 9999 (próximo é 10000)
        let currentSeq = 9999
        const rows = []
        txApp
          .db()
          .newQuery(
            "SELECT id, current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
          )
          .all(rows)

        if (rows && rows.length > 0) {
          if (rows[0].current_value !== undefined) {
            const valFromDb = parseInt(rows[0].current_value, 10) || 0
            if (valFromDb > currentSeq) {
              currentSeq = valFromDb
            }
          }
        }

        // Mapeia todos os números ocupados no banco (Tecson, Scaglioni, etc.)
        const usedNumericSet = {}
        const prodRows = []
        try {
          txApp
            .db()
            .newQuery(
              'SELECT code, sku_novo, codigo_barras_tecson, codigo_produto_tecson, codigo_barras, sku_interno FROM products',
            )
            .all(prodRows)

          for (let i = 0; i < prodRows.length; i++) {
            const r = prodRows[i]
            const checkFields = [
              r.code,
              r.sku_novo,
              r.codigo_barras_tecson,
              r.codigo_produto_tecson,
              r.codigo_barras,
              r.sku_interno,
            ]
            for (let j = 0; j < checkFields.length; j++) {
              const f = (checkFields[j] || '').trim()
              if (/^\d+$/.test(f)) {
                const num = parseInt(f, 10)
                if (!isNaN(num)) {
                  usedNumericSet[num] = true
                }
              }
            }
          }
        } catch (_) {}

        // Encontra o próximo candidato livre a partir de currentSeq + 1
        let candidate = currentSeq + 1
        if (candidate < 10000) candidate = 10000

        while (usedNumericSet[candidate]) {
          candidate++
        }

        const nextVal = candidate
        const formattedCode = String(nextVal)

        // Atualiza app_sequences para a posição do número atribuído
        txApp
          .db()
          .newQuery(
            "UPDATE app_sequences SET current_value = {:val}, updated = {:updated} WHERE name = 'product_numeric_code'",
          )
          .bind({ val: nextVal, updated: new Date().toISOString() })
          .execute()

        record.set('sku_novo', formattedCode)
        if (!record.getString('sku_interno')) {
          record.set('sku_interno', formattedCode)
        }
        if (!incomingCode || incomingCode.startsWith('SCG-')) {
          record.set('code', formattedCode)
        }
        console.log(
          'Código numérico sequencial atômico gerado para produto (pulando ocupados):',
          formattedCode,
        )
      })
    } catch (seqErr) {
      console.log('Erro ao gerar código numérico sequencial atômico:', seqErr.message)
    }
  }
  e.next()
}, 'products')
