// nuxt.config.ts
export default defineNuxtConfig({
    compatibilityDate: '2024-07-15',
    devtools: { enabled: process.env.NODE_ENV === 'development' },

    modules: [
        '@nuxt/ui',
        '@pinia/nuxt',
        '@nuxt/icon',
        '@nuxt/image',
        '@nuxtjs/seo',
        '@nuxtjs/robots',
        '@nuxtjs/sitemap',
    ],

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
                prefetch: false,
            }
        },
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
        },
        // Declared explicitly so families referenced via CSS var() (e.g.
        // font-family: var(--psy-display)) are always fetched, with weights/styles
        // pinned to only what the design actually uses.
        families: [
            { name: 'Manrope', provider: 'google', weights: [400, 600, 700] },              // body / UI
            { name: 'Fraunces', provider: 'google', weights: [400, 600], styles: ['normal', 'italic'] }, // serif, italic tagline
            { name: 'Petrona', provider: 'google', weights: [400], styles: ['normal', 'italic'] },       // italic card titles
            { name: 'Gloock', provider: 'google', weights: [400] },                          // display headings
            { name: 'Maname', provider: 'google', weights: [400] },
            { name: 'Bricolage Grotesque', provider: 'google', weights: [600, 700, 800] },   // zine display headings
            { name: 'Space Mono', provider: 'google', weights: [400, 700], styles: ['normal', 'italic'] }, // labels / prices / meta
            { name: 'Berkshire Swash', provider: 'google', weights: [400] },
            { name: 'Caprasimo', provider: 'google', weights: [400] },                       // navbar brand
        ],
    },

    image: {
        provider: 'ipx',
        format: ['webp'],
        quality: 72,
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
        }
    },

    ignore: [
        'docker/**',
    ],

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
        '/': { swr: true },
        '/product/**': { swr: true },
        '/cart': { swr: false },
        '/checkout': { swr: false },
        // Auth-guarded account pages are client-only: the auth middleware only
        // has session state in the browser, so SSR would redirect a logged-in
        // user back to /login on a full page load (same reason /admin is ssr:false).
        '/my-account': { ssr: false },
        '/user': { ssr: false },
        '/user/**': { ssr: false },
        '/admin/**': { ssr: false },
        // Long-lived caching for immutable/content-stable assets (was ~1 min,
        // which Lighthouse flagged — costs repeat-view performance).
        '/hero/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        '/_fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
        // Derived/uploaded images: long but not immutable (a product image can be
        // re-uploaded under the same name), so 30 days is the safe sweet spot.
        '/_ipx/**': { headers: { 'cache-control': 'public, max-age=2592000' } },
        '/uploads/**': { headers: { 'cache-control': 'public, max-age=2592000' } },
    },

    linkChecker: {
        failOnError: false,
    },

})
