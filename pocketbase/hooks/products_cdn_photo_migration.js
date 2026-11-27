/**
 * products_cdn_photo_migration.js (v0.0.283)
 *
 * Migração de fotos da CDN Tecson (imagestecson.b-cdn.net) para o PocketBase.
 *
 * Handlers do JSVM rodam 100% isolados — helpers duplicados INLINE aqui
 * (nem global, nem require() de módulo local chegam ao handler).
 *
 * Rotas (admin/superadmin; $apis.requireAuth() + checagem de role):
 *   POST /backend/v1/products/cdn-photos/status   → contagem de pendentes (dry)
 *   POST /backend/v1/products/cdn-photos/migrate  → migra UM lote (batch_size ≤ 200)
 *
 * Idempotente e reexecutável: só toca em produtos com photos vazio E image_url
 * da CDN; quem já tem photos é pulado. Falha individual NÃO aborta o lote.
 * image_url é mantido como referência de origem (não é apagado).
 */

routerAdd(
  'POST',
  '/backend/v1/products/cdn-photos/status',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })
    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin') {
      return e.json(403, { error: 'Apenas superadmin/admin podem consultar a migração de fotos.' })
    }

    const CDN_HOST = 'imagestecson.b-cdn.net'
    let pending = 0
    let alreadyMigrated = 0
    let cursor = 0
    let batch
    do {
      batch = $app.findRecordsByFilter(
        'products',
        "image_url ~ '" + CDN_HOST + "'",
        '-created',
        500,
        cursor,
      )
      for (let i = 0; i < batch.length; i++) {
        const photos = batch[i].get('photos')
        if (photos && photos.length > 0) alreadyMigrated++
        else pending++
      }
      cursor += batch.length
    } while (batch.length === 500)

    return e.json(200, {
      success: true,
      cdn_host: CDN_HOST,
      pending: pending,
      already_migrated: alreadyMigrated,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/products/cdn-photos/migrate',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })
    const role = authUser.getString('role')
    if (role !== 'superadmin' && role !== 'admin') {
      return e.json(403, { error: 'Apenas superadmin/admin podem executar a migração de fotos.' })
    }

    const CDN_HOST = 'imagestecson.b-cdn.net'
    const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15MB por foto
    const body = e.requestInfo().body || {}
    const BATCH_SIZE = Math.min(Math.max(parseInt(body.batch_size, 10) || 25, 1), 200)

    const response = {
      success: false,
      processed: 0,
      migrated: 0,
      failed: 0,
      remaining: 0,
      failures: [],
    }

    try {
      const records = $app.findRecordsByFilter(
        'products',
        "image_url ~ '" + CDN_HOST + "' && photos:length = 0",
        '-created',
        BATCH_SIZE,
        0,
      )

      for (let i = 0; i < records.length; i++) {
        const product = records[i]
        response.processed++
        const url = product.getString('image_url')
        if (!url) {
          response.failed++
          response.failures.push(product.id + ': image_url vazio')
          continue
        }

        try {
          // Download server-side (sem CORS — roda no backend)
          const res = $http.send({ url: url, method: 'GET', timeout: 30 })
          const bytes = res.body
          if (!bytes || bytes.length === 0) {
            response.failed++
            response.failures.push(product.id + ': resposta vazia de ' + url)
            continue
          }
          if (bytes.length > MAX_PHOTO_BYTES) {
            response.failed++
            response.failures.push(
              product.id + ': foto maior que 15MB (' + bytes.length + ' bytes)',
            )
            continue
          }

          // Extensão a partir da URL; fallback pelo content-type
          let ext = 'jpg'
          const m = String(url.split('?')[0]).match(/\.([a-zA-Z0-9]{2,5})$/)
          if (m) {
            ext = m[1].toLowerCase()
          } else {
            const ct = String(res.headers.get('content-type') || '').toLowerCase()
            if (ct.indexOf('png') !== -1) ext = 'png'
            else if (ct.indexOf('webp') !== -1) ext = 'webp'
            else if (ct.indexOf('gif') !== -1) ext = 'gif'
          }

          const file = $filesystem.fileFromBytes(bytes, product.id + '_cdn.' + ext)
          // photos recebe o arquivo; image_url fica como referência de origem
          product.set('photos', [file])
          $app.save(product)
          response.migrated++
        } catch (err) {
          response.failed++
          response.failures.push(product.id + ': ' + (err.message || String(err)))
        }
      }

      // Quantos ainda faltam depois deste lote
      let remaining = 0
      const remBatch = $app.findRecordsByFilter(
        'products',
        "image_url ~ '" + CDN_HOST + "' && photos:length = 0",
        '-created',
        500,
        0,
      )
      remaining = remBatch.length
      response.remaining = remaining
      response.success = true
      console.log(
        'cdn-photos/migrate: processados=' +
          response.processed +
          ' migrados=' +
          response.migrated +
          ' falhas=' +
          response.failed +
          ' restantes=' +
          response.remaining,
      )
      return e.json(200, response)
    } catch (err) {
      console.log('cdn-photos/migrate erro:', err.message)
      return e.json(400, { error: err.message || 'Falha na migração de fotos.' })
    }
  },
  $apis.requireAuth(),
)
