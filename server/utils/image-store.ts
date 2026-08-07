import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { productImages } from '../database/schema'
import { UPLOADS_ROOT } from './uploads'

/**
 * Product image storage: Postgres is the source of truth, disk is a cache.
 *
 * Every function here treats a disk failure as survivable and a DB failure as
 * the real error, because that is the durability order on this deployment —
 * the database has never lost a row across a redeploy, while the uploads
 * directory demonstrably has (its volume was not mounted, and there is no VPS
 * access to fix that from here).
 */

const PRODUCTS_DIR = () => resolve(UPLOADS_ROOT, 'products')

/** Persist an encoded image: DB first (durability), then disk (IPX cache). */
export async function saveProductImage(fileName: string, data: Buffer, contentType: string): Promise<void> {
  // The DB write is the one that must succeed — if it throws, the upload
  // failed, full stop. A stale row with the same name cannot exist (names are
  // timestamp+random), but harden with an upsert anyway.
  await db.insert(productImages)
    .values({ fileName, data, contentType, size: data.length })
    .onConflictDoUpdate({ target: productImages.fileName, set: { data, contentType, size: data.length } })

  // Disk is best-effort: if this write fails the serving route falls back to
  // the DB and re-caches, and the boot hydrator repairs the rest.
  try {
    const dir = PRODUCTS_DIR()
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, fileName), data)
  } catch (err) {
    console.error(`[images] disk cache write failed for ${fileName} (serving falls back to DB):`, err)
  }
}

/** Fetch one image from the DB, or null. `fileName` must be a bare name. */
export async function getProductImage(fileName: string): Promise<{ data: Buffer, contentType: string } | null> {
  const name = basename(fileName)
  const [row] = await db.select().from(productImages).where(eq(productImages.fileName, name)).limit(1)
  if (!row) return null
  // postgres.js returns bytea as Buffer already; Buffer.from is a cheap no-op
  // guard in case a driver change ever hands back a Uint8Array.
  return { data: Buffer.from(row.data), contentType: row.contentType }
}

/**
 * Reconcile disk and DB on boot.
 *
 * DB → disk: after a deploy the public dir is brand new, so every image in the
 * table is written back out for IPX to find.
 * Disk → DB: files present on disk but unknown to the table (repo-shipped
 * images, or uploads that predate the table) are imported, so from this boot
 * onward they are deploy-proof too.
 */
export async function reconcileImageStore(): Promise<{ hydrated: number, imported: number }> {
  const dir = PRODUCTS_DIR()
  await mkdir(dir, { recursive: true })

  const rows = await db.select({ fileName: productImages.fileName, size: productImages.size }).from(productImages)
  const inDb = new Set(rows.map(r => r.fileName))

  let hydrated = 0
  for (const row of rows) {
    const target = join(dir, row.fileName)
    let needs = true
    try {
      const s = await stat(target)
      needs = !s.isFile() || s.size !== row.size
    } catch { /* missing */ }
    if (!needs) continue
    const img = await getProductImage(row.fileName)
    if (img) {
      await writeFile(target, img.data)
      hydrated++
    }
  }

  let imported = 0
  if (existsSync(dir)) {
    for (const name of await readdir(dir)) {
      if (inDb.has(name)) continue
      if (!/\.(webp|jpe?g|png|gif|avif)$/i.test(name)) continue
      try {
        const data = await readFile(join(dir, name))
        // 12 MB mirrors the upload endpoint's own cap; anything larger in this
        // directory did not come from the upload pipeline.
        if (data.length === 0 || data.length > 12 * 1024 * 1024) continue
        const ext = name.split('.').pop()!.toLowerCase()
        const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        await db.insert(productImages)
          .values({ fileName: name, data, contentType, size: data.length })
          .onConflictDoNothing()
        imported++
      } catch (err) {
        console.error(`[images] import of ${name} failed:`, err)
      }
    }
  }

  return { hydrated, imported }
}
