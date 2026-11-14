import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspaceTools, { splitStroke } from '../components/WorkspaceTools'
import { PDFDocument } from 'pdf-lib'
import { processFiles } from './pdf'
import { calculateTotals, moneyToPaise, type BusinessItem } from './business'

const item: BusinessItem = { id: 'one', name: 'Notebook', quantity: 2, price: 100, gstRate: 18, discount: 0 }

describe('business arithmetic (integer paise)', () => {
  it('splits intra-state tax and preserves the total', () => {
    expect(calculateTotals([item], 'intra')).toMatchObject({ taxable: 20000, cgst: 1800, sgst: 1800, igst: 0, total: 23600 })
  })
  it('applies inter-state IGST only', () => {
    expect(calculateTotals([item], 'inter')).toMatchObject({ cgst: 0, sgst: 0, igst: 3600, total: 23600 })
  })
  it('discounts before tax, supporting fractional quantities', () => {
    expect(calculateTotals([{ ...item, quantity: 1.5, price: 99.99, discount: 10 }], 'intra')).toMatchObject({ gross: 14999, discount: 1500, taxable: 13499, tax: 2430, total: 15929 })
  })
  it('assigns an odd tax paise without losing money', () => {
    const result = calculateTotals([{ ...item, quantity: 1, price: 0.10, gstRate: 5 }], 'intra')
    expect(result.tax).toBe(1)
    expect(result.cgst + result.sgst).toBe(result.tax)
    expect(result.total).toBe(11)
  })
  it('aggregates mixed rates and free items', () => {
    expect(calculateTotals([item, { ...item, price: 10, quantity: 1, gstRate: 5 }, { ...item, price: 0 }], 'inter')).toMatchObject({ taxable: 21000, tax: 3650, total: 24650 })
  })
  it('supports empty carts and fully discounted items', () => {
    expect(calculateTotals([], 'intra').total).toBe(0)
    expect(calculateTotals([{ ...item, discount: 100 }], 'inter').total).toBe(0)
  })
  it('rounds decimal prices to paise', () => {
    expect(moneyToPaise(1.005)).toBe(101)
    expect(moneyToPaise(19.99)).toBe(1999)
    expect(moneyToPaise(10.075)).toBe(1008)
    expect(moneyToPaise(1e-7)).toBe(0)
    expect(moneyToPaise(1_000_000_000)).toBe(100_000_000_000)
  })
  it('uses rounded unit prices consistently in invoice totals', () => {
    expect(calculateTotals([{ ...item, price: 10.075, gstRate: 0 }], 'inter').total).toBe(2016)
  })
  it.each(['quantity', 'price', 'gstRate', 'discount'] as const)('rejects invalid %s', (field) => {
    for (const value of [-1, NaN, Infinity]) expect(() => calculateTotals([{ ...item, [field]: value }], 'intra')).toThrow()
  })
  it('rejects invalid percentages and overflow', () => {
    expect(() => calculateTotals([{ ...item, discount: 101 }], 'intra')).toThrow()
    expect(() => calculateTotals([{ ...item, price: 1_000_000_000, quantity: 1_000_000 }], 'inter')).toThrow()
    expect(() => calculateTotals([{ ...item, price: 1_000_000_000, quantity: 1_000_000, discount: 100 }], 'intra')).toThrow()
  })
  it('rejects invalid modes and aggregate overflow', () => {
    expect(() => calculateTotals([], 'other' as never)).toThrow()
    const expensive = { ...item, price: 1_000_000_000, quantity: 50_000, gstRate: 0 }
    expect(() => calculateTotals([expensive, expensive], 'intra')).toThrow('Invoice exceeds')
  })
})

describe('workspace tools', () => {
  it.each(['scan', 'workflow', 'thumbmark', 'compare', 'invoice', 'pos', 'gst-prep', 'share', 'whiteboard', 'edit'])('renders the %s workspace', (toolId) => {
    const markup = renderToStaticMarkup(createElement(WorkspaceTools, { toolId, files: [] }))
    expect(markup).toContain('<section')
    expect(markup).not.toContain('Unknown workspace tool')
  })

  it('states the limits of sharing, comparison, and PDF editing', () => {
    const render = (toolId: string) => renderToStaticMarkup(createElement(WorkspaceTools, { toolId, files: [] }))
    expect(render('share')).toContain('manual signaling')
    expect(render('share')).toContain('TURN, which this tool does not provide')
    expect(render('whiteboard')).toContain('Earlier strokes are local practice')
    expect(render('compare')).toContain('Pages are matched by position')
    expect(render('edit')).toContain('original glyphs are removed from the page content')
    expect(render('edit')).toContain('NOT secure redaction')
    expect(render('scan')).toContain('No OCR')
    expect(render('scan')).toContain('Auto-crop &amp; straighten')
    expect(render('thumbmark')).toContain('not biometric verification')
    expect(render('gst-prep')).toContain('does not prepare returns')
    expect(render('invoice')).toContain('Not tax advice')
    expect(render('pos')).toContain('not synchronized')
  })

  it('passes each PDF workflow output into the next operation', async () => {
    const source = await PDFDocument.create()
    source.addPage([200, 300])
    source.addPage([400, 500])
    const first = new File([new Uint8Array(await source.save()).buffer], 'source.pdf', { type: 'application/pdf' })
    let current = [first, first]
    for (const [tool, options] of [
      ['merge', {}],
      ['rotate', { rotation: 90 }],
      ['organize', { pages: '4,1' }],
      ['watermark', { text: 'TEST' }],
      ['numbers', {}],
      ['metadata', { title: 'Workflow test' }],
      ['compress', {}],
    ] as const) {
      const output = await processFiles(tool, current, options)
      current = [new File([output.blob], output.filename, { type: 'application/pdf' })]
    }
    const result = await PDFDocument.load(await current[0].arrayBuffer())
    expect(result.getPageCount()).toBe(2)
    expect(result.getTitle()).toBe('Workflow test')
    expect(result.getPages().map((page) => page.getRotation().angle)).toEqual([90, 90])
    expect(result.getPages().map((page) => page.getWidth())).toEqual([400, 200])
  })

  it('splits long whiteboard strokes into small, continuous WebRTC messages', () => {
    const points = Array.from({ length: 2000 }, (_, index) => ({ x: index / 1999, y: 1 - index / 1999 }))
    const stroke = { points, color: '#263e28', width: 3 }
    const parts = splitStroke(stroke)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0].points[0]).toEqual(points[0])
    expect(parts.at(-1)!.points.at(-1)).toEqual(points.at(-1))
    for (const [index, part] of parts.entries()) {
      expect(part.points.length).toBeLessThanOrEqual(128)
      expect(new TextEncoder().encode(JSON.stringify({ kind: 'stroke', stroke: part })).byteLength).toBeLessThan(16_384)
      if (index) expect(part.points[0]).toEqual(parts[index - 1].points.at(-1))
    }
    expect(parts.flatMap((part, index) => index ? part.points.slice(1) : part.points)).toEqual(points)
  })

  it('preserves a single-point stroke', () => {
    const stroke = { points: [{ x: 0.5, y: 0.5 }], color: '#000000', width: 1 }
    expect(splitStroke(stroke)).toEqual([stroke])
  })
})
