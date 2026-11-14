export type Corner = { x: number; y: number }
export type Quad = [Corner, Corner, Corner, Corner] // top-left, top-right, bottom-right, bottom-left

function otsu(gray: Uint8Array) {
  const histogram = new Uint32Array(256)
  for (const value of gray) histogram[value]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let background = 0, weightBackground = 0, best = 0, threshold = 128
  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i]
    if (!weightBackground) continue
    const weightForeground = gray.length - weightBackground
    if (!weightForeground) break
    background += i * histogram[i]
    const between = weightBackground * weightForeground * (background / weightBackground - (sum - background) / weightForeground) ** 2
    if (between > best) { best = between; threshold = i }
  }
  return threshold
}

/**
 * Find the paper outline in an RGBA image: the largest bright connected region (paper on a darker surface).
 * Returns null when no confident outline is found, so callers keep the original photo.
 */
export function detectDocument(rgba: Uint8ClampedArray, width: number, height: number): Quad | null {
  const step = Math.max(1, Math.floor(Math.max(width, height) / 400))
  const w = Math.floor(width / step), h = Math.floor(height / step)
  const gray = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * step * width + x * step) * 4
    gray[y * w + x] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
  }
  const threshold = otsu(gray)
  const labels = new Int32Array(w * h).fill(-1)
  let bestLabel = -1, bestSize = 0
  const queue = new Int32Array(w * h)
  for (let start = 0, label = 0; start < gray.length; start++) {
    if (labels[start] !== -1 || gray[start] <= threshold) continue
    let head = 0, tail = 0, size = 0
    queue[tail++] = start; labels[start] = label
    while (head < tail) {
      const index = queue[head++]; size++
      const x = index % w, y = (index - x) / w
      for (const next of [x > 0 ? index - 1 : -1, x < w - 1 ? index + 1 : -1, y > 0 ? index - w : -1, y < h - 1 ? index + w : -1]) {
        if (next >= 0 && labels[next] === -1 && gray[next] > threshold) { labels[next] = label; queue[tail++] = next }
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = label }
    label++
  }
  if (bestLabel < 0 || bestSize < w * h * 0.15 || bestSize > w * h * 0.97) return null
  let tl = { s: Infinity, x: 0, y: 0 }, br = { s: -Infinity, x: 0, y: 0 }, tr = { s: -Infinity, x: 0, y: 0 }, bl = { s: Infinity, x: 0, y: 0 }
  for (let index = 0; index < labels.length; index++) {
    if (labels[index] !== bestLabel) continue
    const x = index % w, y = (index - x) / w
    if (x + y < tl.s) tl = { s: x + y, x, y }
    if (x + y > br.s) br = { s: x + y, x, y }
    if (x - y > tr.s) tr = { s: x - y, x, y }
    if (x - y < bl.s) bl = { s: x - y, x, y }
  }
  const scale = (c: { x: number; y: number }, dx: number, dy: number) => ({ x: Math.min(width, (c.x + dx) * step), y: Math.min(height, (c.y + dy) * step) })
  const quad: Quad = [scale(tl, 0, 0), scale(tr, 1, 0), scale(br, 1, 1), scale(bl, 0, 1)]
  // Reject degenerate shapes (all corners must be distinct and the quad reasonably convex).
  const area = Math.abs(quad.reduce((sum, c, i) => { const n = quad[(i + 1) % 4]; return sum + c.x * n.y - n.x * c.y }, 0)) / 2
  if (area < bestSize * step * step * 0.6) return null
  return quad
}

/** Solve the 3x3 homography mapping `from` corners onto `to` corners (Gaussian elimination). */
export function homography(from: Quad, to: Quad): number[] {
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i]
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r
    if (Math.abs(rows[pivot][col]) < 1e-12) throw new Error('Document corners are degenerate.')
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const factor = rows[r][col] / rows[col][col]
      for (let c = col; c < 9; c++) rows[r][c] -= factor * rows[col][c]
    }
  }
  return [...rows.map((row, i) => row[8] / row[i]), 1]
}

/** Warp the quad region into an upright rectangle with bilinear sampling. */
export function warpDocument(rgba: Uint8ClampedArray, width: number, height: number, quad: Quad, maxPixels = 16_000_000) {
  const distance = (a: Corner, b: Corner) => Math.hypot(a.x - b.x, a.y - b.y)
  let outW = Math.round(Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2])))
  let outH = Math.round(Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2])))
  const shrink = Math.min(1, Math.sqrt(maxPixels / Math.max(1, outW * outH)))
  outW = Math.max(1, Math.round(outW * shrink)); outH = Math.max(1, Math.round(outH * shrink))
  // Map output rectangle back to the source quad (inverse warp).
  const m = homography([{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], quad)
  const out = new Uint8ClampedArray(outW * outH * 4)
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const px = x + 0.5, py = y + 0.5
    const d = m[6] * px + m[7] * py + m[8]
    const sx = Math.min(width - 1, Math.max(0, (m[0] * px + m[1] * py + m[2]) / d - 0.5))
    const sy = Math.min(height - 1, Math.max(0, (m[3] * px + m[4] * py + m[5]) / d - 0.5))
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
    const fx = sx - x0, fy = sy - y0, o = (y * outW + x) * 4
    for (let c = 0; c < 4; c++) {
      const top = rgba[(y0 * width + x0) * 4 + c] * (1 - fx) + rgba[(y0 * width + x1) * 4 + c] * fx
      const bottom = rgba[(y1 * width + x0) * 4 + c] * (1 - fx) + rgba[(y1 * width + x1) * 4 + c] * fx
      out[o + c] = top * (1 - fy) + bottom * fy
    }
  }
  return { data: out, width: outW, height: outH }
}

/** "Document" filter: grayscale with a 2%/98% percentile contrast stretch so paper turns white and ink dark. */
export function enhanceDocument(rgba: Uint8ClampedArray) {
  const histogram = new Uint32Array(256), pixels = rgba.length / 4
  const luma = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) { luma[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000; histogram[luma[i]]++ }
  const percentile = (fraction: number) => { let count = 0; for (let i = 0; i < 256; i++) { count += histogram[i]; if (count >= pixels * fraction) return i } return 255 }
  const low = percentile(0.02), high = Math.max(low + 1, percentile(0.9))
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < pixels; i++) {
    const value = Math.max(0, Math.min(255, ((luma[i] - low) / (high - low)) * 255))
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = value; out[i * 4 + 3] = 255
  }
  return out
}
