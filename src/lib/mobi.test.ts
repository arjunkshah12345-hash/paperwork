import { describe, expect, it } from 'vitest'
import { buildMobi, palmDocCompress, palmDocDecompress, readMobi } from './mobi'
import { processConversion } from './converters'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

async function pdfText(blob: Blob) {
  const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ') + '\n'
  return { text, pages: pdf.numPages }
}

describe('MOBI reader', () => {
  it('round-trips PalmDOC compression, including repeats, spaces and high bytes', () => {
    const input = new TextEncoder().encode('the cat sat on the mat, the cat sat on the mat. Café — naïve résumé.\u0001\u0008 end')
    const packed = palmDocCompress(input)
    expect(packed.length).toBeLessThan(input.length)
    expect(palmDocDecompress(packed)).toEqual(input)
  })
  it('reads title and multi-record UTF-8 text', () => {
    const body = '<html><body><h1>Chapter One</h1><p>' + 'It was a bright cold day in April. '.repeat(300) + '</p><mbp:pagebreak/><h1>Chapter Two</h1><p>Café ending.</p></body></html>'
    const book = readMobi(buildMobi('Test Novel', body))
    expect(book.title).toBe('Test Novel')
    expect(book.html).toBe(body)
  })
  it('strips trailing multibyte entries', () => {
    const file = buildMobi('T', '<p>Hello</p>')
    // Rebuild with extra-data flag 1 and a one-byte multibyte trailer on the text record.
    const view = new DataView(file.buffer)
    const r0 = view.getUint32(78), r1 = view.getUint32(86)
    view.setUint16(r0 + 0xf2, 1)
    const withTrailer = new Uint8Array(file.length + 1)
    withTrailer.set(file); withTrailer[file.length] = 0
    expect(r1).toBeGreaterThan(r0)
    expect(readMobi(withTrailer).html).toBe('<p>Hello</p>')
  })
  it('refuses DRM-protected and non-MOBI files', () => {
    expect(() => readMobi(buildMobi('Locked', '<p>x</p>', { encryption: 2 }))).toThrow('DRM')
    expect(() => readMobi(new Uint8Array(200))).toThrow('not a MOBI')
  })
  it('converts a MOBI and an AZW3-named book to PDF with page breaks as sections', async () => {
    const bytes = buildMobi('Book', '<h1>First chapter</h1><p>Opening line.</p><mbp:pagebreak/><h1>Second chapter</h1><p>Closing line.</p>')
    for (const name of ['book.mobi', 'book.azw3']) {
      const result = await processConversion('ebook-pdf', [new File([bytes], name)], {})
      const { text } = await pdfText(result.blob)
      expect(text).toContain('Opening line.')
      expect(text).toContain('Closing line.')
    }
  })
})
