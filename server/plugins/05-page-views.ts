import {
  FLUSH_INTERVAL,
  flush,
  isBot,
  isCountablePath,
  normalisePath,
  pruneVisitors,
  record,
} from '../utils/analytics'

/**
 * Count page views for the admin's traffic panel.
 *
 * Hooked on `afterResponse` rather than as middleware on purpose: the response
 * has already gone out by then, so nothing here can add latency to a shop page
 * or break one by throwing. It also still fires for pages served from the
 * `swr: 3600` route cache, which middleware-in-the-handler would miss.
 *
 * Counting is buffered in memory (see server/utils/analytics.ts) and written in
 * batches, so a visitor costs a Map update, not a database round trip.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event) => {
    try {
      if ((event.method || '').toUpperCase() !== 'GET') return

      const status = getResponseStatus(event)
      // A 404 is not a visit to a page, and a redirect is counted at its target.
      if (status >= 300) return

      const rawPath = event.path || ''
      const path = normalisePath(rawPath)

      // `_payload.json` IS a page view (a client-side route change), so it is
      // normalised into its page path above before the asset filter runs.
      if (!rawPath.includes('/_payload.json') && !isCountablePath(rawPath)) return
      if (!isCountablePath(path)) return

      const headers = getRequestHeaders(event)
      const userAgent = headers['user-agent'] || ''
      if (isBot(userAgent)) return

      // Behind Caddy and Cloudflare, so the socket address is a proxy. Prefer
      // what Cloudflare reports, then the standard forwarding header.
      const ip =
        headers['cf-connecting-ip'] ||
        headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        getRequestIP(event, { xForwardedFor: true }) ||
        'unknown'

      record(path, ip, userAgent)
    } catch {
      // Analytics must never be the reason a request logs an error.
    }
  })

  const timer = setInterval(() => {
    void flush()
  }, FLUSH_INTERVAL)
  // Don't hold the process open just to count page views.
  timer.unref?.()

  // Once a day, drop visitor hashes past their retention window.
  const pruner = setInterval(() => void pruneVisitors(), 24 * 60 * 60 * 1000)
  pruner.unref?.()

  // A restart would otherwise throw away up to one flush interval of counts.
  nitroApp.hooks.hook('close', async () => {
    await flush()
  })
})
