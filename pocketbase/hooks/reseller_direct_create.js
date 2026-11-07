// Hook para cadastro direto de revendedoras por Administrador ou Superadmin
// Rota: POST /backend/v1/resellers/direct-create

routerAdd('POST', '/backend/v1/resellers/direct-create', (e) => {
  const authUser = e.auth
  if (!authUser) {
    return e.json(401, { error: 'Não autorizado. Faça login para continuar.' })
  }

  const actorRole = (authUser.getString('role') || '').trim()
  if (actorRole !== 'superadmin' && actorRole !== 'admin') {
    return e.json(403, {
      error:
        'Apenas Administradores ou Superadmin têm permissão para cadastrar revendedoras diretamente.',
    })
  }

  const body = e.requestInfo().body || {}
  const name = (body.name || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const password = (body.password || '').trim()
  const commissionRate =
    body.commission_rate !== undefined &&
    body.commission_rate !== null &&
    body.commission_rate !== ''
      ? parseFloat(body.commission_rate)
      : 40

  if (!name || name.length < 2) {
    return e.json(400, { error: 'O nome da revendedora é obrigatório (mínimo 2 caracteres).' })
  }

  if (!email || !email.includes('@')) {
    return e.json(400, { error: 'Informe um e-mail válido para a revendedora.' })
  }

  if (!password || password.length < 8) {
    return e.json(400, { error: 'A senha de acesso deve ter no mínimo 8 caracteres.' })
  }

  if (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return e.json(400, { error: 'O percentual de comissão deve ser entre 0 e 100%.' })
  }

  const phone = (body.phone || '').trim()
  const document = (body.document || '').trim()
  const birthDate = (body.birth_date || '').trim()
  const city = (body.city || '').trim()
  const state = (body.state || '').trim().toUpperCase()
  const street = (body.address_street || '').trim()
  const number = (body.address_number || '').trim()
  const complement = (body.address_complement || '').trim()
  const neighborhood = (body.address_neighborhood || '').trim()
  const zip = (body.address_zip || '').trim()
  const notes = (body.notes || '').trim()

  let createdUserId = null
  let createdResellerId = null

  try {
    $app.runInTransaction((txApp) => {
      // 1. Validar duplicidade de e-mail na users
      const existingUsersByEmail = txApp.findRecordsByFilter(
        'users',
        "email = '" + email.replace(/'/g, "\\'") + "'",
        '',
        1,
        0,
      )
      if (existingUsersByEmail && existingUsersByEmail.length > 0) {
        throw new Error('Já existe um usuário cadastrado com este e-mail no sistema.')
      }

      // 2. Validar duplicidade de e-mail na resellers
      const existingResellersByEmail = txApp.findRecordsByFilter(
        'resellers',
        "email = '" + email.replace(/'/g, "\\'") + "'",
        '',
        1,
        0,
      )
      if (existingResellersByEmail && existingResellersByEmail.length > 0) {
        throw new Error('Já existe uma revendedora cadastrada com este e-mail.')
      }

      // 3. Se forneceu CPF/CNPJ, validar duplicidade na resellers e users
      if (document) {
        const docClean = document.replace(/'/g, "\\'")
        const existingResellersByDoc = txApp.findRecordsByFilter(
          'resellers',
          "document = '" + docClean + "'",
          '',
          1,
          0,
        )
        if (existingResellersByDoc && existingResellersByDoc.length > 0) {
          throw new Error('Já existe uma revendedora cadastrada com este documento (CPF/CNPJ).')
        }
      }

      // 4. Criar registro na collection users
      const usersCol = txApp.findCollectionByNameOrId('users')
      const userRecord = new Record(usersCol)
      userRecord.setEmail(email)
      userRecord.setPassword(password)
      userRecord.setVerified(true)
      userRecord.set('name', name)
      userRecord.set('role', 'reseller')
      userRecord.set('status', 'active')
      if (phone) userRecord.set('phone', phone)
      if (document) userRecord.set('document', document)
      if (birthDate) userRecord.set('birth_date', birthDate)
      if (city) userRecord.set('city', city)
      if (state) userRecord.set('state', state)
      if (street) userRecord.set('address_street', street)
      if (number) userRecord.set('address_number', number)
      if (complement) userRecord.set('address_complement', complement)
      if (neighborhood) userRecord.set('address_neighborhood', neighborhood)
      if (zip) userRecord.set('address_zip', zip)
      if (notes) userRecord.set('notes', notes)

      txApp.save(userRecord)
      createdUserId = userRecord.id

      // 5. Criar registro na collection resellers
      const resellersCol = txApp.findCollectionByNameOrId('resellers')
      const resellerRecord = new Record(resellersCol)
      resellerRecord.set('user', userRecord.id)
      resellerRecord.set('name', name)
      resellerRecord.set('email', email)
      resellerRecord.set('status', 'active')
      resellerRecord.set('commission_rate', commissionRate)
      if (phone) resellerRecord.set('phone', phone)
      if (document) resellerRecord.set('document', document)
      if (birthDate) resellerRecord.set('birth_date', birthDate)
      if (city) resellerRecord.set('city', city)
      if (state) resellerRecord.set('state', state)
      if (street) resellerRecord.set('address_street', street)
      if (number) resellerRecord.set('address_number', number)
      if (complement) resellerRecord.set('address_complement', complement)
      if (neighborhood) resellerRecord.set('address_neighborhood', neighborhood)
      if (zip) resellerRecord.set('address_zip', zip)

      txApp.save(resellerRecord)
      createdResellerId = resellerRecord.id
    })

    return e.json(200, {
      success: true,
      message: 'Revendedora cadastrada com sucesso!',
      user_id: createdUserId,
      reseller_id: createdResellerId,
    })
  } catch (err) {
    const msg = err ? err.message || String(err) : 'Falha ao cadastrar revendedora.'
    return e.json(400, { error: msg })
  }
})

// Proteção da collection resellers: impede que operadores/revendedoras criem diretamente registros com status 'active'
onRecordCreateRequest((e) => {
  const auth = e.auth
  const rec = e.record
  if (!rec) return e.next()

  const status = rec.getString('status')
  if (status === 'active') {
    if (!auth) {
      // Criação interna pelo hook em transação
      return e.next()
    }
    const role = (auth.getString('role') || '').trim()
    if (role !== 'admin' && role !== 'superadmin') {
      throw new BadRequestError(
        'Apenas Administrador ou Superadmin podem cadastrar revendedoras com status ativo.',
      )
    }
  }
  return e.next()
}, 'resellers')
