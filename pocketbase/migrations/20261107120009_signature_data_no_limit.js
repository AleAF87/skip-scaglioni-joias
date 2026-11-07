// Remove o limite de 5000 caracteres do campo signature_data (text) da
// collection reseller_deliveries. Motivo: assinaturas desenhadas em canvas
// (TouchSignaturePad) geram data URLs base64 que facilmente passam de 5000
// caracteres — o save falhava com 400 "signature_data: Must be no more than
// 5000 character(s)" e a entrega ficava travada em pending_signature, com a
// falha silenciosa para a usuária. Também garante signature_image (file) com
// maxSize generoso (5 MB), já que carrega a mesma natureza de dado.
// Idempotente: reaplica apenas se o campo ainda tiver max <= 5000.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_deliveries')

    const sigData = col.fields.getByName('signature_data')
    if (sigData) {
      // Sem max => sem limite de caracteres. Aplica sempre que houver max.
      if (sigData.max > 0) {
        sigData.max = 0
        app.save(col)
      }
    }

    const sigImage = col.fields.getByName('signature_image')
    if (sigImage) {
      if (!sigImage.maxSize || sigImage.maxSize < 5242880) {
        sigImage.maxSize = 5242880
        app.save(col)
      }
    }
  },
  (app) => {
    // Reverte apenas o limite de caracteres da assinatura (não restringe o
    // arquivo de volta, para não invalidar registros existentes).
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    const sigData = col.fields.getByName('signature_data')
    if (sigData) {
      sigData.max = 5000
      app.save(col)
    }
  },
)
