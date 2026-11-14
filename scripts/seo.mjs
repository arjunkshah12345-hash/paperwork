// Post-build SEO/AEO generator: one static, crawlable landing page per tool and per high-intent query,
// plus sitemap.xml, robots.txt, llms.txt, llms-full.txt and a web manifest. Run after `vite build`.
import { extras, sizeFaqs, sizePages, titles } from './content.mjs'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { guides, legacyRedirects } from './guides.mjs'

const site = (process.env.SITE_URL || 'https://pdfeditor.tech').replace(/\/+$/, '')
const brand = 'Paperwork'
const today = new Date().toISOString().slice(0, 10)
const repo = process.env.REPO_URL || ''

// ---- Tool catalog, parsed from the app so pages never drift from the product ----
const source = await readFile('src/tools.ts', 'utf8')
const catalog = new Map()
for (const m of source.matchAll(/\{ id: '([^']+)', name: '([^']+)'.*?short: '([^']+)', category: '([^']+)'/g)) catalog.set(m[1], { id: m[1], name: m[2], short: m[3], category: m[4] })
for (const m of source.matchAll(/^\s*\['([^']+)', '([^']+)', '([^']+)', '((?:[^'\\]|\\.)+)'/gm)) catalog.set(m[1], { id: m[1], name: m[2], short: m[4], category: m[3] })
if (catalog.size < 70) throw new Error(`SEO: parsed only ${catalog.size} tools from src/tools.ts`)

// ---- Keyword landing pages. `q` is the search phrase the page answers. ----
// Primary slug per tool first; aliases capture other phrasings of the same intent.
const pages = [
  ['pdf-to-png', 'pdf-images', 'PDF to PNG', 'Convert PDF pages to PNG images at 72–600 DPI, with an optional transparent background. One page downloads as a PNG; several as a ZIP.'],
  ['pdf-to-image', 'pdf-images', 'PDF to image', 'Turn PDF pages into PNG images you can paste into slides, chats and docs.'],
  ['pdf-to-jpg', 'pdf-jpg', 'PDF to JPG', 'Render PDF pages as JPEG images at the DPI you choose (72–600).'],
  ['pdf-to-jpeg', 'pdf-jpg', 'PDF to JPEG', 'Save each page of a PDF as a JPEG photo with adjustable resolution.'],
  ['pdf-to-tiff', 'pdf-tiff', 'PDF to TIFF', 'Export a true multipage TIFF, or a ZIP of single-page TIFFs, for archiving and fax.'],
  ['jpg-to-pdf', 'images', 'JPG to PDF', 'Combine JPG photos into one PDF, one image per page, in the order you choose.'],
  ['png-to-pdf', 'images', 'PNG to PDF', 'Turn PNG screenshots and graphics into a single PDF without losing quality.'],
  ['image-to-pdf', 'images', 'image to PDF', 'Convert JPG, PNG, WebP, HEIC, GIF, BMP, TIFF and SVG images into a PDF document in seconds.'],
  ['webp-to-pdf', 'images', 'WebP to PDF', 'Convert WebP images into a PDF, one image per page, without uploading them.'],
  ['heic-to-pdf', 'images', 'HEIC to PDF', 'Turn iPhone HEIC photos into a PDF in your browser (HEIC decoding needs Safari; other browsers can use JPEG exports).'],
  ['tiff-to-pdf', 'images', 'TIFF to PDF', 'Convert single and multipage TIFF scans into a PDF losslessly, one page per TIFF page.'],
  ['gif-to-pdf', 'images', 'GIF to PDF', 'Convert GIF images into a PDF (animated GIFs use the first frame).'],
  ['bmp-to-pdf', 'images', 'BMP to PDF', 'Convert BMP bitmaps into a PDF losslessly, with no upload.'],
  ['svg-to-pdf', 'images', 'SVG to PDF', 'Convert SVG graphics into a PDF page, rendered sharply at 2x resolution.'],
  ['avif-to-pdf', 'images', 'AVIF to PDF', 'Convert AVIF images into a PDF in browsers that support AVIF.'],
  ['merge-pdf', 'merge', 'merge PDF', 'Combine multiple PDF files into one document in the order you set.'],
  ['combine-pdf', 'merge', 'combine PDF files', 'Join several PDFs into a single file, then download it instantly.'],
  ['split-pdf', 'split', 'split PDF', 'Split a PDF into single pages or extract a page range.'],
  ['compress-pdf', 'compress', 'compress PDF', 'Reduce PDF file size losslessly, with image presets, or to an exact target such as 1 MB or 200 KB.'],
  ['reduce-pdf-size', 'compress', 'reduce PDF size', 'Shrink a PDF for email or upload limits by downsampling embedded images.'],
  ['pdf-to-word', 'pdf-word', 'PDF to Word', 'Convert a PDF into an editable Word (DOCX) document.'],
  ['word-to-pdf', 'word-pdf', 'Word to PDF', 'Convert a DOCX document into a PDF.'],
  ['pdf-to-excel', 'pdf-excel', 'PDF to Excel', 'Extract rows and columns from a PDF into an XLSX spreadsheet.'],
  ['excel-to-pdf', 'excel-pdf', 'Excel to PDF', 'Turn XLSX spreadsheet cells into a clean PDF table.'],
  ['pdf-to-powerpoint', 'pdf-pptx', 'PDF to PowerPoint', 'Create a PPTX presentation with one slide per PDF page.'],
  ['powerpoint-to-pdf', 'pptx-pdf', 'PowerPoint to PDF', 'Convert PPTX slide text into PDF pages.'],
  ['pdf-to-text', 'extract-text', 'PDF to text', 'Extract all selectable text from a PDF into a TXT file.'],
  ['pdf-to-html', 'pdf-html', 'PDF to HTML', 'Export PDF text as a standalone HTML page.'],
  ['html-to-pdf', 'html-pdf', 'HTML to PDF', 'Create a PDF from HTML content.'],
  ['markdown-to-pdf', 'markdown-pdf', 'Markdown to PDF', 'Convert Markdown notes and READMEs into formatted PDF pages.'],
  ['txt-to-pdf', 'txt-pdf', 'TXT to PDF', 'Turn plain text files into selectable, searchable PDF pages.'],
  ['csv-to-pdf', 'csv-pdf', 'CSV to PDF', 'Render CSV rows as a printable PDF table, or extract PDF rows to CSV.'],
  ['epub-to-pdf', 'ebook-pdf', 'EPUB to PDF', 'Convert DRM-free EPUB, TXT or HTML books to PDF.'],
  ['pdf-to-epub', 'pdf-epub', 'PDF to EPUB', 'Create a reflowable eBook from a PDF for e-readers.'],
  ['pdf-to-audio', 'pdf-audio', 'PDF to audio', 'Listen to a PDF read aloud, or download the narration as a WAV file.'],
  ['audio-to-pdf', 'audio-pdf', 'audio to PDF', 'Transcribe a recording on your device and save the transcript as a PDF.'],
  ['edit-pdf', 'edit', 'edit PDF', 'Change existing PDF text, add new text, draw, and sign — in your browser.'],
  ['pdf-editor', 'edit', 'PDF editor', 'A free online PDF editor that edits existing text without uploading your file.'],
  ['sign-pdf', 'sign', 'sign PDF', 'Add a typed or drawn signature to a PDF.'],
  ['rotate-pdf', 'rotate', 'rotate PDF', 'Rotate PDF pages 90°, 180° or 270° and save the result.'],
  ['organize-pdf', 'organize', 'organize PDF pages', 'Drag thumbnails to reorder, duplicate or remove PDF pages.'],
  ['rearrange-pdf-pages', 'organize', 'rearrange PDF pages', 'Reorder pages by dragging thumbnails, then download the new PDF.'],
  ['delete-pdf-pages', 'delete-pages', 'delete PDF pages', 'Remove unwanted pages from a PDF.'],
  ['extract-pdf-pages', 'extract-pages', 'extract PDF pages', 'Save only selected pages as a new PDF.'],
  ['watermark-pdf', 'watermark', 'watermark PDF', 'Stamp a text or logo watermark on every page.'],
  ['add-page-numbers-to-pdf', 'numbers', 'add page numbers to PDF', 'Number every page of a PDF automatically.'],
  ['protect-pdf', 'encrypt', 'password protect PDF', 'Encrypt a PDF with an AES-256 password.'],
  ['remove-pdf-password', 'remove-password', 'remove PDF password', 'Save a copy of your PDF without its opening password (password required).'],
  ['unlock-pdf', 'unlock', 'unlock PDF', 'Create an unrestricted copy of a PDF you are authorized to use.'],
  ['redact-pdf', 'redact', 'redact PDF', 'Permanently black out text and areas in a PDF.'],
  ['ocr-pdf', 'ocr', 'OCR PDF', 'Make scanned PDFs searchable and selectable with on-device OCR.'],
  ['compare-pdf', 'compare', 'compare PDF', 'Highlight text and visual differences between two PDF versions.'],
  ['fill-pdf-form', 'fill-form', 'fill PDF form', 'Fill in PDF form fields and flatten the answers.'],
  ['flatten-pdf', 'flatten', 'flatten PDF', 'Flatten forms and annotations into plain page content.'],
  ['crop-pdf', 'crop', 'crop PDF', 'Crop PDF margins or resize pages to A4 or Letter.'],
  ['repair-pdf', 'repair', 'repair PDF', 'Rebuild a damaged PDF that can still be parsed.'],
  ['scan-to-pdf', 'scan', 'scan to PDF', 'Scan paper documents with your camera, auto-crop and straighten them, and save a PDF.'],
  ['chat-with-pdf', 'chat', 'chat with PDF', 'Ask questions about a PDF with an on-device AI model.'],
  ['summarize-pdf', 'summarize', 'summarize PDF', 'Get an AI summary of a PDF without uploading it.'],
  ['extract-images-from-pdf', 'extract-images', 'extract images from PDF', 'Save the original images embedded in a PDF.'],
  ['pdf-metadata-editor', 'metadata', 'edit PDF metadata', 'Change a PDF’s title and author.'],
  ['bates-numbering', 'bates', 'Bates numbering', 'Stamp sequential Bates IDs across legal documents.'],
  ['split-pdf-by-size', 'split-size', 'split PDF by size', 'Split a PDF into parts under an upload size limit.'],
  ['n-up-pdf', 'nup', 'multiple pages per sheet', 'Print 2, 4 or more PDF pages on one sheet.'],
  ['text-to-handwriting', 'text-handwriting', 'text to handwriting', 'Turn typed text into handwriting-style notes as a PDF.'],
  ['invoice-generator', 'invoice', 'GST invoice generator', 'Create an itemized GST invoice PDF for free.'],
]
const searchFor = new Map()
for (const [slug, target, label, lede] of sizePages) { pages.push([slug, 'compress', `compress PDF to ${label}`, lede]); searchFor.set(slug, { search: `?target=${target}`, label }) }
const covered = new Set(pages.map((page) => page[1]))
for (const tool of catalog.values()) if (!covered.has(tool.id)) pages.push([tool.id, tool.id, tool.name, tool.short])

const converterIds = ['pdf-images', 'pdf-jpg', 'pdf-tiff', 'pdf-word', 'pdf-excel', 'pdf-pptx', 'extract-text', 'pdf-html', 'pdf-epub', 'pdf-audio', 'images', 'word-pdf', 'excel-pdf', 'pptx-pdf', 'html-pdf', 'markdown-pdf', 'txt-pdf', 'csv-pdf', 'ebook-pdf', 'audio-pdf']

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const titleCase = (text) => text.replace(/(^|\s)([a-z])/g, (_, s, c) => s + c.toUpperCase()).replace(/\bPdf\b/g, 'PDF').replace(/\bTo\b/g, 'to')
const primarySlug = new Map()
for (const [slug, id] of pages) if (!primarySlug.has(id)) primarySlug.set(id, slug)
const urlFor = (slug) => `${site}/${slug}/`
const action = (q) => / to /i.test(q) ? `convert ${q.replace(/^(PDF|[A-Z]+)\b/, (m) => m)}` : /^(PDF|GST|Bates)/.test(q) ? `use ${q}` : q.toLowerCase().replace(/\bpdf\b/g, 'PDF')
const slugs = pages.map((page) => page[0]); if (new Set(slugs).size !== slugs.length) throw new Error('SEO: duplicate slugs')

function stepsFor(tool, q) {
  const fromPdf = /from pdf/i.test(tool.category) || /^pdf-/.test(tool.id)
  const noFile = ['create-pdf', 'resume', 'invoice', 'pos', 'whiteboard', 'text-handwriting'].includes(tool.id)
  return [
    noFile ? `Open the free ${q} tool on ${brand}.` : `Open ${brand} and choose your ${fromPdf || /pdf/i.test(tool.name) ? 'PDF' : 'file'} — drag it in or tap “Choose a file”.`,
    `Adjust the ${tool.name} settings if you need to (pages, quality, layout).`,
    `Click the action button. ${brand} processes the file locally in your browser — nothing is uploaded.`,
    'Download the result. No account, watermark or email required.',
  ]
}

function faqsFor(tool, q) {
  const Q = titleCase(q)
  const faqs = [
    [`How do I ${action(q)} for free?`, `Open ${brand}'s ${tool.name} tool, add your file, and download the result. It is 100% free, needs no sign-up, and adds no watermark.`],
    [`Is ${brand}'s ${Q} tool safe for confidential documents?`, `Yes. Files are processed on your own device in the browser with open-source code; they are never uploaded to a server. You can even disconnect from the internet after the page loads for most tools.`],
    [`Does ${Q} work on Mac, Windows, iPhone, Android and Linux?`, `Yes. It runs in any modern browser — Chrome, Edge, Safari or Firefox — on desktop and mobile, with nothing to install.`],
    [`Is there a file size or daily limit?`, `There are no daily limits or paywalls. Files up to 100 MB (50 per batch) are supported; very large files are limited only by your device's memory.`],
    [`Is ${brand} open source?`, `Yes. ${brand} is MIT-licensed open source, so anyone can audit exactly what happens to their files or self-host it.`],
  ]
  const notice = source.match(new RegExp(`\\['${tool.id}',[^\\n]*?'([^']*)'\\],?\\n`))?.[1]
  if (notice && notice.length > 20 && notice !== tool.short) faqs.push([`Are there any limitations?`, notice])
  return faqs
}

function related(tool) {
  const same = [...catalog.values()].filter((other) => other.id !== tool.id && other.category === tool.category).slice(0, 8)
  return same.map((other) => `<li><a href="../${primarySlug.get(other.id) ?? other.id}/">${escape(other.name)}</a></li>`).join('')
}

const shell = await readFile('dist/index.html', 'utf8')
const relocate = (html, up) => html.replace(/(href|src)="\.\//g, `$1="${up}`)
// Inline the (small) stylesheet so it no longer blocks first paint; font URLs are rebased per page depth.
const cssLink = shell.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/)
const css = cssLink ? (await readFile(`dist/${cssLink[1]}`, 'utf8')).replace(/<\/style/gi, '<\\/style') : ''
const inlineCss = (html, up) => cssLink ? html.replace(cssLink[0], () => `<style>${css.replace(/url\(\.\//g, `url(${up}assets/`)}</style>`) : html

function render({ slug, title, description, h1, lede, body, schema, tool, search = '', app = true, crumbs, type = 'website' }) {
  const canonical = slug ? urlFor(slug) : `${site}/`
  const up = slug ? '../'.repeat(slug.split('/').length) : './'
  const trail = crumbs ?? (slug ? [['All PDF tools', 'tools/']] : [])
  const head = `
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
    <meta property="og:type" content="${type}" /><meta property="og:site_name" content="${brand}" />
    <meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" />
    <meta property="og:url" content="${canonical}" /><meta property="og:image" content="${site}/og.png" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(title)}" /><meta name="twitter:description" content="${escape(description)}" />
    <link rel="manifest" href="${up}manifest.webmanifest" />
    <link rel="alternate" type="text/plain" title="LLM summary" href="${site}/llms.txt" />
    <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
    ${tool ? `<script>if(!location.hash)history.replaceState(null,'',location.pathname+(location.search||'${search}')+'#${tool}')</script>` : ''}`
  let html = (app ? shell : shell.replace(/<script type="module"[\s\S]*?<\/script>/g, '').replace(/<link rel="modulepreload"[^>]*>/g, '')).replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '').replace('</head>', `${head}\n  </head>`)
  html = html.replace('<div id="root"></div>', `<div id="root"><main class="seo-static" style="max-width:860px;margin:0 auto;padding:48px 20px;font:16px/1.65 system-ui,sans-serif;color:#242923"><nav aria-label="Breadcrumb"><a href="${up}">${brand}</a>${trail.map(([label, path]) => ` › <a href="${up}${path}">${escape(label)}</a>`).join('')}${slug ? ` › ${escape(h1)}` : ''}</nav><h1>${escape(h1)}</h1><p><strong>${escape(lede)}</strong></p>${body}</main></div>`)
  html = inlineCss(html, up)
  return slug ? relocate(html, up) : html
}

const organization = { '@type': 'Organization', '@id': `${site}/#org`, name: brand, url: `${site}/`, logo: `${site}/favicon.svg`, ...(repo ? { sameAs: [repo] } : {}) }
const written = []
// Search-engine ownership tokens are public by design. Override with GOOGLE_SITE_VERIFICATION when deploying elsewhere.
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION ?? 'pX36vQxoGEXpKgSXcOTGUOgTNQJHj4mQx1CoGHUyBJw'
const verificationMeta = googleVerification ? `<meta name="google-site-verification" content="${googleVerification}" />` : ''
async function emit(slug, html, priority) {
  html = html.replace('<head>', `<head>${verificationMeta}`)
  if (slug) { await mkdir(`dist/${slug}`, { recursive: true }); await writeFile(`dist/${slug}/index.html`, html) } else await writeFile('dist/index.html', html)
  written.push({ loc: slug ? urlFor(slug) : `${site}/`, priority })
}

const llmsSections = []
for (const [slug, id, q, lede] of pages) {
  const tool = catalog.get(id)
  if (!tool) throw new Error(`SEO: unknown tool ${id} for /${slug}/`)
  const Q = titleCase(q)
  const size = searchFor.get(slug)
  const extra = extras[slug] ?? { sections: [], faqs: [] }
  const title = titles[slug] ?? (size ? `Compress PDF to ${size.label} (or Less) — Free, No Upload` : `${Q} — Free, Private, No Upload | ${brand}`)
  const description = `${lede} Free online ${q} tool that runs in your browser: no uploads, no sign-up, no watermark. Open source.`.slice(0, 300)
  const steps = stepsFor(tool, q)
  const faqs = [...(size ? sizeFaqs(size.label) : []), ...extra.faqs, ...faqsFor(tool, q)]
  const body = `
    <p>${escape(brand)} is a free, open-source PDF toolkit. The ${escape(Q)} tool works entirely on your device, so your documents stay private — they are never uploaded to a server.</p>
    <p><a href="../${size?.search ?? ''}#${id}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open ${escape(tool.name)} — free</a></p>
    <h2>How to ${escape(action(q))}</h2>
    <ol>${steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>
    ${extra.sections.map(([heading, text]) => `<h2>${escape(heading)}</h2><p>${escape(text)}</p>`).join('')}
    ${size ? `<p>Other sizes: ${sizePages.filter(([other]) => other !== slug).map(([other, , label]) => `<a href="../${other}/">compress PDF to ${escape(label)}</a>`).join(' · ')} · <a href="../compress-pdf/">all compression options</a></p>` : ''}
    <h2>Why use ${escape(brand)} for ${escape(Q)}</h2>
    <ul><li><strong>Private by design:</strong> processing happens in your browser; files never leave your device.</li><li><strong>Free forever:</strong> no limits, accounts, ads or watermarks.</li><li><strong>Fast:</strong> no upload or download wait — results are instant for most files.</li><li><strong>Open source:</strong> MIT-licensed code anyone can audit or self-host.</li><li><strong>Works everywhere:</strong> Windows, macOS, Linux, iOS and Android browsers.</li></ul>
    <h2>Frequently asked questions</h2>
    ${faqs.map(([question, answer]) => `<h3>${escape(question)}</h3><p>${escape(answer)}</p>`).join('')}
    ${guides.some((guide) => guide.tool === id) ? `<h2>Guides</h2><ul>${guides.filter((guide) => guide.tool === id).map((guide) => `<li><a href="../guides/${guide.slug}/">${escape(guide.title)}</a></li>`).join('')}</ul>` : ''}
    <h2>Related tools</h2><ul>${related(tool)}<li><a href="../tools/">See all ${catalog.size} free PDF tools</a></li></ul>`
  const schema = { '@context': 'https://schema.org', '@graph': [
    organization,
    { '@type': 'WebApplication', name: `${brand} ${tool.name}`, url: urlFor(slug), applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires JavaScript and a modern browser', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description, publisher: { '@id': `${site}/#org` }, featureList: ['No file uploads', 'No sign-up', 'No watermark', 'Open source (MIT)'] },
    { '@type': 'HowTo', name: `How to ${action(q)}`, totalTime: 'PT1M', tool: { '@type': 'HowToTool', name: `${brand} (web browser)` }, step: steps.map((text, index) => ({ '@type': 'HowToStep', position: index + 1, name: text.split(/[.—]/)[0], text })) },
    { '@type': 'FAQPage', mainEntity: faqs.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: brand, item: `${site}/` }, { '@type': 'ListItem', position: 2, name: 'PDF tools', item: urlFor('tools') }, { '@type': 'ListItem', position: 3, name: Q, item: urlFor(slug) }] },
  ] }
  await emit(slug, render({ slug, title, description, h1: `${Q} — free, private, in your browser`, lede, body, schema, tool: id, search: size?.search }), primarySlug.get(id) === slug ? 0.9 : 0.7)
  llmsSections.push({ slug, Q, tool, lede, steps, faqs })
}

// ---- Hubs: all tools, and "PDF converter" (very high-volume generic query) ----
const byCategory = new Map()
for (const tool of catalog.values()) { if (!byCategory.has(tool.category)) byCategory.set(tool.category, []); byCategory.get(tool.category).push(tool) }
const toolList = [...byCategory].map(([category, list]) => `<h2>${escape(category)}</h2><ul>${list.map((tool) => `<li><a href="../${primarySlug.get(tool.id)}/">${escape(tool.name)}</a> — ${escape(tool.short)}</li>`).join('')}</ul>`).join('')
const itemList = (ids) => ({ '@type': 'ItemList', itemListElement: ids.map((id, index) => ({ '@type': 'ListItem', position: index + 1, name: catalog.get(id).name, url: urlFor(primarySlug.get(id)) })) })
await emit('tools', render({ slug: 'tools', title: `All ${catalog.size} Free PDF Tools — No Upload, No Sign-up | ${brand}`, description: `Every free ${brand} PDF tool: convert, merge, split, compress, edit, sign, OCR, protect and more. Private, in-browser and open source.`, h1: `All ${catalog.size} free PDF tools`, lede: 'Convert, organize, edit, secure and analyze PDFs — every tool runs privately in your browser.', body: toolList, schema: { '@context': 'https://schema.org', '@graph': [organization, { '@type': 'CollectionPage', name: 'All PDF tools', url: urlFor('tools') }, itemList([...catalog.keys()])] } }), 0.9)
const converterFaqs = [['What is the best free PDF converter?', `${brand} is a free, open-source PDF converter that runs entirely in your browser. It converts PDF to PNG, JPG, TIFF, Word, Excel, PowerPoint, HTML, EPUB, text and audio — and JPG, PNG, Word, Excel, PowerPoint, HTML, Markdown, CSV and EPUB to PDF — without uploading your files.`], ['Is there a PDF converter that does not upload my files?', `Yes. ${brand} converts files locally on your device, so documents never reach a server.`], ['Can I convert PDF to PNG or JPG for free?', 'Yes. Use PDF to PNG or PDF to JPG; there are no limits or watermarks.']]
await emit('pdf-converter', render({ slug: 'pdf-converter', title: `Free PDF Converter — Convert to & from PDF, No Upload | ${brand}`, description: `Free online PDF converter: PDF to PNG, JPG, Word, Excel, PowerPoint, TIFF, text, HTML and EPUB, and back to PDF. Private, in-browser, no sign-up, no watermark.`, h1: 'Free PDF converter — every format, no upload', lede: `Convert to and from PDF in ${converterIds.length} formats, privately in your browser.`, body: `<ul>${converterIds.map((id) => `<li><a href="../${primarySlug.get(id)}/">${escape(catalog.get(id).name)}</a> — ${escape(catalog.get(id).short)}</li>`).join('')}</ul><h2>Frequently asked questions</h2>${converterFaqs.map(([q, a]) => `<h3>${escape(q)}</h3><p>${escape(a)}</p>`).join('')}`, schema: { '@context': 'https://schema.org', '@graph': [organization, { '@type': 'WebApplication', name: `${brand} PDF Converter`, url: urlFor('pdf-converter'), applicationCategory: 'BusinessApplication', operatingSystem: 'Any', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }, itemList(converterIds), { '@type': 'FAQPage', mainEntity: converterFaqs.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) }] } }), 0.95)

// ---- Guides: article pages (no app mount) at the URLs already indexed on pdfeditor.tech ----
const guideUrl = (guide) => urlFor(`guides/${guide.slug}`)
for (const guide of guides) {
  const tool = catalog.get(guide.tool)
  if (!tool) throw new Error(`SEO: guide ${guide.slug} links unknown tool ${guide.tool}`)
  const toolHref = `../../${primarySlug.get(tool.id)}/`
  const body = `
    <p><a href="${toolHref}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open ${escape(tool.name)} — free</a></p>
    <h2>Steps</h2><ol>${guide.steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>
    ${guide.sections.map(([heading, text]) => `<h2>${escape(heading)}</h2><p>${escape(text)}</p>`).join('')}
    <h2>Frequently asked questions</h2>${guide.faqs.map(([q, a]) => `<h3>${escape(q)}</h3><p>${escape(a)}</p>`).join('')}
    <h2>More guides</h2><ul>${guides.filter((other) => other !== guide).slice(0, 6).map((other) => `<li><a href="../${other.slug}/">${escape(other.title)}</a></li>`).join('')}<li><a href="../">All guides</a></li></ul>`
  const schema = { '@context': 'https://schema.org', '@graph': [
    organization,
    { '@type': 'Article', headline: guide.title, description: guide.description, url: guideUrl(guide), mainEntityOfPage: guideUrl(guide), author: { '@id': `${site}/#org` }, publisher: { '@id': `${site}/#org` }, dateModified: today, image: `${site}/og.png` },
    { '@type': 'HowTo', name: guide.title, step: guide.steps.map((text, index) => ({ '@type': 'HowToStep', position: index + 1, text })) },
    { '@type': 'FAQPage', mainEntity: guide.faqs.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: brand, item: `${site}/` }, { '@type': 'ListItem', position: 2, name: 'Guides', item: urlFor('guides') }, { '@type': 'ListItem', position: 3, name: guide.title, item: guideUrl(guide) }] },
  ] }
  await emit(`guides/${guide.slug}`, render({ slug: `guides/${guide.slug}`, title: `${guide.title} | ${brand}`, description: guide.description, h1: guide.title, lede: guide.answer, body, schema, app: false, crumbs: [['Guides', 'guides/']], type: 'article' }), 0.8)
}
await emit('guides', render({ slug: 'guides', title: `PDF guides: edit, compress, merge, sign and convert | ${brand}`, description: 'Practical PDF guides with clear steps and honest limits: edit text, compress for email, merge, sign, organize pages and convert — all without uploading.', h1: 'Practical PDF guides. Clear steps. Honest limits.', lede: 'Step-by-step help for everyday PDF jobs, with the checks and limitations that are easy to miss.', body: `<ul>${guides.map((guide) => `<li><a href="../guides/${guide.slug}/">${escape(guide.title)}</a> — ${escape(guide.description)}</li>`).join('')}</ul><p><a href="../tools/">All ${catalog.size} PDF tools</a></p>`, schema: { '@context': 'https://schema.org', '@graph': [organization, { '@type': 'CollectionPage', name: 'PDF guides', url: urlFor('guides') }, { '@type': 'ItemList', itemListElement: guides.map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: guideUrl(guide) })) }] }, app: false, crumbs: [] }), 0.8)

