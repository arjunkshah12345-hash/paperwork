import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import type { CompressPreset, Reencoder } from './compress-images'

export type ToolId = 'merge' | 'split' | 'compress' | 'rotate' | 'organize' | 'images' | 'watermark' | 'numbers' | 'text' | 'metadata' | 'extract-text' | 'pdf-images'

export type ProcessOptions = {
  pages?: string
  rotation?: number
  text?: string
  fontSize?: number
  color?: string
  title?: string
  author?: string
  quality?: number
  compressPreset?: CompressPreset
  /** With compressPreset 'target': the largest acceptable output size in bytes. */
  targetBytes?: number
  /** PDF to PNG: render resolution (72–600, default 150) and whether to keep the page background transparent. */
  dpi?: number
  transparent?: boolean
  watermarkImage?: File
  opacity?: number
  reencoder?: Reencoder
}

type ProcessResult = { blob: Blob; filename: string; message?: string }

const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Compress to a size limit: try lossless first, then a ladder of image settings, using binary search to find the
 * gentlest setting that fits. Returns the smallest result (with an honest message) when the limit cannot be met.
 */
async function compressToTarget(file: File, name: string, options: ProcessOptions): Promise<ProcessResult> {
  const target = options.targetBytes ?? 0
  if (!Number.isFinite(target) || target < 10 * 1024) throw new Error('Choose a target size of at least 10 KB.')
  const filename = `${name}-compressed.pdf`
  if (file.size <= target) return { blob: file, filename, message: `Already ${sizeLabel(file.size)}, which is under ${sizeLabel(target)}. The original is returned unchanged.` }
  const { recompressImages, targetLadder, canvasReencoder } = await import('./compress-images')
  const attempt = async (level: number) => {
    const document = await loadPdf(file)
    let stats
    if (level >= 0) stats = await recompressImages(document, targetLadder[level].maxDimension, targetLadder[level].quality, options.reencoder ?? canvasReencoder)
    return { level, bytes: await document.save({ useObjectStreams: true, objectsPerTick: 50 }), stats }
  }
  const lossless = await attempt(-1)
  const done = (result: Awaited<ReturnType<typeof attempt>>, met: boolean): ProcessResult => {
    const smaller = result.bytes.byteLength < file.size
    const quality = result.level < 0 ? 'Lossless optimization was enough; image quality is unchanged.' : `Images were downsampled to at most ${targetLadder[result.level].maxDimension}px at JPEG ${Math.round(targetLadder[result.level].quality * 100)}% (the gentlest setting that fits). Text and vector graphics stay sharp.`
    if (met) return { blob: bytesBlob(result.bytes), filename, message: `Compressed from ${sizeLabel(file.size)} to ${sizeLabel(result.bytes.byteLength)}, under your ${sizeLabel(target)} limit. ${quality}` }
    const why = result.stats && result.stats.recompressed === 0 ? 'This PDF has no images that can be shrunk further; its size is mostly text, fonts or vector graphics.' : 'Even the strongest image setting could not reach it; the rest of the size is text, fonts or vector graphics.'
    return { blob: smaller ? bytesBlob(result.bytes) : file, filename, message: `Could not reach ${sizeLabel(target)}. ${smaller ? `The smallest possible result is ${sizeLabel(result.bytes.byteLength)} (from ${sizeLabel(file.size)}).` : 'The original is returned unchanged.'} ${why} Try splitting the PDF or removing pages.` }
  }
  if (lossless.bytes.byteLength <= target) return done(lossless, true)
  const strongest = await attempt(targetLadder.length - 1)
  if (strongest.bytes.byteLength > target) return done(strongest.bytes.byteLength < lossless.bytes.byteLength ? strongest : lossless, false)
  let best = strongest, low = 0, high = targetLadder.length - 2
  while (low <= high) {
    const middle = (low + high) >> 1
    const result = await attempt(middle)
    if (result.bytes.byteLength <= target) { best = result; high = middle - 1 } else low = middle + 1
  }
  return done(best, true)
}

