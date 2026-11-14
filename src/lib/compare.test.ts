import { describe, expect, it } from 'vitest'
import { comparisonReport, diffWords, pixelDiff } from './compare'

describe('compare', () => {
  it('produces a minimal word diff', () => {
    expect(diffWords('the quick brown fox', 'the slow brown fox jumps')).toEqual([
      { type: 'same', text: 'the' }, { type: 'removed', text: 'quick' }, { type: 'added', text: 'slow' }, { type: 'same', text: 'brown fox' }, { type: 'added', text: 'jumps' },
    ])
    expect(diffWords('a  b', 'a b')).toEqual([{ type: 'same', text: 'a b' }])
    expect(diffWords('', '')).toEqual([])
  })

  it('falls back to block diff for huge inputs', () => {
    expect(diffWords('x y z', 'x y', 2).map(p => p.type)).toEqual(['removed', 'added'])
  })

  it('detects changed pixels and colours added vs removed ink', () => {
    const white = [255, 255, 255, 255], black = [0, 0, 0, 255]
    const a = new Uint8ClampedArray([...white, ...black, ...white])
    const b = new Uint8ClampedArray([...black, ...black, ...white])
    const result = pixelDiff(a, b, 3, 1)
    expect(result.changed).toBe(1)
    expect(result.ratio).toBeCloseTo(1 / 3)
    expect(Array.from(result.overlay.slice(0, 4))).toEqual([22, 163, 74, 255])
    const back = pixelDiff(b, a, 3, 1)
    expect(Array.from(back.overlay.slice(0, 4))).toEqual([220, 38, 38, 255])
    expect(() => pixelDiff(a, b, 2, 1)).toThrow(/matching/)
  })

  it('escapes document text in the HTML report', () => {
    const html = comparisonReport('<a>', 'b', [{ page: 1, status: 'changed', textChanges: 1, visualRatio: 0.5, parts: [{ type: 'added', text: '<script>' }] }])
    expect(html).toContain('<ins>&lt;script&gt;</ins>')
    expect(html).not.toContain('<script>')
  })
})
