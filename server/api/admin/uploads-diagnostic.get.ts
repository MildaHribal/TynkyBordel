import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { db } from '~~/server/utils/db'
import { products, productImages } from '~~/server/database/schema'
import { requireAdmin } from '~~/server/utils/session'
import { UPLOADS_ROOT } from '~~/server/utils/uploads'

/**
 * Answers "where does this product image actually live?" from inside the
 * running container: on disk (the IPX cache), in Postgres (the durable copy),
 * both, or neither.
 *
 * This endpoint is how the original loss was diagnosed — it proved the repo's
 * files were on disk while the admin's upload was gone, i.e. the persistence
 * volume was not mounted. Now that Postgres is the source of truth, `inDb` is
 * the column that matters: a product whose image is in the DB will heal onto
 * disk by itself; one that is nowhere needs a re-upload.
 *
 * Admin-only, read-only.
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

  const dbRows = await db.select({ fileName: productImages.fileName, size: productImages.size }).from(productImages)
  const inDbSet = new Set(dbRows.map(r => r.fileName))

  const rows = await db.select({ id: products.id, name: products.name, image: products.image }).from(products)

  const referenced = await Promise.all(rows.map(async (row) => {
    const url = row.image ?? ''
    const file = url.split('/').pop() ?? ''
    let onDiskFile = false
    let size: number | null = null
    if (file) {
      try {
        const s = await stat(resolve(productsDir, file))
        onDiskFile = s.isFile()
        size = s.size
      } catch { /* missing from cache */ }
    }
    return {
      id: row.id,
      name: row.name,
      url,
      onDisk: onDiskFile,
      inDb: inDbSet.has(file),
      // Healthy = at least the durable copy exists. Disk-only survives until
      // the next deploy; DB-only self-heals onto disk.
      ok: inDbSet.has(file) || onDiskFile,
      size,
    }
  }))

  const broken = referenced.filter(r => r.url && !r.inDb && !r.onDisk)
  const diskOnly = referenced.filter(r => r.url && !r.inDb && r.onDisk)
  const orphans = onDisk.filter(f => !rows.some(r => (r.image ?? '').endsWith(f)))

  return {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV ?? null,
    uploadsRoot: UPLOADS_ROOT,
    productsDir,
    dirError,
    filesOnDisk: onDisk.length,
    imagesInDb: dbRows.length,
    productsInDb: rows.length,
    products: referenced,
    // Nowhere at all — these need a re-upload, nothing can recover them.
    brokenCount: broken.length,
    broken,
    // On disk but not yet in the DB — the boot reconciler will import these.
    diskOnlyCount: diskOnly.length,
    diskOnly,
    orphanCount: orphans.length,
    orphans,
  }
})
