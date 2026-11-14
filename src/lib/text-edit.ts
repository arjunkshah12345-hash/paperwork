import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, StandardFonts, decodePDFRawStream, degrees, rgb } from 'pdf-lib'

/** Axis-aligned box in PDF user space (points, origin bottom-left). */
export type Box = { x0: number; y0: number; x1: number; y1: number }
export type TextEdit = { box: Box; replacement: string }
export type ShowOp = { start: number; end: number; operator: string; origin: [number, number]; mid: [number, number]; size: number; angle: number; font: string; baseFont: string; color: [number, number, number]; advance: number; glyphs: number; rewrite: string; source: string }

type Matrix = [number, number, number, number, number, number]
const identity = (): Matrix => [1, 0, 0, 1, 0, 0]
const multiply = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]]
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

type Token = { kind: 'number'; value: number; start: number; end: number } | { kind: 'string'; bytes: number[]; start: number; end: number } | { kind: 'name'; value: string; start: number; end: number } | { kind: 'array'; items: Token[]; start: number; end: number } | { kind: 'other'; start: number; end: number } | { kind: 'operator'; value: string; start: number; end: number }

const whitespace = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00
const delimiter = (c: number) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25

/** Minimal PDF content-stream tokenizer (strings, hex, names, numbers, arrays, dicts, inline images). */
export function* tokenize(data: Uint8Array): Generator<Token> {
  let i = 0
  const readToken = (): Token | null => {
    while (i < data.length) {
      if (whitespace(data[i])) i++
      else if (data[i] === 0x25) { while (i < data.length && data[i] !== 0x0a && data[i] !== 0x0d) i++ }
      else break
    }
    if (i >= data.length) return null
    const start = i, c = data[i]
    if (c === 0x28) {
      const bytes: number[] = []; let depth = 1; i++
      while (i < data.length && depth) {
        const b = data[i++]
        if (b === 0x5c) {
          const e = data[i++]
          const map: Record<number, number> = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c }
          if (e in map) bytes.push(map[e])
          else if (e >= 0x30 && e <= 0x37) { let v = e - 0x30; for (let k = 0; k < 2 && data[i] >= 0x30 && data[i] <= 0x37; k++) v = v * 8 + data[i++] - 0x30; bytes.push(v & 255) }
          else if (e === 0x0d) { if (data[i] === 0x0a) i++ } else if (e !== 0x0a) bytes.push(e)
        } else if (b === 0x28) { depth++; bytes.push(b) } else if (b === 0x29) { if (--depth) bytes.push(b) } else bytes.push(b)
      }
      return { kind: 'string', bytes, start, end: i }
    }
    if (c === 0x3c && data[i + 1] === 0x3c) { // dictionary: skip balanced
      let depth = 0
      while (i < data.length) { if (data[i] === 0x3c && data[i + 1] === 0x3c) { depth++; i += 2 } else if (data[i] === 0x3e && data[i + 1] === 0x3e) { depth--; i += 2; if (!depth) break } else i++ }
      return { kind: 'other', start, end: i }
    }
    if (c === 0x3c) {
      i++; let hex = ''
      while (i < data.length && data[i] !== 0x3e) { if (!whitespace(data[i])) hex += String.fromCharCode(data[i]); i++ }
      i++
      if (hex.length % 2) hex += '0'
      const bytes: number[] = []; for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16))
      return { kind: 'string', bytes, start, end: i }
    }
    if (c === 0x5b) {
      i++; const items: Token[] = []
      for (;;) {
        while (i < data.length && whitespace(data[i])) i++
        if (i >= data.length) break
        if (data[i] === 0x5d) { i++; break }
        const item = readToken(); if (!item) break; items.push(item)
      }
      return { kind: 'array', items, start, end: i }
    }
    if (c === 0x2f) { i++; while (i < data.length && !whitespace(data[i]) && !delimiter(data[i])) i++; return { kind: 'name', value: new TextDecoder('latin1').decode(data.subarray(start + 1, i)), start, end: i } }
    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) { i++; return { kind: 'other', start, end: i } }
    while (i < data.length && !whitespace(data[i]) && !delimiter(data[i])) i++
    const text = new TextDecoder('latin1').decode(data.subarray(start, i))
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return { kind: 'number', value: Number(text), start, end: i }
    if (text === 'ID') { // inline image data runs until whitespace EI whitespace
      i++
      while (i < data.length && !(whitespace(data[i - 1]) && data[i] === 0x45 && data[i + 1] === 0x49 && (i + 2 >= data.length || whitespace(data[i + 2])))) i++
      i += 2
      return { kind: 'other', start, end: i }
    }
    return { kind: 'operator', value: text, start, end: i }
  }
  for (let token = readToken(); token; token = readToken()) yield token
}

