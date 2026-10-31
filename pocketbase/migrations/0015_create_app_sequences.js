migrate(
  (app) => {
    // Cria coleção de sequências / contadores atômicos para numeração do sistema
    const existing = app.hasTable('app_sequences')
    if (!existing) {
      const collection = new Collection({
        name: 'app_sequences',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'current_value', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_app_sequences_name ON app_sequences (name)'],
      })
      app.save(collection)

      // Inicializa sequência de código numérico de produtos começando em 0 (próximo será 1 -> '00001')
      const rec = new Record(collection)
      rec.set('name', 'product_numeric_code')
      rec.set('current_value', 0)
      app.save(rec)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('app_sequences')
      app.delete(col)
    } catch (_) {}
  },
)
