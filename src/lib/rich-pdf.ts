// Formatting-aware HTML → PDF layout used by Word to PDF and HTML to PDF.
// Keeps headings, bold/italic, lists, tables, embedded images and links. It never fetches remote resources.
import { PDFDocument, PDFFont, PDFName, PDFPage, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { Parser } from 'htmlparser2'

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string }
type Style = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'pre' | 'quote'
export type Block =
  | { kind: 'text'; style: Style; runs: Run[]; level: number; marker?: string }
  | { kind: 'table'; rows: { header: boolean; cells: Run[][] }[] }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'rule' }

const skipTags = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'select', 'button', 'canvas', 'video', 'audio'])
const breakTags = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'dd', 'dt', 'figcaption', 'address', 'figure', 'form', 'fieldset', 'details', 'summary'])

/** Parse HTML into a flat list of layout blocks. Active and remote content is ignored. */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = []
  const lists: { ordered: boolean; count: number }[] = []
  const links: string[] = []
  let bold = 0, italic = 0, code = 0, pre = 0, quote = 0, skip = 0, tableDepth = 0
  let current: Extract<Block, { kind: 'text' }> | null = null
  let table: Extract<Block, { kind: 'table' }> | null = null
  let row: { header: boolean; cells: Run[][] } | null = null
  let cell: Run[] | null = null
  const flush = () => { if (current?.runs.some((run) => run.text.trim())) blocks.push(current); current = null }
  const start = (style: Style, marker?: string) => { flush(); current = { kind: 'text', style, runs: [], level: lists.length + quote, marker } }
  const push = (text: string) => {
    if (cell) { cell.push({ text, bold: bold > 0 || row?.header || undefined, italic: italic > 0 || undefined }); return }
    if (!current) start(pre ? 'pre' : quote ? 'quote' : 'p')
    current!.runs.push({ text, bold: bold > 0 || undefined, italic: italic > 0 || undefined, code: code > 0 || undefined, link: links.at(-1) || undefined })
  }
  const parser = new Parser({
    onopentag(name, attributes) {
      if (skip || skipTags.has(name)) { skip++; return }
      if (name === 'b' || name === 'strong') bold++
      else if (name === 'i' || name === 'em' || name === 'cite') italic++
      else if (name === 'code' || name === 'kbd' || name === 'samp' || name === 'tt') code++
      else if (name === 'a') links.push(/^(https?:|mailto:)/i.test(attributes.href ?? '') ? attributes.href : '')
      else if (tableDepth > 1 || (cell && name !== 'table' && name !== 'tr' && name !== 'td' && name !== 'th')) { if (cell?.some((run) => run.text.trim()) && (name === 'br' || name === 'p' || name === 'li')) cell.push({ text: '\n' }) }
      else if (/^h[1-6]$/.test(name)) start(name as Style)
      else if (breakTags.has(name)) flush()
      else if (name === 'blockquote') { flush(); quote++ }
      else if (name === 'pre') { flush(); pre++ }
      else if (name === 'ul' || name === 'ol') { flush(); lists.push({ ordered: name === 'ol', count: Math.max(0, (Number(attributes.start) || 1) - 1) }) }
      else if (name === 'li') { const list = lists.at(-1); if (list) list.count++; start(pre ? 'pre' : 'p', list?.ordered ? `${list.count}.` : '•') }
      else if (name === 'br') push('\n')
      else if (name === 'hr') { flush(); blocks.push({ kind: 'rule' }) }
      else if (name === 'img') { if (attributes.src?.startsWith('data:')) { flush(); blocks.push({ kind: 'image', src: attributes.src, alt: attributes.alt ?? '' }) } }
      if (name === 'table') { tableDepth++; if (tableDepth === 1) { flush(); table = { kind: 'table', rows: [] } } }
      else if (tableDepth === 1 && name === 'tr') row = { header: false, cells: [] }
      else if (tableDepth === 1 && (name === 'td' || name === 'th') && row) { cell = []; if (name === 'th') row.header = true }
    },
    ontext(text) {
      if (skip) return
      const value = pre ? text : text.replace(/\s+/g, ' ')
      if (value && (pre || value !== ' ' || current || cell)) push(value)
    },
    onclosetag(name) {
      if (skip) { skip--; return }
      if (name === 'b' || name === 'strong') bold = Math.max(0, bold - 1)
      else if (name === 'i' || name === 'em' || name === 'cite') italic = Math.max(0, italic - 1)
      else if (name === 'code' || name === 'kbd' || name === 'samp' || name === 'tt') code = Math.max(0, code - 1)
      else if (name === 'a') links.pop()
      else if (name === 'table') { tableDepth = Math.max(0, tableDepth - 1); if (tableDepth === 0 && table) { if (table.rows.length) blocks.push(table); table = null } }
      else if (tableDepth === 1 && (name === 'td' || name === 'th')) { if (row && cell) row.cells.push(cell); cell = null }
      else if (tableDepth === 1 && name === 'tr') { if (table && row?.cells.length) table.rows.push(row); row = null }
      else if (cell || tableDepth) return
      else if (/^h[1-6]$/.test(name) || name === 'li' || breakTags.has(name)) flush()
      else if (name === 'blockquote') { flush(); quote = Math.max(0, quote - 1) }
      else if (name === 'pre') { flush(); pre = Math.max(0, pre - 1) }
      else if (name === 'ul' || name === 'ol') { flush(); lists.pop() }
    },
  }, { decodeEntities: true, lowerCaseTags: true })
  parser.write(html)
  parser.end()
  flush()
  return blocks
}

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont; mono: PDFFont }
const sizes: Record<Style, number> = { h1: 22, h2: 17, h3: 14, h4: 12.5, h5: 11.5, h6: 11, p: 11, quote: 11, pre: 9.5 }
const ink = rgb(0.12, 0.12, 0.14), linkInk = rgb(0.1, 0.32, 0.8), grey = rgb(0.55, 0.56, 0.58)

