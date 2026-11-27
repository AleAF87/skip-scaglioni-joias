import pb from '@/lib/pocketbase/client'
import { getProductDisplayPhoto } from '@/lib/formatters'
import { buildZip, type ZipInputFile } from '@/lib/zipExport'
import type { Product } from '@/types'

/**
 * Exportação de backup completo (CSV + fotos em ZIP) — apenas superadmin.
 *
 * Fluxo:
 *  1. Verificação server-side: pb.send('/backend/v1/products/export/permission')
 *     → 403 se o papel autenticado não for superadmin (não confia só no frontend).
 *  2. Baixa TODOS os produtos em lotes de 500 — filtro vazio = tudo.
 *  3. Monta o CSV (todas as colunas de dados, formato BR p/ valores).
 *  4. Baixa a foto principal de cada produto (photos[] via API de arquivos ou
 *     image_url absoluto) — com limite de concorrência para não estourar a rede.
 *  5. Zipa tudo (sem dependências novas) e dispara o download.
 */

const PERMISSION_ROUTE = '/backend/v1/products/export/permission'
const PHOTO_FETCH_CONCURRENCY = 6
const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // proteção contra arquivos gigantes

export interface ProductBackupRow {
  id: string
  created: string
  updated: string
  code: string
  produto_id: string
  sku_interno: string
  sku_novo: string
  sku_ecommerce: string
  codigo_barras: string
  codigo_barras_tecson: string
  codigo_produto_tecson: string
  id_tecson: string
  id_scaglioni: string
  sku_scaglioni: string
  nome_produto: string
  description: string
  variacao: string
  type: string
  material: string
  size: string
  target_audience: string
  fornecedor: string
  marca: string
  quantity: number
  qtde_inicial: number
  qtde_loja_virtual: number
  minimum_quantity: number | string
  selling_price: number
  preco_promocional: number | string
  custo_unitario: number | string
  invested_value: number | string
  altura_cm: number | string
  largura_cm: number | string
  comprimento_cm: number | string
  peso_g: number | string
  ativo_interno: string
  publicar_no_ecommerce: string
  destaque_ecommerce: string
  status: string
  slug: string
  observations: string
  entry_date: string
  origem: string
  origem_importacao: string
  criado_em_origem: string
  data_inclusao_tecson: string
  created_at_scaglioni: string
  updated_at_scaglioni: string
  nome_original_tecson: string
  nome_original_scaglioni: string
  foto_url: string
  foto_arquivo_zip: string
}

const CSV_HEADERS: Array<{ key: keyof ProductBackupRow; label: string }> = [
  { key: 'code', label: 'Código' },
  { key: 'produto_id', label: 'Produto ID' },
  { key: 'sku_interno', label: 'SKU Interno' },
  { key: 'sku_novo', label: 'SKU Novo' },
  { key: 'sku_ecommerce', label: 'SKU E-commerce' },
  { key: 'codigo_barras', label: 'Código de Barras' },
  { key: 'nome_produto', label: 'Nome do Produto' },
  { key: 'description', label: 'Descrição' },
  { key: 'variacao', label: 'Variação' },
  { key: 'type', label: 'Tipo' },
  { key: 'material', label: 'Material' },
  { key: 'size', label: 'Tamanho' },
  { key: 'target_audience', label: 'Público' },
  { key: 'fornecedor', label: 'Fornecedor' },
  { key: 'marca', label: 'Marca' },
  { key: 'quantity', label: 'Quantidade' },
  { key: 'qtde_inicial', label: 'Qtde Inicial' },
  { key: 'qtde_loja_virtual', label: 'Loja Virtual' },
  { key: 'minimum_quantity', label: 'Qtde Mínima' },
  { key: 'selling_price', label: 'Preço de Venda (R$)' },
  { key: 'preco_promocional', label: 'Preço Promocional (R$)' },
  { key: 'custo_unitario', label: 'Custo Unitário (R$)' },
  { key: 'invested_value', label: 'Valor Investido (R$)' },
  { key: 'altura_cm', label: 'Altura (cm)' },
  { key: 'largura_cm', label: 'Largura (cm)' },
  { key: 'comprimento_cm', label: 'Comprimento (cm)' },
  { key: 'peso_g', label: 'Peso (g)' },
  { key: 'ativo_interno', label: 'Ativo Interno' },
  { key: 'publicar_no_ecommerce', label: 'Publicado no E-commerce' },
  { key: 'destaque_ecommerce', label: 'Destaque no E-commerce' },
  { key: 'status', label: 'Status' },
  { key: 'slug', label: 'Slug' },
  { key: 'observations', label: 'Observações' },
  { key: 'entry_date', label: 'Data de Entrada' },
  { key: 'origem', label: 'Origem' },
  { key: 'origem_importacao', label: 'Origem da Importação' },
  { key: 'criado_em_origem', label: 'Criado em Origem' },
  { key: 'data_inclusao_tecson', label: 'Data de Inclusão Tecson' },
  { key: 'created_at_scaglioni', label: 'Criado em (Scaglioni)' },
  { key: 'updated_at_scaglioni', label: 'Atualizado em (Scaglioni)' },
  { key: 'id_tecson', label: 'ID Tecson' },
  { key: 'codigo_produto_tecson', label: 'Código Produto Tecson' },
  { key: 'codigo_barras_tecson', label: 'Código de Barras Tecson' },
  { key: 'nome_original_tecson', label: 'Nome Original Tecson' },
  { key: 'id_scaglioni', label: 'ID Scaglioni' },
  { key: 'sku_scaglioni', label: 'SKU Scaglioni' },
  { key: 'nome_original_scaglioni', label: 'Nome Original Scaglioni' },
  { key: 'created', label: 'Criado em' },
  { key: 'updated', label: 'Atualizado em' },
  { key: 'foto_url', label: 'URL da Foto' },
  { key: 'foto_arquivo_zip', label: 'Foto no ZIP' },
]

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",;\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** Valor monetário em formato brasileiro (vírgula decimal), ex.: 1234,56 */
function brNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  if (isNaN(n)) return String(value)
  return n.toFixed(2).replace('.', ',')
}

