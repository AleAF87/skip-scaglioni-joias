/// <reference path="../pb_data/types.d.ts" />
//
// 0.0.259 — Log de movimentação de estoque físico.
// Toda edição manual de products.quantity (ajuste de contagem na /estoque, importações
// e cadastro) grava um registro em stock_movements com o antes/depois e o operador.
// Só registra quando o valor MUDA (evita ruído de saves sem alteração de estoque).
// JSVM: cada hook é isolado — funções compartilhadas vivem INLINE neste arquivo.

function extractIntQty(value) {
  var n = parseInt(String(value === undefined || value === null ? '' : value), 10)
  return isNaN(n) ? null : n
}

function registerStockMovement(e, origem, observacao) {
  try {
    var prev = extractIntQty(e.record.original().get('quantity'))
    var next = extractIntQty(e.record.get('quantity'))
    if (prev === null || next === null || prev === next) return

    var movementsCol
    try {
      movementsCol = $app.findCollectionByNameOrId('stock_movements')
    } catch (_) {
      return
    }

    var mov = new Record(movementsCol)
    mov.set('product', e.record.get('id'))
    mov.set('tipo', next > prev ? 'entrada' : 'saida')
    mov.set('quantidade_anterior', prev)
    mov.set('quantidade_nova', next)
    mov.set('diferenca', next - prev)
    mov.set('origem', origem || 'sistema')
    try {
      var auth = $requestInfo.auth
      if (auth && auth.id) mov.set('operador', auth.id)
    } catch (_) {}
    if (observacao) mov.set('observacao', String(observacao).slice(0, 500))
    $app.save(mov)
  } catch (err) {
    console.log('stock_movements: falha ao registrar log: ' + err)
  }
}

onRecordAfterUpdateRequest((e) => {
  registerStockMovement(e, 'edicao_produto')
}, 'products')

onRecordAfterCreateRequest((e) => {
  // Cadastro/importação: primeira contagem do produto
  try {
    var initial = extractIntQty(e.record.get('quantity'))
    if (initial === null || initial <= 0) return
    var movementsCol = $app.findCollectionByNameOrId('stock_movements')
    var mov = new Record(movementsCol)
    mov.set('product', e.record.get('id'))
    mov.set('tipo', 'entrada')
    mov.set('quantidade_anterior', 0)
    mov.set('quantidade_nova', initial)
    mov.set('diferenca', initial)
    mov.set('origem', 'criacao_produto')
    try {
      var auth = $requestInfo.auth
      if (auth && auth.id) mov.set('operador', auth.id)
    } catch (_) {}
    $app.save(mov)
  } catch (err) {
    console.log('stock_movements: falha ao registrar criação: ' + err)
  }
}, 'products')
