// 20261107120013: Correção DEFINITIVA do limite de 5000 caracteres em
// reseller_deliveries.signature_data (3ª tentativa — 0.0.138 e 0.0.148 não
// persistiram).
//
// Causa raiz encontrada: nas tentativas anteriores o campo era salvo com
// sigData.max = 0, mas o PocketBase v0.36 normaliza max=0 do TextField de volta
// para 5000 ao gravar a collection (o valor zero cai no default do campo), e
// col.fields.add(new TextField({ name })) também recriava o campo com o default
// de 5000. Resultado: o limite continuava ativo e as assinaturas em canvas
// (data URLs base64 > 5000 chars) falhavam com 400 "signature_data: Must be no
// more than 5000 character(s)".
//
// Estratégia desta migração (definitiva, sem perder dados):
// 1. Copia o conteúdo de signature_data para signature_data_new (text, max=1,
//    SEM limite — 1 significa mínimo de 1 char, não máximo);
// 2. Remove o campo antigo signature_data (com Max 5000);
// 3. Renomeia signature_data_new para signature_data.
// O campo nasce já SEM a propriedade max herdada do antigo.
//
// Idempotente: se o campo atual já não tiver limite efetivo (max <= 1), nada
// faz — o deploy reexecuta a migração só em bases novas/limpas.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    const sigData = col.fields.getByName('signature_data')
    if (!sigData) {
      // Campo ausente (base recém-criada): cria já sem limite.
      col.fields.add(new TextField({ name: 'signature_data' }))
      app.save(col)
      return
    }
    // max <= 1: sem limite efetivo — nada a fazer (idempotência).
    if ((sigData.max || 0) <= 1) {
      return
    }

    // 1. Campo novo com min=1 (obriga valor não-vazio apenas se enviado) e SEM max.
    col.fields.add(new TextField({ name: 'signature_data_new', min: 1 }))

    // 2. Copiar os dados antes de remover o campo antigo.
    app
      .db()
      .newQuery(
        "UPDATE reseller_deliveries SET signature_data_new = signature_data WHERE signature_data IS NOT NULL AND signature_data != ''",
      )
      .execute()

    // 3. Remover o campo antigo (com Max 5000) e renomear o novo.
    col.fields.removeByName('signature_data')
    app.save(col)

    const col2 = app.findCollectionByNameOrId('reseller_deliveries')
    const newField = col2.fields.getByName('signature_data_new')
    if (newField) {
      newField.name = 'signature_data'
      app.save(col2)
    }
  },
  (app) => {
    // Down: recria o campo com o limite antigo de 5000 (só para reverter o
    // efeito desta migração em ambientes de teste).
    const col = app.findCollectionByNameOrId('reseller_deliveries')
    const sigData = col.fields.getByName('signature_data')
    if (sigData && (sigData.max || 0) <= 1) {
      col.fields.removeByName('signature_data')
      col.fields.add(new TextField({ name: 'signature_data', max: 5000 }))
      app.save(col)
    }
  },
)
