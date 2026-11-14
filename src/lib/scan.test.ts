import { describe, expect, it } from 'vitest'
import { detectDocument, enhanceDocument, homography, warpDocument, type Quad } from './scan'

function photo(width: number, height: number, inside: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = inside(x, y) ? 235 : 40, p = (y * width + x) * 4
    data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255
  }
  return data
}

describe('scan correction', () => {
  it('finds a tilted sheet of paper on a dark desk', () => {
    // Paper as a rotated square (diamond-ish quad) centred in a 200x200 photo.
    const quad: Quad = [{ x: 60, y: 30 }, { x: 170, y: 60 }, { x: 140, y: 170 }, { x: 30, y: 140 }]
    const inside = (x: number, y: number) => quad.every((a, i) => { const b = quad[(i + 1) % 4]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0 })
    const found = detectDocument(photo(200, 200, inside), 200, 200)!
    expect(found).not.toBeNull()
    found.forEach((corner, i) => { expect(Math.abs(corner.x - quad[i].x)).toBeLessThan(4); expect(Math.abs(corner.y - quad[i].y)).toBeLessThan(4) })
  })

  it('returns null when there is no distinct document', () => {
    expect(detectDocument(photo(50, 50, () => true), 50, 50)).toBeNull()
    expect(detectDocument(photo(50, 50, (x, y) => x < 3 && y < 3), 50, 50)).toBeNull()
  })

  it('solves a homography that maps corners exactly', () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const to: Quad = [{ x: 5, y: 3 }, { x: 25, y: 4 }, { x: 22, y: 30 }, { x: 2, y: 28 }]
    const m = homography(from, to)
    from.forEach((p, i) => { const d = m[6] * p.x + m[7] * p.y + m[8]; expect((m[0] * p.x + m[1] * p.y + m[2]) / d).toBeCloseTo(to[i].x); expect((m[3] * p.x + m[4] * p.y + m[5]) / d).toBeCloseTo(to[i].y) })
  })

  it('warps the detected region into an upright, paper-only image', () => {
    const data = photo(100, 100, (x, y) => x >= 20 && x < 80 && y >= 10 && y < 90)
    const result = warpDocument(data, 100, 100, [{ x: 20, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 90 }, { x: 20, y: 90 }])
    expect([result.width, result.height]).toEqual([60, 80])
    for (let p = 0; p < result.data.length; p += 4) expect(result.data[p]).toBeGreaterThan(200)
  })

  it('stretches contrast so paper becomes white', () => {
    const grey = new Uint8ClampedArray(400).map((_, i) => i % 4 === 3 ? 255 : (i < 40 ? 60 : 180))
    const out = enhanceDocument(grey)
    expect(out[0]).toBe(0)
    expect(out[396]).toBe(255)
  })
})
