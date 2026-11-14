import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import { parseDocument } from 'htmlparser2'
import { XMLParser } from 'fast-xml-parser'
import Papa from 'papaparse'
import { parsePageRange } from './pdf'
import { MultipageTiff } from './tiff'

export const conversionTools: string[] = [
  'word-pdf', 'txt-pdf', 'excel-pdf', 'pptx-pdf', 'html-pdf', 'create-pdf',
  'markdown-pdf', 'resume', 'csv-pdf', 'ebook-pdf', 'pdf-word', 'pdf-jpg',
  'pdf-tiff', 'extract-images', 'pdf-excel', 'pdf-pptx', 'pdf-html', 'pdf-epub',
  'pdf-handwriting', 'text-handwriting',
]

type Result = { blob: Blob; filename: string; message?: string }
type Options = Record<string, unknown>
type TextLine = { text: string; size: number; y: number; bold: boolean }
type TextPage = { number: number; text: string; rows: string[][]; lines?: TextLine[]; items?: PositionedText[] }
export type PositionedText = { str: string; x: number; y: number; width: number; size: number }

/** Rebuilds a grid from positioned text: rows by baseline, cells by gaps, columns by overlapping x-spans of multi-cell rows. */
export function tableRows(items: PositionedText[]): string[][] { return tableGrid(items).map(row => row.cells) }

type GridRow = { cells: string[]; y: number; split: boolean }
function tableGrid(items: PositionedText[]): GridRow[] {
  const visible = items.filter(item => item.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PositionedText[][] = []
  for (const item of visible) {
    const line = lines.at(-1)
    if (line && Math.abs(line[0].y - item.y) <= Math.max(2, Math.min(line[0].size, item.size) * 0.45)) line.push(item)
    else lines.push([item])
  }
  type Cell = { text: string; x0: number; x1: number }
  const rows: Cell[][] = lines.map(line => {
    const cells: Cell[] = []
    for (const item of line.sort((a, b) => a.x - b.x)) {
      const last = cells.at(-1)
      const gap = last ? item.x - last.x1 : Infinity
      if (last && gap < Math.max(1.5, item.size * 0.9)) { last.text += (gap > item.size * 0.12 && !/\s$/.test(last.text) && !/^\s/.test(item.str) ? ' ' : '') + item.str; last.x1 = Math.max(last.x1, item.x + item.width) }
      else cells.push({ text: item.str, x0: item.x, x1: item.x + item.width })
    }
    return cells.map(cell => ({ ...cell, text: cell.text.replace(/\s+/g, ' ').trim() }))
  })
  const spans: [number, number][] = []
  for (const cell of rows.filter(row => row.length > 1).flat()) spans.push([cell.x0, cell.x1])
  spans.sort((a, b) => a[0] - b[0])
  const columns: [number, number][] = []
  for (const [x0, x1] of spans) { const last = columns.at(-1); if (last && x0 <= last[1] + 1) last[1] = Math.max(last[1], x1); else columns.push([x0, x1]) }
  const ys = lines.map(line => line[0].y)
  if (columns.length < 2) return rows.map((row, index) => ({ cells: row.map(cell => cell.text), y: ys[index], split: false }))
  const distance = (centre: number, [x0, x1]: [number, number]) => centre < x0 ? x0 - centre : centre > x1 ? centre - x1 : 0
  const columnOf = (cell: Cell) => {
    const centre = (cell.x0 + cell.x1) / 2
    let best = 0
    columns.forEach((column, index) => { if (distance(centre, column) < distance(centre, columns[best])) best = index })
    return best
  }
  return rows.map((row, rowIndex) => {
    if (row.length === 1) return { cells: [row[0].text], y: ys[rowIndex], split: false }
    const grid: string[] = []
    for (const cell of row) { const index = columnOf(cell); grid[index] = grid[index] ? `${grid[index]} ${cell.text}` : cell.text }
    return { cells: Array.from({ length: columns.length }, (_, index) => grid[index] ?? ''), y: ys[rowIndex], split: true }
  })
}

/** Runs of two or more column-split rows with short cells; long cells suggest a multi-column article, not a table. */
function pageTables(items: PositionedText[]): { rows: string[][]; ys: number[] }[] {
  const tables: { rows: string[][]; ys: number[] }[] = []
  let run: GridRow[] = []
  const flush = () => {
    const cells = run.flatMap(row => row.cells.filter(Boolean))
    if (run.length >= 2 && cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length <= 40) {
      const used = run[0].cells.map((_, column) => run.some(row => row.cells[column]))
      tables.push({ rows: run.map(row => row.cells.filter((_, column) => used[column])), ys: run.map(row => row.y) })
    }
    run = []
  }
  for (const row of tableGrid(items)) { if (row.split && row.cells.filter(Boolean).length >= 2) run.push(row); else flush() }
  flush()
  return tables
}

/** Turns spreadsheet-looking text into a typed value; IDs with leading zeros and dates stay text. */
export function cellValue(text: string): { value: string | number; format?: string } {
  const trimmed = text.trim()
  const match = /^(-|\()?([$€£¥])?(-)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\))?(%)?$/.exec(trimmed)
  if (!match || /^0\d/.test(match[4]) || (match[1] === '(') !== (match[6] === ')')) return { value: text }
  const [, lead, currency, minus, whole, fraction = '', , percent] = match
  let value = Number(whole.replace(/,/g, '') + fraction)
  if (lead || minus) value = -value
  const decimals = fraction ? '.' + '0'.repeat(fraction.length - 1) : ''
  if (percent) return { value: value / 100, format: `0${decimals}%` }
  if (currency) return { value, format: `"${currency}"#,##0${decimals}` }
  return whole.includes(',') ? { value, format: `#,##0${decimals}` } : { value }
}

