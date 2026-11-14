import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { detectSensitive, hashBytes, intelligenceTools, passesLuhn, processIntelligence, sensitiveWordBoxes } from './intelligence'

describe('sensitive patterns', () => {
  it('detects emails, US SSNs, phone numbers, and valid cards', () => {
    const matches = detectSensitive('Contact a.person@example.com at 415-555-1234. SSN 123-45-6789; card 4111 1111 1111 1111.')
    expect(matches.map((match) => match.kind)).toEqual(expect.arrayContaining(['email', 'phone number', 'US social security number', 'payment card']))
    expect(matches.every((match) => match.end - match.start === match.text.length)).toBe(true)
  })
  it('validates Luhn and rejects repeated or invalid card numbers', () => {
    expect(passesLuhn('4111 1111 1111 1111')).toBe(true)
    expect(passesLuhn('4111111111111112')).toBe(false)
    expect(passesLuhn('0000000000000000')).toBe(false)
    expect(passesLuhn('123')).toBe(false)
    expect(passesLuhn('4111x111111111111')).toBe(false)
  })
  it('rejects impossible SSN prefixes and preserves literal custom terms', () => {
    expect(detectSensitive('000-12-1234 666-12-1234 900-12-1234')).toEqual([])
    expect(detectSensitive('A+B (secret) a+b', ['a+b', '(secret)', '']).map((match) => match.text)).toEqual(['A+B', '(secret)', 'a+b'])
  })
  it('covers every OCR word in multiword matches', () => {
    const words = ['Card', '4111', '1111', '1111', '1111', 'public'].map((text, index) => ({ text, bbox: { x0: index * 50, y0: 10, x1: index * 50 + 45, y1: 30 } }))
    expect(sensitiveWordBoxes(words)).toEqual(words.slice(1, 5).map((word) => word.bbox))
    expect(sensitiveWordBoxes(words, ['public'])).toContainEqual(words[5].bbox)
  })
  it('does not retain state across scans', () => {
    expect(detectSensitive('alice@example.com')).toEqual(detectSensitive('alice@example.com'))
    expect(detectSensitive('Ordinary public text.')).toEqual([])
  })
  it('finds a complete payment card followed by a security code', () => {
    expect(detectSensitive('4111 1111 1111 1111 123')).toContainEqual({ kind: 'payment card', start: 0, end: 19, text: '4111 1111 1111 1111' })
    expect(detectSensitive('41111111111111111234')).toEqual([])
    expect(detectSensitive('3782 822463 10005 1234').some((match) => match.text === '3782 822463 10005')).toBe(true)
  })
  it.each([['alice@', 'example.com'], ['alice', '@', 'example.com']])('matches adjacent OCR runs: %j', (...tokens) => {
    let left = 10
    const words = tokens.map((text) => {
      const bbox = { x0: left, y0: 10, x1: left + text.length * 8, y1: 30 }
      left = bbox.x1 + 1
      return { text, bbox }
    })
    expect(sensitiveWordBoxes(words)).toEqual(words.map((word) => word.bbox))
    expect(sensitiveWordBoxes(words, ['alice@example.com'])).toEqual(words.map((word) => word.bbox))
  })
  it('does not join distinct OCR lines or widely separated words', () => {
    const first = { text: 'secret', bbox: { x0: 10, y0: 10, x1: 58, y1: 30 } }
    const nextLine = { text: 'value', bbox: { x0: 59, y0: 40, x1: 99, y1: 60 } }
    const spaced = { text: 'value', bbox: { x0: 80, y0: 10, x1: 120, y1: 30 } }
    expect(sensitiveWordBoxes([first, nextLine], ['secretvalue'])).toEqual([])
    expect(sensitiveWordBoxes([first, spaced], ['secretvalue'])).toEqual([])
    expect(sensitiveWordBoxes([first, spaced], ['secret value'])).toHaveLength(2)
  })
})

