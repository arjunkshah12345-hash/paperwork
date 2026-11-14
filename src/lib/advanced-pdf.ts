import {
  PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField,
  StandardFonts, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState, rgb,
  type PDFEmbeddedPage, type PDFPage,
} from 'pdf-lib'
import JSZip from 'jszip'
import { textRunSpans } from './text-runs'
import { parsePageRange } from './pdf'

export const advancedTools: string[] = [
  'alternate', 'analyze', 'split-text', 'split-bookmarks', 'split-half', 'split-size',
  'delete-pages', 'extract-pages', 'flip', 'nup', 'crop', 'zip', 'sign', 'fill-form',
  'bates', 'headers', 'flatten', 'invert', 'repair', 'redact',
]

type Options = Record<string, unknown>
type Result = { blob: Blob; filename: string; message?: string }
type Box = { x: number; y: number; width: number; height: number }

function number(options: Options, key: string, fallback: number, min = 0, max = 14400): number {
  const value = options[key] ?? fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a finite number between ${min} and ${max}.`)
  }
  return value
}

function integer(options: Options, key: string, fallback: number, min: number, max: number): number {
  const value = number(options, key, fallback, min, max)
  if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer.`)
  return value
}

function string(options: Options, key: string, fallback = ''): string {
  const value = options[key] ?? fallback
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`)
  return value
}

function choice(options: Options, key: string, fallback: string, choices: string[]): string {
  const value = string(options, key, fallback)
  if (!choices.includes(value)) throw new Error(`${key} must be ${choices.join(' or ')}.`)
  return value
}

function requiredText(options: Options): string {
  const text = string(options, 'text')
  if (!text.trim()) throw new Error('Enter the text first.')
  return text
}

function name(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'document'
}

function blob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  return new Blob([new Uint8Array(bytes).buffer], { type })
}

async function save(document: PDFDocument, filename: string, message?: string): Promise<Result> {
  return { blob: blob(await document.save()), filename, ...(message ? { message } : {}) }
}

async function load(file: File): Promise<PDFDocument> {
  try {
    const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
    if (!document.getPageCount()) throw new Error('Empty PDF')
    return document
  } catch {
    throw new Error(`Cannot open “${file.name}”. Choose a valid, unencrypted PDF with at least one page.`)
  }
}

async function subset(document: PDFDocument, indices: number[]): Promise<PDFDocument> {
  if (!indices.length) throw new Error('The result must contain at least one page.')
  const output = await PDFDocument.create()
  for (const page of await output.copyPages(document, indices)) output.addPage(page)
  return output
}

async function archive(parts: { filename: string; bytes: Uint8Array }[], filename: string): Promise<Result> {
  const zip = new JSZip()
  parts.forEach((part) => zip.file(part.filename, part.bytes))
  return { blob: blob(await zip.generateAsync({ type: 'uint8array' }), 'application/zip'), filename }
}

async function split(document: PDFDocument, groups: number[][], base: string): Promise<Result> {
  const parts = []
  for (const [index, group] of groups.entries()) {
    if (group.length) parts.push({ filename: `${base}-${String(index + 1).padStart(3, '0')}.pdf`, bytes: await (await subset(document, group)).save() })
  }
  return archive(parts, `${base}-split.zip`)
}

async function pdfJs() {
  const [engine, worker] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  engine.GlobalWorkerOptions.workerSrc = worker.default
  return engine
}

async function withReader<T>(file: File, action: (document: import('pdfjs-dist').PDFDocumentProxy) => Promise<T>): Promise<T> {
  const engine = await pdfJs()
  const task = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    return await action(await task.promise)
  } finally {
    await task.destroy()
  }
}

async function splitByContent(tool: string, file: File, document: PDFDocument, selected: number[], options: Options): Promise<Result> {
  const boundaries = await withReader(file, async (reader) => {
    const starts = new Set<number>()
    if (tool === 'split-text') {
      const needle = requiredText(options)
      const mode = choice(options, 'mode', 'insensitive', ['insensitive', 'sensitive'])
      for (const index of selected) {
        const page = await reader.getPage(index + 1)
        try {
          const content = await page.getTextContent()
          const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ')
          if ((mode === 'sensitive' ? text : text.toLowerCase()).includes(mode === 'sensitive' ? needle : needle.toLowerCase())) starts.add(index)
        } finally {
          page.cleanup()
        }
      }
      if (!starts.size) throw new Error('No pages contain that embedded text. Scanned pages require OCR.')
    } else {
      const outline = await reader.getOutline()
      const visit = async (items: NonNullable<typeof outline>): Promise<void> => {
        for (const item of items) {
          const destination = typeof item.dest === 'string' ? await reader.getDestination(item.dest) : item.dest
          if (destination?.length) {
            const target: unknown = destination[0]
            const index = typeof target === 'number' ? target :
              target && typeof target === 'object' && 'num' in target && 'gen' in target ?
                await reader.getPageIndex(target as { num: number; gen: number }) : -1
            if (Number.isInteger(index) && index >= 0 && index < reader.numPages) starts.add(index)
          }
          await visit(item.items)
        }
      }
      await visit(outline ?? [])
      if (!starts.size) throw new Error('This PDF has no bookmarks with internal page destinations.')
    }
    return starts
  })
  const groups: number[][] = []
  for (const index of selected) {
    if (!groups.length || boundaries.has(index)) groups.push([])
    groups[groups.length - 1].push(index)
  }
  return split(document, groups, name(file))
}

function angle(page: PDFPage): number {
  const value = ((page.getRotation().angle % 360) + 360) % 360
  if (value % 90) throw new Error('Only page rotations that are multiples of 90 are supported.')
  return value
}

function visibleBox(page: PDFPage): Box {
  const crop = page.getCropBox()
  const media = page.getMediaBox()
  const x = Math.max(crop.x, media.x)
  const y = Math.max(crop.y, media.y)
  const width = Math.min(crop.x + crop.width, media.x + media.width) - x
  const height = Math.min(crop.y + crop.height, media.y + media.height) - y
  if (width <= 0 || height <= 0) throw new Error('The page has an invalid visible box.')
  return { x, y, width, height }
}

async function embedded(output: PDFDocument, page: PDFPage): Promise<PDFEmbeddedPage> {
  const box = visibleBox(page)
  return output.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height })
}

function displaySize(page: PDFPage): { width: number; height: number } {
  const box = visibleBox(page)
  return angle(page) % 180 ? { width: box.height, height: box.width } : box
}

function drawVisible(target: PDFPage, source: PDFPage, asset: PDFEmbeddedPage, box: Box) {
  const size = displaySize(source)
  const scale = Math.min(box.width / size.width, box.height / size.height)
  const rotation = angle(source)
  let x = box.x + (box.width - size.width * scale) / 2
  let y = box.y + (box.height - size.height * scale) / 2
  if (rotation === 90) y += asset.width * scale
  if (rotation === 180) { x += asset.width * scale; y += asset.height * scale }
  if (rotation === 270) x += asset.height * scale
  target.drawPage(asset, { x, y, xScale: scale, yScale: scale, rotate: degrees(-rotation) })
}

async function imposition(tool: string, document: PDFDocument, selected: number[], options: Options): Promise<PDFDocument> {
  const output = await PDFDocument.create()
  const axis = choice(options, 'axis', 'horizontal', ['horizontal', 'vertical'])
  if (tool === 'nup') {
    const columns = integer(options, 'columns', 2, 1, 16)
    const width = number(options, 'width', 595.28, 1)
    const height = number(options, 'height', 841.89, 1)
    const margin = number(options, 'margin', 18)
    if (2 * margin >= Math.min(width, height)) throw new Error('margin leaves no usable sheet area.')
    const first = displaySize(document.getPage(selected[0]))
    const rows = Math.max(1, Math.min(16, Math.floor((height - 2 * margin) / ((width - 2 * margin) / columns * first.height / first.width))))
    const cellWidth = (width - 2 * margin) / columns
    const cellHeight = (height - 2 * margin) / rows
    let sheet: PDFPage | undefined
    for (const [index, pageIndex] of selected.entries()) {
      if (index % (columns * rows) === 0) sheet = output.addPage([width, height])
      const slot = index % (columns * rows)
      const source = document.getPage(pageIndex)
      drawVisible(sheet!, source, await embedded(output, source), {
        x: margin + (slot % columns) * cellWidth,
        y: height - margin - (Math.floor(slot / columns) + 1) * cellHeight,
        width: cellWidth, height: cellHeight,
      })
    }
  } else {
    const selectedSet = new Set(selected)
    for (const [index, source] of document.getPages().entries()) {
      if (!selectedSet.has(index)) {
        output.addPage((await output.copyPages(document, [index]))[0])
        continue
      }
      const size = displaySize(source)
      const target = output.addPage([size.width, size.height])
      const asset = await embedded(output, source)
      target.pushOperators(pushGraphicsState(), axis === 'horizontal' ?
        concatTransformationMatrix(-1, 0, 0, 1, size.width, 0) : concatTransformationMatrix(1, 0, 0, -1, 0, size.height))
      drawVisible(target, source, asset, { x: 0, y: 0, ...size })
      target.pushOperators(popGraphicsState())
    }
  }
  return output
}

async function fillForm(document: PDFDocument, options: Options): Promise<void> {
  let values: unknown
  try { values = JSON.parse(string(options, 'formValues')) } catch { throw new Error('formValues must be a JSON object string.') }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('formValues must be a JSON object string.')
  const entries = Object.entries(values)
  if (!entries.length) throw new Error('Provide at least one form field value.')
  const form = document.getForm()
  for (const [key, value] of entries) {
    const field = form.getFieldMaybe(key)
    if (!field) throw new Error(`Unknown form field “${key}”.`)
    if (field instanceof PDFCheckBox) {
      if (typeof value !== 'boolean') throw new Error(`“${key}” requires a boolean.`)
      if (value) field.check(); else field.uncheck()
    } else if (field instanceof PDFTextField) {
      if (typeof value !== 'string') throw new Error(`“${key}” requires a string.`)
      field.setText(value)
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
      const choices = typeof value === 'string' ? [value] : value
      if (!Array.isArray(choices) || !choices.length || choices.some((item) => typeof item !== 'string' || !field.getOptions().includes(item))) {
        throw new Error(`“${key}” requires existing option names.`)
      }
      if (choices.length > 1 && (field instanceof PDFRadioGroup || !field.isMultiselect())) throw new Error(`“${key}” permits only one selection.`)
      field.clear()
      if (field instanceof PDFRadioGroup) field.select(choices[0]); else field.select(choices)
    } else {
      throw new Error(`Unsupported form field “${key}”. Signature fields cannot be cryptographically signed.`)
    }
  }
  try { form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica)) } catch {
    throw new Error('Form appearances support Latin text only with the bundled font.')
  }
}

async function annotate(tool: string, document: PDFDocument, selected: number[], file: File | undefined, options: Options): Promise<void> {
  const image: Blob | undefined = file ?? (tool === 'sign' && options.signatureImage instanceof Blob ? options.signatureImage : undefined)
  const align = tool === 'sign' ? choice(options, 'align', 'right', ['left', 'center', 'right']) : 'left'
  const alignX = (box: { x: number; width: number }, width: number) => align === 'right' ? box.x + box.width - margin - width : align === 'center' ? box.x + (box.width - width) / 2 : box.x + margin
  const fontSize = number(options, 'fontSize', tool === 'sign' ? 28 : 11, 1, 300)
  const margin = number(options, 'margin', 24)
  const color = string(options, 'color', '#27272a')
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('color must be in #RRGGBB format.')
  const ink = rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255)
  const rotation = number(options, 'rotation', 0, -360, 360)
  const mode = tool === 'headers' ? choice(options, 'mode', 'header', ['header', 'footer', 'both']) : 'footer'
  const start = integer(options, 'startNumber', 1, 0, Number.MAX_SAFE_INTEGER - selected.length)
  const prefix = string(options, 'prefix')
  const text = tool === 'bates' ? '' : tool === 'sign' && image ? '' : requiredText(options)
  const font = await document.embedFont(tool === 'sign' ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica)
  let signature
  if (tool === 'sign' && image) {
    const bytes = new Uint8Array(await image.arrayBuffer())
    try {
      signature = bytes[0] === 0x89 && bytes[1] === 0x50 ? await document.embedPng(bytes) :
        bytes[0] === 0xff && bytes[1] === 0xd8 ? await document.embedJpg(bytes) : undefined
    } catch { throw new Error('Choose a valid PNG or JPEG signature image.') }
    if (!signature) throw new Error('Choose a valid PNG or JPEG signature image.')
  }
  for (const [index, pageIndex] of selected.entries()) {
    const page = document.getPage(pageIndex)
    const box = visibleBox(page)
    if (signature) {
      const maxWidth = number(options, 'width', 160, 1)
      const maxHeight = number(options, 'height', 60, 1)
      const scale = Math.min(maxWidth / signature.width, maxHeight / signature.height)
      if (margin + signature.width * scale > box.width || margin + signature.height * scale > box.height) throw new Error('The signature does not fit within the page.')
      page.drawImage(signature, { x: alignX(box, signature.width * scale), y: box.y + margin, width: signature.width * scale, height: signature.height * scale, rotate: degrees(rotation) })
    } else {
      const label = tool === 'bates' ? `${prefix}${String(start + index).padStart(6, '0')}` :
        text.replaceAll('{page}', String(pageIndex + 1)).replaceAll('{total}', String(document.getPageCount()))
      let labelWidth: number
      try { labelWidth = Math.max(...label.split('\n').map((line) => font.widthOfTextAtSize(line, fontSize))) } catch {
        throw new Error('The bundled annotation fonts support Latin text only.')
      }
      const labelHeight = label.split('\n').length * fontSize * 1.2
      if (2 * margin + labelWidth > box.width || 2 * margin + labelHeight > box.height) throw new Error('The text and margin do not fit within the page.')
      const positions = mode === 'both' ? ['header', 'footer'] : [mode]
      for (const position of positions) page.drawText(label, {
        x: alignX(box, labelWidth), y: position === 'header' ? box.y + box.height - margin - fontSize : box.y + margin + labelHeight - fontSize,
        font, size: fontSize, color: ink, lineHeight: fontSize * 1.2, rotate: degrees(rotation),
      })
    }
  }
}

async function raster(tool: string, file: File, options: Options): Promise<Result> {
  if (typeof window === 'undefined') throw new Error(`${tool} rasterization requires a browser with canvas support.`)
  const treatment = tool === 'invert' ? choice(options, 'mode', 'invert', ['invert', 'sepia', 'grayscale']) : ''
  const output = await PDFDocument.create()
  let matches = 0
  await withReader(file, async (reader) => {
    const selected = new Set(parsePageRange(string(options, 'pages'), reader.numPages))
    const mode = tool === 'redact' ? choice(options, 'mode', 'text', ['text', 'rectangle', 'pages']) : ''
    const needle = mode === 'text' ? requiredText(options).toLowerCase() : ''
    for (let index = 0; index < reader.numPages; index++) {
      const page = await reader.getPage(index + 1)
      let canvas: HTMLCanvasElement | undefined
      try {
        const unit = page.getViewport({ scale: 1 })
        if (![unit.width, unit.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('The page has invalid dimensions.')
        const scale = Math.min(2, 4096 / unit.width, 4096 / unit.height, Math.sqrt(8_000_000 / (unit.width * unit.height)))
        const viewport = page.getViewport({ scale })
        canvas = window.document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        const context = canvas.getContext('2d', { willReadFrequently: tool === 'invert' })
        if (!context) throw new Error('Your browser could not create a canvas.')
        await page.render({ canvas, canvasContext: context, viewport, background: 'white' }).promise
        if (selected.has(index) && tool === 'invert') {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          for (let offset = 0; offset < pixels.data.length; offset += 4) {
            const red = pixels.data[offset]
            const green = pixels.data[offset + 1]
            const blue = pixels.data[offset + 2]
            if (treatment === 'grayscale') {
              const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
              pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = luminance
            } else if (treatment === 'sepia') {
              pixels.data[offset] = Math.min(255, 0.393 * red + 0.769 * green + 0.189 * blue)
              pixels.data[offset + 1] = Math.min(255, 0.349 * red + 0.686 * green + 0.168 * blue)
              pixels.data[offset + 2] = Math.min(255, 0.272 * red + 0.534 * green + 0.131 * blue)
            } else {
              pixels.data[offset] = 255 - red
              pixels.data[offset + 1] = 255 - green
              pixels.data[offset + 2] = 255 - blue
            }
          }
          context.putImageData(pixels, 0, 0)
        }
        if (selected.has(index) && tool === 'redact') {
          context.fillStyle = '#000000'
          if (mode === 'pages') {
            context.fillRect(0, 0, canvas.width, canvas.height)
            matches++
          } else if (mode === 'rectangle') {
            const margin = number(options, 'margin', 24)
            const width = number(options, 'width', 120, 1)
            const height = number(options, 'height', 40, 1)
            if (margin + width > unit.width || margin + height > unit.height) throw new Error('The redaction rectangle must fit inside the visible page.')
            context.fillRect(margin * scale, margin * scale, width * scale, height * scale)
            matches++
          } else {
            const content = await page.getTextContent()
            const items = content.items.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item)
            const runs = items.map((item) => {
              const [horizontalX, horizontalY, , , originX, originY] = item.transform
              const length = Math.hypot(horizontalX, horizontalY) || 1
              return {
                text: item.str.toLowerCase(),
                start: [originX, originY] as [number, number],
                end: [originX + horizontalX / length * item.width, originY + horizontalY / length * item.width] as [number, number],
                height: item.height,
                breakAfter: item.hasEOL,
              }
            })
            const hidden = new Set<(typeof items)[number]>()
            for (const joinAdjacent of [false, true]) {
              const { text, spans } = textRunSpans(runs, joinAdjacent)
              for (let start = text.indexOf(needle); start !== -1; start = text.indexOf(needle, start + 1)) {
                matches++
                for (const span of spans) if (span.start < start + needle.length && span.end > start) hidden.add(items[span.index])
              }
            }
            for (const item of hidden) {
              const [horizontalX, horizontalY, verticalX, verticalY, originX, originY] = item.transform
              const horizontalLength = Math.hypot(horizontalX, horizontalY) || 1
              const verticalLength = Math.hypot(verticalX, verticalY) || item.height || 1
              const style = content.styles[item.fontName]
              const ascent = Math.max(1, style?.ascent ?? 1)
              const descent = Math.min(-0.35, style?.descent ?? -0.35)
              const points = [0, 1].flatMap((along) => [descent, ascent].map((across) => viewport.convertToViewportPoint(
                originX + along * horizontalX / horizontalLength * item.width + across * verticalX / verticalLength * item.height,
                originY + along * horizontalY / horizontalLength * item.width + across * verticalY / verticalLength * item.height,
              )))
              const left = Math.min(...points.map((point) => point[0])) - 3
              const top = Math.min(...points.map((point) => point[1])) - 3
              context.fillRect(left, top, Math.max(...points.map((point) => point[0])) - left + 3, Math.max(...points.map((point) => point[1])) - top + 3)
            }
          }
        }
        const image = await new Promise<Blob>((resolve, reject) => canvas!.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode the rendered page.')), 'image/png'))
        const asset = await output.embedPng(await image.arrayBuffer())
        output.addPage([unit.width, unit.height]).drawImage(asset, { x: 0, y: 0, width: unit.width, height: unit.height })
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0 }
        page.cleanup()
      }
    }
    if (tool === 'redact' && !matches) throw new Error('No embedded text matched. Scanned text requires rectangle or whole-page redaction.')
  })
  return save(output, `${name(file)}-${tool}.pdf`,
    `All pages are rebuilt as images (maximum 8 million pixels and 4096 pixels per side). Text search, forms, links, bookmarks, attachments and signatures are removed.${tool === 'redact' ? ' Redaction is burned into the new pixels; text mode covers entire matching text items, not individual glyphs. Visually inspect the result before sharing.' : ''}`)
}

export async function processAdvanced(tool: string, files: File[], options: Options): Promise<Result> {
  if (!advancedTools.includes(tool)) throw new Error(`Unknown advanced PDF tool “${tool}”.`)
  if (!files.length) throw new Error('Choose at least one file first.')
  if (tool === 'zip') {
    const mode = choice(options, 'mode', 'png', ['png', 'jpeg', 'bundle'])
    if (mode !== 'bundle') {
      if (typeof window === 'undefined') throw new Error('Page image export requires a browser with canvas support.')
      const parts: { filename: string; bytes: Uint8Array }[] = []
      for (const [fileIndex, file] of files.entries()) await withReader(file, async (reader) => {
        for (const [order, pageIndex] of parsePageRange(string(options, 'pages'), reader.numPages).entries()) {
          const page = await reader.getPage(pageIndex + 1)
          let canvas: HTMLCanvasElement | undefined
          try {
            const unit = page.getViewport({ scale: 1 })
            if (![unit.width, unit.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('The page has invalid dimensions.')
            const scale = Math.min(2, 4096 / unit.width, 4096 / unit.height, Math.sqrt(8_000_000 / (unit.width * unit.height)))
            const viewport = page.getViewport({ scale })
            canvas = window.document.createElement('canvas')
            canvas.width = Math.max(1, Math.floor(viewport.width))
            canvas.height = Math.max(1, Math.floor(viewport.height))
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Your browser could not create a canvas.')
            await page.render({ canvas, canvasContext: context, viewport, background: 'white' }).promise
            const image = await new Promise<Blob>((resolve, reject) => canvas!.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode the page image.')), `image/${mode}`, 0.9))
            parts.push({ filename: `${fileIndex + 1}-${name(file)}-${String(order + 1).padStart(3, '0')}-page-${pageIndex + 1}.${mode === 'jpeg' ? 'jpg' : 'png'}`, bytes: new Uint8Array(await image.arrayBuffer()) })
          } finally {
            if (canvas) { canvas.width = 0; canvas.height = 0 }
            page.cleanup()
          }
        }
      })
      return archive(parts, 'page-images.zip')
    }
    return archive(await Promise.all(files.map(async (file, index) => ({ filename: `${String(index + 1).padStart(3, '0')}-${name(file)}${file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ''}`, bytes: new Uint8Array(await file.arrayBuffer()) }))), 'documents.zip')
  }
  if (tool === 'alternate') {
    if (files.length < 2) throw new Error('Choose at least two PDFs to interleave.')
    const sources = await Promise.all(files.map(load))
    const output = await PDFDocument.create()
    const indices = sources.map((source) => parsePageRange(string(options, 'pages'), source.getPageCount()))
    for (let index = 0; index < Math.max(...indices.map((pages) => pages.length)); index++) {
      for (const [sourceIndex, source] of sources.entries()) {
        if (index < indices[sourceIndex].length) output.addPage((await output.copyPages(source, [indices[sourceIndex][index]]))[0])
      }
    }
    return save(output, 'alternated.pdf')
  }
  if (files.length !== 1 && !(tool === 'sign' && files.length === 2)) throw new Error('Choose exactly one PDF (plus one optional signature image for sign).')
  const file = files[0]
  if (tool === 'flatten' || tool === 'invert' || tool === 'redact') return raster(tool, file, options)
  let document: PDFDocument
  try { document = await load(file) } catch (error) {
    if (tool === 'repair' && typeof window !== 'undefined') return raster(tool, file, options)
    throw error
  }
  const selected = parsePageRange(string(options, 'pages'), document.getPageCount())
  const unique = [...new Set(selected)]
  const filename = `${name(file)}-${tool}.pdf`
  if (tool === 'analyze') {
    const form = document.getForm()
    const report = {
      filename: file.name, sizeBytes: file.size, pageCount: document.getPageCount(),
      metadata: { title: document.getTitle(), author: document.getAuthor(), subject: document.getSubject(), creator: document.getCreator(), producer: document.getProducer(), keywords: document.getKeywords() },
      pages: unique.map((index) => ({ page: index + 1, mediaBox: document.getPage(index).getMediaBox(), cropBox: document.getPage(index).getCropBox(), rotation: document.getPage(index).getRotation().angle, annotations: document.getPage(index).node.Annots()?.size() ?? 0 })),
      formFields: form.getFields().map((field) => ({ name: field.getName(), type: field.constructor.name })),
    }
    return { blob: new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), filename: `${name(file)}-analysis.json`, message: 'Structural analysis only; this is not malware, accessibility, signature, or PDF conformance validation.' }
  }
  if (tool === 'extract-pages') return save(await subset(document, selected), filename)
  if (tool === 'delete-pages') {
    const removed = new Set(selected)
    const retained = document.getPageIndices().filter((index) => !removed.has(index))
    return save(await subset(document, retained), filename)
  }
  if (tool === 'split-text' || tool === 'split-bookmarks') return splitByContent(tool, file, document, selected, options)
  if (tool === 'split-size') {
    const limit = Math.floor(number(options, 'maxSizeMb', 10, 0.000001, 1024) * 1024 * 1024)
    const parts: { filename: string; bytes: Uint8Array }[] = []
    let group: number[] = []
    let previous: Uint8Array | undefined
    for (const index of selected) {
      let candidate = await (await subset(document, [...group, index])).save()
      if (candidate.length > limit) {
        if (!previous) throw new Error(`Page ${index + 1} alone exceeds maxSizeMb; increase the limit.`)
        parts.push({ filename: `${name(file)}-${String(parts.length + 1).padStart(3, '0')}.pdf`, bytes: previous })
        group = []
        candidate = await (await subset(document, [index])).save()
        if (candidate.length > limit) throw new Error(`Page ${index + 1} alone exceeds maxSizeMb; increase the limit.`)
      }
      group.push(index)
      previous = candidate
    }
    if (previous) parts.push({ filename: `${name(file)}-${String(parts.length + 1).padStart(3, '0')}.pdf`, bytes: previous })
    return archive(parts, `${name(file)}-split.zip`)
  }
  if (tool === 'split-half') {
    const mode = choice(options, 'mode', 'pages', ['pages', 'document'])
    if (mode === 'document') {
      if (selected.length < 2) throw new Error('At least two pages are needed to divide the document.')
      const middle = Math.ceil(selected.length / 2)
      return split(document, [selected.slice(0, middle), selected.slice(middle)], name(file))
    }
    const axis = choice(options, 'axis', 'vertical', ['horizontal', 'vertical'])
    const output = await PDFDocument.create()
    for (const index of selected) {
      const source = document.getPage(index)
      const box = visibleBox(source)
      const halves = axis === 'vertical' ? [
        { x: box.x, y: box.y, width: box.width / 2, height: box.height },
        { x: box.x + box.width / 2, y: box.y, width: box.width / 2, height: box.height },
      ] : [
        { x: box.x, y: box.y + box.height / 2, width: box.width, height: box.height / 2 },
        { x: box.x, y: box.y, width: box.width, height: box.height / 2 },
      ]
      for (const half of halves) {
        const [page] = await output.copyPages(document, [index])
        page.setMediaBox(half.x, half.y, half.width, half.height)
        page.setCropBox(half.x, half.y, half.width, half.height)
        output.addPage(page)
      }
    }
    return save(output, filename, 'Splits visible page boxes in unrotated PDF coordinates. Cropped content remains recoverable; this is not redaction.')
  }
  if (tool === 'flip' || tool === 'nup') return save(await imposition(tool, document, tool === 'flip' ? unique : selected, options), filename, 'Placed pages preserve vector artwork, but interactive annotations and form widgets are not carried into the imposed artwork.')
  if (tool === 'crop') {
    const margin = number(options, 'margin', 36)
    for (const index of unique) {
      const page = document.getPage(index)
      const box = visibleBox(page)
      const width = number(options, 'width', box.width - 2 * margin, 0.01)
      const height = number(options, 'height', box.height - 2 * margin, 0.01)
      if (margin + width > box.width || margin + height > box.height) throw new Error('The crop must fit inside the current visible page.')
      page.setCropBox(box.x + margin, box.y + margin, width, height)
    }
    return save(document, filename, 'Cropping hides content without deleting it. Use redaction to remove sensitive content.')
  }
  if (tool === 'fill-form') await fillForm(document, options)
  if (tool === 'sign' || tool === 'bates' || tool === 'headers') await annotate(tool, document, unique, files[1], options)
  if (tool === 'repair') return save(await subset(document, document.getPageIndices()), filename, 'Rebuilt readable pages and cross-reference tables. Cannot recover missing bytes or encrypted data; document-level bookmarks, attachments and signatures are not retained.')
  return save(document, filename, tool === 'sign' ? 'Adds a visible signature mark only, not a cryptographic digital signature.' : undefined)
}