const textWarning = 'Text-first conversion: original layout, images, styles and complex tables are not preserved.'
const pdfWarning = 'Extracts existing PDF text only; scanned pages need OCR. Reading order and table columns are best-effort.'
const languageWarning = 'Default PDF font supports Western Latin text only. Supply fontFile (TTF/OTF/WOFF) for other characters; complex-script shaping and right-to-left layout are not supported.'

function output(bytes: ArrayBuffer | Uint8Array, type: string, filename: string, message?: string): Result {
  return { blob: new Blob([new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).buffer], { type }), filename, message }
}

function name(file?: File): string {
  return file?.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '') || 'document'
}

function optionText(options: Options, key: string, fallback = ''): string {
  const value = options[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new Error(`${key} must be text.`)
  return value
}

function numberOption(options: Options, key: string, fallback: number, min: number, max: number): number {
  const value = options[key] ?? fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}.`)
  }
  return value
}

function requireFile(files: File[], extensions: string[]): File {
  if (files.length !== 1) throw new Error('Choose exactly one input file.')
  const file = files[0]
  if (!extensions.some(extension => file.name.toLowerCase().endsWith(`.${extension}`))) {
    throw new Error(`Supported inputs: ${extensions.join(', ')}. Legacy DOC, PPT and XLS files are not supported; save as DOCX, PPTX or XLSX first.`)
  }
  return file
}

async function sourceText(files: File[], options: Options, extensions = ['txt', 'md', 'markdown']): Promise<string> {
  const text = optionText(options, 'text')
  if (text.trim() || (options.text !== undefined && !files.length)) return text
  return requireFile(files, extensions).text()
}

function htmlText(html: string): string {
  const root = parseDocument(html)
  type HtmlNode = { type: string; name?: string; data?: string; children?: HtmlNode[] }
  function visit(node: HtmlNode): string {
    if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'head'].includes(node.name ?? '')) return ''
    if (node.type === 'text') return node.data ?? ''
    const text = node.children?.map(visit).join('') ?? ''
    if (node.name === 'br') return '\n'
    if (node.name === 'td' || node.name === 'th') return `${text}\t`
    return /^(p|div|h[1-6]|li|tr|section|article|blockquote|pre)$/.test(node.name ?? '') ? `${text}\n` : text
  }
  return visit(root as HtmlNode).replace(/\n[\t ]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function markdownText(markdown: string): string {
  return htmlText(markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*```[^\n]*$/gm, '')
    .replace(/(\*\*|__|~~|`)/g, ''))
}

async function richPdf(html: string, options: Options, filename: string, note: string): Promise<Result> {
  const { blocksToPdf, htmlToBlocks } = await import('./rich-pdf')
  const blocks = htmlToBlocks(html)
  if (!blocks.length) throw new Error('Provide non-empty text or a readable text document.')
  if (options.fontFile !== undefined && !(options.fontFile instanceof Blob)) throw new Error('fontFile must be a local font File or Blob.')
  const fontBytes = options.fontFile instanceof Blob ? await options.fontFile.arrayBuffer() : undefined
  const result = await blocksToPdf(blocks, { title: optionText(options, 'title') || undefined, author: optionText(options, 'author') || undefined, landscape: options.landscape === true, fontBytes })
  const notes = [note]
  if (result.skippedImages) notes.push(`${result.skippedImages} image${result.skippedImages === 1 ? '' : 's'} in unsupported formats (such as EMF, WMF or linked images) ${result.skippedImages === 1 ? 'was' : 'were'} skipped.`)
  if (result.replacedCharacters) notes.push(`${result.replacedCharacters} character${result.replacedCharacters === 1 ? '' : 's'} the font cannot show became “?”. ${languageWarning}`)
  return output(result.bytes, 'application/pdf', filename, notes.join(' '))
}

async function makeTextPdf(text: string, options: Options, filename: string, handwriting = false, warning = ''): Promise<Result> {
  if (!text.trim()) throw new Error('Provide non-empty text or a readable text document.')
  const document = await PDFDocument.create()
  document.setTitle(optionText(options, 'title', 'Converted document'))
  document.setAuthor(optionText(options, 'author'))
  const size = numberOption(options, 'fontSize', handwriting ? 22 : 11, 6, 72)
  const margin = numberOption(options, 'margin', 48, 18, 144)
  let fontBytes: ArrayBuffer | undefined
  if (options.fontFile !== undefined) {
    if (!(options.fontFile instanceof Blob)) throw new Error('fontFile must be a local font File or Blob.')
    fontBytes = await options.fontFile.arrayBuffer()
  } else if (handwriting) {
    if (typeof window === 'undefined') throw new Error('Handwriting requires a browser or a supplied handwriting fontFile.')
    const asset = await import('@fontsource/caveat/files/caveat-latin-400-normal.woff?url')
    const response = await fetch(asset.default)
    if (!response.ok) throw new Error('Could not load the bundled handwriting font.')
    fontBytes = await response.arrayBuffer()
  }
  let font
  if (fontBytes) {
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    document.registerFontkit(fontkit)
    font = await document.embedFont(fontBytes, { subset: true })
    const supported = new Set(font.getCharacterSet())
    for (const character of text.replace(/[\r\n\t\f]/g, '')) {
      if (!supported.has(character.codePointAt(0)!)) throw new Error(`The supplied font cannot render “${character}”. Choose a font covering the source language.`)
    }
  } else {
    font = await document.embedFont(StandardFonts.Helvetica)
    try { font.encodeText(text.replace(/[\r\n\t\f]/g, '')) } catch { throw new Error(languageWarning) }
  }
  const landscape = options.landscape === true
  const pageSize: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89]
  const lineHeight = size * 1.45
  const maxWidth = pageSize[0] - margin * 2
  let page = document.addPage(pageSize)
  let cursor = pageSize[1] - margin - size
  const writeLine = (line: string) => {
    if (cursor < margin) { page = document.addPage(pageSize); cursor = pageSize[1] - margin - size }
    if (handwriting) page.drawLine({ start: { x: margin, y: cursor - 4 }, end: { x: pageSize[0] - margin, y: cursor - 4 }, color: rgb(0.8, 0.86, 0.93), thickness: 0.5 })
    page.drawText(line, { x: margin, y: cursor, font, size, color: handwriting ? rgb(0.1, 0.2, 0.4) : rgb(0.12, 0.12, 0.14) })
    cursor -= lineHeight
  }
  for (const [sectionIndex, section] of text.replace(/\r\n?/g, '\n').split('\f').entries()) {
    if (sectionIndex) { page = document.addPage(pageSize); cursor = pageSize[1] - margin - size }
    for (const paragraph of section.split('\n')) {
      let line = ''
      for (const character of paragraph.replace(/\t/g, '    ')) {
        if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) { writeLine(line); line = '' }
        line += character
      }
      writeLine(line)
    }
  }
  return output(await document.save(), 'application/pdf', filename, [warning, handwriting ? 'Typeset handwriting using a local font, not a reproduction of anyone’s handwriting.' : '', languageWarning].filter(Boolean).join(' '))
}

async function pdfEngine() {
  const engine = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined') {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    engine.GlobalWorkerOptions.workerSrc = worker.default
  }
  return engine
}

async function withPdf<ResultType>(file: File, work: (document: import('pdfjs-dist').PDFDocumentProxy, engine: Awaited<ReturnType<typeof pdfEngine>>) => Promise<ResultType>): Promise<ResultType> {
  const engine = await pdfEngine()
  const task = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  try { return await work(await task.promise, engine) } finally { await task.destroy() }
}

type WordParagraph = { text: string; heading?: 1 | 2 | 3; bold?: boolean; bullet?: boolean; pageBreakBefore?: boolean; table?: string[][] }
const bulletPattern = /^[•▪◦●○■□‣·\-–*]\s+/

/** Rebuild editable structure from positioned lines: headings by relative font size, merged paragraphs, bullets. */
export function wordParagraphs(pages: TextPage[]): WordParagraph[] {
  const weights = new Map<number, number>()
  for (const page of pages) for (const line of page.lines ?? []) { const size = Math.round(line.size * 2) / 2; weights.set(size, (weights.get(size) ?? 0) + line.text.length) }
  const body = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] || 11
  const output: WordParagraph[] = []
  for (const [pageIndex, page] of pages.entries()) {
    const lines = page.lines?.length ? page.lines : page.text.split('\n').map((text) => ({ text, size: body, y: 0, bold: false }))
    let previous: TextLine | undefined
    let current: WordParagraph | undefined
    const tables = page.items ? pageTables(page.items) : []
    const placed = new Set<number>()
    for (const line of lines) {
      const tableIndex = tables.findIndex(table => table.ys.some(y => Math.abs(y - line.y) <= 1))
      if (tableIndex >= 0) {
        if (!placed.has(tableIndex)) { placed.add(tableIndex); output.push({ text: '', table: tables[tableIndex].rows, pageBreakBefore: pageIndex > 0 && !previous ? true : undefined }) }
        previous = line
        current = undefined
        continue
      }
      const ratio = line.size / body
      const heading: WordParagraph['heading'] = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.12 && line.text.length < 120 ? 3 : undefined
      const bullet = !heading && bulletPattern.test(line.text)
      const text = bullet ? line.text.replace(bulletPattern, '') : line.text
      const gap = previous ? previous.y - line.y : 0
      const continues = current && previous && !bullet && current.heading === heading && !!current.bold === line.bold && Math.abs(line.size - previous.size) < 0.6 &&
        gap > 0 && gap <= Math.max(line.size, previous.size) * (heading ? 1.5 : 1.75) && (!current.bullet || /^[a-z]/.test(text))
      if (continues && current) current.text = /[a-z]-$/.test(current.text) && /^[a-z]/.test(text) ? current.text.slice(0, -1) + text : `${current.text} ${text}`
      else { current = { text, heading, bold: line.bold && !heading, bullet, pageBreakBefore: pageIndex > 0 && !previous ? true : undefined }; output.push(current) }
      previous = line
    }
  }
  return output
}

async function pdfText(file: File, options: Options): Promise<TextPage[]> {
  return withPdf(file, async document => {
    const pages: TextPage[] = []
    for (const pageIndex of parsePageRange(optionText(options, 'pages'), document.numPages)) {
      const page = await document.getPage(pageIndex + 1)
      try {
        const content = await page.getTextContent()
        const rows: string[][] = []
        const lines: TextLine[] = []
        const items: PositionedText[] = []
        let row: string[] = []
        let line: TextLine | undefined
        let lastY: number | undefined
        const boldFonts = new Map<string, boolean>()
        if (options.detectStyles === true) {
          await page.getOperatorList()
          for (const item of content.items) if ('fontName' in item && !boldFonts.has(item.fontName)) {
            try { const font = page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean } | undefined; boldFonts.set(item.fontName, !!font && (font.bold === true || /bold|black|heavy|semibold/i.test(font.name ?? ''))) } catch { boldFonts.set(item.fontName, false) }
          }
        }
        const endLine = () => { if (line?.text.trim()) lines.push({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }); line = undefined }
        for (const item of content.items) {
          if (!('str' in item)) continue
          const currentY = item.transform[5]
          if (lastY !== undefined && Math.abs(currentY - lastY) > 3) { if (row.length) { rows.push(row); row = [] } endLine() }
          if (item.str.trim()) {
            row.push(item.str)
            const size = Math.hypot(item.transform[2], item.transform[3]) || item.height || 0
            items.push({ str: item.str, x: item.transform[4], y: currentY, width: item.width, size: size || 10 })
            const bold = boldFonts.get(item.fontName) === true
            if (!line) line = { text: item.str, size, y: currentY, bold }
            else { line.text += (/\s$/.test(line.text) || /^\s/.test(item.str) ? '' : ' ') + item.str; line.size = Math.max(line.size, size); line.bold &&= bold }
          }
          if (item.hasEOL) { if (row.length) { rows.push(row); row = [] } endLine() }
          lastY = currentY
        }
        if (row.length) rows.push(row)
        endLine()
        pages.push({ number: pageIndex + 1, text: rows.map(cells => cells.join(' ')).join('\n'), rows, lines, items })
      } finally { page.cleanup() }
    }
    if (!pages.some(page => page.text.trim())) throw new Error('This PDF has no extractable text. Scanned/image-only PDFs require OCR, which is not included.')
    return pages
  })
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

async function epubResult(pages: TextPage[], title: string, filename: string): Promise<Result> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const chapters = pages.map((page, index) => ({ id: `chapter${index + 1}`, title: `Page ${page.number}`, text: page.text }))
  for (const chapter of chapters) zip.file(`EPUB/${chapter.id}.xhtml`, `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>${chapter.title}</title></head><body><h1>${chapter.title}</h1><p>${escapeXml(chapter.text).replace(/\n/g, '</p><p>')}</p></body></html>`)
  zip.file('EPUB/nav.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map(chapter => `<li><a href="${chapter.id}.xhtml">${chapter.title}</a></li>`).join('')}</ol></nav></body></html>`)
  zip.file('EPUB/book.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map(chapter => `<item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map(chapter => `<itemref idref="${chapter.id}"/>`).join('')}</spine></package>`)
  return output(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), 'application/epub+zip', filename, pdfWarning)
}

