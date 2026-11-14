import { describe, expect, it, vi } from 'vitest'
import {
  PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees,
} from 'pdf-lib'
import JSZip from 'jszip'
import { advancedTools, processAdvanced } from './advanced-pdf'

const readerState = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ getDocument: readerState.getDocument, GlobalWorkerOptions: {} }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'local-worker.mjs' }))

async function fixture(count = 3, filename = 'sample.pdf'): Promise<File> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < count; index++) {
    const page = document.addPage([300 + index * 10, 400])
    page.drawText(`Page ${index + 1}`, { font, x: 20, y: 300 })
  }
  document.setTitle('Example')
  return fileFrom(document, filename)
}

async function fileFrom(document: PDFDocument, filename = 'sample.pdf'): Promise<File> {
  return new File([new Uint8Array(await document.save()).buffer], filename, { type: 'application/pdf' })
}

async function read(blob: Blob): Promise<PDFDocument> {
  return PDFDocument.load(await blob.arrayBuffer())
}

async function parts(blob: Blob): Promise<PDFDocument[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Promise.all(Object.values(zip.files).filter((entry) => !entry.dir).map(async (entry) => PDFDocument.load(await entry.async('uint8array'))))
}

function content(document: PDFDocument, index: number): string {
  const streams = document.getPage(index).node.Contents()
  const list = streams instanceof PDFArray ? streams.asArray() : streams ? [streams] : []
  return list.map((reference) => {
    const stream = document.context.lookup(reference)
    if (!(stream instanceof PDFRawStream)) throw new Error('Expected a content stream')
    return new TextDecoder().decode(decodePDFRawStream(stream).decode())
  }).join('\n')
}