type FontInfo = { baseFont: string; twoByte: boolean; width: (code: number) => number }

function fontInfo(document: PDFDocument, dict: PDFDict | undefined, cache: Map<PDFDict, FontInfo>): FontInfo {
  const fallback: FontInfo = { baseFont: 'Helvetica', twoByte: false, width: () => 500 }
  if (!dict) return fallback
  const cached = cache.get(dict); if (cached) return cached
  const base = dict.lookup(PDFName.of('BaseFont'))
  const baseFont = base instanceof PDFName ? base.asString().slice(1).replace(/^[A-Z]{6}\+/, '') : 'Helvetica'
  const subtype = dict.lookup(PDFName.of('Subtype'))
  let info: FontInfo
  if (subtype instanceof PDFName && subtype.asString() === '/Type0') {
    const descendants = dict.lookup(PDFName.of('DescendantFonts'))
    const cid = descendants instanceof PDFArray ? descendants.lookup(0) : undefined
    const widths = new Map<number, number>()
    let defaultWidth = 1000
    if (cid instanceof PDFDict) {
      const dw = cid.lookup(PDFName.of('DW')); if (dw instanceof PDFNumber) defaultWidth = dw.asNumber()
      const w = cid.lookup(PDFName.of('W'))
      if (w instanceof PDFArray) {
        for (let k = 0; k < w.size();) {
          const first = (w.lookup(k) as PDFNumber).asNumber(), next = w.lookup(k + 1)
          if (next instanceof PDFArray) { for (let j = 0; j < next.size(); j++) widths.set(first + j, (next.lookup(j) as PDFNumber).asNumber()); k += 2 }
          else { const last = (next as PDFNumber).asNumber(), value = (w.lookup(k + 2) as PDFNumber).asNumber(); for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, value); k += 3 }
        }
      }
    }
    info = { baseFont, twoByte: true, width: (code) => widths.get(code) ?? defaultWidth }
  } else {
    const widths = dict.lookup(PDFName.of('Widths')), first = dict.lookup(PDFName.of('FirstChar'))
    const descriptor = dict.lookup(PDFName.of('FontDescriptor'))
    const missing = descriptor instanceof PDFDict && descriptor.lookup(PDFName.of('MissingWidth')) instanceof PDFNumber ? (descriptor.lookup(PDFName.of('MissingWidth')) as PDFNumber).asNumber() : undefined
    if (widths instanceof PDFArray && first instanceof PDFNumber) {
      const values = widths.asArray().map((_, k) => { const v = widths.lookup(k); return v instanceof PDFNumber ? v.asNumber() : 0 })
      info = { baseFont, twoByte: false, width: (code) => values[code - first.asNumber()] ?? missing ?? 0 }
    } else {
      // Standard 14 fonts omit Widths; use pdf-lib's AFM metrics with WinAnsi codes.
      const standard = (Object.values(StandardFonts) as string[]).find((name) => name === baseFont) ?? (/Times/i.test(baseFont) ? StandardFonts.TimesRoman : /Courier/i.test(baseFont) ? StandardFonts.Courier : StandardFonts.Helvetica)
      const embedded = document.embedStandardFont(standard as StandardFonts)
      const memo = new Map<number, number>()
      info = { baseFont, twoByte: false, width: (code) => { if (!memo.has(code)) { let w = missing ?? 500; try { w = embedded.widthOfTextAtSize(String.fromCharCode(code), 1000) } catch { /* unencodable */ } memo.set(code, w) } return memo.get(code)! } }
    }
  }
  cache.set(dict, info)
  return info
}