function xmlValues(xml: string, tag: string, paragraphTag: string): string {
  const parsed: unknown = new XMLParser({ preserveOrder: true, ignoreAttributes: true, processEntities: false }).parse(xml)
  function walk(value: unknown): string {
    if (!value || typeof value !== 'object') return ''
    if (Array.isArray(value)) return value.map(walk).join('')
    return Object.entries(value).map(([key, child]) => {
      if (key === tag) return readText(child)
      const text = walk(child)
      return key === paragraphTag ? `${text}\n` : text
    }).join('')
  }
  function readText(value: unknown): string {
    if (Array.isArray(value)) return value.map(readText).join('')
    if (value && typeof value === 'object') return Object.entries(value).map(([key, child]) => key === '#text' ? String(child) : readText(child)).join('')
    return ''
  }
  return htmlText(walk(parsed))
}

async function officeText(tool: string, file: File): Promise<string> {
  if (tool === 'word-pdf') {
    const mammoth = await import('mammoth')
    const bytes = await file.arrayBuffer()
    const result = await mammoth.extractRawText(typeof window === 'undefined' ? { buffer: Buffer.from(bytes) } : { arrayBuffer: bytes })
    return result.value
  }
  if (tool === 'excel-pdf') {
    const { default: ExcelJS } = await import('exceljs')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await file.arrayBuffer())
    return book.worksheets.map(sheet => {
      const rows: string[] = [sheet.name]
      sheet.eachRow(row => rows.push(Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).text).join(' | ')))
      return rows.join('\n')
    }).join('\f')
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slides = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((first, second) => Number(first.match(/slide(\d+)/)![1]) - Number(second.match(/slide(\d+)/)![1]))
  const presentation = zip.file('ppt/presentation.xml')
  const relationships = zip.file('ppt/_rels/presentation.xml.rels')
  if (presentation && relationships) {
    const parser = new XMLParser({ ignoreAttributes: false })
    const slideIds = parser.parse(await presentation.async('string'))['p:presentation']?.['p:sldIdLst']?.['p:sldId']
    const relationRows = parser.parse(await relationships.async('string')).Relationships?.Relationship
    const array = (value: unknown) => Array.isArray(value) ? value : value ? [value] : []
    const mapping = new Map(array(relationRows).filter(row => row['@_TargetMode'] !== 'External').map(row => [row['@_Id'], row['@_Target']]))
    const ordered = array(slideIds).map(row => mapping.get(row['@_r:id'])).map(target => typeof target === 'string' ? archivePath('ppt/presentation.xml', target) : '')
    if (ordered.length && ordered.every(path => slides.includes(path))) slides.splice(0, slides.length, ...ordered)
  }
  return (await Promise.all(slides.map(async path => xmlValues(await zip.file(path)!.async('string'), 'a:t', 'a:p')))).join('\f')
}

