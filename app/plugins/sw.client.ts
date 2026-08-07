/**
 * Register the storefront service worker (public/sw.js) so repeat visits load
 * assets from the local cache instantly. Registered after the page has loaded so
 * it never competes with the initial render, and scoped to the whole site.
 *
 * The admin PWA registers its own '/admin-sw.js' at scope '/admin/'; these don't
 * collide (different scopes, different files).
 */
export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[sw] register failed', err))
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
})