function contentBytes(document: PDFDocument, contents: unknown): Uint8Array {
  const streams: PDFStream[] = []
  const resolve = (value: unknown) => value instanceof PDFRef ? document.context.lookup(value) : value
  const value = resolve(contents)
  if (value instanceof PDFArray) for (let k = 0; k < value.size(); k++) { const s = value.lookup(k); if (s instanceof PDFStream) streams.push(s) }
  else if (value instanceof PDFStream) streams.push(value)
  const parts = streams.map((stream) => stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : (stream as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents())
  const total = new Uint8Array(parts.reduce((sum, part) => sum + part.length + 1, 0))
  let offset = 0
  for (const part of parts) { total.set(part, offset); offset += part.length; total[offset++] = 0x0a }
  return total
}

/** Interpret a page's content and return every text-showing operation with its position, size, font and advance. */
export type StreamSource = { data: Uint8Array; ref?: PDFRef }
/** How a form XObject was reached: the stream that drew it, the resource name used and the resources dict it was looked up in. */
export type FormParent = { parent: string; name: string; resources: PDFDict }
export type ImageOp = { start: number; end: number; source: string; box: Box; rotated: boolean; width: number; height: number }

export function analyzePageText(document: PDFDocument, pageIndex: number): { data: Uint8Array; ops: ShowOp[]; images: ImageOp[]; streams: Map<string, StreamSource>; parents: Map<string, FormParent> } {
  const page = document.getPage(pageIndex)
  const data = contentBytes(document, page.node.get(PDFName.of('Contents')))
  const resources = page.node.Resources()
  let fonts = resources?.lookup(PDFName.of('Font'))
  let source = 'page'
  const images: ImageOp[] = []
  const streams = new Map<string, StreamSource>([['page', { data }]])
  const parents = new Map<string, FormParent>()
  const cache = new Map<PDFDict, FontInfo>()
  const ops: ShowOp[] = []
  type State = { ctm: Matrix; fill: [number, number, number]; font?: FontInfo; fontName: string; size: number; tc: number; tw: number; th: number; tl: number; rise: number }
  let state: State = { ctm: identity(), fill: [0, 0, 0], fontName: '', size: 12, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 }
  const stack: State[] = []
  let tm = identity(), tlm = identity()
  let operands: Token[] = []
  const num = (k: number) => { const t = operands[operands.length - k]; return t?.kind === 'number' ? t.value : 0 }
  const nextLine = () => { tlm = multiply([1, 0, 0, 1, 0, -state.tl], tlm); tm = [...tlm] as Matrix }
  const show = (pieces: (number[] | number)[], start: number, end: number, operator: string, rewritePrefix: string) => {
    const font = state.font ?? fontInfo(document, undefined, cache)
    const origin = apply(multiply([1, 0, 0, 1, 0, state.rise], multiply(tm, state.ctm)), 0, 0)
    let advance = 0, glyphs = 0
    for (const piece of pieces) {
      if (typeof piece === 'number') { advance -= piece / 1000 * state.size * state.th; continue }
      for (let k = 0; k < piece.length; k += font.twoByte ? 2 : 1) {
        glyphs++
        const code = font.twoByte ? (piece[k] << 8) | (piece[k + 1] ?? 0) : piece[k]
        advance += (font.width(code) / 1000 * state.size + state.tc + (!font.twoByte && code === 32 ? state.tw : 0)) * state.th
      }
    }
    const full = multiply(tm, state.ctm)
    const mid = apply(multiply([1, 0, 0, 1, advance / 2, state.rise + state.size * 0.35], full), 0, 0)
    const scale = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2]))
    const kern = state.size * state.th ? -advance * 1000 / (state.size * state.th) : 0
    ops.push({ start, end, operator, origin, mid, size: state.size * scale, angle: Math.atan2(full[1], full[0]) * 180 / Math.PI, font: state.fontName, baseFont: font.baseFont, color: state.fill, advance, glyphs, source, rewrite: `${rewritePrefix}[${Number(kern.toFixed(4))}] TJ` })
    tm = multiply([1, 0, 0, 1, advance, 0], tm)
  }
  const run = (bytes: Uint8Array, res: PDFDict | undefined, depth: number) => {
  fonts = res?.lookup(PDFName.of('Font'))
  for (const token of tokenize(bytes)) {
    if (token.kind !== 'operator') { operands.push(token); continue }
    const start = operands[0]?.start ?? token.start
    switch (token.value) {
      case 'q': stack.push({ ...state, ctm: [...state.ctm] as Matrix }); break
      case 'Q': state = stack.pop() ?? state; break
      case 'cm': state.ctm = multiply([num(6), num(5), num(4), num(3), num(2), num(1)], state.ctm); break
      case 'BT': tm = identity(); tlm = identity(); break
      case 'Tf': { const name = operands[operands.length - 2]; state.fontName = name?.kind === 'name' ? name.value : ''; state.size = num(1); const dict = fonts instanceof PDFDict ? fonts.lookup(PDFName.of(state.fontName)) : undefined; state.font = fontInfo(document, dict instanceof PDFDict ? dict : undefined, cache); break }
      case 'Tc': state.tc = num(1); break
      case 'Tw': state.tw = num(1); break
      case 'Tz': state.th = num(1) / 100; break
      case 'TL': state.tl = num(1); break
      case 'Ts': state.rise = num(1); break
      case 'Td': tlm = multiply([1, 0, 0, 1, num(2), num(1)], tlm); tm = [...tlm] as Matrix; break
      case 'TD': state.tl = -num(1); tlm = multiply([1, 0, 0, 1, num(2), num(1)], tlm); tm = [...tlm] as Matrix; break
      case 'Tm': tlm = [num(6), num(5), num(4), num(3), num(2), num(1)]; tm = [...tlm] as Matrix; break
      case 'T*': nextLine(); break
      case 'g': state.fill = [num(1), num(1), num(1)]; break
      case 'rg': state.fill = [num(3), num(2), num(1)]; break
      case 'k': { const [c, m, y, kk] = [num(4), num(3), num(2), num(1)]; state.fill = [(1 - c) * (1 - kk), (1 - m) * (1 - kk), (1 - y) * (1 - kk)]; break }
      case 'Tj': { const s = operands.at(-1); if (s?.kind === 'string') show([s.bytes], start, token.end, 'Tj', ''); break }
      case "'": { const s = operands.at(-1); nextLine(); if (s?.kind === 'string') show([s.bytes], start, token.end, "'", 'T* '); break }
      case '"': { const s = operands.at(-1); state.tw = num(3); state.tc = num(2); nextLine(); if (s?.kind === 'string') show([s.bytes], start, token.end, '"', `${num(3)} Tw ${num(2)} Tc T* `); break }
      case 'Do': {
        const name = operands.at(-1)
        const xobjects = res?.lookup(PDFName.of('XObject'))
        if (name?.kind !== 'name' || !(xobjects instanceof PDFDict) || depth >= 4) break
        const ref = xobjects.get(PDFName.of(name.value))
        const form = xobjects.lookup(PDFName.of(name.value))
        if (!(form instanceof PDFRawStream) || !(ref instanceof PDFRef)) break
        const subtype = form.dict.lookup(PDFName.of('Subtype'))
        if (subtype instanceof PDFName && subtype.asString() === '/Image') {
          const corners = [apply(state.ctm, 0, 0), apply(state.ctm, 1, 0), apply(state.ctm, 0, 1), apply(state.ctm, 1, 1)]
          const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1])
          const w = form.dict.lookup(PDFName.of('Width')), h = form.dict.lookup(PDFName.of('Height'))
          images.push({ start: name.start, end: token.end, source, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, rotated: Math.abs(state.ctm[1]) > 1e-6 || Math.abs(state.ctm[2]) > 1e-6, width: w instanceof PDFNumber ? w.asNumber() : 0, height: h instanceof PDFNumber ? h.asNumber() : 0 })
          break
        }
        if (!(subtype instanceof PDFName) || subtype.asString() !== '/Form') break
        let formData: Uint8Array
        try { formData = decodePDFRawStream(form).decode() } catch { break }
        const matrix = form.dict.lookup(PDFName.of('Matrix'))
        const m = matrix instanceof PDFArray && matrix.size() === 6 ? matrix.asArray().map((_, k) => { const v = matrix.lookup(k); return v instanceof PDFNumber ? v.asNumber() : 0 }) as Matrix : identity()
        const formResources = form.dict.lookup(PDFName.of('Resources'))
        const saved = { state: { ...state, ctm: [...state.ctm] as Matrix }, tm, tlm, fonts, source, stack: stack.length }
        state.ctm = multiply(m, state.ctm)
        if (!parents.has(ref.toString())) parents.set(ref.toString(), { parent: source, name: name.value, resources: res! })
        source = ref.toString()
        streams.set(source, { data: formData, ref })
        operands = []
        run(formData, formResources instanceof PDFDict ? formResources : res, depth + 1)
        state = saved.state; tm = saved.tm; tlm = saved.tlm; fonts = saved.fonts; source = saved.source; stack.length = saved.stack
        break
      }
      case 'TJ': { const a = operands.at(-1); if (a?.kind === 'array') show(a.items.map((item) => item.kind === 'number' ? item.value : item.kind === 'string' ? item.bytes : 0), start, token.end, 'TJ', ''); break }
    }
    operands = []
  }
  }
  run(data, resources, 0)
  return { data, ops, images, streams, parents }
}

