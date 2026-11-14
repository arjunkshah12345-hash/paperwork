import { type Context, type Registration, TTL, idPattern } from '../_shared'

/** Tracked link: logs a click (time, link, country, browser family) and redirects to the registered URL. */
export async function onRequestGet({ request, env, params }: Context) {
  const id = params.id
  const home = new URL('/', request.url).toString()
  if (!env.TRACKING || !idPattern.test(id)) return Response.redirect(home, 302)
  const stored = await env.TRACKING.get(`reg:${id}`)
  if (!stored) return Response.redirect(home, 302)
  const registration = JSON.parse(stored) as Registration
  const raw = new URL(request.url).searchParams.get('l')
  const index = raw === null ? -1 : Number(raw)
  const valid = Number.isInteger(index) && index >= 0 && index < registration.urls.length
  const target = valid ? registration.urls[index] : new URL(`/verified?id=${id}`, request.url).toString()
  const agent = request.headers.get('User-Agent') ?? ''
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : /Acrobat|Adobe/i.test(agent) ? 'Adobe' : 'Other'
  const country = (request as unknown as { cf?: { country?: string } }).cf?.country ?? null
  const at = new Date().toISOString()
  await env.TRACKING.put(`ev:${id}:${at}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ at, link: valid ? index : 'verify', country, browser }), { expirationTtl: TTL })
  return Response.redirect(target, 302)
}
