import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import JSZip from 'jszip'
import { inspectPdf, parsePageRange, processFiles } from './pdf'

async function fixture(count = 3, objectStreams = true): Promise<File> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < count; index++) {
    const page = document.addPage([300 + index * 10, 400])
    page.drawText(`Page ${index + 1}`, { font, x: 20, y: 300 })
  }
  return new File([new Uint8Array(await document.save({ useObjectStreams: objectStreams })).buffer], 'sample.pdf', { type: 'application/pdf' })
}

async function read(blob: Blob) {
  return PDFDocument.load(await blob.arrayBuffer())
}

describe('parsePageRange', () => {
  it('defaults to every page', () => {
    expect(parsePageRange(' ', 3)).toEqual([0, 1, 2])
  })
  it('preserves order, duplicates, whitespace and reversed ranges', () => {
    expect(parsePageRange('3-1, 2, 1-2', 3)).toEqual([2, 1, 0, 1, 0, 1])
  })
  it.each(['0', '4', '-1', '1.5', '1,', ',1', '1,,2', 'one', '1-2-3', '1 2', '1-0', '9007199254740992'])('rejects invalid selection %s', (input) => {
    expect(() => parsePageRange(input, 3)).toThrow(/page/i)
  })
  it.each([0, -1, 1.5, Infinity])('rejects invalid page counts %s', (count) => {
    expect(() => parsePageRange('', count)).toThrow()
  })
})

