/// <reference path="../pb_data/types.d.ts" />
//
// 0.0.259 — Log de movimentação de estoque (modelo invertido):
//   - products.quantity = ESTOQUE FÍSICO (gravado/editável)
//   - Estoque Atual Total = calculado = Físico + soma das posses (reseller_stock_items)
// Toda edição manual do Físico (ajuste de contagem) registra um log em stock_movements.
// NÃO DESTRUTIVA: apenas cria a coleção; nada existente é alterado ou removido.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('stock_movements')
      return
    } catch (_) {}

    const productsCol = app.findCollectionByNameOrId('products')

    app.save(
      new Collection({
        name: 'stock_movements',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'product',
            type: 'relation',
            required: true,
            collectionId: productsCol.id,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['ajuste_manual', 'entrada', 'saida', 'importacao'],
            maxSelect: 1,
          },
          { name: 'quantidade_anterior', type: 'number', required: true, onlyInt: true },
          { name: 'quantidade_nova', type: 'number', required: true, onlyInt: true },
          { name: 'diferenca', type: 'number', required: true, onlyInt: true },
          { name: 'origem', type: 'text', required: true },
          { name: 'operador', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          { name: 'observacao', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_stock_movements_product ON stock_movements (product)'],
      }),
    )
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('stock_movements')
      app.delete(col)
    } catch (_) {}
  },
)
