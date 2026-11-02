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
      const seqRecord = $app.findFirstRecordByFilter(
        'app_sequences',
        "name = 'product_numeric_code'",
      )
      if (seqRecord) {
        const valFromDb = seqRecord.getInt('current_value') || 0
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
      let page = 1
      while (true) {
        const prodRecords = $app.findRecordsByFilter('products', '', '', 1000, (page - 1) * 1000)
        if (!prodRecords || prodRecords.length === 0) break

        for (let i = 0; i < prodRecords.length; i++) {
          const r = prodRecords[i]
          const checkFields = [
            r.getString('code'),
            r.getString('sku_novo'),
            r.getString('codigo_barras_tecson'),
            r.getString('codigo_produto_tecson'),
            r.getString('codigo_barras'),
            r.getString('sku_interno'),
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
        if (prodRecords.length < 1000) break
        page++
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
    const stripZeros = (s) => {
      if (!s) return ''
      const t = String(s).trim()
      if (!/^\d+$/.test(t)) return t
      const stripped = t.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    }

    // Higieniza qualquer código numérico enviado com zeros à esquerda
    const rawSkuNovo = (record.getString('sku_novo') || '').trim()
    const rawCode = (record.getString('code') || '').trim()
    const rawCodigoBarras = (record.getString('codigo_barras') || '').trim()
    const rawSkuInterno = (record.getString('sku_interno') || '').trim()
    const rawCodTecson = (record.getString('codigo_barras_tecson') || '').trim()

    if (rawSkuNovo && /^\d+$/.test(rawSkuNovo)) record.set('sku_novo', stripZeros(rawSkuNovo))
    if (rawCode && /^\d+$/.test(rawCode)) record.set('code', stripZeros(rawCode))
    if (rawCodigoBarras && /^\d+$/.test(rawCodigoBarras))
      record.set('codigo_barras', stripZeros(rawCodigoBarras))
    if (rawSkuInterno && /^\d+$/.test(rawSkuInterno))
      record.set('sku_interno', stripZeros(rawSkuInterno))
    if (rawCodTecson && /^\d+$/.test(rawCodTecson))
      record.set('codigo_barras_tecson', stripZeros(rawCodTecson))

    const incomingSkuNovo = (record.getString('sku_novo') || '').trim()
    const incomingCode = (record.getString('code') || '').trim()

    // Se já veio com código numérico puro, mantém
    const isPureNumeric = (s) => /^\d+$/.test(s)

    if (incomingSkuNovo && isPureNumeric(incomingSkuNovo)) {
      // Já possui numérico no sku_novo
      if (!incomingCode) {
        record.set('code', incomingSkuNovo)
      }
      if (!record.getString('codigo_barras')) {
        record.set('codigo_barras', incomingSkuNovo)
      }
      return e.next()
    }

    // Gerar próximo número com lock/transação atômica em app_sequences
    try {
      $app.runInTransaction((txApp) => {
        // Piso inicial da sequência: 9999 (próximo é 10000)
        let currentSeq = 9999
        let seqRec = null
        try {
          seqRec = txApp.findFirstRecordByFilter('app_sequences', "name = 'product_numeric_code'")
          if (seqRec) {
            const valFromDb = seqRec.getInt('current_value') || 0
            if (valFromDb > currentSeq) {
              currentSeq = valFromDb
            }
          }
        } catch (_) {}

        // Mapeia todos os números ocupados no banco (Tecson, Scaglioni, etc.)
        const usedNumericSet = {}
        try {
          let page = 1
          while (true) {
            const prodRecords = txApp.findRecordsByFilter(
              'products',
              '',
              '',
              1000,
              (page - 1) * 1000,
            )
            if (!prodRecords || prodRecords.length === 0) break

            for (let i = 0; i < prodRecords.length; i++) {
              const r = prodRecords[i]
              const checkFields = [
                r.getString('code'),
                r.getString('sku_novo'),
                r.getString('codigo_barras_tecson'),
                r.getString('codigo_produto_tecson'),
                r.getString('codigo_barras'),
                r.getString('sku_interno'),
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
            if (prodRecords.length < 1000) break
            page++
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
        if (seqRec) {
          seqRec.set('current_value', nextVal)
          txApp.save(seqRec)
        } else {
          try {
            const seqCol = txApp.findCollectionByNameOrId('app_sequences')
            const newSeqRec = new Record(seqCol)
            newSeqRec.set('name', 'product_numeric_code')
            newSeqRec.set('current_value', nextVal)
            txApp.save(newSeqRec)
          } catch (_) {}
        }

        record.set('sku_novo', formattedCode)
        if (!record.getString('sku_interno')) {
          record.set('sku_interno', formattedCode)
        }
        if (!incomingCode || incomingCode.startsWith('SCG-')) {
          record.set('code', formattedCode)
        }
        if (!record.getString('codigo_barras')) {
          record.set('codigo_barras', formattedCode)
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

// 3. onRecordUpdateRequest hook for 'products' collection
// Garante que qualquer atualização manual ou via API de código numérico remova zeros à esquerda
onRecordUpdateRequest((e) => {
  const record = e.record
  if (record) {
    const stripZeros = (s) => {
      if (!s) return ''
      const t = String(s).trim()
      if (!/^\d+$/.test(t)) return t
      const stripped = t.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    }

    const codeFields = ['code', 'codigo_barras', 'codigo_barras_tecson', 'sku_interno', 'sku_novo']

    for (let i = 0; i < codeFields.length; i++) {
      const f = codeFields[i]
      const val = (record.getString(f) || '').trim()
      if (val && /^\d+$/.test(val)) {
        const cleaned = stripZeros(val)
        if (cleaned !== val) {
          record.set(f, cleaned)
        }
      }
    }
  }
  e.next()
}, 'products')
