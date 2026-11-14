import { PDFDocument, StandardFonts, TextRenderingMode, popGraphicsState, pushGraphicsState, setTextRenderingMode } from 'pdf-lib'
import { textRunSpans } from './text-runs'

export const intelligenceTools: string[] = ['encrypt', 'remove-password', 'unlock', 'auto-redact', 'redaction-check', 'privacy-scan', 'fingerprint', 'ocr', 'handwriting-pdf', 'audio-pdf']

type Result = { blob: Blob; filename: string; message?: string }
export type SensitiveMatch = { kind: string; start: number; end: number; text: string }
export type RecognitionWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
type Options = Record<string, unknown>

export function passesLuhn(value: string): boolean {
  const digits = value.replace(/[ -]/g, '')
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  let sum = 0
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return sum % 10 === 0
}

export function detectSensitive(text: string, terms: string[] = []): SensitiveMatch[] {
  const matches: SensitiveMatch[] = []
  const patterns: [string, RegExp][] = [
    ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ['US social security number', /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g],
    ['phone number', /(?<!\w)(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?!\d)/g],
  ]
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      matches.push({ kind, start: match.index, end: match.index + match[0].length, text: match[0] })
    }
  }
  for (const run of text.matchAll(/(?<!\w)\d+(?:[ -]+\d+)*(?!\w)/g)) {
    const groups = [...run[0].matchAll(/\d+/g)]
    for (let first = 0; first < groups.length; first++) {
      let digits = 0
      for (let last = first; last < groups.length; last++) {
        digits += groups[last][0].length
        if (digits > 19) break
        if (digits < 13) continue
        const start = run.index + groups[first].index
        const end = run.index + groups[last].index + groups[last][0].length
        const candidate = text.slice(start, end)
        if (first !== last && groups.slice(first, last + 1).some((group) => group[0].length < 3 || group[0].length > 6)) continue
        if (passesLuhn(candidate)) matches.push({ kind: 'payment card', start, end, text: candidate })
      }
    }
  }
  for (const term of terms.filter((entry) => entry.trim().length > 0)) {
    const expression = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
    for (const match of text.matchAll(expression)) matches.push({ kind: 'custom term', start: match.index, end: match.index + match[0].length, text: match[0] })
  }
  return matches.sort((first, second) => first.start - second.start || first.end - second.end)
}

export function sensitiveWordBoxes(words: RecognitionWord[], terms: string[] = []): RecognitionWord['bbox'][] {
  const runs = words.map((word, index) => ({
    text: word.text,
    start: [word.bbox.x0, word.bbox.y0] as [number, number],
    end: [word.bbox.x1, word.bbox.y0] as [number, number],
    height: word.bbox.y1 - word.bbox.y0,
    breakAfter: !!words[index + 1] && Math.min(word.bbox.y1, words[index + 1].bbox.y1) <= Math.max(word.bbox.y0, words[index + 1].bbox.y0),
  }))
  const hidden = new Set<number>()
  for (const joinAdjacent of [false, true]) {
    const { text, spans } = textRunSpans(runs, joinAdjacent)
    const matches = detectSensitive(text, terms)
    for (const span of spans) if (matches.some((match) => span.start < match.end && span.end > match.start)) hidden.add(span.index)
  }
  return words.filter((_, index) => hidden.has(index)).map((word) => word.bbox)
}

export async function hashBytes(bytes: ArrayBuffer): Promise<{ sha256: string; sha1: string; md5: string }> {
  if (!globalThis.crypto?.subtle) throw new Error('Fingerprinting requires Web Crypto in a secure browser context (HTTPS or localhost).')
  const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const [{ default: SparkMD5 }, sha256, sha1] = await Promise.all([
    import('spark-md5'), crypto.subtle.digest('SHA-256', bytes), crypto.subtle.digest('SHA-1', bytes),
  ])
  return { sha256: hex(sha256), sha1: hex(sha1), md5: SparkMD5.ArrayBuffer.hash(bytes) }
}

