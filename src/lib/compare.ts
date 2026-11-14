export type DiffPart = { type: 'same' | 'added' | 'removed'; text: string }

/** Word-level diff using an LCS table. Inputs beyond `limit` words fall back to a coarse whole-block diff. */
export function diffWords(before: string, after: string, limit = 3000): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean), b = after.split(/\s+/).filter(Boolean)
  if (a.join(' ') === b.join(' ')) return a.length ? [{ type: 'same', text: a.join(' ') }] : []
  if (a.length > limit || b.length > limit) return [...(a.length ? [{ type: 'removed' as const, text: a.join(' ') }] : []), ...(b.length ? [{ type: 'added' as const, text: b.join(' ') }] : [])]
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], word: string) => { const last = parts.at(-1); if (last?.type === type) last.text += ` ${word}`; else parts.push({ type, text: word }) }
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ } else if (table[i + 1][j] >= table[i][j + 1]) push('removed', a[i++]); else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

/**
 * Compare two same-sized RGBA buffers. Returns the changed-pixel ratio and an overlay
 * where unchanged pixels are faded and changed pixels are red (removed ink) or green (added ink).
 */
export function pixelDiff(before: Uint8ClampedArray, after: Uint8ClampedArray, width: number, height: number, tolerance = 40) {
  if (before.length !== width * height * 4 || after.length !== before.length) throw new Error('Page images must have matching dimensions.')
  const overlay = new Uint8ClampedArray(before.length)
  let changed = 0
  for (let p = 0; p < before.length; p += 4) {
    const la = (before[p] * 299 + before[p + 1] * 587 + before[p + 2] * 114) / 1000
    const lb = (after[p] * 299 + after[p + 1] * 587 + after[p + 2] * 114) / 1000
    const delta = Math.max(Math.abs(before[p] - after[p]), Math.abs(before[p + 1] - after[p + 1]), Math.abs(before[p + 2] - after[p + 2]))
    if (delta > tolerance) {
      changed++
      const added = lb < la
      overlay[p] = added ? 22 : 220; overlay[p + 1] = added ? 163 : 38; overlay[p + 2] = added ? 74 : 38; overlay[p + 3] = 255
    } else {
      const fade = 255 - (255 - lb) * 0.25
      overlay[p] = overlay[p + 1] = overlay[p + 2] = fade; overlay[p + 3] = 255
    }
  }
  return { ratio: changed / (width * height), changed, overlay }
}

export type PageComparison = { page: number; status: 'same' | 'changed' | 'added' | 'removed'; textChanges: number; visualRatio: number; parts: DiffPart[]; overlay?: string }

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function comparisonReport(original: string, revised: string, pages: PageComparison[]): string {
  const body = pages.map(page => `<section><h2>Page ${page.page} — ${page.status}${page.status === 'changed' ? ` (${page.textChanges} text edits, ${(page.visualRatio * 100).toFixed(2)}% pixels)` : ''}</h2>${page.overlay ? `<img alt="Visual difference for page ${page.page}" src="${page.overlay}">` : ''}<p>${page.parts.map(part => part.type === 'same' ? escapeHtml(part.text) : `<${part.type === 'added' ? 'ins' : 'del'}>${escapeHtml(part.text)}</${part.type === 'added' ? 'ins' : 'del'}>`).join(' ')}</p></section>`).join('\n')
  return `<!doctype html><meta charset="utf-8"><title>Comparison</title><style>body{font:15px/1.6 system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}ins{background:#d9f7e0;text-decoration:none}del{background:#fde0e0}img{max-width:100%;border:1px solid #ccc}</style><h1>${escapeHtml(original)} → ${escapeHtml(revised)}</h1><p>Red: content only in the original. Green: content only in the revision. Generated locally.</p>${body}`
}
