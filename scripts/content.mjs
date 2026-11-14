// Hand-written, query-specific copy for the highest-volume landing pages.
// Every claim here must match what the app actually does; keep it in sync with src/.

/** Pages that open the tool with settings preselected via a query string (canonical stays the clean URL). */
export const sizePages = [
  ['compress-pdf-to-1mb', '1mb', '1 MB', 'Compress a PDF to under 1 MB for upload portals, job applications and government forms.'],
  ['compress-pdf-to-500kb', '500kb', '500 KB', 'Shrink a PDF to under 500 KB while keeping text sharp.'],
  ['compress-pdf-to-200kb', '200kb', '200 KB', 'Compress a PDF to under 200 KB for strict upload limits.'],
  ['compress-pdf-to-100kb', '100kb', '100 KB', 'Get a PDF under 100 KB: the gentlest compression that fits is chosen automatically.'],
  ['compress-pdf-for-email', '10mb', '10 MB', 'Make a PDF small enough to attach to an email (Gmail and Outlook allow 20–25 MB; many company servers allow only 10 MB).'],
]

/** Benefit-led titles (Google shows ~60 characters). */
export const titles = {
  'pdf-to-png': 'PDF to PNG Converter — 300 DPI, Transparent, No Upload',
  'pdf-to-jpg': 'PDF to JPG — Convert Pages at Up to 600 DPI, Free',
  'compress-pdf': 'Compress PDF to Any Size (1 MB, 200 KB) — Free, No Upload',
  'merge-pdf': 'Merge PDF Files — Combine PDFs in Any Order, Free',
  'jpg-to-pdf': 'JPG to PDF — Combine Photos into One PDF, Free',
  'image-to-pdf': 'Image to PDF — JPG, PNG, HEIC, WebP, TIFF to PDF Free',
  'edit-pdf': 'Edit PDF Text Online — Change Existing Words, Free',
  'heic-to-pdf': 'HEIC to PDF — Convert iPhone Photos to PDF, No Upload',
  'webp-to-pdf': 'WebP to PDF Converter — Free, Private, No Upload',
  'split-pdf': 'Split PDF — Extract Pages or Split into Files, Free',
  'pdf-to-word': 'PDF to Word (DOCX) — Editable Text & Tables, Free',
  'sign-pdf': 'Sign PDF Online — Draw or Type a Signature, Free',
  'word-to-pdf': 'Word to PDF — Keep Headings, Tables & Images, Free',
  'unlock-pdf': 'Unlock PDF — Remove Restrictions, Keep Text, Free',
  'remove-pdf-password': 'Remove PDF Password — Keep Text & Links, No Upload',
  'protect-pdf': 'Password Protect PDF — AES-256 Encryption, No Upload',
  'html-to-pdf': 'HTML to PDF Converter — Tables, Links, Images, Free',
  'ocr-pdf': 'OCR PDF — Make Scanned PDFs Searchable, Free & Private',
  'pdf-to-excel': 'PDF to Excel — Tables to XLSX with Real Numbers, Free',
  'rotate-pdf': 'Rotate PDF — Turn Pages 90° or 180° and Save, Free',
  'watermark-pdf': 'Watermark PDF — Add Text or Logo, Set Opacity, Free',
  'add-page-numbers-to-pdf': 'Add Page Numbers to PDF — Free, Instant, No Upload',
  'organize-pdf': 'Organize PDF Pages — Reorder, Duplicate, Remove, Free',
  'pdf-to-powerpoint': 'PDF to PowerPoint (PPTX) — One Slide per Page, Free',
  'png-to-pdf': 'PNG to PDF — Lossless, Keeps Transparency, Free',
}

