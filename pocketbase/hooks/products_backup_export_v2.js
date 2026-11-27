/**
 * products_backup_export_v2.js — backup completo (CSV + fotos) 100% server-side.
 *
 * ARQUIVO NOVO (v2): o deploy anterior do products_backup_export.js falhava
 * 4x com "Could not resolve" apontando para o pacote de base64 do Node,
 * mesmo sem require() ativo no código — o scanner do deploy captura
 * specifiers de módulo TAMBÉM DENTRO DE COMENTÁRIOS. Manter este arquivo
 * 100% livre de qualquer texto que pareça um specifier de módulo.
 *
 * Motivação: o export antigo baixava cada foto via fetch no NAVEGADOR —
 * as URLs externas da CDN imagestecson.b-cdn.net falham por CORS, e o ZIP
 * saía com ~152 fotos de ~1386 produtos. Aqui o SERVIDOR baixa tudo (sem
 * CORS), zipa em memória e devolve o arquivo pronto na própria resposta.
 *
 * Estrutura do ZIP:
 *   backup_produtos_<data>/produtos_<data>.csv   (51 colunas, ";" + BOM UTF-8)
 *   backup_produtos_<data>/fotos/<código>.<ext>  (desambiguado _2, _3…)
 *
 * Foto principal de cada produto, nesta ordem (precedência igual ao
 * getProductDisplayPhoto do frontend):
 *   (a) campo photos do PocketBase — lido server-side via filesystem
 *       interno do PocketBase ($app.newFilesystem + getReader), sem rede;
 *   (b) image_url externa (CDN Tecson) baixada via $http.send, timeout
 *       de 10s por foto, limite de 15 MB por foto; URL relativa é
 *       resolvida contra a URL pública do próprio PocketBase.
 *
 * Falhas individuais de download NÃO abortam o backup: a foto é pulada,
 * contada e reportada na coluna "Status da Foto" do CSV e no header
 * X-Backup-Summary (JSON em base64) — o frontend mostra toast com o total.
 *
 * Escolha de desempenho: o download é SEQUENCIAL, em um único request,
 * porque a JSVM é single-threaded e $http.send é bloqueante (não há
 * goroutines/await reais para lotes paralelos). Sem paginação multi-rota
 * para não complicar o cliente; o timeout é controlado por foto (10s) e
 * falhas são puladas. Registrado no header X-Backup-Strategy.
 *
 * ZIP montado byte a byte em MEMÓRIA (STORED, sem compressão; UTF-8 e
 * CRC-32 manuais — TextEncoder não existe na JSVM). Entradas com data
 * descriptor (flag 0x0800), como nas ZIPs geradas pelo Go — abrem no
 * Explorer/WinRAR/7-Zip/unzip.
 *
 * Restrições da JSVM respeitadas: sem APIs de disco ($os.* não é usado),
 * sem require() de módulo externo (base64 em JS puro inline), sem object
 * spread, helpers 100% inline (handlers são isolados), routerAdd sem
 * middleware null, resposta via e.blob (number[] | string) — nunca
 * $os.writeBytesToFile.
 *
 * NOTA para o bundler do deploy: este arquivo NÃO declara NENHUMA
 * dependência externa — nenhum specifier de módulo aparece aqui, nem em
 * comentários (a menção entre aspas ao pacote de base64 do Node, presente
 * na versão antiga deste arquivo, era captada pelo scanner do deploy e
 * causava "Could not resolve"). Não reintroduza esse texto neste arquivo.
 *
 * Rota: POST /backend/v1/products/export/backup (superadmin-only)
 * Resposta: o binário .zip (Content-Disposition attachment) +
 *           X-Backup-Summary (JSON em base64: contagens e falhas).
 */

