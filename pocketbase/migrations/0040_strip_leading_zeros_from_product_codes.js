// Migration 0040: Remove zeros à esquerda dos códigos de barras e códigos numéricos de produtos
// Conforme regra de negócio da Scaglioni Joias: códigos numéricos são gravados SEM zeros à esquerda
// Exemplo: '0000000814508' passa a ser '814508'.
// SKUs alfanuméricos como 'BRCVPR01' ou códigos com letras NÃO são alterados.
// Idempotente e segura para bases vazias ou já migradas.

migrate(
  (app) => {
    const stripZeros = (val) => {
      if (!val || typeof val !== 'string') return val
      const trimmed = val.trim()
      if (!/^\d+$/.test(trimmed)) return val
      const stripped = trimmed.replace(/^0+/, '')
      return stripped === '' ? '0' : stripped
    }

    // 1. Atualizar registros na coleção 'products'
    // SQLite suporta LTRIM(val, '0'), mas fazer em JS ou SQL seguro com CASE garante que não transforme '0' em ''
    // Executamos via script JS linha a linha ou SQL direto
    try {
      let page = 1
      while (true) {
        const records = app.findRecordsByFilter('products', '', '', 500, (page - 1) * 500)
        if (!records || records.length === 0) break

        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          let changed = false

          const codeFields = [
            'code',
            'codigo_barras',
            'codigo_barras_tecson',
            'sku_interno',
            'sku_novo',
          ]

          for (let j = 0; j < codeFields.length; j++) {
            const field = codeFields[j]
            const oldVal = record.getString(field)
            if (oldVal && /^\d+$/.test(oldVal.trim())) {
              const newVal = stripZeros(oldVal)
              if (newVal !== oldVal) {
                record.set(field, newVal)
                changed = true
              }
            }
          }

          if (changed) {
            app.save(record)
          }
        }

        if (records.length < 500) break
        page++
      }
    } catch (err) {
      console.log('Aviso ao higienizar zeros à esquerda em products:', err.message)
    }
  },
  (app) => {
    // Operação irreversível por natureza (não é possível saber quantos zeros originais existiam antes da remoção)
  },
)
