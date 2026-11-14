import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import PdfPreview from './PdfPreview'
import { processFiles, type ProcessOptions, type ToolId } from '../lib/pdf'
import type { PageComparison } from '../lib/compare'
import { parseWorkflow, runWorkflow, type SavedWorkflow, type WorkflowBranch, type WorkflowStep } from '../lib/workflow'
import { calculateTotals, formatMoney, moneyToPaise, type BusinessItem, type TaxMode } from '../lib/business'

type Props = { toolId: string; files: File[] }
type Point = { x: number; y: number }
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }
const stack: CSSProperties = { display: 'grid', gap: 16 }
const panel: CSSProperties = { ...stack, padding: 20, border: '1px solid #d7d7ce', borderRadius: 12, background: '#fff', color: '#242923', minWidth: 0 }
const field: CSSProperties = { padding: '9px 11px', border: '1px solid #b9c1b5', borderRadius: 6, background: '#fff', color: '#242923', maxWidth: '100%', boxSizing: 'border-box' }
const button: CSSProperties = { ...field, cursor: 'pointer', background: '#eef2e9', fontWeight: 600 }
const note: CSSProperties = { margin: 0, color: '#566151', fontSize: 13, lineHeight: 1.6 }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function pdfBlob(document: PDFDocument) {
  return new Blob([new Uint8Array(await document.save()).buffer], { type: 'application/pdf' })
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(false)
  async function run(action: () => Promise<void>) {
    if (active.current) return
    active.current = true
    setBusy(true)
    setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed. Please try again.') }
    finally { active.current = false; setBusy(false) }
  }
  return { busy, message, setMessage, run }
}

function Status({ action }: { action: ReturnType<typeof useAction> }) {
  return <div role="status" aria-live="polite">{action.busy ? 'Working…' : action.message}</div>
}

