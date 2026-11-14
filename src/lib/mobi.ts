/** Minimal MOBI / AZW / AZW3 (KF8) / PRC reader: PalmDB records, PalmDOC decompression, trailing-entry stripping. */

export type MobiBook = { title: string; html: string }

/** PalmDOC LZ77 decompression. */
export function palmDocDecompress(data: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < data.length;) {
    const c = data[i++]
    if (c >= 1 && c <= 8) { for (let n = 0; n < c && i < data.length; n++) out.push(data[i++]) }
    else if (c < 0x80) out.push(c)
    else if (c >= 0xc0) out.push(0x20, c ^ 0x80)
    else {
      if (i >= data.length) break
      const pair = (c << 8) | data[i++]
      const distance = (pair >> 3) & 0x7ff, length = (pair & 7) + 3
      if (!distance || distance > out.length) throw new Error('This MOBI file is damaged (bad back-reference).')
      for (let n = 0; n < length; n++) out.push(out[out.length - distance])
    }
  }
  return Uint8Array.from(out)
}

/** PalmDOC LZ77 compression (literal runs + back-references); used to build test fixtures and kept symmetric with the decoder. */
export function palmDocCompress(data: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    let bestLength = 0, bestDistance = 0
    for (let distance = 1; distance <= Math.min(i, 2047); distance++) {
      let length = 0
      while (length < 10 && i + length < data.length && data[i + length] === data[i - distance + length]) length++
      if (length > bestLength) { bestLength = length; bestDistance = distance }
    }
    if (bestLength >= 3) { const pair = 0x8000 | (bestDistance << 3) | (bestLength - 3); out.push(pair >> 8, pair & 0xff); i += bestLength; continue }
    const c = data[i]
    if (c === 0x20 && i + 1 < data.length && data[i + 1] >= 0x40 && data[i + 1] < 0x80) { out.push(data[i + 1] ^ 0x80); i += 2; continue }
    if (c === 0 || (c >= 9 && c < 0x80)) { out.push(c); i++; continue }
    const run = Math.min(8, data.length - i)
    out.push(run, ...data.subarray(i, i + run)); i += run
  }
  return Uint8Array.from(out)
}

function trailingEntrySize(record: Uint8Array, end: number): number {
  let result = 0, shift = 0
  while (end > 0) {
    const value = record[--end]
    result |= (value & 0x7f) << shift
    shift += 7
    if (value & 0x80 || shift >= 28) break
  }
  return result
}

function stripTrailing(record: Uint8Array, flags: number): Uint8Array {
  let size = record.length
  for (let bits = flags >> 1; bits; bits >>= 1) if (bits & 1) size -= trailingEntrySize(record, size)
  if (flags & 1 && size > 0) size -= (record[size - 1] & 3) + 1
  return record.subarray(0, Math.max(0, size))
}

/** Read the text of a DRM-free MOBI-family book as HTML. */
export function readMobi(bytes: Uint8Array): MobiBook {
  if (bytes.length < 86) throw new Error('This is not a MOBI/AZW file.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))
  const kind = ascii(60, 8)
  if (kind !== 'BOOKMOBI' && kind !== 'TEXtREAd') throw new Error('This is not a MOBI/AZW file (missing BOOKMOBI signature).')
  const count = view.getUint16(76)
  const offsets = Array.from({ length: count }, (_, index) => view.getUint32(78 + index * 8))
  const record = (index: number) => {
    if (index >= count) throw new Error('This MOBI file is truncated.')
    const end = index + 1 < count ? offsets[index + 1] : bytes.length
    if (offsets[index] > end || end > bytes.length) throw new Error('This MOBI file is damaged.')
    return bytes.subarray(offsets[index], end)
  }
  const header = record(0)
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const compression = headerView.getUint16(0), textRecords = headerView.getUint16(8), encryption = headerView.getUint16(12)
  if (encryption !== 0) throw new Error('This eBook is DRM-protected. Paperwork cannot open protected Kindle books.')
  if (compression === 17480) throw new Error('This eBook uses HUFF/CDIC compression, which Paperwork does not support yet.')
  if (compression !== 1 && compression !== 2) throw new Error(`Unsupported MOBI compression (${compression}).`)
  let encoding = 'windows-1252', title = kind === 'BOOKMOBI' ? ascii(0, 32).replace(/\0.*$/s, '') : 'eBook', extraFlags = 0
  const hasMobiHeader = header.length >= 24 && ascii(header.byteOffset - bytes.byteOffset + 16, 4) === 'MOBI'
  if (hasMobiHeader) {
    const headerLength = headerView.getUint32(20)
    if (headerView.getUint32(28) === 65001) encoding = 'utf-8'
    const nameOffset = headerView.getUint32(84), nameLength = headerView.getUint32(88)
    if (nameLength && nameOffset + nameLength <= header.length) title = new TextDecoder(encoding).decode(header.subarray(nameOffset, nameOffset + nameLength))
    if (headerLength >= 0xe4 && header.length >= 16 + 0xe4) extraFlags = headerView.getUint16(0xf2)
  }
  const parts = Array.from({ length: textRecords }, (_, index) => {
    const raw = stripTrailing(record(index + 1), extraFlags)
    return compression === 2 ? palmDocDecompress(raw) : raw
  })
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let position = 0
  for (const part of parts) { joined.set(part, position); position += part.length }
  const html = new TextDecoder(encoding).decode(joined)
  return { title: title.trim() || 'eBook', html: kind === 'TEXtREAd' ? `<pre>${html.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</pre>` : html }
}

/** Build a simple PalmDOC-compressed MOBI (used by tests). */
export function buildMobi(title: string, html: string, options: { encryption?: number } = {}): Uint8Array {
  const text = new TextEncoder().encode(html)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < text.length; i += 4096) chunks.push(palmDocCompress(text.subarray(i, i + 4096)))
  const name = new TextEncoder().encode(title)
  const header = new Uint8Array(16 + 0xe8 + name.length)
  const h = new DataView(header.buffer)
  h.setUint16(0, 2); h.setUint32(4, text.length); h.setUint16(8, chunks.length); h.setUint16(10, 4096); h.setUint16(12, options.encryption ?? 0)
  header.set([77, 79, 66, 73], 16); h.setUint32(20, 0xe8); h.setUint32(24, 2); h.setUint32(28, 65001)
  h.setUint32(84, 16 + 0xe8); h.setUint32(88, name.length); h.setUint16(0xf2, 0)
  header.set(name, 16 + 0xe8)
  const records = [header, ...chunks]
  const start = 78 + records.length * 8 + 2
  const total = start + records.reduce((sum, item) => sum + item.length, 0)
  const file = new Uint8Array(total)
  const v = new DataView(file.buffer)
  file.set(new TextEncoder().encode(title.slice(0, 31)), 0)
  file.set(new TextEncoder().encode('BOOKMOBI'), 60)
  v.setUint16(76, records.length)
  let offset = start
  records.forEach((item, index) => { v.setUint32(78 + index * 8, offset); v.setUint32(82 + index * 8, index * 2); file.set(item, offset); offset += item.length })
  return file
}
