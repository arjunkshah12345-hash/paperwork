import { PDFDocument, PDFPage, PDFRef, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from 'pdf-lib'

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'avif' | 'heic' | 'svg'
export const imageExtensions = '.png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif,.svg'
export const imageFormatLabel = 'JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, SVG'

/** Identify an image by its signature bytes (falls back to the file extension for SVG). */
export function sniffImage(bytes: Uint8Array, filename = ''): ImageFormat | undefined {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))
  if (bytes[0] === 0x89 && ascii(1, 3) === 'PNG') return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp'
  if (ascii(0, 4) === 'GIF8') return 'gif'
  if (ascii(0, 2) === 'BM') return 'bmp'
  if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return 'tiff'
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4)
    if (/^avi[fs]$/.test(brand)) return 'avif'
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic'
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart()
  if (/\.svg$/i.test(filename) || head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg'
  return undefined
}

export type DecodedImage = { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }

/** Decode an uncompressed (or 32-bit bitfield) BMP: 1/4/8-bit palette, 16/24/32-bit, bottom-up or top-down. */
export function decodeBmp(bytes: Uint8Array): DecodedImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataOffset = view.getUint32(10, true), headerSize = view.getUint32(14, true)
  const width = view.getInt32(18, true), rawHeight = view.getInt32(22, true)
  const bits = view.getUint16(28, true), compression = headerSize >= 40 ? view.getUint32(30, true) : 0
  const height = Math.abs(rawHeight), topDown = rawHeight < 0
  if (width <= 0 || height === 0 || width * height > 100_000_000) throw new Error('Unsupported BMP dimensions.')
  if (compression !== 0 && !(compression === 3 && (bits === 16 || bits === 32))) throw new Error('Compressed (RLE) BMP files are not supported. Save the image as PNG first.')
  const masks = compression === 3 ? [view.getUint32(54, true), view.getUint32(58, true), view.getUint32(62, true), headerSize >= 56 ? view.getUint32(66, true) : 0] : bits === 16 ? [0x7c00, 0x3e0, 0x1f, 0] : [0xff0000, 0xff00, 0xff, 0]
  const channel = (value: number, mask: number) => { if (!mask) return 255; let shift = 0; while (!((mask >>> shift) & 1)) shift++; const max = mask >>> shift; return Math.round(((value & mask) >>> shift) * 255 / max) }
  const paletteStart = 14 + headerSize, colours = bits <= 8 ? (headerSize >= 40 && view.getUint32(46, true)) || 1 << bits : 0
  const palette = Array.from({ length: colours }, (_, i) => [bytes[paletteStart + i * 4 + 2], bytes[paletteStart + i * 4 + 1], bytes[paletteStart + i * 4]])
  const stride = Math.ceil(width * bits / 32) * 4
  if (dataOffset + stride * height > bytes.length) throw new Error('This BMP file is truncated.')
  const rgba = new Uint8ClampedArray(width * height * 4)
  const useAlpha = bits === 32 && (compression === 0 ? false : masks[3] !== 0)
  for (let y = 0; y < height; y++) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * stride
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      let r: number, g: number, b: number, a = 255
      if (bits <= 8) {
        const index = (bytes[row + Math.floor(x * bits / 8)] >> (8 - bits - (x * bits) % 8)) & ((1 << bits) - 1)
        ;[r, g, b] = palette[index] ?? [0, 0, 0]
      } else if (bits === 24) { b = bytes[row + x * 3]; g = bytes[row + x * 3 + 1]; r = bytes[row + x * 3 + 2] }
      else {
        const value = bits === 16 ? view.getUint16(row + x * 2, true) : view.getUint32(row + x * 4, true)
        r = channel(value, masks[0]); g = channel(value, masks[1]); b = channel(value, masks[2]); if (useAlpha) a = channel(value, masks[3])
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a
    }
  }
  return { width, height, rgba }
}

/** Decode every page of a TIFF to RGBA. */
export async function decodeTiff(bytes: Uint8Array): Promise<DecodedImage[]> {
  const UTIF = (await import('utif')).default as unknown as { decode(buffer: ArrayBuffer): { width: number; height: number }[]; decodeImage(buffer: ArrayBuffer, ifd: unknown): void; toRGBA8(ifd: unknown): Uint8Array }
  const buffer = bytes.slice().buffer
  const pages = UTIF.decode(buffer)
  if (!pages.length) throw new Error('This TIFF contains no images.')
  return pages.map((ifd) => { UTIF.decodeImage(buffer, ifd); return { width: ifd.width, height: ifd.height, rgba: UTIF.toRGBA8(ifd) } }).filter((page) => page.width > 0 && page.height > 0)
}

/** Embed RGBA pixels losslessly (Flate, with a soft mask only when some pixels are transparent). */
export function embedRgba(document: PDFDocument, image: DecodedImage): PDFRef {
  const { width, height, rgba } = image
  const rgb = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height)
  let transparent = false
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]
    alpha[i] = rgba[i * 4 + 3]; if (alpha[i] !== 255) transparent = true
  }
  const dict: Record<string, unknown> = { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }
  if (transparent) dict.SMask = document.context.register(document.context.flateStream(alpha, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }))
  return document.context.register(document.context.flateStream(rgb, dict as never))
}

