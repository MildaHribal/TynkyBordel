import { resolve, sep } from 'node:path'

/**
 * Where uploaded product images are CACHED on disk.
 *
 * The word "cached" is load-bearing. The source of truth for uploaded images
 * is the `product_images` table in Postgres (see server/utils/image-store.ts)
 * — the one store on this deployment that demonstrably survives redeploys.
 * Files landed here used to be the only copy, and they kept vanishing in
 * production: the volume that was supposed to persist this directory was not
 * actually mounted in the running container (diagnostics showed freshly built
 * repo files visible — impossible under a volume mask — while the admin's
 * upload was gone). With no VPS access to fix the mount, the design was
 * changed so the disk no longer needs to survive anything.
 *
 * The path deliberately stays inside the public dir: IPX resolves `/_ipx/...`
 * sources against it directly on the filesystem, bypassing our routes, so the
 * resize pipeline only works for files that physically exist here. A boot
 * plugin re-materialises them from Postgres after every deploy.
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
