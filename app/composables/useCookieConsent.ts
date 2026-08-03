import { ref } from 'vue'

/**
 * Cookie/analytics consent.
 *
 * Analytics (PostHog, incl. session replay) is NOT strictly necessary for the
 * shop to work, so under § 89 of the Czech Electronic Communications Act it
 * needs opt-in consent — it must stay off until the visitor actively agrees.
 * Nothing here gates the functional storage the shop can't run without
 * (cart contents, login session); those need no consent.
 *
 * State lives in localStorage rather than a cookie so that declining doesn't
 * itself set a tracking-shaped cookie.
 */

export type ConsentChoice = 'accepted' | 'rejected'

// Bump when the set of tools we ask about changes — visitors are asked again.
const STORAGE_KEY = 'tynky-cookie-consent-v1'

// Module-level so every component shares one source of truth (same pattern as
// useAuth). `null` = not decided yet.
const choice = ref<ConsentChoice | null>(null)
const isLoaded = ref(false)

function load() {
  if (isLoaded.value || !import.meta.client) return
  isLoaded.value = true
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'accepted' || stored === 'rejected') choice.value = stored
  } catch {
    // Private mode / storage disabled — treat as "not decided", ask again.
  }
}

function persist(value: ConsentChoice) {
  choice.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Can't remember the choice; honour it for this page view at least.
  }
}

export function useCookieConsent() {
  load()

  return {
    /** 'accepted' | 'rejected' | null (undecided — show the banner) */
    choice,
    /** True only after an explicit yes. Analytics must check this. */
    analyticsAllowed: computed(() => choice.value === 'accepted'),
    /** Banner visibility. */
    needsDecision: computed(() => import.meta.client && isLoaded.value && choice.value === null),
    accept: () => persist('accepted'),
    reject: () => persist('rejected'),
    /** Lets the privacy page offer "change my mind". */
    reset: () => {
      choice.value = null
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* nothing to clear */
      }
    },
  }
}