function name(file: File) { return file.name.replace(/\.[^.]+$/, '') || 'document' }
function pdfBlob(bytes: Uint8Array) { return new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }) }
function report(file: File, suffix: string, data: unknown, message: string): Result {
  return { blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename: `${name(file)}-${suffix}.json`, message }
}
function consent(options: Options, purpose: string) {
  if (options.modelDownloadConsent !== true) throw new Error(`${purpose} requires your explicit consent: set modelDownloadConsent to true. Model/runtime files download from external hosts on first use and may be cached. Document/audio processing stays in this browser.`)
}
function termsFrom(options: Options): string[] {
  if (Array.isArray(options.terms)) return options.terms.filter((term): term is string => typeof term === 'string')
  return typeof options.terms === 'string' ? options.terms.split('\n').map((term) => term.trim()).filter(Boolean) : []
}

async function openPdf(file: File, options: Options = {}) {
  const [engine, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  engine.GlobalWorkerOptions.workerSrc = worker.default
  const task = engine.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    password: typeof options.password === 'string' ? options.password : undefined,
  })
  try { return await task.promise } catch (error) {
    await task.destroy()
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('A correct PDF password is required. Password cracking is not supported.')
    throw error
  }
}

export async function extractIntelligenceText(files: File[], password?: string): Promise<string> {
  const sections: string[] = []
  for (const file of files) {
    const document = await openPdf(file, { password })
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        try {
          const content = await page.getTextContent()
          sections.push(`[${file.name}, page ${pageNumber}]\n${content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')}`)
        } finally { page.cleanup() }
      }
    } finally { await document.destroy() }
  }
  return sections.join('\n\n')
}

async function makeTextPdf(text: string, title: string): Promise<Uint8Array> {
  if (!text.trim()) throw new Error('No speech/text was recognized. No PDF was created.')
  const document = await PDFDocument.create()
  document.setTitle(title)
  const font = await document.embedFont(StandardFonts.Helvetica)
  try { font.encodeText(text.replace(/[\r\n\t]/g, ' ')) } catch { throw new Error('This transcript contains characters outside the built-in Western font. Unicode transcript PDF export is not supported yet; no text was discarded.') }
  let page = document.addPage([612, 792])
  let baseline = 744
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    const flush = () => {
      if (baseline < 48) { page = document.addPage([612, 792]); baseline = 744 }
      if (line) page.drawText(line, { x: 48, y: baseline, font, size: 11 })
      baseline -= 16
      line = ''
    }
    for (const character of paragraph) {
      if (font.widthOfTextAtSize(line + character, 11) > 516) flush()
      line += character
    }
    flush()
  }
  return document.save()
}

async function canvasFor(page: Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>['getPage']>>) {
  const viewport = page.getViewport({ scale: 2 })
  if (viewport.width * viewport.height > 32_000_000) throw new Error('This page is too large to rasterize safely (32 megapixel limit).')
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.')
  await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise
  return { canvas, context, width: viewport.width / 2, height: viewport.height / 2 }
}

async function pngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error('Could not encode the rendered page.')), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

/** Decrypt losslessly: text, links, forms and bookmarks are kept. Requires the password for files that need one; never cracks. */
async function unlockPdf(tool: string, file: File, options: Options): Promise<Result> {
  const password = [options.currentPassword, options.password].find((value): value is string => typeof value === 'string' && value !== '')
  const { PDF } = await import('@libpdf/core')
  let document
  try { document = await PDF.load(new Uint8Array(await file.arrayBuffer()), { credentials: password }) } catch (error) {
    if (/password|decrypt|authenticat/i.test(error instanceof Error ? error.message : '')) throw new Error('A correct PDF password is required. Password cracking is not supported.')
    throw new Error(`Cannot open “${file.name}”. Choose a valid PDF.`)
  }
  if (!document.isEncrypted) return { blob: new Blob([new Uint8Array(await file.arrayBuffer())], { type: 'application/pdf' }), filename: `${name(file)}-${tool}.pdf`, message: 'This PDF has no password or restrictions, so it was returned unchanged.' }
  if (!document.isAuthenticated) throw new Error(password ? 'That password is not correct for this PDF. Password cracking is not supported.' : 'This PDF needs its password to open. Enter it in “Current password”. Password cracking is not supported.')
  document.removeProtection({ ignorePermissions: true })
  const bytes = await document.save()
  const check = await PDF.load(bytes)
  if (check.isEncrypted) throw new Error('Could not remove the encryption. No output was returned.')
  return { blob: pdfBlob(bytes), filename: `${name(file)}-${tool}.pdf`, message: 'Removed the password and permission restrictions. Text, links, forms and bookmarks are unchanged. Only unlock documents you are authorized to use.' }
}

