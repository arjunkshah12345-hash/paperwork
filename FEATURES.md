# Feature coverage

Audit baseline: ihatepdf.cv catalog, November 1, 2026. Independent implementation, not affiliated with the reference. **Catalog coverage is not full behavioral parity.** Matching cards do not establish equivalent behavior.

Local = browser processing. Partial = meaningful implementation with differences. Conditional = requires browser capabilities, permissions or consented model downloads. Camera, recognition, AI and two-peer collaboration require environment-specific verification.

| Reference feature | Coverage | Implementation / limits |
| --- | --- | --- |
| Scan document | Conditional | Camera/photo import; automatic paper detection, crop and perspective correction (light paper on darker surface), optional document filter. Low-contrast backgrounds fall back to the original photo. |
| Workflow builder | Local | Shared steps plus up to 12 named branches (one output each, ZIP download); saved on-device library with JSON export/import. Form-based builder, not a drag-and-drop node canvas. |
| Merge | Local | Selected file order. |
| Alternate & mix | Local | Interleave source pages. |
| Compress | Local | Target size (e.g. 1 MB, 200 KB: lossless first, then the gentlest image setting that fits, with an explanation if impossible), lossless mode, and Balanced/Strong/Extreme presets that downsample and JPEG re-encode RGB/grayscale images; masked, CMYK and indexed images are kept. Never returns a larger file. |
| Size analysis | Partial | Object/image/font inspection, not exact compressed-byte attribution. |
| Split | Local | Individual pages or ranges, ZIP output. |
| Split by text | Local | Split before matching pages; selectable text only. |
| Split by bookmarks | Partial | Supported bookmark destinations; malformed destinations may fail. |
| Split in half | Local | Document halves or page slices. |
| Split by size | Local | Page boundaries; oversized single pages can exceed the target. |
| Delete pages | Local | One-based selections. |
| Extract pages | Local | Selected order and duplicates preserved. |
| Organize | Local | Drag-and-drop page thumbnails (keyboard arrows too) to reorder, duplicate or delete; synced with the typed page order. Up to 500 pages. |
| Rotate | Local | Quarter turns on selected pages. |
| Flip | Local | Horizontal/vertical mirroring. |
| N-up | Partial | Columns and computed rows; not every printing preset. |
| Crop | Partial | Dimensions/margins; cropped content may remain recoverable. |
| PDF to ZIP | Local | Page PNG/JPEG images or original-file bundle. |
| Edit PDF | Partial | Click existing text to replace or delete it, including text inside form XObjects (elements reused on other pages, such as letterheads, are copied so only the current page changes): original glyphs are removed from the content stream (not covered) and following text keeps its position; replacement uses the closest standard font. Click placed images to delete them or replace them with a PNG/JPEG fitted to the same box. Plus text/ink/signature overlays. Not editable: scans (OCR first), inline images, non-Latin replacement text; replacing rotated images. |
| Sign | Local | Draw (pad), type or upload a signature; bottom left/centre/right placement on chosen pages. Visual mark, not a certificate-based digital signature. |
| PDF to handwriting | Partial | Extracted text reflowed in handwriting font. |
| Thumbmark | Partial | Drawn visual mark; no biometric verification. |
| Text to handwriting | Local | Handwriting-style PDF, subject to font coverage. |
| Handwriting to PDF | Conditional | Experimental OCR from images; accuracy varies. |
| Fill forms | Partial | Supported AcroForm fields via JSON; no XFA editor. |
| Redact | Partial | Raster rebuild with text/rectangle/page masks; manually inspect every page. |
| Watermark | Local | Text and/or PNG/JPEG image watermark with selectable opacity. |
| Page numbers | Local | Page number labels. |
| Bates numbering | Local | Prefix and starting number. |
| Headers & footers | Partial | Header/footer/both placement; limited typography. |
| Flatten | Partial | Raster pages lose selectable text, links and fields. |
| Invert colours | Local | Invert, sepia and grayscale via raster rebuild. |
| Word to PDF | Partial | Keeps headings, bold/italic, lists, tables, images and links; columns, headers/footers and exact fonts are approximated. No legacy DOC. |
| Images to PDF | Local | JPG/PNG embedded as-is; TIFF (every page) and BMP decoded losslessly; WebP, GIF (first frame), AVIF and SVG (2x) decoded by the browser; HEIC uses the browser's decoder when it has one (Safari) and otherwise libheif (WebAssembly, LGPL-3.0, about 2 MB, loaded only for HEIC files). Transparency kept via soft masks. |
| Text to PDF | Local | Uploaded/typed text; Western Latin default font. |
| Excel to PDF | Partial | XLSX cells reflow; no XLS or Excel print-layout fidelity. |
| PowerPoint to PDF | Partial | PPTX text reflow, not faithful slide rendering. |
| HTML to PDF | Partial | Safe structured layout (headings, lists, tables, links, data: images); no CSS, scripts or remote resources. |
| Create PDF | Local | Typed content and basic formatting. |
| Markdown to PDF | Partial | Text-focused conversion; complex media/styles not preserved. |
| Resume | Partial | Basic content-to-PDF layout, not full template editor. |
| CSV to PDF | Local | Parsed rows rendered to PDF. |
| Audio to PDF | Conditional | Whisper tiny.en, English only; model download after consent. |
| eBook to PDF | Partial | EPUB, MOBI, AZW, AZW3 (KF8), PRC, TXT and HTML; text and structure, not images or Kindle layout. DRM-protected and HUFF/CDIC-compressed Kindle books are refused. |
| PDF to Word | Partial | Rebuilds headings (by font size), joined paragraphs, bold lines, bullet lists and aligned tables (real Word tables); not a facsimile of page layout or images. |
| PDF to JPG | Local | Raster page images. |
| PDF to TIFF | Local | Multipage RGBA TIFF, preserving selected order and duplicates; optional per-page ZIP. Uncompressed, 16 MP/page, 256 MiB/multipage file. DPI selectable from 72–600; large pages may render below the requested DPI. |
| Metadata | Partial | Title/author editing; not comprehensive hidden-data scrubbing. |
| Extract images | Partial | Supported embedded images; not every codec/object arrangement. |
| PDF to Excel | Local | Columns rebuilt from text positions; numbers, currency and percentages become numeric cells; one sheet per page. No merged cells or OCR. |
| PDF to PowerPoint | Partial | Sharp raster image per slide with the page text in speaker notes; slide objects are not editable. |
| PDF to text | Local | Selectable text only; no implicit OCR. |
| PDF to HTML | Partial | Standalone text HTML, not visual-layout preservation. |
| PDF to audio | Conditional | Local-voice playback, plus downloadable WAV via SpeechT5 (MIT) after consented ~150 MB model download. English only, 60k characters. |
| PDF to EPUB | Partial | Reflowable extracted text, not original layout/images. |
| Encrypt | Local | Genuine AES-256, authenticated reopen verification. |
| Remove password | Local | Lossless decryption with the password; text, links, forms and bookmarks kept. |
| Unlock | Local | Lossless removal of permission restrictions (and password when supplied); never cracks. |
| Auto-redact PII | Conditional | OCR/pattern/custom-term masks; false negatives/positives remain possible. |
| Redaction checker | Partial | Text/structure inspection; cannot certify image pixels contain no secrets. |
| Privacy scanner | Partial | Heuristic inspection, not forensic certification. |
| Fingerprint / open tracking | Partial | Checksums; per-recipient embedded ID (metadata + invisible page text) with ledger, and leak detection. Opt-in link-click tracking: existing web links plus a “Verify this copy” link are routed through the Paperwork server (Cloudflare Pages Functions + KV), which logs time, country and browser family per click and redirects only to the registered URLs; the ledger's key reads the clicks back. **Plain opens are not reported**, because PDF viewers do not load remote content on open. |
| Chat with PDF | Conditional | Browser LanguageModel API; no cloud fallback. |
| Summarize | Conditional | Same browser AI requirement; hallucinations remain possible. |
| Searchable OCR | Conditional | Tesseract download after consent; unsupported font characters rejected. |
| Compare | Local | Automatic word-level text diff and pixel-level visual diff per page, overlay images and HTML report. Pages matched by position. |
| Repair | Partial | Parse/reserialize readable files, not arbitrary corruption recovery. |
| Invoice | Partial | Local items/totals/PDF; no accounting or tax certification. |
| POS | Partial | Local products and receipts; no payments/inventory backend/full reporting. |
| GST portal prep | Partial | Size preparation, not portal integration/compliance validation. |
| Share | Conditional | Manual WebRTC pairing; no hosted signaling/TURN or delivery guarantee. |
| Whiteboard | Conditional | Local drawing and peer strokes, not hosted collaboration. |

