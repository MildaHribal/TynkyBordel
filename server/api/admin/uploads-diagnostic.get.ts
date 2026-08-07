import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { db } from '~~/server/utils/db'
import { products } from '~~/server/database/schema'
import { requireAdmin } from '~~/server/utils/session'
import { UPLOADS_ROOT } from '~~/server/utils/uploads'

/**
 * Answers "is the file actually on disk?" for product images, from inside the
 * running container.
 *
 * Uploaded images went missing in production while working fine locally, and
 * there was no way to tell WHICH link in the chain was broken — the write, the
 * volume mount, or the read path. Guessing from the outside is how you burn an
 * afternoon; this reports the resolved directory, what is in it, and which rows
 * in `products` point at files that do not exist.
 *
 * Admin-only, read-only, and it deliberately reports the resolved absolute path
 * so a wrong working directory or an unmounted volume is visible immediately.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const productsDir = resolve(UPLOADS_ROOT, 'products')

  let onDisk: string[] = []
  let dirError: string | null = null
  try {
    onDisk = await readdir(productsDir)
  } catch (err: any) {
    dirError = `${err.code ?? 'ERR'}: ${err.message}`
  }

  const rows = await db.select({ id: products.id, name: products.name, image: products.image }).from(products)

  const referenced = await Promise.all(rows.map(async (row) => {
    const url = row.image ?? ''
    const file = url.split('/').pop() ?? ''
    let exists = false
    let size: number | null = null
    if (file) {
      try {
        const s = await stat(resolve(productsDir, file))
        exists = s.isFile()
        size = s.size
      } catch { /* missing — that is the finding */ }
    }
    return { id: row.id, name: row.name, url, exists, size }
  }))

  const missing = referenced.filter(r => r.url && !r.exists)
  // Files on disk nothing points at — these are what a delete leaves behind.
  const orphans = onDisk.filter(f => !rows.some(r => (r.image ?? '').endsWith(f)))

  return {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV ?? null,
    uploadsRoot: UPLOADS_ROOT,
    productsDir,
    dirError,
    filesOnDisk: onDisk.length,
    productsInDb: rows.length,
    missingCount: missing.length,
    missing,
    orphanCount: orphans.length,
    orphans,
  }
})
