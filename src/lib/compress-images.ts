import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'

export type CompressPreset = 'lossless' | 'balanced' | 'strong' | 'extreme' | 'target'
/** Increasingly aggressive image settings tried, gentlest first, when compressing to a target size. */
export const targetLadder: { maxDimension: number; quality: number }[] = [
  { maxDimension: 2600, quality: 0.85 }, { maxDimension: 2000, quality: 0.75 }, { maxDimension: 1600, quality: 0.66 }, { maxDimension: 1300, quality: 0.58 },
  { maxDimension: 1050, quality: 0.5 }, { maxDimension: 850, quality: 0.42 }, { maxDimension: 650, quality: 0.35 }, { maxDimension: 480, quality: 0.28 },
]
export const compressPresets: Record<'balanced' | 'strong' | 'extreme', { maxDimension: number; quality: number; label: string }> = {
  balanced: { maxDimension: 2000, quality: 0.75, label: 'Balanced (≈150 DPI, JPEG 75%)' },
  strong: { maxDimension: 1400, quality: 0.6, label: 'Strong (≈100 DPI, JPEG 60%)' },
  extreme: { maxDimension: 900, quality: 0.45, label: 'Extreme (≈72 DPI, JPEG 45%)' },
}

/** Source pixels handed to the encoder: either JPEG bytes or raw 8-bit RGB/Gray samples. */
export type ImageSource = { kind: 'jpeg'; bytes: Uint8Array; width: number; height: number } | { kind: 'raw'; samples: Uint8Array; channels: 1 | 3; width: number; height: number }
export type Reencoder = (source: ImageSource, maxDimension: number, quality: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>
export type ImageCompressionStats = { examined: number; recompressed: number; skipped: number; bytesBefore: number; bytesAfter: number }

function name(dict: PDFDict, key: string) {
  const value = dict.lookup(PDFName.of(key))
  return value instanceof PDFName ? value.asString() : value instanceof PDFArray && value.size() === 1 && value.lookup(0) instanceof PDFName ? (value.lookup(0) as PDFName).asString() : undefined
}

function colorChannels(dict: PDFDict): 1 | 3 | undefined {
  const space = dict.lookup(PDFName.of('ColorSpace'))
  if (space instanceof PDFName) return space.asString() === '/DeviceRGB' ? 3 : space.asString() === '/DeviceGray' ? 1 : undefined
  if (space instanceof PDFArray && space.lookup(0) instanceof PDFName && (space.lookup(0) as PDFName).asString() === '/ICCBased') {
    const profile = space.lookup(1)
    const n = profile instanceof PDFRawStream ? profile.dict.lookup(PDFName.of('N')) : undefined
    return n instanceof PDFNumber ? (n.asNumber() === 3 ? 3 : n.asNumber() === 1 ? 1 : undefined) : undefined
  }
  return undefined
}

/** Downsample and JPEG re-encode embedded RGB/Gray images. Unsupported images (masks, CMYK, indexed, Decode arrays) are left untouched. */
export async function recompressImages(document: PDFDocument, maxDimension: number, quality: number, reencode: Reencoder): Promise<ImageCompressionStats> {
  const stats: ImageCompressionStats = { examined: 0, recompressed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 }
  const smasks = new Set<string>()
  const images: [PDFRef, PDFRawStream][] = []
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || name(object.dict, 'Subtype') !== '/Image') continue
    const smask = object.dict.get(PDFName.of('SMask'))
    if (smask instanceof PDFRef) smasks.add(smask.toString())
    images.push([ref, object])
  }
  for (const [ref, stream] of images) {
    if (smasks.has(ref.toString())) continue
    stats.examined++
    const dict = stream.dict
    const width = dict.lookup(PDFName.of('Width'))
    const height = dict.lookup(PDFName.of('Height'))
    const bits = dict.lookup(PDFName.of('BitsPerComponent'))
    const channels = colorChannels(dict)
    const filter = name(dict, 'Filter')
    const unsupported = !(width instanceof PDFNumber) || !(height instanceof PDFNumber) || !(bits instanceof PDFNumber) || bits.asNumber() !== 8 || !channels
      || dict.has(PDFName.of('ImageMask')) || dict.has(PDFName.of('Decode')) || dict.has(PDFName.of('Mask'))
      || (filter !== '/DCTDecode' && filter !== '/FlateDecode' && filter !== undefined)
    if (unsupported) { stats.skipped++; continue }
    const w = width.asNumber(), h = height.asNumber()
    let source: ImageSource
    try {
      if (filter === '/DCTDecode') source = { kind: 'jpeg', bytes: stream.contents, width: w, height: h }
      else {
        const samples = filter ? decodePDFRawStream(stream).decode() : stream.contents
        if (samples.length < w * h * channels) { stats.skipped++; continue }
        source = { kind: 'raw', samples, channels, width: w, height: h }
      }
    } catch { stats.skipped++; continue }
    const result = await reencode(source, maxDimension, quality).catch(() => null)
    if (!result || result.bytes.length >= stream.contents.length) { stats.skipped++; continue }
    stats.bytesBefore += stream.contents.length
    stats.bytesAfter += result.bytes.length
    const next = dict.clone(document.context)
    next.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    next.set(PDFName.of('Width'), PDFNumber.of(result.width))
    next.set(PDFName.of('Height'), PDFNumber.of(result.height))
    next.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
    next.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    next.delete(PDFName.of('DecodeParms'))
    next.delete(PDFName.of('Length'))
    document.context.assign(ref, PDFRawStream.of(next, result.bytes))
    stats.recompressed++
  }
  return stats
}

/** Browser re-encoder using createImageBitmap + canvas. Never upscales. */
export const canvasReencoder: Reencoder = async (source, maxDimension, quality) => {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Image downsampling requires a browser.')
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale))
  let bitmap: ImageBitmap
  if (source.kind === 'jpeg') bitmap = await createImageBitmap(new Blob([source.bytes.slice().buffer], { type: 'image/jpeg' }))
  else {
    const rgba = new Uint8ClampedArray(source.width * source.height * 4)
    for (let i = 0, p = 0; i < source.width * source.height; i++, p += source.channels) {
      rgba[i * 4] = source.samples[p]; rgba[i * 4 + 1] = source.samples[p + (source.channels === 3 ? 1 : 0)]; rgba[i * 4 + 2] = source.samples[p + (source.channels === 3 ? 2 : 0)]; rgba[i * 4 + 3] = 255
    }
    bitmap = await createImageBitmap(new ImageData(rgba, source.width, source.height))
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  try {
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), width, height } : null
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0 }
}
