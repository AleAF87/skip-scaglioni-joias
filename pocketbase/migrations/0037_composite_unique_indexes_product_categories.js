migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_categories')

    // 1. Remover índice unique global antigo em name (se existir)
    try {
      col.removeIndex('idx_product_categories_name')
    } catch (e1) {
      console.log('Aviso ao remover idx_product_categories_name:', e1)
    }

    // Também remover se houver índice em slug antigo
    try {
      col.removeIndex('idx_product_categories_slug')
    } catch (_) {}

    // 2. Garantir que os novos índices compostos sejam criados
    // No SQLite / PocketBase, "group" é palavra reservada e precisa ser escapada: [group] ou `group` ou "group".
    // WHERE archived = false (no SQLite booleano pode ser 0 ou false, mas em SQL PocketBase 'archived = 0' ou 'archived = false' é suportado;
    // no SQLite 'archived = 0' ou 'archived = false' — SQLite trata false como 0, 'archived = false' é padrão SQLite moderno).
    col.addIndex(
      'idx_product_categories_name_group_active',
      true,
      'name, "group"',
      'archived = false',
    )

    col.addIndex(
      'idx_product_categories_slug_group_active',
      true,
      'slug, "group"',
      'archived = false',
    )

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('product_categories')
      try {
        col.removeIndex('idx_product_categories_name_group_active')
      } catch (_) {}
      try {
        col.removeIndex('idx_product_categories_slug_group_active')
      } catch (_) {}

      // Restaurar índice original se rollback
      col.addIndex('idx_product_categories_name', true, 'name', '')
      app.save(col)
    } catch (_) {}
  },
)
