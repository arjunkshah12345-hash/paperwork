import { describe, expect, it } from 'vitest'
import UTIF from 'utif'
import { MultipageTiff } from './tiff'

async function decode(tiff: MultipageTiff) {
  const bytes = await tiff.toBlob().arrayBuffer()
  const pages = UTIF.decode(bytes)
  for (const page of pages) UTIF.decodeImage(bytes, page)
  return { bytes, pages }
}

describe('multipage TIFF', () => {
  it('independently decodes mixed page sizes, RGBA, order and duplicates', async () => {
    const tiff = new MultipageTiff()
    const first = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128])
    const second = new Uint8ClampedArray([0, 0, 255, 255])
    tiff.addPage(first, 2, 1, 72)
    tiff.addPage(second, 1, 1, 300)
    tiff.addPage(first, 1, 2, 150)
    const { bytes, pages } = await decode(tiff)
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('II')
    expect(pages).toHaveLength(3)
    expect(pages.map(page => [page.width, page.height])).toEqual([[2, 1], [1, 1], [1, 2]])
    expect(pages.map(page => Array.from(UTIF.toRGBA8(page)))).toEqual([Array.from(first), Array.from(second), Array.from(first)])
    expect(pages.map(page => page.t297)).toEqual([[0, 3], [1, 3], [2, 3]])
    expect(pages.map(page => page.t282)).toEqual([[72], [300], [150]])
    expect(pages.map(page => page.t283)).toEqual([[72], [300], [150]])
    expect(pages[0].t338).toEqual([2])
    expect(tiff.toBlob().type).toBe('image/tiff')
  })

  it('snapshots pixels and supports repeatable serialization', async () => {
    const pixels = new Uint8Array([25, 50, 75, 255])
    const tiff = new MultipageTiff()
    tiff.addPage(pixels, 1, 1)
    pixels.fill(0)
    expect(Array.from(UTIF.toRGBA8((await decode(tiff)).pages[0]))).toEqual([25, 50, 75, 255])
    expect(await tiff.toBlob().arrayBuffer()).toEqual(await tiff.toBlob().arrayBuffer())
  })

  it('uses the supplied view rather than unrelated backing bytes', async () => {
    const tiff = new MultipageTiff()
    tiff.addPage(new Uint8Array([0, 1, 2, 3, 255, 0]).subarray(1, 5), 1, 1, 144.5)
    const { pages } = await decode(tiff)
    expect(Array.from(UTIF.toRGBA8(pages[0]))).toEqual([1, 2, 3, 255])
    expect(pages[0].t282).toEqual([144.5])
  })

  it('rejects empty output and incomplete pixels', () => {
    const tiff = new MultipageTiff()
    expect(() => tiff.toBlob()).toThrow('at least one')
    expect(() => tiff.addPage(new Uint8Array(3), 1, 1)).toThrow('four RGBA')
    expect(() => tiff.addPage(new Uint8Array(8), 1, 1)).toThrow('four RGBA')
  })

  it.each([0, -1, 1.5, NaN, Infinity, 0x100000000])('rejects invalid dimension %s', dimension => {
    expect(() => new MultipageTiff().addPage(new Uint8Array(4), dimension, 1)).toThrow('dimensions')
    expect(() => new MultipageTiff().addPage(new Uint8Array(4), 1, dimension)).toThrow('dimensions')
  })

  it.each([0, -1, NaN, Infinity, 10001])('rejects invalid resolution %s', dpi => {
    expect(() => new MultipageTiff().addPage(new Uint8Array(4), 1, 1, dpi)).toThrow('resolution')
  })

  it('rejects excessive output before copying its pixels', () => {
    const tiff = new MultipageTiff()
    const oversized = { byteLength: 256 * 1024 * 1024 } as Uint8Array
    expect(() => tiff.addPage(oversized, 8192, 8192)).toThrow('256 MB')
    expect(() => tiff.toBlob()).toThrow('at least one')
  })
})