function Label({ title, children }: { title: string; children: ReactNode }) {
  return <label style={{ display: 'grid', gap: 6, minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>{children}</label>
}

function FilePicker({ accept, multiple = true, onFiles }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void }) {
  return <input style={field} aria-label="Choose files" type="file" accept={accept} multiple={multiple} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
}

async function imageCanvas(file: File) {
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, Math.sqrt(16_000_000 / (image.width * image.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally { image.close() }
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create PNG.')), 'image/png'))
}

function Scan({ files }: { files: File[] }) {
  const [captures, setCaptures] = useState<File[]>(() => files.filter((file) => file.type.startsWith('image/')))
  useEffect(() => { setCaptures(files.filter((file) => file.type.startsWith('image/'))) }, [files])
  const [camera, setCamera] = useState(false)
  const [autoCorrect, setAutoCorrect] = useState(true)
  const [enhance, setEnhance] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const alive = useRef(true)
  const action = useAction()
  function stop() { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setCamera(false) }
  useEffect(() => { alive.current = true; return () => { alive.current = false; stream.current?.getTracks().forEach((track) => track.stop()) } }, [])
  useEffect(() => { if (camera && video.current) { video.current.srcObject = stream.current; void video.current.play().catch(() => action.setMessage('Tap the video to start camera playback.')) } }, [camera])
  return <section style={panel}><h3>Scan documents</h3><p style={note}>Capture multiple pages, reorder them, and download one PDF. Camera requires HTTPS or localhost and permission. Upload photos if unavailable. Pages are auto-cropped and perspective-corrected when a paper edge is detected. No OCR — run Searchable PDF afterward.</p>
    <div style={row}><button style={button} disabled={action.busy} onClick={() => void action.run(async () => {
      if (camera) { stop(); return }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable. Upload photos below.')
      const result = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (!alive.current) { result.getTracks().forEach((track) => track.stop()); return }
      stream.current = result; setCamera(true)
    })}>{camera ? 'Stop camera' : 'Start camera'}</button><FilePicker accept="image/*" onFiles={(selected) => setCaptures((current) => [...current, ...selected])} /></div>
    {camera && <><video ref={video} playsInline muted onClick={() => void video.current?.play()} style={{ width: '100%', maxHeight: 360, background: '#111' }} /><button style={button} disabled={action.busy} onClick={() => void action.run(async () => {
      const source = video.current
      if (!source?.videoWidth) throw new Error('Wait for the camera to become ready.')
      const canvas = document.createElement('canvas'); canvas.width = source.videoWidth; canvas.height = source.videoHeight
      canvas.getContext('2d')!.drawImage(source, 0, 0)
      const image = new File([await canvasBlob(canvas)], `capture-${Date.now()}.png`, { type: 'image/png' })
      setCaptures((current) => [...current, image])
    })}>Capture page</button></>}
    <div style={row}><label style={row}><input type="checkbox" checked={autoCorrect} onChange={(event) => setAutoCorrect(event.target.checked)} /> Auto-crop &amp; straighten (detects light paper on a darker surface)</label><label style={row}><input type="checkbox" checked={enhance} onChange={(event) => setEnhance(event.target.checked)} /> Document filter (grayscale, high contrast)</label></div>
    <ol style={stack}>{captures.map((file, index) => <li key={`${file.name}-${index}`}><div style={row}><span>{file.name}</span><button style={button} disabled={index === 0 || action.busy} onClick={() => setCaptures((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next })}>Move up</button><button style={button} disabled={action.busy} onClick={() => setCaptures((current) => current.filter((_, position) => position !== index))}>Remove</button></div></li>)}</ol>
    <button style={button} disabled={!captures.length || action.busy} onClick={() => void action.run(async () => {
      const normalized: File[] = []
      const scan = autoCorrect || enhance ? await import('../lib/scan') : undefined
      let corrected = 0
      for (const file of captures) {
        let canvas = await imageCanvas(file)
        if (scan) {
          const context = canvas.getContext('2d')!
          let image = context.getImageData(0, 0, canvas.width, canvas.height)
          const quad = autoCorrect ? scan.detectDocument(image.data, image.width, image.height) : null
          if (quad) { const warped = scan.warpDocument(image.data, image.width, image.height, quad); image = new ImageData(warped.data, warped.width, warped.height); corrected++ }
          if (enhance) image = new ImageData(scan.enhanceDocument(image.data), image.width, image.height)
          canvas.width = 0; canvas.height = 0
          canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
          canvas.getContext('2d')!.putImageData(image, 0, 0)
        }
        normalized.push(new File([await canvasBlob(canvas)], `${file.name}.png`, { type: 'image/png' }))
        canvas.width = 0; canvas.height = 0
      }
      const result = await processFiles('images', normalized, {}); download(result.blob, 'scanned-pages.pdf')
      if (autoCorrect) action.setMessage(`${corrected} of ${captures.length} pages were auto-cropped and straightened.${corrected < captures.length ? ' Pages without a clear paper edge were kept as photographed.' : ''}`)
    })}>Download {captures.length} scanned pages as PDF</button><Status action={action} /></section>
}

function Thumbmark({ files }: { files: File[] }) {
  const [file, setFile] = useState<File | undefined>(files.find((candidate) => candidate.type.startsWith('image/')))
  useEffect(() => { setFile(files.find((candidate) => candidate.type.startsWith('image/'))) }, [files])
  const [threshold, setThreshold] = useState(220)
  const [rendered, setRendered] = useState<{ file: File; threshold: number }>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const action = useAction()
  useEffect(() => {
    if (!file) return
    let cancelled = false
    void imageCanvas(file).then((source) => {
      if (cancelled || !canvas.current) return
      const context = source.getContext('2d')!
      const pixels = context.getImageData(0, 0, source.width, source.height)
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const lightness = Math.min(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2])
        pixels.data[offset + 3] = Math.round(pixels.data[offset + 3] * (1 - Math.min(1, Math.max(0, (lightness - threshold + 24) / 24))))
      }
      context.putImageData(pixels, 0, 0)
      canvas.current.width = source.width; canvas.current.height = source.height
      canvas.current.getContext('2d')!.drawImage(source, 0, 0)
      setRendered({ file, threshold })
      action.setMessage('')
    }).catch((error: unknown) => { if (!cancelled) action.setMessage(error instanceof Error ? error.message : 'Cannot read image.') })
    return () => { cancelled = true }
  }, [file, threshold])
  return <section style={panel}><h3>Clean a thumbmark or signature</h3><p style={note}>Removes near-white pixels into real PNG transparency. Use dark ink on white paper. This is threshold cleanup, not biometric verification or background segmentation.</p><FilePicker accept="image/*" multiple={false} onFiles={([selected]) => setFile(selected)} /><Label title={`White removal threshold: ${threshold}`}><input type="range" min={80} max={255} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></Label><canvas ref={canvas} style={{ maxWidth: '100%', maxHeight: 420, background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 20px 20px' }} /><button style={button} disabled={!file || rendered?.file !== file || rendered?.threshold !== threshold || action.busy || !!action.message} onClick={() => void action.run(async () => { if (canvas.current) download(await canvasBlob(canvas.current), 'clean-thumbmark.png') })}>Download transparent PNG</button><Status action={action} /></section>
}

const coreOperations: { id: ToolId; label: string }[] = [{ id: 'merge', label: 'Merge PDFs' }, { id: 'rotate', label: 'Rotate' }, { id: 'organize', label: 'Select / reorder pages' }, { id: 'watermark', label: 'Watermark' }, { id: 'numbers', label: 'Page numbers' }, { id: 'compress', label: 'Compress' }, { id: 'metadata', label: 'Metadata' }]
const workflowKey = 'paperwork.workflows.v1'
function loadWorkflows(): SavedWorkflow[] {
  try { const saved: unknown = JSON.parse(localStorage.getItem(workflowKey) ?? '[]'); return Array.isArray(saved) ? saved.map(parseWorkflow).filter((entry): entry is SavedWorkflow => !!entry) : [] } catch { return [] }
}
const newStep = (): WorkflowStep => ({ id: crypto.randomUUID(), tool: 'watermark', options: { text: 'CONFIDENTIAL' } })

function StepList({ steps, onChange, label }: { steps: WorkflowStep[]; onChange: (steps: WorkflowStep[]) => void; label: string }) {
  const patch = (id: string, update: Partial<WorkflowStep>) => onChange(steps.map((step) => step.id === id ? { ...step, ...update } : step))
  const move = (index: number, delta: number) => { const next = [...steps]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onChange(next) }
  return <div style={{ ...stack, gap: 10 }}>{steps.map((step, index) => <div key={step.id} style={{ ...stack, gap: 8, padding: 12, border: '1px solid #e4e4dc', borderRadius: 8 }}><div style={row}><strong>{label} {index + 1}</strong><select aria-label={`${label} ${index + 1} operation`} style={field} value={step.tool} onChange={(event) => patch(step.id, { tool: event.target.value as ToolId, options: event.target.value === 'rotate' ? { rotation: 90 } : event.target.value === 'watermark' ? { text: 'CONFIDENTIAL' } : {} })}>{coreOperations.filter((operation) => operation.id !== 'merge').map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}</select><button style={button} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button style={button} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button><button style={button} onClick={() => onChange(steps.filter((entry) => entry.id !== step.id))}>Remove</button></div>
    {['rotate', 'organize', 'watermark', 'numbers'].includes(step.tool) && <Label title="Pages (blank = all; for example 1,3-5)"><input style={field} value={step.options.pages ?? ''} onChange={(event) => patch(step.id, { options: { ...step.options, pages: event.target.value } })} /></Label>}
    {step.tool === 'organize' && <p style={note}>Enter an explicit page order, such as 3,1,2.</p>}
    {step.tool === 'rotate' && <Label title="Clockwise rotation"><select style={field} value={step.options.rotation} onChange={(event) => patch(step.id, { options: { ...step.options, rotation: Number(event.target.value) } })}>{[90, 180, 270].map((value) => <option key={value} value={value}>{value}°</option>)}</select></Label>}
    {step.tool === 'watermark' && <Label title="Watermark text"><input style={field} value={step.options.text ?? ''} onChange={(event) => patch(step.id, { options: { ...step.options, text: event.target.value } })} /></Label>}
    {step.tool === 'compress' && <Label title="Compression level"><select style={field} value={step.options.compressPreset ?? 'lossless'} onChange={(event) => patch(step.id, { options: { compressPreset: event.target.value as ProcessOptions['compressPreset'] } })}>{['lossless', 'balanced', 'strong', 'extreme'].map((value) => <option key={value} value={value}>{value}</option>)}</select></Label>}
    {step.tool === 'metadata' && <Label title="Document title"><input style={field} value={step.options.title ?? ''} onChange={(event) => patch(step.id, { options: { title: event.target.value } })} /></Label>}
  </div>)}<button style={{ ...button, justifySelf: 'start' }} onClick={() => onChange([...steps, newStep()])}>Add {label.toLowerCase()}</button></div>
}

function Workflow({ files }: { files: File[] }) {
  const [sources, setSources] = useState(files)
  useEffect(() => { setSources(files) }, [files])
  const [steps, setSteps] = useState<WorkflowStep[]>([{ id: crypto.randomUUID(), tool: 'rotate', options: { rotation: 90 } }])
  const [branches, setBranches] = useState<WorkflowBranch[]>([])
  const [library, setLibrary] = useState<SavedWorkflow[]>(loadWorkflows)
  const [workflowName, setWorkflowName] = useState('')
  const action = useAction()
  const serializable = () => ({ name: workflowName.trim() || 'workflow', steps: steps.map(({ tool, options }) => ({ tool, options })), branches: branches.map(({ name, steps: branchSteps }) => ({ name, steps: branchSteps.map(({ tool, options }) => ({ tool, options })) })) })
  function persist(next: SavedWorkflow[]) { setLibrary(next); localStorage.setItem(workflowKey, JSON.stringify(next)) }
  function apply(saved: SavedWorkflow) { setSteps(saved.steps); setBranches(saved.branches); setWorkflowName(saved.name); action.setMessage(`Loaded “${saved.name}”.`) }
  return <section style={panel}><h3>PDF workflow builder</h3><p style={note}>Build a pipeline: shared steps run once, then optional branches fork the result into separate outputs (for example a watermarked client copy and a compressed archive copy), downloaded together as a ZIP. Multiple input PDFs are merged first. Save workflows on this device or share them as JSON. Originals stay unchanged.</p>
    <div style={{ ...stack, gap: 8 }}><strong>Saved workflows</strong><div style={row}><input aria-label="Workflow name" style={field} placeholder="Workflow name" value={workflowName} maxLength={80} onChange={(event) => setWorkflowName(event.target.value)} /><button style={button} disabled={!workflowName.trim()} onClick={() => { const parsed = parseWorkflow(serializable()); if (!parsed) { action.setMessage('Add at least one step before saving.'); return } persist([...library.filter((entry) => entry.name !== parsed.name), parsed]); action.setMessage(`Saved “${parsed.name}” on this device.`) }}>Save</button><button style={button} onClick={() => download(new Blob([JSON.stringify(serializable(), null, 2)], { type: 'application/json' }), `${serializable().name.replace(/[^\w-]+/g, '-')}.workflow.json`)}>Export</button><Label title="Import"><input style={field} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void file.text().then((text) => { const parsed = parseWorkflow(JSON.parse(text)); if (!parsed) throw new Error('Not a valid workflow file.'); apply(parsed) }).catch((error) => action.setMessage(error instanceof Error ? error.message : 'Import failed.')) }} /></Label></div>
      {library.length > 0 && <ul style={{ ...stack, gap: 6, margin: 0, paddingLeft: 18 }}>{library.map((saved) => <li key={saved.name}><div style={row}><span>{saved.name} · {saved.steps.length} steps{saved.branches.length ? ` · ${saved.branches.length} branches` : ''}</span><button style={button} onClick={() => apply(saved)}>Load</button><button style={button} onClick={() => persist(library.filter((entry) => entry.name !== saved.name))}>Delete</button></div></li>)}</ul>}</div>
    <FilePicker accept="application/pdf,.pdf" onFiles={setSources} /><p>{sources.map((file) => file.name).join(', ') || 'Choose input PDFs'}</p>
    <strong>Shared steps</strong><StepList label="Step" steps={steps} onChange={setSteps} />
    {branches.map((branch) => <div key={branch.id} style={{ ...panel, borderLeft: '4px solid #2563eb' }}><div style={row}><Label title="Branch output name"><input style={field} maxLength={60} value={branch.name} onChange={(event) => setBranches((current) => current.map((entry) => entry.id === branch.id ? { ...entry, name: event.target.value } : entry))} /></Label><button style={button} onClick={() => setBranches((current) => current.filter((entry) => entry.id !== branch.id))}>Remove branch</button></div><StepList label="Branch step" steps={branch.steps} onChange={(next) => setBranches((current) => current.map((entry) => entry.id === branch.id ? { ...entry, steps: next } : entry))} /></div>)}
    <div style={row}><button style={button} disabled={branches.length >= 12} onClick={() => setBranches((current) => [...current, { id: crypto.randomUUID(), name: `Output ${current.length + 1}`, steps: [] }])}>Add branch</button><button style={button} disabled={!sources.length || action.busy} onClick={() => void action.run(async () => {
      if (branches.some((branch) => !branch.name.trim())) throw new Error('Name every branch.')
      const outputs = await runWorkflow(sources, steps, branches, processFiles)
      if (outputs.length === 1) download(outputs[0].blob, outputs[0].name)
      else { const archive = new JSZip(); for (const output of outputs) archive.file(output.name, await output.blob.arrayBuffer()); download(await archive.generateAsync({ type: 'blob' }), 'workflow-outputs.zip') }
      action.setMessage(`Workflow complete: ${outputs.length} output${outputs.length === 1 ? '' : 's'}.`)
    })}>Run workflow and download</button></div><Status action={action} /></section>
}

async function comparePdfs(original: File, revised: File, onProgress: (text: string) => void): Promise<PageComparison[]> {
  const { diffWords, pixelDiff } = await import('../lib/compare')
  const engine = await import('pdfjs-dist'); const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); engine.GlobalWorkerOptions.workerSrc = worker.default
  const tasks = await Promise.all([original, revised].map(async (file) => engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })))
  try {
    const [a, b] = await Promise.all(tasks.map((task) => task.promise.catch(() => { throw new Error('Both files must be valid, unencrypted PDFs.') })))
    const pageText = async (page: Awaited<ReturnType<typeof a.getPage>>) => (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ')
    const render = async (page: Awaited<ReturnType<typeof a.getPage>>, width: number, height: number) => {
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(width / base.width, height / base.height) })
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#fff'; context.fillRect(0, 0, width, height)
      await page.render({ canvasContext: context, canvas, viewport }).promise
      const data = context.getImageData(0, 0, width, height).data
      canvas.width = 0; canvas.height = 0
      return data
    }
    const results: PageComparison[] = []
    const total = Math.max(a.numPages, b.numPages)
    if (total > 300) throw new Error('Compare supports up to 300 pages per document.')
    for (let number = 1; number <= total; number++) {
      onProgress(`Comparing page ${number} of ${total}…`)
      const [pa, pb] = await Promise.all([number <= a.numPages ? a.getPage(number) : undefined, number <= b.numPages ? b.getPage(number) : undefined])
      try {
        const [ta, tb] = await Promise.all([pa ? pageText(pa) : '', pb ? pageText(pb) : ''])
        const parts = diffWords(ta, tb)
        if (!pa || !pb) { results.push({ page: number, status: pa ? 'removed' : 'added', textChanges: parts.length, visualRatio: 1, parts }); continue }
        const view = pa.getViewport({ scale: 1 })
        const scale = Math.min(1.5, 1200 / Math.max(view.width, view.height))
        const width = Math.max(1, Math.round(view.width * scale)), height = Math.max(1, Math.round(view.height * scale))
        const [ra, rb] = await Promise.all([render(pa, width, height), render(pb, width, height)])
        const visual = pixelDiff(ra, rb, width, height)
        const textChanges = parts.filter((part) => part.type !== 'same').length
        let overlay: string | undefined
        if (visual.changed) {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.putImageData(new ImageData(visual.overlay, width, height), 0, 0)
          overlay = canvas.toDataURL('image/png'); canvas.width = 0; canvas.height = 0
        }
        results.push({ page: number, status: textChanges || visual.ratio > 0.0005 ? 'changed' : 'same', textChanges, visualRatio: visual.ratio, parts, overlay })
      } finally { pa?.cleanup(); pb?.cleanup() }
    }
    return results
  } finally { await Promise.all(tasks.map((task) => task.destroy())) }
}

