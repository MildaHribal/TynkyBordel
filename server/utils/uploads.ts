import { resolve, sep } from 'node:path'

/**
 * Where uploaded product images live on disk.
 *
 * The path differs by mode because different things serve static files:
 *   dev  — Nuxt/Vite serves the project's `public/` straight off disk
 *   prod — Nitro serves `.output/public/`, and docker-compose mounts the
 *          persistent `uploads` volume at `/app/.output/public/uploads`
 *
 * Both the write path (server/api/admin/upload.post.ts) and the read path
 * (server/routes/uploads/[...path].get.ts) resolve through here so they can
 * never disagree about where a file went.
 */
export const UPLOADS_ROOT = resolve(
  process.cwd(),
  process.env.NODE_ENV === 'production' ? '.output/public/uploads' : 'public/uploads',
)

/**
 * Resolve a request path like `products/abc.webp` to an absolute path inside
 * UPLOADS_ROOT, or null if it escapes it.
 *
 * Returning null rather than throwing keeps the caller's 404 path simple, and
 * the containment check is done on the RESOLVED path (not by string-matching
 * the input for "..") because encodings, symlinks and backslashes all defeat
 * naive filtering.
 */
export function resolveUploadPath(relative: string): string | null {
  if (!relative) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(relative)
  } catch {
    return null // malformed percent-encoding
  }

  // A NUL byte can truncate the path inside some syscalls.
  if (decoded.includes('\0')) return null

  const absolute = resolve(UPLOADS_ROOT, decoded)
  if (absolute !== UPLOADS_ROOT && !absolute.startsWith(UPLOADS_ROOT + sep)) {
    return null
  }
  return absolute
}