// ---- Legacy URLs: 301 on Cloudflare (_redirects); refresh stubs for hosts without redirect support ----
await writeFile('dist/_redirects', `${legacyRedirects.flatMap(([from, to]) => [`${from} ${to} 301`, `${from}/ ${to} 301`]).join('\n')}\n`)
for (const [from, to] of legacyRedirects) {
  await mkdir(`dist${from}`, { recursive: true })
  await writeFile(`dist${from}/index.html`, `<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="${site}${to}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=..${to}"><a href="..${to}">This page moved to ${site}${to}</a>`)
}

// ---- Home page: keep the app, add crawlable copy + structured data ----
const homeTitle = `${brand} — Free PDF Tools & PDF Converter. Private, No Upload, Open Source`
const homeDescription = `Free, open-source PDF toolkit: convert PDF to PNG, JPG, Word and Excel, merge, split, compress, edit, sign, OCR and protect PDFs — ${catalog.size} tools that run in your browser. No uploads, no sign-up, no watermark.`
const home = render({ slug: '', title: homeTitle, description: homeDescription, h1: 'Free PDF tools that never upload your files', lede: homeDescription, body: `<p><a href="./tools/">Browse all ${catalog.size} tools</a> · <a href="./pdf-converter/">PDF converter</a> · <a href="./guides/">PDF guides</a></p>${toolList.replace(/href="\.\.\//g, 'href="./')}`, schema: { '@context': 'https://schema.org', '@graph': [organization, { '@type': 'WebSite', '@id': `${site}/#website`, name: brand, url: `${site}/`, publisher: { '@id': `${site}/#org` } }, { '@type': 'WebApplication', name: brand, url: `${site}/`, applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: homeDescription, license: 'https://opensource.org/licenses/MIT', ...(repo ? { codeRepository: repo } : {}) }] } })
await emit('', home, 1.0)