function Compare({ files }: { files: File[] }) {
  const [pair, setPair] = useState<(File | undefined)[]>([files[0], files[1]])
  const [pages, setPages] = useState<PageComparison[] | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const action = useAction()
  useEffect(() => { setPair([files[0], files[1]]); setPages(null) }, [files])
  const shown = pages?.filter((page) => !onlyChanges || page.status !== 'same') ?? []
  const color = { same: '#566151', changed: '#b45309', added: '#15803d', removed: '#b91c1c' }
  return <section style={panel}><h3>Compare PDFs</h3><p style={note}>Automatic word-level text diff and pixel-level visual diff, computed locally. Red marks content only in the original; green marks content only in the revision. Pages are matched by position, so inserted pages shift later comparisons.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>{[0, 1].map((index) => <div key={index} style={stack}><Label title={index ? 'Revised PDF' : 'Original PDF'}><FilePicker accept="application/pdf,.pdf" multiple={false} onFiles={([file]) => { setPages(null); setPair((current) => current.map((entry, position) => position === index ? file : entry)) }} /></Label>{pair[index] && <PdfPreview file={pair[index]} />}</div>)}</div>
    <div style={row}><button style={button} disabled={action.busy || !pair[0] || !pair[1]} onClick={() => void action.run(async () => {
      setPages(null)
      const result = await comparePdfs(pair[0]!, pair[1]!, action.setMessage)
      setPages(result)
      const changed = result.filter((page) => page.status !== 'same').length
      action.setMessage(changed ? `${changed} of ${result.length} pages differ.` : 'No differences found in text or rendering.')
    })}>Find differences</button>
    {pages && <><label style={row}><input type="checkbox" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} /> Changed pages only</label><button style={button} onClick={() => void import('../lib/compare').then(({ comparisonReport }) => download(new Blob([comparisonReport(pair[0]!.name, pair[1]!.name, pages)], { type: 'text/html' }), 'comparison-report.html'))}>Download HTML report</button></>}</div>
    <Status action={action} />
    {shown.map((page) => <article key={page.page} style={{ ...stack, gap: 8, borderTop: '1px solid #e4e4dc', paddingTop: 12 }}><strong style={{ color: color[page.status] }}>Page {page.page}: {page.status}{page.status === 'changed' ? ` · ${page.textChanges} text edits · ${(page.visualRatio * 100).toFixed(2)}% pixels changed` : ''}</strong>
      {page.overlay && <img alt={`Visual differences on page ${page.page}`} src={page.overlay} style={{ maxWidth: '100%', border: '1px solid #d7d7ce' }} />}
      {page.parts.some((part) => part.type !== 'same') && <p style={{ ...note, color: '#242923' }}>{page.parts.map((part, index) => part.type === 'same' ? <span key={index}>{part.text.length > 240 ? `${part.text.slice(0, 100)} … ${part.text.slice(-100)}` : part.text} </span> : <span key={index} style={{ background: part.type === 'added' ? '#d9f7e0' : '#fde0e0', textDecoration: part.type === 'removed' ? 'line-through' : 'none' }}>{part.text} </span>)}</p>}
    </article>)}
  </section>
}

const productKey = 'paperwork.workspace.products.v1'
function newItem(): BusinessItem { return { id: crypto.randomUUID(), name: '', quantity: 1, price: 0, gstRate: 18, discount: 0, hsn: '' } }
function loadProducts(): BusinessItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(productKey) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((entry): entry is BusinessItem => !!entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.name.length <= 160 && (entry.hsn === undefined || typeof entry.hsn === 'string') && ['quantity', 'price', 'gstRate', 'discount'].every((key) => typeof entry[key] === 'number')).filter((entry) => { try { calculateTotals([entry], 'intra'); return true } catch { return false } }).slice(0, 200)
  } catch { return [] }
}

