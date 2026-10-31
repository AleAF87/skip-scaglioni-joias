migrate(
  (app) => {
    // Garante que o contador product_numeric_code em app_sequences esteja inicializado
    // e caso nenhum produto tenha sido importado ainda ou o contador esteja zerado, mantenha em 0.
    // Como nada foi importado ainda, garante que o próximo produto comece em 1.
    try {
      const rows = []
      app
        .db()
        .newQuery(
          "SELECT id, current_value FROM app_sequences WHERE name = 'product_numeric_code' LIMIT 1",
        )
        .all(rows)

      if (rows && rows.length > 0) {
        // Se a coleção products estiver sem produtos ou com contagem 0, garante current_value = 0
        const prodCount = app.countRecords('products')
        if (prodCount === 0) {
          app
            .db()
            .newQuery(
              "UPDATE app_sequences SET current_value = 0, updated = {:updated} WHERE name = 'product_numeric_code'",
            )
            .bind({ updated: new Date().toISOString() })
            .execute()
        }
      } else {
        const col = app.findCollectionByNameOrId('app_sequences')
        const rec = new Record(col)
        rec.set('name', 'product_numeric_code')
        rec.set('current_value', 0)
        app.save(rec)
      }
    } catch (err) {
      console.log('Aviso ao inicializar contador product_numeric_code:', err.message)
    }
  },
  () => {},
)