function csvFromRows(rows: ProductBackupRow[]): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.map((h) => csvCell(h.label)).join(';'))
  for (const row of rows) {
    const cells = CSV_HEADERS.map(({ key }) => {
      const v = row[key]
      if (
        key === 'selling_price' ||
        key === 'preco_promocional' ||
        key === 'custo_unitario' ||
        key === 'invested_value'
      ) {
        return csvCell(brNumber(v as number | string))
      }
      return csvCell(v)
    })
    lines.push(cells.join(';'))
  }
  // BOM para o Excel reconhecer UTF-8 (acentos) ao abrir direto
  return '\uFEFF' + lines.join('\r\n')
}

function safeBaseName(input: string, fallback: string): string {
  const cleaned = (input || '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return cleaned || fallback
}

function extFromUrlOrType(url: string, contentType: string): string {
  const clean = url.split('?')[0]
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/)
  if (m) return m[1].toLowerCase()
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('bmp')) return 'bmp'
  if (ct.includes('avif')) return 'avif'
  return 'jpg'
}

async function fetchPhotoBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, {
      headers: pb.authStore.token ? { Authorization: pb.authStore.token } : undefined,
    })
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') || '0')
    if (len > MAX_PHOTO_BYTES) return null
    return await res.blob()
  } catch {
    return null
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

export interface ProductsBackupResult {
  totalProducts: number
  photosTotal: number
  photosOk: number
  photosFailed: number
}

/**
 * Verifica permissão server-side e gera o ZIP de backup completo (CSV + fotos).
 * Lança Error com mensagem amigável em caso de problema.
 */
export async function exportProductsBackup(): Promise<ProductsBackupResult> {
  // 1. Validação de permissão no servidor (403 se não for superadmin)
  try {
    await pb.send(PERMISSION_ROUTE, { method: 'POST' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '')
    if (/403|superadmin/i.test(msg)) {
      throw new Error('Apenas o Superadmin pode exportar o backup completo.')
    }
    throw new Error('Falha ao validar permissão de exportação: ' + msg)
  }

  // 2. Todos os produtos (todos os lotes, filtro vazio)
  const allProducts: Product[] = []
  let page = 1
  const perPage = 500
  for (;;) {
    const res = await pb.collection('products').getList(page, perPage, {
      sort: 'code,id',
      requestKey: null,
    })
    allProducts.push(...(res.items as unknown as Product[]))
    if (page >= res.totalPages) break
    page++
  }

  if (allProducts.length === 0) {
    throw new Error('Nenhum produto cadastrado para exportar.')
  }

  // 3. Fotos: principal de cada produto (photos[0] via API de arquivos ou image_url)
  const photos: Array<{ fileName: string; blob: Blob }> = []
  let photosFailed = 0

  const downloadJobs = allProducts
    .map((p) => ({ product: p, url: getProductDisplayPhoto(p) }))
    .filter((j) => !!j.url)

  const usedNames = new Set<string>()
  const photoNameFor = (p: Product, url: string): string => {
    const base = safeBaseName(
      String(p.code || p.produto_id || p.sku_novo || p.id || '').trim() || p.id,
      p.id,
    )
    let fileName = `${base}.${extFromUrlOrType(url, '')}`
    let n = 2
    while (usedNames.has(fileName)) {
      fileName = `${base}_${n++}.${extFromUrlOrType(url, '')}`
    }
    usedNames.add(fileName)
    return fileName
  }

  await mapLimit(downloadJobs, PHOTO_FETCH_CONCURRENCY, async (job) => {
    const fileName = photoNameFor(job.product, job.url)
    const blob = await fetchPhotoBlob(job.url)
    if (!blob) {
      photosFailed++
      return
    }
    photos.push({ fileName, blob })
  })

  // 4. CSV com TODAS as colunas de dados (referencia o nome do arquivo da foto)
  const csvRows: ProductBackupRow[] = allProducts.map((p) => {
    const photoUrl = getProductDisplayPhoto(p)
    return {
      id: p.id,
      created: p.created || '',
      updated: p.updated || '',
      code: p.code || '',
      produto_id: p.produto_id || '',
      sku_interno: p.sku_interno || '',
      sku_novo: p.sku_novo || '',
      sku_ecommerce: p.sku_ecommerce || '',
      codigo_barras: p.codigo_barras || '',
      codigo_barras_tecson: p.codigo_barras_tecson || '',
      codigo_produto_tecson: p.codigo_produto_tecson || '',
      id_tecson: p.id_tecson || '',
      id_scaglioni: p.id_scaglioni || '',
      sku_scaglioni: p.sku_scaglioni || '',
      nome_produto: p.nome_produto || '',
      description: p.description || '',
      variacao: p.variacao || '',
      type: p.expand?.type?.name || p.type || '',
      material: p.expand?.material?.name || p.material || '',
      size: p.expand?.size?.name || p.size || '',
      target_audience: p.target_audience || '',
      fornecedor: p.fornecedor || '',
      marca: p.expand?.marca_id?.name || '',
      quantity: p.quantity ?? 0,
      qtde_inicial: p.qtde_inicial ?? 0,
      qtde_loja_virtual: p.qtde_loja_virtual ? 1 : 0,
      minimum_quantity: p.minimum_quantity ?? '',
      selling_price: p.selling_price ?? 0,
      preco_promocional: p.preco_promocional ?? '',
      custo_unitario: p.custo_unitario ?? '',
      invested_value: p.invested_value ?? '',
      altura_cm: p.altura_cm ?? '',
      largura_cm: p.largura_cm ?? '',
      comprimento_cm: p.comprimento_cm ?? '',
      peso_g: p.peso_g ?? '',
      ativo_interno: p.ativo_interno ? 'Sim' : 'Não',
      publicar_no_ecommerce: p.publicar_no_ecommerce ? 'Sim' : 'Não',
      destaque_ecommerce: p.destaque_ecommerce ? 'Sim' : 'Não',
      status: p.status || '',
      slug: p.slug || '',
      observations: p.observations || '',
      entry_date: p.entry_date || '',
      origem: p.origem || '',
      origem_importacao: p.origem_importacao || '',
      criado_em_origem: p.criado_em_origem || '',
      data_inclusao_tecson: p.data_inclusao_tecson || '',
      created_at_scaglioni: p.created_at_scaglioni || '',
      updated_at_scaglioni: p.updated_at_scaglioni || '',
      nome_original_tecson: p.nome_original_tecson || '',
      nome_original_scaglioni: p.nome_original_scaglioni || '',
      foto_url: photoUrl || '',
      foto_arquivo_zip: photoUrl ? photoNameFor(p, photoUrl) : '',
    }
  })

  const csvText = csvFromRows(csvRows)
  const stamp = new Date().toISOString().slice(0, 10)

  // 5. ZIP (CSV + fotos) e download
  const files: ZipInputFile[] = [
    {
      path: `produtos_${stamp}/produtos_${stamp}.csv`,
      blob: new Blob([csvText], { type: 'text/csv;charset=utf-8' }),
    },
    ...photos.map((ph) => ({ path: `produtos_${stamp}/fotos/${ph.fileName}`, blob: ph.blob })),
  ]
  const zip = await buildZip(files)

  const url = URL.createObjectURL(zip)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup_produtos_${stamp}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  return {
    totalProducts: allProducts.length,
    photosTotal: downloadJobs.length,
    photosOk: photos.length,
    photosFailed,
  }
}
