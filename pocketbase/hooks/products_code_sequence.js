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

    // Se houver produtos com numeração maior, calcular max existente
    try {
      const prodRows = []
      $app.db().newQuery('SELECT sku_novo, code FROM products').all(prodRows)

      for (let i = 0; i < prodRows.length; i++) {
        const sn = (prodRows[i].sku_novo || '').trim()
        const c = (prodRows[i].code || '').trim()
        if (/^\d+$/.test(sn)) {
          const v = parseInt(sn, 10)
          if (!isNaN(v) && v > currentVal) currentVal = v
        }
        if (/^\d+$/.test(c)) {
          const v = parseInt(c, 10)
          if (!isNaN(v) && v > currentVal) currentVal = v
        }
      }
    } catch (_) {}

    const nextVal = currentVal + 1
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
        let seqRecordId = null
        const rows = []
        txApp
          .db()
          .newQuery(
            "SELECT id, current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
          )
          .all(rows)

        if (rows && rows.length > 0) {
          seqRecordId = rows[0].id
          if (rows[0].current_value !== undefined) {
            const valFromDb = parseInt(rows[0].current_value, 10) || 0
            if (valFromDb > currentSeq) {
              currentSeq = valFromDb
            }
          }
        }

        // Também assegura que não seja menor do que qualquer numérico existente em products
        const prodRows = []
        try {
          txApp.db().newQuery('SELECT sku_novo, code FROM products').all(prodRows)

          for (let i = 0; i < prodRows.length; i++) {
            const sn = (prodRows[i].sku_novo || '').trim()
            const c = (prodRows[i].code || '').trim()
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

        const nextVal = currentSeq + 1
        const formattedCode = String(nextVal)

        // Atualiza app_sequences
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
        console.log('Código numérico sequencial atômico gerado para produto:', formattedCode)
      })
    } catch (seqErr) {
      console.log('Erro ao gerar código numérico sequencial atômico:', seqErr.message)
    }
  }
  e.next()
}, 'products')
