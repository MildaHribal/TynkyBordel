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

// Inline every server-rendered component's CSS into the HTML instead of loading
// it over the network. Read as a single constant because TWO settings below have
// to agree on it: `features.inlineStyles` and the `build:manifest` hook that
// strips the now-redundant <link rel="stylesheet"> tags. See both for detail.
const INLINE_STYLES = true

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

        // NOTE: there is deliberately no `build.target` / `esbuild.target` here.
        // Lighthouse's "Legacy JavaScript — 7.4 kB" points at `Math.trunc` and
        // blames a too-low transpile target, but that was measured and is wrong
        // for this app:
        //
        //   • Vite 7's default target is already `baseline-widely-available`
        //     (chrome107 / edge107 / firefox104 / safari16). A full rebuild with
        //     `target: 'esnext'` produced a byte-for-byte equivalent bundle —
        //     entry chunk 92 097 B vs 92 025 B brotli, i.e. noise — and the
        //     `Math.trunc` occurrence did not move. esbuild is not downlevelling
        //     anything of ours: there is not a single `__async`/`__spreadValues`
        //     helper in the entry chunk.
        //
        //   • The `Math.trunc` in question is a hand-written polyfill inside
        //     posthog-js's own published bundle (`Math.trunc||(Math.trunc=…)`,
        //     from its vendored uuidv7, next to a Babel `Object.assign` helper).
        //     It lives in the lazily-imported posthog chunk, not in ours, and no
        //     build target we choose can remove it — only a posthog-js release
        //     that ships modern output would.
        //
        // Raising the target above the default would therefore buy nothing while
        // dropping support for older iOS (Safari <16), which is exactly the kind
        // of phone this shop's visitors carry. Leave it on Vite's default.
        $client: {
            build: {
                rollupOptions: {
                    output: {
                        // Keep the generated @nuxt/icon client bundle out of the
                        // entry chunk. It is a leaf module (no imports, just a
                        // JSON.parse of the icon set), so splitting it is safe,
                        // and it moves 35 KB raw / 7.4 KB brotli of icon path
                        // data off the entry: 92.1 KB → 84.6 KB brotli.
                        //
                        // Total bytes on a cold load are unchanged (it is a
                        // static import, fetched in parallel via modulepreload),
                        // but the icon data only changes when icon USAGE changes,
                        // while the entry chunk's hash changes on every deploy.
                        // Splitting them means a returning visitor keeps the icon
                        // chunk from cache across deploys instead of re-downloading
                        // it inside a new entry chunk every single time.
                        manualChunks(id: string) {
                            if (id.includes('nuxt-icon-client-bundle')) return 'icons'
                        },
                    },
                },
            },
        },
    },

    features: { inlineStyles: INLINE_STYLES },

    // `inlineStyles` above inlines the CSS of every server-rendered component
    // into the HTML — but Nuxt ALSO keeps emitting a render-blocking
    // `<link rel="stylesheet">` for the very same CSS, so the page paid for it
    // twice. Measured on this build, every byte of every linked stylesheet was
    // already present in the inline <style> blocks above it:
    //
    //   /                  entry.EDTSEIcf.css  37 rules, 0 not inlined
    //                      ProductCard.css     38 rules, 0 not inlined
    //   /product/44        entry.css + ContactForm.css — 0 not inlined
    //   /cart /checkout /admin /user/login /my-account …  entry.css, 0 not inlined
    //
    // Across the ten routes checked that is 13 fully-redundant render-blocking
    // requests. Lighthouse's critical path showed two of them on the homepage at
    // 95 ms each. Two causes, both upstream bugs rather than anything we did:
    // the vite-builder clears `chunk.css` for chunks whose CSS it inlined but
    // skips the ENTRY chunk, and CSS that Rollup hoists into a shared chunk
    // (ProductCard, ContactForm) is keyed by chunk name rather than by the .vue
    // path it clears against, so it is missed too.
    //
    // Clearing `css` in the manifest is safe because it only feeds the SSR
    // renderer's <link> tags. Client-side navigation is unaffected: Vite bakes
    // its own CSS dependency list into `__vite__mapDeps` in the client JS, so a
    // route chunk imported after hydration still pulls its stylesheet in.
    // Verified after the change: the inline <style> byte counts on every route
    // are identical, and zero stylesheet links remain.
    // ⚠️ This hook is only correct while `features.inlineStyles` above is true —
    // it deletes the ONLY other route the CSS has into the initial HTML. Flip
    // inlineStyles off without removing this and every page ships unstyled, so
    // the guard below ties the two together explicitly.
    hooks: {
        'build:manifest'(manifest) {
            if (!INLINE_STYLES) return
            for (const chunk of Object.values(manifest)) {
                if (chunk.css?.length) chunk.css = []
            }
        },
    },

    // @nuxt/icon: bundle every icon the source references straight into the
    // CLIENT JS. Without this, the client @nuxt/icon runtime fetches icon data
    // from /api/_nuxt_icon/*.json on demand after hydration — and on production
    // that fetch fails (Cloudflare in front + `/api/**` is `no-store`), so the
    // hydrated page throws away the correct SSR glyphs and shows the loading
    // placeholder instead (the "broken flower" shape). `scan: true` greps the
    // source for `collection:name` string literals — which covers the ternary
    // and object-driven `:name` bindings too, since those names are literals in
    // the source — so the icons ship in the bundle and never need a runtime call.
    //
    // Audited for size (Lighthouse flags the bundle as 10.6 KB of "unused
    // JavaScript"): the scan is already tight. It bundles 124 icons / 33.9 KB
    // raw, and all 124 are genuinely referenced from a .vue file — there is no
    // dead weight to trim. The one reducible slice is the 42 icons used ONLY by
    // /admin, and dropping those saves just 1.6 KB brotli (33.9 → 21.9 KB raw,
    // but SVG path data compresses extremely well). That is not worth making
    // the admin depend on the runtime /api/_nuxt_icon fetch that broke in
    // production, so all 124 stay. The bundle is split out of the entry chunk
    // instead — see `vite.$client.build.rollupOptions` above.
    //
    // Two names in the source do not exist in their collections and silently
    // resolve to nothing: `mdi:shopping-off-outline` and `ep:hover`.
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
