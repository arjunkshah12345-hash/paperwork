import { Combine, Scissors, Minimize2, RotateCw, LayoutGrid, Images, Stamp, ListOrdered, Type, FilePenLine, FileText, Image } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const coreTools = [
  { id: 'merge', name: 'Merge PDF', description: 'Good things come together. Combine your PDFs into one.', short: 'Combine multiple PDFs into one file.', category: 'Organize', icon: Combine, color: 'orange', label: 'Merge PDFs', multiple: true, popular: true },
  { id: 'split', name: 'Split PDF', description: 'Keep what you need. Leave the rest.', short: 'Separate pages or extract a range.', category: 'Organize', icon: Scissors, color: 'blue', label: 'Split PDF', multiple: false, popular: true },
  { id: 'compress', name: 'Compress PDF', description: 'A little lighter. A lot easier to share.', short: 'Shrink a PDF losslessly, with image presets, or to an exact size like 1 MB.', category: 'Optimize', icon: Minimize2, color: 'green', label: 'Optimize PDF', multiple: false, popular: true },
  { id: 'images', name: 'Images to PDF', description: 'Your images, all on the same page. Almost.', short: 'Turn JPG, PNG, WebP, HEIC, GIF, BMP, TIFF or SVG images into a PDF.', category: 'Convert', icon: Images, color: 'purple', label: 'Create PDF', multiple: true, popular: true },
  { id: 'organize', name: 'Organize PDF', description: 'Everything in its right place.', short: 'Reorder, duplicate, or remove pages.', category: 'Organize', icon: LayoutGrid, color: 'orange', label: 'Save page order', multiple: false },
  { id: 'rotate', name: 'Rotate PDF', description: 'A fresh perspective. In 90-degree increments.', short: 'Get your pages facing the right way.', category: 'Organize', icon: RotateCw, color: 'blue', label: 'Rotate PDF', multiple: false },
  { id: 'text', name: 'Add text', description: 'A few words can make all the difference.', short: 'Add a note or heading to your pages.', category: 'Edit & annotate', icon: Type, color: 'purple', label: 'Add text', multiple: false },
  { id: 'watermark', name: 'Watermark PDF', description: 'Make it unmistakably yours.', short: 'Add a subtle text watermark.', category: 'Edit & annotate', icon: Stamp, color: 'green', label: 'Add watermark', multiple: false },
  { id: 'numbers', name: 'Page numbers', description: 'Never lose your place again.', short: 'Add page numbers to your document.', category: 'Edit & annotate', icon: ListOrdered, color: 'orange', label: 'Add page numbers', multiple: false },
  { id: 'pdf-images', name: 'PDF to images', description: 'Give every page a moment of its own.', short: 'Export PDF pages as PNG images at 72–600 DPI.', category: 'Convert', icon: Image, color: 'blue', label: 'Export images', multiple: false },
  { id: 'extract-text', name: 'PDF to text', description: 'Less formatting. More of the good stuff.', short: 'Extract selectable text to a TXT file.', category: 'Convert', icon: FileText, color: 'green', label: 'Extract text', multiple: false },
  { id: 'metadata', name: 'Edit metadata', description: 'It’s what’s on the inside that counts.', short: 'Update the title and author of a PDF.', category: 'Edit & annotate', icon: FilePenLine, color: 'purple', label: 'Save metadata', multiple: false },
]

export type Tool = { id: string; name: string; description: string; short: string; category: string; icon: LucideIcon; color: string; label: string; multiple: boolean; popular?: boolean; accept?: string; noFile?: boolean; workspace?: boolean; notice?: string }

