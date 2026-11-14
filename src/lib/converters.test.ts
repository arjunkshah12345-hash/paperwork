import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'
import { cellValue, conversionTools, processConversion } from './converters'

async function pdfFixture(texts = ['Hello editable world', 'Second page text']): Promise<File> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (const text of texts) document.addPage().drawText(text, { x: 40, y: 700, size: 14, font })
  return new File([new Uint8Array(await document.save()).buffer], 'sample.pdf', { type: 'application/pdf' })
}

async function resultPdfText(blob: Blob): Promise<string> {
  const result = await processConversion('pdf-html', [new File([blob], 'result.pdf')], {})
  return result.blob.text()
}

describe('conversion registry and validation', () => {
  it('exposes all twenty unique tools', () => {
    expect(conversionTools).toHaveLength(20)
    expect(new Set(conversionTools).size).toBe(20)
  })
  it('rejects unknown tools, missing files and unsupported legacy inputs', async () => {
    await expect(processConversion('fake', [], {})).rejects.toThrow('Unknown')
    await expect(processConversion('pdf-word', [], {})).rejects.toThrow('exactly one')
    await expect(processConversion('word-pdf', [new File(['legacy'], 'old.doc')], {})).rejects.toThrow('Legacy')
    await expect(processConversion('pptx-pdf', [new File(['legacy'], 'old.ppt')], {})).rejects.toThrow('Legacy')
    await expect(processConversion('txt-pdf', [], { text: '' })).rejects.toThrow('non-empty')
  })
  it.each([{ fontSize: NaN }, { margin: 500 }, { fontSize: 0 }, { text: 123 }])('rejects invalid options %j', async options => {
    await expect(processConversion('txt-pdf', [], { text: 'Test', ...options })).rejects.toThrow()
  })
  it('reports unsupported default-font languages instead of dropping characters', async () => {
    await expect(processConversion('txt-pdf', [], { text: 'こんにちは' })).rejects.toThrow('fontFile')
  })
})

