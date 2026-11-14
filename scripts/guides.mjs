// Long-form guides. The first six keep the URLs and titles already indexed on pdfeditor.tech;
// steps describe this app's real controls. `tool` is the app tool id the guide links to.
export const guides = [
  {
    slug: 'change-pdf-text-without-uploading', tool: 'edit',
    title: 'How to change selectable PDF text without uploading your document',
    description: 'Open Edit PDF, keep “Edit existing text” selected, click the text, type the correction and download. The old words are removed from the file, not covered. Scans need OCR first.',
    answer: 'Open the Edit PDF tool, keep the mode on “Edit existing text”, click the highlighted text you want to change, type the replacement, press Apply change, then Download edited PDF. Everything happens in your browser; the file is never uploaded.',
    steps: [
      'Open Edit PDF & Add Signature and choose your PDF.',
      'Leave the mode set to “Edit existing text”. Selectable text on the page is outlined in blue.',
      'Click the text run you want to change. Its current wording appears in the “Replace” box.',
      'Type the corrected text and press Apply change (or Delete text to remove it). Repeat on any page.',
      'Press Download edited PDF, then reopen the copy and read the changed lines.',
    ],
    sections: [
      ['What actually changes in the file', 'The original characters are deleted from the page’s drawing instructions, so they cannot be copied, searched or extracted afterwards. Text that followed on the same line keeps its exact position. The new words are set at the same baseline, size, colour and angle.'],
      ['Fonts and spacing', 'Replacement text uses the closest standard PDF font — Helvetica, Times or Courier, with bold and italic variants — because the document’s own embedded font is usually a subset that lacks unused letters. A longer replacement can run into neighbouring text, so keep corrections short and check the result.'],
      ['When this will not work', 'Scanned pages are pictures, not text: run Searchable PDF (OCR) first. Text drawn as outlines, text inside embedded form objects, and replacements in non-Latin scripts cannot be edited this way. For large layout changes, edit the original Word or design file and export a new PDF.'],
    ],
    faqs: [
      ['Is the old text really gone?', 'Yes. It is removed from the page content, not hidden behind a white box. Other pages and metadata are unchanged, so review the whole document if you are removing sensitive information — or use Redact PDF.'],
      ['Will editing break a digital signature?', 'Yes. Any change to a signed PDF invalidates its existing digital signature.'],
    ],
  },
  {
    slug: 'compress-pdf-for-email', tool: 'compress',
    title: 'How to reduce a PDF’s size for email without guessing at quality',
    description: 'Open Compress PDF, start with Lossless, then try Balanced or Strong and compare the real output size with your email limit. Check image quality before sending.',
    answer: 'Open Compress PDF, choose a compression level — Lossless first, then Balanced (about 150 DPI) or Strong (about 100 DPI) if the file is still too big — and press Optimize PDF. The result shows the actual new size; if nothing got smaller you get the original back.',
    steps: [
      'Open Compress PDF and choose your file.',
      'Pick Lossless to repackage the file without touching quality, and press Optimize PDF.',
      'If it is still over your limit (often 20–25 MB for email), press Start over and choose Balanced, then Strong.',
      'Read the reported percentage, download, and zoom into photos to confirm they are still clear.',
    ],
    sections: [
      ['Why some PDFs barely shrink', 'Size usually comes from photos and scanned pages. Text and vector drawings are already compact, so a text-only PDF may not get smaller. Use “Why Is My PDF So Big?” to see which images and fonts take the space.'],
      ['What the levels change', 'Balanced, Strong and Extreme shrink embedded RGB and grayscale photos to roughly 150, 100 or 72 DPI and re-save them as JPEG. Text stays sharp. Masked, CMYK and indexed images are kept as they are, and no level can guarantee a specific target size.'],
      ['If it is still too large', 'Split PDF by Size makes parts under a chosen limit, or share a link instead of an attachment.'],
    ],
    faqs: [
      ['Does compression reduce text quality?', 'No. Only embedded photos are downsampled; text and vector graphics are untouched.'],
      ['Is my file uploaded to compress it?', 'No. Compression runs in your browser on your device.'],
    ],
  },
  {
    slug: 'merge-pdf-files', tool: 'merge',
    title: 'How to merge PDFs into one file and check the page order',
    description: 'Open Merge PDF, add your files, use the arrows to set their order, and press Merge PDFs. Reopen the combined copy to check page count and orientation.',
    answer: 'Open Merge PDF, add two or more PDFs, put them in order with the arrows (top file first), press Merge PDFs, and download one combined file. Files are combined on your device.',
    steps: [
      'Open Merge PDF and add all the PDFs you want to combine (you can select several at once).',
      'Use the arrows to move files up or down. They are joined from top to bottom.',
      'Press Merge PDFs and download merged.pdf.',
      'Open it and check the page count, order and orientation.',
    ],
    sections: [
      ['Fix page order or orientation afterwards', 'Use Organize PDF to drag page thumbnails into a new order, duplicate or remove pages, and Rotate PDF for sideways pages.'],
      ['Mixing pages instead of stacking files', 'To interleave pages — for example scanned fronts and backs — use Alternate & Mix PDF instead of Merge.'],
      ['Things to check', 'Password-protected PDFs must be unlocked with Remove Password first. Bookmarks and form fields from different files may not combine cleanly; check them in the merged copy.'],
    ],
    faqs: [
      ['How many PDFs can I merge?', 'Up to 50 files and 100 MB each per batch; your device’s memory is the practical limit.'],
      ['Does merging lower quality?', 'No. Pages are copied as-is without re-compression.'],
    ],
  },
  {
    slug: 'sign-pdf-without-printing', tool: 'edit',
    title: 'How to sign a PDF without printing or scanning',
    description: 'Open Edit PDF, choose Handwritten signature, draw your signature on the page and download. Or use Sign PDF for a typed or image signature. These are visible signatures, not digital certificates.',
    answer: 'Open Edit PDF & Add Signature, switch the mode to “Handwritten signature”, draw your signature where it belongs with a mouse, trackpad or finger, then press Download edited PDF. For a typed name or a photo of your signature, use Sign PDF.',
    steps: [
      'Open Edit PDF & Add Signature and choose the PDF.',
      'Go to the signing page with the page arrows and set the mode to Handwritten signature.',
      'Draw your signature directly on the page. Pick the ink colour first if needed.',
      'Press Download edited PDF and reopen the copy to check the mark.',
    ],
    sections: [
      ['Is a drawn signature legally valid?', 'Many everyday agreements accept a visible electronic signature, but some documents require a certificate-based digital signature or a specific e-signature service. Check what the recipient requires.'],
      ['What this does not do', 'It adds a visible mark only. It does not create a cryptographic signature, identity check or audit trail, and editing an already digitally signed PDF invalidates that signature.'],
    ],
    faqs: [
      ['Can I sign on my phone?', 'Yes. Draw with your finger in a mobile browser.'],
      ['Is my signature stored?', 'No. It exists only in the downloaded PDF on your device.'],
    ],
  },
  {
    slug: 'why-pdf-text-cannot-be-edited', tool: 'edit',
    title: 'Why some PDF text cannot be edited, and what to do instead',
    description: 'PDF words can be real text, scanned pixels or outlined shapes. Edit real text directly, run OCR on scans, and return to the source file for layout changes. A new text box is only an overlay.',
    answer: 'A PDF can store words as real text, as part of a scanned image, or as drawn outlines. Only real text can be edited: in Edit PDF it is outlined in blue when you choose “Edit existing text”. For scans, run Searchable PDF (OCR) first; for outlines or big layout changes, edit the original document.',
    steps: [
      'Open Edit PDF and choose “Edit existing text”.',
      'If the words you need are outlined in blue, click and edit them.',
      'If nothing is outlined, the page is probably a scan: run Searchable PDF (OCR), then try again.',
      'If the text still cannot be selected, it is drawn as shapes — go back to the source file or cover it with an overlay and rebuild the page.',
    ],
    sections: [
      ['Three kinds of “text” in a PDF', 'Real text is characters in a font — searchable and editable. Scanned text is pixels in a photo — it needs OCR. Outlined text is vector shapes that look like letters — it cannot be edited as text at all.'],
      ['Overlay vs. editing', 'Adding a text box puts new words on top; the original stays underneath and can still be copied. Editing existing text removes the original characters. Never rely on an overlay to hide sensitive information — use Redact PDF.'],
      ['Embedded fonts', 'Most PDFs include only the letters they use, so edits use a matching standard font. Expect small differences in letter shape.'],
    ],
    faqs: [
      ['Why can I select text but not edit it?', 'It may sit inside an embedded form object, or the replacement needs characters outside the standard fonts. Try a shorter Latin-script correction, or edit the source file.'],
    ],
  },
  {
    slug: 'rotate-and-remove-pdf-pages', tool: 'organize',
    title: 'How to rotate, reorder, and remove PDF pages before sharing',
    description: 'Open Organize PDF, drag page thumbnails into order and remove pages you do not need; use Rotate PDF for sideways pages. Download a new copy and check every page.',
    answer: 'Open Organize PDF, drag page thumbnails into the order you want (or use the arrow keys), click the bin icon on pages to remove them, and press Save page order. For sideways pages, run Rotate PDF on just those page numbers.',
    steps: [
      'Open Organize PDF and choose the file; every page appears as a thumbnail.',
      'Drag thumbnails into order. With the keyboard, focus a page and press ← or →.',
      'Hover a page and click the bin to remove it, or the copy icon to duplicate it.',
      'Press Save page order and download the new PDF.',
      'For sideways pages, open Rotate PDF, enter those page numbers (for example 2,5-6), choose 90°, 180° or 270°, and download.',
    ],
    sections: [
      ['Removing many pages at once', 'Delete PDF Pages accepts a list such as 1,4-7. Extract PDF Pages does the opposite and keeps only what you list.'],
      ['Check before you share', 'Removing pages does not remove hidden metadata. Run the Privacy Risk Scanner if the file is going outside your organization.'],
    ],
    faqs: [
      ['Does rotating change quality?', 'No. Rotation is stored as a page setting; content is not re-rendered.'],
    ],
  },
  {
    slug: 'convert-pdf-to-png', tool: 'pdf-images', isNew: true,
    title: 'How to convert a PDF to PNG images (free, no upload)',
    description: 'Open PDF to images, choose your PDF and download a ZIP with one high-resolution PNG per page. For JPG or a chosen DPI, use PDF to JPG.',
    answer: 'Open the PDF to images tool, choose your PDF, optionally list the pages you want, and press Export images. You get a ZIP with one PNG per page, rendered in your browser — nothing is uploaded.',
    steps: ['Open PDF to images (PDF to PNG).', 'Choose the PDF.', 'Press Export images and download the ZIP.', 'Unzip it: pages are numbered in order.'],
    sections: [
      ['PNG or JPG?', 'PNG is lossless and best for text, diagrams and screenshots. JPG is smaller and better for photos; PDF to JPG also lets you pick 72–600 DPI.'],
      ['Other image formats', 'PDF to TIFF makes one multipage TIFF for archiving or fax. Extract Images from PDF saves the original embedded photos instead of whole pages.'],
    ],
    faqs: [['What resolution are the PNGs?', 'Pages are rendered at up to about twice their normal size, capped at 16 megapixels per page.']],
  },
  {
    slug: 'convert-jpg-to-pdf', tool: 'images', isNew: true,
    title: 'How to convert JPG or PNG images to one PDF',
    description: 'Open Images to PDF, add your JPG or PNG files, put them in order with the arrows and create one PDF with one image per page.',
    answer: 'Open Images to PDF, add your JPG or PNG files, arrange them with the arrows, press Create PDF and download. Each image becomes its own page at full resolution, without cropping.',
    steps: ['Open Images to PDF.', 'Add the JPG or PNG images (select several at once).', 'Use the arrows to set the order.', 'Press Create PDF and download.'],
    sections: [['Photos of paper documents', 'Use Scan Document instead: it detects the page edges, crops and straightens each photo, and can apply a clean black-and-white document filter.']],
    faqs: [['Are my photos compressed?', 'No. JPG and PNG files are embedded as-is. Run Compress PDF afterwards if you need a smaller file.'], ['Can I use WebP, HEIC, TIFF or other formats?', 'Yes. Images to PDF also accepts WebP, GIF, BMP, TIFF (every page of a multipage TIFF), AVIF, SVG and HEIC. TIFF and BMP are embedded losslessly. HEIC photos need a browser that can decode them, such as Safari; elsewhere, export them as JPEG first.']],
  },
  {
    slug: 'convert-pdf-to-word', tool: 'pdf-word', isNew: true,
    title: 'How to convert a PDF to an editable Word document',
    description: 'Open PDF to Word, choose the PDF and download a DOCX with the document’s text. Layout is simplified; scanned PDFs need OCR first.',
    answer: 'Open PDF to Word, choose your PDF and download the DOCX. The text becomes editable in Word, Google Docs or LibreOffice. The original layout is simplified, and scanned PDFs need Searchable PDF (OCR) first.',
    steps: ['Open PDF to Word.', 'Choose the PDF.', 'Press PDF to Word and download the .docx file.', 'Open it and restore any headings or tables that need formatting.'],
    sections: [['If you only need a small fix', 'To correct a few words, editing the PDF directly keeps the original layout: see the guide on changing PDF text.']],
    faqs: [['Does it keep tables and images?', 'It focuses on text. For tables, PDF to Excel usually does better.']],
  },
  {
    slug: 'password-protect-pdf', tool: 'encrypt', isNew: true,
    title: 'How to password-protect a PDF with AES-256 encryption',
    description: 'Open Encrypt PDF, enter an opening password and download. The file is encrypted with AES-256 and checked before you get it.',
    answer: 'Open Encrypt PDF, choose the file, type a strong opening password, and download the encrypted copy. It uses AES-256 and is verified to open with your password before it is returned.',
    steps: ['Open Encrypt PDF and choose the file.', 'Enter a new opening password (and an owner password if you want one).', 'Press Encrypt PDF and download.', 'Open the copy to confirm it asks for the password.'],
    sections: [['Choose a strong password', 'Encryption is only as strong as the password. Use a long passphrase and send it through a different channel from the file.']],
    faqs: [['Can I remove the password later?', 'Yes, with Remove Password, as long as you know the password.']],
  },
]

/** Old paths on pdfeditor.tech that map to new URLs (301). */
export const legacyRedirects = [
  ['/edit-pdf-text', '/edit-pdf/'],
  ['/merge-pdfs', '/merge-pdf/'],
]
