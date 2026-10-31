migrate(
  (app) => {
    // Configura o início da sequência de código numérico de produto para 10000.
    // current_value = 9999 faz com que o próximo produto criado receba 10000.
    // A numeração é contínua e sequencial (10000, 10001, ..., 99999, 100000, ...) sem zeros à esquerda.
    try {
      const rows = []
      app
        .db()
        .newQuery(
          "SELECT id, current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
        )
        .all(rows)

      if (rows && rows.length > 0) {
        const row = rows[0]
        const rec = app.findRecordById('app_sequences', row.id)
        const currentVal = rec.getInt('current_value')
        if (currentVal < 9999) {
          rec.set('current_value', 9999)
          app.save(rec)
        }
      } else {
        const col = app.findCollectionByNameOrId('app_sequences')
        const rec = new Record(col)
        rec.set('name', 'product_numeric_code')
        rec.set('current_value', 9999)
        app.save(rec)
      }
    } catch (err) {
      console.log('Aviso ao inicializar contador product_numeric_code em 9999:', err.message)
    }
  },
  () => {},
)
