import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { resolveUploadPath } from '~~/server/utils/uploads'

/**
 * Serve uploaded product images off the filesystem.
 *
 * Why this route has to exist at all: in production Nitro serves `.output/public`
 * from a manifest of assets generated at BUILD time. A file the admin uploads at
 * RUNTIME is not in that manifest, so Nitro 404s it even though the bytes are
 * sitting right there on disk (and, in Docker, on a persistent volume). That is
 * exactly the "I upload a photo and it never appears in the shop" bug — and it
 * only reproduces in production, because the dev server serves `public/` by
 * reading the disk on every request.
 *
 * In dev this handler is effectively dormant: Vite's public middleware answers
 * first for files that exist. In production it is the only thing that can serve
 * them.
 */

// Only image types the upload endpoint can produce or accept. Anything else is
// treated as not found rather than handed back with a guessed content type —
// serving an unexpected type out of a user-writable directory is how an upload
// folder turns into a way to serve HTML/JS from your own origin.
const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
}

/**
 * A miss must NOT be cached.
 *
 * `.webp` is on Cloudflare's default-cacheable extension list, so a 404 from
 * this route was being held at the edge for hours — which meant that once an
 * image 404'd (even transiently, e.g. requested a moment before the upload
 * finished writing), every other visitor kept getting the cached miss long
 * after the file existed. Only the browser that had already fetched it
 * successfully still saw the image, which is exactly the "it works on my
 * device only" symptom. `no-store` makes a miss cost nothing but a re-request.
 */
function notFound(event: any) {
  setResponseHeader(event, 'cache-control', 'no-store, no-cache, must-revalidate')
  return createError({ statusCode: 404, statusMessage: 'Not found' })
}

export default defineEventHandler(async (event) => {
  const segments = getRouterParam(event, 'path') || ''
  const filePath = resolveUploadPath(segments)
  if (!filePath) {
    throw notFound(event)
  }

  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()]
  if (!contentType) {
    throw notFound(event)
  }

  let stats
  try {
    stats = await stat(filePath)
  } catch {
    throw notFound(event)
  }
  if (!stats.isFile()) {
    throw notFound(event)
  }

  // Uploads are content-addressed by a random filename, so a given URL's bytes
  // never change — but a product photo CAN be re-uploaded under a new name, so
  // this is long-lived rather than immutable, matching the routeRules entry for
  // /uploads/** and the Caddy header in front of it.
  const etag = `W/"${stats.size}-${stats.mtimeMs}"`
  setResponseHeaders(event, {
    'content-type': contentType,
    'content-length': String(stats.size),
    'cache-control': 'public, max-age=2592000',
    'last-modified': stats.mtime.toUTCString(),
    etag,
  })

  // Honour conditional requests so repeat views cost a 304, not a re-download.
  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }

  return sendStream(event, createReadStream(filePath))
})