routerAdd(
  'POST',
  '/backend/v1/products/export/backup',
  (e) => {
    const MAX_PHOTO_BYTES = 15 * 1024 * 1024
    const DOWNLOAD_TIMEOUT = 10 // segundos, por foto
    const PAGE_SIZE = 500

    // ── 1. Permissão superadmin server-side (403 para os demais) ───────────
    let isSuper = false
    try {
      const auth = e.auth
      if (auth && auth.collection().name === 'users' && auth.getString('role') === 'superadmin') {
        isSuper = true
      }
    } catch (_) {
      isSuper = false
    }
    if (!isSuper) {
      return e.json(403, { error: 'Apenas o Superadmin pode exportar o backup completo.' })
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const rootDirName = 'backup_produtos_' + stamp

    const summary = {
      products: 0,
      photos_total: 0,
      photos_ok: 0,
      photos_failed: 0,
      strategy: 'sequential-single-request',
      failures: [],
    }

    // ── 2. Utilitários ZIP (STORED + UTF-8 + CRC-32), inline ───────────────
    const crcTable = new Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        if (c & 1) c = 0xedb88320 ^ (c >>> 1)
        else c = c >>> 1
      }
      crcTable[n] = c >>> 0
    }
    const crc32 = function (bytes) {
      let c = 0xffffffff
      for (let i = 0; i < bytes.length; i++) {
        c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
      }
      return (c ^ 0xffffffff) >>> 0
    }
    // UTF-8 puro em JS (TextEncoder não existe no goja).
    const utf8Bytes = function (str) {
      const out = []
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i)
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
          const lo = str.charCodeAt(i + 1)
          if (lo >= 0xdc00 && lo <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00)
            i++
          }
        }
        if (code < 0x80) {
          out.push(code)
        } else if (code < 0x800) {
          out.push(0xc0 | (code >> 6), 0x80 | (code & 63))
        } else if (code < 0x10000) {
          out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
        } else {
          out.push(
            0xf0 | (code >> 18),
            0x80 | ((code >> 12) & 63),
            0x80 | ((code >> 6) & 63),
            0x80 | (code & 63),
          )
        }
      }
      return out
    }
    // base64 em JS puro (atob/btoa não existem na JSVM). Usado só para o
    // header X-Backup-Summary. SEM specifier de módulo aqui — o scanner do
    // deploy captura textos entre aspas e tenta empacotá-los como pacote.
    const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const base64Encode = function (bytes) {
      let out = ''
      const len = bytes.length
      for (let i = 0; i < len; i += 3) {
        const b1 = bytes[i]
        const b2 = i + 1 < len ? bytes[i + 1] : 0
        const b3 = i + 2 < len ? bytes[i + 2] : 0
        out += B64_CHARS.charAt(b1 >> 2)
        out += B64_CHARS.charAt(((b1 & 3) << 4) | (b2 >> 4))
        out += i + 1 < len ? B64_CHARS.charAt(((b2 & 15) << 2) | (b3 >> 6)) : '='
        out += i + 2 < len ? B64_CHARS.charAt(b3 & 63) : '='
      }
      return out
    }
    // Normaliza arrays vindos de res.body ($http.send, number[]) e de
    // toBytes(reader) — sempre Uint8Array para o ZIP.
    const toU8 = function (bytes) {
      if (bytes instanceof Uint8Array) return bytes
      const len = bytes && bytes.length ? bytes.length : 0
      const out = new Uint8Array(len)
      for (let i = 0; i < len; i++) out[i] = bytes[i] & 0xff
      return out
    }
    const concatU8 = function (arrays) {
      let total = 0
      for (let i = 0; i < arrays.length; i++) total += arrays[i].length
      const out = new Uint8Array(total)
      let off = 0
      for (let i = 0; i < arrays.length; i++) {
        out.set(arrays[i], off)
        off += arrays[i].length
      }
      return out
    }
    const pushU32 = function (arr, v) {
      arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
    }
    const pushU16 = function (arr, v) {
      arr.push(v & 0xff, (v >>> 8) & 0xff)
    }

    // ── 3. Entradas do ZIP, acumuladas como Uint8Array ─────────────────────
    const zipEntries = [] // { nameU8: Uint8Array, data: Uint8Array, crc: number }
    const usedNames = {}

    const addZipEntry = function (entryName, dataBytes) {
      const data = toU8(dataBytes)
      zipEntries.push({ nameU8: utf8Bytes(entryName), data: data, crc: crc32(data) })
    }

    // ── 4. Foto principal de cada produto: photos[0] senão image_url ───────
    const safe = function (input, fallback) {
      let s = String(input || '')
        .normalize('NFKD')
        .replace(/[^\w\s.-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
      return s || fallback
    }
    const extFromNameOrUrl = function (nameOrUrl) {
      const clean = String(nameOrUrl).split('?')[0].split('#')[0]
      const parts = clean.split('/')
      const name = parts[parts.length - 1] || ''
      const dot = name.lastIndexOf('.')
      if (dot < 0 || dot === name.length - 1) return 'jpg'
      const ext = name.substring(dot + 1).toLowerCase()
      if (ext === 'jpeg') return 'jpg'
      if (ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'gif') return ext
      return 'jpg'
    }
    // Resolve URL relativa contra a URL pública do próprio PocketBase.
    let baseUrl = ''
    try {
      baseUrl = $app.settings().meta.appUrl || ''
    } catch (_) {
      baseUrl = ''
    }
    const absoluteUrl = function (u) {
      const s = String(u || '').trim()
      if (!s || /^https?:\/\//i.test(s)) return s
      if (s.charAt(0) === '/') return baseUrl + s
      return baseUrl + '/' + s
    }
    const photoNameFor = function (p) {
      let fileName = ''
      let url = ''
      let internal = false
      let photos = []
      try {
        photos = p.get('photos') || []
      } catch (_) {
        photos = []
      }
      if (photos && photos.length > 0) {
        internal = true
        url = photos[0] // chave relativa no filesystem do PocketBase
      } else {
        url = absoluteUrl(p.getString('image_url'))
      }
      if (!url) return { name: '', url: '', internal: false }
      const base = safe(p.getString('code') || p.getString('produto_id') || p.id, p.id)
      fileName = base + '.' + extFromNameOrUrl(url)
      let n = 2
      while (usedNames[fileName]) {
        fileName = base + '_' + n++ + '.' + extFromNameOrUrl(url)
      }
      usedNames[fileName] = true
      return { name: fileName, url: url, internal: internal }
    }

    // Baixa a foto principal: interna via filesystem do PocketBase, externa
    // via $http.send (server-side, sem CORS; timeout e limite de tamanho).
    const fetchPhotoBytes = function (info, p) {
      if (info.internal) {
        try {
          const fsys = $app.newFilesystem()
          let reader = null
          try {
            const fileKey = p.baseFilesPath() + '/' + info.url
            reader = fsys.getReader(fileKey)
            const raw = toBytes(reader)
            if (!raw || raw.length === 0) {
              return { bytes: null, err: 'arquivo interno vazio' }
            }
            return { bytes: toU8(raw), err: '' }
          } finally {
            try {
              if (reader) reader.close()
            } catch (_) {}
            try {
              fsys.close()
            } catch (_) {}
          }
        } catch (errInt) {
          return { bytes: null, err: 'arquivo interno: ' + (errInt.message || String(errInt)) }
        }
      }
      // URL externa (CDN Tecson) — server-side, sem CORS.
      try {
        const res = $http.send({ url: info.url, method: 'GET', timeout: DOWNLOAD_TIMEOUT })
        if (res.statusCode !== 200) {
          return { bytes: null, err: 'HTTP ' + res.statusCode }
        }
        if (!res.body || res.body.length === 0) {
          return { bytes: null, err: 'resposta vazia do servidor de imagem' }
        }
        return { bytes: res.body, err: '' }
      } catch (errExt) {
        return { bytes: null, err: 'download: ' + (errExt.message || String(errExt)) }
      }
    }

    // ── 5. Busca TODOS os produtos em lotes de PAGE_SIZE ───────────────────
    const all = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const batch = $app.findRecordsByFilter('products', '', '-created', PAGE_SIZE, offset)
      for (let i = 0; i < batch.length; i++) all.push(batch[i])
      if (batch.length < PAGE_SIZE) break
    }
    summary.products = all.length
    if (all.length === 0) {
      return e.json(400, { error: 'Nenhum produto cadastrado para exportar.' })
    }

    // ── 6. Nomes das relações (type/material/size/marca), sem expand ────────
    const relNames = {}
    const loadRelNames = function (collection) {
      const map = {}
      try {
        const list = $app.findRecordsByFilter(collection, '', '', 10000, 0)
        for (let i = 0; i < list.length; i++) map[list[i].id] = list[i].getString('name') || ''
      } catch (_) {}
      relNames[collection] = map
    }
    loadRelNames('product_types')
    loadRelNames('product_materials')
    loadRelNames('product_sizes')
    loadRelNames('brands')
    const relName = function (rec, field, collection) {
      try {
        const id = rec.getString(field) || ''
        if (!id) return ''
        const map = relNames[collection] || {}
        return map[id] || ''
      } catch (_) {
        return ''
      }
    }

    // ── 7. CSV helpers ──────────────────────────────────────────────────────
    const num = function (v) {
      if (v === '' || v === undefined || v === null) return ''
      const n = parseFloat(String(v).replace(',', '.'))
      if (isNaN(n)) return String(v)
      return n.toFixed(2).replace('.', ',')
    }
    const cell = function (v) {
      const s = v === undefined || v === null ? '' : String(v)
      if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
      return s
    }

    // ── 8. Loop principal: foto + linha do CSV, um produto por iteração ────
    const csvRows = []
    for (let i = 0; i < all.length; i++) {
      const p = all[i]
      const info = photoNameFor(p)
      summary.photos_total++

      let statusFoto = ''
      if (!info.url) {
        statusFoto = 'sem foto'
        summary.photos_failed++
        if (summary.failures.length < 300) summary.failures.push(p.id + ': sem foto')
      } else {
        const r = fetchPhotoBytes(info, p)
        let bytes = r.bytes
        let failMsg = r.err
        if (bytes && bytes.length > MAX_PHOTO_BYTES) {
          bytes = null
          failMsg = 'foto maior que 15MB'
        }
        if (bytes && bytes.length > 0) {
          try {
            addZipEntry(rootDirName + '/fotos/' + info.name, bytes)
            summary.photos_ok++
            statusFoto = 'ok'
          } catch (errZip) {
            summary.photos_failed++
            failMsg = 'zip: ' + (errZip.message || String(errZip))
          }
        } else {
          summary.photos_failed++
        }
        if (failMsg) {
          statusFoto = failMsg
          if (summary.failures.length < 300) summary.failures.push(p.id + ': ' + failMsg)
        }
      }

      // Linha do CSV — 51 colunas (mesma ordem do export antigo)
      csvRows.push(
        [
          p.getString('code'),
          p.getString('produto_id'),
          p.getString('sku_interno'),
          p.getString('sku_novo'),
          p.getString('sku_ecommerce'),
          p.getString('codigo_barras'),
          p.getString('nome_produto') || p.getString('description'),
          p.getString('description'),
          p.getString('variacao'),
          relName(p, 'type', 'product_types'),
          relName(p, 'material', 'product_materials'),
          relName(p, 'size', 'product_sizes'),
          p.getString('target_audience'),
          p.getString('fornecedor'),
          relName(p, 'marca_id', 'brands'),
          p.getInt('quantity'),
          p.getInt('qtde_inicial'),
          p.getBool('qtde_loja_virtual') ? 1 : 0,
          p.getString('minimum_quantity'),
          num(p.get('selling_price')),
          num(p.get('preco_promocional')),
          num(p.get('custo_unitario')),
          num(p.get('invested_value')),
          num(p.get('altura_cm')),
          num(p.get('largura_cm')),
          num(p.get('comprimento_cm')),
          num(p.get('peso_g')),
          p.getBool('ativo_interno') ? 'Sim' : 'Não',
          p.getBool('publicar_no_ecommerce') ? 'Sim' : 'Não',
          p.getBool('destaque_ecommerce') ? 'Sim' : 'Não',
          p.getString('status'),
          p.getString('slug'),
          p.getString('observations'),
          p.getString('entry_date'),
          p.getString('origem'),
          p.getString('origem_importacao'),
          p.getString('criado_em_origem'),
          p.getString('data_inclusao_tecson'),
          p.getString('created_at_scaglioni'),
          p.getString('updated_at_scaglioni'),
          p.getString('id_tecson'),
          p.getString('codigo_produto_tecson'),
          p.getString('codigo_barras_tecson'),
          p.getString('nome_original_tecson'),
          p.getString('id_scaglioni'),
          p.getString('sku_scaglioni'),
          p.getString('nome_original_scaglioni'),
          p.getString('created'),
          p.getString('updated'),
          info.internal
            ? '/api/files/products/' + p.id + '/' + info.url
            : String(p.getString('image_url') || ''),
          // "Foto no CSV"/"Foto no ZIP": nome do arquivo dentro do ZIP
          // (photos PocketBase OU CDN Tecson) — vazio quando sem foto.
          info.url ? info.name : '',
          statusFoto,
        ]
          .map(cell)
          .join(';'),
      )
    }

    // ── 9. CSV: BOM + headers + linhas, tudo em um único Uint8Array ────────
    const HEADERS = [
      'Código',
      'Produto ID',
      'SKU Interno',
      'SKU Novo',
      'SKU E-commerce',
      'Código de Barras',
      'Nome do Produto',
      'Descrição',
      'Variação',
      'Tipo',
      'Material',
      'Tamanho',
      'Público',
      'Fornecedor',
      'Marca',
      'Quantidade',
      'Qtde Inicial',
      'Loja Virtual',
      'Qtde Mínima',
      'Preço de Venda (R$)',
      'Preço Promocional (R$)',
      'Custo Unitário (R$)',
      'Valor Investido (R$)',
      'Altura (cm)',
      'Largura (cm)',
      'Comprimento (cm)',
      'Peso (g)',
      'Ativo Interno',
      'Publicado no E-commerce',
      'Destaque no E-commerce',
      'Status',
      'Slug',
      'Observações',
      'Data de Entrada',
      'Origem',
      'Origem da Importação',
      'Criado em Origem',
      'Data de Inclusão Tecson',
      'Criado em (Scaglioni)',
      'Atualizado em (Scaglioni)',
      'ID Tecson',
      'Código Produto Tecson',
      'Código de Barras Tecson',
      'Nome Original Tecson',
      'ID Scaglioni',
      'SKU Scaglioni',
      'Nome Original Scaglioni',
      'Criado em',
      'Atualizado em',
      'URL da Foto',
      'Foto no ZIP',
      'Status da Foto',
    ]
    const csvText = '\uFEFF' + HEADERS.map(cell).join(';') + '\r\n' + csvRows.join('\r\n') + '\r\n'
    const csvBytes = utf8Bytes(csvText)
    addZipEntry(rootDirName + '/produtos_' + stamp + '.csv', csvBytes)

    // ── 10. Montagem do ZIP em memória (STORED, estilo streaming) ──────────
    const localParts = []
    const centralParts = []
    let runningOffset = 0
    for (let i = 0; i < zipEntries.length; i++) {
      const en = zipEntries[i]
      const nameLen = en.nameU8.length
      const dataLen = en.data.length

      // Local file header (30 bytes)
      const lfh = []
      pushU32(lfh, 0x04034b50)
      pushU16(lfh, 20) // version needed
      pushU16(lfh, 0x0800) // flags: UTF-8 + data descriptor
      pushU16(lfh, 0) // method STORED
      pushU16(lfh, 0) // mod time
      pushU16(lfh, 0x21) // mod date (1980-01-01)
      pushU32(lfh, 0) // crc = 0 (fica no data descriptor)
      pushU32(lfh, 0) // compressed size = 0
      pushU32(lfh, 0) // uncompressed size = 0
      pushU16(lfh, nameLen)
      pushU16(lfh, 0) // extra len
      localParts.push(toU8(lfh), en.nameU8, en.data)

      // Data descriptor (com CRC e tamanhos reais)
      const dd = []
      pushU32(dd, 0x08074b50)
      pushU32(dd, en.crc)
      pushU32(dd, dataLen)
      pushU32(dd, dataLen)
      localParts.push(toU8(dd))

      // Central directory header (46 bytes)
      const cdh = []
      pushU32(cdh, 0x02014b50)
      pushU16(cdh, 20) // version made by
      pushU16(cdh, 20) // version needed
      pushU16(cdh, 0x0800) // flags (bate com o local)
      pushU16(cdh, 0) // method STORED
      pushU16(cdh, 0) // mod time
      pushU16(cdh, 0x21) // mod date
      pushU32(cdh, en.crc)
      pushU32(cdh, dataLen)
      pushU32(cdh, dataLen)
      pushU16(cdh, nameLen)
      pushU16(cdh, 0) // extra len
      pushU16(cdh, 0) // comment len
      pushU16(cdh, 0) // disk number start
      pushU16(cdh, 0) // internal attrs
      pushU32(cdh, 0x20) // external attrs (archive bit)
      pushU32(cdh, runningOffset) // local header offset
      centralParts.push(toU8(cdh), en.nameU8)
      runningOffset += 30 + nameLen + dataLen + 16
    }

    const centralOffset = runningOffset
    let centralSize = 0
    for (let i = 0; i < centralParts.length; i++) centralSize += centralParts[i].length

    // EOCD (End of Central Directory, 22 bytes)
    const eocd = []
    pushU32(eocd, 0x06054b50)
    pushU16(eocd, 0) // disk 0
    pushU16(eocd, 0) // this disk
    pushU16(eocd, zipEntries.length)
    pushU16(eocd, zipEntries.length)
    pushU32(eocd, centralSize)
    pushU32(eocd, centralOffset)
    pushU16(eocd, 0) // comment len

    const zipParts = localParts.concat(centralParts)
    zipParts.push(toU8(eocd))
    const zipBytes = concatU8(zipParts)

    summary.zip_bytes = zipBytes.length
    console.log(
      'export/backup: produtos=' +
        summary.products +
        ' fotos ok=' +
        summary.photos_ok +
        ' falhas=' +
        summary.photos_failed +
        ' zip=' +
        zipBytes.length +
        ' bytes',
    )

    // ── 11. Responde o ZIP pronto na própria resposta da rota ─────────────
    // Headers informativos; se falharem, o download segue (frontend tem
    // fallback de filename e de contagens zeradas).
    try {
      const summaryJson = JSON.stringify({
        products: summary.products,
        photos_total: summary.photos_total,
        photos_ok: summary.photos_ok,
        photos_failed: summary.photos_failed,
        zip_bytes: summary.zip_bytes,
      })
      const summaryB64 = base64Encode(utf8Bytes(summaryJson))
      e.response.header().set('X-Backup-Summary', summaryB64)
      e.response.header().set('X-Backup-Strategy', summary.strategy)
      e.response
        .header()
        .set('Content-Disposition', 'attachment; filename="' + rootDirName + '.zip"')
    } catch (_) {}
    // e.blob aceita number[]/string no corpo (doc oficial da JSVM).
    return e.blob(200, 'application/zip', zipBytes)
  },
  $apis.requireAuth(),
)
