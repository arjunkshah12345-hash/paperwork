import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, FileImage } from 'lucide-react'

export default function PdfPreview({ file }: { file: File }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { setPage(1) }, [file])
  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    setLoading(true)
    setError('')
    async function render() {
      if (file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name)) {
        const url = URL.createObjectURL(file)
        const image = new window.Image()
        cleanup = () => URL.revokeObjectURL(url)
        image.src = url
        await image.decode()
        if (disposed || !canvas.current) return
        const scale = Math.min(650 / image.width, 820 / image.height, 1)
        canvas.current.width = image.width * scale
        canvas.current.height = image.height * scale
        canvas.current.getContext('2d')!.drawImage(image, 0, 0, canvas.current.width, canvas.current.height)
        setTotal(1)
      } else {
        const pdfjs = await import('pdfjs-dist')
        const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        cleanup = () => { void document.destroy() }
        if (disposed) { cleanup(); return }
        setTotal(document.numPages)
        const pdfPage = await document.getPage(Math.min(page, document.numPages))
        const viewport = pdfPage.getViewport({ scale: 1.2 })
        if (disposed || !canvas.current) return
        canvas.current.width = viewport.width
        canvas.current.height = viewport.height
        await pdfPage.render({ canvas: canvas.current, canvasContext: canvas.current.getContext('2d')!, viewport }).promise
      }
      if (!disposed) setLoading(false)
    }
    void render().catch(() => { if (!disposed) { setError('Preview unavailable. The file may be encrypted or damaged.'); setLoading(false) } })
    return () => { disposed = true; cleanup() }
  }, [file, page])
  return <div className="preview-container">
    <div className="preview-toolbar"><span><FileImage size={15} /> Document preview</span><span>{total} {total === 1 ? 'page' : 'pages'}</span></div>
    <div className="preview-paper">{loading && <div className="preview-state"><LoaderCircle className="spin" size={24} />Loading preview…</div>}{error && <div className="preview-state">{error}</div>}<canvas ref={canvas} style={{ visibility: loading || error ? 'hidden' : 'visible' }} /></div>
    <div className="preview-pagination"><button className="icon-button" aria-label="Previous page" onClick={() => setPage(page - 1)} disabled={page <= 1 || loading}><ChevronLeft size={16} /></button><span>Page {page} of {total}</span><button className="icon-button" aria-label="Next page" onClick={() => setPage(page + 1)} disabled={page >= total || loading}><ChevronRight size={16} /></button></div>
  </div>
}
