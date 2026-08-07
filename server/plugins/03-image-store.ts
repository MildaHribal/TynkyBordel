import { reconcileImageStore } from '~~/server/utils/image-store'

/**
 * Rebuild the on-disk image cache from Postgres on every boot.
 *
 * A deploy replaces `.output` wholesale, and with it the public uploads
 * directory that IPX reads from. The images themselves live in the
 * `product_images` table, so this walks the table and writes every file back
 * out — and imports any disk file the table doesn't know yet (repo-shipped
 * images, pre-migration uploads), making those deploy-proof too.
 *
 * Runs detached with retries rather than awaiting in plugin order:
 * 01-run-migrations intentionally doesn't block boot, so on the very first
 * start the `product_images` table may not exist yet when this fires (observed
 * as a 42P01 on the initial query). Waiting a few seconds and trying again
 * covers that window; requests that arrive meanwhile are served by the
 * /uploads route's own DB fallback.
 *
 * Must never stop the app from starting: a missing thumbnail is an
 * inconvenience, a shop that won't boot is an outage.
 */
export default defineNitroPlugin(() => {
  const attempt = async (retriesLeft: number, delayMs: number): Promise<void> => {
    try {
      const { hydrated, imported } = await reconcileImageStore()
      if (hydrated || imported) {
        console.log(`[images] cache rebuilt: ${hydrated} written from DB, ${imported} imported into DB`)
      }
    } catch (err) {
      if (retriesLeft > 0) {
        setTimeout(() => attempt(retriesLeft - 1, Math.min(delayMs * 2, 15_000)), delayMs)
      } else {
        console.error('[images] reconcile failed (app continues):', err)
      }
    }
  }
  // ~6 attempts across ~30s — comfortably past the boot migration.
  void attempt(6, 1000)
})