const inside = (box: Box, [x, y]: [number, number], pad = 0) => x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad

function standardFor(baseFont: string): StandardFonts {
  const bold = /bold|black|heavy|semibold/i.test(baseFont), italic = /italic|oblique/i.test(baseFont)
  if (/times|serif|georgia|garamond|roman|minion|cambria/i.test(baseFont) && !/sans/i.test(baseFont)) return bold && italic ? StandardFonts.TimesRomanBoldItalic : bold ? StandardFonts.TimesRomanBold : italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman
  if (/courier|mono|consol/i.test(baseFont)) return bold && italic ? StandardFonts.CourierBoldOblique : bold ? StandardFonts.CourierBold : italic ? StandardFonts.CourierOblique : StandardFonts.Courier
  return bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica
}

/** Number of references to `target` anywhere in the document. */
function referenceCount(document: PDFDocument, target: PDFRef): number {
  let count = 0
  const seen = new Set<unknown>()
  const visit = (value: unknown) => {
    if (value instanceof PDFRef) { if (value === target || value.toString() === target.toString()) count++; return }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (value instanceof PDFDict) for (const [, entry] of value.entries()) visit(entry)
    else if (value instanceof PDFArray) for (const entry of value.asArray()) visit(entry)
    else if (value instanceof PDFStream) visit(value.dict)
  }
  for (const [, object] of document.context.enumerateIndirectObjects()) visit(object)
  return count
}