describe('fingerprints and dispatch', () => {
  it('matches known SHA-256, SHA-1, MD5 vectors', async () => {
    expect(await hashBytes(new TextEncoder().encode('abc').buffer)).toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      md5: '900150983cd24fb0d6963f7d28e17f72',
    })
  })
  it('hashes empty data accurately', async () => {
    const hashes = await hashBytes(new ArrayBuffer(0))
    expect(hashes.md5).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hashes.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('produces checksums for multiple original files without changing them', async () => {
    const first = new File(['abc'], 'first.pdf')
    const second = new File([''], 'second.pdf')
    const result = await processIntelligence('fingerprint', [first, second], {})
    const data = JSON.parse(await result.blob.text())
    expect(data.fingerprints.map((file: { file: string }) => file.file)).toEqual(['first.pdf', 'second.pdf'])
    expect(await first.text()).toBe('abc')
    expect(result.blob.type).toBe('application/json')
  })
  it('rejects unsupported, missing, and ambiguous inputs', async () => {
    expect(intelligenceTools).toHaveLength(10)
    await expect(processIntelligence('pretend-ai', [], {})).rejects.toThrow('Unsupported')
    await expect(processIntelligence('encrypt', [], {})).rejects.toThrow('Choose a file')
    await expect(processIntelligence('encrypt', [new File([''], 'file.pdf')], {})).rejects.toThrow('nonempty password')
    await expect(processIntelligence('ocr', [new File([''], 'one.pdf'), new File([''], 'two.pdf')], {})).rejects.toThrow('exactly one')
  })
  it.each(['ocr', 'handwriting-pdf', 'auto-redact', 'audio-pdf'])('requires explicit download consent for %s before loading models', async (tool) => {
    await expect(processIntelligence(tool, [new File([''], 'file.pdf')], {})).rejects.toThrow('explicit consent')
  })
  it('encrypts a real PDF, preserving pages and requiring the supplied password', async () => {
    const source = await PDFDocument.create()
    source.addPage([320, 480])
    const original = new Uint8Array(await source.save()).buffer
    const file = new File([original], 'private.pdf')
    const result = await processIntelligence('encrypt', [file], { password: 'correct-horse-battery-staple' })
    const { PDF } = await import('@libpdf/core')
    const encrypted = new Uint8Array(await result.blob.arrayBuffer())
    const locked = await PDF.load(encrypted)
    expect(locked.isEncrypted).toBe(true)
    expect(locked.isAuthenticated).toBe(false)
    const opened = await PDF.load(encrypted, { credentials: 'correct-horse-battery-staple' })
    expect(opened.isAuthenticated).toBe(true)
    expect(opened.getPageCount()).toBe(1)
    expect(result.filename).toBe('private-encrypted.pdf')
    expect(await file.arrayBuffer()).toEqual(original)
  })
})

describe('unlock', () => {
  async function encrypted(userPassword: string) {
    const document = await PDFDocument.create()
    const font = await document.embedFont('Helvetica')
    document.addPage().drawText('Confidential payslip', { x: 40, y: 700, size: 14, font })
    const { PDF } = await import('@libpdf/core')
    const pdf = await PDF.load(await document.save())
    pdf.setProtection({ userPassword, ownerPassword: 'owner-secret', algorithm: 'AES-256' })
    return new File([await pdf.save()], 'payslip.pdf', { type: 'application/pdf' })
  }
  it('removes a password losslessly using the Current password field', async () => {
    const result = await processIntelligence('unlock', [await encrypted('open-me')], { currentPassword: 'open-me' })
    const { PDF } = await import('@libpdf/core')
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    expect((await PDF.load(bytes)).isEncrypted).toBe(false)
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('/Encrypt')
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(1)
    expect(result.message).toContain('Text, links, forms and bookmarks are unchanged')
  })
  it('removes owner-only restrictions without a password', async () => {
    const result = await processIntelligence('remove-password', [await encrypted('')], {})
    const { PDF } = await import('@libpdf/core')
    expect((await PDF.load(new Uint8Array(await result.blob.arrayBuffer()))).isEncrypted).toBe(false)
  })
  it('requires the right password and never cracks', async () => {
    await expect(processIntelligence('unlock', [await encrypted('open-me')], {})).rejects.toThrow('needs its password')
    await expect(processIntelligence('unlock', [await encrypted('open-me')], { currentPassword: 'wrong' })).rejects.toThrow('not correct')
  })
})
