// Sequências atômicas ENT (entregas) e DEV (devoluções) via app_sequences.
// Formato novo (v0.0.144): ENT-0001, ENT-0002… / DEV-0001, DEV-0002…
// Registros antigos (formato ENT-NNNNNN-NNNN) permanecem como estão.
// Sequências separadas: entrega e devolução podem coincidir em número sem conflito.
// All helper logic is declared inline inside callbacks to avoid JSVM top-level scoping errors.

// Helper e Hooks usados pelos endpoints de entrega/devolução.
// Uso (dentro de runInTransaction): nextSeqCode(txApp, 'reseller_delivery_seq', 'ENT')
routerAdd(
  'GET',
  '/backend/v1/reseller-stock/next-codes',
  (e) => {
    const seqNames = ['reseller_delivery_seq', 'reseller_return_seq']
    const out = {}
    for (let s = 0; s < seqNames.length; s++) {
      const name = seqNames[s]
      let currentVal = 0
      try {
        const seqRecord = $app.findFirstRecordByFilter('app_sequences', "name = '" + name + "'")
        if (seqRecord) {
          currentVal = seqRecord.getInt('current_value') || 0
        }
      } catch (_) {}
      out[name === 'reseller_delivery_seq' ? 'delivery' : 'return'] = currentVal
    }
    return e.json(200, {
      next_delivery_code: 'ENT-' + String(out.delivery + 1).padStart(4, '0'),
      next_return_code: 'DEV-' + String(out.return + 1).padStart(4, '0'),
      current_delivery: out.delivery,
      current_return: out.return,
    })
  },
  $apis.requireAuth(),
)