export function parsePageRange(input: string, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) {
    throw new Error('The PDF must contain at least one page.')
  }
  if (!input.trim()) return Array.from({ length: totalPages }, (_, index) => index)
  const selected: number[] = []
  for (const part of input.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
    if (!match) throw new Error(`Invalid page selection “${part.trim()}”. Use pages such as 1,3-5,2.`)
    const start = Number(match[1])
    const end = match[2] === undefined ? start : Number(match[2])
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > totalPages || end > totalPages) {
      throw new Error(`Pages must be between 1 and ${totalPages}.`)
    }
    const step = start <= end ? 1 : -1
    for (let page = start; ; page += step) {
      selected.push(page - 1)
      if (page === end) break
    }
  }
  return selected
}

function bytesBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  return new Blob([new Uint8Array(bytes).buffer], { type })
}

function basename(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'document'
}

async function loadPdf(file: File): Promise<PDFDocument> {
  try {
    const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
    if (document.getPageCount() === 0) throw new Error('No pages')
    return document
  } catch {
    throw new Error(`Cannot open “${file.name}”. Choose a valid, unencrypted PDF with at least one page.`)
  }
}

export async function inspectPdf(file: File): Promise<{ pageCount: number }> {
  return { pageCount: (await loadPdf(file)).getPageCount() }
}

async function savePdf(document: PDFDocument, filename: string): Promise<ProcessResult> {
  return { blob: bytesBlob(await document.save({ useObjectStreams: true })), filename }
}

function textColor(value = '#27272a') {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Choose a color in #RRGGBB format.')
  return rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255)
}

function textSize(value: number | undefined, fallback: number): number {
  const size = value ?? fallback
  if (!Number.isFinite(size) || size < 1 || size > 300) throw new Error('Font size must be between 1 and 300.')
  return size
}

async function pdfJs() {
  const [engine, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  engine.GlobalWorkerOptions.workerSrc = worker.default
  return engine
}

async function readWithPdfJs(tool: 'extract-text' | 'pdf-images', file: File, options: ProcessOptions): Promise<ProcessResult> {
  const engine = await pdfJs()
  const loadingTask = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()).slice() })
  try {
    const document = await loadingTask.promise
    const selected = parsePageRange(options.pages ?? '', document.numPages)
    const archive = new JSZip()
    const sections: string[] = []
    const pngs: { name: string; blob: Blob }[] = []
    let reduced = 0
    const dpi = options.dpi ?? 150
    if (tool === 'pdf-images' && (!Number.isFinite(dpi) || dpi < 36 || dpi > 600)) throw new Error('Resolution must be between 36 and 600 DPI.')
    for (const [index, pageIndex] of selected.entries()) {
      const page = await document.getPage(pageIndex + 1)
      try {
        if (tool === 'extract-text') {
          const content = await page.getTextContent()
          let text = ''
          for (const item of content.items) {
            if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
          }
          sections.push(`--- Page ${pageIndex + 1} ---\n${text.trim()}`)
        } else {
          if (typeof window === 'undefined') throw new Error('Rendering PDF pages requires a browser.')
          const unscaled = page.getViewport({ scale: 1 })
          const wanted = dpi / 72, limit = Math.sqrt(40_000_000 / (unscaled.width * unscaled.height))
          if (wanted > limit) reduced++
          const scale = Math.min(wanted, limit)
          const viewport = page.getViewport({ scale })
          const canvas = window.document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Your browser could not create an image canvas.')
          try {
            await page.render({ canvasContext: context, canvas, viewport, background: options.transparent ? 'rgba(0,0,0,0)' : 'white' }).promise
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not render this page as PNG.')), 'image/png'))
            pngs.push({ name: `${String(index + 1).padStart(3, '0')}-page-${pageIndex + 1}.png`, blob })
          } finally {
            canvas.width = 0
            canvas.height = 0
          }
        }
      } finally {
        page.cleanup()
      }
    }
    if (tool === 'extract-text') {
      return {
        blob: new Blob([sections.join('\n\n')], { type: 'text/plain;charset=utf-8' }),
        filename: `${basename(file)}-text.txt`,
        message: 'Extracts embedded text only. Scanned pages need OCR, which is not included.',
      }
    }
    const note = `Rendered at ${dpi} DPI${options.transparent ? ' with a transparent background' : ''}.${reduced ? ` ${reduced} very large page${reduced === 1 ? ' was' : 's were'} capped at 40 megapixels to stay within browser memory.` : ''}`
    if (pngs.length === 1) return { blob: pngs[0].blob, filename: `${basename(file)}-page-${selected[0] + 1}.png`, message: note }
    for (const png of pngs) archive.file(png.name, await png.blob.arrayBuffer())
    return { blob: bytesBlob(await archive.generateAsync({ type: 'uint8array' }), 'application/zip'), filename: `${basename(file)}-pages.zip`, message: `${pngs.length} PNG images in a ZIP. ${note}` }
  } catch (error) {
    if (error instanceof Error && (error.name === 'PasswordException' || error.name === 'InvalidPDFException')) {
      throw new Error(`Cannot open “${file.name}”. Choose a valid, unencrypted PDF.`)
    }
    throw error
  } finally {
    await loadingTask.destroy()
  }
}

