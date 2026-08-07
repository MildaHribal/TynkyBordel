import { computed, onBeforeUnmount, onMounted } from 'vue'

/**
 * Světlý / tmavý režim výlohy.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ARCHITEKTURA — proč to nebliká a proč to nemůže rozbít hydrataci
 * ──────────────────────────────────────────────────────────────────────────
 * Vlastní přepínání barev je čistě CSS: `assets/css/main.css` definuje celou
 * paletu přes `light-dark()` a `color-scheme: light dark`. Prohlížeč tedy zná
 * správné téma UŽ PŘI PRVNÍM VYKRESLENÍ, ještě než se stáhne jakýkoli JS —
 * návštěvník s tmavým systémem nikdy nezahlédne světlou verzi.
 *
 * JS má na starosti jen dvě věci:
 *   1) uloženou VÝJIMKU (uživatel klikl na přepínač a chce jiné téma, než má
 *      systém) — zapíše `data-theme` na <html>, viz plugins/theme.client.ts,
 *   2) stav pro `aria-pressed` / `aria-label` tlačítka.
 *
 * Server ani jednou nevykreslí nic, co by na tématu záviselo:
 *   • `data-theme` sedí na <html>, což Vue vůbec nerenderuje (a unhead sahá
 *     jen na atributy, které samo zapsalo — `lang`),
 *   • Vue stav startuje na 'light' na serveru i při první klientské renderu
 *     (čte se z payloadu), skutečná hodnota se dosadí až v onMounted, tedy
 *     PO hydrataci. Žádný mismatch.
 *
 * Ikona slunce/měsíce se také neřídí Vue stavem, ale CSS proměnnou
 * `--tb-dark` (0/1). Proto je v prvním snímku rovnou správná a nepřehraje
 * si při načtení stránky nechtěnou animaci.
 */

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'tb-theme'

/** Explicitní volba uživatele, nebo null = „řiď se systémem". */
export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    // Safari v privátním režimu / zakázané cookies — prostě jedeme podle systému.
    return null
  }
}

function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* neukládá se — přepínač bude fungovat, jen se nezapamatuje */
  }
}

export function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Téma, které je právě na stránce vidět. */
export function resolvedTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  return systemTheme()
}

/**
 * Zapíše volbu do DOM. `null` atribut odstraní, čímž se stránka vrátí zpět pod
 * `@media (prefers-color-scheme)` — tedy zpět „podle systému".
 */
export function applyTheme(theme: Theme | null) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (theme) el.setAttribute('data-theme', theme)
  else el.removeAttribute('data-theme')
}

/**
 * Barva lišty prohlížeče na mobilu. Meta tag vlastní nuxt.config / app.vue,
 * takže ho tu jen dolaďujeme — když ho unhead někdy přepíše zpátky, je to
 * čistě kosmetická vada, nic se nerozbije.
 */
const THEME_COLOR: Record<Theme, string> = { light: '#F0E7D2', dark: '#1B1129' }

export function syncThemeColorMeta(theme: Theme) {
  if (typeof document === 'undefined') return
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  tags.forEach((t) => {
    // Varianty s `media` si řídí prohlížeč sám, těch se nedotýkáme.
    if (!t.hasAttribute('media')) t.setAttribute('content', THEME_COLOR[theme])
  })
}

/**
 * Voláno z pluginu ještě před hydratací: dosadí uloženou výjimku.
 * Pokud uživatel nic nezvolil, neudělá nic — o zbytek se postará CSS.
 */
export function applyStoredTheme() {
  const stored = readStoredTheme()
  if (stored) applyTheme(stored)
}

export function useTheme() {
  // Deterministický start: 'light' na serveru i v prvním klientském renderu.
  // Skutečnou hodnotu dosadíme až po hydrataci (viz onMounted níž).
  const theme = useState<Theme>('tb-theme', () => 'light')
  const isDark = computed(() => theme.value === 'dark')

  const label = computed(() =>
    isDark.value ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim',
  )

  function toggle() {
    const next: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    writeStoredTheme(next)
    syncThemeColorMeta(next)
    theme.value = next
  }

  if (import.meta.client) {
    let mq: MediaQueryList | null = null
    const onSystemChange = () => {
      // Systém posunul preferenci. Když uživatel nemá vlastní volbu, CSS už
      // stránku přebarvilo samo — my jen dorovnáme stav pro čtečky.
      if (readStoredTheme()) return
      theme.value = systemTheme()
      syncThemeColorMeta(theme.value)
    }

    onMounted(() => {
      // AŽ TEĎ — po hydrataci. Kdyby se to stalo dřív, lišila by se serverová
      // a klientská renderovací pass a Vue by hlásilo mismatch.
      theme.value = resolvedTheme()
      syncThemeColorMeta(theme.value)

      if (window.matchMedia) {
        mq = window.matchMedia('(prefers-color-scheme: dark)')
        mq.addEventListener('change', onSystemChange)
      }
    })

    onBeforeUnmount(() => {
      mq?.removeEventListener('change', onSystemChange)
    })
  }

  return { theme, isDark, label, toggle }
}
