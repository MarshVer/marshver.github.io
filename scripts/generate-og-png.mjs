import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data || '')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(d.length, 0)
  const crcBuf = Buffer.concat([t, d])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuf), 0)
  return Buffer.concat([len, t, d, crc])
}

async function writeOgPng(outPath, { width = 1200, height = 630 } = {}) {
  const W = Math.max(1, Number(width) || 1200)
  const H = Math.max(1, Number(height) || 630)

  // Simple, readable OG image background (no font deps).
  const bg = [0x28, 0x28, 0x28, 0xff]
  const accent = [0x49, 0xb1, 0xf5, 0xff]

  const stride = W * 4
  const raw = Buffer.alloc((stride + 1) * H)

  for (let y = 0; y < H; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0 // filter: none

    for (let x = 0; x < W; x += 1) {
      const i = row + 1 + x * 4

      // Top accent bar + subtle diagonal pattern.
      const isTop = y < 12
      const isStripe = ((x + y) % 48) < 2
      const c = isTop ? accent : isStripe ? [0x2f, 0x2f, 0x2f, 0xff] : bg

      raw[i] = c[0]
      raw[i + 1] = c[1]
      raw[i + 2] = c[2]
      raw[i + 3] = c[3]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const idat = zlib.deflateSync(raw, { level: 9 })

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, png)
}

const OUT = path.resolve('public/og.png')
await writeOgPng(OUT)

// eslint-disable-next-line no-console
console.log(`Wrote ${OUT}`)

