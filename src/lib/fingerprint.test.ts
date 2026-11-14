import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { processIntelligence } from './intelligence'

describe('document fingerprint', () => {
  it('embeds a unique traceable ID with a ledger, then detects it', async () => {
    const source = await PDFDocument.create(); source.addPage([100, 100]); source.addPage([100, 100])
    const file = new File([await source.save()], 'contract.pdf')
    const first = await processIntelligence('fingerprint', [file], { mode: 'embed', text: 'Acme' })
    const second = await processIntelligence('fingerprint', [file], { mode: 'embed', text: 'Beta' })
    const zip = await JSZip.loadAsync(await first.blob.arrayBuffer())
    const ledgerName = Object.keys(zip.files).find(n => n.endsWith('-ledger.json'))!
    const ledger = JSON.parse(await zip.file(ledgerName)!.async('string'))
    expect(ledger.fingerprint).toMatch(/^PWFP-[0-9A-F]{16}$/)
    expect(ledger.recipient).toBe('Acme')
    expect(second.filename).not.toBe(first.filename)
    const pdfName = Object.keys(zip.files).find(n => n.endsWith('.pdf'))!
    const marked = new File([await zip.file(pdfName)!.async('uint8array')], 'leak.pdf')
    expect((await PDFDocument.load(await marked.arrayBuffer())).getPageCount()).toBe(2)
    const detected = JSON.parse(await (await processIntelligence('fingerprint', [marked], { mode: 'detect' })).blob.text())
    expect(detected.fingerprint).toBe(ledger.fingerprint)
    expect(detected.inMetadata).toBe(true)
    const clean = JSON.parse(await (await processIntelligence('fingerprint', [file], { mode: 'detect' })).blob.text())
    expect(clean.fingerprint).toBeNull()
  })
})
