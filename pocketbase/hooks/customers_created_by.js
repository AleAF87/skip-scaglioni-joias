// Hook da collection customers: registro de quem fez o PRIMEIRO cadastro do cliente.
// 1. onCreate: grava automaticamente o id do usuário autenticado que criou o registro
//    (sobrescreve qualquer valor enviado no body — o cliente nunca declara o próprio criador).
// 2. onUpdate: impede que o created_by seja alterado — o campo guarda o criador original
//    e volta sempre ao valor do banco, mesmo se o body tentar sobrescrevê-lo.
// Usuários sem auth (painel/superuser/migração) não alteram a regra: mantêm o valor enviado.

onRecordCreateRequest((e) => {
  const auth = e.auth
  if (auth && auth.id) {
    e.record.set('created_by', auth.id)
  }
  return e.next()
}, 'customers')

onRecordUpdateRequest((e) => {
  const original = e.record.original()
  const originalCreator = original.getString('created_by')
  const currentCreator = e.record.getString('created_by')
  if (currentCreator !== originalCreator) {
    e.record.set('created_by', originalCreator)
  }
  return e.next()
}, 'customers')
