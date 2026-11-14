import { useRef } from 'react'
import type { ToolkitOptions } from '../lib/process'

type Props = { toolId: string; options: ToolkitOptions; onChange: (patch: ToolkitOptions) => void }
export default function ExtendedSettings({ toolId, options, onChange }: Props) {
  const textField = (key: string, label: string, placeholder = '', multiline = false) => <label className="field" key={key}>{label}{multiline ? <textarea value={String(options[key] ?? '')} placeholder={placeholder} onChange={event => onChange({ [key]: event.target.value })} /> : <input type={key.toLowerCase().includes('password') ? 'password' : 'text'} value={String(options[key] ?? '')} placeholder={placeholder} onChange={event => onChange({ [key]: event.target.value })} />}</label>
  const numberField = (key: string, label: string, fallback: number, min = 0, max = 10000) => <label className="field" key={key}>{label}<input type="number" min={min} max={max} value={Number(options[key] ?? fallback)} onChange={event => onChange({ [key]: Number(event.target.value) })} /></label>
  const selectField = (key: string, label: string, values: string[]) => <label className="field" key={key}>{label}<select value={String(options[key] ?? values[0])} onChange={event => onChange({ [key]: event.target.value })}>{values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
  const pageTools = ['delete-pages', 'extract-pages', 'flip', 'crop', 'sign', 'redact', 'invert', 'pdf-jpg', 'pdf-tiff', 'pdf-handwriting', 'ocr']
  const sourceTools = ['txt-pdf', 'create-pdf', 'markdown-pdf', 'html-pdf', 'resume', 'csv-pdf', 'text-handwriting']
  return <>
    {toolId === 'sign' && <><SignaturePad hasDrawing={options.signatureImage instanceof Blob} onChange={signatureImage => onChange({ signatureImage })} />{selectField('align', 'Position (bottom of page)', ['right', 'center', 'left'])}</>}
    {pageTools.includes(toolId) && textField('pages', 'Pages', 'All pages, or 1, 3-5')}
    {sourceTools.includes(toolId) && textField('text', toolId === 'resume' ? 'Resume content' : 'Source text (or upload a file)', toolId === 'csv-pdf' ? 'Name,Quantity,Price\nPaper,2,10' : 'Write your document…', true)}
    {['split-text', 'sign', 'bates', 'headers', 'redact'].includes(toolId) && textField('text', toolId === 'split-text' ? 'Split before pages containing' : toolId === 'redact' ? 'Exact text to redact' : toolId === 'headers' ? 'Header / footer text' : toolId === 'sign' ? (options.signatureImage instanceof Blob ? 'Typed signature (not used while a drawing is present)' : 'Or type your signature') : 'Signature / label text')}
    {['split-size', 'crop', 'nup', 'sign', 'bates', 'headers', 'text-handwriting'].includes(toolId) && numberField('margin', 'Margin (points)', 24)}
    {toolId === 'split-size' && numberField('maxSizeMb', 'Maximum part size (MB)', 5, 0.01, 100)}
    {toolId === 'split-half' && <>{selectField('mode', 'Split method', ['pages', 'document'])}{options.mode !== 'document' && selectField('axis', 'Page slicing direction', ['vertical', 'horizontal'])}</>}
    {toolId === 'flip' && selectField('axis', 'Mirror direction', ['horizontal', 'vertical'])}
    {toolId === 'nup' && numberField('columns', 'Columns', 2, 1, 8)}
    {toolId === 'headers' && selectField('mode', 'Placement', ['header', 'footer', 'both'])}
    {toolId === 'invert' && selectField('mode', 'Colour treatment', ['invert', 'sepia', 'grayscale'])}
    {toolId === 'zip' && selectField('mode', 'ZIP contents', ['png', 'jpeg', 'bundle'])}
    {toolId === 'split-text' && selectField('mode', 'Text matching', ['insensitive', 'sensitive'])}
    {toolId === 'redact' && <>{selectField('mode', 'Redaction method', ['text', 'rectangle', 'pages'])}{options.mode === 'rectangle' && <>{numberField('margin', 'Offset from top and left (points)', 24)}{numberField('width', 'Rectangle width (points)', 120, 1)}{numberField('height', 'Rectangle height (points)', 40, 1)}</>}</>}
    {toolId === 'crop' && <>{numberField('width', 'Output width (points)', 595, 1)}{numberField('height', 'Output height (points)', 842, 1)}</>}
    {toolId === 'bates' && <>{textField('prefix', 'Number prefix', 'DOC-')}{numberField('startNumber', 'Start at', 1)}</>}
    {toolId === 'fingerprint' && <>{selectField('mode', 'Fingerprint action', ['checksum', 'embed', 'detect'])}{options.mode === 'embed' && textField('text', 'Recipient label (kept in your ledger)', 'Acme Legal — review copy')}<p className="settings-copy">checksum: hash files. embed: add a unique traceable ID to a copy. detect: read the ID from a leaked copy.</p></>}
    {toolId === 'fill-form' && textField('formValues', 'Form field values (JSON)', '{"Name":"Jane","Approved":true}', true)}
    {['pdf-jpg', 'pdf-tiff'].includes(toolId) && numberField('dpi', 'Resolution (DPI)', 150, 72, 600)}
    {toolId === 'pdf-tiff' && <>{selectField('mode', 'TIFF output', ['multipage', 'zip'])}<p className="settings-copy">Uncompressed raster output. Maximum 16 megapixels per page; multipage files are limited to 256 MB. Large pages may use a lower DPI.</p></>}
    {['pdf-handwriting', 'text-handwriting', 'create-pdf', 'txt-pdf', 'markdown-pdf', 'resume', 'sign', 'headers', 'bates'].includes(toolId) && numberField('fontSize', 'Font size (points)', 18, 6, 72)}
    {toolId === 'encrypt' && <>{textField('password', 'New opening password')}{textField('ownerPassword', 'Owner password (optional)')}</>}
    {['remove-password', 'unlock', 'encrypt'].includes(toolId) && textField('currentPassword', 'Current password (if encrypted)')}
    {['ocr', 'handwriting-pdf'].includes(toolId) && textField('language', 'OCR language code', 'eng')}
    {toolId === 'auto-redact' && textField('terms', 'Additional exact terms (one per line)', 'Account holder name\nInternal project name', true)}
    {['ocr', 'handwriting-pdf', 'audio-pdf', 'auto-redact'].includes(toolId) && <label className="settings-copy"><input type="checkbox" checked={options.modelDownloadConsent === true} onChange={event => onChange({ modelDownloadConsent: event.target.checked })} /> Allow recognition resources to download. Document processing stays on this device.</label>}
  </>
}

/** Draw a signature with a mouse, finger or stylus; exported as a transparent PNG. */
function SignaturePad({ hasDrawing, onChange }: { hasDrawing: boolean; onChange: (image: Blob | undefined) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height }
  }
  const line = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.strokeStyle = '#1c2340'; context.lineWidth = 5; context.lineCap = 'round'; context.lineJoin = 'round'
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke()
  }
  const finish = () => {
    if (!last.current) return
    last.current = null
    canvas.current?.toBlob(blob => onChange(blob ?? undefined), 'image/png')
  }
  const clear = () => { const element = canvas.current; element?.getContext('2d')?.clearRect(0, 0, element.width, element.height); onChange(undefined) }
  return <div className="field signature-pad"><span>Draw your signature</span>
    <canvas ref={canvas} width={720} height={240} aria-label="Signature drawing area. Draw with a mouse, finger or stylus." role="img"
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); last.current = point(event); line(last.current, last.current) }}
      onPointerMove={event => { if (!last.current) return; const next = point(event); line(last.current, next); last.current = next }}
      onPointerUp={finish} onPointerCancel={finish} />
    <small>{hasDrawing ? 'Your drawn signature will be placed on the selected pages.' : 'Sign with a mouse, finger or stylus, or type it below.'} <button type="button" className="text-button" onClick={clear}>Clear</button></small>
  </div>
}