async function rasterPdf(tool: string, file: File, options: Options): Promise<Result> {
  const recognize = tool !== 'unlock' && tool !== 'remove-password'
  if (recognize) consent(options, 'OCR/redaction')
  const document = await openPdf(file, options)
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined
  try {
    if (recognize) {
      const { createWorker } = await import('tesseract.js')
      const language = typeof options.language === 'string' ? options.language : 'eng'
      if (!/^[a-z]{3}(?:\+[a-z]{3})*$/.test(language)) throw new Error('Use OCR language codes such as eng or eng+fra.')
      worker = await createWorker(language)
    }
    const output = await PDFDocument.create()
    const font = tool === 'auto-redact' || !recognize ? undefined : await output.embedFont(StandardFonts.Helvetica)
    let recognizedWords = 0
    let redactedWords = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const sourcePage = await document.getPage(pageNumber)
      let canvas: HTMLCanvasElement | undefined
      try {
        const rendered = await canvasFor(sourcePage)
        canvas = rendered.canvas
        let words: RecognitionWord[] = []
        if (worker) {
          const recognition = await worker.recognize(canvas, {}, { blocks: true, text: true })
          words = (recognition.data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)))
          if (!words.length) throw new Error(`No text was recognized on page ${pageNumber}. Processing stopped rather than claiming successful OCR/redaction.`)
          recognizedWords += words.length
        }
        if (tool === 'auto-redact') {
          const boxes = sensitiveWordBoxes(words, termsFrom(options))
          redactedWords += boxes.length
          rendered.context.fillStyle = '#000000'
          for (const box of boxes) rendered.context.fillRect(Math.max(0, box.x0 - 5), Math.max(0, box.y0 - 5), box.x1 - box.x0 + 10, box.y1 - box.y0 + 10)
        }
        const image = await output.embedPng(await pngBytes(canvas))
        const page = output.addPage([rendered.width, rendered.height])
        page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height })
        if (font) {
          page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
          for (const word of words) {
            try { font.encodeText(word.text) } catch { throw new Error('OCR found characters outside the built-in Western font. Searchable Unicode PDF export is not supported yet; no words were silently dropped.') }
            const size = Math.max(1, (word.bbox.y1 - word.bbox.y0) / 2)
            const measured = font.widthOfTextAtSize(word.text, size)
            const target = Math.max(1, (word.bbox.x1 - word.bbox.x0) / 2)
            page.drawText(word.text, { x: word.bbox.x0 / 2, y: rendered.height - word.bbox.y1 / 2, size: measured > 0 ? size * Math.min(1, target / measured) : size, font })
          }
          page.pushOperators(popGraphicsState())
        }
      } finally { if (canvas) { canvas.width = 0; canvas.height = 0 }; sourcePage.cleanup() }
    }
    const message = tool === 'auto-redact'
      ? `Rasterized every page into a new PDF and removed ${redactedWords} detected word regions. No original text, objects, metadata, attachments, or links were copied. Pattern/OCR detection is incomplete: review every page before sharing; this is not a privacy guarantee.`
      : recognize
        ? `Created a searchable raster PDF with ${recognizedWords} invisible OCR words. Original selectable text, links, forms, and signatures are replaced. ${tool === 'handwriting-pdf' ? 'Handwriting recognition is experimental and may be inaccurate; Tesseract is primarily a printed-text engine.' : 'Review recognition accuracy.'}`
        : 'Created an unencrypted raster copy using the supplied password. Selectable text, links, forms, attachments, and digital signatures are not preserved. No password was bypassed or cracked.'
    return { blob: pdfBlob(await output.save()), filename: `${name(file)}-${tool}.pdf`, message }
  } finally { try { await worker?.terminate() } finally { await document.destroy() } }
}

