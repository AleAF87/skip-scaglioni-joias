// Hooks da collection customers.
//
// 1. onCreate — created_by: registro de quem fez o PRIMEIRO cadastro do cliente.
//    Grava automaticamente o id do usuário autenticado que criou o registro
//    (sobrescreve qualquer valor enviado no body — o cliente nunca declara o
//    próprio criador).
//    EXCEÇÃO (decisão do usuário): registros vindos do IMPORTADOR DE PLANILHA
//    (import_source = 'planilha') ficam com created_by VAZIO, mesmo que a
//    criação seja feita por um admin autenticado.
//    onCreate — customer_since: se o cliente for criado SEM "Cliente Desde"
//    preenchido, grava a data de HOJE (cadastro). Importação que traz
//    CLIENTE_DESDE preenchido mantém o valor da planilha.
// 2. onUpdate — impede que o created_by seja alterado: o campo guarda o criador
//    original e volta sempre ao valor do banco, mesmo se o body tentar
//    sobrescrevê-lo.
// Usuários sem auth (painel/superuser/migração) não alteram a regra: mantêm o
// valor enviado.
// NOTA: o JSVM executa callbacks em VM separada — nenhuma função/variável
// top-level é acessível dentro dos callbacks; tudo inline abaixo.

onRecordCreateRequest((e) => {
  const auth = e.auth
  const importSource = e.record.getString('import_source')
  if (auth && auth.id && importSource !== 'planilha') {
    e.record.set('created_by', auth.id)
  }
  if (!e.record.getString('customer_since')) {
    // "Hoje" no fuso LOCAL do servidor (não UTC), formato PocketBase:
    // "2006-01-02 15:04:05.000Z" (com Z literal).
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    e.record.set(
      'customer_since',
      now.getFullYear() +
        '-' +
        pad(now.getMonth() + 1) +
        '-' +
        pad(now.getDate()) +
        ' 00:00:00.000Z',
    )
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