function splice(data: Uint8Array, ops: { start: number; end: number; rewrite: string }[]): Uint8Array {
  const pieces: Uint8Array[] = []
  let cursor = 0
  for (const op of [...ops].sort((a, b) => a.start - b.start)) { pieces.push(data.subarray(cursor, op.start), new TextEncoder().encode(op.rewrite)); cursor = op.end }
  pieces.push(data.subarray(cursor))
  const next = new Uint8Array(pieces.reduce((sum, part) => sum + part.length, 0))
  let offset = 0; for (const part of pieces) { next.set(part, offset); offset += part.length }
  return next
}

/**
 * Copy-on-write for form XObjects. A form drawn on other pages too (directly, or because an enclosing form
 * is) is cloned, and only this page's resources are repointed at the clone, so edits stay on this page.
 */
function pageLocalizer(document: PDFDocument, pageIndex: number, streams: Map<string, StreamSource>, parents: Map<string, FormParent>) {
  const counts = new Map<string, number>()
  const done = new Set<string>(['page'])
  const local = new Map<string, PDFDict>()
  const count = (source: string) => { if (!counts.has(source)) counts.set(source, referenceCount(document, streams.get(source)!.ref!)); return counts.get(source)! }
  let elsewhere: Set<string> | undefined
  /** Forms reachable from any other page's resources (covers resource dicts shared between pages). */
  const usedElsewhere = (source: string) => {
    if (!elsewhere) {
      const found = new Set<string>(), seen = new Set<PDFDict>()
      const walk = (resources: unknown) => {
        if (!(resources instanceof PDFDict) || seen.has(resources)) return
        seen.add(resources)
        const xobjects = resources.lookup(PDFName.of('XObject'))
        if (!(xobjects instanceof PDFDict)) return
        for (const [, value] of xobjects.entries()) {
          if (!(value instanceof PDFRef) || found.has(value.toString())) continue
          found.add(value.toString())
          const target = document.context.lookup(value)
          if (target instanceof PDFRawStream) walk(target.dict.lookup(PDFName.of('Resources')))
        }
      }
      document.getPages().forEach((page, index) => { if (index !== pageIndex) walk(page.node.Resources()) })
      elsewhere = found
    }
    return elsewhere.has(source)
  }
  const needsCopy = (source: string): boolean => source !== 'page' && (count(source) > 1 || usedElsewhere(source) || needsCopy(parents.get(source)!.parent))
  const holder = (source: string) => source === 'page' ? document.getPage(pageIndex).node : (document.context.lookup(streams.get(source)!.ref!) as PDFRawStream).dict
  /** A resources dict owned by `source` alone, with its own XObject dict, so names can be repointed safely. */
  const ownResources = (source: string, inherited: PDFDict) => {
    if (local.has(source)) return local.get(source)!
    const resources = inherited.clone(document.context)
    const xobjects = resources.lookup(PDFName.of('XObject'))
    if (xobjects instanceof PDFDict) resources.set(PDFName.of('XObject'), xobjects.clone(document.context))
    holder(source).set(PDFName.of('Resources'), resources)
    local.set(source, resources)
    return resources
  }
  const localize = (source: string) => {
    if (done.has(source)) return
    const { parent, name, resources } = parents.get(source)!
    localize(parent)
    const old = document.context.lookup(streams.get(source)!.ref!) as PDFRawStream
    const ref = document.context.register(PDFRawStream.of(old.dict.clone(document.context), old.contents))
    const xobjects = ownResources(parent, resources).lookup(PDFName.of('XObject')) as PDFDict
    xobjects.set(PDFName.of(name), ref)
    streams.set(source, { ...streams.get(source)!, ref })
    done.add(source)
  }
  return { prepare: (source: string) => { if (needsCopy(source)) { localize(source); return true } return false } }
}

