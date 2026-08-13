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

      // ---------------------------------------------------------------------
      // Trimming what gets DOWNLOADED.
      //
      // posthog-js ships a small core and pulls each optional feature from
      // <api_host>/static/*.js at runtime. Whether a chunk is fetched is
      // decided by the remote config (PostHog project settings) UNLESS the
      // matching client option below is set — a client-side boolean always
      // wins, and a `false` means the request is never made at all.
      //
      // The shop only wants pageviews + autocaptured clicks, so everything
      // else stays off. That is ~42 kB gzipped / ~122 kB unparsed of
      // third-party JS the browser no longer downloads on first paint:
      //   surveys.js                  33.6 kB gz   (97 kB raw)
      //   dead-clicks-autocapture.js   6.9 kB gz   (17 kB raw)
      //   web-vitals.js                2.7 kB gz   ( 7 kB raw)
      // Flip any of these back on here (not just in the PostHog UI) if the
      // feature is ever actually wanted.
      // ---------------------------------------------------------------------

      // No surveys are configured and we never want a popup over the shop.
      // Without this, surveys.js is fetched as soon as the project enables
      // them — by far the biggest of the extra chunks.
      disable_surveys: true,

      // Heatmaps/clickmaps aren't used, and they're also what drags in
      // dead-clicks-autocapture.js: the Heatmaps extension always constructs
      // the dead-click capture regardless of the `captureDeadClicks` project
      // setting, so BOTH options below are needed to stop that download.
      capture_heatmaps: false,
      capture_dead_clicks: false,

      // Core Web Vitals are measured with Lighthouse/CrUX, not PostHog.
      // `false` also switches off replay network timing, which is moot with
      // recording off. Stops web-vitals.js (and its legacy polyfills).
      capture_performance: false,

      // No error tracking in this project — keeps exception-autocapture.js
      // (4.7 kB gz) from ever being requested.
      capture_exceptions: false,

      // Product tours and the support-chat widget are not used; both would
      // otherwise fetch their own bundle the moment they're toggled on.
      disable_product_tours: true,
      disable_conversations: true,

      // Session Replay is OFF in the project (verified in the remote config:
      // "sessionRecording": false), so recorder.js — 37 kB gz / 115 kB raw,
      // the heaviest chunk of all — must never be pulled. Stating it here
      // means a stray click in the PostHog UI can't silently start shipping
      // a DOM recorder to every visitor of a shop that sells clothes.
      //
      // To actually enable replay one day: drop `disable_session_recording`,
      // turn recording on in PostHog → Settings → Session Replay, and keep the
      // masking below, which controls WHAT is recorded:
      //   - maskAllInputs: every form field value (name, email, address, phone
      //     in checkout) is masked — Stripe card fields live in an iframe and are
      //     never captured anyway.
      //   - add `data-ph-mask` to any RENDERED text element (order summary,
      //     account details) to mask personal data that isn't in an <input>.
      //   - add `ph-no-capture` class to fully block an element from recording.
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask]',
      },

      // The remote config (/array/<key>/config.js) re-downloads every 5 minutes
      // by default. Every feature it could flip is pinned client-side above, so
      // the refresh can only cost bandwidth — fetch it once per page load.
      remote_config_refresh_interval_ms: 0,

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
