import type { H3Event } from 'h3'
import { getRequestIP, getHeader } from 'h3'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/**
 * Best-effort client IP.
 *
 * NOT taken from the first X-Forwarded-For entry: that value is whatever the
 * client sent, so anyone could rotate it per request and walk straight through
 * the login limiter. Cloudflare's CF-Connecting-IP is set by the edge and can't
 * be spoofed through it, so it's preferred; the socket address is the fallback.
 *
 * If you ever run without Cloudflare in front, drop the header branch — a
 * directly-reachable origin lets clients forge it.
 */
function clientIp(event: H3Event): string {
  const cf = getHeader(event, 'cf-connecting-ip')?.trim()
  if (cf) return cf

  // No Cloudflare header: fall back to the LAST X-Forwarded-For entry, which is
  // the address our own reverse proxy (Caddy) observed. Earlier entries are
  // client-supplied and therefore worthless. The raw socket address is a last
  // resort — behind a proxy it's the proxy itself, i.e. one shared bucket.
  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
    const nearest = hops[hops.length - 1]
    if (nearest) return nearest
  }

  return getRequestIP(event) || 'unknown'
}

function clientKey(event: H3Event, prefix: string) {
  return `${prefix}:${clientIp(event)}`
}

/**
 * Sliding-window rate limiter (in-memory). Sufficient for a single Node instance;
 * for multi-instance deployments, back this with Redis.
 */
export function rateLimit(
  event: H3Event,
  opts: { key: string; max: number; windowMs: number },
) {
  const now = Date.now()
  const key = clientKey(event, opts.key)
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return
  }

  bucket.count += 1
  if (bucket.count > opts.max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      data: { retryAfter },
    })
  }
}

// Best-effort periodic cleanup so the map does not grow forever.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }, 60_000).unref?.()
}