function archivePath(base: string, relative: string): string {
  if (/^[a-z]+:|^\/\/|[?#]/i.test(relative)) throw new Error('External archive references are not supported.')
  const pieces = (relative.startsWith('/') ? relative.slice(1) : `${base.slice(0, base.lastIndexOf('/') + 1)}${relative}`).split('/')
  const resolved: string[] = []
  for (const piece of pieces) {
    if (piece === '..') { if (!resolved.length) throw new Error('Invalid archive path.'); resolved.pop() }
    else if (piece && piece !== '.') resolved.push(piece)
  }
  return resolved.join('/')
}

async function ebookText(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith('.epub')) return file.text()
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false })
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('Invalid EPUB: missing container.')
  const roots = parser.parse(await container.async('string')).container?.rootfiles?.rootfile
  const root = Array.isArray(roots) ? roots[0] : roots
  const opfPath = root?.['@_full-path']
  if (typeof opfPath !== 'string' || !zip.file(opfPath)) throw new Error('Invalid EPUB package.')
  const book = parser.parse(await zip.file(opfPath)!.async('string')).package
  const array = (value: unknown) => Array.isArray(value) ? value : value ? [value] : []
  const manifest = new Map(array(book?.manifest?.item).map(item => [item['@_id'], item]))
  const chapters: string[] = []
  for (const ref of array(book?.spine?.itemref)) {
    const item = manifest.get(ref['@_idref'])
    if (!item || !['application/xhtml+xml', 'text/html'].includes(item['@_media-type'])) throw new Error('Unsupported EPUB spine content (only HTML chapters are supported).')
    const path = archivePath(opfPath, item['@_href'])
    const chapter = zip.file(path)
    if (!chapter) throw new Error('EPUB chapter is missing.')
    chapters.push(htmlText(await chapter.async('string')))
  }
  return chapters.join('\f')
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed.')), type, quality))
}

