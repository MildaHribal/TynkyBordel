// nuxt.config.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// Which webfonts to <link rel="preload">. Written by scripts/build-fonts.py
// alongside the .woff2 files themselves, so the content-hashed filenames here
// can never drift out of sync with what assets/css/fonts.css references.
const fontManifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('./public/fonts/manifest.json', import.meta.url)), 'utf8'),
) as { preload: string[] }

export default defineNuxtConfig({
    compatibilityDate: '2024-07-15',
    devtools: { enabled: process.env.NODE_ENV === 'development' },

    modules: [
        '@pinia/nuxt',
        '@nuxt/icon',
        '@nuxt/image',
        '@nuxtjs/seo',
        '@nuxtjs/robots',
        '@nuxtjs/sitemap',
    ],

    // Tailwind is wired straight into Vite rather than coming in via @nuxt/ui.
    // @nuxt/ui was pulling ~200 KB of component CSS into the entry chunk to
    // provide exactly one thing the app used — the <UApp> wrapper — so it was
    // removed and Tailwind kept on its own.
    vite: {
        plugins: [tailwindcss()],
    },

    features: { inlineStyles: true },

    // @nuxt/icon: bundle every icon the source references straight into the
    // CLIENT JS. Without this, the client @nuxt/icon runtime fetches icon data
    // from /api/_nuxt_icon/*.json on demand after hydration — and on production
    // that fetch fails (Cloudflare in front + `/api/**` is `no-store`), so the
    // hydrated page throws away the correct SSR glyphs and shows the loading
    // placeholder instead (the "broken flower" shape). `scan: true` greps the
    // source for `collection:name` string literals — which covers the ternary
    // and object-driven `:name` bindings too, since those names are literals in
    // the source — so the icons ship in the bundle and never need a runtime call.
    icon: {
        clientBundle: {
            scan: true,
            sizeLimitKb: 1024,
        },
    },

    app: {
        head: {
            htmlAttrs: { lang: 'cs' },
            titleTemplate: '%s · Tynky Bordel',
            meta: [
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { name: 'theme-color', content: '#faf5ef' },
                { name: 'description', content: 'Tynky Bordel — ručně dělané originály: obrazy, sochy, klíčenky. Každý kousek je unikát.' },
                { name: 'robots', content: 'index,follow,max-image-preview:large' },
            ],
            // Anti-FOUC for the theme toggle. The palette itself is pure CSS
            // (`light-dark()` + `color-scheme`), so a visitor who just follows
            // their OS is already correct in the first painted frame with no JS
            // at all. The exception is someone who picked the OPPOSITE of their
            // system in the toggle: that choice lives in localStorage, and until
            // now it was applied by a Nuxt plugin — which cannot run before the
            // JS bundle has loaded and executed. So a dark-system visitor who
            // chose light watched the page paint dark and then snap to light on
            // every single reload.
            //
            // This has to be a blocking, non-deferred inline script in <head>:
            // it must execute before the first paint, and it must not be a
            // module (modules are implicitly deferred). It only sets an
            // attribute on <html>, which Vue never renders, so it cannot cause
            // a hydration mismatch. Keep the storage key in sync with
            // THEME_STORAGE_KEY in app/composables/useTheme.ts.
            script: [
                {
                    tagPosition: 'head',
                    tagPriority: 'critical',
                    innerHTML:
                        `try{var t=localStorage.getItem('tb-theme');` +
                        `if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
                },
            ],
            // Preload the three faces painted above the fold (hero display,
            // body, price/label mono). These have to be real <link> tags in the
            // document head: a font referenced only from a stylesheet isn't
            // requested until that stylesheet has been fetched AND the element
            // using it has been matched, which costs a whole round trip on the
            // critical path. `crossorigin` is mandatory even same-origin —
            // fonts are always fetched in CORS mode, and without it the browser
            // downloads the file twice.
            link: fontManifest.preload.map(file => ({
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                href: `/fonts/${file}`,
                crossorigin: 'anonymous',
            })),
        },
        // Page transitions removed entirely: the fade (and the View Transitions
        // before it) fought with lazy content + scroll restoration and read as
        // janky. Instant swaps feel snappier and let scroll/image restore cleanly.
        pageTransition: false,
        layoutTransition: false,
        viewTransition: false,
    },

    experimental: {
        defaults: {
            nuxtLink: {
                // Prefetch on hover/focus, NOT visibility — with 40 product tiles
                // on the homepage, visibility-based prefetch fires dozens of
                // requests that compete with the LCP image for bandwidth.
                prefetchOn: { interaction: true, visibility: false },
            }
        },
        // Split the payload into a separate cacheable file (and let the SW cache
        // it) so repeat/back navigations don't re-embed data in the HTML.
        payloadExtraction: true,
        restoreState: true,
        viewTransition: false,
    },

    router: {
        options: {
            scrollBehaviorType: 'smooth'
        }
    },

    runtimeConfig: {
        stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '',
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        packetaApiSecret: process.env.NUXT_PACKETA_API_SECRET || process.env.PACKETA_API_SECRET || '',
        public: {
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
            stripePublishableKey: process.env.NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
            packetaApiKey: process.env.NUXT_PUBLIC_PACKETA_API_KEY || '',
            posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY || '',
            posthogHost: process.env.NUXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
            // Public client id loads the PayPal JS SDK in the browser (safe to expose).
            paypalClientId: process.env.NUXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '',
            paypalEnv: process.env.PAYPAL_ENV || 'sandbox',
        }
    },

    site: {
        url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        name: 'Tynky Bordel',
        description: 'Ručně dělané originály — obrazy, sochy, klíčenky. Každý kousek je unikát.',
        defaultLocale: 'cs',
    },

    robots: {
        disallow: ['/admin', '/user'],
    },

    // fonts.css FIRST: it carries the @font-face rules (generated by
    // scripts/build-fonts.py) that main.css's --font-* tokens refer to. It was
    // missing here, so the build shipped zero @font-face rules — the preloaded
    // .woff2 files were downloaded on every page load and then never used, and
    // every heading fell back to Arial Black.
    css: ['~~/assets/css/fonts.css', '~~/assets/css/main.css', '~~/assets/css/zine.css'],

    // NOTE: there is no `fonts:` block here on purpose. @nuxt/fonts was removed
    // (it injected 151 @font-face rules / 93 KB of render-blocking CSS for 7
    // Google families). Fonts are now hand-subset .woff2 files in public/fonts,
    // declared in assets/css/fonts.css and preloaded from the manifest above.

    image: {
        provider: 'ipx',
        // WebP only, deliberately. AVIF is normally the smaller format, but ONLY
        // when it is encoded from an original. Every source here is already a
        // lossy WebP (the hero art and every admin upload are converted on the
        // way in), so IPX would be re-encoding lossy→lossy — and measured on
        // this machine that is 21× slower AND 56% BIGGER:
        //
        //   polaroid-1 @1024   webp  121 ms / 134 KB    avif 2962 ms / 197 KB
        //   tynka      @ 640   webp   45 ms /  56 KB    avif 1284 ms /  94 KB
        //   product    @ 320   webp   12 ms / 2.6 KB    avif  115 ms / 4.0 KB
        //
        // Because <picture> asks for AVIF first, every uncached variant on a
        // page cost a second or more of sharp CPU, and they queue behind each
        // other — which is exactly why a hard refresh crawled.
        format: ['webp'],
        // Every quality value in the app was nudged by +1 (78→79, 80→81, 72→73,
        // 74→75, 85→86, and the hero preset 82→83) as a deliberate cache-bust.
        // The broken `cache:` route rule below had already poisoned Cloudflare
        // and every visitor's service-worker cache with JSON-instead-of-image
        // bytes, and those caches key on the URL — which contains the quality.
        // Changing it retires every poisoned key without needing a Cloudflare
        // purge. The visual difference at ±1 quality is nil.
        quality: 79,
        // Serve 1x — avoids shipping 2× pixels to retina phones (big byte saving,
        // negligible visual difference for these photos). Bumps the perf score.
        densities: [1],
        domains: ['picsum.photos', 'fastly.picsum.photos'],
        screens: {
            xs: 320,
            sm: 640,
            md: 768,
            lg: 1024,
            xl: 1280,
            xxl: 1536,
        },
        presets: {
            thumb: { modifiers: { width: 360, height: 360, fit: 'cover' } },
            hero:  { modifiers: { width: 1400, quality: 83 } },
        },
        // IPX maxAge: assets are content-hashed, so cache for 1 year. The default
        // 60s means the server re-encodes the same image on every request after
        // expiry and the first visitor waits on sharp.
        ipx: { maxAge: 60 * 60 * 24 * 365 },
    },

    ignore: [
        'docker/**',
    ],

    // Ship client source maps. They cost nothing on a normal page load (the
    // browser only fetches a .map when devtools is open) and they're what makes
    // a production stack trace readable — Lighthouse flags their absence too.
    // The repo is public, so this exposes nothing that isn't already on GitHub.
    sourcemap: { client: true, server: true },

    nitro: {
        // Archived invoice PDFs. Without an explicit mount `useStorage()` falls
        // back to Nitro's in-memory driver, and the archive would evaporate on
        // every container restart — which defeats the whole point of archiving
        // rather than re-rendering. Deliberately NOT the `uploads` volume: that
        // one is served publicly at /uploads/**, and accounting documents carry
        // customer names and addresses.
        storage: {
            invoices: { driver: 'fs', base: '/app/.data/invoices' },
        },
        devStorage: {
            invoices: { driver: 'fs', base: './.data/invoices' },
        },
        compressPublicAssets: { gzip: true, brotli: true },
        minify: true,
        /*alias: {
            debug: fileURLToPath(new URL("./server/mocks/debug.ts", import.meta.url)),
            typeorm: fileURLToPath(new URL("./server/mocks/typeorm.ts", import.meta.url)),
        },*/
        // No build-time prerendering: this is a DB-driven storefront and the
        // database is NOT available during the Docker build, so prerendering
        // `/` (and crawlLinks-reachable pages) baked a 500 error page into the
        // static output. Pages are rendered on-demand at runtime instead and
        // cached via the `swr` routeRules below, where the DB IS available.
    },

    routeRules: {
        // API responses must NEVER be cached at the CDN edge. Caching
        // /api/auth/get-session in particular breaks login: Cloudflare would
        // serve a stale "logged-out" session to an authenticated visitor
        // (observed as cf-cache-status: HIT on get-session). no-store tells
        // Cloudflare + browsers not to cache any API response.
        '/api/**': { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },

        // ── Page rendering strategies ──
        // Content changes rarely — use SWR with explicit durations so stale
        // pages are served instantly and revalidated in the background.
        '/':               { swr: 3600 },                       // homepage, 1 hour
        '/product/**':      { swr: 3600 },                       // product detail, 1 hour
        // Static legal pages: content almost never changes, cache for 24 hours.
        '/obchodni-podminky':      { swr: 86400 },
        '/ochrana-osobnich-udaju':  { swr: 86400 },
        '/reklamace':               { swr: 86400 },
        '/kontakt':                 { swr: 86400 },
        // Cart/checkout are user-specific — no SSR, no caching.
        '/cart':            { ssr: false },
        '/checkout':        { ssr: false },
        // Auth-guarded account pages are client-only: the auth middleware only
        // has session state in the browser, so SSR would redirect a logged-in
        // user back to /login on a full page load (same reason /admin is ssr:false).
        '/my-account':      { ssr: false },
        '/user':            { ssr: false },
        '/user/**':         { ssr: false },
        '/admin/**':        { ssr: false },

        // ── Asset caching ──
        // Long-lived caching for immutable/content-stable assets.
        // NOTE: /hero/** is NOT here — it is declared further down with a 7-day
        // TTL. These filenames carry no content hash, so `immutable` would be a
        // lie: re-shooting the art under the same name could never reach anyone
        // who had already visited. This key used to be duplicated, and the
        // later one silently won.
        '/_fonts/**':   { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        '/_nuxt/**':    { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        // Derived images: long-lived but NOT immutable (a product image can be
        // re-uploaded under the same name), so 30 days is the safe sweet spot.
        //
        // ⚠️ NEVER put `cache: {...}` on this route. Nitro's response cache
        // serialises the handler's return value as JSON, and IPX returns a
        // Buffer. A Buffer JSON-serialises to {"type":"Buffer","data":[82,73,…]},
        // so the FIRST request (cache miss) returned a real image while every
        // request after it (cache hit) returned that JSON text — still labelled
        // `content-type: image/webp`. Browsers cannot decode it, so every photo
        // on the site vanished on the second page load, and Cloudflare then
        // cached the broken bytes for everyone. Verified on production: the
        // 600×600 tynka variant came back as 204337 bytes of JSON whose `data`
        // array decodes to the correct 57160-byte WebP.
        //
        // Caching happens in the browser and at Cloudflare via the header below
        // instead. That is also cheap now: IPX only emits WebP (AVIF was dropped
        // — see the `image` block), so a cold variant costs 12–120 ms of sharp,
        // not the 1.2–3.0 s AVIF used to.
        '/_ipx/**': {
            headers: { 'cache-control': 'public, max-age=2592000, stale-while-revalidate=86400' },
        },
        '/uploads/**':  { headers: { 'cache-control': 'public, max-age=2592000' } },
        // The service workers are the mechanism that evicts every other stale
        // cache, so they must never be stale themselves. Without this a browser
        // may hold /sw.js for up to 24 h, which is exactly how long a bad asset
        // cache would have outlived its own fix.
        '/sw.js':        { headers: { 'cache-control': 'no-cache' } },
        '/admin-sw.js':  { headers: { 'cache-control': 'no-cache' } },
        // Self-hosted fonts carry a content hash in the filename (see
        // scripts/build-fonts.py), so a given URL's bytes can never change —
        // that is exactly what `immutable` is for. They were being served with
        // no cache-control at all and fell back to an 8 h heuristic TTL, which
        // made repeat visitors re-validate the whole typographic system.
        '/fonts/**':    { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        // Brand art and PWA icons: long-lived but not content-hashed, so allow
        // revalidation rather than promising immutability.
        '/hero/**':     { headers: { 'cache-control': 'public, max-age=604800' } },
        '/pwa/**':      { headers: { 'cache-control': 'public, max-age=604800' } },
        '/logo.webp':   { headers: { 'cache-control': 'public, max-age=604800' } },
    },

    linkChecker: {
        failOnError: false,
    },

})
