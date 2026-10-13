// Hook to atomically generate sequential 6-digit product code (starting at 100001)
// if code is empty or missing on product creation.

function generateNextSequentialProductCode(appInstance) {
  // Query all existing products with codes to find the maximum purely numerical code.
  // Old codes with prefix like "JOIA-1001" are ignored.
  // Starting baseline is 100001.
  let maxNum = 100000

  try {
    // PocketBase SQLite query to find max numerical code
    const rows = []
    appInstance
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
    // Fallback using findRecordsByFilter
    try {
      const records = appInstance.findRecordsByFilter('products', '', '-created', 500, 0)
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

  // Generate candidate with retry loop against collision
  let candidate = maxNum + 1
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidateStr = candidate.toString()
    let exists = false
    try {
      const found = appInstance.findFirstRecordByData('products', 'code', candidateStr)
      if (found) {
        exists = true
      }
    } catch (_) {
      // Not found means it's available!
      exists = false
    }

    if (!exists) {
      return candidateStr
    }
    candidate++
  }

  // Safety fallback if loop exhausted
  return (maxNum + 100).toString()
}

// 1. Endpoint for frontend preview of the next code
routerAdd(
  'GET',
  '/backend/v1/products/next-code',
  (e) => {
    const nextCode = generateNextSequentialProductCode($app)
    return e.json(200, { next_code: nextCode })
  },
  $apis.requireAuth(),
)

// 2. onRecordCreateExecute hook for 'products' collection:
// If code is not provided or empty, generate next atomic sequential 6-digit code.
onRecordCreateExecute((e) => {
  const record = e.record
  const incomingCode = (record.getString('code') || '').trim()

  if (!incomingCode) {
    const generatedCode = generateNextSequentialProductCode($app)
    record.set('code', generatedCode)
    console.log('Código gerado automaticamente no servidor para novo produto:', generatedCode)
  } else {
    // Ensure code is uppercase and trimmed if provided
    record.set('code', incomingCode.toUpperCase())
  }

  e.next()
}, 'products')
