import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'
import { resolveUploadPath } from '~~/server/utils/uploads'
import { getProductImage } from '~~/server/utils/image-store'

/**
 * Serve uploaded product images: disk first, Postgres as the safety net.
 *
 * Why this route exists at all: in production Nitro serves `.output/public`
 * from a manifest generated at BUILD time, so runtime uploads are invisible to
 * the static handler even when the bytes are on disk.
 *
 * Why the DB fallback: the disk copy is only a cache. Production demonstrably
 * lost it (the volume meant to persist it was not mounted), so any miss is
 * answered from the `product_images` table and the file is written back to
 * disk — self-healing, one request at a time. IPX reads the filesystem
 * directly and cannot use this fallback, which is why a boot plugin also
 * re-materialises the whole cache up front.
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
 * A miss must NOT be cached. `.webp` is on Cloudflare's default-cacheable
 * extension list, so a cached 404 used to stick for hours — every visitor kept
 * getting the miss long after the file existed, while the uploader's own
 * browser (service-worker copy) still showed it. That is the exact
 * "it works only on my device" symptom this file exists to kill.
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

  const cacheHeaders = (etag: string) => setResponseHeaders(event, {
    'content-type': contentType,
    // Long-lived but not immutable: a photo can be re-uploaded under a new
    // name, but a given name's bytes never change in practice.
    'cache-control': 'public, max-age=2592000',
    etag,
  })

  // Fast path — the disk cache.
  try {
    const stats = await stat(filePath)
    if (stats.isFile()) {
      const etag = `W/"${stats.size}-${stats.mtimeMs}"`
      cacheHeaders(etag)
      setResponseHeader(event, 'content-length', String(stats.size))
      if (getRequestHeader(event, 'if-none-match') === etag) {
        setResponseStatus(event, 304)
        return null
      }
      return sendStream(event, createReadStream(filePath))
    }
  } catch { /* fall through to the database */ }

  // Miss — the durable copy in Postgres.
  const image = await getProductImage(basename(filePath))
  if (!image) {
    throw notFound(event)
  }

  // Re-cache for IPX and the next request; failure here only costs another DB
  // read, never the response.
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, image.data)
  } catch { /* disk may be read-only or full; the DB keeps serving */ }

  cacheHeaders(`W/"db-${image.data.length}"`)
  setResponseHeader(event, 'content-length', String(image.data.length))
  return image.data
})
