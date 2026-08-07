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
  nitroApp.hooks.hook('afterResponse', async (event) => {
    const method = (event.method || '').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

    const path = event.path || ''
    if (!/^\/api\/admin\/(products|categories)\b/.test(path)) return

    const status = getResponseStatus(event)
    if (status >= 400) return

    const cleared = await invalidateCatalogCache()
    if (cleared) console.log(`[cache] catalog invalidated after ${method} ${path} (${cleared} entries)`)
  })
})