function Business({ pos }: { pos: boolean }) {
  const [items, setItems] = useState<BusinessItem[]>([newItem()])
  const [products, setProducts] = useState<BusinessItem[]>(loadProducts)
  const [mode, setMode] = useState<TaxMode>('intra')
  const [seller, setSeller] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [buyer, setBuyer] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [buyerGstin, setBuyerGstin] = useState('')
  const [number, setNumber] = useState(`INV-${new Date().toISOString().slice(0, 10)}-001`)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [supply, setSupply] = useState('')
  const action = useAction()
  let result: ReturnType<typeof calculateTotals> | undefined
  let error = ''
  try { result = calculateTotals(items, mode) } catch (caught) { error = caught instanceof Error ? caught.message : 'Invalid amounts' }
  function update(id: string, values: Partial<BusinessItem>) { setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item)) }
  async function invoice() {
    if (!result || !items.length || items.some((item) => !item.name.trim() || item.quantity <= 0)) throw new Error('Add named items with positive quantities.')
    if (!seller.trim() || !number.trim() || !date) throw new Error('Seller, invoice number and date are required.')
    if ([gstin, buyerGstin].some((value) => value && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value))) throw new Error('Check GSTIN format. This is a format check only.')
    const document = await PDFDocument.create()
    const font = await document.embedFont(StandardFonts.Helvetica)
    let page = document.addPage([595, 842]); let cursor = 795
    function write(text: string, size = 11) {
      for (const logical of text.split('\n')) {
        const words = logical.split(/\s+/); let line = ''
        function flush() {
          if (cursor < 45) { page = document.addPage([595, 842]); cursor = 795 }
          try { page.drawText(line, { font, size, x: 40, y: cursor, maxWidth: 515 }) } catch { throw new Error('PDF text currently supports Latin characters only. Transliterate names and addresses before exporting.') }
          cursor -= size + 7; line = ''
        }
        for (const word of words) {
          let width: number
          try { width = font.widthOfTextAtSize(`${line} ${word}`, size) } catch { throw new Error('Use Latin characters for PDF export.') }
          if (width > 510 && line) flush()
          for (const character of word) { if (font.widthOfTextAtSize(line + character, size) > 510) flush(); line += character }
          line += ' '
        }
        flush()
      }
    }
    const amount = (value: number) => `INR ${(value / 100).toFixed(2)}`
    write(pos ? 'SALE RECEIPT / INVOICE' : 'INVOICE', 22)
    write(`${number} | ${date}`)
    write(`Seller: ${seller}\nAddress: ${sellerAddress || '-'}\nGSTIN: ${gstin || 'Not supplied'}`)
    write(`Buyer: ${buyer || 'Walk-in customer'}\nAddress: ${buyerAddress || '-'}\nGSTIN: ${buyerGstin || 'Not supplied'}\nPlace of supply: ${supply || 'Not supplied'}`)
    write(mode === 'intra' ? 'Tax mode: intra-state (CGST + SGST)' : 'Tax mode: inter-state (IGST)')
    for (const [index, line] of result.lines.entries()) {
      write(`${index + 1}. ${line.name} | HSN/SAC ${line.hsn || '-'}`)
      write(`${line.quantity} x ${amount(moneyToPaise(line.price))} | Discount ${line.discount}% | Taxable ${amount(line.taxable)}`)
      write(`GST ${line.gstRate}%: ${mode === 'intra' ? `CGST ${amount(line.cgst)} + SGST ${amount(line.sgst)}` : `IGST ${amount(line.igst)}`} | Total ${amount(line.total)}`)
    }
    write(`Subtotal ${amount(result.gross)} | Discount ${amount(result.discount)}`)
    write(`Taxable ${amount(result.taxable)} | CGST ${amount(result.cgst)} | SGST ${amount(result.sgst)} | IGST ${amount(result.igst)}`)
    write(`TOTAL ${amount(result.total)}`, 18)
    write('Verify tax rates, supply classification and statutory invoice requirements before use.', 9)
    download(await pdfBlob(document), `${number.replace(/[^a-zA-Z0-9_-]/g, '-') || 'invoice'}.pdf`)
  }
  return <section style={panel}><h3>{pos ? 'Point of sale' : 'GST invoice'}</h3><p style={note}>Prices exclude GST. Discounts apply before tax. Amounts round per line to paise; an odd split tax paise goes to SGST. Choose rates and supply classification yourself. Not tax advice, e-invoicing, filing, payment processing, or a compliance certification. Download the PDF and print from your PDF viewer.</p>
    <div style={row}><Label title="Seller name"><input style={field} value={seller} onChange={(event) => setSeller(event.target.value)} /></Label><Label title="Seller GSTIN (optional)"><input style={field} maxLength={15} value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} /></Label><Label title="Invoice number"><input style={field} value={number} onChange={(event) => setNumber(event.target.value)} /></Label><Label title="Date"><input style={field} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Label></div>
    <Label title="Seller address"><textarea style={field} value={sellerAddress} onChange={(event) => setSellerAddress(event.target.value)} /></Label><div style={row}><Label title="Buyer name"><input style={field} value={buyer} onChange={(event) => setBuyer(event.target.value)} /></Label><Label title="Buyer GSTIN (optional)"><input style={field} maxLength={15} value={buyerGstin} onChange={(event) => setBuyerGstin(event.target.value.toUpperCase())} /></Label><Label title="Place of supply / state"><input style={field} value={supply} onChange={(event) => setSupply(event.target.value)} /></Label><Label title="Tax mode"><select style={field} value={mode} onChange={(event) => setMode(event.target.value as TaxMode)}><option value="intra">Intra-state: CGST + SGST</option><option value="inter">Inter-state: IGST</option></select></Label></div><Label title="Buyer address"><textarea style={field} value={buyerAddress} onChange={(event) => setBuyerAddress(event.target.value)} /></Label>
    {pos && <div style={panel}><strong>Local product catalog</strong><p style={note}>Saved in this browser only, not synchronized. Save a cart line as a product, then tap it to add to a sale.</p><div style={row}>{products.map((product) => <span key={product.id} style={row}><button style={button} onClick={() => setItems((current) => [...current.filter((item) => item.name || item.price), { ...product, id: crypto.randomUUID(), quantity: 1 }])}>{product.name} · {formatMoney(Math.round(product.price * 100))}</button><button style={button} aria-label={`Delete product ${product.name}`} onClick={() => void action.run(async () => { const next = products.filter((entry) => entry.id !== product.id); localStorage.setItem(productKey, JSON.stringify(next)); setProducts(next) })}>×</button></span>)}</div></div>}
    {items.map((item, index) => <div key={item.id} style={panel}><strong>Item {index + 1}</strong><div style={row}><Label title="Item name"><input style={field} maxLength={160} value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} /></Label><Label title="HSN / SAC"><input style={{ ...field, width: 120 }} value={item.hsn} onChange={(event) => update(item.id, { hsn: event.target.value })} /></Label>{([{ key: 'quantity', label: 'Quantity', step: '0.001' }, { key: 'price', label: 'Unit price (INR)', step: '0.01' }, { key: 'gstRate', label: 'GST %', step: '0.01' }, { key: 'discount', label: 'Discount %', step: '0.01' }] as const).map(({ key, label, step }) => <Label key={key} title={label}><input style={{ ...field, width: 112 }} type="number" min={0} max={key === 'discount' || key === 'gstRate' ? 100 : undefined} step={step} value={Number.isNaN(item[key]) ? '' : item[key]} onChange={(event) => update(item.id, { [key]: event.target.value === '' ? NaN : Number(event.target.value) })} /></Label>)}</div><div style={row}><button style={button} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>Remove</button>{pos && <button style={button} onClick={() => void action.run(async () => { if (!item.name.trim()) throw new Error('Name this product first.'); calculateTotals([item], mode); const next = [...products.filter((entry) => entry.name !== item.name), { ...item, id: crypto.randomUUID(), quantity: 1 }]; if (next.length > 200) throw new Error('Catalog limit: 200 products.'); localStorage.setItem(productKey, JSON.stringify(next)); setProducts(next); action.setMessage('Product saved in this browser.') })}>Save product locally</button>}<strong>{result ? formatMoney(result.lines[index].total) : 'Check amounts'}</strong></div></div>)}
    <button style={button} onClick={() => setItems((current) => [...current, newItem()])}>Add item</button>{error && <p role="alert">{error}</p>}{result && <dl style={{ ...row, justifyContent: 'space-between' }}>{Object.entries({ 'Taxable': result.taxable, 'Discount': result.discount, 'CGST': result.cgst, 'SGST': result.sgst, 'IGST': result.igst, 'Total': result.total }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{formatMoney(value)}</dd></div>)}</dl>}<button style={button} disabled={action.busy || !result || !items.length} onClick={() => void action.run(invoice)}>Download printable {pos ? 'receipt' : 'invoice'} PDF</button><Status action={action} /></section>
}