describe('PDF operations', () => {
  it('inspects real PDF page counts and rejects corrupt PDFs', async () => {
    expect(await inspectPdf(await fixture())).toEqual({ pageCount: 3 })
    await expect(inspectPdf(new File(['no'], 'broken.pdf'))).rejects.toThrow('valid, unencrypted PDF')
  })
  it('merges sources in order without changing input bytes', async () => {
    const first = await fixture(2)
    const second = await fixture(1)
    const before = await first.arrayBuffer()
    const result = await processFiles('merge', [first, second], {})
    const document = await read(result.blob)
    expect(document.getPages().map((page) => page.getWidth())).toEqual([300, 310, 300])
    expect(result.filename).toBe('merged.pdf')
    expect(await first.arrayBuffer()).toEqual(before)
  })
  it('extracts ordered pages and duplicates into one PDF', async () => {
    const result = await processFiles('split', [await fixture()], { pages: '3,1,3' })
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([320, 300, 320])
    expect(result.blob.type).toBe('application/pdf')
  })
  it('splits every page into a ZIP when no range is supplied', async () => {
    const result = await processFiles('split', [await fixture(2)], {})
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer())
    expect(Object.keys(archive.files)).toEqual(['sample-page-1.pdf', 'sample-page-2.pdf'])
    for (const entry of Object.values(archive.files)) {
      expect((await PDFDocument.load(await entry.async('uint8array'))).getPageCount()).toBe(1)
    }
  })
  it('organizes reversed ranges', async () => {
    const result = await processFiles('organize', [await fixture()], { pages: '3-1' })
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([320, 310, 300])
  })
  it('rotates selected pages once, normalizing negative rotations', async () => {
    const result = await processFiles('rotate', [await fixture()], { pages: '2,2', rotation: -90 })
    expect((await read(result.blob)).getPages().map((page) => page.getRotation().angle)).toEqual([0, 270, 0])
  })
  it('adds rotation to existing rotation', async () => {
    const original = await read(await fixture(1))
    original.getPage(0).setRotation(degrees(270))
    const source = new File([new Uint8Array(await original.save()).buffer], 'rotated.pdf')
    const result = await processFiles('rotate', [source], { rotation: 180 })
    expect((await read(result.blob)).getPage(0).getRotation().angle).toBe(90)
  })
  it.each(['watermark', 'numbers', 'text'] as const)('adds %s content without removing pages', async (tool) => {
    const result = await processFiles(tool, [await fixture()], { text: 'Private', fontSize: 18, color: '#ff0000' })
    const document = await read(result.blob)
    expect(document.getPageCount()).toBe(3)
    expect(document.getPage(0).node.Contents()?.toString()).toBeTruthy()
  })
  it.each(['watermark', 'numbers', 'text'] as const)('only modifies selected pages for %s', async (tool) => {
    const source = await fixture()
    const before = await read(source)
    const result = await processFiles(tool, [source], { text: 'Selected', pages: '2,2' })
    const after = await read(result.blob)
    for (let index = 0; index < 3; index++) {
      const originalContents = before.getPage(index).node.Contents() as PDFArray
      const updatedContents = after.getPage(index).node.Contents() as PDFArray
      if (index === 1) expect(updatedContents.size()).toBeGreaterThan(originalContents.size())
      else expect(updatedContents.size()).toBe(originalContents.size())
    }
  })
  it('adds multiline text to every page by default', async () => {
    const source = await fixture()
    const before = await read(source)
    const result = await processFiles('text', [source], { text: 'Hello\nWorld' })
    const after = await read(result.blob)
    for (let index = 0; index < after.getPageCount(); index++) {
      expect((after.getPage(index).node.Contents() as PDFArray).size()).toBeGreaterThan((before.getPage(index).node.Contents() as PDFArray).size())
    }
  })
  it('accepts multiline watermarks', async () => {
    const result = await processFiles('watermark', [await fixture()], { text: 'Private\nDraft' })
    expect((await read(result.blob)).getPageCount()).toBe(3)
  })
  it('writes and clears document metadata', async () => {
    const result = await processFiles('metadata', [await fixture()], { title: 'Report', author: 'Alice' })
    expect((await read(result.blob)).getTitle()).toBe('Report')
    expect((await read(result.blob)).getAuthor()).toBe('Alice')
    const cleared = await processFiles('metadata', [new File([await result.blob.arrayBuffer()], 'report.pdf')], { title: '', author: '' })
    expect((await read(cleared.blob)).getTitle()).toBe('')
    expect((await read(cleared.blob)).getAuthor()).toBe('')
  })
  it('never increases file size when optimizing', async () => {
    for (const streams of [true, false]) {
      const original = await fixture(3, streams)
      const result = await processFiles('compress', [original], {})
      expect(result.blob.size).toBeLessThanOrEqual(original.size)
      expect((await read(result.blob)).getPageCount()).toBe(3)
      expect(result.message).toMatch(/lossless/i)
    }
  })
  it('embeds PNG images as individual pages', async () => {
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
    const image = new File([bytes.buffer], 'pixel.png', { type: 'image/png' })
    const result = await processFiles('images', [image, image], {})
    expect((await read(result.blob)).getPageCount()).toBe(2)
  })
  it('rejects unsupported image data', async () => {
    await expect(processFiles('images', [new File(['not an image'], 'fake.png')], {})).rejects.toThrow('not a supported image')
  })
  it('validates empty files, excess inputs, rotations, text and colors', async () => {
    const file = await fixture()
    await expect(processFiles('merge', [], {})).rejects.toThrow('at least one')
    await expect(processFiles('rotate', [file, file], {})).rejects.toThrow('exactly one')
    await expect(processFiles('rotate', [file], { rotation: 45 })).rejects.toThrow('multiple of 90')
    await expect(processFiles('text', [file], {})).rejects.toThrow('Enter the text')
    await expect(processFiles('text', [file], { text: 'Hi', color: 'red' })).rejects.toThrow('#RRGGBB')
    await expect(processFiles('text', [file], { text: 'Hi', fontSize: NaN })).rejects.toThrow('Font size')
    await expect(processFiles('text', [file], { text: '你好' })).rejects.toThrow('Latin text')
  })
})

describe('image watermark', () => {
  it('stamps a PNG at the chosen opacity, with or without text', async () => {
    const { PDFDocument: Doc } = await import('pdf-lib')
    const source = await Doc.create(); source.addPage([200, 100])
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    const file = new File([await source.save()], 'a.pdf')
    const result = await processFiles('watermark', [file], { text: '', watermarkImage: new File([png], 'logo.png'), opacity: 0.5 })
    const output = await Doc.load(await result.blob.arrayBuffer())
    const page = output.getPage(0)
    const xobjects = page.node.Resources()!.lookup((await import('pdf-lib')).PDFName.of('XObject')) as unknown as { keys: () => unknown[] }
    expect(xobjects.keys()).toHaveLength(1)
    const states = page.node.Resources()!.lookup((await import('pdf-lib')).PDFName.of('ExtGState'))!.toString()
    expect(states).toContain('/ca 0.5')
    expect(result.blob.size).toBeGreaterThan(file.size)
    await expect(processFiles('watermark', [file], { text: '', watermarkImage: new File([new Uint8Array([1, 2, 3])], 'x.gif') })).rejects.toThrow(/PNG or JPEG/)
    await expect(processFiles('watermark', [file], { text: 'X', opacity: 2 })).rejects.toThrow(/Opacity/)
  })
})
