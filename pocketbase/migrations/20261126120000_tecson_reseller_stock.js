/// <reference path="../pb_data/types.d.ts" />
//
// 0.0.258 — Estoque físico x posse de revendedoras (importação Tecson)
// MIGRATION NÃO DESTRUTIVA: apenas ADICIONA campos, coleções e índices novos.
// Nenhum dado existente é alterado, sobrescrito ou removido.
//
// Modelo invertido decidido:
//   - products.quantity  = ESTOQUE FÍSICO (valor gravado e editável, como hoje)
//   - reseller_stock_items.quantity = posse de cada revendedora
//   - Estoque Atual Total = automático = Físico + soma das posses (nunca gravado em products)

migrate(
  (app) => {
    function fieldExists(collection, name) {
      try {
        return !!collection.fields.getByName(name)
      } catch (_) {
        return false
      }
    }

    // 1) product_variations.codigo_barras — cada variação passa a ter código de barras próprio
    const variations = app.findCollectionByNameOrId('product_variations')
    if (!fieldExists(variations, 'codigo_barras')) {
      variations.fields.add(new Field({ name: 'codigo_barras', type: 'text' }))
      app.save(variations)
    }

    // 2) reseller_deliveries.origem — marca maletas criadas pela migração Tecson
    const deliveries = app.findCollectionByNameOrId('reseller_deliveries')
    if (!fieldExists(deliveries, 'origem')) {
      deliveries.fields.add(
        new Field({
          name: 'origem',
          type: 'select',
          selectValues: ['manual', 'tecson_import'],
          maxSelect: 1,
        }),
      )
      app.save(deliveries)
    }

    // 3) Índices únicos de código de barras normalizado (só produtos/variações COM código;
    //    ignora vazio e zeros à esquerda: 0000000442497 e 442497 tornam-se o mesmo valor).
    const products = app.findCollectionByNameOrId('products')
    const productsIndexes = products.indexes || []
    const productsBarcodeIndex =
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_codigo_barras_norm ON products (nullif(ltrim(codigo_barras, '0'), ''))"
    if (productsIndexes.indexOf(productsBarcodeIndex) === -1) {
      products.indexes = productsIndexes.concat([productsBarcodeIndex])
      app.save(products)
    }

    const variationsAgain = app.findCollectionByNameOrId('product_variations')
    const variationsIndexes = variationsAgain.indexes || []
    const variationsBarcodeIndex =
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variations_codigo_barras_norm ON product_variations (nullif(ltrim(codigo_barras, '0'), ''))"
    if (variationsIndexes.indexOf(variationsBarcodeIndex) === -1) {
      variationsAgain.indexes = variationsIndexes.concat([variationsBarcodeIndex])
      app.save(variationsAgain)
    }

    // 4) app_settings — flags persistentes (ex.: congelamento da atualização automática
    //    do estoque inicial após a migração)
    try {
      app.findCollectionByNameOrId('app_settings')
    } catch (_) {
      app.save(
        new Collection({
          name: 'app_settings',
          type: 'base',
          listRule: "@request.auth.id != ''",
          viewRule: "@request.auth.id != ''",
          createRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')",
          updateRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')",
          deleteRule: null,
          fields: [
            { name: 'key', type: 'text', required: true },
            { name: 'value', type: 'text' },
            {
              name: 'created',
              type: 'autodate',
              autodateTriggers: ['onCreate'],
            },
            {
              name: 'updated',
              type: 'autodate',
              autodateTriggers: ['onCreate', 'onUpdate'],
            },
          ],
          indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)'],
        }),
      )
    }

    // Flag de migração: estoque inicial deixa de ser atualizado automaticamente
    // (permanece editável manualmente).
    try {
      const existingFlag = app.findRecordsByFilter(
        'app_settings',
        "key = 'initial_stock_auto_update'",
        '',
        1,
        0,
      )
      if (!existingFlag || existingFlag.length === 0) {
        const flagCol = app.findCollectionByNameOrId('app_settings')
        const flagRec = new Record(flagCol)
        flagRec.set('key', 'initial_stock_auto_update')
        flagRec.set('value', 'frozen')
        app.save(flagRec)
      }
    } catch (_) {}

    // 5) tecson_reseller_imports — log de auditoria de cada importação por revendedora
    //    (idempotência: hash do conteúdo + revendedora identifica uma importação já feita)
    try {
      app.findCollectionByNameOrId('tecson_reseller_imports')
    } catch (_) {
      app.save(
        new Collection({
          name: 'tecson_reseller_imports',
          type: 'base',
          listRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')",
          viewRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin' || @request.auth.role = 'operator')",
          createRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')",
          updateRule:
            "@request.auth.id != '' && (@request.auth.role = 'superadmin' || @request.auth.role = 'admin')",
          deleteRule: "@request.auth.id != '' && @request.auth.role = 'superadmin'",
          fields: [
            {
              name: 'reseller',
              type: 'relation',
              required: true,
              collectionRef: 'resellers',
              maxSelect: 1,
            },
            { name: 'content_hash', type: 'text', required: true },
            { name: 'file_name', type: 'text' },
            { name: 'summary', type: 'json' },
            { name: 'items', type: 'json' },
            { name: 'created_by', type: 'relation', collectionRef: 'users', maxSelect: 1 },
            {
              name: 'created',
              type: 'autodate',
              autodateTriggers: ['onCreate'],
            },
            {
              name: 'updated',
              type: 'autodate',
              autodateTriggers: ['onCreate', 'onUpdate'],
            },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_tecson_imports_reseller_hash ON tecson_reseller_imports (reseller, content_hash)',
          ],
        }),
      )
    }
  },
  (app) => {
    // Downgrade: remove APENAS o que esta migration criou (não toca em dados de coleções antigas).
    try {
      const importsCol = app.findCollectionByNameOrId('tecson_reseller_imports')
      app.delete(importsCol)
    } catch (_) {}
    try {
      const settingsCol = app.findCollectionByNameOrId('app_settings')
      app.delete(settingsCol)
    } catch (_) {}
    try {
      const variations = app.findCollectionByNameOrId('product_variations')
      const kept = (variations.indexes || []).filter(
        (ix) => ix.indexOf('idx_product_variations_codigo_barras_norm') === -1,
      )
      if (kept.length !== variations.indexes.length) {
        variations.indexes = kept
      }
      try {
        const f = variations.fields.getByName('codigo_barras')
        if (f) variations.fields.removeByName('codigo_barras')
      } catch (_) {}
      app.save(variations)
    } catch (_) {}
    try {
      const deliveries = app.findCollectionByNameOrId('reseller_deliveries')
      try {
        const f = deliveries.fields.getByName('origem')
        if (f) deliveries.fields.removeByName('origem')
      } catch (_) {}
      app.save(deliveries)
    } catch (_) {}
    try {
      const products = app.findCollectionByNameOrId('products')
      products.indexes = (products.indexes || []).filter(
        (ix) => ix.indexOf('idx_products_codigo_barras_norm') === -1,
      )
      app.save(products)
    } catch (_) {}
  },
)