function GstPrep({ files }: { files: File[] }) {
  const [sources, setSources] = useState(files)
  useEffect(() => { setSources(files) }, [files])
  const [limit, setLimit] = useState(5)
  const action = useAction()
  return <section style={panel}><h3>GST document preparation</h3><p style={note}>Split supporting PDFs into smaller standalone PDFs and download a ZIP. This does not prepare returns, upload to a portal, certify compliance, or guarantee any portal limit. Size is checked on each saved PDF; a single oversized page is reported rather than silently accepted.</p><FilePicker accept="application/pdf,.pdf" onFiles={setSources} /><p>{sources.map((file) => file.name).join(', ')}</p><Label title="Maximum size per PDF (MiB)"><input style={field} type="number" min={0.05} max={100} step={0.05} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></Label><button style={button} disabled={!sources.length || action.busy} onClick={() => void action.run(async () => {
    if (!Number.isFinite(limit) || limit < 0.05 || limit > 100) throw new Error('Choose a size between 0.05 and 100 MiB.')
    const archive = new JSZip(); const maximum = Math.floor(limit * 1024 * 1024); let count = 0
    for (const [sourceIndex, source] of sources.entries()) {
      const document = await PDFDocument.load(await source.arrayBuffer())
      async function chunk(start: number, end: number) {
        const part = await PDFDocument.create(); const indices = Array.from({ length: end - start }, (_, index) => start + index)
        const pages = await part.copyPages(document, indices); pages.forEach((page) => part.addPage(page))
        const bytes = await part.save()
        if (bytes.byteLength <= maximum) { archive.file(`${sourceIndex + 1}-${source.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-')}-pages-${start + 1}-${end}.pdf`, bytes); count++; return }
        if (end - start === 1) throw new Error(`${source.name}, page ${start + 1} exceeds ${limit} MiB on its own. No archive downloaded; reduce image resolution with a separate tool.`)
        const middle = start + Math.floor((end - start) / 2); await chunk(start, middle); await chunk(middle, end)
      }
      if (!document.getPageCount()) throw new Error(`${source.name} has no pages.`)
      await chunk(0, document.getPageCount())
    }
    download(await archive.generateAsync({ type: 'blob' }), 'gst-supporting-documents.zip'); action.setMessage(`${count} PDFs prepared; each is within the selected size.`)
  })}>Split by size and download ZIP</button><Status action={action} /></section>
}

type Stroke = { points: Point[]; color: string; width: number }
export function splitStroke(stroke: Stroke): Stroke[] {
  const parts: Stroke[] = []
  for (let start = 0; start < stroke.points.length; start += 127) {
    parts.push({ ...stroke, points: stroke.points.slice(start, start + 128) })
    if (start + 128 >= stroke.points.length) break
  }
  return parts
}

function validStroke(value: unknown): value is Stroke {
  if (!value || typeof value !== 'object') return false
  const stroke = value as Stroke
  return /^#[0-9a-f]{6}$/i.test(stroke.color) && Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 20 && Array.isArray(stroke.points) && stroke.points.length >= 1 && stroke.points.length <= 2000 && stroke.points.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  context.strokeStyle = stroke.color; context.fillStyle = stroke.color; context.lineWidth = stroke.width; context.lineCap = 'round'; context.lineJoin = 'round'
  const first = stroke.points[0]; if (!first) return
  context.beginPath(); context.moveTo(first.x * context.canvas.width, first.y * context.canvas.height)
  for (const point of stroke.points.slice(1)) context.lineTo(point.x * context.canvas.width, point.y * context.canvas.height)
  context.stroke()
  if (stroke.points.length === 1) { context.beginPath(); context.arc(first.x * context.canvas.width, first.y * context.canvas.height, stroke.width / 2, 0, Math.PI * 2); context.fill() }
}

function pointAt(event: ReactPointerEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
}

