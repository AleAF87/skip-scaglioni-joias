// Hook to atomically generate sequential 6-digit product code (starting at 100001)
// if code is empty or missing on product creation.
// All helper logic is declared inline inside callbacks to avoid JSVM top-level scoping errors.

// 1. Endpoint for frontend preview of the next code
routerAdd(
  'GET',
  '/backend/v1/products/next-code',
  (e) => {
    let maxNum = 100000

    try {
      const rows = []
      $app
        .db()
        .newQuery("SELECT code FROM products WHERE code IS NOT NULL AND code != ''")
        .all(rows)

      for (let i = 0; i < rows.length; i++) {
        const c = (rows[i].code || '').trim()
        if (/^\d+$/.test(c)) {
          const val = parseInt(c, 10)
          if (!isNaN(val) && val > maxNum) {
            maxNum = val
          }
        }
      }
    } catch (err) {
      console.log('Aviso ao consultar códigos numéricos existentes:', err.message)
      try {
        const records = $app.findRecordsByFilter('products', '', '-created', 500, 0)
        for (let i = 0; i < records.length; i++) {
          const c = records[i].getString('code').trim()
          if (/^\d+$/.test(c)) {
            const val = parseInt(c, 10)
            if (!isNaN(val) && val > maxNum) {
              maxNum = val
            }
          }
        }
      } catch (_) {}
    }

    let candidate = maxNum + 1
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidateStr = candidate.toString()
      let exists = false
      try {
        const found = $app.findFirstRecordByData('products', 'code', candidateStr)
        if (found) {
          exists = true
        }
      } catch (_) {
        exists = false
      }

      if (!exists) {
        return e.json(200, { next_code: candidateStr })
      }
      candidate++
    }

    return e.json(200, { next_code: (maxNum + 100).toString() })
  },
  $apis.requireAuth(),
)

// 2. onRecordCreateRequest hook for 'products' collection
onRecordCreateRequest((e) => {
  const record = e.record
  if (record) {
    const incomingCode = (record.getString('code') || '').trim()
    if (!incomingCode) {
      let maxNum = 100000
      try {
        const rows = []
        $app
          .db()
          .newQuery("SELECT code FROM products WHERE code IS NOT NULL AND code != ''")
          .all(rows)

        for (let i = 0; i < rows.length; i++) {
          const c = (rows[i].code || '').trim()
          if (/^\d+$/.test(c)) {
            const val = parseInt(c, 10)
            if (!isNaN(val) && val > maxNum) {
              maxNum = val
            }
          }
        }
      } catch (_) {}

      let candidate = maxNum + 1
      let chosenCode = (maxNum + 100).toString()
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidateStr = candidate.toString()
        let exists = false
        try {
          const found = $app.findFirstRecordByData('products', 'code', candidateStr)
          if (found) {
            exists = true
          }
        } catch (_) {
          exists = false
        }
        if (!exists) {
          chosenCode = candidateStr
          break
        }
        candidate++
      }

      record.set('code', chosenCode)
      console.log('Código gerado automaticamente no servidor para novo produto:', chosenCode)
    } else {
      record.set('code', incomingCode)
    }
  }
  e.next()
}, 'products')

// 3. onRecordCreateExecute hook for 'products' collection
onRecordCreateExecute((e) => {
  const record = e.record
  if (record) {
    const incomingCode = (record.getString('code') || '').trim()
    if (!incomingCode) {
      let maxNum = 100000
      try {
        const rows = []
        $app
          .db()
          .newQuery("SELECT code FROM products WHERE code IS NOT NULL AND code != ''")
          .all(rows)

        for (let i = 0; i < rows.length; i++) {
          const c = (rows[i].code || '').trim()
          if (/^\d+$/.test(c)) {
            const val = parseInt(c, 10)
            if (!isNaN(val) && val > maxNum) {
              maxNum = val
            }
          }
        }
      } catch (_) {}

      let candidate = maxNum + 1
      let chosenCode = (maxNum + 100).toString()
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidateStr = candidate.toString()
        let exists = false
        try {
          const found = $app.findFirstRecordByData('products', 'code', candidateStr)
          if (found) {
            exists = true
          }
        } catch (_) {
          exists = false
        }
        if (!exists) {
          chosenCode = candidateStr
          break
        }
        candidate++
      }

      record.set('code', chosenCode)
    } else {
      record.set('code', incomingCode)
    }
  }
  e.next()
}, 'products')