async function scan(file: File, options: Options, tool: string): Promise<Result> {
  const document = await openPdf(file, options)
  try {
    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      try {
        const text = (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ')
        const annotations = await page.getAnnotations()
        pages.push({ page: pageNumber, searchableCharacters: text.length, findings: detectSensitive(text, termsFrom(options)).map(({ kind, start, end }) => ({ kind, start, end })), annotations: annotations.length, redactionAnnotations: annotations.filter((annotation) => annotation.subtype === 'Redact').length, warning: text.trim() ? undefined : 'No selectable text. Image content was not OCR-scanned.' })
      } finally { page.cleanup() }
    }
    const metadata = await document.getMetadata()
    const attachments = await document.getAttachments()
    const scripts = await document.getJSActions()
    const warning = 'Limited structural/selectable-text inspection, not a security certification. Images, paths, covered text positioning, and every hidden object are not fully analyzed. Zero findings does not mean safe. Redaction annotations are not proof of applied redaction. No sensitive values are included in findings.'
    return report(file, tool, { warning, pages, metadata: metadata.info, hasXmpMetadata: Boolean(metadata.metadata), attachmentCount: Object.keys(attachments ?? {}).length, hasJavaScript: Boolean(scripts && Object.keys(scripts).length) }, warning)
  } finally { await document.destroy() }
}

async function audioPdf(file: File, options: Options): Promise<Result> {
  consent(options, 'Local Whisper transcription')
  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') throw new Error('Local audio decoding is unavailable in this browser.')
  const context = new AudioContext()
  let audio: AudioBuffer
  try { audio = await context.decodeAudioData(await file.arrayBuffer()) } finally { await context.close() }
  if (audio.duration > 1800) throw new Error('Audio is limited to 30 minutes to bound local memory use. Split longer recordings first.')
  const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000)
  const source = offline.createBufferSource()
  source.buffer = audio
  source.connect(offline.destination)
  source.start()
  const mono = (await offline.startRendering()).getChannelData(0)
  const { pipeline } = await (await import('./transformers')).loadTransformers()
  const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', { device: 'wasm', dtype: 'q8' })
  try {
    const result = await transcriber(mono, { chunk_length_s: 30, stride_length_s: 5 })
    const text = (Array.isArray(result) ? result.map((part) => part.text).join('\n') : result.text).trim()
    return { blob: pdfBlob(await makeTextPdf(text, `Transcript: ${file.name}`)), filename: `${name(file)}-transcript.pdf`, message: 'Transcribed locally using Whisper tiny English. Model/runtime files were downloaded if needed; audio was not uploaded. Verify the transcript: recognition may be inaccurate. This model supports English only.' }
  } finally { await transcriber.dispose() }
}

const fingerprintKey = 'PaperworkFingerprint'
const fingerprintPattern = /PWFP-[0-9A-F]{16}/

