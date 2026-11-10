// Correção definitiva do limite de 5000 caracteres em reseller_deliveries.signature_data.
// Histórico: a migração 20261107120009 alterava a propriedade `max` do TextField e
// salvava a collection — mas no PocketBase v0.36 essa alteração só grava o novo valor
// se a collection for recarregada/gravada com o campo atualizado (o objeto retornado
// por getByName guarda o valor, porém o save pode persistir o estado antigo dependendo
// do ciclo de load). Resultado: o limite de 5000 continuou ativo e as assinaturas em
// canvas (data URLs base64 > 5000 chars) continuam falhando com 400, agora traduzido
// pelo hook como "Erro ao assinar entrega" (reincidência da 0.0.147).
//
// Abordagem desta migração: reescreve o campo inteiro — remove o TextField antigo e
// recria um novo SEM propriedade `max` (texto ilimitado) — via col.fields.remove +
// col.fields.add, que força o re-render da lista de campos no save.
// Idempotente: se o campo não existir mais (ou já não tiver max), não faz nada.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    const sigData = col.fields.getByName('signature_data')
    if (sigData && sigData.max > 0) {
      col.fields.removeByName('signature_data')
      col.fields.add(new TextField({ name: 'signature_data' }))
      app.save(col)
    }
  },
  (app) => {
    // Down: recria o campo com o limite antigo de 5000 (não recomendado — só para
    // reverter o efeito desta migração).
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    const sigData = col.fields.getByName('signature_data')
    if (sigData && sigData.max === 0) {
      col.fields.removeByName('signature_data')
      col.fields.add(new TextField({ name: 'signature_data', max: 5000 }))
      app.save(col)
    }
  },
)