const pdf = '.pdf'
const images = '.png,.jpg,.jpeg,.jfif,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif,.svg'
const definitions: [string, string, string, string, string?, boolean?, boolean?, string?][] = [
  ['scan', 'Scan Document', 'Scan & workflow', 'Capture pages with your camera or import photos.', images, true, true],
  ['workflow', 'PDF Workflow Builder', 'Scan & workflow', 'Chain PDF operations without uploading again.', pdf, false, true],
  ['alternate', 'Alternate & Mix PDF', 'Organize', 'Interleave pages from multiple PDF files.', pdf, true],
  ['analyze', 'Why Is My PDF So Big?', 'Optimize', 'Inspect images, fonts, and document structure.'],
  ['split-text', 'Split PDF by Text', 'Organize', 'Start a new document when a phrase appears.'],
  ['split-bookmarks', 'Split PDF by Bookmarks', 'Organize', 'Export bookmarked chapters as separate files.'],
  ['split-half', 'Split PDF in Half', 'Organize', 'Split the document or slice scanned spreads.'],
  ['split-size', 'Split PDF by Size', 'Organize', 'Create parts below a chosen size limit.'],
  ['delete-pages', 'Delete PDF Pages', 'Organize', 'Remove selected pages from your document.'],
  ['extract-pages', 'Extract PDF Pages', 'Organize', 'Save only the pages you need.'],
  ['flip', 'Flip PDF', 'Organize', 'Mirror pages horizontally or vertically.'],
  ['nup', 'Multiple Pages Per Sheet', 'Organize', 'Fit several PDF pages on one sheet.'],
  ['crop', 'Crop & Resize', 'Organize', 'Crop margins or resize to A4 and Letter.'],
  ['zip', 'PDF to ZIP', 'Organize', 'Export page images or bundle original PDFs.', pdf, true],
  ['edit', 'Edit PDF & Add Signature', 'Edit & annotate', 'Place text and signatures on a page.', pdf, false, false, 'Adds overlays; does not rewrite existing PDF text.'],
  ['sign', 'Sign PDF', 'Edit & annotate', 'Draw, type or upload a signature.', '.pdf,.png,.jpg,.jpeg', true, false, 'Visual signatures, not certificate-backed digital signatures.'],
  ['pdf-handwriting', 'PDF to Handwriting', 'Edit & annotate', 'Restyle extracted text as handwritten notes.', pdf, false, false, 'Uses a handwriting-style font, not your personal handwriting.'],
  ['thumbmark', 'Thumbmark Maker', 'Edit & annotate', 'Remove a white background from a thumbprint image.', images, false, true],
  ['text-handwriting', 'Text to Handwriting', 'Edit & annotate', 'Create handwriting-style notes from text.', '.txt', false, true, 'Uses a handwriting-style font, not handwriting cloning.'],
  ['handwriting-pdf', 'Handwriting to PDF', 'Edit & annotate', 'Recognize handwriting and create searchable pages.', '.pdf,.png,.jpg,.jpeg', false, false, 'Downloads OCR resources; handwriting accuracy varies.'],
  ['fill-form', 'Fill PDF Form', 'Edit & annotate', 'Fill named form fields and flatten answers.'],
  ['redact', 'Redact PDF', 'Edit & annotate', 'Remove matching text through raster redaction.', pdf, false, false, 'Raster output discards original text and interactive elements. Review the result before sharing.'],
  ['bates', 'Bates Numbering', 'Edit & annotate', 'Stamp sequential IDs across multiple files.', pdf, true],
  ['headers', 'Headers & Footers', 'Edit & annotate', 'Add custom text and page-number placeholders.'],
  ['flatten', 'Flatten PDF', 'Edit & annotate', 'Render pages to remove forms and scripts.'],
  ['invert', 'Invert PDF Colours', 'Edit & annotate', 'Invert, grayscale, or sepia selected pages.'],
  ['word-pdf', 'Word to PDF', 'Convert to PDF', 'Convert DOCX to PDF with headings, tables and images.', '.docx', false, false, 'Keeps headings, text styles, lists, tables, images and links; columns, headers/footers and exact fonts are approximated. Legacy .doc is not supported.'],
  ['txt-pdf', 'TXT to PDF', 'Convert to PDF', 'Turn plain text into selectable PDF pages.', '.txt', false, true],
  ['excel-pdf', 'Excel to PDF', 'Convert to PDF', 'Export spreadsheet cells into PDF tables.', '.xlsx,.csv', false, false, 'Table conversion, not an exact copy of spreadsheet formatting. Legacy .xls is not supported.'],
  ['pptx-pdf', 'PowerPoint to PDF', 'Convert to PDF', 'Extract presentation slide text into PDF pages.', '.pptx', false, false, 'Text-focused conversion; animations and original slide layouts are not preserved.'],
  ['html-pdf', 'HTML to PDF', 'Convert to PDF', 'Create a PDF from HTML with tables and links.', '.html,.htm', false, true, 'Scripts and remote content are not executed; CSS layout is not reproduced.'],
  ['create-pdf', 'Create PDF', 'Convert to PDF', 'Write a document and export it as PDF.', '.txt', false, true],
  ['markdown-pdf', 'Markdown to PDF', 'Convert to PDF', 'Convert Markdown text into PDF pages.', '.md,.markdown', false, true],
  ['resume', 'Resume Builder', 'Convert to PDF', 'Create a resume PDF from your details.', '.txt', false, true],
  ['csv-pdf', 'CSV ↔ PDF Converter', 'Convert', 'Create table PDFs or extract text rows to CSV.', '.csv,.pdf', false, true, 'PDF table extraction is best effort; verify column boundaries.'],
  ['audio-pdf', 'Audio to PDF', 'Convert to PDF', 'Transcribe audio on-device into a PDF.', 'audio/*', false, false, 'Downloads an on-device speech model. First use requires internet and can be slow.'],
  ['ebook-pdf', 'eBook to PDF', 'Convert to PDF', 'Convert EPUB, MOBI, AZW3, text, or HTML books to PDF.', '.epub,.mobi,.azw,.azw3,.prc,.txt,.html,.htm'],
  ['pdf-word', 'PDF to Word', 'Convert from PDF', 'Convert a PDF to an editable Word document.', pdf, false, false, 'Rebuilds headings, paragraphs, bullet lists and tables as editable Word content; images and exact layout are not reproduced. Scans need OCR first.'],
  ['pdf-jpg', 'PDF to JPG', 'Convert from PDF', 'Render PDF pages into JPEG images.'],
  ['pdf-tiff', 'PDF to TIFF', 'Convert from PDF', 'Export one multipage TIFF or a ZIP of page images.'],
  ['extract-images', 'Extract Images from PDF', 'Convert from PDF', 'Export embedded PDF image assets.'],
  ['pdf-excel', 'PDF to Excel', 'Convert from PDF', 'Turn PDF tables into an XLSX workbook with real columns and numbers.', pdf, false, false, 'Columns are rebuilt from text positions; numbers, currency and percentages become numeric cells. Needs selectable text; merged cells are not recreated.'],
  ['pdf-pptx', 'PDF to PowerPoint', 'Convert from PDF', 'Turn every PDF page into a widescreen slide, with the page text copied into speaker notes.', pdf, false, false, 'Slides contain page images; the text is in the speaker notes, not editable slide objects.'],
  ['pdf-html', 'PDF to HTML', 'Convert from PDF', 'Export PDF text as a standalone HTML document.'],
  ['pdf-audio', 'PDF to Audio', 'Convert from PDF', 'Listen aloud or download a WAV narration.', pdf, false, false, 'WAV export downloads an open speech model on first use. Playback voice privacy depends on your browser.'],
  ['pdf-epub', 'PDF to EPUB', 'Convert from PDF', 'Create a reflowable eBook from PDF text.'],
  ['encrypt', 'Encrypt PDF', 'Security & privacy', 'Protect your PDF with a password.'],
  ['remove-password', 'Remove Password', 'Security & privacy', 'Open with your password and save without it.', pdf, false, false, 'Lossless: text, forms and links are kept. Requires the opening password; never cracks passwords.'],
  ['unlock', 'Unlock PDF', 'Security & privacy', 'Create an unrestricted copy of a PDF you own.', pdf, false, false, 'Removes restrictions losslessly; text, forms and links are kept. Never cracks passwords.'],
  ['auto-redact', 'Auto-Redact PII', 'Security & privacy', 'Detect and raster-redact sensitive information.', pdf, false, false, 'Detection is not exhaustive. Review every page before sharing.'],
  ['redaction-check', 'Redaction Checker', 'Security & privacy', 'Inspect recoverable text for possible leaks.', pdf, false, false, 'A heuristic inspection, not a security certification.'],
  ['privacy-scan', 'Privacy Risk Scanner', 'Security & privacy', 'Find sensitive text and hidden metadata.', pdf, false, false, 'Pattern-based detection can miss sensitive information.'],
  ['fingerprint', 'Fingerprint & Checksums', 'Security & privacy', 'Checksums, traceable per-recipient fingerprints, and opt-in link-click tracking.', '*', true, false, 'Embedded IDs trace leaked copies. Optional link-click tracking uses the Paperwork server; plain opens are not reported by PDF viewers.'],
  ['chat', 'Chat with PDF (AI)', 'AI tools', 'Ask a local browser language model about a PDF.', pdf, false, false, 'Requires a supported browser with an on-device LanguageModel API; availability is checked before use.'],
  ['summarize', 'AI PDF Summarizer', 'AI tools', 'Summarize using a local browser language model.', pdf, false, false, 'Requires a supported on-device browser language model. No cloud fallback.'],
  ['ocr', 'Searchable PDF (OCR)', 'AI tools', 'Recognize scanned pages and add searchable text.', pdf, false, false, 'Downloads OCR resources on first use. Recognition is approximate.'],
  ['compare', 'Compare PDFs', 'AI tools', 'Highlight text and visual differences between two PDFs.', pdf, true],
  ['repair', 'Repair PDF', 'AI tools', 'Recover documents that the PDF parser can read.', pdf, false, false, 'Best effort; missing or irrecoverably damaged bytes cannot be recreated.'],
  ['invoice', 'GST Invoice Generator', 'Business', 'Build an invoice with itemized GST calculations.', undefined, false, true, 'Verify tax treatment and statutory requirements yourself; not tax advice.'],
  ['pos', 'POS Bill Generator', 'Business', 'Build a cart and export an itemized receipt.', undefined, false, true],
  ['gst-prep', 'GST Filing Prep', 'Business', 'Split compiled PDFs to a chosen upload limit.'],
  ['share', 'P2P File Share', 'Collaborate & share', 'Transfer files over a manually paired WebRTC link.', '*', true, true, 'Manual signaling required. Direct connectivity depends on your network; no relay service.'],
  ['whiteboard', 'Collab Whiteboard', 'Collaborate & share', 'Draw together over a manually paired WebRTC link.', undefined, false, true, 'Manual signaling required; peers need a reachable network connection.'],
]

const workspaceIds = new Set(['scan', 'workflow', 'thumbmark', 'compare', 'invoice', 'pos', 'gst-prep', 'share', 'whiteboard', 'edit'])
export const tools: Tool[] = [...coreTools, ...definitions.map(([id, name, category, short, accept, multiple, noFile, notice], index) => ({ id, name, category, short, description: short, accept: accept ?? pdf, multiple: multiple ?? false, noFile: noFile ?? false, notice, workspace: workspaceIds.has(id), icon: [FilePenLine, FileText, LayoutGrid, Images][index % 4], color: ['orange', 'blue', 'green', 'purple'][index % 4], label: name }))]
export const categories = ['All tools', ...new Set(tools.map(tool => tool.category))]

export function acceptsFile(tool: Tool, filename: string, mime = ''): boolean {
  const accepted = tool.accept ?? (tool.id === 'images' ? images : pdf)
  return accepted.split(',').some(value => {
    const pattern = value.trim().toLowerCase()
    return pattern === '*' || pattern.endsWith('/*') && mime.toLowerCase().startsWith(pattern.slice(0, -1)) || pattern.startsWith('.') && filename.toLowerCase().endsWith(pattern) || mime.toLowerCase() === pattern
  })
}
