import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import { processFiles } from './pdf'
import type { Reencoder } from './compress-images'


async function fixture() {
  const document = await PDFDocument.create()
  const page = document.addPage([200, 200])
  // Raw RGB image stream large enough to be worth recompressing.
  const width = 300, height = 200
  const samples = new Uint8Array(width * height * 3).map((_, i) => (i * 37) % 251)
  const image = document.context.flateStream(samples, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 })
  const ref = document.context.register(image)
  const masked = document.context.register(document.context.flateStream(samples, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }))
  page.node.setXObject(PDFName.of('Im1'), ref)
  page.node.setXObject(PDFName.of('Im2'), masked)
  return { bytes: await document.save(), width, height }
}

describe('image compression presets', () => {
  it('keeps lossless mode free of image changes', async () => {

    const { bytes } = await fixture()
    const reencoder = vi.fn()
    const result = await processFiles('compress', [new File([bytes], 'a.pdf')], { reencoder })
    expect(reencoder).not.toHaveBeenCalled()
    expect(result.message).toMatch(/not downsampled|already compact/)
  })

  it('downsamples supported images, skips CMYK, and rewrites the stream as JPEG', async () => {
    const { bytes, width, height } = await fixture()
    const reencoder = vi.fn<Reencoder>(async (source, maxDimension) => {
      expect(source.kind).toBe('raw')
      if (source.kind === 'raw') expect(source.samples.length).toBe(width * height * 3)
      const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
      return { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: Math.round(source.width * scale), height: Math.round(source.height * scale) }
    })
    const result = await processFiles('compress', [new File([bytes], 'a.pdf')], { compressPreset: 'extreme', reencoder })
    expect(reencoder).toHaveBeenCalledTimes(1)
    expect(reencoder.mock.calls[0][1]).toBe(900)
    expect(result.filename).toBe('a-compressed.pdf')
    expect(result.message).toMatch(/1 of 2 images/)
    const output = await PDFDocument.load(await result.blob.arrayBuffer())
    const images = [...output.context.enumerateIndirectObjects()].map(([, o]) => o).filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
    const jpeg = images.find(image => image.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'))!
    expect(Array.from(jpeg.contents)).toEqual([0xff, 0xd8, 0xff, 0xd9])
    expect((jpeg.dict.get(PDFName.of('Width')) as PDFNumber).asNumber()).toBe(300)
    expect(images.some(image => image.dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceCMYK'))).toBe(true)
  })

  it('returns the original when re-encoding would not shrink anything', async () => {
    const { bytes } = await fixture()
    const result = await processFiles('compress', [new File([bytes], 'a.pdf')], { compressPreset: 'balanced', reencoder: async () => null })
    expect(result.message).toMatch(/No embedded images could be made smaller/)
  })
})

describe('compress to a target size', () => {
  async function noisy() {
    const document = await PDFDocument.create()
    const page = document.addPage([200, 200])
    let seed = 7
    const samples = new Uint8Array(600 * 400 * 3).map(() => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24)
    page.node.setXObject(PDFName.of('Im1'), document.context.register(document.context.flateStream(samples, { Type: 'XObject', Subtype: 'Image', Width: 600, Height: 400, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 })))
    return new File([await document.save()], 'big.pdf')
  }
  // Fake JPEG whose size grows with resolution and quality, so the search has a monotonic curve to walk.
  const sized: Reencoder = async (_source, maxDimension, quality) => ({ bytes: new Uint8Array(Math.round(maxDimension * quality * 100)).fill(1, 0, 1).map((v, i) => i === 0 ? 0xff : i === 1 ? 0xd8 : v), width: 10, height: 10 })

  it('picks the gentlest setting that fits under the limit', async () => {
    const reencoder = vi.fn(sized)
    const result = await processFiles('compress', [await noisy()], { compressPreset: 'target', targetBytes: 100 * 1024, reencoder })
    expect(result.blob.size).toBeLessThanOrEqual(100 * 1024)
    expect(result.blob.size).toBeGreaterThan(70 * 1024)
    expect(result.message).toMatch(/under your 100 KB limit.*at most 1300px at JPEG 58%/)
    expect(reencoder.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('explains when the limit cannot be reached and returns the smallest result', async () => {
    const result = await processFiles('compress', [await noisy()], { compressPreset: 'target', targetBytes: 12 * 1024, reencoder: sized })
    expect(result.message).toMatch(/Could not reach 12 KB\. The smallest possible result is 1\d KB/)
    expect(result.blob.size).toBeLessThan(20 * 1024)
  })

  it('returns files already under the limit unchanged and rejects tiny targets', async () => {
    const file = await noisy()
    const result = await processFiles('compress', [file], { compressPreset: 'target', targetBytes: 5 * 1024 * 1024, reencoder: sized })
    expect(result.blob).toBe(file)
    expect(result.message).toMatch(/under 5\.0 MB/)
    await expect(processFiles('compress', [file], { compressPreset: 'target', targetBytes: 1000 })).rejects.toThrow('at least 10 KB')
  })
})