/** Extra sections and FAQs: [heading, paragraph] pairs. */
export const extras = {
  'pdf-to-png': {
    sections: [
      ['Choose the resolution', 'Pick 72 DPI for on-screen use and the smallest files, 150 DPI for documents and slides, 300 DPI for print-quality images, or 600 DPI to zoom into fine detail such as drawings and small print. An A4 page at 300 DPI is about 2480 × 3508 pixels.'],
      ['Transparent background', 'Turn on “Transparent background” to export pages without the white paper fill — useful for logos, diagrams and signatures you want to place on another design. Leave it off for normal documents.'],
      ['Only the pages you need', 'Type a page range such as 1-3, 5 to export just those pages. A single page downloads straight away as a PNG; several pages download together in one ZIP, numbered in order.'],
      ['PNG or JPG?', 'PNG is lossless: text, line art and screenshots stay crisp, at the cost of larger files. JPG is smaller and suits photo-heavy pages. Use PDF to JPG when file size matters more than perfect edges.'],
    ],
    faqs: [
      ['What DPI should I use to convert a PDF to PNG?', '150 DPI is right for most screens and documents. Use 300 DPI for printing or OCR, and 600 DPI only when you need to zoom into fine detail, because file size grows with the square of the DPI.'],
      ['Can I convert just one page of a PDF to PNG?', 'Yes. Enter the page number in the Pages field and the page downloads directly as a single PNG file.'],
      ['Does converting PDF to PNG reduce quality?', 'Pages are rendered fresh from the PDF at the resolution you choose, so text and vector graphics are drawn sharply at that size. Choose a higher DPI if you need to enlarge the image later.'],
    ],
  },
  'compress-pdf': {
    sections: [
      ['Compress to an exact size', 'Choose “Target size” and enter the limit you need — for example 1 MB, 500 KB or 200 KB. Paperwork tries lossless optimization first and only then downsamples images, using the gentlest setting that fits, so the result looks as good as it can while staying under your limit. If the limit is impossible (for example a text-only PDF that is already compact), it tells you the smallest size it could reach.'],
      ['Compression levels', 'Lossless repackages the PDF without changing how anything looks. Balanced (about 150 DPI) is ideal for sharing and on-screen reading. Strong (about 100 DPI) suits email and upload portals. Extreme (about 72 DPI) gives the smallest files for previews. Text and vector graphics stay sharp at every level; only photos and scans are resampled.'],
      ['Why some PDFs barely shrink', 'Most of a large PDF’s size is usually photos or scanned pages, which compress well. PDFs that are mostly text, fonts and vector drawings are already compact, so there is little to remove without damaging them. Paperwork never returns a file larger than the original.'],
      ['Compress without uploading', 'Most online compressors upload your document to their servers. Paperwork compresses inside your browser, so contracts, IDs, payslips and medical records never leave your device.'],
    ],
    faqs: [
      ['How do I compress a PDF to under 1 MB?', 'Open Compress PDF, choose “Target size”, pick 1 MB and press Optimize PDF. The gentlest compression that fits under 1 MB is chosen automatically.'],
      ['Will compressing make my text blurry?', 'No. Text and vector graphics are kept as they are; only embedded photos and scans are downsampled.'],
      ['How do I compress a PDF for email?', 'Most email providers accept attachments of 20–25 MB, and many company mail servers only 10 MB. Choose Target size and enter 10 MB, or use the Strong level.'],
    ],
  },
  'merge-pdf': {
    sections: [
      ['Set the order', 'Add files in any order, then use the arrows to move each PDF up or down. The pages are combined in exactly the order shown.'],
      ['Merge more than PDFs', 'Need to add photos or scans? Convert them with Images to PDF first, then merge. To reorder, rotate or delete individual pages after merging, open Organize PDF.'],
    ],
    faqs: [['How many PDFs can I merge at once?', 'Up to 50 files per batch. Everything runs on your device, so very large merges are limited only by available memory.'], ['Is the original quality kept when merging?', 'Yes. Pages are copied as-is; nothing is re-compressed.']],
  },
  'image-to-pdf': {
    sections: [
      ['Every common image format', 'JPG and PNG are embedded exactly as they are. TIFF (every page of a multipage TIFF) and BMP are converted losslessly. WebP, GIF, AVIF, SVG and iPhone HEIC photos are decoded by your browser; HEIC needs a browser that can open it, such as Safari.'],
      ['Transparency and quality', 'Transparent PNG, WebP and TIFF images keep their transparency. Opaque WebP and AVIF photos are stored as high-quality JPEG to keep the PDF small, and SVG graphics are rendered at double resolution so they stay sharp.'],
    ],
    faqs: [['Can I convert iPhone HEIC photos to PDF?', 'Yes, in browsers that can decode HEIC such as Safari on Mac, iPhone and iPad. In other browsers, export the photos as JPEG first.']],
  },
  'edit-pdf': {
    sections: [
      ['Change existing text, not just cover it', 'Click any line of text and type the replacement. The original characters are removed from the page itself and the new text is set at the same position, size, colour and angle, so copying or searching the PDF finds only the new wording.'],
      ['Replace or delete images', 'Images on the page get a dashed outline. Click one to delete it or replace it with a PNG or JPEG fitted into the same box.'],
      ['Letterheads and repeated elements', 'Text inside an element repeated on every page, like a letterhead or footer, is changed on the current page only, and the other pages keep the original.'],
    ],
    faqs: [['Can I edit a scanned PDF?', 'Scanned pages are pictures of text. Run Searchable PDF (OCR) first, then edit or copy the recognised text.']],
  },
  'word-to-pdf': {
    sections: [
      ['Formatting that survives', 'Headings, bold and italic text, bulleted and numbered lists, tables, embedded pictures and clickable links are carried over from your DOCX file. Links stay clickable in the PDF.'],
      ['What is approximated', 'Paperwork lays the document out on A4 pages itself instead of using Microsoft Word, so multi-column layouts, headers and footers, text boxes and exact fonts are simplified. Pictures in old Windows formats (EMF/WMF) are skipped, and you are told how many.'],
      ['Private by design', 'The DOCX is read and converted inside your browser. Contracts, CVs and reports are never uploaded to a server.'],
    ],
    faqs: [['Can I convert .doc files?', 'Legacy .doc files are not supported. Open the file in Word, LibreOffice or Google Docs and save it as .docx first.'], ['Are tables kept when converting Word to PDF?', 'Yes. Tables are drawn with borders, header rows are bold, and long cell text wraps inside its column.']],
  },
  'pdf-to-word': {
    sections: [
      ['Editable structure, not a picture', 'Paperwork reads the text of each page and rebuilds it as real Word content: larger text becomes Heading 1–3, lines of the same paragraph are joined back together, bold lines stay bold and bullet points become a Word bulleted list. Each PDF page starts on a new page.'],
      ['Tables stay tables', 'Rows and columns that line up on the page are rebuilt as a real Word table with a bold header row, placed exactly where the table appeared between paragraphs — so you can edit cells instead of fighting tab stops.'],
      ['Scanned PDFs', 'A scan is a picture of text, so there is nothing to extract. Run Searchable PDF (OCR) first, then convert the result to Word.'],
      ['Choose pages', 'Enter a page range such as 1-3, 7 to convert only those pages, in the order you type them.'],
    ],
    faqs: [['Does PDF to Word keep the exact layout?', 'No. You get clean, editable paragraphs, headings, lists and tables that reflow in Word. Multi-column layouts, images and precise positioning are not reproduced.']],
  },
  'sign-pdf': {
    sections: [
      ['Draw, type or upload', 'Draw your signature with a mouse, finger or stylus, type your name to set it in a script-style italic, or add a PNG or JPEG image of your signature. A drawn signature is saved with a transparent background, so it sits cleanly on the page.'],
      ['Place it where it belongs', 'Choose the bottom right, centre or left of the page, set the margin, and pick which pages to sign, for example only the last page.'],
      ['What kind of signature is this?', 'It is a visible electronic signature mark, which many everyday agreements accept. It is not a certificate-based digital signature, so it does not cryptographically prove who signed.'],
    ],
    faqs: [['Can I sign a PDF on my phone?', 'Yes. Open the page on your phone and draw your signature with your finger; everything runs in the mobile browser.'], ['Is my signature uploaded?', 'No. The signature and the PDF stay on your device.']],
  },
  'unlock-pdf': {
    sections: [
      ['Remove restrictions without losing anything', 'If a PDF opens but blocks printing, copying or editing, Unlock PDF saves a copy without those restrictions. The text, links, form fields and bookmarks are kept exactly as they were; nothing is turned into an image.'],
      ['Password-protected files', 'If the PDF needs a password to open, enter it in “Current password”. Paperwork never guesses or cracks passwords.'],
    ],
    faqs: [['Is it legal to unlock a PDF?', 'Unlock only documents you own or are authorized to use, such as your own bank statements or files a colleague shared with you.']],
  },
  'remove-pdf-password': {
    sections: [
      ['Keep the PDF exactly as it is', 'Enter the password once and Paperwork saves a decrypted copy. Text stays selectable and searchable, links and form fields keep working, and the file is not re-rendered.'],
      ['Why remove a password?', 'Statements, payslips and tax documents are often sent with a password. Removing it makes them easier to archive, merge or upload to portals that reject encrypted PDFs.'],
    ],
    faqs: [['Can you remove a PDF password without knowing it?', 'No. You need the password to open the file. Paperwork does not crack passwords.']],
  },
  'protect-pdf': {
    sections: [
      ['AES-256 encryption', 'Your PDF is encrypted with AES-256, the strongest standard PDF encryption. Before you download it, Paperwork re-opens the encrypted file to verify that it is locked and that your password opens it.'],
      ['Choose a strong password', 'Encryption is only as strong as the password. Use a long passphrase, and share it through a different channel than the file itself.'],
    ],
    faqs: [['Is my password sent anywhere?', 'No. Encryption happens in your browser; neither the PDF nor the password is uploaded.']],
  },
  'html-to-pdf': {
    sections: [
      ['What is kept', 'Headings, paragraphs, bold and italic text, bulleted and numbered lists, tables, clickable links and images embedded in the HTML as data URLs.'],
      ['Safe by default', 'Scripts, styles, iframes and remote resources are ignored and never fetched, so converting an HTML file cannot run code or reveal that it was opened. CSS layout is not applied.'],
    ],
    faqs: [['Can I convert a web page URL to PDF?', 'Not directly: the converter does not fetch web pages. Save the page as HTML, or paste its HTML, then convert it.']],
  },
  'ocr-pdf': {
    sections: [
      ['Searchable and selectable', 'OCR recognizes the words on scanned pages and adds an invisible text layer, so you can search, select and copy text in any PDF reader.'],
      ['Many languages', 'English is used by default. Enter another Tesseract language code, such as fra, deu or spa, or combine several like eng+fra.'],
      ['On-device recognition', 'The recognition engine and language data download to your browser the first time; your scanned pages are never uploaded.'],
    ],
    faqs: [['Does OCR change how my PDF looks?', 'Pages are re-rendered as images with a hidden text layer on top, so the result looks like the scan but becomes searchable. Review the recognised text, because OCR can make mistakes.']],
  },
  'pdf-to-jpg': {
    sections: [
      ['Pick the resolution', 'Choose any resolution from 72 to 600 DPI. 150 DPI suits screens and sharing; 300 DPI suits printing.'],
      ['Only the pages you need', 'Enter a page range such as 1-3, 5. A single page downloads as one JPG; several pages download together in a ZIP.'],
    ],
    faqs: [['JPG or PNG?', 'JPG files are smaller and suit photos and scans. Use PDF to PNG for sharp text, line art or a transparent background.']],
  },
  'pdf-to-excel': {
    sections: [
      ['Real columns, not one long list', 'Paperwork reads where each piece of text sits on the page. Words on the same line are grouped into cells, and cells that line up vertically across rows become the same Excel column, so a printed table comes back as a grid. Titles and notes above or below the table stay in column A.'],
      ['Numbers you can calculate with', 'Values such as 1,204, $12,450.50, (42) and 12.5% are stored as real numbers with matching number formats, so SUM and charts work straight away. Codes with leading zeros, such as 007, and dates are kept as text so nothing is silently changed.'],
      ['One sheet per page', 'Each PDF page becomes its own worksheet named after the page. Enter a page range to convert only the pages with tables.'],
      ['Limits', 'The PDF needs selectable text — run OCR first on scans. Merged cells, cell colours and formulas are not recreated, and complex layouts with nested tables may need tidying.'],
    ],
    faqs: [
      ['How do I convert a PDF table to Excel?', 'Open PDF to Excel, add your PDF and press Convert. Download the XLSX file and open it in Excel, Google Sheets or Numbers; each page is a separate sheet.'],
      ['Will numbers stay as numbers?', 'Yes. Plain numbers, thousands separators, currency amounts, negatives in brackets and percentages become numeric cells with a matching format.'],
      ['Can I convert a scanned PDF to Excel?', 'Not directly. Run Searchable PDF (OCR) first, then convert the result to Excel.'],
    ],
  },
  'rotate-pdf': {
    sections: [
      ['Rotate every page or just some', 'Choose 90°, 180° or 270° clockwise. Leave Pages empty to rotate the whole document, or enter a range such as 2, 4-6 to rotate only sideways scans.'],
      ['Lossless and permanent', 'Rotation is saved in the PDF itself, so the pages open the right way in every viewer. Text, images and links are not re-compressed.'],
    ],
    faqs: [['How do I rotate a single page in a PDF?', 'Enter that page number in the Pages field, pick the angle and press Rotate PDF. Other pages are left as they are.']],
  },
  'watermark-pdf': {
    sections: [
      ['Text or logo', 'Type a word such as CONFIDENTIAL or DRAFT for a translucent diagonal mark, or add a PNG or JPG logo that is centred at half the page size. Clear the text for an image-only watermark.'],
      ['Choose the opacity', 'Pick from 10% (barely visible) to 100% (solid). 22% is the default and keeps the page easy to read.'],
    ],
    faqs: [['Can a watermark be removed?', 'A watermark is added as page content, so it is not trivial to remove, but someone with editing software can still delete it. Combine it with Flatten PDF or a password for more protection.']],
  },
  'add-page-numbers-to-pdf': {
    sections: [['Where the numbers go', 'Numbers are added to the bottom centre of every page, starting at 1. For legal page stamps such as ABC000001, use Bates numbering instead.']],
    faqs: [['Do page numbers change my content?', 'No. Numbers are drawn on top of each page; existing text, images and links are untouched.']],
  },
  'organize-pdf': {
    sections: [['Type the order you want', 'List pages in the new order, for example 3, 1, 2, 5-7. Repeat a number to duplicate a page; leave a page out to remove it. Pages are copied without re-compression.']],
    faqs: [['How do I move a page in a PDF?', 'Write the page numbers in the order you want them, such as 2, 1, 3-10 to swap the first two pages, and press Save page order.']],
  },
  'pdf-to-powerpoint': {
    sections: [['What you get', 'Each PDF page becomes one widescreen slide holding a sharp image of that page, centred and scaled to fit. It is ideal for presenting a PDF in PowerPoint, Keynote or Google Slides. Text on the slides is not editable; use PDF to Word if you need to edit the words.']],
    faqs: [['Is the text editable after converting PDF to PowerPoint?', 'No. Slides contain page images, so they look exactly like the PDF. Copy text from PDF to Word or PDF to text if you need to edit it.']],
  },
  'png-to-pdf': {
    sections: [['No quality loss', 'PNG images are embedded losslessly, so screenshots, diagrams and text stay crisp. Add several images to get one PDF with a page per image, in the order you choose.']],
    faqs: [['Can I combine several PNG files into one PDF?', 'Yes. Add all the images at once, arrange them, and press Create PDF to get a single PDF.']],
  },
  'split-pdf': {
    sections: [
      ['Two ways to split', 'Leave Pages empty to save every page as its own PDF, downloaded together in a ZIP. Or enter a range such as 1-3, 8 to extract just those pages into one new PDF.'],
      ['Nothing is re-compressed', 'Pages are copied as they are, so text, images and links keep their original quality.'],
    ],
    faqs: [['Can I split a PDF by file size?', 'Yes. Use Split by size to break a large PDF into parts under a size limit, for example for email.']],
  }
}

export const sizeFaqs = (label) => [
  [`How do I compress a PDF to ${label}?`, `Open this page, add your PDF and press Optimize PDF — the ${label} limit is already selected. Lossless optimization is tried first, then the gentlest image downsampling that fits under ${label}.`],
  [`What if my PDF cannot get under ${label}?`, 'You get the smallest file possible and a clear explanation. PDFs that are mostly text and vector graphics are already compact; split the PDF or remove pages to go smaller.'],
  ['Is my PDF uploaded?', 'No. Compression runs in your browser; the file never leaves your device.'],
]
