import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, Clock3, Code2, FileText, Github, Grid2X2, HelpCircle, Info, LoaderCircle, LockKeyhole, Menu, Moon, Plus, Search, ShieldCheck, Star, Sun, Trash2, Upload, X } from 'lucide-react'
import { acceptsFile, categories, tools, type Tool } from './tools'
import { panelToolIds, processTool, type ToolkitOptions } from './lib/process'
import ExtendedSettings from './components/ExtendedSettings'
import PdfPreview from './components/PdfPreview'

const WorkspaceTools = lazy(() => import('./components/WorkspaceTools'))
const IntelligencePanel = lazy(() => import('./components/IntelligencePanel'))
const PageSorter = lazy(() => import('./components/PageSorter'))

type RecentFile = { name: string; size: number; tool: string; date: number }
type Result = { blob: Blob; filename: string; message?: string }
function readStorage<T,>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function formatSize(bytes: number) { return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB` }
const pdfAccept = 'application/pdf,.pdf'
/** `?target=200kb` (set by size-specific landing pages) preselects compress-to-size. */
function targetFromUrl(): ToolkitOptions {
  const match = /^(\d+(?:\.\d+)?)(kb|mb)$/i.exec(new URLSearchParams(location.search).get('target') ?? '')
  if (!match) return {}
  const value = Number(match[1]), unit = match[2].toUpperCase()
  return { compressPreset: 'target', targetValue: value, targetUnit: unit, targetBytes: Math.round(value * (unit === 'KB' ? 1024 : 1024 * 1024)) }
}
const defaultOptions = (id = ''): ToolkitOptions => ({ rotation: 90, ...(id === 'watermark' ? { text: 'CONFIDENTIAL' } : {}), ...(id === 'compress' ? targetFromUrl() : {}), fontSize: 18 })

export default function App() {
  const [view, setView] = useState('Dashboard')
  const [category, setCategory] = useState('All tools')
  const [query, setQuery] = useState('')
  const [activeTool, setActiveTool] = useState<Tool | null>(() => tools.find(tool => tool.id === location.hash.slice(1)) || null)
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState<ToolkitOptions>(() => defaultOptions(location.hash.slice(1)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [dragging, setDragging] = useState(false)
  const [stars, setStars] = useState<string[]>(() => readStorage('paperwork-stars', []))
  const [recent, setRecent] = useState<RecentFile[]>(() => readStorage('paperwork-recent', []))
  const [dark, setDark] = useState(() => readStorage('paperwork-dark', false))
  const [mobileMenu, setMobileMenu] = useState(false)
  const [info, setInfo] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('paperwork-dark', JSON.stringify(dark)) } catch {} }, [dark])
  useEffect(() => { try { localStorage.setItem('paperwork-stars', JSON.stringify(stars)) } catch {} }, [stars])
  useEffect(() => { try { localStorage.setItem('paperwork-recent', JSON.stringify(recent)) } catch {} }, [recent])
  useEffect(() => {
    const onHash = () => {
      const selected = tools.find(tool => tool.id === location.hash.slice(1)) || null
      setActiveTool(selected); setFiles([]); setOptions(defaultOptions(selected?.id)); setResult(null); setError('')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const goHome = useCallback((nextView = 'Dashboard', nextCategory = 'All tools') => {
    if (busy) return
    history.replaceState(null, '', location.pathname + location.search)
    setActiveTool(null); setFiles([]); setResult(null); setError(''); setView(nextView); setCategory(nextCategory); setQuery(''); setMobileMenu(false)
  }, [busy])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); goHome(); requestAnimationFrame(() => searchInput.current?.focus())
      }
      if (event.key === 'Escape') { setInfo(false); setMobileMenu(false) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [goHome])

  function openTool(tool: Tool, initialFiles: File[] = []) {
    if (busy) return
    history.pushState(null, '', `#${tool.id}`)
    setActiveTool(tool); setFiles(initialFiles); setOptions(defaultOptions(tool.id)); setResult(null); setError(''); setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function receiveFiles(incoming: FileList | File[]) {
    if (busy) return
    const selected = Array.from(incoming)
    if (!selected.length) return
    const tool = activeTool || tools.find(tool => tool.id === 'organize')!
    const invalid = selected.find(file => !acceptsFile(tool, file.name, file.type))
    if (invalid) { setError(`“${invalid.name}” is not supported. Accepted formats: ${tool.accept ?? (tool.id === 'images' ? 'JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, SVG' : '.pdf')}.`); return }
    if (selected.some(file => file.size > 100 * 1024 * 1024)) { setError('Please choose files smaller than 100 MB each.'); return }
    const nextFiles = tool.multiple ? [...files, ...selected] : [selected[0]]
    if (nextFiles.length > 50) { setError('Please work with 50 files or fewer at a time.'); return }
    if (!activeTool) openTool(tool, nextFiles)
    else { setFiles(nextFiles); setError(''); setResult(null) }
  }
  function toggleStar(id: string) { setStars(current => current.includes(id) ? current.filter(star => star !== id) : [...current, id]) }
  async function runTool() {
    if (!activeTool || !files.length && !activeTool.noFile || busy) return
    setBusy(true); setError(''); setResult(null)
    try {
      const output = await processTool(activeTool.id, files, options)
      setResult(output)
      setRecent(current => [...files.map(file => ({ name: file.name, size: file.size, tool: activeTool.name, date: Date.now() })), ...current].slice(0, 20))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try another file.') }
    finally { setBusy(false) }
  }
  function download() {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
  const filteredTools = tools.filter(tool => (category === 'All tools' || tool.category === category) && (view !== 'Starred tools' || stars.includes(tool.id)) && `${tool.name} ${tool.short} ${tool.category}`.toLowerCase().includes(query.toLowerCase()))
  const isDashboard = view === 'Dashboard'
  const patchOptions = (patch: ToolkitOptions) => { setOptions(current => ({ ...current, ...patch })); setResult(null) }
  const interactive = activeTool?.workspace || panelToolIds.includes(activeTool?.id ?? '')

  return <div className="app-shell">
    {mobileMenu && <button aria-label="Close navigation" className="nav-scrim" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => goHome()} aria-label="Paperwork home"><span className="brand-mark"><FileText size={22} strokeWidth={1.8} /></span><span>paperwork<span className="brand-period">.</span></span></button>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Workspace">
        <button className={!activeTool && view === 'Dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => goHome()}><Grid2X2 size={18} /> All tools</button>
        <button className={!activeTool && view === 'Recent files' ? 'nav-item active' : 'nav-item'} onClick={() => goHome('Recent files')}><Clock3 size={18} /> Recent files {recent.length > 0 && <span className="nav-count">{recent.length}</span>}</button>
        <button className={!activeTool && view === 'Starred tools' ? 'nav-item active' : 'nav-item'} onClick={() => goHome('Starred tools')}><Star size={18} /> Starred tools {stars.length > 0 && <span className="nav-count">{stars.length}</span>}</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-privacy"><ShieldCheck size={16} /><span>Local processing. You control sharing.</span></div>
        <button className="nav-item open-source-nav" onClick={() => setInfo(true)}><Code2 size={17} /> About Paperwork <ArrowRight size={14} /></button>
        <div className="sidebar-footer">Free & open source</div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={19} /></button><span className="breadcrumb-home">Workspace</span><ChevronRight size={13} /><span>{activeTool ? activeTool.name : view === 'Dashboard' ? 'All tools' : view}</span></div><div className="topbar-actions"><button className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button help-button" onClick={() => setInfo(true)} aria-label="Help and privacy"><HelpCircle size={18} /></button></div></header>

      <main className="content">
        {activeTool ? <>
          <button className="back-link" disabled={busy} onClick={() => goHome()}><ArrowLeft size={15} /> Back to all tools</button>
          <div className="editor-heading"><div className={`tool-icon ${activeTool.color}`}><activeTool.icon size={27} /></div><div><h1>{activeTool.name}</h1><p>{activeTool.description}</p></div><span className="local-tag"><LockKeyhole size={13} /> Processed on your device</span></div>
          {activeTool.notice && <div className="settings-info tool-notice"><Info size={17} /><p>{activeTool.notice}</p></div>}
          <div className="editor-layout">
            <section className="editor-controls" aria-label={`${activeTool.name} settings`}>
              <div className="control-section"><div className="control-heading"><span className="step">1</span><h2>{activeTool.multiple ? 'Choose your files' : 'Choose your file'}</h2></div>
                <div className={`dropzone compact ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); receiveFiles(event.dataTransfer.files) }}><Upload size={22} /><button className="select-link" disabled={busy} onClick={() => uploadInput.current?.click()}>{files.length ? activeTool.multiple ? 'Add more files' : 'Replace file' : 'Select a file'}</button><span>{activeTool.noFile ? 'Optional for tools with built-in content controls' : `Accepted: ${activeTool.accept ?? (activeTool.id === 'images' ? 'JPG / PNG / WebP / HEIC / GIF / BMP / TIFF / SVG' : 'PDF')}`}</span></div>
                {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-item" key={`${file.name}-${index}`}><div className="mini-pdf"><FileText size={17} /></div><div><strong title={file.name}>{file.name}</strong><span>{formatSize(file.size)}</span></div>{activeTool.multiple && <div className="file-reorder"><button disabled={busy || index === 0} aria-label={`Move ${file.name} up`} onClick={() => { const next = [...files]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setFiles(next); setResult(null) }}>↑</button><button disabled={busy || index === files.length - 1} aria-label={`Move ${file.name} down`} onClick={() => { const next = [...files]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setFiles(next); setResult(null) }}>↓</button></div>}<button className="icon-button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => { setFiles(files.filter((_, position) => position !== index)); setResult(null) }}><X size={14} /></button></div>)}</div>}
              </div>
              {!interactive && <fieldset disabled={busy} className="control-section settings-section"><legend className="control-heading"><span className="step">2</span><h2>Make it your own</h2></legend>
                <ExtendedSettings toolId={activeTool.id} options={options} onChange={patchOptions} />
                {['split', 'organize', 'rotate', 'text'].includes(activeTool.id) && <label className="field">{activeTool.id === 'organize' ? 'Page order' : 'Pages'}<input placeholder={activeTool.id === 'organize' ? 'e.g. 3, 1, 2, 5-7' : 'All pages, or e.g. 1, 3-5'} value={options.pages || ''} onChange={event => patchOptions({ pages: event.target.value })} /><small>{activeTool.id === 'organize' ? 'List pages in the order you want. Omitted pages are removed.' : activeTool.id === 'split' ? 'Leave blank to download each page separately in a ZIP.' : 'Leave blank to apply to every page.'}</small></label>}
                {activeTool.id === 'organize' && files[0] && /\.pdf$/i.test(files[0].name) && <Suspense fallback={<p className="settings-copy">Loading pages…</p>}><PageSorter file={files[0]} value={String(options.pages ?? '')} onChange={pages => patchOptions({ pages })} /></Suspense>}
                {activeTool.id === 'rotate' && <label className="field">Rotate clockwise<select value={options.rotation} onChange={event => patchOptions({ rotation: Number(event.target.value) })}><option value={90}>90 degrees</option><option value={180}>180 degrees</option><option value={270}>270 degrees</option></select></label>}
                {['watermark', 'text'].includes(activeTool.id) && <label className="field">{activeTool.id === 'watermark' ? 'Watermark text' : 'Your text'}<textarea placeholder="Write something…" value={options.text || ''} maxLength={500} onChange={event => patchOptions({ text: event.target.value })} /><small>{activeTool.id === 'text' ? 'Adds new text near the top of the selected pages. Does not edit existing text.' : 'A translucent diagonal mark is added to every page.'}</small></label>}
                {activeTool.id === 'watermark' && <><label className="field">Image watermark (optional)<input type="file" accept="image/png,image/jpeg" onChange={event => patchOptions({ watermarkImage: event.target.files?.[0] })} /><small>{options.watermarkImage ? `${(options.watermarkImage as File).name} is centered at half page size. Clear the text above for an image-only watermark.` : 'PNG with transparency works best.'}</small></label><label className="field">Opacity<select value={String(options.opacity ?? 0.22)} onChange={event => patchOptions({ opacity: Number(event.target.value) })}>{[0.1, 0.22, 0.35, 0.5, 0.75, 1].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label></>}
                {activeTool.id === 'text' && <label className="field">Font size<select value={options.fontSize} onChange={event => patchOptions({ fontSize: Number(event.target.value) })}>{[12, 16, 18, 24, 32].map(size => <option key={size} value={size}>{size} pt</option>)}</select></label>}
                {activeTool.id === 'metadata' && <><label className="field">Document title<input value={options.title || ''} placeholder="A great document" onChange={event => patchOptions({ title: event.target.value })} /></label><label className="field">Author<input value={options.author || ''} placeholder="Your name" onChange={event => patchOptions({ author: event.target.value })} /></label></>}
                {activeTool.id === 'compress' && <><label className="field">Compression level<select value={String(options.compressPreset ?? 'lossless')} onChange={event => { const compressPreset = event.target.value as ToolkitOptions['compressPreset']; patchOptions(compressPreset === 'target' && !options.targetBytes ? { compressPreset, targetValue: 1, targetUnit: 'MB', targetBytes: 1024 * 1024 } : { compressPreset }) }}><option value="lossless">Lossless (no quality change)</option><option value="balanced">Balanced (≈150 DPI, JPEG 75%)</option><option value="strong">Strong (≈100 DPI, JPEG 60%)</option><option value="extreme">Extreme (≈72 DPI, JPEG 45%)</option><option value="target">Target size (e.g. under 1 MB)</option></select></label>{options.compressPreset === 'target' && <div className="target-size"><label className="field">Maximum file size<input type="number" min={10} step="any" inputMode="decimal" value={Number(options.targetValue ?? 1)} onChange={event => { const value = Number(event.target.value); patchOptions({ targetValue: value, targetBytes: Math.round(value * (options.targetUnit === 'KB' ? 1024 : 1024 * 1024)) }) }} /></label><label className="field">Unit<select value={String(options.targetUnit ?? 'MB')} onChange={event => { const unit = event.target.value; patchOptions({ targetUnit: unit, targetBytes: Math.round(Number(options.targetValue ?? 1) * (unit === 'KB' ? 1024 : 1024 * 1024)) }) }}><option>MB</option><option>KB</option></select></label><div className="target-presets">{[['100 KB', 100, 'KB'], ['200 KB', 200, 'KB'], ['500 KB', 500, 'KB'], ['1 MB', 1, 'MB'], ['2 MB', 2, 'MB'], ['5 MB', 5, 'MB']].map(([label, value, unit]) => <button key={String(label)} type="button" className={options.targetValue === value && (options.targetUnit ?? 'MB') === unit ? 'active' : ''} onClick={() => patchOptions({ targetValue: value, targetUnit: unit, targetBytes: Number(value) * (unit === 'KB' ? 1024 : 1024 * 1024) })}>{label}</button>)}</div></div>}<div className="settings-info"><Info size={17} /><p>{options.compressPreset === 'target' ? 'Tries lossless optimization first, then the gentlest image downsampling that fits under your limit. Common limits: email attachments 10–25 MB, job portals and government forms 1–2 MB or 200–500 KB.' : (options.compressPreset ?? 'lossless') === 'lossless' ? 'Lossless optimization repackages your PDF without changing its appearance. Already optimized files may not get smaller.' : 'Embedded RGB/grayscale photos are downsampled and re-encoded as JPEG. Text and vector graphics stay sharp. Masked, CMYK and indexed images are kept as-is. The original is returned if nothing gets smaller.'}</p></div></>}
                {activeTool.id === 'merge' && <p className="settings-copy">Files are combined from top to bottom. Use the arrows to change their order. Add at least two PDFs to get started.</p>}
                {activeTool.id === 'images' && <p className="settings-copy">Each image becomes its own page, sized to fit without cropping. Use the arrows to change the order.</p>}
                {activeTool.id === 'numbers' && <p className="settings-copy">Page numbers are added to the bottom center of every page.</p>}
                {activeTool.id === 'extract-text' && <div className="settings-info"><Info size={17} /><p>Extracts selectable text. For scanned documents, use Searchable PDF (OCR) first.</p></div>}
                {activeTool.id === 'pdf-images' && <><label className="field">Resolution<select value={String(options.dpi ?? 150)} onChange={event => patchOptions({ dpi: Number(event.target.value) })}><option value="72">72 DPI (screen, smallest)</option><option value="150">150 DPI (standard)</option><option value="300">300 DPI (print quality)</option><option value="600">600 DPI (maximum detail)</option></select></label><label className="field">Pages<input placeholder="All pages, or e.g. 1-3, 5" value={String(options.pages ?? '')} onChange={event => patchOptions({ pages: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={Boolean(options.transparent)} onChange={event => patchOptions({ transparent: event.target.checked })} /> Transparent background</label><p className="settings-copy">One page downloads as a PNG; several pages download together in a ZIP.</p></>}
              </fieldset>}
              <div className="control-section action-section">{error && <div className="error-message" role="alert"><Info size={16} />{error}</div>}{!interactive && (result ? <div className="success-result" role="status"><div className="success-heading"><CheckCheck size={20} /><strong>All done. All yours.</strong></div><p>{result.message || `${result.filename} · ${formatSize(result.blob.size)}`}</p><button className="primary-button full-width" onClick={download}><ArrowDownToLine size={17} /> Download {result.filename.split('.').pop()?.toUpperCase()}</button><button className="start-over" onClick={() => { setFiles([]); setResult(null); setError('') }}>Work on another file</button></div> : <button className="primary-button full-width" disabled={!files.length && !activeTool.noFile || busy || activeTool.id === 'merge' && files.length < 2} onClick={() => void runTool()}>{busy ? <LoaderCircle size={17} className="spin" /> : <activeTool.icon size={17} />}{busy ? 'Working locally…' : activeTool.label}{!busy && <ArrowRight size={16} />}</button>)}<span className="local-footnote"><ShieldCheck size={12} /> Local processing. Sharing only when you pair a peer.</span></div>
            </section>
            {interactive ? <Suspense fallback={<p role="status">Loading workspace…</p>}>{activeTool.workspace ? <WorkspaceTools key={activeTool.id} toolId={activeTool.id} files={files} /> : <IntelligencePanel key={activeTool.id} toolId={activeTool.id} files={files} />}</Suspense> : files.length > 0 && /\.pdf$/i.test(files[0].name) ? <PdfPreview file={files[0]} /> : <div className="preview-empty"><div className="empty-document"><FileText size={40} strokeWidth={1} /></div><h3>{files.length ? 'Ready to convert.' : 'A fresh page awaits.'}</h3><p>{files.length ? files[0].name : 'Add a file or use the content controls.'}</p><span><LockKeyhole size={12} /> Local processing.</span></div>}
          </div>
        </> : view === 'Recent files' ? <section className="recent-view"><div className="section-eyebrow">PICK UP WHERE YOU LEFT OFF</div><h1>Recently worked on.</h1><p className="page-description">A little history. Not a single file stored.</p>{recent.length ? <><div className="recent-list"><div className="recent-table-head"><span>DOCUMENT</span><span>LAST USED WITH</span><span>SIZE</span></div>{recent.map((file, index) => <div className="recent-row" key={`${file.name}-${file.date}-${index}`}><div><span className="mini-pdf"><FileText size={19} /></span><span><strong>{file.name}</strong><small>{new Date(file.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span></div><span>{file.tool}</span><span>{formatSize(file.size)}</span></div>)}</div><button className="text-button" onClick={() => setRecent([])}><Trash2 size={14} /> Clear history</button></> : <div className="empty-state"><Clock3 size={36} strokeWidth={1.3} /><h2>A clean slate.</h2><p>Your recent file names appear here after you use a tool.<br />The actual documents never get stored.</p><button className="primary-button" onClick={() => goHome()}>Explore the tools <ArrowRight size={16} /></button></div>}</section> : <>
          {isDashboard && <>
            <div className="hero"><h1>Your PDFs, simplified.</h1><p>Everyday PDF tools. Free, private, and all in your browser.</p></div>
            <div className={`dropzone dashboard-drop ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); receiveFiles(event.dataTransfer.files) }}><span className="upload-symbol"><Upload size={24} strokeWidth={1.5} /></span><div><h2>Start with a document</h2><p>Drop a PDF here, or choose a file.</p></div><button className="primary-button" onClick={() => uploadInput.current?.click()}><Plus size={17} /> Choose a file</button></div>
            {error && <div className="error-message" role="alert">{error}</div>}
          </>}
          <section className="all-tools-section"><div className="section-heading all-tools-heading"><div><h2>{view === 'Starred tools' ? 'Starred tools' : category === 'All tools' ? 'All tools' : category}</h2><p>{view === 'Starred tools' ? 'Your saved tools, in one place.' : 'A small toolkit for whatever’s next.'}</p></div><label className="tool-search"><Search size={16} /><input ref={searchInput} aria-label="Search tools" placeholder="Search tools…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label></div>
            <div className="tool-filters" aria-label="Filter tools">{categories.map(name => <button key={name} className={category === name ? 'filter active' : 'filter'} onClick={() => setCategory(name)}>{name}{name === 'All tools' && <span>{view === 'Starred tools' ? stars.length : tools.length}</span>}</button>)}</div>
            <div className="tools-grid">{filteredTools.map(tool => <article key={tool.id} className="tool-card"><button className="tool-card-action" onClick={() => openTool(tool)}><span className={`tool-icon ${tool.color}`}><tool.icon size={21} strokeWidth={1.7} /></span><div><h3>{tool.name}</h3><p>{tool.short}</p></div><ArrowRight className="card-arrow" size={16} /></button><button className={`star-tool ${stars.includes(tool.id) ? 'starred' : ''}`} onClick={() => toggleStar(tool.id)} aria-label={`${stars.includes(tool.id) ? 'Unstar' : 'Star'} ${tool.name}`} aria-pressed={stars.includes(tool.id)}><Star size={14} fill={stars.includes(tool.id) ? 'currentColor' : 'none'} /></button></article>)}</div>
            {!filteredTools.length && <div className="empty-state"><Search size={30} /><h3>{view === 'Starred tools' && !stars.length ? 'Keep your go-to tools close.' : 'No tools found.'}</h3><p>{view === 'Starred tools' && !stars.length ? 'Tap the star beside any tool to save it here.' : 'Try a different search or category.'}</p><button className="text-button" onClick={() => goHome()}>See all tools <ArrowRight size={14} /></button></div>}
          </section>
        </>}
        <footer className="page-footer"><span>No accounts. Local processing. Optional peer sharing.</span><button onClick={() => setInfo(true)}><Code2 size={13} /> Open source</button></footer>
      </main>
    </div>
    <input className="sr-only" ref={uploadInput} type="file" aria-label="Upload document" accept={activeTool?.accept ?? (activeTool?.id === 'images' ? '.png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif,.svg,image/*' : pdfAccept)} multiple={activeTool?.multiple || false} onChange={event => { if (event.target.files) receiveFiles(event.target.files); event.target.value = '' }} />
    {info && <div className="modal-backdrop" onClick={() => setInfo(false)}><section className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={event => event.stopPropagation()}><button className="icon-button close-dialog" autoFocus onClick={() => setInfo(false)} aria-label="Close about"><X size={19} /></button><span className="about-icon"><ShieldCheck size={31} /></span><div className="section-eyebrow">LOCAL FIRST. OPEN SOURCE.</div><h2 id="about-title">Your paperwork.<br /><em>Not our business.</em></h2><p>Paperwork is an independent, MIT-licensed PDF toolkit inspired by ihatepdf.cv. Documents are processed in your browser. Optional peer sharing transmits files only when you initiate it.</p><div className="about-facts"><span><Check size={15} /> No automatic document uploads or analytics</span><span><Check size={15} /> No accounts, payments, or added watermarks</span><span><Check size={15} /> Recent metadata and saved preferences stay local</span></div><p className="about-small">OCR, transcription and browser AI may download models after consent. Offline use requires the relevant tools and resources to be available beforehand; loading the home page alone is not enough. Download the source for self-hosting and the full feature/limitations matrix. Not affiliated with ihatepdf.cv.</p><a className="primary-button" href={`${import.meta.env.BASE_URL}paperwork-source.zip`} download><Github size={16} /> Download source <ArrowDownToLine size={16} /></a><div className="about-tech">Built with React · PDF-lib · PDF.js · JSZip</div></section></div>}
  </div>
}