/** Draw an image XObject reference onto a page box. */
export function drawImageRef(page: PDFPage, ref: PDFRef, x: number, y: number, width: number, height: number) {
  const name = page.node.newXObject('Image', ref)
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(width, 0, 0, height, x, y), drawObject(name), popGraphicsState())
}

type HeifImage = { get_width(): number; get_height(): number; display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: { data: Uint8ClampedArray } | null) => void): void; free?(): void }

/** Decode HEIC/HEIF with libheif (WebAssembly, loaded on demand) for browsers without native support. Returns the primary image. */
export async function decodeHeic(bytes: Uint8Array): Promise<DecodedImage> {
  const factory = (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')).default as unknown as () => { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } } | Promise<{ HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } }>
  const library = await factory()
  const images = new library.HeifDecoder().decode(bytes)
  if (!images.length) throw new Error('This HEIC file contains no images.')
  const image = images[0], width = image.get_width(), height = image.get_height()
  if (width * height > 100_000_000) throw new Error('This HEIC image is too large to convert.')
  const result = await new Promise<{ data: Uint8ClampedArray } | null>(resolve => image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, resolve))
  for (const item of images) item.free?.()
  if (!result) throw new Error('This HEIC file could not be decoded.')
  return { width, height, rgba: result.data }
}

async function rgbaToJpeg(image: DecodedImage): Promise<Uint8Array | undefined> {
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = image.width; canvas.height = image.height
  try {
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
  } finally { canvas.width = 0; canvas.height = 0 }
}

/** Browser decode for formats pdf-lib cannot embed directly. Opaque photos become JPEG; anything with transparency stays lossless. */
async function browserDecode(bytes: Uint8Array, format: ImageFormat, filename: string): Promise<{ jpeg?: Uint8Array; image?: DecodedImage }> {
  if (typeof document === 'undefined') throw new Error(`${format.toUpperCase()} images can only be converted in a browser.`)
  const type = { webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', svg: 'image/svg+xml' }[format as 'webp'] ?? 'application/octet-stream'
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
  try {
    const element = new Image()
    element.decoding = 'async'
    element.src = url
    try { await element.decode() } catch {
      throw new Error(format === 'heic' ? `“${filename}”: this browser cannot decode HEIC photos. Open the page in Safari, or export the photo as JPEG first.` : `Cannot read “${filename}”. The ${format.toUpperCase()} file may be damaged or unsupported by this browser.`)
    }
    const scale = format === 'svg' ? 2 : 1
    const width = Math.max(1, Math.round((element.naturalWidth || 1024) * scale)), height = Math.max(1, Math.round((element.naturalHeight || 1024) * scale))
    if (width * height > 100_000_000) throw new Error(`“${filename}” is too large to convert.`)
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas is unavailable in this browser.')
      context.drawImage(element, 0, 0, width, height)
      const rgba = context.getImageData(0, 0, width, height).data
      let opaque = true
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break }
      if (opaque && format !== 'svg' && format !== 'gif') {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
        if (blob) return { jpeg: new Uint8Array(await blob.arrayBuffer()) }
      }
      return { image: { width, height, rgba } }
    } finally { canvas.width = 0; canvas.height = 0 }
  } finally { URL.revokeObjectURL(url) }
}

export type EmbeddedImage = { width: number; height: number; draw: (page: PDFPage, x: number, y: number, width: number, height: number) => void }

/** Embed any supported image file. Multi-page TIFFs yield one entry per page; animated GIFs use the first frame. */
export async function embedImageFile(document: PDFDocument, bytes: Uint8Array, filename: string): Promise<EmbeddedImage[]> {
  const format = sniffImage(bytes, filename)
  if (!format) throw new Error(`“${filename}” is not a supported image. Supported: ${imageFormatLabel}.`)
  const fromRef = (image: DecodedImage): EmbeddedImage => { const ref = embedRgba(document, image); return { width: image.width, height: image.height, draw: (page, x, y, w, h) => drawImageRef(page, ref, x, y, w, h) } }
  try {
    if (format === 'png' || format === 'jpeg') {
      const image = format === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
      return [{ width: image.width, height: image.height, draw: (page, x, y, width, height) => page.drawImage(image, { x, y, width, height }) }]
    }
    if (format === 'bmp') return [fromRef(decodeBmp(bytes))]
    if (format === 'tiff') return (await decodeTiff(bytes)).map(fromRef)
    let decoded: { jpeg?: Uint8Array; image?: DecodedImage }
    if (format === 'heic') {
      try { decoded = await browserDecode(bytes, format, filename) } catch {
        const image = await decodeHeic(bytes)
        const jpeg = await rgbaToJpeg(image)
        decoded = jpeg ? { jpeg } : { image }
      }
    } else decoded = await browserDecode(bytes, format, filename)
    if (decoded.jpeg) { const image = await document.embedJpg(decoded.jpeg); return [{ width: image.width, height: image.height, draw: (page, x, y, width, height) => page.drawImage(image, { x, y, width, height }) }] }
    return [fromRef(decoded.image!)]
  } catch (error) {
    if (error instanceof Error && error.message.includes(filename)) throw error
    throw new Error(`Cannot read “${filename}”. ${error instanceof Error ? error.message : ''}`.trim())
  }
}