Additional tools include Add Text, PNG export and conversion subformats. Catalog size is not evidence of parity.

## Shared limitations

- Editing generally invalidates existing digital signatures. Raster rebuilding removes original objects, but missed secrets remain visible in the image.
- Ordinary extraction does not run OCR. Fonts, reading order and complex-script layout vary. Text-first imports are not Office rendering engines.
- No automatic document uploads. Recognition/AI resources may need network access after consent; peer sharing explicitly transmits content.
- Lazy tools and models must be available before offline use. Opening the home page alone is not an offline installation.
- The main uploader caps files at 100 MB and batches at 50. Browser memory can impose lower practical limits.

## Remaining parity work

Office/HTML layout fidelity; HUFF/CDIC and DRM Kindle books; true open-event tracking (not possible without viewer cooperation); richer visual controls and business/reporting features. These are not finished just because a related card exists.

## SEO / answer engines

`npm run build` runs `scripts/seo.mjs`, which writes 86 static, crawlable landing pages (one per tool plus high-intent queries such as `/pdf-to-png/`, `/jpg-to-pdf/`, `/pdf-converter/`), each with unique title/description, canonical URL, Open Graph image, and JSON-LD (WebApplication, HowTo, FAQPage, BreadcrumbList). It also writes `sitemap.xml`, `robots.txt` (search and AI crawlers allowed), `llms.txt`, `llms-full.txt` and a web manifest. The production origin defaults to `https://pdfeditor.tech` (override with `SITE_URL`). Pages open the matching tool directly. It also writes `/guides/` with 10 article pages: the six guide URLs already indexed on pdfeditor.tech are kept (rewritten to describe this app's controls) plus four new ones. Legacy `/edit-pdf-text` and `/merge-pdfs` 301 to `/edit-pdf/` and `/merge-pdf/` via Cloudflare `_redirects`, with noindex refresh stubs for other hosts.

## Verification snapshot

November 5, 2026: 238 tests pass serially; build passes. Clicked through in a real browser: Edit PDF (selected a text run, replaced “500” with “450”, deleted an image; the saved file's extracted text contained only the new value and the page painted no image), Organize thumbnails (keyboard and drag reordering wrote the order field; output pages read THREE, TWO, ONE), and branching workflows (two-branch ZIP: shared rotation in both, watermark only in its branch). This pass found and fixed a bug where the editor never detected images because PDF.js had taken ownership of the shared file buffer.

November 4, 2026 (second pass): 235 tests pass serially; build passes. Existing-text editing verified by PDF.js extraction (old text gone, neighbours intact, replacement extractable, following-run positions preserved). Landing pages verified in a browser: `/pdf-to-png/` boots the PDF-to-images tool with no failed asset requests and valid JSON-LD. The editor's click-to-edit UI, thumbnail drag and branch UI were typechecked and unit-tested but not clicked through in a browser.

On November 4, 2026, all 227 automated tests passed serially and the production build passed. In a real browser, Strong compression shrank a 1.16 MB photo PDF to 178 KB (image 3000×2000 → 1400×933, JPEG decodes), and scan detection found a synthetic tilted sheet's exact corners and warped it with clean paper borders. The WAV speech model download and Compare UI were not exercised in a browser in this pass.


On November 3, 2026, all 209 automated tests passed with file parallelism disabled, and the TypeScript/production build passed. The parallel run hit two existing conversion-test timeouts under contention; the serial run passed without changing their timeouts. Browser checks additionally exercised:

- Text redaction of both a normal `secret` and adjacent mixed-font `sec` + `ret` runs. Rendered mask interiors were black, and output had no selectable text. This fixture is not a general redaction certification.
- Invert, sepia and grayscale output by sampling rendered colour pixels.
- PNG/JPEG page ZIPs and original-PDF bundles by inspecting archive entries and file signatures.
- Upload, merge and download through the interface; the downloaded PDF reopened with the expected four pages.
- The generated source archive contains application tests, the dependency lockfile and MIT license.
- Multipage TIFF from real PDF.js browser rendering: three selected frames, including a duplicate and mixed page dimensions, independently decoded with UTIF. Every pixel, page order, dimensions and 144 DPI tags matched the fixture. Automated tests also cover ZIP mode, pixel snapshots, validation and render-failure cleanup.

Camera capture, actual OCR/model inference, two-browser WebRTC transfers and mobile layout still require runtime verification. Large lazy-loaded dependency chunks produce a Vite size warning; the build succeeds.

November 6, 2026: 243 tests pass serially; build passes (104 SEO pages). Editing text or images inside an element reused on other pages now copies that element for the current page only (covers shared resource dictionaries and nested forms). Images to PDF accepts WebP, GIF, BMP, TIFF (multipage), AVIF, SVG and HEIC; clicked through in a real browser with an opaque WebP, a semi-transparent WebP, a GIF and an SVG, producing one JPEG-encoded image, one image with a soft mask, and lossless GIF and 2x SVG images.

November 7, 2026: 246 tests pass serially; build passes (109 SEO pages, 0 broken internal links of 1,500). Lighthouse (mobile, local preview): performance 98–100, accessibility/best practices/SEO 100 on home, /pdf-to-png/ and a guide; entry JS cut from 922 KB to 284 KB by lazy-loading the PDF engine, stylesheet inlined, small text raised to 12px. Clicked through in a real browser: /compress-pdf-to-1mb/ preselected a 1 MB target and compressed a 3.9 MB photo PDF to 652 KB; a 200 KB target gave 96 KB. PDF to PNG at 300 DPI produced a single 2480×3509 PNG for one page and a ZIP for all pages; the transparent-background option was found broken (PDF.js fills white by default), fixed, and re-verified (paper alpha 0, photo alpha 255).


### Nov 7 (later)
- Sign: drawing pad and position option. Word/HTML to PDF: formatting-aware layout. PDF to Word: headings, paragraphs, bullets. Unlock/remove password: lossless; fixed the UI password field not reaching the unlock code. Deployed to paperwork-pdf-emx.pages.dev and submitted to IndexNow.
- Nov 11: PDF to Excel rebuilds columns and typed numeric cells; PDF to Word rebuilds tables. Hand-written SEO copy for Excel, rotate, watermark, page numbers, organize, PowerPoint and PNG pages.
