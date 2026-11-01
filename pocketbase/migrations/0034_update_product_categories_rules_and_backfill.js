migrate(
  (app) => {
    // 1. Atualizar regras de acesso para product_categories permitindo superadmin e admin
    try {
      const catsCol = app.findCollectionByNameOrId('product_categories')
      catsCol.listRule = "@request.auth.id != ''"
      catsCol.viewRule = "@request.auth.id != ''"
      catsCol.createRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
      catsCol.updateRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
      catsCol.deleteRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')"
      app.save(catsCol)
    } catch (err) {
      console.log('Aviso ao atualizar regras de product_categories:', err)
    }

    // 2. Atualizar regras de acesso para product_category_links
    try {
      const linksCol = app.findCollectionByNameOrId('product_category_links')
      linksCol.listRule = "@request.auth.id != ''"
      linksCol.viewRule = "@request.auth.id != ''"
      linksCol.createRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
      linksCol.updateRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
      linksCol.deleteRule =
        "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')"
      app.save(linksCol)
    } catch (err) {
      console.log('Aviso ao atualizar regras de product_category_links:', err)
    }

    // 3. Backfill idempotente: migrar categorias já existentes nos produtos se houver campo bruto ou texto
    try {
      const catsCol = app.findCollectionByNameOrId('product_categories')
      const linksCol = app.findCollectionByNameOrId('product_category_links')

      // Verificar colunas da tabela products
      const pragmaRows = []
      app.db().newQuery('PRAGMA table_info(products)').all(pragmaRows)

      const colNames = pragmaRows.map((r) => r.name || r.Name)
      const hasCategoriasCol = colNames.includes('categorias')
      const hasCategoriaCol = colNames.includes('categoria')

      if (hasCategoriasCol || hasCategoriaCol) {
        const queryField = hasCategoriasCol ? 'categorias' : 'categoria'
        const productsWithCats = []
        app
          .db()
          .newQuery(
            `SELECT id, ${queryField} as raw_cat FROM products WHERE ${queryField} IS NOT NULL AND ${queryField} != ''`,
          )
          .all(productsWithCats)

        for (const p of productsWithCats) {
          const raw = String(p.raw_cat || '').trim()
          if (!raw) continue

          const catNames = raw
            .split(/[|,;]/)
            .map((s) => s.trim())
            .filter(Boolean)

          for (let idx = 0; idx < catNames.length; idx++) {
            const cName = catNames[idx]
            let catRecord = null
            try {
              catRecord = app.findFirstRecordByData('product_categories', 'name', cName)
            } catch (_) {
              catRecord = new Record(catsCol)
              catRecord.set('name', cName)
              const slug = cName
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
              catRecord.set('slug', slug || 'cat-' + Math.floor(1000 + Math.random() * 9000))
              app.save(catRecord)
            }

            // Criar vínculo se não existir
            const existingLinks = app.findRecordsByFilter(
              'product_category_links',
              `product = '${p.id}' && category = '${catRecord.id}'`,
              '',
              1,
              0,
            )

            if (existingLinks.length === 0) {
              const link = new Record(linksCol)
              link.set('product', p.id)
              link.set('category', catRecord.id)
              link.set('is_principal', idx === 0)
              app.save(link)
            }
          }
        }
      }
    } catch (backfillErr) {
      console.log('Aviso no backfill de categorias:', backfillErr)
    }
  },
  (app) => {
    // Reverter regras se necessário
  },
)