async function fingerprintDocument(files: File[], options: Record<string, unknown>): Promise<Result> {
  if (files.length !== 1) throw new Error('Choose exactly one PDF.')
  const file = files[0]
  let document: PDFDocument
  try { document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }) } catch { throw new Error(`Cannot open “${file.name}”. Choose a valid, unencrypted PDF.`) }
  const { PDFName, PDFString, PDFHexString } = await import('pdf-lib')
  const info = (document as unknown as { getInfoDict: () => import('pdf-lib').PDFDict }).getInfoDict()
  if (options.mode === 'detect') {
    const stored = info.lookup(PDFName.of(fingerprintKey))
    const fromInfo = stored instanceof PDFString || stored instanceof PDFHexString ? stored.decodeText() : undefined
    const fromText = fingerprintPattern.exec(await extractIntelligenceText([file]).catch(() => ''))?.[0]
    const found = fromInfo ?? fromText
    return report(file, 'fingerprint-detect', { file: file.name, fingerprint: found ?? null, inMetadata: !!fromInfo, inPageText: !!fromText }, found ? `Found fingerprint ${found}${fromInfo ? '' : ' in page text (metadata was stripped)'}. Match it against your fingerprint ledger.` : 'No Paperwork fingerprint found. It may never have been added, or it was removed.')
  }
  const recipient = typeof options.text === 'string' ? options.text.trim().slice(0, 120) : ''
  const random = crypto.getRandomValues(new Uint8Array(8))
  const id = `PWFP-${Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`
  info.set(PDFName.of(fingerprintKey), PDFString.of(id))
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (const page of document.getPages()) {
    // Invisible (render mode 3) tiny text survives metadata stripping and copy/extraction.
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible))
    page.drawText(id, { x: 2, y: 2, size: 1, font })
    page.pushOperators(popGraphicsState())
  }
  const bytes = await document.save()
  const ledger = { fingerprint: id, recipient: recipient || null, file: file.name, created: new Date().toISOString(), sha256: (await hashBytes(bytes.slice().buffer)).sha256 }
  const { default: JSZip } = await import('jszip')
  const archive = new JSZip()
  archive.file(`${name(file)}-${id}.pdf`, bytes)
  archive.file(`${id}-ledger.json`, JSON.stringify(ledger, null, 2))
  return { blob: new Blob([await archive.generateAsync({ type: 'arraybuffer' })], { type: 'application/zip' }), filename: `${name(file)}-${id}.zip`, message: `Embedded fingerprint ${id}${recipient ? ` for “${recipient}”` : ''} in metadata and as invisible text on every page. Keep the ledger to trace leaked copies. This identifies copies; it does not report when a file is opened, and a determined recipient can remove it (e.g. by printing or rasterizing).` }
}

export async function processIntelligence(tool: string, files: File[], options: Record<string, unknown>): Promise<{ blob: Blob; filename: string; message?: string }> {
  if (!intelligenceTools.includes(tool)) throw new Error(`Unsupported intelligence tool: ${tool}`)
  if (!files.length) throw new Error('Choose a file first.')
  if (files.length !== 1 && tool !== 'fingerprint') throw new Error('This tool processes exactly one file at a time.')
  if (tool === 'fingerprint' && (options.mode === 'embed' || options.mode === 'detect')) return fingerprintDocument(files, options)
  if (tool === 'fingerprint') {
    const fingerprints = await Promise.all(files.map(async (file) => ({ file: file.name, bytes: file.size, ...await hashBytes(await file.arrayBuffer()) })))
    return report(files[0], 'fingerprints', { fingerprints, note: 'SHA-256 is recommended for integrity. MD5 and SHA-1 are legacy checksums, not collision-resistant security guarantees.' }, 'Computed hashes of the original file bytes locally; files were not modified.')
  }
  const file = files[0]
  if (tool === 'audio-pdf') return audioPdf(file, options)
  if (tool === 'encrypt') {
    const password = typeof options.password === 'string' ? options.password : ''
    if (!password) throw new Error('Enter a nonempty password to encrypt this PDF.')
    const { PDF } = await import('@libpdf/core')
    const document = await PDF.load(new Uint8Array(await file.arrayBuffer()), { credentials: typeof options.currentPassword === 'string' ? options.currentPassword : undefined })
    if (document.isEncrypted && !document.isAuthenticated) throw new Error('The source PDF requires its current password before re-encryption.')
    document.setProtection({ userPassword: password, ownerPassword: typeof options.ownerPassword === 'string' && options.ownerPassword ? options.ownerPassword : crypto.randomUUID(), algorithm: 'AES-256' })
    const bytes = await document.save()
    const verification = await PDF.load(bytes)
    if (!verification.isEncrypted || verification.isAuthenticated) throw new Error('Encryption verification failed. No output was returned.')
    const authenticated = await PDF.load(bytes, { credentials: password })
    if (!authenticated.isAuthenticated) throw new Error('The encrypted output could not be opened with your password. No output was returned.')
    return { blob: pdfBlob(bytes), filename: `${name(file)}-encrypted.pdf`, message: 'Encrypted with AES-256 and verified password authentication. Password strength determines practical protection. Changes invalidate existing digital signatures.' }
  }
  if (tool === 'unlock' || tool === 'remove-password') return unlockPdf(tool, file, options)
  if (tool === 'privacy-scan' || tool === 'redaction-check') return scan(file, options, tool)
  return rasterPdf(tool, file, options)
}
