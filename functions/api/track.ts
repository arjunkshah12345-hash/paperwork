import { type Context, type Registration, TTL, cors, idPattern, json, sha256 } from '../_shared'

export const onRequestOptions = () => new Response(null, { status: 204, headers: cors })

/** Register a tracked copy: { id, tokenHash, urls }. Only these destination URLs can be redirected to. */
export async function onRequestPost({ request, env }: Context) {
  if (!env.TRACKING) return json({ error: 'Tracking is not configured on this server.' }, 503)
  let body: { id?: unknown; tokenHash?: unknown; urls?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON.' }, 400) }
  const { id, tokenHash, urls } = body
  if (typeof id !== 'string' || !idPattern.test(id)) return json({ error: 'Invalid id.' }, 400)
  if (typeof tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(tokenHash)) return json({ error: 'Invalid token hash.' }, 400)
  if (!Array.isArray(urls) || urls.length > 200 || !urls.every(url => typeof url === 'string' && url.length <= 2048 && /^(https?:|mailto:)/i.test(url))) return json({ error: 'Invalid link list.' }, 400)
  if (await env.TRACKING.get(`reg:${id}`)) return json({ error: 'This id is already registered.' }, 409)
  const registration: Registration = { tokenHash, urls: urls as string[], created: new Date().toISOString() }
  await env.TRACKING.put(`reg:${id}`, JSON.stringify(registration), { expirationTtl: TTL })
  return json({ ok: true })
}

/** Read events for a tracked copy: ?id=PWFP-…&token=… */
export async function onRequestGet({ request, env }: Context) {
  if (!env.TRACKING) return json({ error: 'Tracking is not configured on this server.' }, 503)
  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? '', token = url.searchParams.get('token') ?? ''
  if (!idPattern.test(id) || !token) return json({ error: 'Missing id or token.' }, 400)
  const stored = await env.TRACKING.get(`reg:${id}`)
  if (!stored) return json({ error: 'Unknown or expired tracking id.' }, 404)
  const registration = JSON.parse(stored) as Registration
  if (await sha256(token) !== registration.tokenHash) return json({ error: 'Wrong tracking key.' }, 403)
  const events: unknown[] = []
  let cursor: string | undefined
  do {
    const page = await env.TRACKING.list({ prefix: `ev:${id}:`, limit: 1000, cursor })
    for (const key of page.keys) { const value = await env.TRACKING.get(key.name); if (value) events.push(JSON.parse(value)) }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor && events.length < 5000)
  return json({ id, created: registration.created, links: registration.urls, events })
}
