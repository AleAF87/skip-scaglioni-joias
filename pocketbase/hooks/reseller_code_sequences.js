// Sequências atômicas de movimentações com revendedoras via app_sequences.
// Formato novo (v0.0.152): numeração PURA compartilhada (1, 2, 3…) — sem prefixo
// ENT-/DEV- e sem zeros à esquerda (mesma convenção do código de produto).
// UM único contador (reseller_movement_seq) para entregas E devoluções: cada
// movimentação tem número único — nunca existirá entrega "3" e devolução "3".
// Uso (dentro de runInTransaction): nextMovementNumber(txApp)
routerAdd(
  'GET',
  '/backend/v1/reseller-stock/next-codes',
  (e) => {
    let currentVal = 0
    try {
      const seqRecord = $app.findFirstRecordByFilter(
        'app_sequences',
        "name = 'reseller_movement_seq'",
      )
      if (seqRecord) {
        currentVal = seqRecord.getInt('current_value') || 0
      }
    } catch (_) {}
    const next = currentVal + 1
    return e.json(200, {
      next_delivery_code: String(next),
      next_return_code: String(next),
      current_movement: currentVal,
    })
  },
  $apis.requireAuth(),
)
