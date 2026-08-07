type FlyDirection = 'up' | 'down' | 'left' | 'right' | 'zoom'

interface FlyOptions {
  direction?: FlyDirection
  delay?: number
  duration?: number
  distance?: number
  once?: boolean
  threshold?: number
  rootMargin?: string
}

const DIRECTION_CLASSES = ['fly-in--up', 'fly-in--down', 'fly-in--left', 'fly-in--right', 'fly-in--zoom'] as const
const FLY_OPTIONS_KEY = Symbol('fly-options')

type FlyElement = HTMLElement & {
  [FLY_OPTIONS_KEY]?: ReturnType<typeof normalizeOptions>
}

// Singleton observer to reduce memory and CPU overhead
let sharedObserver: IntersectionObserver | null = null

/**
 * Promote an element to its own compositor layer for the duration of the
 * reveal, then let it go.
 *
 * `will-change: opacity, transform` used to be declared statically in the
 * .fly-in CSS rule. That pins a layer — and its GPU memory — for every
 * revealed element for as long as the page lives, which on a 40-tile grid is a
 * lot of retained memory for an animation that plays once. Setting it just
 * before the transition and clearing it on transitionend gets the same
 * smoothness at the cost of only the elements currently animating.
 */
const reveal = (el: FlyElement) => {
  el.style.willChange = 'opacity, transform'
  el.classList.add('fly-in--visible')

  const done = (event: TransitionEvent) => {
    // Ignore transitions bubbling up from descendants — only this element's own
    // opacity/transform run signals that the reveal is over.
    if (event.target !== el) return
    el.style.willChange = ''
    el.removeEventListener('transitionend', done)
  }
  el.addEventListener('transitionend', done)
}

const getSharedObserver = (options: { threshold: number, rootMargin: string }) => {
  if (!sharedObserver && typeof window !== 'undefined') {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as FlyElement
            const opts = el[FLY_OPTIONS_KEY]
            reveal(el)
            if (opts?.once) sharedObserver?.unobserve(el)
          } else {
            const el = entry.target as FlyElement
            const opts = el[FLY_OPTIONS_KEY]
            if (opts && !opts.once) el.classList.remove('fly-in--visible')
          }
        }
      },
      {
        threshold: options.threshold,
        rootMargin: options.rootMargin,
      }
    )
  }
  return sharedObserver
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// Singleton state to avoid repeated mediaQuery and classList checks during hydration
let cachedPretest: {
  prefersReducedMotion: boolean;
  isLowEnd: boolean;
  isMidEnd: boolean;
} | null = null

const getPretest = () => {
  if (!cachedPretest && typeof window !== 'undefined') {
    cachedPretest = {
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      isLowEnd: document.documentElement.classList.contains('is-low-end'),
      isMidEnd: document.documentElement.classList.contains('is-mid-end'),
    }
  }
  return cachedPretest
}

const normalizeOptions = (value: FlyDirection | FlyOptions | undefined) => {
  const source = typeof value === 'string' ? { direction: value } : (value ?? {})
  const pre = getPretest()

  return {
    direction: (source.direction ?? 'up') as FlyDirection,
    delay: pre?.isLowEnd ? 0 : clamp(source.delay ?? 0, 0, 2000),
    duration: pre?.isLowEnd ? 200 : pre?.isMidEnd ? 400 : clamp(source.duration ?? 820, 240, 2200),
    distance: pre?.isLowEnd ? 0 : pre?.isMidEnd ? 20 : clamp(source.distance ?? 48, 12, 160),
    once: source.once ?? true,
    threshold: clamp(source.threshold ?? 0.05, 0, 1),
    rootMargin: source.rootMargin ?? '0px 0px 10% 0px',
  }
}

const prepareElement = (el: HTMLElement, options: ReturnType<typeof normalizeOptions>) => {
  el.classList.add('fly-in')
  el.classList.remove('fly-in--visible')
  for (const className of DIRECTION_CLASSES) el.classList.remove(className)
  el.classList.add(`fly-in--${options.direction}`)

  el.style.setProperty('--fly-delay', `${options.delay}ms`)
  el.style.setProperty('--fly-duration', `${options.duration}ms`)
  el.style.setProperty('--fly-distance', `${options.distance}px`)
}

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) cachedPretest = null

  // Registered on the server too, even though every hook below is a client-side
  // no-op. This plugin used to be `fly-in.client.ts`, which meant `v-fly` did
  // not exist during SSR — and Vue's server renderer calls `getSSRProps` on
  // whatever a directive resolves to, so every page using `v-fly` (the product
  // detail, category listings, the carousel) died with
  // "Cannot read properties of undefined (reading 'getSSRProps')" and returned
  // a 500. Registering it universally, with an explicit no-op `getSSRProps`,
  // gives the renderer something valid to call while keeping all the actual
  // DOM work on the client.
  nuxtApp.vueApp.directive('fly', {
    getSSRProps: () => ({}),
    beforeMount(el, binding) {
      if (import.meta.server) return
      const options = normalizeOptions(binding.value as FlyDirection | FlyOptions | undefined)
      const flyElement = el as FlyElement
      flyElement[FLY_OPTIONS_KEY] = options
      prepareElement(flyElement, options)
    },
    mounted(el, binding) {
      if (import.meta.server) return
      const pre = getPretest()
      if (pre?.prefersReducedMotion) {
        el.classList.add('fly-in--visible')
        return
      }
      const flyElement = el as FlyElement
      const options = flyElement[FLY_OPTIONS_KEY] ?? normalizeOptions(binding.value as FlyDirection | FlyOptions | undefined)

      // Already visible on mount (above the fold)? Reveal synchronously — before
      // the browser paints — so there's no hide-then-reveal flicker on load.
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || document.documentElement.clientHeight
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        reveal(flyElement)
        if (options.once) return
      }

      const observer = getSharedObserver({ threshold: options.threshold, rootMargin: options.rootMargin })
      observer?.observe(flyElement)
    },
    unmounted(el) {
      if (import.meta.server) return
      sharedObserver?.unobserve(el)
      el.style.willChange = ''
      delete (el as any)[FLY_OPTIONS_KEY]
    },
  })
})
