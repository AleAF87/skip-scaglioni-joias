/// <reference path="../pb_data/types.d.ts" />
//
// 0.0.259 — Log de movimentação de estoque físico.
// Toda edição manual de products.quantity (ajuste de contagem na /estoque, importações
// e cadastro) grava um registro em stock_movements com o antes/depois e o operador.
// Só registra quando o valor MUDA (evita ruído de saves sem alteração de estoque).
// JSVM: os antigos onRecordAfter*Request foram REMOVIDOS no PocketBase v0.23. Usamos os
// hooks de CONTEXTO HTTP onRecordUpdateRequest / onRecordCreateRequest, que expõem e.auth
// (operador) e exigem e.next(). O log é gravado DEPOIS do e.next() — update já persistido;
// se a validação falhar, nada é registrado. O valor ANTERIOR é capturado ANTES do e.next()
// (após o save, record.original() pode já refletir o novo estado).
// JSVM: callbacks rodam em pool isolado — TODA a lógica vive INLINE em cada callback.

onRecordUpdateRequest((e) => {
  // ANTES do save: estado original do Físico
  var prev = parseInt(String(e.record.original().get('quantity')), 10)
  if (isNaN(prev)) prev = null
  var next = parseInt(String(e.record.get('quantity')), 10)
  if (isNaN(next)) next = null
  var operador = ''
  try {
    if (e.auth && e.auth.id) operador = e.auth.id
  } catch (_) {}

  e.next()

  try {
    if (prev === null || next === null || prev === next) return
    var movementsCol = $app.findCollectionByNameOrId('stock_movements')
    var mov = new Record(movementsCol)
    mov.set('product', e.record.get('id'))
    mov.set('tipo', next > prev ? 'entrada' : 'saida')
    mov.set('quantidade_anterior', prev)
    mov.set('quantidade_nova', next)
    mov.set('diferenca', next - prev)
    mov.set('origem', 'edicao_produto')
    if (operador) mov.set('operador', operador)
    $app.save(mov)
  } catch (err) {
    console.log('stock_movements: falha no log de update: ' + err)
  }
}, 'products')

onRecordCreateRequest((e) => {
  var initial = parseInt(String(e.record.get('quantity')), 10)
  if (isNaN(initial)) initial = 0
  var operador = ''
  try {
    if (e.auth && e.auth.id) operador = e.auth.id
  } catch (_) {}

  e.next()

  // Cadastro/importação: primeira contagem do produto
  try {
    if (initial <= 0) return
    var movementsCol = $app.findCollectionByNameOrId('stock_movements')
    var mov = new Record(movementsCol)
    mov.set('product', e.record.get('id'))
    mov.set('tipo', 'entrada')
    mov.set('quantidade_anterior', 0)
    mov.set('quantidade_nova', initial)
    mov.set('diferenca', initial)
    mov.set('origem', 'criacao_produto')
    if (operador) mov.set('operador', operador)
    $app.save(mov)
  } catch (err) {
    console.log('stock_movements: falha no log de criação: ' + err)
  }
}, 'products')
