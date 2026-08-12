import { invalidateCatalogCache } from '~~/server/utils/cache'

/**
 * Purge the cached catalog whenever an admin changes it.
 *
 * Done as an `afterResponse` hook rather than a call at the end of each admin
 * handler: those handlers have several return points and their own try/catch
 * blocks, so sprinkling purge calls through them would be easy to get subtly
 * wrong and easy to forget on the next endpoint. One hook covers every current
 * and future write path, and because it runs after the response it cannot
 * delay or break the write itself.
 *
 * Only successful mutations count — a rejected or failed request changed
 * nothing, so throwing away a warm cache for it would be pure loss.
 */
export default defineNitroPlugin((nitroApp) => {
  // The `/_ipx/**` route rule attaches a 30-day `cache-control` so successfully
  // resized images cache hard in the browser and at the edge. That header is
  // applied by the rule regardless of status, so a 404 — IPX failing to find the
  // source file — was being cached for thirty days, turning a temporarily
  // missing image into a month-long outage for every visitor. Errors must never
  // inherit it.
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (!event.path?.startsWith('/_ipx/')) return
    if (getResponseStatus(event) < 400) return
    setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    const method = (event.method || '').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

    const path = event.path || ''
    // Admin catalog writes, plus the one customer-facing write that changes what
    // the homepage renders: a new review. The homepage is `swr: 3600`, so
    // without this the customer writes a review from their order history and it
    // shows up on the wall an hour later — which reads as "it didn't save".
    // `isCatalogKey` already matches the homepage's `nitro:routes:_:index.*` key,
    // so nothing else has to change.
    if (!/^\/api\/admin\/(products|categories)\b/.test(path) && !/^\/api\/user\/reviews\b/.test(path)) return

    const status = getResponseStatus(event)
    if (status >= 400) return

    const cleared = await invalidateCatalogCache()
    if (cleared) console.log(`[cache] catalog invalidated after ${method} ${path} (${cleared} entries)`)
  })
})