describe('text and document imports', () => {
  it.each(['txt-pdf', 'create-pdf', 'resume', 'markdown-pdf', 'html-pdf', 'csv-pdf', 'ebook-pdf'].flatMap(tool =>
    ['', ' \n\t '].map(text => ({ tool, text })),
  ))('uses uploaded text for $tool when text is blank ($text)', async ({ tool, text }) => {
    const source = new File(['Uploaded source text'], 'notes.txt')
    const result = await processConversion(tool, [source], { text })
    expect(await resultPdfText(result.blob)).toContain('Uploaded source text')
  })
  it.each(['txt-pdf', 'ebook-pdf', 'create-pdf'])('prefers non-empty supplied text for %s', async tool => {
    const source = new File(['Uploaded source text'], 'notes.txt')
    const result = await processConversion(tool, [source], { text: 'Explicit replacement text' })
    const text = await resultPdfText(result.blob)
    expect(text).toContain('Explicit replacement text')
    expect(text).not.toContain('Uploaded source text')
  })
  it.each(['text-handwriting', 'pdf-handwriting'])('uses uploaded text for %s when text is blank', async tool => {
    const { readFile } = await import('node:fs/promises')
    const font = await readFile('node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff')
    const source = tool === 'pdf-handwriting' ? await pdfFixture() : new File(['Hello editable world'], 'notes.txt')
    const result = await processConversion(tool, [source], { text: ' \n ', fontFile: new Blob([font]) })
    expect(await resultPdfText(result.blob)).toContain('Hello editable world')
  })
  it.each(['txt-pdf', 'create-pdf', 'resume', 'text-handwriting'])('uses source text for %s', async tool => {
    if (tool === 'text-handwriting') {
      const { readFile } = await import('node:fs/promises')
      const font = await readFile('node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff')
      const result = await processConversion(tool, [], { text: 'Hello handwriting', fontFile: new Blob([font]) })
      expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(1)
      expect(result.message).toContain('Typeset handwriting')
    } else {
      const result = await processConversion(tool, [], { text: 'Useful local text\nSecond line', title: 'My title' })
      expect(result.blob.type).toBe('application/pdf')
      const document = await PDFDocument.load(await result.blob.arrayBuffer())
      expect(document.getTitle()).toBe('My title')
      expect(await resultPdfText(result.blob)).toContain('Useful local text')
    }
  })
  it('reads a text file, wraps long lines, and paginates', async () => {
    const source = new File(['A'.repeat(300) + '\n' + 'Next line\n'.repeat(100)], 'notes.txt')
    const result = await processConversion('txt-pdf', [source], {})
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBeGreaterThan(1)
    expect(result.filename).toBe('notes.pdf')
  })
  it('treats HTML as inert text, removing active elements and decoding entities', async () => {
    const result = await processConversion('html-pdf', [], { text: '<html><head><title>Hidden</title></head><body><h1>Safe &amp; sound</h1><script>steal()</script><iframe src="https://example.com">remote</iframe><img src="https://example.com/pixel" onerror="bad()"><p>Kept</p></body></html>' })
    const text = await resultPdfText(result.blob)
    expect(text).toContain('Safe &amp; sound')
    expect(text).toContain('Kept')
    expect(text).not.toMatch(/steal|bad\(\)|remote|Hidden|example\.com/)
    expect(result.message).toContain('Safe HTML import')
  })
  it('imports Markdown without following image or link URLs', async () => {
    const result = await processConversion('markdown-pdf', [], { text: '# Title\n**Bold** and [link](https://example.com)\n```js\nconst answer = 42\n```' })
    const text = await resultPdfText(result.blob)
    expect(text).toContain('Title')
    expect(text).toContain('Bold and link')
    expect(text).not.toContain('example.com')
  })
  it('parses quoted CSV fields and embedded line breaks without executing formulas', async () => {
    const result = await processConversion('csv-pdf', [], { text: 'Name,Note\nAlice,"Hello, world"\nBob,"two\nlines"\nFormula,=1+2' })
    const text = await resultPdfText(result.blob)
    expect(text).toContain('Hello, world')
    expect(text).toContain('=1+2')
    await expect(processConversion('csv-pdf', [], { text: 'a,b', delimiter: 'xx' })).rejects.toThrow('delimiter')
    await expect(processConversion('csv-pdf', [], { text: 'a,"unclosed' })).rejects.toThrow('Invalid CSV')
  })
  it('imports genuine DOCX text', async () => {
    const { Document, Paragraph, Packer } = await import('docx')
    const source = await Packer.toBlob(new Document({ sections: [{ children: [new Paragraph('Imported Word paragraph')] }] }))
    const result = await processConversion('word-pdf', [new File([source], 'word.docx')], {})
    expect(await resultPdfText(result.blob)).toContain('Imported Word paragraph')
    expect(result.message).toContain('Headings, bold and italic')
  })
  it('keeps Word headings, styles, lists and tables', async () => {
    const { Document, Paragraph, Packer, TextRun, HeadingLevel, Table, TableRow, TableCell } = await import('docx')
    const cell = (text: string) => new TableCell({ children: [new Paragraph(text)] })
    const source = await Packer.toBlob(new Document({ sections: [{ children: [
      new Paragraph({ text: 'Quarterly Report', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('Revenue was '), new TextRun({ text: 'strong', bold: true }), new TextRun({ text: ' this quarter', italics: true })] }),
      new Paragraph({ text: 'First point', bullet: { level: 0 } }),
      new Table({ rows: [new TableRow({ children: [cell('Region'), cell('Total')] }), new TableRow({ children: [cell('North'), cell('1,234')] })] }),
    ] }] }))
    const result = await processConversion('word-pdf', [new File([source], 'report.docx')], {})
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer())
    const fonts = pdf.context.enumerateIndirectObjects().map(([, object]) => String((object as { get?: (key: unknown) => unknown }).get?.(PDFName.of('BaseFont')) ?? '')).filter(Boolean)
    expect(fonts).toEqual(expect.arrayContaining(['/Helvetica', '/Helvetica-Bold', '/Helvetica-Oblique']))
    const text = await resultPdfText(result.blob)
    for (const expected of ['Quarterly Report', 'strong', 'First point', 'Region', '1,234']) expect(text).toContain(expected)
  })
  it('lays out HTML tables and clickable links without fetching remote images', async () => {
    const result = await processConversion('html-pdf', [], { text: '<h2>Links</h2><p>See <a href="https://example.org/docs">the docs</a> and <a href="javascript:alert(1)">this</a>.</p><img src="https://tracker.example/p.gif"><table><tr><th>Name</th><th>Qty</th></tr><tr><td>Paper</td><td>2</td></tr></table><ol><li>One</li><li>Two</li></ol>' })
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer())
    const annots = pdf.getPage(0).node.Annots()
    expect(annots?.size()).toBe(1)
    const text = await resultPdfText(result.blob)
    for (const expected of ['Links', 'the docs', 'Name', 'Paper', '1.', '2.', 'Two']) expect(text).toContain(expected)
    expect(text).not.toContain('tracker')
  })
  it('imports XLSX sheets, cached cell text, and sheet breaks', async () => {
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    book.addWorksheet('Revenue').addRows([['Year', 'Total'], [2026, 1234]])
    book.addWorksheet('Notes').addRow(['Second sheet'])
    const bytes = new Uint8Array(await book.xlsx.writeBuffer())
    const result = await processConversion('excel-pdf', [new File([bytes], 'book.xlsx')], {})
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(2)
    const text = await resultPdfText(result.blob)
    expect(text).toContain('Revenue')
    expect(text).toContain('1234')
  })
  it('imports PPTX slide text with honest reflow warning', async () => {
    const { default: PptxGenJS } = await import('pptxgenjs')
    const deck = new PptxGenJS()
    deck.addSlide().addText('First slide', { x: 1, y: 1, w: 5, h: 1 })
    deck.addSlide().addText('Second slide', { x: 1, y: 1, w: 5, h: 1 })
    const source = await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer
    const result = await processConversion('pptx-pdf', [new File([source], 'deck.pptx')], {})
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(2)
    expect(await resultPdfText(result.blob)).toContain('Second slide')
    expect(result.message).toContain('not preserved')
  })
  it.each([undefined, '', ' \n '])('creates a PDF from actual PNG bytes with text %j', async text => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'))
    const result = await processConversion('create-pdf', [new File([png], 'red.png')], { text })
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(1)
  })
})