function PeerWorkspace({ files, whiteboard }: { files: File[]; whiteboard: boolean }) {
  const action = useAction()
  const peer = useRef<RTCPeerConnection | null>(null)
  const channel = useRef<RTCDataChannel | null>(null)
  const [connection, setConnection] = useState('Not connected')
  const [signal, setSignal] = useState('')
  const [remote, setRemote] = useState('')
  const [stun, setStun] = useState('')
  const [sources, setSources] = useState(files)
  useEffect(() => { setSources(files) }, [files])
  const [received, setReceived] = useState<{ file: File; id: string }[]>([])
  const incoming = useRef<{ name: string; type: string; size: number; bytes: number; parts: ArrayBuffer[] } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const stroke = useRef<Stroke | null>(null)
  const [color, setColor] = useState('#263e28')
  const [width, setWidth] = useState(3)
  const [ready, setReady] = useState(false)
  const maximumFile = 50 * 1024 * 1024
  const boardLimit = 2000
  function redraw() {
    const context = canvas.current?.getContext('2d'); if (!context) return
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    strokes.current.forEach((entry) => drawStroke(context, entry))
  }
  function close() {
    channel.current?.close(); peer.current?.close(); channel.current = null; peer.current = null; incoming.current = null
    setReady(false); setConnection('Disconnected'); setSignal('')
  }
  useEffect(() => () => { channel.current?.close(); peer.current?.close(); incoming.current = null }, [])
  function attach(next: RTCDataChannel) {
    channel.current = next; next.binaryType = 'arraybuffer'
    next.onopen = () => { if (channel.current !== next) return; setReady(true); setConnection('Connected to peer'); if (whiteboard) action.setMessage('Live strokes are shared. Existing marks remain local; redraw them to share.') }
    next.onclose = () => { if (channel.current !== next) return; setReady(false); incoming.current = null; setConnection('Data channel closed') }
    next.onerror = () => { if (channel.current === next) action.setMessage('Data channel error. Reconnect to retry.') }
    next.onmessage = (event) => {
      if (channel.current !== next) return
      try {
        if (typeof event.data !== 'string') {
          if (whiteboard || !(event.data instanceof ArrayBuffer) || !incoming.current) throw new Error('Unexpected binary data.')
          const transfer = incoming.current
          if (!event.data.byteLength || event.data.byteLength > 16_384 || transfer.bytes + event.data.byteLength > transfer.size) throw new Error('Invalid incoming chunk or file exceeds its declared size.')
          transfer.parts.push(event.data); transfer.bytes += event.data.byteLength; return
        }
        if (event.data.length > 150_000) throw new Error('Peer message too large.')
        const message = JSON.parse(event.data)
        if (whiteboard) {
          if (message.kind !== 'stroke' || !validStroke(message.stroke)) throw new Error('Invalid whiteboard stroke.')
          if (strokes.current.length >= boardLimit) throw new Error('Board limit reached. Export then clear locally.')
          strokes.current.push(message.stroke); redraw(); return
        }
        if (message.kind === 'file') {
          if (incoming.current) throw new Error('A file transfer is already in progress.')
          if (typeof message.name !== 'string' || message.name.length > 255 || !Number.isSafeInteger(message.size) || message.size < 0 || message.size > maximumFile || typeof message.type !== 'string' || message.type.length > 150) throw new Error('Invalid file header or file over 50 MiB.')
          incoming.current = { name: message.name, type: message.type, size: message.size, bytes: 0, parts: [] }
        } else if (message.kind === 'end' && incoming.current) {
          const transfer = incoming.current
          if (transfer.bytes !== transfer.size) throw new Error('Transfer incomplete. Reconnect and resend.')
          const file = new File(transfer.parts, transfer.name, { type: transfer.type }); incoming.current = null
          setReceived((current) => [...current, { file, id: crypto.randomUUID() }]); action.setMessage(`Received ${file.name}. Download it below; received files are not opened automatically.`)
        } else throw new Error('Unexpected peer message.')
      } catch (caught) { incoming.current = null; action.setMessage(caught instanceof Error ? caught.message : 'Invalid peer data.'); next.close() }
    }
  }
  function createPeer() {
    close()
    if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC is unavailable in this browser.')
    if (stun && !/^stuns?:[^\s]+$/.test(stun)) throw new Error('Enter a valid stun: or stuns: URL, or leave blank.')
    const next = new RTCPeerConnection({ iceServers: stun ? [{ urls: stun }] : [] })
    peer.current = next; next.ondatachannel = (event) => { if (peer.current === next) attach(event.channel); else event.channel.close() }
    next.onconnectionstatechange = () => { if (peer.current !== next) return; setConnection(next.connectionState); if (['failed', 'disconnected', 'closed'].includes(next.connectionState)) setReady(false) }
    return next
  }
  async function localSignal(next: RTCPeerConnection) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('ICE gathering timed out. Retry or change STUN settings.')) }, 20_000)
      function cleanup() { clearTimeout(timer); next.removeEventListener('icegatheringstatechange', check); next.removeEventListener('connectionstatechange', check) }
      function check() {
        if (next.connectionState === 'closed') { cleanup(); reject(new Error('Connection closed.')) }
        else if (next.iceGatheringState === 'complete') { cleanup(); resolve() }
      }
      next.addEventListener('icegatheringstatechange', check); next.addEventListener('connectionstatechange', check); check()
    })
    if (peer.current === next) setSignal(JSON.stringify(next.localDescription))
  }
  function parseSignal(expected: 'offer' | 'answer'): RTCSessionDescriptionInit {
    if (remote.length > 150_000) throw new Error('Signaling JSON too large.')
    const value = JSON.parse(remote)
    if (value.type !== expected || typeof value.sdp !== 'string') throw new Error(`Paste a valid ${expected} JSON.`)
    return { type: expected, sdp: value.sdp }
  }
  function transmit(value: unknown) {
    const active = channel.current
    if (!active || active.readyState !== 'open') throw new Error('Connect to a peer first.')
    if (active.bufferedAmount > 1_000_000) throw new Error('Peer is catching up. Wait before drawing again.')
    active.send(JSON.stringify(value))
  }
  return <section style={panel}><h3>{whiteboard ? 'Peer-to-peer whiteboard' : 'Peer-to-peer file sharing'}</h3><p style={note}>Real WebRTC data channel with manual signaling; no app signaling server or file relay. Both people open this tool: A creates an offer and privately sends its JSON to B; B pastes it and creates an answer; A pastes that answer and applies it. Trust the person and exchange JSON over an authenticated channel. Signaling contains connection information. Blank STUN uses no discovery server and typically works only on compatible local networks. Optional STUN contacts your chosen server and reveals network information; restrictive NATs may require TURN, which this tool does not provide. Connection is not guaranteed.</p>
    <Label title="Optional STUN URL (blank = no server)"><input style={field} placeholder="stun:your-trusted-server:3478" value={stun} disabled={action.busy || ready} onChange={(event) => setStun(event.target.value)} /></Label><div style={row}><button style={button} disabled={action.busy || ready} onClick={() => void action.run(async () => { const next = createPeer(); attach(next.createDataChannel(whiteboard ? 'paperwork-board' : 'paperwork-files')); await next.setLocalDescription(await next.createOffer()); await localSignal(next) })}>A: Create offer</button><button style={button} disabled={action.busy || ready} onClick={() => void action.run(async () => { const offer = parseSignal('offer'); const next = createPeer(); await next.setRemoteDescription(offer); await next.setLocalDescription(await next.createAnswer()); await localSignal(next) })}>B: Accept offer & create answer</button><button style={button} disabled={action.busy || ready} onClick={() => void action.run(async () => { if (!peer.current || peer.current.signalingState !== 'have-local-offer') throw new Error('Create an offer first.'); await peer.current.setRemoteDescription(parseSignal('answer')) })}>A: Apply answer</button><button style={button} onClick={close}>Disconnect</button></div>
    <Label title="Paste remote JSON"><textarea style={{ ...field, minHeight: 100 }} value={remote} onChange={(event) => setRemote(event.target.value)} /></Label><Label title="Your JSON — copy and send privately"><textarea style={{ ...field, minHeight: 100 }} readOnly value={signal} onFocus={(event) => event.target.select()} /></Label><strong role="status">{connection}{ready ? ' · live data channel' : ''}</strong>
    {whiteboard ? <><p style={note}>Only strokes drawn while connected are sent live. Earlier strokes are local practice, not synced history. Clear affects your board only. Export before leaving; boards are not stored.</p><div style={row}><Label title="Ink"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></Label><Label title={`Pen width ${width}`}><input type="range" min={1} max={20} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></Label><button style={button} onClick={() => { strokes.current = []; stroke.current = null; redraw() }}>Clear my board</button><button style={button} onClick={() => void action.run(async () => { if (canvas.current) download(await canvasBlob(canvas.current), 'whiteboard.png') })}>Export PNG</button></div><canvas ref={canvas} width={1000} height={650} aria-label="Shared drawing canvas" style={{ width: '100%', background: '#fff', border: '1px solid #aaa', touchAction: 'none' }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); stroke.current = { points: [pointAt(event)], color, width } }} onPointerMove={(event) => {
      if (!stroke.current || stroke.current.points.length >= 2000) return
      const previous = stroke.current.points.at(-1)!; const next = pointAt(event); stroke.current.points.push(next)
      const context = canvas.current?.getContext('2d'); if (context) drawStroke(context, { ...stroke.current, points: [previous, next] })
    }} onPointerCancel={() => { stroke.current = null; redraw() }} onPointerUp={() => {
      const completed = stroke.current; stroke.current = null; if (!completed) return
      if (strokes.current.length >= boardLimit) { action.setMessage('Board limit reached. Export and clear.'); redraw(); return }
      strokes.current.push(completed); redraw()
      if (ready) { try { for (const part of splitStroke(completed)) transmit({ kind: 'stroke', stroke: part }) } catch (caught) { action.setMessage(`${caught instanceof Error ? caught.message : 'Send failed.'} This stroke may be only partly shared; the complete stroke remains local.`) } }
    }} /></> : <><FilePicker accept="*/*" onFiles={setSources} /><p>{sources.map((file) => `${file.name} (${(file.size / 1024).toFixed(0)} KiB)`).join(', ')}</p><button style={button} disabled={!ready || !sources.length || action.busy} onClick={() => void action.run(async () => {
      if (sources.some((file) => file.size > maximumFile)) throw new Error('Maximum file size is 50 MiB.')
      const active = channel.current
      if (!active || active.readyState !== 'open') throw new Error('Connect first.')
      async function drain() {
        const started = Date.now()
        while (active!.bufferedAmount > 262_144) {
          if (active!.readyState !== 'open' || Date.now() - started > 30_000) throw new Error('Transfer interrupted or stalled. Reconnect and resend.')
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        if (active!.readyState !== 'open') throw new Error('Peer disconnected.')
      }
      try {
        for (const file of sources) {
          await drain(); active.send(JSON.stringify({ kind: 'file', name: file.name, type: file.type, size: file.size }))
          for (let offset = 0; offset < file.size; offset += 16_384) { await drain(); const chunk = await file.slice(offset, offset + 16_384).arrayBuffer(); active.send(chunk) }
          await drain(); active.send(JSON.stringify({ kind: 'end' }))
        }
        await drain(); action.setMessage('Files queued to peer. Ask the recipient to confirm receipt; no delivery acknowledgment is implemented.')
      } catch (caught) { active.close(); throw caught }
    })}>Send selected files to peer</button>{received.map(({ file, id }) => <div key={id} style={row}><button style={button} onClick={() => download(file, file.name)}>Download received: {file.name} ({file.size} bytes)</button><button style={button} onClick={() => setReceived((current) => current.filter((entry) => entry.id !== id))}>Discard</button></div>)}</>}
    <Status action={action} /></section>
}

