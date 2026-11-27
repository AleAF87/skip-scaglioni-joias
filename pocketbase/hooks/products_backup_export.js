/**
 * Backup de produtos gerado 100% no backend (v0.0.283).
 *
 * Motivação: o export antigo (src/lib/productsBackupExport.ts) baixava cada
 * foto via fetch no navegador — URLs externas da CDN imagestecson.b-cdn.net
 * falham por CORS, e o ZIP saía com 152 fotos de ~1386 produtos. Aqui o
 * servidor baixa TUDO (sem CORS), zipa e devolve o arquivo pronto.
 *
 * Handlers rodam 100% isolados no JSVM — helpers duplicados inline.
 *
 * Rota: POST /backend/v1/products/export/backup (superadmin-only)
 *
 * Ponto de partida do ZIP: os arquivos são gravados em um diretório
 * temporário do disco, zipados via archive.Create (Go), o ZIP é lido de
 * volta e servido como blob. O diretório é apagado no final (sucesso ou
 * erro). O ZIP sai com a estrutura do export antigo:
 *   backup_produtos_<data>/produtos_<data>.csv  (51 colunas)
 *   backup_produtos_<data>/fotos/<código>.<ext> (desambiguado _2, _3…)
 */

routerAdd(
  'POST',
  '/backend/v1/products/export/backup',
  (e) => {
    const authUser = e.auth
    if (!authUser) return e.json(401, { error: 'Não autorizado.' })
    const role = authUser.getString('role')
    if (role !== 'superadmin') {
      return e.json(403, { error: 'Apenas o Superadmin pode exportar o backup completo.' })
    }

    const MAX_PHOTO_BYTES = 15 * 1024 * 1024
    const stamp = new Date().toISOString().slice(0, 10)
    const rootDir = $os.tempDir() + '/backup_' + stamp + '_' + Date.now()
    const photosDir = rootDir + '/fotos'
    $os.mkdir(rootDir)
    $os.mkdir(photosDir)

    const summary = {
      products: 0,
      photos_total: 0,
      photos_ok: 0,
      photos_failed: 0,
      failures: [],
    }

    try {
      // ── 1. Busca TODOS os produtos em lotes de 500 ────────────────────────
      const all = []
      for (let offset = 0; ; offset += 500) {
        const batch = $app.findRecordsByFilter('products', '', '-created', 500, offset)
        for (let i = 0; i < batch.length; i++) all.push(batch[i])
        if (batch.length < 500) break
      }
      summary.products = all.length
      if (all.length === 0) {
        return e.json(400, { error: 'Nenhum produto cadastrado para exportar.' })
      }

      const usedNames = {}
      const csvRows = []

      // ── 2. CSV de 51 colunas (mesmo formato do export frontend) ───────────
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
      ]
      const num = (v) => {
        if (v === '' || v === undefined || v === null) return ''
        const s = String(v).replace(',', '.')
        const n = parseFloat(s)
        if (isNaN(n)) return String(v)
        return n.toFixed(2).replace('.', ',')
      }
      const cell = (v) => {
        const s = v === undefined || v === null ? '' : String(v)
        if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
        return s
      }
      const relName = (rec, field, relField) => {
        try {
          const rel = rec.findExpand(field)
          if (rel && rel.length > 0) return rel[0].getString(relField || 'name')
        } catch (_) {}
        return ''
      }
      const safe = (input, fallback) => {
        let s = String(input || '')
          .normalize('NFKD')
          .replace(/[^\w\s.-]/g, '')
          .trim()
          .replace(/\s+/g, '_')
        return s || fallback
      }

      // Foto principal: photos[0] via API de arquivos do PocketBase, senão image_url
      const photoNameFor = (p) => {
        const photos = p.get('photos')
        let displayUrl = ''
        let isInternal = false
        if (photos && photos.length > 0) {
          displayUrl = '/api/files/products/' + p.id + '/' + photos[0]
          isInternal = true
        } else {
          displayUrl = p.getString('image_url')
        }
        if (!displayUrl) return { name: '', url: '' }
        const base = safe(p.getString('code') || p.getString('produto_id') || p.id, p.id)
        let ext = 'jpg'
        const m = String(displayUrl.split('?')[0]).match(/\.([a-zA-Z0-9]{2,5})$/)
        if (m) ext = m[1].toLowerCase()
        let fileName = base + '.' + ext
        let n = 2
        while (usedNames[fileName]) {
          fileName = base + '_' + n++ + '.' + ext
        }
        usedNames[fileName] = true
        return { name: fileName, url: displayUrl, internal: isInternal }
      }

      // ── 3. Foto principal de cada produto — download server-side ──────────
      for (let i = 0; i < all.length; i++) {
        const p = all[i]
        summary.photos_total++
        const info = photoNameFor(p)
        if (!info.url) {
          // Produto sem foto nenhuma: entra no CSV com Foto no ZIP vazio
          summary.photos_failed++
          continue
        }

        let bytes = null
        try {
          if (info.internal) {
            // Arquivo interno do PocketBase: lê do storage direto (sem HTTP)
            const f = $app.findFileByFilename(
              'products',
              p.id,
              String(info.url).replace(/^.*\//, ''),
            )
            if (f) {
              bytes = f.bytes
            }
          }
          if (!bytes) {
            // URL externa (CDN Tecson) — server-side, sem CORS
            const res = $http.send({ url: info.url, method: 'GET', timeout: 30 })
            bytes = res.body
          }
        } catch (err) {
          bytes = null
          summary.failures.push(p.id + ': ' + (err.message || String(err)))
        }

        if (!bytes || bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
          summary.photos_failed++
          if (bytes && bytes.length > MAX_PHOTO_BYTES) {
            summary.failures.push(p.id + ': foto maior que 15MB')
          }
          continue
        }

        $os.writeBytesToFile(photosDir + '/' + info.name, bytes)
        summary.photos_ok++
      }

      // ── 4. Linhas do CSV (colunas idênticas ao export antigo) ─────────────
      for (let i = 0; i < all.length; i++) {
        const p = all[i]
        const info = photoNameFor(p)
        const row = [
          p.getString('code'),
          p.getString('produto_id'),
          p.getString('sku_interno'),
          p.getString('sku_novo'),
          p.getString('sku_ecommerce'),
          p.getString('codigo_barras'),
          p.getString('nome_produto') || p.getString('description'),
          p.getString('description'),
          p.getString('variacao'),
          relName(p, 'type'),
          relName(p, 'material'),
          relName(p, 'size'),
          p.getString('target_audience'),
          p.getString('fornecedor'),
          relName(p, 'marca_id'),
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
          info.url || '',
          info.name || '',
        ]
        csvRows.push(row)
      }

      const csvContent = '\uFEFF' + csvRows.map((r) => r.map(cell).join(';')).join('\r\n')
      $os.writeTextToFile(rootDir + '/produtos_' + stamp + '.csv', csvContent)

      // ── 5. ZIP via archive.Create (Go) e leitura de volta ────────────────
      const zipPath = $os.tempDir() + '/backup_' + stamp + '_' + Date.now() + '.zip'
      const zipResult = $archive.create(rootDir, zipPath, { includeBaseDir: false })
      if (!zipResult) {
        throw new Error('Falha ao criar o ZIP do backup.')
      }
      const zipBytes = $os.readBytesFromFile(zipPath)

      // ── 6. Limpeza do diretório temporário ────────────────────────────────
      try {
        $os.removeAll(rootDir)
        $os.remove(zipPath)
      } catch (_) {}

      console.log(
        'export/backup: produtos=' +
          summary.products +
          ' fotos ok=' +
          summary.photos_ok +
          ' falhas=' +
          summary.photos_failed,
      )

      return e.blob(zipBytes, 'application/zip', 'backup_produtos_' + stamp + '.zip')
    } catch (err) {
      try {
        $os.removeAll(rootDir)
      } catch (_) {}
      console.log('export/backup erro:', err.message)
      return e.json(400, { error: err.message || 'Falha ao gerar o backup.' })
    }
  },
  $apis.requireAuth(),
)