export async function processFiles(tool: ToolId, files: File[], options: ProcessOptions): Promise<ProcessResult> {
  if (files.length === 0) throw new Error('Choose at least one file first.')
  if (tool !== 'merge' && tool !== 'images' && files.length !== 1) throw new Error('Choose exactly one PDF for this tool.')
  const file = files[0]
  const name = basename(file)
  if (tool === 'images') {
    const document = await PDFDocument.create()
    const { embedImageFile } = await import('./image-input')
    for (const imageFile of files) {
      for (const image of await embedImageFile(document, new Uint8Array(await imageFile.arrayBuffer()), imageFile.name)) {
        const scale = Math.min(1, 14400 / Math.max(image.width, image.height))
        const page = document.addPage([image.width * scale, image.height * scale])
        image.draw(page, 0, 0, page.getWidth(), page.getHeight())
      }
    }
    return savePdf(document, 'images.pdf')
  }
  if (tool === 'merge') {
    const merged = await PDFDocument.create()
    for (const source of files) {
      const document = await loadPdf(source)
      const pages = await merged.copyPages(document, document.getPageIndices())
      pages.forEach((page) => merged.addPage(page))
    }
    return savePdf(merged, 'merged.pdf')
  }
  if (tool === 'extract-text' || tool === 'pdf-images') return readWithPdfJs(tool, file, options)
  const document = await loadPdf(file)
  const selected = parsePageRange(options.pages ?? '', document.getPageCount())
  if (tool === 'split' || tool === 'organize') {
    if (tool === 'split' && !options.pages?.trim()) {
      const archive = new JSZip()
      for (const pageIndex of selected) {
        const single = await PDFDocument.create()
        const [page] = await single.copyPages(document, [pageIndex])
        single.addPage(page)
        archive.file(`${name}-page-${pageIndex + 1}.pdf`, await single.save())
      }
      return { blob: bytesBlob(await archive.generateAsync({ type: 'uint8array' }), 'application/zip'), filename: `${name}-split.zip` }
    }
    const extracted = await PDFDocument.create()
    const pages = await extracted.copyPages(document, selected)
    pages.forEach((page) => extracted.addPage(page))
    return savePdf(extracted, `${name}-${tool === 'split' ? 'extracted' : 'organized'}.pdf`)
  }
  if (tool === 'compress') {
    const preset = options.compressPreset ?? 'lossless'
    if (preset === 'target') return compressToTarget(file, name, options)
    let imageNote = 'Images were not downsampled.'
    if (preset !== 'lossless') {
      const { compressPresets, recompressImages, canvasReencoder } = await import('./compress-images')
      const settings = compressPresets[preset]
      if (!settings) throw new Error('Choose a supported compression level.')
      const stats = await recompressImages(document, settings.maxDimension, settings.quality, options.reencoder ?? canvasReencoder)
      imageNote = stats.recompressed
        ? [`${stats.recompressed} of ${stats.examined} images were downsampled/re-encoded as JPEG (${Math.round((1 - stats.bytesAfter / stats.bytesBefore) * 100)}% smaller image data).`, stats.skipped ? `${stats.skipped} unsupported or already-small images were kept.` : '', 'Image quality is reduced.'].filter(Boolean).join(' ')
        : `No embedded images could be made smaller (${stats.examined} examined).`
    }
    const bytes = await document.save({ useObjectStreams: true, objectsPerTick: 50 })
    const reduced = bytes.byteLength < file.size
    return {
      blob: reduced ? bytesBlob(bytes) : file,
      filename: `${name}-${preset === 'lossless' ? 'optimized' : 'compressed'}.pdf`,
      message: reduced ? `${preset === 'lossless' ? 'Lossless structural optimization applied.' : `Compressed ${Math.round((1 - bytes.byteLength / file.size) * 100)}%.`} ${imageNote}` : preset === 'lossless' ? 'This PDF is already compact. The original is returned unchanged; lossless optimization cannot guarantee a smaller file.' : `The original is returned unchanged because the result was not smaller. ${imageNote}`,
    }
  }
  if (tool === 'rotate') {
    const rotation = options.rotation ?? 90
    if (!Number.isFinite(rotation) || !Number.isInteger(rotation) || rotation % 90 !== 0) throw new Error('Rotation must be a multiple of 90 degrees.')
    for (const pageIndex of new Set(selected)) {
      const page = document.getPage(pageIndex)
      page.setRotation(degrees(((page.getRotation().angle + rotation) % 360 + 360) % 360))
    }
  } else if (tool === 'metadata') {
    if (options.title !== undefined) document.setTitle(options.title)
    if (options.author !== undefined) document.setAuthor(options.author)
  } else if (tool === 'watermark' || tool === 'numbers' || tool === 'text') {
    const font = await document.embedFont(StandardFonts.Helvetica)
    const color = textColor(options.color)
    const size = textSize(options.fontSize, tool === 'watermark' ? 48 : tool === 'numbers' ? 12 : 18)
    const value = options.text ?? (tool === 'watermark' && !options.watermarkImage ? 'CONFIDENTIAL' : '')
    const opacity = options.opacity ?? 0.22
    if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw new Error('Opacity must be between 1% and 100%.')
    let stamp: Awaited<ReturnType<PDFDocument['embedPng']>> | undefined
    if (tool === 'watermark' && options.watermarkImage) {
      const bytes = new Uint8Array(await options.watermarkImage.arrayBuffer())
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50, isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
      if (!isPng && !isJpeg) throw new Error('Watermark images must be PNG or JPEG.')
      try { stamp = isPng ? await document.embedPng(bytes) : await document.embedJpg(bytes) } catch { throw new Error('Cannot read the watermark image.') }
    }
    if (tool !== 'numbers' && !value.trim() && !stamp) throw new Error('Enter the text to add to the PDF.')
    try {
      for (const line of value.replace(/\r\n?/g, '\n').split('\n')) font.encodeText(line)
    } catch {
      throw new Error('This tool supports Latin text with the built-in font. Remove unsupported characters and try again.')
    }
    const targets = [...new Set(selected)]
    for (const pageIndex of targets) {
      const page = document.getPage(pageIndex)
      const { width, height } = page.getSize()
      if (tool === 'watermark' && stamp) {
        const scale = Math.min(width * 0.5 / stamp.width, height * 0.5 / stamp.height)
        page.drawImage(stamp, { x: (width - stamp.width * scale) / 2, y: (height - stamp.height * scale) / 2, width: stamp.width * scale, height: stamp.height * scale, opacity })
      }
      if (tool === 'watermark' && value.trim()) {
        const angle = Math.PI / 4
        const lines = value.replace(/\r\n?/g, '\n').split('\n')
        const lineHeight = size * 1.2
        lines.forEach((line, index) => {
          const textWidth = font.widthOfTextAtSize(line, size)
          const verticalOffset = ((lines.length - 1) / 2 - index) * lineHeight
          const centerOffset = verticalOffset - size * 0.35
          page.drawText(line, { font, size, color, opacity, rotate: degrees(45), x: width / 2 - Math.cos(angle) * textWidth / 2 - Math.sin(angle) * centerOffset, y: height / 2 - Math.sin(angle) * textWidth / 2 + Math.cos(angle) * centerOffset })
        })
      } else if (tool === 'numbers') {
        const label = String(pageIndex + 1)
        page.drawText(label, { font, size, color, x: (width - font.widthOfTextAtSize(label, size)) / 2, y: Math.min(20, height / 4) })
      } else {
        page.drawText(value, { font, size, color, x: Math.min(36, width / 10), y: Math.max(0, height - 36 - size), maxWidth: Math.max(1, width - 72), lineHeight: size * 1.3 })
      }
    }
  } else {
    throw new Error('This PDF tool is not supported.')
  }
  return savePdf(document, `${name}-${tool}.pdf`)
}
