import { describe, expect, it } from 'vitest'
import UTIF from 'utif'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { decodeBmp, decodeTiff, embedImageFile, sniffImage } from './image-input'
import { processFiles } from './pdf'

/** 24-bit bottom-up BMP, pixels given top row first as [r,g,b]. */
function bmp24(width: number, height: number, pixels: number[][]) {
  const stride = Math.ceil(width * 3 / 4) * 4, size = 54 + stride * height
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer)
  bytes[0] = 0x42; bytes[1] = 0x4d; view.setUint32(2, size, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true)
  view.setInt32(18, width, true); view.setInt32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 24, true)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = pixels[y * width + x], o = 54 + (height - 1 - y) * stride + x * 3
    bytes[o] = b; bytes[o + 1] = g; bytes[o + 2] = r
  }
  return bytes
}

/** 8-bit palette top-down BMP. */
function bmp8(width: number, height: number, palette: number[][], indices: number[]) {
  const stride = Math.ceil(width / 4) * 4, offset = 54 + palette.length * 4, size = offset + stride * height
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer)
  bytes[0] = 0x42; bytes[1] = 0x4d; view.setUint32(10, offset, true); view.setUint32(14, 40, true)
  view.setInt32(18, width, true); view.setInt32(22, -height, true); view.setUint16(28, 8, true); view.setUint32(46, palette.length, true)
  palette.forEach(([r, g, b], i) => { bytes[54 + i * 4] = b; bytes[55 + i * 4] = g; bytes[56 + i * 4] = r })
  indices.forEach((index, i) => { bytes[offset + Math.floor(i / width) * stride + (i % width)] = index })
  return bytes
}

describe('image input formats', () => {
  it('sniffs formats from signatures', () => {
    const ascii = (text: string) => new TextEncoder().encode(text)
    expect(sniffImage(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp')
    expect(sniffImage(ascii('GIF89a'))).toBe('gif')
    expect(sniffImage(ascii('II*\0'))).toBe('tiff')
    expect(sniffImage(ascii('\0\0\0\x1cftypheic'))).toBe('heic')
    expect(sniffImage(ascii('\0\0\0\x1cftypavif'))).toBe('avif')
    expect(sniffImage(ascii('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
    expect(sniffImage(ascii('hello'))).toBeUndefined()
  })

  it('decodes 24-bit and palette BMPs', () => {
    const decoded = decodeBmp(bmp24(2, 2, [[255, 0, 0], [0, 255, 0], [0, 0, 255], [10, 20, 30]]))
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255])
    const paletted = decodeBmp(bmp8(3, 1, [[0, 0, 0], [200, 100, 50]], [1, 0, 1]))
    expect([...paletted.rgba]).toEqual([200, 100, 50, 255, 0, 0, 0, 255, 200, 100, 50, 255])
  })

  it('decodes every page of a multipage TIFF and makes one PDF page each', async () => {
    const red = new Uint8Array(4 * 4 * 4).map((_, i) => i % 4 === 0 || i % 4 === 3 ? 255 : 0)
    const blue = new Uint8Array(2 * 3 * 4).map((_, i) => i % 4 === 2 || i % 4 === 3 ? 255 : 0)
    const one = new Uint8Array(UTIF.encodeImage(red, 4, 4)), two = new Uint8Array(UTIF.encodeImage(blue, 2, 3))
    expect((await decodeTiff(one))[0]).toMatchObject({ width: 4, height: 4 })
    const result = await processFiles('images', [new File([one], 'a.tif'), new File([bmp24(5, 2, Array(10).fill([0, 128, 0]))], 'b.bmp'), new File([two], 'c.tiff')], {})
    const document = await PDFDocument.load(await result.blob.arrayBuffer())
    expect(document.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[4, 4], [5, 2], [2, 3]])
    const images = [...document.context.enumerateIndirectObjects()].map(([, object]) => object).filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image'))
    const green = images.find((image) => (image.dict.lookup(PDFName.of('Width')) as PDFNumber).asNumber() === 5)!
    expect([...decodePDFRawStream(green).decode().subarray(0, 3)]).toEqual([0, 128, 0])
  })

  it('adds a soft mask only for transparent pixels', async () => {
    const document = await PDFDocument.create()
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0])
    const [image] = await embedImageFile(document, new Uint8Array(UTIF.encodeImage(rgba, 2, 1)), 'clear.tif')
    image.draw(document.addPage([2, 1]), 0, 0, 2, 1)
    const masks = [...document.context.enumerateIndirectObjects()].filter(([, object]) => object instanceof PDFRawStream && object.dict.has(PDFName.of('SMask')))
    expect(masks).toHaveLength(1)
    await expect(embedImageFile(document, new TextEncoder().encode('nope'), 'x.png')).rejects.toThrow('not a supported image')
  })
})

describe('HEIC without native browser support', () => {
  it('decodes a real iPhone-style HEIC with libheif and embeds it', async () => {
    const { readFile } = await import('node:fs/promises')
    const { PDFDocument } = await import('pdf-lib')
    const { decodeHeic, embedImageFile } = await import('./image-input')
    const bytes = new Uint8Array(await readFile(new URL('./fixtures/sample.heic', import.meta.url)))
    const decoded = await decodeHeic(bytes)
    expect([decoded.width, decoded.height]).toEqual([123, 160])
    expect(decoded.rgba.length).toBe(123 * 160 * 4)
    const document = await PDFDocument.create()
    const [image] = await embedImageFile(document, bytes, 'photo.heic')
    expect([image.width, image.height]).toEqual([123, 160])
    image.draw(document.addPage([200, 200]), 0, 0, 123, 160)
    expect((await document.save()).length).toBeGreaterThan(1000)
  })
})