// ---- Crawler & answer-engine files ----
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written.sort((a, b) => b.priority - a.priority).map(({ loc, priority }) => `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${priority.toFixed(1)}</priority></url>`).join('\n')}\n</urlset>\n`)
const bots = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'DuckDuckBot', 'YandexBot', 'CCBot', 'Amazonbot', 'meta-externalagent']
await writeFile('dist/robots.txt', `${bots.map((bot) => `User-agent: ${bot}\nAllow: /`).join('\n\n')}\n\nUser-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
const llms = `# ${brand}\n\n> ${homeDescription}\n\nAll processing happens locally in the user's browser; files are never uploaded. Free, no account, no watermark, MIT-licensed open source${repo ? ` (${repo})` : ''}.\n\n## Hubs\n- [All PDF tools](${urlFor('tools')})\n- [PDF converter](${urlFor('pdf-converter')})\n- [PDF guides](${urlFor('guides')})\n\n## Guides\n${guides.map((guide) => `- [${guide.title}](${guideUrl(guide)}): ${guide.answer}`).join('\n')}\n\n## Tools\n${llmsSections.map(({ slug, Q, lede }) => `- [${Q}](${urlFor(slug)}): ${lede}`).join('\n')}\n\n## Optional\n- [Full tool reference for LLMs](${site}/llms-full.txt)\n${repo ? `- [Source code](${repo})\n` : ''}`
await writeFile('dist/llms.txt', llms)
await writeFile('dist/llms-full.txt', `# ${brand} — full tool reference\n\n${homeDescription}\n\n${llmsSections.map(({ slug, Q, tool, lede, steps, faqs }) => `## ${Q}\n\nURL: ${urlFor(slug)}\nTool: ${tool.name} (${tool.category})\n\n${lede}\n\n### Steps\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n### FAQ\n${faqs.map(([q, a]) => `- **${q}** ${a}`).join('\n')}`).join('\n\n')}\n`)
await writeFile('dist/manifest.webmanifest', JSON.stringify({ name: `${brand} — Free PDF Tools`, short_name: brand, start_url: './', display: 'standalone', background_color: '#f7f7f2', theme_color: '#f7f7f2', icons: [{ src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2))
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f7f7f2"/><text x="80" y="260" font-family="Georgia,serif" font-size="96" fill="#242923">${brand}</text><text x="80" y="360" font-family="system-ui,sans-serif" font-size="44" fill="#2563eb">Free PDF tools. No uploads.</text><text x="80" y="430" font-family="system-ui,sans-serif" font-size="32" fill="#566151">${catalog.size} tools · private · open source</text></svg>`
await writeFile('dist/og.svg', ogSvg)
try { const { default: sharp } = await import('sharp'); await sharp(Buffer.from(ogSvg)).png().toFile('dist/og.png') } catch { console.warn('SEO: sharp unavailable; og.png not generated') }
// The ONNX runtime WASM is loaded from jsDelivr (src/lib/transformers.ts); drop files over the Pages 25 MiB limit.
for (const file of await readdir('dist/assets')) if (/^ort-wasm.*\.wasm$/.test(file) && (await stat(`dist/assets/${file}`)).size > 25 * 1024 * 1024) await unlink(`dist/assets/${file}`)
console.log(`SEO: ${written.length} pages, sitemap, robots.txt, llms.txt for ${site}`)
