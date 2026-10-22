// Client-side ZIP extractor using native browser DecompressionStream (RFC 1951 raw deflate)
// Parses standard PKZIP 2.0 format files without any external npm dependency.

export interface ZipExtractedFile {
  name: string
  blob: Blob
  size: number
}

export async function extractZipEntries(
  zipFile: File | Blob,
  onProgress?: (loaded: number, total: number, currentName: string) => void,
): Promise<ZipExtractedFile[]> {
  const buffer = await zipFile.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // Find End of Central Directory Record (EOCD) by scanning backwards from end of file
  // EOCD signature is 0x06054b50
  let eocdOffset = -1
  const minEOCDSize = 22
  const maxSearchRange = Math.min(bytes.length, 65535 + minEOCDSize)

  for (let i = bytes.length - minEOCDSize; i >= bytes.length - maxSearchRange; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Formato de arquivo ZIP inválido (marcador EOCD não encontrado).')
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)

  const entries: Array<{
    fileName: string
    compressionMethod: number
    compressedSize: number
    uncompressedSize: number
    localHeaderOffset: number
    isDirectory: boolean
  }> = []

  let ptr = cdOffset
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > bytes.length) break
    const sig = view.getUint32(ptr, true)
    if (sig !== 0x02014b50) {
      // Central directory file header signature
      break
    }

    const flags = view.getUint16(ptr + 8, true)
    const compressionMethod = view.getUint16(ptr + 10, true)
    const compressedSize = view.getUint32(ptr + 20, true)
    const uncompressedSize = view.getUint32(ptr + 24, true)
    const fileNameLength = view.getUint16(ptr + 28, true)
    const extraFieldLength = view.getUint16(ptr + 30, true)
    const fileCommentLength = view.getUint16(ptr + 32, true)
    const localHeaderOffset = view.getUint32(ptr + 42, true)

    // Decode filename: UTF-8 if bit 11 is set, otherwise fallback to UTF-8 / latin1
    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + fileNameLength)
    const isUtf8 = (flags & (1 << 11)) !== 0
    let fileName = ''
    try {
      fileName = new TextDecoder(isUtf8 ? 'utf-8' : 'utf-8', { fatal: true }).decode(nameBytes)
    } catch {
      fileName = new TextDecoder('windows-1252').decode(nameBytes)
    }

    const isDirectory = fileName.endsWith('/') || fileName.endsWith('\\')

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory,
    })

    ptr += 46 + fileNameLength + extraFieldLength + fileCommentLength
  }

  const results: ZipExtractedFile[] = []

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]
    if (entry.isDirectory) continue

    if (onProgress) {
      onProgress(idx + 1, entries.length, entry.fileName)
    }

    const lho = entry.localHeaderOffset
    if (lho + 30 > bytes.length) continue
    const localSig = view.getUint32(lho, true)
    if (localSig !== 0x04034b50) {
      continue
    }

    const localNameLen = view.getUint16(lho + 26, true)
    const localExtraLen = view.getUint16(lho + 28, true)
    const dataStart = lho + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + entry.compressedSize

    if (dataEnd > bytes.length) continue

    const compressedSlice = bytes.subarray(dataStart, dataEnd)
    let fileBlob: Blob

    if (entry.compressionMethod === 0) {
      // Store (no compression)
      fileBlob = new Blob([new Uint8Array(compressedSlice).buffer as ArrayBuffer], {
        type: getMimeType(entry.fileName),
      })
    } else if (entry.compressionMethod === 8) {
      // Deflate
      try {
        const decompressedBytes = await decompressRawDeflate(new Uint8Array(compressedSlice))
        fileBlob = new Blob([decompressedBytes.buffer as ArrayBuffer], {
          type: getMimeType(entry.fileName),
        })
      } catch (err: any) {
        console.warn(`Falha ao descompactar arquivo ${entry.fileName}:`, err?.message)
        continue
      }
    } else {
      console.warn(
        `Método de compressão não suportado (${entry.compressionMethod}) para: ${entry.fileName}`,
      )
      continue
    }

    results.push({
      name: entry.fileName.replace(/\\/g, '/'),
      blob: fileBlob,
      size: fileBlob.size,
    })
  }

  return results
}

async function decompressRawDeflate(compressedBytes: Uint8Array): Promise<Uint8Array> {
  // Try native DecompressionStream with 'deflate-raw'
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate-raw' as any)
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()

      writer.write(compressedBytes.buffer as ArrayBuffer)
      writer.close()

      const chunks: Uint8Array[] = []
      let totalLength = 0

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          totalLength += value.length
        }
      }

      const out = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.length
      }
      return out
    } catch {
      // If deflate-raw is not accepted, fallback to wrapped zlib format
    }
  }

  // Fallback: Wrap raw deflate in zlib header (0x78 0x9c) + adler32 dummy (0x00 0x00 0x00 0x01)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const zlibData = new Uint8Array(compressedBytes.length + 6)
      zlibData[0] = 0x78
      zlibData[1] = 0x9c
      zlibData.set(compressedBytes, 2)
      // Adler32 placeholder at the end
      zlibData[zlibData.length - 4] = 0
      zlibData[zlibData.length - 3] = 0
      zlibData[zlibData.length - 2] = 0
      zlibData[zlibData.length - 1] = 1

      const ds = new DecompressionStream('deflate')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()

      writer.write(zlibData.buffer as ArrayBuffer)
      writer.close()

      const chunks: Uint8Array[] = []
      let totalLength = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          totalLength += value.length
        }
      }

      const out = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.length
      }
      return out
    } catch (e: any) {
      throw new Error(`Falha na descompressão do stream: ${e?.message || e}`)
    }
  }

  throw new Error('DecompressionStream não suportado pelo navegador atual.')
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'webp':
      return 'image/webp'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}
