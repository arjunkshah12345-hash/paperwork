# Paperwork

A free, MIT-licensed, local-first PDF toolkit. An independent open-source alternative inspired by [ihatepdf.cv](https://www.ihatepdf.cv/), not affiliated with it. No account or API key is required. Everything runs in the browser; the only server feature is optional link-click tracking for fingerprinted copies.

**75 tools:** editing and organization, Office/text/eBook conversion, OCR, password protection, browser AI, invoices, scanning, and peer collaboration. The catalog accounts for the reference site's 73 tool entries, plus Add Text and PNG export. **This is not exact feature parity:** see [FEATURES.md](FEATURES.md) for the complete inventory, approximations, and remaining gaps. In particular, checksum generation does not replace the reference's document-open tracking, and read-aloud does not export audio files.

## Run locally

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Build and verify a static release with:

```sh
npm test
npm run build
npm run preview
```

Host `dist/` on a static server. Relative asset paths and hash navigation support subpaths. Cloudflare Pages and GitHub Pages instructions are in [DEPLOYMENT.md](DEPLOYMENT.md). The included Pages workflow builds on pushes to `main` after GitHub Actions is enabled as the Pages source.

## Using the tools

Choose a card, select the supported input files, configure its options, and download the result. Camera, editing, invoice, workflow, AI, and collaboration tools have their own interactive panels. Page ranges are one-based: `3,1,2,5-7`; descending ranges and duplicate pages are supported where meaningful. Empty page selection means all pages. The input preview is not an output preview: inspect the downloaded result.

Conversions are deliberately explicit about fidelity. DOCX, XLSX, PPTX, HTML, and PDF text exports reflow content rather than reproducing complex layouts. Legacy binary Office files are unsupported. PDF-to-PowerPoint creates image slides. TIFF export creates one TIFF per page in a ZIP. Most PDF text creation uses Western Latin fonts; unsupported characters fail rather than silently disappearing.

## Privacy and prerequisites

Document processing runs in the browser. There are no application analytics or automatic document uploads. Fonts and PDF.js workers are bundled. OCR and audio transcription download third-party recognition resources after explicit consent; browser AI may download its on-device model after consent. These capabilities are not guaranteed offline on first use. The app does not send document content to those resource hosts.

Link-click tracking is off unless you turn it on for a fingerprinted copy. When on, the copy's fingerprint ID, a hash of your private key, and the list of web links found in the PDF are sent to the Paperwork server; recipients' clicks record time, country and browser family. Document content is never sent. Records expire after a year.

Peer sharing and collaborative whiteboards intentionally send data to the peer you pair with using manual WebRTC signaling. There is no hosted signaling or TURN relay, so some network pairs cannot connect. Camera use needs permission and a secure context. Read-aloud uses an installed local speech voice. Chat and summarization require a supported browser's on-device `LanguageModel` API; there is no cloud or fake-summary fallback.

Only recent file metadata (name, size, tool, timestamp), favorites, and theme preferences are stored in localStorage, not document bytes. Clear the recent-files view to remove its history. Model/browser caches are controlled by the respective runtime. For offline use, self-host and preload required code and recognition resources; keeping the initial page open alone does not preload every lazy tool.

## Safety and limitations

- Encryption uses real AES-256 protection and verifies password reopening. Password removal/unlock creates image-only copies using the supplied password; it does not crack passwords. These copies lose searchable text, forms, links, and signatures.
- Raster redaction rebuilds pages rather than covering original objects. Detection, OCR, and visual alignment can still miss content: review all pages. Privacy/redaction scans are heuristics, not certifications.
- Cropping and slicing preserve recoverable source content; never use them for redaction. Visual signatures are not certificate-backed digital signatures. Editing can invalidate existing signatures.
- Compression is lossless and never returns a larger file; it does not guarantee savings. Repair cannot recreate missing bytes. Handwriting recognition is experimental; English audio transcription uses Whisper tiny.en.
- Invoice math and receipt generation are utilities, not statutory compliance or tax advice. GST preparation splits files by size; it does not file returns or prepare portal schemas.
- Main uploads are limited to 100 MB per file and 50 files per operation. Browser memory, image sizes, model requirements, and peer-channel limits can impose lower practical limits.

## Source and contributing

`public/paperwork-source.zip` is generated before development and production builds. It includes application code, tests, the dependency lockfile, build scripts, documentation, and MIT license, excluding dependencies and generated output. Run `npm ci` after extracting it.

Core PDF operations live in `src/lib/pdf.ts`; advanced operations, conversions, intelligence, and business helpers have separate modules and tests. Routing is in `src/lib/process.ts`, the catalog in `src/tools.ts`, and interactive panels in `src/components/`. Read [CONTRIBUTING.md](CONTRIBUTING.md). Run tests and build before contributing. Dependency and downloaded-model licenses remain with their respective authors.
