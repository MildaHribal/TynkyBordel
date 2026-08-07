/**
 * Register the storefront service worker (public/sw.js) so repeat visits load
 * assets from the local cache instantly. Registered after the page has loaded so
 * it never competes with the initial render, and scoped to the whole site.
 *
 * The admin PWA registers its own '/admin-sw.js' at scope '/admin/'; these don't
 * collide (different scopes, different files).
 *
 * PRODUCTION ONLY, and that is not a nicety — it is a correctness fix.
 * public/sw.js treats '/_nuxt/' as immutable and serves it CACHE-FIRST, which is
 * correct in production where every chunk URL carries a content hash. In `nuxt
 * dev` there are no hashes: Vite serves modules from stable paths like
 * /_nuxt/app/components/Navbar.vue. A service worker registered on localhost
 * therefore pins the FIRST version of every component it ever saw and keeps
 * serving it after every edit — which looks exactly like "my changes don't show
 * up" or "localhost is more broken than production", with HMR appearing to work
 * until a reload.
 *
 * On dev we additionally tear down any worker a previous run installed and drop
 * its caches, otherwise a browser that registered one before this fix would stay
 * poisoned no matter how many times the dev server restarts.
 */
export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  if (import.meta.dev) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then((results) => {
        if (!results.some(Boolean)) return
        console.info('[sw] dev: unregistered stale service worker(s), clearing caches')
        return caches?.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      })
      .catch((err) => console.warn('[sw] dev cleanup failed', err))
    return
  }

  const register = () => {
    navigator.serviceWorker
      // updateViaCache: 'none' makes the browser revalidate sw.js itself on
      // every check instead of serving it from the HTTP cache. The worker is
      // what evicts stale asset caches on a VERSION bump, so a cached worker
      // means a cache that cannot fix itself.
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[sw] register failed', err))
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