/**
 * Replace existing text: glyphs whose midpoint falls inside each box are removed from the page content
 * or from a form XObject drawn on the page (positions of following text are preserved), then the replacement
 * is drawn at the original baseline with the closest standard font, size, colour and angle.
 * Form XObjects reused elsewhere (letterheads, footers) are copied for this page first, so other pages keep the original;
 * `localized` counts edits that needed such a copy.
 */
export async function editPageText(document: PDFDocument, pageIndex: number, edits: TextEdit[]): Promise<{ removed: number; unmatched: number; localized: number }> {
  const { ops, streams, parents } = analyzePageText(document, pageIndex)
  const removals = new Map<string, Map<number, ShowOp>>()
  const placements: { edit: TextEdit; anchor: ShowOp }[] = []
  let unmatched = 0
  for (const edit of edits) {
    const matched = ops.filter((op) => op.glyphs > 0 && inside(edit.box, op.mid, 0.5))
    if (!matched.length) { unmatched++; continue }
    for (const op of matched) { if (!removals.has(op.source)) removals.set(op.source, new Map()); removals.get(op.source)!.set(op.start, op) }
    placements.push({ edit, anchor: matched.reduce((best, op) => op.origin[0] < best.origin[0] ? op : best) })
  }
  const localizer = pageLocalizer(document, pageIndex, streams, parents)
  const copied = new Set([...removals.keys()].filter((source) => localizer.prepare(source)))
  let removed = 0
  for (const [source, chosen] of removals) {
    removed += chosen.size
    writeStream(document, pageIndex, source, streams.get(source)!, splice(streams.get(source)!.data, [...chosen.values()]))
  }
  const page = document.getPage(pageIndex)
  for (const { edit, anchor } of placements) {
    if (!edit.replacement) continue
    const font = await document.embedFont(standardFor(anchor.baseFont))
    try { font.encodeText(edit.replacement) } catch { throw new Error('Replacement text must use Latin characters supported by the standard PDF fonts.') }
    page.drawText(edit.replacement, { x: anchor.origin[0], y: anchor.origin[1], size: anchor.size, font, color: rgb(...anchor.color.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number]), rotate: degrees(anchor.angle) })
  }
  return { removed, unmatched, localized: placements.filter(({ edit }) => ops.some((op) => op.glyphs > 0 && copied.has(op.source) && inside(edit.box, op.mid, 0.5))).length }
}

