/**
 * Exportação de backup completo (CSV + fotos em ZIP) — apenas superadmin.
 *
 * Fluxo (v0.0.286 — geração 100% server-side):
 *  1. Verificação de permissão: pb.send('/backend/v1/products/export/permission')
 *     → 403 se o papel autenticado não for superadmin (não confia só no frontend).
 *  2. Chama a rota server-side /backend/v1/products/export/backup, que baixa a
 *     foto principal de cada produto (photos[0] via filesystem interno OU
 *     image_url externo — CDN Tecson — sem CORS, pois roda no servidor), monta
 *     o ZIP (CSV + pasta fotos/) inteiramente em memória e responde o binário.
 *  3. Recebe o blob e dispara o download no navegador.
 *
 * Fotos que falharem NÃO abortam o backup — o CSV preserva a URL da foto para
 * recuperação manual, e o toast final informa a quantidade de falhas.
 */

import pb from '@/lib/pocketbase/client'

const PERMISSION_ROUTE = '/backend/v1/products/export/permission'
const BACKUP_ROUTE = '/backend/v1/products/export/backup'

export interface ProductsBackupResult {
  totalProducts: number
  photosTotal: number
  photosOk: number
  photosFailed: number
}

export type BackupStage = 'validando' | 'gerando' | 'baixando'

/** Dispara o download de um blob no navegador (sem dependências novas). */
function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Extrai o resumo (contagens) do header X-Backup-Summary (JSON em base64). */
function parseSummaryHeader(headerValue: string | null): Partial<ProductsBackupResult> {
  if (!headerValue) return {}
  try {
    // base64 → bytes UTF-8 → string (sem TextDecoder para compat.)
    const bin = atob(headerValue)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    let text = ''
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (b < 0x80) {
        text += String.fromCharCode(b)
        i++
      } else if (b < 0xe0) {
        text += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
        i += 2
      } else if (b < 0xf0) {
        text += String.fromCharCode(
          ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
        )
        i += 3
      } else {
        text += String.fromCharCode(
          ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f),
        )
        i += 4
      }
    }
    const parsed = JSON.parse(text) as {
      products?: number
      photos_total?: number
      photos_ok?: number
      photos_failed?: number
    }
    return {
      totalProducts: parsed.products,
      photosTotal: parsed.photos_total,
      photosOk: parsed.photos_ok,
      photosFailed: parsed.photos_failed,
    }
  } catch {
    return {}
  }
}

/** Extrai o filename do header Content-Disposition, se presente. */
function fileNameFromDisposition(value: string | null): string | null {
  if (!value) return null
  const m = /filename[^;=\n]*=(?:UTF-8'')?("|')?(.*?)\1(?:;|$)/.exec(value)
  return m ? m[2] : null
}

/**
 * Verifica permissão server-side, dispara a geração do ZIP no backend e faz o
 * download do resultado. Lança Error com mensagem amigável em caso de problema.
 * onStage é chamado com a etapa atual ('validando' → 'gerando' → 'baixando').
 */
export async function exportProductsBackup(
  onStage?: (stage: BackupStage) => void,
): Promise<ProductsBackupResult> {
  // 1. Validação de permissão no servidor (403 se não for superadmin)
  if (onStage) onStage('validando')
  try {
    await pb.send(PERMISSION_ROUTE, { method: 'POST' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '')
    if (/403|superadmin/i.test(msg)) {
      throw new Error('Apenas o Superadmin pode exportar o backup completo.')
    }
    throw new Error('Falha ao validar permissão de exportação: ' + msg)
  }

  // 2. Geração server-side: o backend baixa todas as fotos (sem CORS) e
  //    responde o ZIP pronto. O header X-Backup-Summary carrega as contagens.
  if (onStage) onStage('gerando')
  let blob: Blob
  let summaryHeader: string | null = null
  let dispositionHeader: string | null = null
  let rawRes: unknown = null
  try {
    const res = await fetch(pb.buildURL(BACKUP_ROUTE), {
      method: 'POST',
      headers: {
        Authorization: pb.authStore.token,
        Accept: 'application/zip',
      },
    })
    rawRes = res
    if (res.status === 401) {
      throw new Error('Sessão expirada — faça login novamente.')
    }
    if (res.status === 403) {
      throw new Error('Apenas o Superadmin pode exportar o backup completo.')
    }
    if (!res.ok) {
      throw new Error('Falha ao gerar o backup no servidor (HTTP ' + res.status + ').')
    }
    summaryHeader = res.headers.get('X-Backup-Summary')
    dispositionHeader = res.headers.get('Content-Disposition')
    blob = await res.blob()
    if (!blob || blob.size === 0) {
      throw new Error('O servidor respondeu com um arquivo vazio.')
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '')
    throw new Error(msg.includes('Superadmin') ? msg : 'Falha ao gerar o backup no servidor: ' + msg)
  }

  // 3. Download do ZIP
  if (onStage) onStage('baixando')
  const fileName =
    fileNameFromDisposition(dispositionHeader) || 'backup_produtos_' + new Date().toISOString().slice(0, 10) + '.zip'
  triggerBlobDownload(blob, fileName)

  const summary = parseSummaryHeader(summaryHeader)
  return {
    totalProducts: summary.totalProducts ?? 0,
    photosTotal: summary.photosTotal ?? 0,
    photosOk: summary.photosOk ?? 0,
    photosFailed: summary.photosFailed ?? 0,
  }
}
