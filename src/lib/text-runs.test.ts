import { describe, expect, it } from 'vitest'
import { textRunSpans, type PositionedRun } from './text-runs'

function horizontal(text: string, start: number, end: number, baseline = 20): PositionedRun {
  return { text, start: [start, baseline], end: [end, baseline], height: 10 }
}

describe('positioned text matching', () => {
  it('joins adjacent mixed-format fragments and preserves their source spans', () => {
    const runs = [horizontal('sec', 0, 15), horizontal('ret', 15, 30)]
    expect(textRunSpans(runs, true)).toEqual({
      text: 'secret',
      spans: [{ index: 0, start: 0, end: 3 }, { index: 1, start: 3, end: 6 }],
    })
    expect(textRunSpans(runs, false).text).toBe('sec ret')
  })

  it('matches adjacent fragments along rotated baselines', () => {
    const runs: PositionedRun[] = [
      { text: 'sec', start: [20, 0], end: [20, 15], height: 10 },
      { text: 'ret', start: [20, 16], end: [20, 31], height: 10 },
    ]
    expect(textRunSpans(runs, true).text).toBe('secret')
  })

  it('keeps line breaks even when coordinates touch', () => {
    const runs = [{ ...horizontal('sec', 0, 15), breakAfter: true }, horizontal('ret', 15, 30)]
    expect(textRunSpans(runs, true).text).toBe('sec\nret')
  })

  it.each([
    horizontal('ret', 19, 34),
    horizontal('ret', 15, 30, 30),
    horizontal('ret', 0, 15),
    { ...horizontal('ret', 15, 30), height: 0 },
  ])('does not join distant, overlapping or degenerate runs', (next) => {
    expect(textRunSpans([horizontal('sec', 0, 15), next], true).text).toBe('sec ret')
  })

  it('handles an empty source without manufacturing spans', () => {
    expect(textRunSpans([], true)).toEqual({ text: '', spans: [] })
  })
})
