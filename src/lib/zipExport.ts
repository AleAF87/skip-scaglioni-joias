/**
 * Geração de arquivo ZIP a partir de blobs/arquivos no browser — SEM dependências novas.
 *
 * Cada entrada é gravada STORED (sem compressão), o que exige apenas o CRC-32
 * como checksum — calculado aqui em TS puro com tabela de 256 entradas.
 *
 * Estrutura do ZIP conforme a especificação PKWARE APPNOTE.TXT:
 *  - Local File Header  (assinatura 0x04034b50) por arquivo
 *  - Central Directory  (assinatura 0x02014b50) no fim
 *  - End of Central Directory (assinatura 0x06054b50)
 *
 * Nomes de arquivo com acentos: usamos a flag de idioma (0x0800) para UTF-8,
 * garantindo compatibilidade com Windows/Linux/macOS.
 */

const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  nameBytes: Uint8Array
  data: Uint8Array
  crc: number
}

function u16(arr: number[], value: number) {
  arr.push(value & 0xff, (value >>> 8) & 0xff)
}

function u32(arr: number[], value: number) {
  arr.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Data/hora no formato DOS usado pelo ZIP. */
function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(d.getFullYear(), 1980)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  return { date, time }
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  // Fallback raro (browsers muito antigos)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'))
    reader.readAsArrayBuffer(blob)
  })
}

export interface ZipInputFile {
  path: string
  blob: Blob
}

/**
 * Cria o ZIP com todos os arquivos informados. Cada arquivo é gravado STORED
 * (sem compressão) — CRC-32 é o único checksum exigido pela especificação.
 */
export async function buildZip(files: ZipInputFile[]): Promise<Blob> {
  const now = dosDateTime(new Date())
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.path)
    const data = await blobToBytes(file.blob)
    const crc = crc32(data)

    // ---- Local File Header ----
    const lfh: number[] = []
    u32(lfh, 0x04034b50)
    u16(lfh, 20) // version needed (2.0 — pastas aninhadas)
    u16(lfh, 0x0800) // flags: UTF-8
    u16(lfh, 0) // method: STORED
    u16(lfh, now.time)
    u16(lfh, now.date)
    u32(lfh, crc)
    u32(lfh, data.length) // compressed size (= original, STORED)
    u32(lfh, data.length) // uncompressed size
    u16(lfh, nameBytes.length)
    u16(lfh, 0) // extra length
    localParts.push(new Uint8Array(lfh), nameBytes, data)

    // ---- Central Directory Header ----
    const cdh: number[] = []
    u32(cdh, 0x02014b50)
    u16(cdh, 20) // version made by
    u16(cdh, 20) // version needed
    u16(cdh, 0x0800) // flags: UTF-8
    u16(cdh, 0) // method: STORED
    u16(cdh, now.time)
    u16(cdh, now.date)
    u32(cdh, crc)
    u32(cdh, data.length)
    u32(cdh, data.length)
    u16(cdh, nameBytes.length)
    u16(cdh, 0) // extra
    u16(cdh, 0) // comment
    u16(cdh, 0) // disk number
    u16(cdh, 0) // internal attrs
    u32(cdh, 0) // external attrs
    u32(cdh, offset)
    centralParts.push(new Uint8Array(cdh), nameBytes)

    offset += lfh.length + nameBytes.length + data.length
  }

  const centralDir = concatBytes(centralParts)
  const localData = concatBytes(localParts)

  // ---- End of Central Directory ----
  const eocd: number[] = []
  u32(eocd, 0x06054b50)
  u16(eocd, 0) // disk
  u16(eocd, 0) // disk with central dir
  u16(eocd, files.length)
  u16(eocd, files.length)
  u32(eocd, centralDir.length)
  u32(eocd, localData.length)
  u16(eocd, 0) // comment len

  return new Blob([localData, centralDir, new Uint8Array(eocd)], {
    type: 'application/zip',
  })
}
