import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib'
import { processIntelligence, trackingOrigin } from './intelligence'
import * as api from '../../functions/api/track'
import * as link from '../../functions/t/[id]'
import type { KV } from '../../functions/_shared'

function memoryKv(): KV {
  const store = new Map<string, string>()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async list({ prefix }) { return { keys: [...store.keys()].filter(key => key.startsWith(prefix)).sort().map(name => ({ name })), list_complete: true } },
  }
}

function serve(env: { TRACKING?: KV }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(String(input), init)
    const url = new URL(request.url)
    if (url.pathname === '/api/track') return request.method === 'POST' ? api.onRequestPost({ request, env, params: {} }) : api.onRequestGet({ request, env, params: {} })
    const match = /^\/t\/([^/]+)$/.exec(url.pathname)
    if (match) return link.onRequestGet({ request, env, params: { id: match[1] } })
    return new Response('not found', { status: 404 })
  })
}

async function linkedPdf() {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage([400, 400])
  page.drawText('See the pricing page', { x: 40, y: 300, size: 12, font })
  const annot = document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 295, 200, 315], A: { S: 'URI', URI: PDFString.of('https://example.com/pricing') } })
  page.node.set(PDFName.of('Annots'), document.context.obj([document.context.register(annot)]))
  return new File([new Uint8Array(await document.save()).buffer], 'deck.pdf')
}

async function unzip(blob: Blob) {
  const archive = await JSZip.loadAsync(await blob.arrayBuffer())
  const pdfName = Object.keys(archive.files).find(name => name.endsWith('.pdf'))!
  const ledgerName = Object.keys(archive.files).find(name => name.endsWith('ledger.json'))!
  return { pdf: await PDFDocument.load(await archive.file(pdfName)!.async('uint8array')), ledgerText: await archive.file(ledgerName)!.async('string') }
}

function uris(document: PDFDocument) {
  return document.getPage(0).node.Annots()!.asArray().map(ref => {
    const action = (document.context.lookup(ref) as PDFDict).lookup(PDFName.of('A')) as PDFDict
    return (action.lookup(PDFName.of('URI')) as PDFString).decodeText()
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('opt-in link-click tracking', () => {
  it('rewrites links, registers the copy, logs clicks, and reports them only with the key', async () => {
    const env = { TRACKING: memoryKv() }
    const fetch = serve(env)
    vi.stubGlobal('fetch', fetch)
    const result = await processIntelligence('fingerprint', [await linkedPdf()], { mode: 'embed', text: 'Acme', track: 'on' })
    const { pdf, ledgerText } = await unzip(result.blob)
    const ledger = JSON.parse(ledgerText)
    const id = ledger.fingerprint
    expect(ledger.trackingKey).toMatch(new RegExp(`^${id}\\.[0-9a-f]{48}$`))
    expect(uris(pdf)).toEqual([`${trackingOrigin}/t/${id}?l=0`, `${trackingOrigin}/t/${id}`])

    const click = await fetch(`${trackingOrigin}/t/${id}?l=0`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130.0' } })
    expect(click.status).toBe(302)
    expect(click.headers.get('Location')).toBe('https://example.com/pricing')
    const verify = await fetch(`${trackingOrigin}/t/${id}`)
    expect(verify.headers.get('Location')).toBe(`${trackingOrigin}/verified?id=${id}`)
    // Out-of-range link indexes never become an open redirect.
    expect((await fetch(`${trackingOrigin}/t/${id}?l=9`)).headers.get('Location')).toContain('/verified?id=')

    const events = await processIntelligence('fingerprint', [new File([ledgerText], 'ledger.json')], { mode: 'events' })
    const data = JSON.parse(await events.blob.text())
    expect(data.clicks).toBe(3)
    expect(data.events[0]).toMatchObject({ link: 0, url: 'https://example.com/pricing', browser: 'Chrome' })
    expect(events.message).toContain('3 clicks')

    const wrongKey = JSON.stringify({ ...ledger, trackingKey: `${id}.${'0'.repeat(48)}` })
    await expect(processIntelligence('fingerprint', [new File([wrongKey], 'ledger.json')], { mode: 'events' })).rejects.toThrow('Wrong tracking key')
  })

  it('makes no copy when the server is unavailable, and leaves untracked embeds offline', async () => {
    vi.stubGlobal('fetch', serve({}))
    await expect(processIntelligence('fingerprint', [await linkedPdf()], { mode: 'embed', track: 'on' })).rejects.toThrow('refused the registration (503)')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await processIntelligence('fingerprint', [await linkedPdf()], { mode: 'embed' })
    expect(fetch).not.toHaveBeenCalled()
    expect(uris((await unzip(result.blob)).pdf)).toEqual(['https://example.com/pricing'])
  })

  it('rejects malformed registrations', async () => {
    const env = { TRACKING: memoryKv() }
    const post = (body: unknown) => api.onRequestPost({ request: new Request('https://x/api/track', { method: 'POST', body: JSON.stringify(body) }), env, params: {} })
    expect((await post({ id: 'nope', tokenHash: 'a'.repeat(64), urls: [] })).status).toBe(400)
    expect((await post({ id: 'PWFP-0123456789ABCDEF', tokenHash: 'a'.repeat(64), urls: ['javascript:alert(1)'] })).status).toBe(400)
    expect((await post({ id: 'PWFP-0123456789ABCDEF', tokenHash: 'a'.repeat(64), urls: [] })).status).toBe(200)
    expect((await post({ id: 'PWFP-0123456789ABCDEF', tokenHash: 'b'.repeat(64), urls: [] })).status).toBe(409)
  })
})