async function rasterConversion(tool: string, file: File, options: Options): Promise<Result> {
  if (typeof window === 'undefined') throw new Error('PDF rendering and embedded-image extraction require a browser canvas.')
  const quality = numberOption(options, 'quality', 0.9, 0, 1)
  const defaultScale = ['pdf-jpg', 'pdf-tiff'].includes(tool) ? 150 / 72 : 1.5
  const scale = options.dpi === undefined ? numberOption(options, 'scale', defaultScale, 0.25, 4) : numberOption(options, 'dpi', 150, 72, 600) / 72
  const tiffMode = tool === 'pdf-tiff' ? optionText(options, 'mode', 'multipage') : ''
  if (tool === 'pdf-tiff' && !['multipage', 'zip'].includes(tiffMode)) throw new Error('TIFF output must be multipage or zip.')
  return withPdf(file, async (document, engine) => {
    const zip = new JSZip()
    const tiff = new MultipageTiff()
    const results: { blob: Blob; filename: string; width: number; height: number; notes?: string }[] = []
    const used = new Set<string>()
    for (const pageIndex of parsePageRange(optionText(options, 'pages'), document.numPages)) {
      const page = await document.getPage(pageIndex + 1)
      const canvas = window.document.createElement('canvas')
      try {
        if (tool === 'extract-images') {
          const operators = await page.getOperatorList()
          for (const [index, operation] of operators.fnArray.entries()) {
            if (![engine.OPS.paintImageXObject, engine.OPS.paintInlineImageXObject].includes(operation)) continue
            const argument = operators.argsArray[index][0]
            const key = typeof argument === 'string' ? `${pageIndex}:${argument}` : `${pageIndex}:${index}`
            if (used.has(key)) continue
            used.add(key)
            const image = typeof argument === 'string' ? await new Promise<any>((resolve, reject) => {
              try { (argument.startsWith('g_') ? page.commonObjs : page.objs).get(argument, resolve) } catch (error) { reject(error) }
            }) : argument
            if (!image || !image.width || !image.height) continue
            if (image.width * image.height > 16_000_000) throw new Error('An embedded image exceeds the 16-megapixel safety limit.')
            canvas.width = image.width; canvas.height = image.height
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Cannot create a browser canvas.')
            if (image.bitmap) context.drawImage(image.bitmap, 0, 0)
            else {
              const pixels = context.createImageData(image.width, image.height)
              const count = image.width * image.height
              if (![engine.ImageKind.RGBA_32BPP, engine.ImageKind.RGB_24BPP, engine.ImageKind.GRAYSCALE_1BPP].includes(image.kind)) throw new Error('Unsupported embedded-image pixel format.')
              for (let pixel = 0; pixel < count; pixel++) {
                const offset = pixel * 4
                if (image.kind === engine.ImageKind.RGBA_32BPP) pixels.data.set(image.data.subarray(offset, offset + 4), offset)
                else if (image.kind === engine.ImageKind.RGB_24BPP) { pixels.data.set(image.data.subarray(pixel * 3, pixel * 3 + 3), offset); pixels.data[offset + 3] = 255 }
                else {
                  const column = pixel % image.width
                  const byteIndex = Math.floor(pixel / image.width) * Math.ceil(image.width / 8) + Math.floor(column / 8)
                  const shade = image.data[byteIndex] & (128 >> (column % 8)) ? 255 : 0
                  pixels.data.set([shade, shade, shade, 255], offset)
                }
              }
              context.putImageData(pixels, 0, 0)
            }
            const blob = await canvasBlob(canvas, 'image/png')
            zip.file(`page-${pageIndex + 1}-image-${used.size}.png`, await blob.arrayBuffer())
          }
        } else {
          const viewport = page.getViewport({ scale })
          const adjusted = Math.min(scale, scale * Math.sqrt(16_000_000 / (Math.ceil(viewport.width) * Math.ceil(viewport.height))))
          const bounded = page.getViewport({ scale: adjusted })
          canvas.width = Math.max(1, Math.floor(bounded.width)); canvas.height = Math.max(1, Math.floor(bounded.height))
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Cannot create a browser canvas.')
          await page.render({ canvas, canvasContext: context, viewport: bounded, background: '#ffffff' }).promise
          let blob: Blob
          const extension = tool === 'pdf-tiff' ? 'tiff' : tool === 'pdf-pptx' ? 'png' : 'jpg'
          if (tool === 'pdf-tiff') {
            const encoder = tiffMode === 'multipage' ? tiff : new MultipageTiff()
            encoder.addPage(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, adjusted * 72)
            if (tiffMode === 'multipage') continue
            blob = encoder.toBlob()
          } else blob = await canvasBlob(canvas, tool === 'pdf-pptx' ? 'image/png' : 'image/jpeg', quality)
          let notes = ''
          if (tool === 'pdf-pptx') {
            const content = await page.getTextContent()
            notes = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
          }
          results.push({ blob, filename: `${name(file)}-page-${pageIndex + 1}-${results.length + 1}.${extension}`, width: bounded.width, height: bounded.height, notes })
        }
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup() }
    }
    if (tool === 'pdf-tiff' && tiffMode === 'multipage') return { blob: tiff.toBlob(), filename: `${name(file)}.tiff`, message: 'Multipage uncompressed TIFF in selected page order. Raster output; up to 16 megapixels per page and 256 MB total. Large pages may render below the requested DPI.' }
    if (tool === 'pdf-pptx') {
      const { default: PptxGenJS } = await import('pptxgenjs')
      const deck = new PptxGenJS()
      deck.layout = 'LAYOUT_WIDE'
      for (const result of results) {
        const factor = Math.min(13.333333 / result.width, 7.5 / result.height)
        const width = result.width * factor
        const height = result.height * factor
        const slide = deck.addSlide()
        const bytes = new Uint8Array(await result.blob.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        slide.addImage({ data: `image/png;base64,${btoa(binary)}`, x: (13.333333 - width) / 2, y: (7.5 - height) / 2, w: width, h: height })
        if (result.notes) slide.addNotes(result.notes)
      }
      return output(await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', `${name(file)}.pptx`, 'Each PDF page is a sharp image on its own slide, and the page text is copied into the speaker notes so it stays searchable and copyable. Slide objects are not editable; scanned pages need OCR first.')
    }
    if (tool === 'extract-images') {
      if (!Object.keys(zip.files).length) throw new Error('No supported embedded raster images were found. Vector artwork and image masks are not extracted.')
    } else {
      if (results.length === 1 && tiffMode !== 'zip') return { blob: results[0].blob, filename: results[0].filename }
      for (const result of results) zip.file(result.filename, await result.blob.arrayBuffer())
    }
    return output(await zip.generateAsync({ type: 'uint8array' }), 'application/zip', `${name(file)}-${tool === 'extract-images' ? 'embedded-images' : 'pages'}.zip`, tool === 'extract-images' ? 'Embedded raster images only; excludes vector artwork, masks and page backgrounds. Images may be decoded to RGB.' : 'One image per selected page; multiple pages are delivered in a ZIP, not a multi-page TIFF.')
  })
}

/** Local-only conversions. Text tools accept options.text, or one source file.
 * Shared options: text/title/author/pages, fontSize (6–72), margin (18–144),
 * landscape, fontFile (local TTF/OTF/WOFF). Rendering: dpi (72–600, default 150),
 * legacy scale (.25–4), quality (0–1). TIFF mode: multipage (default) or zip.
 * PDF text exports require a text layer; Office imports deliberately reflow text.
 */
export async function processConversion(tool: string, files: File[], options: Options): Promise<Result> {
  if (!conversionTools.includes(tool)) throw new Error(`Unknown conversion tool: ${tool}`)
  if (['pdf-jpg', 'pdf-tiff', 'extract-images', 'pdf-pptx'].includes(tool)) return rasterConversion(tool, requireFile(files, ['pdf']), options)
  if (tool.startsWith('pdf-')) {
    const file = requireFile(files, ['pdf'])
    const pages = tool === 'pdf-handwriting' && optionText(options, 'text').trim() ? [{ number: 1, text: optionText(options, 'text'), rows: [] }] : await pdfText(file, tool === 'pdf-word' ? { ...options, detectStyles: true } : options)
    if (tool === 'pdf-handwriting') return makeTextPdf(pages.map(page => page.text).join('\f'), options, `${name(file)}-handwriting.pdf`, true, pdfWarning)
    if (tool === 'pdf-word') {
      const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx')
      const children = wordParagraphs(pages).flatMap(({ text, heading, bold, bullet, pageBreakBefore, table }) => table ? [
        ...(pageBreakBefore ? [new Paragraph({ pageBreakBefore: true })] : []),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: table.map((cells, rowIndex) => new TableRow({ tableHeader: rowIndex === 0, children: cells.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: rowIndex === 0 || undefined })] })] })) })) }),
        new Paragraph({}),
      ] : [new Paragraph({
        heading: heading ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading - 1] : undefined,
        bullet: bullet ? { level: 0 } : undefined, pageBreakBefore, children: [new TextRun({ text, bold: bold || undefined })],
      })])
      const document = new Document({ sections: [{ children }] })
      return { blob: await Packer.toBlob(document), filename: `${name(file)}.docx`, message: `${pdfWarning} Headings, paragraphs, bold text, bullet lists and tables are rebuilt as editable Word content; it is not a facsimile of the page layout.` }
    }
    if (tool === 'pdf-excel') {
      const { default: ExcelJS } = await import('exceljs')
      const book = new ExcelJS.Workbook()
      const used = new Set<string>()
      for (const page of pages) {
        let title = `Page ${page.number}`
        for (let copy = 2; used.has(title); copy++) title = `Page ${page.number} (${copy})`
        used.add(title)
        const sheet = book.addWorksheet(title)
        const grid = page.items ? tableRows(page.items) : page.rows
        const widths: number[] = []
        grid.forEach((cells, rowIndex) => cells.forEach((text, columnIndex) => {
          if (!text) return
          const cell = sheet.getCell(rowIndex + 1, columnIndex + 1)
          const { value, format } = cellValue(text)
          cell.value = value
          if (format) cell.numFmt = format
          widths[columnIndex] = Math.max(widths[columnIndex] ?? 8, Math.min(60, text.length + 2))
        }))
        widths.forEach((width, index) => { if (width) sheet.getColumn(index + 1).width = width })
      }
      return output(new Uint8Array(await book.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name(file)}.xlsx`, `${pdfWarning} Table columns are rebuilt from text positions and numbers, percentages and currency become real numeric cells. One sheet per page; merged cells and formulas are not recreated.`)
    }
    if (tool === 'pdf-html') return { blob: new Blob([`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeXml(optionText(options, 'title', name(file)))}</title></head><body>${pages.map(page => `<section><h2>Page ${page.number}</h2><pre style="white-space:pre-wrap">${escapeXml(page.text)}</pre></section>`).join('')}</body></html>`], { type: 'text/html' }), filename: `${name(file)}.html`, message: pdfWarning }
    if (tool === 'pdf-epub') return epubResult(pages, optionText(options, 'title', name(file)), `${name(file)}.epub`)
  }
  if (tool === 'word-pdf') {
    const file = requireFile(files, ['docx'])
    const mammoth = await import('mammoth')
    const bytes = await file.arrayBuffer()
    const converted = await mammoth.convertToHtml(typeof window === 'undefined' ? { buffer: Buffer.from(bytes) } : { arrayBuffer: bytes })
    return richPdf(converted.value, options, `${name(file)}.pdf`, 'Headings, bold and italic text, lists, tables, images and links are kept. Page layout such as columns, headers, footers and exact fonts is approximated.')
  }
  if (['word-pdf', 'excel-pdf', 'pptx-pdf'].includes(tool)) {
    const file = requireFile(files, tool === 'word-pdf' ? ['docx'] : tool === 'excel-pdf' ? ['xlsx'] : ['pptx'])
    return makeTextPdf(await officeText(tool, file), options, `${name(file)}.pdf`, false, textWarning)
  }
  if (tool === 'create-pdf' && files.length && !optionText(options, 'text').trim() && files.every(file => /\.(png|jpe?g|jfif|webp|gif|bmp|tiff?|avif|heic|heif|svg)$/i.test(file.name))) {
    const document = await PDFDocument.create()
    const { embedImageFile } = await import('./image-input')
    for (const file of files) for (const image of await embedImageFile(document, new Uint8Array(await file.arrayBuffer()), file.name)) {
      const page = document.addPage([595.28, 841.89])
      const scale = Math.min(499 / image.width, 745 / image.height)
      image.draw(page, (595.28 - image.width * scale) / 2, (841.89 - image.height * scale) / 2, image.width * scale, image.height * scale)
    }
    return output(await document.save(), 'application/pdf', 'created.pdf')
  }
  let text: string
  let warning = ''
  if (tool === 'ebook-pdf') {
    text = optionText(options, 'text').trim() ? optionText(options, 'text') : await ebookText(requireFile(files, ['epub', 'txt']))
    warning = `${textWarning} DRM-protected EPUB, MOBI and AZW are not supported.`
  } else if (tool === 'csv-pdf') {
    const csv = await sourceText(files, options, ['csv', 'tsv', 'txt'])
    const delimiter = optionText(options, 'delimiter')
    if (delimiter && (delimiter.length !== 1 || /["\r\n]/.test(delimiter))) throw new Error('delimiter must be one non-quote, non-newline character.')
    const parsed = Papa.parse<string[]>(csv, { delimiter, skipEmptyLines: true })
    if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`)
    text = parsed.data.map(row => row.join(' | ')).join('\n')
    warning = 'CSV cells are rendered as delimited text, not a styled spreadsheet. Formulas are never executed.'
  } else if (tool === 'html-pdf') {
    const html = await sourceText(files, options, ['html', 'htm', 'txt'])
    if (htmlText(html).trim()) return richPdf(html, options, `${name(files[0])}.pdf`, 'Safe HTML import: headings, text styles, lists, tables, links and embedded images are kept; scripts, styles and remote resources are ignored, and CSS layout is not applied.')
    text = ''
    warning = 'Safe text-only HTML import: scripts, styles, embedded content and external resources are ignored; CSS layout and images are not rendered.'
  } else if (tool === 'markdown-pdf') {
    text = markdownText(await sourceText(files, options))
    warning = 'Markdown becomes reflowed plain text; code, lists and headings retain text, not full Markdown styling.'
  } else text = await sourceText(files, options)
  return makeTextPdf(text, options, `${name(files[0])}${tool === 'text-handwriting' ? '-handwriting' : ''}.pdf`, tool === 'text-handwriting', warning)
}
