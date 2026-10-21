import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[i] = c
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const toCrc = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(toCrc), 0)
  return Buffer.concat([len, toCrc, crc])
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('Not a valid PNG file')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks = []

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      const interlace = data[12]
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`Unsupported PNG: bitDepth=${bitDepth}, colorType=${colorType}`)
      }
      if (interlace !== 0) {
        throw new Error('Interlaced PNG not supported')
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  const compressed = Buffer.concat(idatChunks)
  const decompressed = zlib.inflateSync(compressed)
  const rawRgba = new Uint8Array(width * height * 4)

  function paethPredictor(a, b, c) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  let srcOffset = 0
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[srcOffset++]
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        const rawByte = decompressed[srcOffset++]
        const left = x > 0 ? rawRgba[(y * width + (x - 1)) * 4 + c] : 0
        const up = y > 0 ? rawRgba[((y - 1) * width + x) * 4 + c] : 0
        const upLeft = x > 0 && y > 0 ? rawRgba[((y - 1) * width + (x - 1)) * 4 + c] : 0

        let val = 0
        if (filterType === 0) {
          val = rawByte
        } else if (filterType === 1) {
          val = (rawByte + left) & 0xff
        } else if (filterType === 2) {
          val = (rawByte + up) & 0xff
        } else if (filterType === 3) {
          val = (rawByte + Math.floor((left + up) / 2)) & 0xff
        } else if (filterType === 4) {
          val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff
        } else {
          throw new Error(`Unknown filter type ${filterType}`)
        }
        rawRgba[(y * width + x) * 4 + c] = val
      }
    }
  }

  return { width, height, data: rawRgba }
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8
  ihdrData[9] = 6
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdrChunk = makeChunk('IHDR', ihdrData)

  const rowLen = 1 + width * 4
  const rawData = Buffer.alloc(height * rowLen)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen
    rawData[rowOffset] = 0
    const srcRow = rgba.subarray(y * width * 4, (y + 1) * width * 4)
    Buffer.from(srcRow.buffer, srcRow.byteOffset, srcRow.byteLength).copy(rawData, rowOffset + 1)
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = makeChunk('IDAT', compressedData)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function resizeImage(src, targetWidth, targetHeight) {
  const dst = new Uint8Array(targetWidth * targetHeight * 4)
  const xRatio = src.width / targetWidth
  const yRatio = src.height / targetHeight

  for (let y = 0; y < targetHeight; y++) {
    const srcY = (y + 0.5) * yRatio - 0.5
    const y0 = Math.max(0, Math.floor(srcY))
    const y1 = Math.min(src.height - 1, Math.ceil(srcY))
    const yWeight = srcY - y0

    for (let x = 0; x < targetWidth; x++) {
      const srcX = (x + 0.5) * xRatio - 0.5
      const x0 = Math.max(0, Math.floor(srcX))
      const x1 = Math.min(src.width - 1, Math.ceil(srcX))
      const xWeight = srcX - x0

      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c]
        const p10 = src.data[(y0 * src.width + x1) * 4 + c]
        const p01 = src.data[(y1 * src.width + x0) * 4 + c]
        const p11 = src.data[(y1 * src.width + x1) * 4 + c]

        const top = p00 * (1 - xWeight) + p10 * xWeight
        const bottom = p01 * (1 - xWeight) + p11 * xWeight
        const val = top * (1 - yWeight) + bottom * yWeight

        dst[(y * targetWidth + x) * 4 + c] = Math.round(val)
      }
    }
  }
  return dst
}

function resizeWithPadding(src, targetSize, contentRatio = 0.75) {
  const dst = new Uint8Array(targetSize * targetSize * 4)
  for (let i = 0; i < targetSize * targetSize; i++) {
    dst[i * 4] = 0
    dst[i * 4 + 1] = 0
    dst[i * 4 + 2] = 0
    dst[i * 4 + 3] = 255
  }

  const innerSize = Math.round(targetSize * contentRatio)
  const innerResized = resizeImage(src, innerSize, innerSize)
  const offset = Math.floor((targetSize - innerSize) / 2)

  for (let y = 0; y < innerSize; y++) {
    for (let x = 0; x < innerSize; x++) {
      const dstIdx = ((y + offset) * targetSize + (x + offset)) * 4
      const srcIdx = (y * innerSize + x) * 4

      const srcA = innerResized[srcIdx + 3] / 255
      const srcR = innerResized[srcIdx]
      const srcG = innerResized[srcIdx + 1]
      const srcB = innerResized[srcIdx + 2]

      dst[dstIdx] = Math.round(srcR * srcA)
      dst[dstIdx + 1] = Math.round(srcG * srcA)
      dst[dstIdx + 2] = Math.round(srcB * srcA)
      dst[dstIdx + 3] = 255
    }
  }

  return dst
}

function buildIco(images) {
  const count = images.length
  const headerLen = 6 + count * 16
  let curOffset = headerLen

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = []
  for (const img of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(img.pngBuffer.length, 8)
    entry.writeUInt32LE(curOffset, 12)
    entries.push(entry)
    curOffset += img.pngBuffer.length
  }

  return Buffer.concat([header, ...entries, ...images.map((img) => img.pngBuffer)])
}

function run() {
  const root = process.cwd()
  const iconSourcePath = path.resolve(root, 'src/assets/logo-2026-icone-956a3.png')
  if (!fs.existsSync(iconSourcePath)) {
    console.warn('Source icon not found at', iconSourcePath)
    return
  }
  const srcBuf = fs.readFileSync(iconSourcePath)
  const decoded = decodePNG(srcBuf)
  console.log(`Source icon decoded: ${decoded.width}x${decoded.height}`)

  const publicDir = path.resolve(root, 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }

  // 192x192
  const data192 = resizeImage(decoded, 192, 192)
  const buf192 = encodePNG(192, 192, data192)
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), buf192)

  // 512x512
  const data512 = resizeImage(decoded, 512, 512)
  const buf512 = encodePNG(512, 512, data512)
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), buf512)

  // 512x512 maskable with safe zone padding
  const dataMaskable = resizeWithPadding(decoded, 512, 0.75)
  const bufMaskable = encodePNG(512, 512, dataMaskable)
  fs.writeFileSync(path.join(publicDir, 'icon-maskable.png'), bufMaskable)

  // apple-touch-icon 180x180
  const data180 = resizeImage(decoded, 180, 180)
  const buf180 = encodePNG(180, 180, data180)
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), buf180)

  // favicon 32x32, 48x48, 16x16
  const data32 = resizeImage(decoded, 32, 32)
  const buf32 = encodePNG(32, 32, data32)
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), buf32)

  const data48 = resizeImage(decoded, 48, 48)
  const buf48 = encodePNG(48, 48, data48)
  fs.writeFileSync(path.join(publicDir, 'favicon-48x48.png'), buf48)

  const data16 = resizeImage(decoded, 16, 16)
  const buf16 = encodePNG(16, 16, data16)
  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), buf16)

  // logo-scaglioni-icon.png (keep for backward compatibility)
  fs.writeFileSync(path.join(publicDir, 'logo-scaglioni-icon.png'), buf512)

  // favicon.ico (multi-size 16, 32, 48)
  const icoBuf = buildIco([
    { size: 16, pngBuffer: buf16 },
    { size: 32, pngBuffer: buf32 },
    { size: 48, pngBuffer: buf48 },
  ])
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf)

  console.log('Successfully generated all PWA icons & favicons in public/')
}

run()