type PageImageItem = { page: number; box: { x0: number; y0: number; x1: number; y1: number }; rotated: boolean; pixels: string; rect: { left: number; top: number; right: number; bottom: number } }
type PageTextItem = { page: number; text: string; box: { x0: number; y0: number; x1: number; y1: number }; rect: { left: number; top: number; right: number; bottom: number } }
type Overlay = { id: string; page: number; kind: 'text' | 'draw' | 'sign'; points: Point[]; text: string; size: number; color: string; penWidth?: number }
function PdfEdit({ files }: { files: File[] }) {
  const [file, setFile] = useState<File | undefined>(files[0])
  useEffect(() => { setFile(files[0]) }, [files])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [mode, setMode] = useState<'text' | 'draw' | 'sign' | 'edit'>('edit')
  const [items, setItems] = useState<PageTextItem[]>([])
  const [selected, setSelected] = useState<PageTextItem | null>(null)
  const [replacement, setReplacement] = useState('')
  const [textEdits, setTextEdits] = useState<(PageTextItem & { replacement: string })[]>([])
  const [imageItems, setImageItems] = useState<PageImageItem[]>([])
  const [selectedImage, setSelectedImage] = useState<PageImageItem | null>(null)
  const [imageEdits, setImageEdits] = useState<(PageImageItem & { action: 'delete' | 'replace'; image?: Uint8Array })[]>([])
  const [text, setText] = useState('')
  const [color, setColor] = useState('#253d29')
  const [size, setSize] = useState(18)
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const base = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLCanvasElement>(null)
  const pending = useRef<Overlay | null>(null)
  const action = useAction()
  useEffect(() => { setPage(1); setOverlays([]); setTextEdits([]); setSelected(null); setImageEdits([]); setSelectedImage(null); setTotal(0); pending.current = null }, [file])
  useEffect(() => {
    if (!file) {
      setRendering(false); setRenderError('')
      for (const canvas of [base.current, layer.current]) { if (canvas) { canvas.width = 0; canvas.height = 0 } }
      return
    }
    let cancelled = false
    let destroy = () => {}
    setRendering(true); setRenderError('')
    void (async () => {
      const engine = await import('pdfjs-dist'); const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); engine.GlobalWorkerOptions.workerSrc = worker.default
      if (cancelled) return
      const bytes = await file.arrayBuffer()
      if (cancelled) return
      const task = engine.getDocument({ data: new Uint8Array(bytes).slice() }); destroy = () => { void task.destroy() }
      const document = await task.promise
      if (cancelled) return
      setTotal(document.numPages)
      const pdfPage = await document.getPage(Math.min(page, document.numPages)); const native = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: Math.min(1.5, 1600 / Math.max(native.width, native.height)) })
      const temporary = window.document.createElement('canvas'); temporary.width = Math.ceil(viewport.width); temporary.height = Math.ceil(viewport.height)
      await pdfPage.render({ canvas: temporary, canvasContext: temporary.getContext('2d')!, viewport }).promise
      if (cancelled || !base.current || !layer.current) return
      base.current.width = temporary.width; base.current.height = temporary.height; base.current.getContext('2d')!.drawImage(temporary, 0, 0)
      layer.current.width = temporary.width; layer.current.height = temporary.height
      const content = await pdfPage.getTextContent()
      if (cancelled) return
      setItems(content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return []
        const [, , , , x, y] = item.transform
        const height = item.height || Math.hypot(item.transform[2], item.transform[3])
        const box = { x0: x, y0: y - height * 0.25, x1: x + item.width, y1: y + height }
        const [vx0, vy0, vx1, vy1] = viewport.convertToViewportRectangle([box.x0, box.y0, box.x1, box.y1])
        return [{ page: Math.min(page, document.numPages), text: item.str, box, rect: { left: Math.min(vx0, vx1) / temporary.width, top: Math.min(vy0, vy1) / temporary.height, right: Math.max(vx0, vx1) / temporary.width, bottom: Math.max(vy0, vy1) / temporary.height } }]
      }))
      let placed: PageImageItem[] = []
      try {
        const { analyzePageText } = await import('../lib/text-edit')
        const lib = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pageNumber = Math.min(page, document.numPages)
        placed = analyzePageText(lib, pageNumber - 1).images.map((image) => {
          const [vx0, vy0, vx1, vy1] = viewport.convertToViewportRectangle([image.box.x0, image.box.y0, image.box.x1, image.box.y1])
          return { page: pageNumber, box: image.box, rotated: image.rotated, pixels: `${image.width}×${image.height}`, rect: { left: Math.min(vx0, vx1) / temporary.width, top: Math.min(vy0, vy1) / temporary.height, right: Math.max(vx0, vx1) / temporary.width, bottom: Math.max(vy0, vy1) / temporary.height } }
        })
      } catch { placed = [] }
      if (cancelled) return
      setImageItems(placed)
      setSelected(null); setSelectedImage(null); setRendering(false)
    })().catch((caught: unknown) => { if (!cancelled) { setRenderError(caught instanceof Error ? caught.message : 'PDF preview failed.'); setRendering(false) } })
    return () => { cancelled = true; destroy() }
  }, [file, page])
  useEffect(() => {
    const context = layer.current?.getContext('2d'); if (!context || rendering) return
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    const width = context.canvas.width, height = context.canvas.height
    if (mode === 'edit') for (const image of imageItems) {
      const edited = imageEdits.find((entry) => entry.page === image.page && entry.box.x0 === image.box.x0 && entry.box.y0 === image.box.y0)
      const [x, y, w, h] = [image.rect.left * width, image.rect.top * height, (image.rect.right - image.rect.left) * width, (image.rect.bottom - image.rect.top) * height]
      if (edited?.action === 'delete') { context.fillStyle = 'rgba(255,255,255,0.9)'; context.fillRect(x, y, w, h) }
      context.setLineDash([6, 4]); context.lineWidth = image === selectedImage ? 3 : 1.5
      context.strokeStyle = edited ? '#15803d' : image === selectedImage ? '#c2410c' : 'rgba(194,65,12,0.6)'
      context.strokeRect(x, y, w, h); context.setLineDash([]); context.lineWidth = 1
      if (edited) { context.fillStyle = '#15803d'; context.font = '13px Helvetica, Arial, sans-serif'; context.fillText(edited.action === 'delete' ? 'Image deleted' : 'Image replaced', x + 6, y + 18) }
    }
    if (mode === 'edit') for (const item of items) {
      const edited = textEdits.find((entry) => entry.page === item.page && entry.box.x0 === item.box.x0 && entry.box.y0 === item.box.y0)
      context.fillStyle = edited ? 'rgba(255,255,255,0.92)' : item === selected ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.06)'
      context.strokeStyle = edited ? '#15803d' : item === selected ? '#2563eb' : 'rgba(37,99,235,0.35)'
      context.fillRect(item.rect.left * width, item.rect.top * height, (item.rect.right - item.rect.left) * width, (item.rect.bottom - item.rect.top) * height)
      context.strokeRect(item.rect.left * width, item.rect.top * height, (item.rect.right - item.rect.left) * width, (item.rect.bottom - item.rect.top) * height)
      if (edited) { context.fillStyle = '#15803d'; context.font = `${(item.rect.bottom - item.rect.top) * height * 0.75}px Helvetica, Arial, sans-serif`; context.fillText(edited.replacement, item.rect.left * width, item.rect.bottom * height - (item.rect.bottom - item.rect.top) * height * 0.22) }
    }
    for (const overlay of overlays.filter((entry) => entry.page === page)) {
      if (overlay.kind === 'text') { context.fillStyle = overlay.color; context.font = `${overlay.size / 595 * context.canvas.width}px Helvetica, Arial, sans-serif`; context.fillText(overlay.text, overlay.points[0].x * context.canvas.width, overlay.points[0].y * context.canvas.height) }
      else drawStroke(context, { points: overlay.points, color: overlay.color, width: (overlay.penWidth ?? 0.002) * context.canvas.width })
    }
  }, [overlays, page, rendering, mode, items, selected, textEdits, imageItems, selectedImage, imageEdits])
  return <section style={panel}><h3>Edit PDF</h3><p style={note}>Edit existing text: choose “Edit existing text”, click any text run, and type its replacement, or click an image (dashed outline) to delete or replace it. The original glyphs are removed from the page content (not just covered) and the new text is set at the same position, size, colour and angle in the closest standard font (Helvetica, Times or Courier). Text in an element reused on several pages (such as a letterhead) is changed on the current page only. Scanned images and non-Latin scripts cannot be edited this way; run OCR first for scans. You can also add new text, freehand ink, or a handwritten signature as overlays; they are not a cryptographic signature. Covering text is NOT secure redaction: original content remains extractable. Do not use overlays to hide sensitive information. Existing digital signatures may be invalidated. Latin text only; complex scripts require fonts not bundled here.</p><FilePicker accept="application/pdf,.pdf" multiple={false} onFiles={([selected]) => setFile(selected)} /><div style={row}><button style={button} disabled={page <= 1 || rendering} onClick={() => setPage((current) => current - 1)}>Previous page</button><span>{page} / {total || '—'}</span><button style={button} disabled={page >= total || rendering} onClick={() => setPage((current) => current + 1)}>Next page</button><Label title="Overlay type"><select style={field} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="edit">Edit existing text</option><option value="draw">Draw</option><option value="sign">Handwritten signature</option><option value="text">Add text</option></select></Label><Label title="Ink"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></Label><button style={button} disabled={!overlays.length} onClick={() => setOverlays((current) => current.slice(0, -1))}>Undo last overlay</button></div>{mode === 'text' && <div style={row}><Label title="Text — click the page to place"><input style={field} maxLength={300} value={text} onChange={(event) => setText(event.target.value)} /></Label><Label title="Text size (relative to A4 width)"><input style={field} type="number" min={8} max={72} value={size} onChange={(event) => setSize(Number(event.target.value))} /></Label></div>}
    <p role="status">{rendering ? 'Rendering page…' : renderError || (file ? 'Draw directly on the page, or click to place your text.' : 'Choose a PDF.')}</p><div style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#eee', visibility: rendering || renderError ? 'hidden' : 'visible' }}><canvas ref={base} style={{ display: 'block', width: '100%' }} /><canvas ref={layer} aria-label="PDF overlay editing canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: mode === 'text' || mode === 'edit' ? 'text' : 'crosshair' }} onPointerDown={(event) => {
      if (rendering || renderError || !total) return
      const point = pointAt(event)
      if (mode === 'edit') {
        const hit = items.find((item) => point.x >= item.rect.left && point.x <= item.rect.right && point.y >= item.rect.top && point.y <= item.rect.bottom)
        setSelected(hit ?? null); setReplacement(hit ? (textEdits.find((entry) => entry.page === hit.page && entry.box.x0 === hit.box.x0 && entry.box.y0 === hit.box.y0)?.replacement ?? hit.text) : '')
        const imageHit = hit ? undefined : [...imageItems].reverse().find((image) => point.x >= image.rect.left && point.x <= image.rect.right && point.y >= image.rect.top && point.y <= image.rect.bottom)
        setSelectedImage(imageHit ?? null)
        if (!hit && !imageHit) action.setMessage('No selectable text or image there. Scanned pages need OCR before their text can be edited.')
        return
      }
      if (mode === 'text') { if (!text.trim() || !Number.isFinite(size) || size < 8 || size > 72) { action.setMessage('Enter text and a size from 8 to 72.'); return } setOverlays((current) => [...current, { id: crypto.randomUUID(), page, kind: 'text', points: [point], text, color, size }]); return }
      event.currentTarget.setPointerCapture(event.pointerId); pending.current = { id: crypto.randomUUID(), page, kind: mode, points: [point], text: '', color, size, penWidth: 2 / event.currentTarget.width }
    }} onPointerMove={(event) => {
      const active = pending.current; if (!active || active.points.length >= 10000) return
      const previous = active.points.at(-1)!; const next = pointAt(event); active.points.push(next)
      const context = layer.current?.getContext('2d'); if (context) drawStroke(context, { points: [previous, next], color: active.color, width: 2 })
    }} onPointerCancel={() => { pending.current = null; setOverlays((current) => [...current]) }} onPointerUp={() => { if (pending.current) { const completed = pending.current; pending.current = null; setOverlays((current) => [...current, completed]) } }} /></div>
    {mode === 'edit' && selected && <div style={row}><Label title={`Replace “${selected.text.slice(0, 60)}”`}><input style={{ ...field, minWidth: 280 }} value={replacement} onChange={(event) => setReplacement(event.target.value)} /></Label><button style={button} onClick={() => { setTextEdits((current) => [...current.filter((entry) => !(entry.page === selected.page && entry.box.x0 === selected.box.x0 && entry.box.y0 === selected.box.y0)), { ...selected, replacement }]); setSelected(null) }}>Apply change</button><button style={button} onClick={() => { setTextEdits((current) => [...current.filter((entry) => !(entry.page === selected.page && entry.box.x0 === selected.box.x0 && entry.box.y0 === selected.box.y0)), { ...selected, replacement: '' }]); setSelected(null) }}>Delete text</button></div>}
    {mode === 'edit' && selectedImage && <div style={row}><span>Image {selectedImage.pixels} px</span><button style={button} onClick={() => { setImageEdits((current) => [...current.filter((entry) => !(entry.page === selectedImage.page && entry.box.x0 === selectedImage.box.x0 && entry.box.y0 === selectedImage.box.y0)), { ...selectedImage, action: 'delete' }]); setSelectedImage(null) }}>Delete image</button>{selectedImage.rotated ? <span style={note}>Rotated images can be deleted, not replaced.</span> : <Label title="Replace with PNG or JPEG"><input style={field} type="file" accept="image/png,image/jpeg" onChange={(event) => { const chosen = event.target.files?.[0]; event.target.value = ''; const target = selectedImage; if (chosen && target) void chosen.arrayBuffer().then((buffer) => { setImageEdits((current) => [...current.filter((entry) => !(entry.page === target.page && entry.box.x0 === target.box.x0 && entry.box.y0 === target.box.y0)), { ...target, action: 'replace', image: new Uint8Array(buffer) }]); setSelectedImage(null) }) }} /></Label>}</div>}
    {imageEdits.length > 0 && <p style={note}>{imageEdits.length} image change{imageEdits.length === 1 ? '' : 's'} pending. <button style={button} onClick={() => setImageEdits([])}>Undo image changes</button></p>}
    {textEdits.length > 0 && <p style={note}>{textEdits.length} text change{textEdits.length === 1 ? '' : 's'} pending. <button style={button} onClick={() => setTextEdits([])}>Undo all text changes</button></p>}
    <button style={button} disabled={!file || (!overlays.length && !textEdits.length && !imageEdits.length) || action.busy || rendering || !!renderError} onClick={() => void action.run(async () => {
      if (!file) return
      const document = await PDFDocument.load(await file.arrayBuffer()); const font = await document.embedFont(StandardFonts.Helvetica)
      let unmatched = 0, localized = 0
      if (imageEdits.length) {
        const { editPageImages } = await import('../lib/text-edit')
        for (const pageNumber of new Set(imageEdits.map((entry) => entry.page))) {
          const result = await editPageImages(document, pageNumber - 1, imageEdits.filter((entry) => entry.page === pageNumber).map(({ box, action: kind, image }) => ({ box, action: kind, image })))
          unmatched += result.unmatched; localized += result.localized
        }
      }
      if (textEdits.length) {
        const { editPageText } = await import('../lib/text-edit')
        for (const pageNumber of new Set(textEdits.map((entry) => entry.page))) {
          const result = await editPageText(document, pageNumber - 1, textEdits.filter((entry) => entry.page === pageNumber).map(({ box, replacement: value }) => ({ box, replacement: value })))
          unmatched += result.unmatched; localized += result.localized
        }
      }
      for (const overlay of overlays) {
        const target = document.getPage(overlay.page - 1); const rotation = ((target.getRotation().angle % 360) + 360) % 360
        const crop = target.getCropBox(); const viewWidth = rotation === 90 || rotation === 270 ? crop.height : crop.width
        function convert(point: Point) {
          if (rotation === 90) return { x: crop.x + point.y * crop.width, y: crop.y + point.x * crop.height }
          if (rotation === 180) return { x: crop.x + (1 - point.x) * crop.width, y: crop.y + point.y * crop.height }
          if (rotation === 270) return { x: crop.x + (1 - point.y) * crop.width, y: crop.y + (1 - point.x) * crop.height }
          return { x: crop.x + point.x * crop.width, y: crop.y + (1 - point.y) * crop.height }
        }
        const ink = rgb(parseInt(overlay.color.slice(1, 3), 16) / 255, parseInt(overlay.color.slice(3, 5), 16) / 255, parseInt(overlay.color.slice(5, 7), 16) / 255)
        if (overlay.kind === 'text') {
          try { target.drawText(overlay.text, { ...convert(overlay.points[0]), font, size: overlay.size / 595 * viewWidth, color: ink, rotate: degrees(rotation) }) } catch { throw new Error('Text export supports Latin characters only. Use a handwritten overlay for other scripts.') }
        } else {
          const thickness = (overlay.penWidth ?? 0.002) * viewWidth
          if (overlay.points.length === 1) target.drawCircle({ ...convert(overlay.points[0]), size: thickness / 2, color: ink })
          for (let index = 1; index < overlay.points.length; index++) target.drawLine({ start: convert(overlay.points[index - 1]), end: convert(overlay.points[index]), color: ink, thickness })
        }
      }
      download(await pdfBlob(document), 'edited-document.pdf')
      action.setMessage([unmatched ? `${unmatched} selected text run${unmatched === 1 ? '' : 's'} could not be located in the page content and ${unmatched === 1 ? 'was' : 'were'} not changed.` : '', localized ? `${localized} change${localized === 1 ? ' was' : 's were'} in an element reused on other pages (such as a letterhead); ${localized === 1 ? 'it was' : 'they were'} applied to this page only and other pages keep the original.` : '', 'Edited PDF downloaded. Existing digital signatures are invalidated by any edit.'].filter(Boolean).join(' '))
    })}>Download edited PDF</button><Status action={action} /></section>
}

export default function WorkspaceTools({ toolId, files }: Props) {
  let content: ReactNode
  switch (toolId) {
    case 'scan': content = <Scan files={files} />; break
    case 'workflow': content = <Workflow files={files} />; break
    case 'thumbmark': content = <Thumbmark files={files} />; break
    case 'compare': content = <Compare files={files} />; break
    case 'invoice': content = <Business pos={false} />; break
    case 'pos': content = <Business pos />; break
    case 'gst-prep': content = <GstPrep files={files} />; break
    case 'share': content = <PeerWorkspace files={files} whiteboard={false} />; break
    case 'whiteboard': content = <PeerWorkspace files={files} whiteboard />; break
    case 'edit': content = <PdfEdit files={files} />; break
    default: content = <p role="alert">Unknown workspace tool: {toolId}</p>
  }
  return <div key={toolId} style={{ width: '100%', minWidth: 0 }}>{content}</div>
}
