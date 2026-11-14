import { useEffect, useRef, useState } from 'react'
import { Copy, Trash2, Undo2 } from 'lucide-react'

type Props = { file: File; value: string; onChange: (pages: string) => void }

/** Collapse a page order like [1,2,3,5] into "1-3, 5" (1-based, order preserved). */
export function formatOrder(order: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1] === order[j] + 1) j++
    parts.push(j > i ? `${order[i]}-${order[j]}` : String(order[i])); i = j + 1
  }
  return parts.join(', ')
}

export default function PageSorter({ file, value, onChange }: Props) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [error, setError] = useState('')
  const dragging = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    let destroy = () => {}
    setThumbs([]); setError('')
    void (async () => {
      const engine = await import('pdfjs-dist'); const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); engine.GlobalWorkerOptions.workerSrc = worker.default
      const task = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); destroy = () => { void task.destroy() }
      const document = await task.promise
      if (cancelled) return
      if (document.numPages > 500) throw new Error('Thumbnail sorting supports up to 500 pages; use the page order field.')
      setOrder(Array.from({ length: document.numPages }, (_, index) => index + 1))
      const urls: string[] = []
      for (let number = 1; number <= document.numPages && !cancelled; number++) {
        const page = await document.getPage(number)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: 140 / Math.max(base.width, base.height) })
        const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport, background: 'white' }).promise
        urls.push(canvas.toDataURL('image/jpeg', 0.7)); canvas.width = 0; page.cleanup()
        if (number % 8 === 0 || number === document.numPages) setThumbs([...urls])
      }
    })().catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not render thumbnails.') })
    return () => { cancelled = true; destroy() }
  }, [file])
  // Keep the text field in sync when the user types an order directly.
  useEffect(() => {
    if (!thumbs.length) return
    if (!value.trim()) { setOrder(thumbs.map((_, index) => index + 1)); return }
    const parsed: number[] = []
    for (const part of value.split(',')) {
      const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part)
      if (!match) return
      const start = Number(match[1]), end = match[2] ? Number(match[2]) : start
      if (start < 1 || end < 1 || start > thumbs.length || end > thumbs.length) return
      for (let page = start; ; page += start <= end ? 1 : -1) { parsed.push(page); if (page === end) break }
    }
    setOrder(parsed)
  }, [value, thumbs.length])
  function commit(next: number[]) { setOrder(next); onChange(next.length ? formatOrder(next) : '') }
  function move(from: number, to: number) { if (from === to) return; const next = [...order]; const [item] = next.splice(from, 1); next.splice(to, 0, item); commit(next) }
  if (error) return <p className="settings-copy" role="alert">{error}</p>
  return <div className="page-sorter">
    <div className="page-sorter-head"><small>Drag pages to reorder. {order.length} pages in output.</small><button type="button" className="start-over" onClick={() => commit(thumbs.map((_, index) => index + 1))}><Undo2 size={14} /> Reset</button></div>
    <ol className="page-grid" aria-label="Page order">{order.map((page, index) => <li key={`${page}-${index}`} className={over === index ? 'drop-target' : ''} draggable
      onDragStart={(event) => { dragging.current = index; event.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(event) => { event.preventDefault(); setOver(index) }} onDragLeave={() => setOver(null)}
      onDrop={(event) => { event.preventDefault(); setOver(null); if (dragging.current !== null) move(dragging.current, index); dragging.current = null }}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' && index > 0) move(index, index - 1); if (event.key === 'ArrowRight' && index < order.length - 1) move(index, index + 1) }} tabIndex={0} aria-label={`Page ${page}, position ${index + 1}. Use arrow keys to move.`}>
      {thumbs[page - 1] ? <img src={thumbs[page - 1]} alt="" draggable={false} /> : <span className="thumb-loading" />}
      <span className="page-label">{page}</span>
      <span className="page-actions"><button type="button" aria-label={`Duplicate page ${page}`} onClick={() => commit([...order.slice(0, index + 1), page, ...order.slice(index + 1)])}><Copy size={13} /></button><button type="button" aria-label={`Remove page ${page}`} disabled={order.length === 1} onClick={() => commit(order.filter((_, position) => position !== index))}><Trash2 size={13} /></button></span>
    </li>)}</ol>
  </div>
}
