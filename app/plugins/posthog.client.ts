import type { PostHog } from 'posthog-js'

/**
 * PostHog product analytics (client-side).
 *
 * Two gates before anything loads:
 *   1. NUXT_PUBLIC_POSTHOG_KEY must be set (dev machines/previews stay silent)
 *   2. the visitor must have actively accepted analytics in the cookie banner —
 *      analytics is not strictly necessary, so it needs opt-in consent
 *
 * Pageviews (incl. SPA route changes) and pageleaves are handled automatically
 * by the `defaults` config below.
 *
 * Usage in components:  const { $posthog } = useNuxtApp()
 *                       $posthog()?.capture('add_to_cart', { itemId })
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const key = config.public.posthogKey as string
  const host = (config.public.posthogHost as string) || 'https://eu.i.posthog.com'

  if (!key) return

  const { analyticsAllowed } = useCookieConsent()

  let client: PostHog | undefined

  const start = async () => {
    if (client) return
    const { default: posthog } = await import('posthog-js')
    client = posthog.init(key, {
      api_host: host,
      defaults: '2025-05-24',
      person_profiles: 'identified_only',
      // Session Replay privacy. Recording still has to be switched on in
      // PostHog → Settings → Session Replay ("Record user sessions"); this
      // block only controls WHAT gets masked once it is on.
      //   - maskAllInputs: every form field value (name, email, address, phone
      //     in checkout) is masked — Stripe card fields live in an iframe and are
      //     never captured anyway.
      //   - add `data-ph-mask` to any RENDERED text element (order summary,
      //     account details) to mask personal data that isn't in an <input>.
      //   - add `ph-no-capture` class to fully block an element from recording.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask]',
      },
      loaded: (ph) => {
        if (import.meta.dev) ph.debug()
      },
    })
  }

  // Defer init until the browser is idle so analytics/session-replay never
  // competes with hydration or the first paint (keeps page load snappy).
  const startWhenIdle = () => {
    if (typeof (window as any).requestIdleCallback === 'function') {
      ;(window as any).requestIdleCallback(start, { timeout: 3000 })
    } else {
      setTimeout(start, 1500)
    }
  }

  // Runs now if consent was already given on an earlier visit, and again the
  // moment it's granted in the banner — so accepting takes effect immediately
  // instead of on the next page load. Declining never calls start() at all,
  // so the PostHog script is never even loaded.
  watch(analyticsAllowed, (allowed) => {
    if (allowed) startWhenIdle()
  }, { immediate: true })

  return {
    provide: {
      // Callers use $posthog()?.capture(...) — null until init finishes, which
      // is fine for fire-and-forget analytics right after load.
      posthog: () => client,
    },
  }
})