describe('PDF text exports', () => {
  it('produces genuine editable DOCX, respecting selected page order', async () => {
    const result = await processConversion('pdf-word', [await pdfFixture()], { pages: '2,1' })
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer())
    const xml = await archive.file('word/document.xml')!.async('string')
    expect(xml).toContain('Hello editable world')
    expect(xml.indexOf('Second page text')).toBeLessThan(xml.indexOf('Hello editable world'))
    expect(result.filename).toBe('sample.docx')
    expect(result.message).toContain('editable Word content')
  })
  it('rebuilds headings, merged paragraphs and bullets for Word', async () => {
    const document = await PDFDocument.create()
    const regular = await document.embedFont(StandardFonts.Helvetica), bold = await document.embedFont(StandardFonts.HelveticaBold)
    const page = document.addPage([595, 842])
    page.drawText('Annual Summary', { x: 50, y: 780, size: 24, font: bold })
    page.drawText('This report describes the results of the year and continues', { x: 50, y: 740, size: 11, font: regular })
    page.drawText('onto a second line of the same paragraph.', { x: 50, y: 726, size: 11, font: regular })
    page.drawText('Key results', { x: 50, y: 690, size: 15, font: bold })
    page.drawText('• Revenue grew in every region', { x: 50, y: 664, size: 11, font: regular })
    page.drawText('• Costs fell', { x: 50, y: 650, size: 11, font: regular })
    const result = await processConversion('pdf-word', [new File([await document.save()], 'summary.pdf')], {})
    const xml = await (await JSZip.loadAsync(await result.blob.arrayBuffer())).file('word/document.xml')!.async('string')
    const paragraphs = xml.split('<w:p>').slice(1).map((paragraph) => ({ style: /w:pStyle w:val="([^"]+)"/.exec(paragraph)?.[1], list: paragraph.includes('<w:numPr>'), text: [...paragraph.matchAll(/<w:t[^>]*>([^<]*)/g)].map((match) => match[1]).join('') }))
    expect(paragraphs).toEqual([
      { style: 'Heading1', list: false, text: 'Annual Summary' },
      { style: undefined, list: false, text: 'This report describes the results of the year and continues onto a second line of the same paragraph.' },
      { style: 'Heading2', list: false, text: 'Key results' },
      { style: expect.anything(), list: true, text: 'Revenue grew in every region' },
      { style: expect.anything(), list: true, text: 'Costs fell' },
    ])
  })
  it('rebuilds tables as Word tables between paragraphs', async () => {
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    const page = document.addPage([595, 842])
    page.drawText('Results by region are listed below.', { x: 50, y: 780, size: 11, font })
    const table = [['Region', 'Units', 'Growth'], ['North', '1,204', '12%'], ['South', '87', '-3%']]
    table.forEach((cells, row) => cells.forEach((text, column) => page.drawText(text, { x: 50 + column * 150, y: 750 - row * 16, size: 11, font })))
    page.drawText('All figures are provisional and may change.', { x: 50, y: 690, size: 11, font })
    const result = await processConversion('pdf-word', [new File([await document.save()], 'table.pdf')], {})
    const xml = await (await JSZip.loadAsync(await result.blob.arrayBuffer())).file('word/document.xml')!.async('string')
    const texts = (fragment: string) => [...fragment.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)/g)].map((match) => match[1])
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1)
    const tableXml = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'))
    expect(tableXml.split('<w:tr>').slice(1).map(texts)).toEqual(table)
    expect(texts(xml.slice(0, xml.indexOf('<w:tbl>')))).toEqual(['Results by region are listed below.'])
    expect(texts(xml.slice(xml.indexOf('</w:tbl>')))).toEqual(['All figures are provisional and may change.'])
    expect(result.message).toContain('tables')
  })
  it('produces a real XLSX that ExcelJS can read', async () => {
    const result = await processConversion('pdf-excel', [await pdfFixture()], {})
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await result.blob.arrayBuffer())
    expect(book.worksheets).toHaveLength(2)
    expect(book.worksheets[0].getCell('A1').text).toContain('Hello editable world')
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(['Page 1', 'Page 2'])
  })
  it('rebuilds table columns and numeric cells for PDF to Excel', async () => {
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    const page = document.addPage([595, 842])
    page.drawText('Quarterly sales report for the whole team', { x: 40, y: 780, size: 16, font })
    const table = [['Region', 'Units', 'Revenue', 'Growth'], ['North America', '1,204', '$12,450.50', '12.5%'], ['Europe', '87', '$950.00', '-3%'], ['APAC', '15,330', '$140,000.00', '40%']]
    table.forEach((cells, row) => cells.forEach((text, column) => {
      const right = [0, 240, 360, 480][column] + 40 + (column ? 80 : 0)
      const x = column ? right - font.widthOfTextAtSize(text, 11) : 40
      page.drawText(text, { x, y: 740 - row * 18, size: 11, font })
    }))
    page.drawText('Figures are unaudited.', { x: 40, y: 640, size: 11, font })
    const file = new File([new Uint8Array(await document.save()).buffer], 'sales.pdf', { type: 'application/pdf' })
    const result = await processConversion('pdf-excel', [file], {})
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await result.blob.arrayBuffer())
    const sheet = book.worksheets[0]
    const values = Array.from({ length: 6 }, (_, row) => Array.from({ length: 4 }, (_, column) => sheet.getCell(row + 1, column + 1).value ?? null))
    expect(values).toEqual([
      ['Quarterly sales report for the whole team', null, null, null],
      ['Region', 'Units', 'Revenue', 'Growth'],
      ['North America', 1204, 12450.5, 0.125],
      ['Europe', 87, 950, -0.03],
      ['APAC', 15330, 140000, 0.4],
      ['Figures are unaudited.', null, null, null],
    ])
    expect(sheet.getCell('C3').numFmt).toBe('"$"#,##0.00')
    expect(sheet.getCell('D3').numFmt).toBe('0.0%')
    expect(result.message).toContain('Table columns are rebuilt')
  })
  it('types spreadsheet cell text conservatively', () => {
    expect(cellValue('1,234.5')).toEqual({ value: 1234.5, format: '#,##0.0' })
    expect(cellValue('(42)')).toEqual({ value: -42 })
    expect(cellValue('007')).toEqual({ value: '007' })
    expect(cellValue('2024-01-05')).toEqual({ value: '2024-01-05' })
    expect(cellValue('(42')).toEqual({ value: '(42' })
    expect(cellValue('€9.99')).toEqual({ value: 9.99, format: '"€"#,##0.00' })
  })
  it('escapes PDF content in standalone HTML', async () => {
    const result = await processConversion('pdf-html', [await pdfFixture(['<script>alert(1)</script> & text'])], {})
    const html = await result.blob.text()
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it.each([undefined, '', ' \n '])('writes EPUB container, manifest, navigation and stored first mimetype; round-trips it with text %j', async text => {
    const result = await processConversion('pdf-epub', [await pdfFixture()], { title: 'A & B' })
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe('mimetype')
    expect(bytes[8]).toBe(0)
    const archive = await JSZip.loadAsync(bytes)
    expect(await archive.file('mimetype')!.async('string')).toBe('application/epub+zip')
    expect(await archive.file('EPUB/book.opf')!.async('string')).toContain('A &amp; B')
    expect(archive.file('EPUB/nav.xhtml')).toBeTruthy()
    const converted = await processConversion('ebook-pdf', [new File([result.blob], 'book.epub')], { text })
    expect(await resultPdfText(converted.blob)).toContain('Hello editable world')
  })
  it('rejects PDFs without a text layer rather than exporting empty documents', async () => {
    const document = await PDFDocument.create()
    document.addPage()
    const source = new File([new Uint8Array(await document.save()).buffer], 'scan.pdf')
    await expect(processConversion('pdf-word', [source], {})).rejects.toThrow('OCR')
    await expect(processConversion('pdf-html', [await pdfFixture()], { pages: '9' })).rejects.toThrow('between')
  })
  it.each(['pdf-jpg', 'pdf-tiff', 'extract-images', 'pdf-pptx'])('reports browser requirement for %s in Node', async tool => {
    await expect(processConversion(tool, [await pdfFixture()], {})).rejects.toThrow('browser canvas')
  })
})
