/**
 * Storefront service worker — makes repeat visits feel instant.
 *
 * Strategy (deliberately conservative, no Workbox):
 *   • Hashed, immutable assets (/_nuxt, /_fonts, /_ipx, /hero, /uploads,
 *     /_payload.json) → CACHE-FIRST. Their URL changes when content changes, so
 *     serving a cached copy forever is safe and means fonts/CSS/JS/images load
 *     from disk with zero network on every subsequent page.
 *   • Page navigations (HTML) → NETWORK-FIRST with cache fallback, so content is
 *     always fresh online and the site still opens when offline.
 *   • Anything under /api/ (esp. /api/auth) → NETWORK-ONLY, never cached — this
 *     is exactly what broke login once (a cached logged-out session).
 *
 * The cache name carries a version; bumping it (or any deploy shipping a new SW)
 * drops every old cache on activate, so stale assets can't pile up.
 */
// Bump on any deploy that changes an asset's *bytes* without changing its URL.
// v5: a `cache: {…}` route rule on /_ipx/** made Nitro JSON-serialise IPX's
// Buffer, so image responses came back as {"type":"Buffer","data":[…]} under an
// image/webp content-type. Because /_ipx/ is on the IMMUTABLE list below, every
// visitor's asset cache stored those broken bytes CACHE-FIRST and would have
// served them forever — the route rule is gone, but only a version bump evicts
// what clients already hold.
// v4: public/ images were recompressed in place (scripts/optimize-images.mjs) and
// /bg/ was removed — v3 clients would otherwise serve the old, larger copies from
// the cache-first asset cache forever.
const VERSION = 'v5'
const ASSET_CACHE = `tynky-assets-${VERSION}`
const PAGE_CACHE = `tynky-pages-${VERSION}`

// URL path prefixes whose responses are safe to cache forever (content-hashed
// or content-stable, long-lived assets).
const IMMUTABLE = ['/_nuxt/', '/_fonts/', '/_ipx/', '/hero/', '/uploads/', '/pwa/']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== ASSET_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

function isImmutable(url) {
  return IMMUTABLE.some((p) => url.pathname.startsWith(p)) ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.endsWith('/_payload.json')
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Only handle our own origin.
  if (url.origin !== self.location.origin) return

  // Never touch API/auth — always straight to network.
  if (url.pathname.startsWith('/api/')) return

  // Cache-first for immutable assets.
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => {})
        }
        return res
      }).catch(() => fetch(req)),
    )
    return
  }

  // Network-first for page navigations, fall back to cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    )
  }
})
