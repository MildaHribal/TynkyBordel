/**
 * Drop the cached catalog after an admin writes to it.
 *
 * The storefront is cached in two independent layers, both an hour long:
 *   - `/api/products` is a `defineCachedEventHandler` (maxAge 3600)
 *   - `/` and `/product/**` are `swr: 3600` route rules, caching rendered HTML
 * so a newly added product could take up to an hour to appear. Both layers live
 * in Nitro's `cache` storage, so both are cleared here.
 *
 * IMPORTANT: this must NOT wipe the whole cache mount. `/_ipx/**` is cached in
 * the same storage, and that cache is the only thing standing between the shop
 * and re-encoding every image with sharp on every request — which is what made
 * product photos take ~a minute to appear. Keys are therefore matched, never
 * flushed wholesale, and `_ipx` is excluded explicitly.
 */

/** Cache keys belonging to the catalog: the products API and the pages that render it. */
function isCatalogKey(key: string): boolean {
  // Nitro namespaces handler caches under `nitro:handlers:` and route-rule
  // (swr/isr) caches under `nitro:routes:`. Normalise separators — the driver
  // reports `:` but some drivers report `/`.
  const k = key.replace(/\//g, ':').toLowerCase()

  // Never touch the image cache, whatever else matches.
  if (k.includes('_ipx')) return false

  // The products endpoint's cached responses.
  if (k.includes('nitro:handlers') && k.includes('products')) return true

  // Rendered HTML for the storefront pages that list products. Anchored on the
  // segment so `/product/**` matches but an unrelated key merely containing the
  // word does not.
  if (k.includes('nitro:routes')) {
    // `:product` covers both /product/** detail pages and the /product index.
    //
    // The homepage is matched on its own `index` segment. It must NOT be
    // anchored to `nitro:routes:index`: Nitro puts its cache base between the
    // group and the name, so the real key is `nitro:routes:_:index.<hash>.json`
    // and that anchored form never matched. The homepage HTML therefore survived
    // every product edit and a full page load kept rendering deleted products
    // for up to an hour, while client-side navigation (which reads the purged
    // /api/products cache) showed the correct catalog — and clicking a
    // no-longer-existing product 404'd.
    //
    // Matching the segment instead of the prefix keeps the fix that made this
    // strict in the first place: `nitro:routes:_:obchodni-podminky.…` has no
    // `index` segment, so the legal pages keep their 24h cache.
    return k.includes(':product') || /(^|:)index(\.|:|$)/.test(k)
  }

  return false
}

export async function invalidateCatalogCache(): Promise<number> {
  try {
    const storage = useStorage('cache')
    const keys = await storage.getKeys()
    const doomed = keys.filter(isCatalogKey)
    await Promise.all(doomed.map(k => storage.removeItem(k, { removeMeta: true })))
    return doomed.length
  } catch (err) {
    // A failed purge must never fail the write that triggered it — the product
    // is already saved; the worst case is the old one-hour delay.
    console.error('[cache] catalog invalidation failed:', err)
    return 0
  }
}

// Exported for the unit test — the matching rules are the whole risk here.
export const __isCatalogKey = isCatalogKey
