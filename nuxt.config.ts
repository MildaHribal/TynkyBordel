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

    css: ['~~/assets/css/main.css', '~~/assets/css/zine.css'],

    // Self-host + optimize webfonts (replaces the removed render-blocking Google
    // Fonts @import). Only the weights actually used are fetched, with latin-ext
    // for Czech diacritics and font-display: swap so text never blocks paint.
    fonts: {
        // Default to NORMAL only — italic is added per-family below. This alone
        // halves the payload (previously every family also pulled an italic file
        // it never used). latin-ext is required for Czech diacritics.
        defaults: {
            weights: [400, 600, 700],
            styles: ['normal'],
            subsets: ['latin', 'latin-ext'],
            // Don't preload by default — only the three above-the-fold families
            // below opt in, so we emit a handful of <link rel=preload> not 60+.
            preload: false,
        },
        // Declared explicitly so families referenced via CSS var() (e.g.
        // font-family: var(--psy-display)) are always fetched, with weights/styles
        // pinned to only what the design actually uses. `preload: true` on the
        // three fonts painted above the fold (body, hero heading, price/label
        // mono) emits <link rel="preload"> so they arrive before first paint and
        // the text doesn't flash the fallback.
        families: [
            { name: 'Manrope', provider: 'google', weights: [400, 600, 700], preload: true },  // body / UI — above fold
            { name: 'Fraunces', provider: 'google', weights: [400, 600], styles: ['normal', 'italic'] }, // serif, italic tagline
            { name: 'Petrona', provider: 'google', weights: [400], styles: ['normal', 'italic'] },       // italic card titles
            { name: 'Gloock', provider: 'google', weights: [400] },                          // display headings
            { name: 'Bricolage Grotesque', provider: 'google', weights: [600, 700, 800], preload: true },   // zine hero heading — LCP text
            { name: 'Space Mono', provider: 'google', weights: [400, 700], styles: ['normal', 'italic'] }, // labels / prices / meta
            { name: 'Berkshire Swash', provider: 'google', weights: [400] },                 // navbar brand + nouveau accents
        ],
    },

    image: {
        provider: 'ipx',
        format: ['avif', 'webp'],
        quality: 78,
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
            hero:  { modifiers: { width: 1400, quality: 82 } },
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
        '/hero/**':     { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        '/_fonts/**':   { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        '/_nuxt/**':    { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        // Derived/uploaded images: long but not immutable (a product image can be
        // re-uploaded under the same name), so 30 days is the safe sweet spot.
        '/_ipx/**':     { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/uploads/**':  { headers: { 'cache-control': 'public, max-age=2592000' } },
    },

    linkChecker: {
        failOnError: false,
    },

})