export type RichPdfOptions = { title?: string; author?: string; landscape?: boolean; margin?: number; fontBytes?: ArrayBuffer }
export type RichPdfResult = { bytes: Uint8Array; pages: number; skippedImages: number; replacedCharacters: number }

/** Lay out blocks onto A4 pages with real fonts, wrapping, pagination, tables, images and link annotations. */
export async function blocksToPdf(blocks: Block[], options: RichPdfOptions = {}): Promise<RichPdfResult> {
  const document = await PDFDocument.create()
  if (options.title) document.setTitle(options.title)
  if (options.author) document.setAuthor(options.author)
  let fonts: Fonts
  if (options.fontBytes) {
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    document.registerFontkit(fontkit)
    const font = await document.embedFont(options.fontBytes, { subset: true })
    fonts = { regular: font, bold: font, italic: font, boldItalic: font, mono: font }
  } else {
    const [regular, bold, italic, boldItalic, mono] = await Promise.all([StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique, StandardFonts.Courier].map((font) => document.embedFont(font)))
    fonts = { regular, bold, italic, boldItalic, mono }
  }
  const supported = options.fontBytes ? new Set(fonts.regular.getCharacterSet()) : undefined
  const encodable = new Map<string, boolean>()
  let replacedCharacters = 0, skippedImages = 0
  const clean = (text: string) => Array.from(text.replace(/\t/g, '    ').replace(/[­​-‍﻿]/g, '').replace(/ /g, ' ')).map((character) => {
    if (character === '\n') return character
    let ok = encodable.get(character)
    if (ok === undefined) {
      if (supported) ok = supported.has(character.codePointAt(0)!)
      else { try { fonts.regular.encodeText(character); ok = true } catch { ok = false } }
      encodable.set(character, ok)
    }
    if (!ok) replacedCharacters++
    return ok ? character : '?'
  }).join('')
  const pick = (run: Run, heading = false) => run.code ? fonts.mono : (run.bold || heading) && run.italic ? fonts.boldItalic : run.bold || heading ? fonts.bold : run.italic ? fonts.italic : fonts.regular

  const pageSize: [number, number] = options.landscape ? [841.89, 595.28] : [595.28, 841.89]
  const margin = options.margin ?? 56
  const contentWidth = pageSize[0] - margin * 2
  let page: PDFPage = document.addPage(pageSize)
  let y = pageSize[1] - margin
  const newPage = () => { page = document.addPage(pageSize); y = pageSize[1] - margin }
  const ensure = (height: number) => { if (y - height < margin && y < pageSize[1] - margin) newPage() }
  const annotate = (target: PDFPage, url: string, x: number, bottom: number, width: number, height: number) => {
    const annotation = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, bottom, x + width, bottom + height], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }))
    const existing = target.node.Annots()
    if (existing) existing.push(annotation)
    else target.node.set(PDFName.of('Annots'), document.context.obj([annotation]))
  }

  type Piece = { text: string; font: PDFFont; size: number; width: number; link?: string }
  /** Break runs into lines no wider than `width`. */
  const wrap = (runs: Run[], size: number, width: number, heading = false, preserve = false): Piece[][] => {
    const lines: Piece[][] = [[]]
    let used = 0
    const add = (piece: Piece) => { lines.at(-1)!.push(piece); used += piece.width }
    const breakLine = () => { lines.push([]); used = 0 }
    for (const run of runs) {
      const font = pick(run, heading)
      const fontSize = run.code && !preserve ? size * 0.92 : size
      const measure = (text: string) => font.widthOfTextAtSize(text, fontSize)
      for (const token of clean(run.text).split(preserve ? /(\n)/ : /(\n|\s+)/)) {
        if (!token) continue
        if (token === '\n') { breakLine(); continue }
        if (!preserve && /^\s+$/.test(token)) { if (used > 0) add({ text: ' ', font, size: fontSize, width: measure(' '), link: run.link }); continue }
        let rest = token
        while (rest) {
          const tokenWidth = measure(rest)
          if (used + tokenWidth <= width) { add({ text: rest, font, size: fontSize, width: tokenWidth, link: run.link }); break }
          if (used > 0 && tokenWidth <= width && !preserve) { while (lines.at(-1)!.at(-1)?.text === ' ') used -= lines.at(-1)!.pop()!.width; breakLine(); continue }
          let count = 1
          while (count < rest.length && used + measure(rest.slice(0, count + 1)) <= width) count++
          add({ text: rest.slice(0, count), font, size: fontSize, width: measure(rest.slice(0, count)), link: run.link })
          rest = rest.slice(count)
          if (rest) breakLine()
        }
      }
    }
    for (const line of lines) while (line.at(-1)?.text === ' ') line.pop()
    return lines
  }
  const drawLine = (line: Piece[], x: number, baseline: number) => {
    let span: { url: string; start: number; end: number; size: number } | undefined
    const close = () => { if (span) { page.drawLine({ start: { x: span.start, y: baseline - 1.5 }, end: { x: span.end, y: baseline - 1.5 }, thickness: 0.5, color: linkInk }); annotate(page, span.url, span.start, baseline - 2, span.end - span.start, span.size) } span = undefined }
    for (const piece of line) {
      if (span && piece.link !== span.url) close()
      if (piece.text.trim()) page.drawText(piece.text, { x, y: baseline, font: piece.font, size: piece.size, color: piece.link ? linkInk : ink })
      if (piece.link) { span ??= { url: piece.link, start: x, end: x, size: piece.size }; span.end = x + piece.width }
      x += piece.width
    }
    close()
  }

  for (const [index, block] of blocks.entries()) {
    if (block.kind === 'rule') { ensure(16); y -= 8; page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.6, color: grey }); y -= 8; continue }
    if (block.kind === 'image') {
      const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(block.src.replace(/\s/g, ''))
      if (!match) { skippedImages++; continue }
      let image
      try {
        const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
        image = match[1].toLowerCase() === 'png' ? await document.embedPng(bytes) : await document.embedJpg(bytes)
      } catch { skippedImages++; continue }
      let width = Math.min(contentWidth, image.width * 0.75), height = image.height * (width / image.width)
      const maxHeight = pageSize[1] - margin * 2
      if (height > maxHeight) { width *= maxHeight / height; height = maxHeight }
      ensure(height + 8)
      y -= height
      page.drawImage(image, { x: margin, y, width, height })
      y -= 10
      continue
    }
    if (block.kind === 'table') {
      const columns = Math.max(...block.rows.map((row) => row.cells.length))
      const columnWidth = contentWidth / columns, size = 9.5, lineHeight = size * 1.3, pad = 4
      y -= 4
      for (const row of block.rows) {
        const cells = Array.from({ length: columns }, (_, column) => wrap(row.cells[column] ?? [], size, columnWidth - pad * 2, row.header))
        const maxLines = Math.floor((pageSize[1] - margin * 2 - pad * 2) / lineHeight)
        const rowHeight = Math.min(maxLines, Math.max(...cells.map((lines) => lines.length))) * lineHeight + pad * 2
        ensure(rowHeight)
        for (const [column, lines] of cells.entries()) {
          const x = margin + column * columnWidth
          page.drawRectangle({ x, y: y - rowHeight, width: columnWidth, height: rowHeight, borderColor: grey, borderWidth: 0.5, color: row.header ? rgb(0.94, 0.95, 0.96) : undefined })
          lines.slice(0, maxLines).forEach((line, lineIndex) => drawLine(line, x + pad, y - pad - size - lineIndex * lineHeight + 2))
        }
        y -= rowHeight
      }
      y -= 10
      continue
    }
    const heading = block.style.startsWith('h')
    const size = sizes[block.style], lineHeight = size * (heading ? 1.25 : 1.45)
    const indent = block.level * 18 + (block.style === 'quote' ? 12 : 0)
    const textX = margin + indent + (block.marker ? 18 : 0)
    if (heading && index > 0) y -= size * 0.7
    const lines = wrap(block.runs, size, contentWidth - (textX - margin), heading, block.style === 'pre')
    while (lines.length > 1 && !lines[0].length) lines.shift()
    if (heading) ensure(lineHeight * Math.min(lines.length, 2) + 30)
    const top = y
    for (const [lineIndex, line] of lines.entries()) {
      ensure(lineHeight)
      y -= lineHeight
      const baseline = y + (lineHeight - size) * 0.45
      if (lineIndex === 0 && block.marker) page.drawText(block.marker, { x: margin + indent + (block.marker === '•' ? 6 : 0), y: baseline, font: fonts.regular, size, color: ink })
      drawLine(line, textX, baseline)
    }
    if (block.style === 'quote' && y < top) page.drawLine({ start: { x: margin + indent - 8, y: Math.min(top, pageSize[1] - margin) }, end: { x: margin + indent - 8, y }, thickness: 2, color: rgb(0.8, 0.82, 0.85) })
    y -= heading ? size * 0.35 : block.marker ? 2.5 : 7
  }
  return { bytes: await document.save(), pages: document.getPageCount(), skippedImages, replacedCharacters }
}
