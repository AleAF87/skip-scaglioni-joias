/**
 * 0057 — Backfill de `group` nas categorias criadas pela importação Scaglioni.
 *
 * Registros antigos foram criados com group vazio (''), o que os escondia dos
 * filtros por grupo (Metal / Tipo) usados na vitrine e nos cadastros. Este
 * backfill é idempotente: só toca em linhas com group vazio e faz no-op numa
 * base onde não existem linhas assim.
 *
 * Inferência de grupo pelo nome (mesma heurística do hook de importação):
 * nomes que remetem a material/metal → 'metal'; caso contrário → 'tipo'.
 */
migrate(
  (app) => {
    const isMetalName = (name) =>
      /metal|ouro|prata|rodio|r[oó]dio|inox|a[çc]o|banho|dourad/i.test(name || '')

    // 1) Preenche o grupo das categorias sem grupo (via SQL cru para evitar a
    //    sintaxe de filtro do PocketBase, que não aceita o colchetes de [group]).
    try {
      const rows = app
        .db()
        .newQuery('SELECT id, name FROM product_categories WHERE "group" IS NULL OR "group" = \'\'')
        .all()
      for (const row of rows) {
        try {
          const rec = app.findRecordById('product_categories', row.getString('id'))
          const name = rec.getString('name')
          rec.set('group', isMetalName(name) ? 'metal' : 'tipo')
          app.save(rec)
        } catch (errRow) {
          console.log('Aviso ao preencher grupo da categoria:', errRow.message || errRow)
        }
      }
    } catch (errSel) {
      console.log('Aviso ao listar categorias sem grupo:', errSel.message || errSel)
    }

    // 2) Dedup: pode existir o mesmo nome em 'tipo' (antigo) e em 'metal'/'tipo'
    //    (backfill). Remove a duplicata e re-aponta os product_category_links.
    try {
      const dupes = app
        .db()
        .newQuery(
          'SELECT MIN(id) AS keep_id, name, "group" AS grp, COUNT(*) AS total FROM product_categories GROUP BY name, "group" HAVING COUNT(*) > 1',
        )
        .all()
      for (const d of dupes) {
        const keepId = d.getString('keep_id')
        const extras = app
          .db()
          .newQuery(
            'SELECT id FROM product_categories WHERE name = {:name} AND "group" = {:grp} AND id != {:keep}',
          )
          .bind({ name: d.getString('name'), grp: d.getString('grp'), keep: keepId })
          .all()
        for (const ex of extras) {
          const extraId = ex.getString('id')
          // Re-aponta links para o registro mantido
          try {
            app
              .db()
              .newQuery(
                'UPDATE product_category_links SET category = {:keep} WHERE category = {:extra}',
              )
              .bind({ keep: keepId, extra: extraId })
              .execute()
          } catch (errLink) {
            console.log('Aviso ao re-apontar links de categoria:', errLink.message || errLink)
          }
          try {
            const rec = app.findRecordById('product_categories', extraId)
            app.delete(rec)
          } catch (errDel) {
            console.log('Aviso ao remover categoria duplicada:', errDel.message || errDel)
          }
        }
      }
    } catch (errDup) {
      console.log('Aviso na dedup de categorias do backfill:', errDup.message || errDup)
    }
  },
  (app) => {
    // Down: no-op seguro (grupo inferido permanece; sem reversão de dados)
  },
)