describe('advanced PDF tools', () => {
  it('exports exactly the supported IDs without duplicates', () => {
    expect(advancedTools).toEqual([
      'alternate', 'analyze', 'split-text', 'split-bookmarks', 'split-half', 'split-size',
      'delete-pages', 'extract-pages', 'flip', 'nup', 'crop', 'zip', 'sign', 'fill-form',
      'bates', 'headers', 'flatten', 'invert', 'repair', 'redact',
    ])
    expect(new Set(advancedTools).size).toBe(advancedTools.length)
  })

  it('interleaves unequal PDFs without losing trailing pages', async () => {
    const result = await processAdvanced('alternate', [await fixture(), await fixture(1)], {})
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([300, 300, 310, 320])
    expect(result.filename).toBe('alternated.pdf')
  })

  it('applies a common page selection when interleaving', async () => {
    const result = await processAdvanced('alternate', [await fixture(), await fixture()], { pages: '2-1' })
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([310, 310, 300, 300])
  })

  it('analyzes real dimensions, metadata, annotations and fields as JSON', async () => {
    const original = await read(await fixture())
    original.getForm().createTextField('Name').addToPage(original.getPage(1))
    const result = await processAdvanced('analyze', [await fileFrom(original)], { pages: '2' })
    const report = JSON.parse(await result.blob.text())
    expect(result.blob.type).toBe('application/json')
    expect(report.pageCount).toBe(3)
    expect(report.metadata.title).toBe('Example')
    expect(report.pages).toHaveLength(1)
    expect(report.pages[0]).toMatchObject({ page: 2, mediaBox: { width: 310, height: 400 }, annotations: 1 })
    expect(report.formFields).toContainEqual({ name: 'Name', type: 'PDFTextField' })
  })

  it('extracts in requested order, including repeated and descending pages', async () => {
    const result = await processAdvanced('extract-pages', [await fixture()], { pages: '3-1,2' })
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([320, 310, 300, 310])
  })

  it('deletes selected pages once and rejects empty results', async () => {
    const source = await fixture()
    const result = await processAdvanced('delete-pages', [source], { pages: '2,2' })
    expect((await read(result.blob)).getPages().map((page) => page.getWidth())).toEqual([300, 320])
    await expect(processAdvanced('delete-pages', [source], {})).rejects.toThrow('at least one page')
  })

  it('splits visible page boxes into left and right halves', async () => {
    const result = await processAdvanced('split-half', [await fixture(1)], {})
    const document = await read(result.blob)
    expect(document.getPageCount()).toBe(2)
    expect(document.getPage(0).getMediaBox()).toEqual({ x: 0, y: 0, width: 150, height: 400 })
    expect(document.getPage(1).getCropBox()).toEqual({ x: 150, y: 0, width: 150, height: 400 })
    expect(result.message).toMatch(/not redaction/)
  })

  it('splits top before bottom, respecting nonzero source box origins', async () => {
    const source = await read(await fixture(1))
    source.getPage(0).setCropBox(20, 30, 200, 300)
    const result = await processAdvanced('split-half', [await fileFrom(source)], { axis: 'horizontal' })
    const document = await read(result.blob)
    expect(document.getPages().map((page) => page.getCropBox())).toEqual([
      { x: 20, y: 180, width: 200, height: 150 }, { x: 20, y: 30, width: 200, height: 150 },
    ])
  })

  it('can divide a document into two contiguous ZIP parts', async () => {
    const result = await processAdvanced('split-half', [await fixture(5)], { mode: 'document' })
    const documents = await parts(result.blob)
    expect(result.blob.type).toBe('application/zip')
    expect(documents.map((document) => document.getPageCount())).toEqual([3, 2])
  })

  it('splits before text matches, including the leading unmatched section', async () => {
    const cleanup = vi.fn()
    const destroy = vi.fn()
    readerState.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 5,
        getPage: async (page: number) => ({ getTextContent: async () => ({ items: [{ str: page === 3 || page === 5 ? 'CHAPTER' : 'Body' }] }), cleanup }),
      }), destroy,
    })
    const result = await processAdvanced('split-text', [await fixture(5)], { text: 'chapter' })
    expect((await parts(result.blob)).map((document) => document.getPageCount())).toEqual([2, 2, 1])
    expect(cleanup).toHaveBeenCalledTimes(5)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('cleans up PDF.js on a text search failure', async () => {
    const cleanup = vi.fn()
    const destroy = vi.fn()
    readerState.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'CHAPTER' }] }), cleanup }) }), destroy,
    })
    await expect(processAdvanced('split-text', [await fixture(1)], { text: 'chapter', mode: 'sensitive' })).rejects.toThrow('No pages contain')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('resolves nested named, direct-index and reference bookmarks', async () => {
    const destroy = vi.fn()
    const getPageIndex = vi.fn().mockResolvedValue(4)
    const getDestination = vi.fn().mockResolvedValue([2, { name: 'Fit' }])
    readerState.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 5, getPageIndex, getDestination,
        getOutline: async () => [
          { dest: [0], items: [{ dest: 'chapter', items: [] }] },
          { dest: [{ num: 42, gen: 0 }], items: [] },
          { dest: null, items: [] },
        ],
      }), destroy,
    })
    const result = await processAdvanced('split-bookmarks', [await fixture(5)], {})
    expect((await parts(result.blob)).map((document) => document.getPageCount())).toEqual([2, 2, 1])
    expect(getDestination).toHaveBeenCalledWith('chapter')
    expect(getPageIndex).toHaveBeenCalledWith({ num: 42, gen: 0 })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('rejects documents without usable bookmarks and destroys the reader', async () => {
    const destroy = vi.fn()
    readerState.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getOutline: async () => null }), destroy })
    await expect(processAdvanced('split-bookmarks', [await fixture(1)], {})).rejects.toThrow('no bookmarks')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('enforces the actual serialized size of each split part', async () => {
    const source = await fixture(5)
    const singleSizes = []
    for (let page = 1; page <= 5; page++) {
      const result = await processAdvanced('extract-pages', [source], { pages: String(page) })
      singleSizes.push(result.blob.size)
    }
    const limit = Math.max(...singleSizes) + 20
    const result = await processAdvanced('split-size', [source], { maxSizeMb: limit / (1024 * 1024) })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    let count = 0
    for (const entry of Object.values(zip.files)) {
      const bytes = await entry.async('uint8array')
      expect(bytes.length).toBeLessThanOrEqual(limit)
      count += (await PDFDocument.load(bytes)).getPageCount()
    }
    expect(count).toBe(5)
    expect(Object.keys(zip.files).length).toBeGreaterThan(1)
    await expect(processAdvanced('split-size', [source], { maxSizeMb: 0.000001 })).rejects.toThrow('alone exceeds')
  })

  it('crops only selected pages relative to their visible origin', async () => {
    const source = await read(await fixture())
    source.getPage(1).setCropBox(10, 20, 250, 300)
    const result = await processAdvanced('crop', [await fileFrom(source)], { pages: '2,2', margin: 10, width: 200, height: 250 })
    const document = await read(result.blob)
    expect(document.getPage(1).getCropBox()).toEqual({ x: 20, y: 30, width: 200, height: 250 })
    expect(document.getPage(0).getCropBox()).toEqual({ x: 0, y: 0, width: 300, height: 400 })
  })

  it.each(['horizontal', 'vertical'])('mirrors selected page artwork along the %s axis', async (axis) => {
    const result = await processAdvanced('flip', [await fixture()], { pages: '2', axis })
    const document = await read(result.blob)
    expect(document.getPageCount()).toBe(3)
    expect(content(document, 1)).toContain(axis === 'horizontal' ? '-1 0 0 1 310 0 cm' : '1 0 0 -1 0 400 cm')
    expect(content(document, 0)).toContain('506167652031')
    expect(document.getPage(1).node.Resources()?.lookup(PDFName.of('XObject'))).toBeTruthy()
  })

  it('imposes selected pages on real n-up sheets, preserving order', async () => {
    const result = await processAdvanced('nup', [await fixture(5)], { columns: 2, width: 600, height: 800, margin: 0 })
    const document = await read(result.blob)
    expect(document.getPageCount()).toBe(2)
    expect(document.getPages().map((page) => page.getSize())).toEqual([{ width: 600, height: 800 }, { width: 600, height: 800 }])
    expect(content(document, 0).match(/ Do/g)).toHaveLength(4)
    expect(content(document, 1).match(/ Do/g)).toHaveLength(1)
  })

  it.each([0, 90, 180, 270])('normalizes %s degree rotation when embedding visible pages', async (rotation) => {
    const source = await read(await fixture(1))
    source.getPage(0).setRotation(degrees(rotation))
    source.getPage(0).setCropBox(10, 20, 200, 300)
    const result = await processAdvanced('flip', [await fileFrom(source)], {})
    const document = await read(result.blob)
    expect(document.getPage(0).getSize()).toEqual(rotation % 180 ? { width: 300, height: 200 } : { width: 200, height: 300 })
    expect(document.getPage(0).getRotation().angle).toBe(0)
  })

  it('archives original bytes with safe unique names', async () => {
    const original = new File(['exact bytes'], '../same.txt')
    const result = await processAdvanced('zip', [original, original], { mode: 'bundle' })
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const entries = Object.values(zip.files)
    expect(entries).toHaveLength(2)
    expect(entries.every((entry) => !entry.name.includes('/'))).toBe(true)
    expect(await entries[0].async('string')).toBe('exact bytes')
  })

  it('rejects invalid ZIP modes and requires canvas for page images', async () => {
    const source = await fixture(1)
    await expect(processAdvanced('zip', [source], { mode: 'wrong' })).rejects.toThrow('mode')
    await expect(processAdvanced('zip', [source], {})).rejects.toThrow('browser')
    await expect(processAdvanced('zip', [source], { mode: 'jpeg' })).rejects.toThrow('browser')
  })

  it.each(['headers', 'bates', 'sign'])('adds actual %s artwork only on selected pages', async (tool) => {
    const source = await fixture()
    const result = await processAdvanced(tool, [source], { pages: '2,2', text: 'Approved', prefix: 'ABC-', startNumber: 7 })
    const document = await read(result.blob)
    const before = await read(source)
    expect(content(document, 0)).toBe(content(before, 0))
    expect(content(document, 2)).toBe(content(before, 2))
    expect(content(document, 1)).toContain(tool === 'bates' ? '4142432D303030303037' : '417070726F766564')
  })

  it('supports both headers and footers with page tokens and multiline text', async () => {
    const result = await processAdvanced('headers', [await fixture()], { text: '{page}/{total}\nDraft', mode: 'both' })
    const document = await read(result.blob)
    expect(content(document, 1).match(/322F33/g)).toHaveLength(2)
    expect(content(document, 1)).toContain('4472616674')
  })

  it('embeds a PNG signature rather than treating it as another PDF', async () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    const image = new File([bytes], 'signature.png', { type: 'image/png' })
    const result = await processAdvanced('sign', [await fixture(1), image], { width: 80, height: 40 })
    const document = await read(result.blob)
    expect(content(document, 0)).toContain(' Do')
    expect(result.message).toMatch(/not a cryptographic/)
    await expect(processAdvanced('sign', [await fixture(1), new File(['fake'], 'fake.png')], {})).rejects.toThrow('PNG or JPEG')
  })

  it('places a drawn signature (from options) at the chosen bottom position', async () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    const signatureImage = new Blob([bytes], { type: 'image/png' })
    const right = await read((await processAdvanced('sign', [await fixture(1)], { signatureImage, width: 80, height: 40 })).blob)
    const left = await read((await processAdvanced('sign', [await fixture(1)], { signatureImage, width: 80, height: 40, align: 'left' })).blob)
    const width = right.getPage(0).getWidth()
    expect(content(right, 0)).toContain(`1 0 0 1 ${width - 24 - 40} 24 cm`)
    expect(content(left, 0)).toContain('1 0 0 1 24 24 cm')
    await expect(processAdvanced('sign', [await fixture(1)], { signatureImage, align: 'top' })).rejects.toThrow('align')
  })

  it('fills supported AcroForm fields and saves updated appearances', async () => {
    const source = await read(await fixture(1))
    const form = source.getForm()
    form.createTextField('name').addToPage(source.getPage(0))
    form.createCheckBox('approved').addToPage(source.getPage(0))
    form.createDropdown('country').addOptions(['US', 'CA'])
    const list = form.createOptionList('colors')
    list.addOptions(['Red', 'Blue'])
    list.enableMultiselect()
    const radio = form.createRadioGroup('answer')
    radio.addOptionToPage('yes', source.getPage(0))
    radio.addOptionToPage('no', source.getPage(0))
    const result = await processAdvanced('fill-form', [await fileFrom(source)], { formValues: JSON.stringify({ name: 'Alice', approved: true, country: 'CA', colors: ['Red', 'Blue'], answer: 'no' }) })
    const updated = (await read(result.blob)).getForm()
    expect(updated.getTextField('name').getText()).toBe('Alice')
    expect(updated.getCheckBox('approved').isChecked()).toBe(true)
    expect(updated.getDropdown('country').getSelected()).toEqual(['CA'])
    expect(updated.getOptionList('colors').getSelected()).toEqual(['Red', 'Blue'])
    expect(updated.getRadioGroup('answer').getSelected()).toBe('no')
  })

  it('rejects malformed form data, unknown fields and invalid option values', async () => {
    const source = await read(await fixture(1))
    source.getForm().createCheckBox('approved')
    source.getForm().createDropdown('choice').addOptions(['A'])
    const file = await fileFrom(source)
    for (const formValues of ['bad', '[]', 'null', '{}']) {
      await expect(processAdvanced('fill-form', [file], { formValues })).rejects.toThrow()
    }
    await expect(processAdvanced('fill-form', [file], { formValues: '{"missing":"x"}' })).rejects.toThrow('Unknown form field')
    await expect(processAdvanced('fill-form', [file], { formValues: '{"approved":"true"}' })).rejects.toThrow('boolean')
    await expect(processAdvanced('fill-form', [file], { formValues: '{"choice":"B"}' })).rejects.toThrow('existing option')
    await expect(processAdvanced('fill-form', [file], { formValues: '{"choice":["A","A"]}' })).rejects.toThrow('one selection')
  })

  it('rebuilds readable pages for repair without pretending to recover missing bytes', async () => {
    const source = await fixture()
    const result = await processAdvanced('repair', [source], {})
    const document = await read(result.blob)
    expect(document.getPageCount()).toBe(3)
    expect(content(document, 0)).toContain('506167652031')
    expect(result.message).toMatch(/Cannot recover missing bytes/)
    await expect(processAdvanced('repair', [new File(['not a PDF'], 'broken.pdf')], {})).rejects.toThrow('Cannot open')
  })

  it.each(['flatten', 'invert', 'redact'])('requires a browser for %s rather than producing placeholder output', async (tool) => {
    await expect(processAdvanced(tool, [await fixture()], { text: 'Page' })).rejects.toThrow('requires a browser')
  })

  it('validates inputs, numeric bounds, dimensions, text and selections', async () => {
    const source = await fixture()
    await expect(processAdvanced('unknown', [source], {})).rejects.toThrow('Unknown advanced')
    await expect(processAdvanced('crop', [], {})).rejects.toThrow('at least one file')
    await expect(processAdvanced('crop', [source, source], {})).rejects.toThrow('exactly one PDF')
    await expect(processAdvanced('alternate', [source], {})).rejects.toThrow('at least two')
    await expect(processAdvanced('crop', [source], { pages: '4' })).rejects.toThrow('between 1 and 3')
    await expect(processAdvanced('crop', [source], { pages: 2 })).rejects.toThrow('string')
    await expect(processAdvanced('crop', [source], { margin: NaN })).rejects.toThrow('finite number')
    await expect(processAdvanced('crop', [source], { width: 900 })).rejects.toThrow('fit inside')
    await expect(processAdvanced('crop', [source], { margin: 200 })).rejects.toThrow()
    await expect(processAdvanced('nup', [source], { columns: 1.2 })).rejects.toThrow('integer')
    await expect(processAdvanced('nup', [source], { margin: 500 })).rejects.toThrow('usable sheet')
    await expect(processAdvanced('flip', [source], { axis: 'z' })).rejects.toThrow('axis')
    await expect(processAdvanced('headers', [source], {})).rejects.toThrow('Enter the text')
    await expect(processAdvanced('sign', [source], { text: '你好' })).rejects.toThrow('Latin text')
    await expect(processAdvanced('headers', [source], { text: 'Hi', color: 'red' })).rejects.toThrow('#RRGGBB')
    await expect(processAdvanced('bates', [source], { startNumber: -1 })).rejects.toThrow('startNumber')
    await expect(processAdvanced('headers', [source], { text: 'Hi', fontSize: Infinity })).rejects.toThrow('fontSize')
  })
})
