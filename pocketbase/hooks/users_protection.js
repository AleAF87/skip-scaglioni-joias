// Hook de proteção da coleção users no PocketBase / Skip Cloud
// Impede que usuários com role "admin" (ou inferiores):
// 1. Alterem ou excluam qualquer registro de usuário cujo role atual seja "superadmin"
// 2. Criem ou alterem qualquer usuário para ter role "superadmin"
// 3. Alterem o próprio role (ex.: promover a si mesmo para superadmin)
// Apenas "superadmin" pode gerenciar usuários superadmin e atribuir role superadmin.

onRecordCreateRequest((e) => {
  const authRecord = e.auth
  const targetRecord = e.record
  if (!targetRecord) {
    return e.next()
  }

  // Se não for requisição de usuário autenticado (ex.: sistema interno ou migration sem auth), permite
  if (!authRecord) {
    return e.next()
  }

  const actorRole = (authRecord.getString('role') || '').trim()
  const newRole = (targetRecord.getString('role') || '').trim()

  // Se estiver tentando criar um superadmin e o ator NÃO for superadmin
  if (newRole === 'superadmin' && actorRole !== 'superadmin') {
    throw new BadRequestError('Apenas o Superadmin pode criar usuários com perfil Superadmin.')
  }

  return e.next()
}, 'users')

onRecordUpdateRequest((e) => {
  const authRecord = e.auth
  const targetRecord = e.record
  if (!targetRecord) {
    return e.next()
  }

  // Se não houver contexto de usuário autenticado, permite
  if (!authRecord) {
    return e.next()
  }

  const actorRole = (authRecord.getString('role') || '').trim()
  const actorId = authRecord.id

  // Superadmin pode tudo
  if (actorRole === 'superadmin') {
    return e.next()
  }

  // Buscar estado original do registro do banco antes da alteração
  let originalRecord = null
  try {
    originalRecord = $app.findRecordById('users', targetRecord.id)
  } catch (_) {
    // Se não encontrou o original, continua
  }

  const originalRole = originalRecord ? (originalRecord.getString('role') || '').trim() : ''
  const newRole = (targetRecord.getString('role') || '').trim()

  // 1. Um admin NÃO pode alterar nenhum dado de um usuário que atualmente é superadmin
  if (originalRole === 'superadmin') {
    throw new BadRequestError('Apenas o Superadmin pode gerenciar usuários Superadmin.')
  }

  // 2. Um admin NÃO pode promover ninguém (nem a si mesmo) para superadmin
  if (newRole === 'superadmin') {
    throw new BadRequestError('Apenas o Superadmin pode atribuir o perfil Superadmin.')
  }

  // 3. Um admin NÃO pode alterar o próprio role
  if (targetRecord.id === actorId) {
    if (originalRole && newRole !== originalRole) {
      throw new BadRequestError('Você não tem permissão para alterar seu próprio perfil de acesso.')
    }
  }

  return e.next()
}, 'users')

onRecordDeleteRequest((e) => {
  const authRecord = e.auth
  const targetRecord = e.record
  if (!targetRecord) {
    return e.next()
  }

  if (!authRecord) {
    return e.next()
  }

  const actorRole = (authRecord.getString('role') || '').trim()

  // Superadmin pode tudo
  if (actorRole === 'superadmin') {
    return e.next()
  }

  // Verificar se o registro a ser excluído é superadmin
  const targetRole = (targetRecord.getString('role') || '').trim()
  if (targetRole === 'superadmin') {
    throw new BadRequestError('Apenas o Superadmin pode excluir usuários Superadmin.')
  }

  return e.next()
}, 'users')