export type ImageEdit = { box: Box; action: 'delete' | 'replace'; image?: Uint8Array }

function writeStream(document: PDFDocument, pageIndex: number, source: string, stream: StreamSource, next: Uint8Array) {
  if (source === 'page') { document.getPage(pageIndex).node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream(next))); return }
  const old = document.context.lookup(stream.ref!) as PDFRawStream
  const fresh = document.context.flateStream(next)
  for (const [key, value] of old.dict.entries()) if (!['/Length', '/Filter', '/DecodeParms'].includes(key.asString())) fresh.dict.set(key, value)
  document.context.assign(stream.ref!, fresh)
}

/**
 * Delete or replace placed images. The image's drawing operation is removed from the content stream
 * (the pixels are no longer rendered or extractable from this page); a replacement PNG/JPEG is fitted
 * into the same box, preserving its aspect ratio. Images inside forms reused on other pages are edited on a page-only copy.
 */
export async function editPageImages(document: PDFDocument, pageIndex: number, edits: ImageEdit[]): Promise<{ changed: number; unmatched: number; localized: number }> {
  const { images, streams, parents } = analyzePageText(document, pageIndex)
  const removals = new Map<string, ImageOp[]>()
  const replacements: { op: ImageOp; bytes: Uint8Array }[] = []
  let unmatched = 0
  for (const edit of edits) {
    const op = images.find((image) => inside(edit.box, [(image.box.x0 + image.box.x1) / 2, (image.box.y0 + image.box.y1) / 2], 0.5))
    if (!op) { unmatched++; continue }
    if (edit.action === 'replace') {
      if (!edit.image) throw new Error('Choose a PNG or JPEG image for the replacement.')
      if (op.rotated) throw new Error('Rotated or skewed images can be deleted but not replaced.')
      replacements.push({ op, bytes: edit.image })
    }
    if (!removals.has(op.source)) removals.set(op.source, [])
    if (!removals.get(op.source)!.includes(op)) removals.get(op.source)!.push(op)
  }
  const localizer = pageLocalizer(document, pageIndex, streams, parents)
  let localized = 0
  for (const [source, ops] of removals) {
    if (localizer.prepare(source)) localized += ops.length
    const stream = streams.get(source)!
    writeStream(document, pageIndex, source, stream, splice(stream.data, ops.map((op) => ({ ...op, rewrite: '' }))))
  }
  const page = document.getPage(pageIndex)
  for (const { op, bytes } of replacements) {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50, isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    if (!isPng && !isJpeg) throw new Error('Replacement images must be PNG or JPEG.')
    const embedded = isPng ? await document.embedPng(bytes) : await document.embedJpg(bytes)
    const boxWidth = op.box.x1 - op.box.x0, boxHeight = op.box.y1 - op.box.y0
    const scale = Math.min(boxWidth / embedded.width, boxHeight / embedded.height)
    const width = embedded.width * scale, height = embedded.height * scale
    page.drawImage(embedded, { x: op.box.x0 + (boxWidth - width) / 2, y: op.box.y0 + (boxHeight - height) / 2, width, height })
  }
  return { changed: [...removals.values()].reduce((sum, ops) => sum + ops.length, 0), unmatched, localized }
}
