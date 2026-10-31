migrate(
  (app) => {
    // Backfill idempotente: para produtos existentes com minimum_quantity vazio, nulo ou zero,
    // definir minimum_quantity = MAX(1, ROUND(quantity * 0.3)).
    // Para os produtos importados, quantity no momento representa a quantidade inicial.
    // Registros que já possuem minimum_quantity > 0 não são alterados.
    // Códigos, quantidades, preços e demais campos permanecem estritamente intactos.
    app
      .db()
      .newQuery(`
    UPDATE products
    SET minimum_quantity = CASE
      WHEN CAST(ROUND(quantity * 0.3) AS INTEGER) < 1 THEN 1
      ELSE CAST(ROUND(quantity * 0.3) AS INTEGER)
    END
    WHERE (minimum_quantity IS NULL OR minimum_quantity = 0)
      AND quantity IS NOT NULL
  `)
      .execute()
  },
  (app) => {
    // Reversão não necessária para backfill de dados
  },
)
