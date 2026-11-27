/**
 * Migração de fotos da CDN Tecson (imagestecson.b-cdn.net) para o campo photos.
 *
 * Regras (v0.0.283):
 *  - Somente superadmin (validado server-side nesta rota).
 *  - Idempotente: produtos que já possuem photos são pulados.
 *  - Execução em lote: body { limit } (padrão 25, máximo 50) para não estourar
 *    timeout; o frontend repete chamadas até pending = 0.
 *  - Limite de ~15MB por foto. Falha em UMA foto NÃO aborta o lote.
 *  - image_url é PRESERVADO como referência de origem (não é limpo).
 *
 * IMPORTANTE (JSVM): handlers são 100% isolados — todas as funções auxiliares
 * estão duplicadas INLINE neste arquivo. Nada de require() ou globais.
 * Sem object-spread "..." (compila para __spreadValues e quebra em runtime).
 */

routerAdd(
  'GET',
  '/backend/v1/products/migrate-cdn-photos/count',
  (e) => {
    const CDN_HOST = 'imagestecson.b-cdn.net'
    const PAGE_SIZE = 200

    const auth = e.auth
    if (!auth) return e.json(401, { error: 'Não autorizado.' })
    let isSuper = false
    try {
      isSuper = auth.collection().name === '_superusers'
    } catch (_) {}
    if (!isSuper) {
      try {
        isSuper = auth.getString('role') === 'superadmin'
      } catch (err) {
        isSuper = false
      }
    }
    if (!isSuper) {
      return e.json(403, { error: 'Acesso restrito a superadministradores.' })
    }

    const filter = "photos = '' && image_url ~ '" + CDN_HOST + "'"
    let pending = 0
    let offset = 0
    try {
      for (let guard = 0; guard < 200; guard++) {
        const batch = $app.findRecordsByFilter('products', filter, '-created', PAGE_SIZE, offset)
        pending += batch.length
        if (batch.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
    } catch (err) {
      return e.json(500, { error: 'Falha ao contar produtos pendentes: ' + err.message })
    }
    return e.json(200, { pending: pending })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/products/migrate-cdn-photos',
  (e) => {
    const CDN_HOST = 'imagestecson.b-cdn.net'
    const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // ~15MB
    const PAGE_SIZE = 200

    const auth = e.auth
    if (!auth) return e.json(401, { error: 'Não autorizado.' })
    let isSuper = false
    try {
      isSuper = auth.collection().name === '_superusers'
    } catch (_) {}
    if (!isSuper) {
      try {
        isSuper = auth.getString('role') === 'superadmin'
      } catch (err) {
        isSuper = false
      }
    }
    if (!isSuper) {
      return e.json(403, { error: 'Acesso restrito a superadministradores.' })
    }

    const body = e.requestInfo().body || {}
    let limit = 25
    if (typeof body.limit === 'number' && body.limit > 0) {
      limit = Math.floor(body.limit)
    }
    if (limit > 50) limit = 50

    const filter = "photos = '' && image_url ~ '" + CDN_HOST + "'"

    // Conta pendentes paginando (limite máximo de consulta do PocketBase).
    const countPending = function () {
      let total = 0
      let offset = 0
      for (let guard = 0; guard < 200; guard++) {
        const batch = $app.findRecordsByFilter('products', filter, '-created', PAGE_SIZE, offset)
        total += batch.length
        if (batch.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return total
    }

    const extFromUrl = function (url) {
      const clean = String(url).split('?')[0].split('#')[0]
      const parts = clean.split('/')
      const name = parts[parts.length - 1] || ''
      const dot = name.lastIndexOf('.')
      if (dot < 0 || dot === name.length - 1) return 'jpg'
      const ext = name.substring(dot + 1).toLowerCase()
      if (ext === 'jpeg') return 'jpg'
      if (ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'gif') return ext
      return 'jpg'
    }

    const records = []
    try {
      records = $app.findRecordsByFilter('products', filter, '-created', limit, 0)
    } catch (errFind) {
      return e.json(500, { error: 'Falha ao buscar produtos: ' + errFind.message })
    }

    const result = {
      success: true,
      processed: 0,
      migrated: 0,
      failed: 0,
      pending: 0,
      failures: [],
    }
    result.processed = records.length

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const imageUrls = rec.get('image_url') || []
      let url = ''
      if (Object.prototype.toString.call(imageUrls) === '[object Array]') {
        if (imageUrls.length > 0) url = String(imageUrls[0])
      }
      if (!url) {
        url = rec.getString('image_url')
      }
      if (!url) {
        result.failed++
        result.failures.push({ product_id: rec.id, error: 'Sem image_url' })
        continue
      }

      let bytes = null
      let downloadErr = ''
      try {
        const res = $http.send({ url: url, method: 'GET', timeout: 60 })
        if (res.statusCode === 200) {
          bytes = res.body
        } else {
          downloadErr = 'HTTP ' + res.statusCode
        }
      } catch (errDl) {
        downloadErr = 'Exceção no download: ' + errDl.message
      }

      if (!bytes || bytes.length === 0) {
        result.failed++
        result.failures.push({ product_id: rec.id, error: downloadErr || 'Resposta vazia' })
        continue
      }
      if (bytes.length > MAX_PHOTO_BYTES) {
        result.failed++
        result.failures.push({ product_id: rec.id, error: 'Foto maior que 15MB' })
        continue
      }

      try {
        const filename = 'cdn_' + rec.id + '.' + extFromUrl(url)
        const file = $filesystem.fileFromBytes(bytes, filename)
        rec.set('photos', [file])
        $app.save(rec) // image_url permanece como referência de origem
        result.migrated++
      } catch (errSave) {
        result.failed++
        result.failures.push({ product_id: rec.id, error: 'Falha ao salvar: ' + errSave.message })
      }
    }

    try {
      result.pending = countPending()
    } catch (errCount) {
      result.pending = -1
    }

    console.log(
      'migrate-cdn-photos: processados=' +
        result.processed +
        ' migrados=' +
        result.migrated +
        ' falhas=' +
        result.failed +
        ' pendentes=' +
        result.pending,
    )

    return e.json(200, result)
  },
  $apis.requireAuth(),
)
