import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib'
import { analyzePageText, editPageImages, editPageText, tokenize } from './text-edit'

async function pdfText(bytes: Uint8Array, pageNumber = 1) {
  const engine = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = engine.getDocument({ data: bytes.slice() })
  const document = await task.promise
  const page = await document.getPage(pageNumber)
  const text = (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ')
  await task.destroy()
  return text
}

async function rawPage(content: string) {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 300])
  const font = await document.embedFont(StandardFonts.Helvetica)
  page.node.setFontDictionary(PDFName.of('F1'), font.ref)
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream(content)))
  return document
}

describe('existing text editing', () => {
  it('tokenizes strings with escapes, nested parens, hex and inline images', () => {
    const tokens = [...tokenize(new TextEncoder().encode('(a\\(b\\) (c)) <4869> BI /W 1 ID xx EI [ (x) -20 ] TJ'))]
    expect(tokens[0]).toMatchObject({ kind: 'string', bytes: [...'a(b) (c)'].map(c => c.charCodeAt(0)) })
    expect(tokens[1]).toMatchObject({ kind: 'string', bytes: [0x48, 0x69] })
    expect(tokens.map(t => t.kind === 'operator' ? t.value : t.kind)).toEqual(['string', 'string', 'BI', 'name', 'number', 'other', 'array', 'TJ'])
  })

  it('removes the original glyphs, keeps neighbours, and draws the replacement', async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([400, 400])
    const font = await document.embedFont(StandardFonts.TimesRomanBold)
    page.drawText('Invoice total: $500', { x: 40, y: 300, size: 20, font, color: rgb(0.8, 0, 0) })
    page.drawText('Keep this line', { x: 40, y: 200, size: 12, font })
    const loaded = await PDFDocument.load(await document.save())
    const [target] = analyzePageText(loaded, 0).ops
    expect(target.origin[0]).toBeCloseTo(40); expect(target.origin[1]).toBeCloseTo(300); expect(target.size).toBeCloseTo(20)
    expect(target.color).toEqual([0.8, 0, 0])
    const result = await editPageText(loaded, 0, [{ box: { x0: 38, y0: 296, x1: 260, y1: 320 }, replacement: 'Invoice total: $450' }])
    expect(result).toEqual({ removed: 1, unmatched: 0, localized: 0 })
    const text = await pdfText(await loaded.save())
    expect(text).toContain('Invoice total: $450')
    expect(text).toContain('Keep this line')
    expect(text).not.toContain('$500')
    const after = analyzePageText(await PDFDocument.load(await loaded.save()), 0).ops
    const replacement = after.find(op => op.origin[1] > 290 && op.glyphs > 0)!
    expect(replacement.baseFont).toBe('Times-Bold')
    expect(replacement.size).toBeCloseTo(20)
  })

  it('preserves the position of text that follows a removed run in the same text object', async () => {
    const document = await rawPage('BT /F1 20 Tf 50 200 Td (Hello ) Tj (World) Tj ET')
    const before = analyzePageText(document, 0).ops
    expect(before).toHaveLength(2)
    const worldX = before[1].origin[0]
    expect(worldX).toBeGreaterThan(100)
    await editPageText(document, 0, [{ box: { x0: 49, y0: 195, x1: worldX - 1, y1: 225 }, replacement: '' }])
    const after = analyzePageText(document, 0).ops.filter(op => op.glyphs > 0)
    expect(after).toHaveLength(1)
    expect(after[0].origin[0]).toBeCloseTo(worldX, 3)
    expect(await pdfText(await document.save())).not.toContain('Hello')
  })

  it('handles TJ arrays, quote operators and scaled CTM, and reports unmatched boxes', async () => {
    const document = await rawPage("q 2 0 0 2 0 0 cm BT /F1 10 Tf 14 TL 10 100 Td [(Ab) -500 (cd)] TJ (next) ' ET Q")
    const ops = analyzePageText(document, 0).ops
    expect(ops.map(op => op.operator)).toEqual(['TJ', "'"])
    expect(ops[0].origin).toEqual([20, 200])
    expect(ops[0].size).toBeCloseTo(20)
    expect(ops[1].origin[1]).toBeCloseTo(172)
    const result = await editPageText(document, 0, [{ box: { x0: 0, y0: 0, x1: 5, y1: 5 }, replacement: 'x' }])
    expect(result).toEqual({ removed: 0, unmatched: 1, localized: 0 })
  })

  it('edits text inside a single-use form XObject, honouring its Matrix', async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([300, 300])
    const font = await document.embedFont(StandardFonts.Helvetica)
    const form = document.context.register(document.context.flateStream('BT /F1 10 Tf 0 0 Td (Secret plan) Tj ET', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Matrix: [2, 0, 0, 2, 40, 100], Resources: { Font: { F1: font.ref } } }))
    page.node.setXObject(PDFName.of('Fm1'), form)
    page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream('q /Fm1 Do Q BT /F1 12 Tf 40 40 Td (Footer) Tj ET')))
    page.node.setFontDictionary(PDFName.of('F1'), font.ref)
    const loaded = await PDFDocument.load(await document.save())
    const ops = analyzePageText(loaded, 0).ops
    const inner = ops.find(op => op.source !== 'page')!
    expect(inner.origin).toEqual([40, 100])
    expect(inner.size).toBeCloseTo(20)
    const result = await editPageText(loaded, 0, [{ box: { x0: 35, y0: 95, x1: 200, y1: 125 }, replacement: 'Public plan' }])
    expect(result).toEqual({ removed: 1, unmatched: 0, localized: 0 })
    const text = await pdfText(await loaded.save())
    expect(text).toContain('Public plan')
    expect(text).toContain('Footer')
    expect(text).not.toContain('Secret')
  })

  it('edits a form XObject reused on other pages on this page only', async () => {
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    const form = document.context.register(document.context.flateStream('BT /F1 10 Tf 0 0 Td (Letterhead) Tj ET', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: { Font: { F1: font.ref } } }))
    const resources = document.context.register(document.context.obj({ XObject: { Fm1: form } }))
    for (let i = 0; i < 2; i++) {
      const page = document.addPage([300, 300])
      page.node.set(PDFName.of('Resources'), resources)
      page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream('q 1 0 0 1 20 250 cm /Fm1 Do Q')))
    }
    const loaded = await PDFDocument.load(await document.save())
    const result = await editPageText(loaded, 0, [{ box: { x0: 15, y0: 245, x1: 100, y1: 265 }, replacement: 'New Letterhead' }])
    expect(result).toEqual({ removed: 1, unmatched: 0, localized: 1 })
    const saved = await loaded.save()
    expect(await pdfText(saved, 1)).toBe('New Letterhead')
    expect(await pdfText(saved, 2)).toBe('Letterhead')
  })

  it('copies the enclosing form when a nested form is only reachable through a shared one', async () => {
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    const inner = document.context.register(document.context.flateStream('BT /F1 10 Tf 0 0 Td (Footer) Tj ET', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: { Font: { F1: font.ref } } }))
    const outer = document.context.register(document.context.flateStream('q 1 0 0 1 10 10 cm /In Do Q', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 300, 300], Resources: { XObject: { In: inner } } }))
    for (let i = 0; i < 2; i++) {
      const page = document.addPage([300, 300])
      page.node.setXObject(PDFName.of('Out'), outer)
      page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream('/Out Do')))
    }
    const loaded = await PDFDocument.load(await document.save())
    const result = await editPageImages(loaded, 1, [])
    expect(result.changed).toBe(0)
    const edit = await editPageText(loaded, 1, [{ box: { x0: 5, y0: 5, x1: 80, y1: 25 }, replacement: '' }])
    expect(edit).toEqual({ removed: 1, unmatched: 0, localized: 1 })
    const saved = await loaded.save()
    expect(await pdfText(saved, 1)).toBe('Footer')
    expect(await pdfText(saved, 2)).toBe('')
  })

  it('locates, deletes and replaces placed images', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    const document = await PDFDocument.create()
    const page = document.addPage([400, 400])
    const image = await document.embedPng(png)
    page.drawImage(image, { x: 50, y: 50, width: 100, height: 60 })
    page.drawImage(image, { x: 250, y: 250, width: 80, height: 80 })
    const loaded = await PDFDocument.load(await document.save())
    const { images } = analyzePageText(loaded, 0)
    expect(images.map(i => i.box)).toEqual([{ x0: 50, y0: 50, x1: 150, y1: 110 }, { x0: 250, y0: 250, x1: 330, y1: 330 }])
    const result = await editPageImages(loaded, 0, [{ box: { x0: 40, y0: 40, x1: 160, y1: 120 }, action: 'delete' }, { box: { x0: 245, y0: 245, x1: 335, y1: 335 }, action: 'replace', image: png }])
    expect(result).toEqual({ changed: 2, unmatched: 0, localized: 0 })
    const after = analyzePageText(await PDFDocument.load(await loaded.save()), 0).images
    expect(after.map(i => i.box)).toEqual([{ x0: 250, y0: 250, x1: 330, y1: 330 }])
    await expect(editPageImages(loaded, 0, [{ box: { x0: 245, y0: 245, x1: 335, y1: 335 }, action: 'replace', image: new Uint8Array([1, 2]) }])).rejects.toThrow(/PNG or JPEG/)
    expect((await editPageImages(loaded, 0, [{ box: { x0: 0, y0: 0, x1: 5, y1: 5 }, action: 'delete' }])).unmatched).toBe(1)
  })
})
