<script setup lang="ts">
import ProductCard from "~/components/products/ProductCard.vue";
import type { Product } from '~~/types';

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl || useRequestURL().origin

useSeoMeta({
  title: 'Ruční tvorba — obrazy, klíčenky a sochy',
  description: 'Malý autorský eshop s ručně malovanými obrazy, sochami z papírmašé, klíčenkami a dalšími originály. Každý kousek je unikát. Doprava po celé ČR.',
  keywords: 'ruční tvorba, autorský eshop, obrazy, klíčenky, sochy, papírmašé, originály, umění',
  ogTitle: 'Tynky Bordel — Ruční tvorba a originály',
  ogDescription: 'Ručně malované obrazy, sochy, klíčenky. Každý kousek originál.',
  ogType: 'website',
  ogUrl: `${siteUrl}/`,
  ogImage: `${siteUrl}/hero/frog-forest-hero.png`,
  twitterCard: 'summary_large_image',
})

// Only carry the fields rendered on the homepage into the SSR payload. Every
// extra column (description, updatedAt, …) is serialized into the HTML and
// parsed again during hydration — paid for twice.
//
// This has to be `transform`, not `pick`. Nuxt's `pick` builds a plain object
// out of the listed keys, so handing it an ARRAY response returns
// `{ id: undefined, title: undefined, … }` — the endpoint returns a list, so
// the page then blew up on `.map is not a function` and the whole route 500'd.
const HOMEPAGE_FIELDS = ['id', 'title', 'name', 'slug', 'price', 'image', 'images', 'stock', 'category'] as const

const { data: allProducts, pending, error } = await useFetch<Product[]>('/api/products?limit=40', {
  transform: (rows: Product[]) =>
    (Array.isArray(rows) ? rows : []).map(row =>
      Object.fromEntries(HOMEPAGE_FIELDS.map(field => [field, (row as any)[field]])),
    ) as Product[],
})

const collection = computed(() =>
  (allProducts.value ?? []).map((p, i) => ({ ...p, id: p.id || `col-${i}` }))
)

// ── Zeď recenzí ─────────────────────────────────────────────────────────────
// Reviews live here, not on the product pages. Every piece is a one-off, so a
// sold item's page is gone by the time anyone could review it — customers write
// theirs from the order history (/user → Moje objednávky) and they all land on
// this one wall.
//
// The page is `swr: 3600`, so this HTML is cached for an hour; a new review
// purges it (POST /api/user/reviews → server/plugins/02-invalidate-catalog-cache.ts).
interface HomeReview {
  id: number
  rating: number
  comment: string | null
  userName: string
  createdAt: string | null
  productName: string | null
  productImage: string | null
}
const { data: reviewsData } = await useFetch<HomeReview[]>('/api/reviews', {
  query: { limit: 12 },
  default: () => [],
})
const reviews = computed<HomeReview[]>(() => reviewsData.value ?? [])

function reviewDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ')
}

const inStockCount = computed(() =>
  collection.value.filter((p: any) => (p.stock ?? 0) > 0).length
)

// ── Category filter pills ("Čerstvé z ateliéru") ────────────────────────────
// Derived from the loaded products, so with no categories in the catalog the
// pills simply don't render — the owner deletes/creates categories in the
// admin and this follows.
const activeFilter = ref<string>('all')
const categories = computed(() => {
  const seen = new Map<string, number>()
  for (const p of collection.value as any[]) {
    if (p.category) seen.set(p.category, (seen.get(p.category) ?? 0) + 1)
  }
  return Array.from(seen, ([name, count]) => ({ name, count }))
})
const filtered = computed(() =>
  activeFilter.value === 'all'
    ? collection.value
    : collection.value.filter((p: any) => p.category === activeFilter.value)
)

// Polaroid collage in the hero: three FIXED pieces of art, shipped in the
// repo under public/hero. Deliberately not derived from the catalog — the
// owner wants the same three photos on every environment, and repo files are
// the one image source that exists on production no matter what the database
// or the uploads volume are doing.
const heroPics = [
  { id: 'hero-1', image: '/hero/polaroid-1.webp', title: '' },
  { id: 'hero-2', image: '/hero/polaroid-2.webp', title: '' },
  { id: 'hero-3', image: '/hero/polaroid-3.webp', title: '' },
]


function heroSrc(image: string) {
  if (!image) return ''
  return image.startsWith('http') || image.startsWith('/') ? image : `/${image}`
}

const jsonLd = computed(() => {
  if (!allProducts.value) return []
  return [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Katalog — Tynky Bordel',
    numberOfItems: allProducts.value.length,
    itemListElement: allProducts.value.map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        url: `${siteUrl}/product/${(p as any).slug || p.id}`,
        name: p.title || p.name,
        image: p.image?.startsWith('http') ? p.image : `${siteUrl}${p.image?.startsWith('/') ? '' : '/'}${p.image || ''}`,
        offers: {
          '@type': 'Offer', price: p.price, priceCurrency: 'CZK',
          availability: (p.stock ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        },
      },
    })),
  }]
})

useHead(() => ({
  htmlAttrs: { class: 'psy-grain' },
  link: [{ rel: 'canonical', href: `${siteUrl}/` }],
  script: jsonLd.value.map(schema => ({ type: 'application/ld+json', innerHTML: JSON.stringify(schema) })),
}))

const ticker = ['odesílám do 2 dnů', 'handmade', 'platba převodem i dobírkou', 'made with passion']

// Fast, controlled smooth scroll (~500ms regardless of distance) that overrides
// the browser's distance-dependent native smooth scroll for in-hero anchors.
function scrollToKolekce(e: MouseEvent) {
  if (!import.meta.client) return
  const el = document.getElementById('kolekce')
  if (!el) return
  e.preventDefault()

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const targetY = el.getBoundingClientRect().top + window.scrollY

  if (reduced) {
    window.scrollTo(0, targetY)
    return
  }

  const startY = window.scrollY
  const distance = targetY - startY
  const duration = 500
  const startTime = performance.now()
  // ease-in-out cubic
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration)
    window.scrollTo(0, startY + distance * ease(t))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
</script>

<template>
  <div class="w-full">
    <div v-if="pending" class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="loading-eyebrow mb-4 zine-mono">Načítám…</div>
        <div class="w-12 h-12 mx-auto rounded-full border-2 border-[var(--pop-ink)]/15 border-t-[var(--pop-pink)] animate-spin"></div>
      </div>
    </div>

    <div v-else-if="error" class="mx-5 md:mx-12 mt-12 zine-card-cream p-6">
      <p class="text-lg">{{ error.message }}</p>
    </div>

    <template v-else>
      <!-- ═══ HERO ═══ -->
      <section class="zhero">
        <div class="zhero-inner">
          <div class="zhero-copy">
            <span class="zine-eyebrow zhero-eyebrow">✶ Autor · Jeden kus · Žádná série</span>
            <h1 class="zhero-title">
              Vytvářím <span class="zhero-mark">absolutní</span> bangery.
            </h1>
            <p class="zhero-sub">
              Obrazy, klíčenky, popelníky a další. Každý kousek vyráběný rukama.
            </p>
            <div class="zhero-actions">
              <NuxtLink to="#kolekce" class="zine-btn" @click="scrollToKolekce">
                Zobrazit všechno <Icon name="lucide:arrow-down" height="16" />
              </NuxtLink>
              <span v-if="inStockCount" class="zhero-stock">
                <span class="zhero-dot"></span>{{ inStockCount }} kousků skladem
              </span>
            </div>
          </div>

          <div class="zhero-collage" aria-hidden="true">
            <div v-for="(pic, i) in heroPics" :key="pic.id" :class="['zpolaroid', `zpolaroid--${i}`]">
              <span class="zine-tape zpolaroid-tape"></span>
              <!-- `sizes` mirrors the CSS `clamp(140px, 40vw, 220px)` on
                   .zpolaroid. Without it NuxtImg falls back to the raw `width`
                   and shipped a 720px file into a 145px slot on phones. -->
              <NuxtImg
                :src="heroSrc(pic.image)" :alt="pic.title || ''"
                width="220" height="220" format="webp" quality="79"
                sizes="160px sm:200px md:220px"
                :loading="i === 0 ? 'eager' : 'lazy'"
                :preload="i === 0 || undefined"
                :fetchpriority="i === 0 ? 'high' : 'auto'"
                class="zpolaroid-img"
              />
            </div>
            <svg class="zhero-heart" viewBox="0 0 100 90" fill="none" aria-hidden="true">
              <path d="M50 82C18 60 6 44 6 28 6 15 16 6 28 6c9 0 17 5 22 14C55 11 63 6 72 6c12 0 22 9 22 22 0 16-12 32-44 54Z"
                stroke="var(--pop-lime)" stroke-width="6" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>
        </div>
      </section>

      <!-- ═══ MARQUEE ═══ -->
      <div class="zine-marquee zine-marquee--pink" role="presentation">
        <div class="zine-marquee-track">
          <!-- The track is `inline-flex`, so it is exactly as wide as its
               content, and zine.css scrolls it by a fixed translateX(-50%) —
               which only loops seamlessly when the copies split evenly in two.
               The new ticker is ~840px per copy, so two copies no longer fill a
               desktop viewport and the strip ran out mid-cycle; four copies
               (still an even split, so -50% is still exactly the seam) cover any
               screen. Count must stay EVEN. -->
          <template v-for="n in 4" :key="n">
            <template v-for="(t, i) in ticker" :key="`${n}-${i}`">
              <span class="zine-marquee-star">✦</span>
              <span class="zine-marquee-item">{{ t }}</span>
            </template>
          </template>
        </div>
      </div>

      <!-- ═══ CATALOG ═══ -->
      <section id="kolekce" class="zsection">
        <div class="zine-section-head">
          <div>
            <span class="zine-eyebrow">Čerstvé z ateliéru</span>
            <h2 class="zine-section-title">Všechny kousky</h2>
          </div>
          <div v-if="categories.length" class="zfilters">
            <button
              class="zfilter" :class="{ 'is-active': activeFilter === 'all' }"
              @click="activeFilter = 'all'"
            >Vše ({{ collection.length }})</button>
            <button
              v-for="cat in categories" :key="cat.name"
              class="zfilter" :class="{ 'is-active': activeFilter === cat.name }"
              @click="activeFilter = cat.name"
            >{{ cat.name }}</button>
          </div>
        </div>

        <div class="max-w-[1340px] mx-auto">
          <div class="zgrid">
            <ProductCard
              v-for="(prod, idx) in filtered"
              :key="prod.id"
              :product="prod"
              :is-priority="idx < 2"
            />
          </div>
          <p v-if="filtered.length === 0" class="zempty">Zatím tu nic není.</p>
        </div>
      </section>

      <!-- ═══ ABOUT ═══ -->
      <section id="about" class="zsection below-fold">
        <!-- Not .zine-panel: that block is the dark surface. This one is a
             light beige card, so the zine chrome is rebuilt in the scoped CSS
             below and every foreground is the on-light variant. -->
        <div class="zabout">
          <div class="zabout-art">
            <NuxtImg
              src="/hero/tynka.webp" alt="Týnka — autorka"
              width="300" height="300" format="webp" quality="81" loading="lazy"
              sizes="300px"
              class="zabout-img"
            />
            <!--
              Easter egg: a Linktree sticker taped to the corner of the photo.
              Deliberately quiet — at rest it is just the logo in Linktree's own
              green, so it reads as part of the collage. Hover or keyboard focus
              expands it and spells the name out, which is what makes it
              recognisable rather than "some green blob".

              It is a real <a> outside any aria-hidden wrapper (the hero collage
              IS aria-hidden, which is why the egg does not live there — a
              focusable link inside aria-hidden is reachable by Tab but invisible
              to a screen reader). The accessible name is on the link itself, so
              it never depends on the hover-only label.
            -->
            <a
              href="https://linktr.ee/tynky_bordel"
              target="_blank"
              rel="noopener noreferrer"
              class="zegg"
              aria-label="Linktree — všechny moje odkazy"
            >
              <Icon name="simple-icons:linktree" height="17" class="zegg-icon" />
              <span class="zegg-label" aria-hidden="true">Linktree</span>
            </a>
          </div>
          <div class="zabout-copy">
            <span class="zine-eyebrow">✶ O mně</span>
            <h2 class="zabout-title">Vítej na mém e-shopu</h2>
            <div class="zabout-desc">
              <p>
                Jsem <strong class="zabout-strong">Týnka</strong> a přes tvorbu pouštím do světa
                <span class="zabout-mark">více barev</span>, svůj zvláštní humor a nápady,
                které chci přeměnit v něco hmatatelného.
              </p>
              <p>
                Každý kousek, který tu najdeš, vznikl spontánním nápadem —
                klidně ve <span class="zabout-mark">čtyři ráno</span> po nechtěném probuzení.
              </p>
              <p>
                Sdílet je s ostatními byl můj dlouholetý sen a jsem neskutečně ráda,
                že si ho <strong class="zabout-strong">konečně plním</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ INFO TILES ═══ -->
      <section class="zsection below-fold">
        <div class="ztiles">
          <div class="ztile">
            <span class="ztile-num">01</span>
            <h3 class="ztile-title">Odesláno do 2 dnů</h3>
            <p class="ztile-desc">Zásilkovna Z-BOX i Balíkovna, 79 Kč.</p>
          </div>
          <div class="ztile">
            <span class="ztile-num">02</span>
            <h3 class="ztile-title">Platba jak chceš</h3>
            <p class="ztile-desc">QR převod nebo dobírka +60 Kč.</p>
          </div>
          <div class="ztile">
            <span class="ztile-num">03</span>
            <h3 class="ztile-title">Každý kousek originál</h3>
            <p class="ztile-desc">Žádná sériová výroba — co koupíš, to už nikdo jiný mít nebude.</p>
          </div>
        </div>
      </section>

      <!-- ═══ RECENZE ═══ -->
      <!-- Only renders when someone has actually written something: an empty
           "co říkají zákazníci" block on a brand-new shop looks worse than no
           block at all. -->
      <section v-if="reviews.length" id="recenze" class="zsection below-fold">
        <div class="zine-section-head">
          <div>
            <span class="zine-eyebrow">✶ Vzkazy od vás</span>
            <h2 class="zine-section-title">Co říkají ti, co už mají</h2>
          </div>
        </div>

        <div class="zwall">
          <article v-for="rev in reviews" :key="rev.id" class="znote">
            <span class="zine-tape znote-tape" aria-hidden="true"></span>

            <div class="znote-stars" :aria-label="`Hodnocení ${rev.rating} z 5`">
              <Icon
                v-for="n in 5" :key="n"
                :name="n <= rev.rating ? 'mdi:star' : 'mdi:star-outline'"
                height="16" aria-hidden="true"
              />
            </div>

            <p class="znote-text">&bdquo;{{ rev.comment }}&ldquo;</p>

            <div class="znote-foot">
              <!-- Which piece it is about. Not a link: the original is sold, so
                   its product page no longer exists. -->
              <span v-if="rev.productName" class="znote-product">{{ rev.productName }}</span>
              <span class="znote-by">
                <span class="znote-author">{{ rev.userName }}</span>
                <span v-if="reviewDate(rev.createdAt)" class="znote-date"> · {{ reviewDate(rev.createdAt) }}</span>
              </span>
            </div>
          </article>
        </div>
      </section>

      <!-- No contact block here on purpose: the owner wants the form to live on
           the product page only, so the homepage ends with the reviews wall. -->
    </template>
  </div>
</template>

<style scoped>
.zsection {
  padding: 2.5rem 1rem;
  max-width: 1400px;
  margin: 0 auto;
}
@media (min-width: 768px) { .zsection { padding: 4.5rem 2rem; } }

/* ── Hero ── */
.zhero {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1rem 2.75rem;
}
@media (min-width: 768px) { .zhero { padding: 3.5rem 2rem 4rem; } }
.zhero-inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;
}
@media (min-width: 900px) { .zhero-inner { grid-template-columns: 1.05fr 0.95fr; gap: 3rem; } }

.zhero-eyebrow { margin-bottom: 1.1rem; }
.zhero-title {
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: clamp(2.9rem, 11vw, 5.6rem);
  line-height: 0.88;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: var(--pop-ink);
  margin: 0 0 1.4rem;
}
.zhero-mark {
  /* Pink sticker: the fill stays LIGHT in dark mode, so the word on it and the
     cut-out border around it must stay dark — --pop-ink flips to near-white and
     the whole mark would go light-on-light. Same construction as .zine-sticker
     and .zabout-mark. */
  color: var(--pop-ink-on-accent);
  background: var(--pop-pink);
  padding: 0 0.18em;
  border: 3px solid var(--pop-ink-on-accent);
  border-radius: 6px;
  box-shadow: 4px 4px 0 var(--pop-shadow);
  display: inline-block;
  transform: rotate(-1.5deg);
}
.zhero-sub {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.55;
  /* Was a literal ink wash, i.e. dark green text that stayed dark green on the
     violet dark-mode ground. No token carries this exact alpha, so it is mixed
     off --pop-ink: identical in light, and it follows the theme. */
  color: color-mix(in srgb, var(--pop-ink) 78%, transparent);
  max-width: 44ch;
  margin: 0 0 1.9rem;
}
.zhero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem 1.25rem; }
.zhero-stock {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pop-ink);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.zhero-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--pop-lime); border: 1.5px solid var(--pop-ink);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pop-lime) 35%, transparent);
}

/* Collage */
.zhero-collage {
  position: relative;
  min-height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (min-width: 900px) { .zhero-collage { min-height: 440px; } }
.zpolaroid {
  position: absolute;
  width: clamp(140px, 40vw, 220px);
  /* The polaroid's paper frame — --pop-card is exactly this literal in light and
     the raised-paper surface in dark, so the frame stays a "card" on both
     grounds instead of a glaring white block on the violet one. */
  background: var(--pop-card);
  padding: 8px 8px 26px;
  border: 2px solid var(--pop-ink);
  box-shadow: 5px 6px 0 var(--pop-shadow);
}
.zpolaroid-img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--pop-plum); }
.zpolaroid-tape { top: -12px; left: 50%; margin-left: -42px; transform: rotate(-4deg); }
.zpolaroid--0 { transform: rotate(-7deg); left: 4%; top: 8%; z-index: 2; }
.zpolaroid--1 { transform: rotate(5deg); right: 6%; top: 2%; z-index: 3; }
.zpolaroid--2 { transform: rotate(-3deg); left: 26%; bottom: 2%; z-index: 4; }
.zpolaroid:hover { z-index: 6; }
.zhero-heart { position: absolute; right: 2%; bottom: 8%; width: clamp(56px, 12vw, 90px); z-index: 5; transform: rotate(8deg); }
@media (prefers-reduced-motion: no-preference) {
  .zpolaroid { transition: transform 0.3s cubic-bezier(0.22,1,0.36,1); }
  .zpolaroid:hover { transform: rotate(0deg) scale(1.04); }
}


/* ── Filters ── */
.zfilters { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.zfilter {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pop-ink);
  background: transparent;
  border: 2px solid var(--pop-ink);
  border-radius: 999px;
  padding: 0.42rem 0.85rem;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.12s ease;
}
.zfilter:hover { transform: translateY(-1px); background: var(--pop-ink-wash); }
.zfilter.is-active { background: var(--pop-ink); color: var(--pop-cream); }

/* ── Product grid ── */
.zgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.85rem;
}
@media (min-width: 640px) { .zgrid { grid-template-columns: repeat(3, 1fr); gap: 1.25rem; } }
@media (min-width: 1024px) { .zgrid { grid-template-columns: repeat(4, 1fr); gap: 1.5rem; } }
.zempty {
  font-family: var(--font-mono);
  text-align: center;
  /* --pop-ink-mute, not the old 0.55 ink wash: that wash was fixed dark green
     (unreadable on the violet ground) and only measured ~3.9:1 even on cream. */
  color: var(--pop-ink-mute);
  padding: 3rem 0;
}

/* ── About panel ── */
.zabout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  padding: 1.75rem;
  align-items: center;
  /* Same olive green as the product cards, so the page keeps one green.
     Chrome is copied from .zine-panel (which this no longer uses — that class
     carries the near-black surface). Every foreground inside is the on-dark
     variant; see the contrast notes on each rule below. */
  background: var(--pop-plum);
  border: 2px solid var(--pop-ink);
  border-radius: 16px;
  box-shadow: 6px 6px 0 var(--pop-shadow);
}
@media (min-width: 820px) { .zabout { grid-template-columns: 0.8fr 1.2fr; gap: 2.5rem; padding: 2.75rem; } }
.zabout-art {
  display: flex;
  justify-content: center;
  /* Anchor for the Linktree easter egg below. */
  position: relative;
  width: fit-content;
  margin-inline: auto;
}
.zabout-img {
  width: 100%; max-width: 300px; border-radius: 12px;
  border: 2px solid color-mix(in srgb, var(--pop-on-dark) 28%, transparent);
  display: block;
}

/* ── Linktree easter egg ──────────────────────────────────────────────────
   Linktree's brand green is fixed in both themes — it is someone else's
   identity, not our palette — so its ink is the constant --pop-ink-on-accent
   rather than --pop-ink, which would flip to near-white on a light green chip.
   Measured 8.9:1. */
.zegg {
  --zegg-green: #43E660;
  position: absolute;
  right: -0.55rem;
  bottom: -0.7rem;
  z-index: 2;

  display: inline-flex;
  align-items: center;
  gap: 0;
  max-width: 2.15rem;          /* collapsed: just the logo */
  overflow: hidden;
  padding: 0.42rem;
  border-radius: 999px;
  background: var(--zegg-green);
  color: var(--pop-ink-on-accent);
  border: 2px solid var(--pop-ink-on-accent);
  box-shadow: 2px 2px 0 var(--pop-ink-on-accent);
  transform: rotate(-8deg);
  text-decoration: none;
  /* Only transform/opacity would be cheaper, but the reveal is a width change
     by nature; it is one small element and runs on hover only. */
  transition: max-width 0.28s cubic-bezier(0.2, 0.8, 0.3, 1),
              gap 0.28s cubic-bezier(0.2, 0.8, 0.3, 1),
              transform 0.18s ease,
              box-shadow 0.18s ease;
}
.zegg-icon { flex: none; }
.zegg-label {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  padding-right: 0.2rem;
}
.zegg:hover,
.zegg:focus-visible {
  max-width: 9rem;
  gap: 0.35rem;
  transform: rotate(-3deg) translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--pop-ink-on-accent);
}
.zegg:focus-visible { outline: 2px solid var(--pop-ink-on-accent); outline-offset: 3px; }
.zegg:active { transform: rotate(-3deg) translate(1px, 1px); box-shadow: 1px 1px 0 var(--pop-ink-on-accent); }

/* An egg that animates itself open is a distraction for anyone who asked the
   system to calm motion down; show it already legible instead. */
@media (prefers-reduced-motion: reduce) {
  .zegg { transition: none; max-width: 9rem; gap: 0.35rem; }
}
.zabout-title {
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  line-height: 0.95;
  text-transform: uppercase;
  /* The olive panel is dark in BOTH themes, so this is the constant on-dark
     cream (7.7:1 on the light olive, 6.7:1 on the lifted dark one). */
  color: var(--pop-on-dark);
  margin: 0.7rem 0 1rem;
}
.zabout-desc {
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.65;
  /* Softer than the title but still 5.6:1 — the body copy has to clear AA,
     so this is as far down as the alpha can go on this green. Tokens only in
     the accents below, so dark mode re-tunes them by itself. */
  color: color-mix(in srgb, var(--pop-on-dark) 85%, transparent);
  margin: 0 0 0.4rem;
  max-width: 52ch;
}
.zabout-desc p { margin: 0 0 0.95rem; }
/* Lime for names/beats — the same "yes / go" colour prices use. On the olive
   panel it clears AA in both themes (5.7:1 light, ~5:1 dark). */
.zabout-strong {
  color: var(--pop-lime);
  font-weight: 700;
}
/* Pink sticker highlight, same construction as .zhero-mark but calmer. Text
   uses --pop-ink-on-accent: the pink fill STAYS light in dark mode, so the
   text on it must stay dark rather than follow --pop-ink to near-white. */
.zabout-mark {
  display: inline-block;
  background: var(--pop-pink);
  color: var(--pop-ink-on-accent, #14231a);
  font-weight: 600;
  padding: 0 0.3em;
  border-radius: 5px;
  transform: rotate(-1deg);
}
/* The shared .zine-eyebrow is --pop-pink-ink, tuned for cream paper; on the
   olive it drops to 1.6:1. Blush is the same family and clears AA at 6.35:1. */
.zabout-copy .zine-eyebrow { color: var(--pop-blush); }

/* ── Info tiles ── */
.ztiles { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 720px) { .ztiles { grid-template-columns: repeat(3, 1fr); } }
.ztile {
  position: relative;
  background: var(--pop-cream, #F0E7D2);
  border: 2px solid var(--pop-ink);
  border-radius: 12px;
  padding: 1.5rem 1.5rem 1.4rem;
  box-shadow: 4px 5px 0 var(--pop-shadow);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.ztile:hover { transform: translate(-1px, -1px); box-shadow: 7px 9px 0 var(--pop-pink, #E7488B); }
.ztile-num {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.8rem;
  /* --pop-pink-ink is only 4.12:1 on the cream tile — below AA for text this
     small. primary-700 is the same rose family at 5.83:1. */
  color: var(--color-primary-700, #97325c);
  letter-spacing: 0.1em;
}
/* …but primary-700 is a Tailwind theme colour: it does NOT flip, and the tile
   ground does (--pop-cream becomes the near-black violet), which dropped this
   number to ~2.5:1 in dark mode. Same two-branch idiom main.css uses for the
   palette itself: the light branch keeps the exact colour above, the dark branch
   takes the rose that is already tuned for a dark ground. */
@supports (color: light-dark(#fff, #000)) {
  .ztile-num { color: light-dark(#97325c, var(--pop-pink-ink)); }
}
.ztile-title {
  font-family: var(--font-zine);
  font-weight: 700;
  font-size: 1.3rem;
  text-transform: uppercase;
  color: var(--pop-ink);
  margin: 0.5rem 0 0.4rem;
  letter-spacing: -0.01em;
}
.ztile-desc {
  font-family: var(--font-body);
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--pop-ink-mute);
  margin: 0;
}

/* ── Zeď recenzí ──
   Note cards taped to the page, same paper/ink/offset-shadow language as the
   polaroids and the info tiles. Every colour is a --pop-* token, so the wall
   flips with the theme: --pop-card is cream paper in light and the raised violet
   surface in dark, and --pop-ink / --pop-ink-mute invert with it. */
.zwall {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.1rem;
}
@media (min-width: 640px) { .zwall { grid-template-columns: repeat(2, 1fr); gap: 1.35rem; } }
@media (min-width: 1024px) { .zwall { grid-template-columns: repeat(3, 1fr); } }

.znote {
  position: relative;              /* anchor for the tape */
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: var(--pop-card);
  border: 2px solid var(--pop-ink);
  border-radius: 12px;
  padding: 1.6rem 1.25rem 1.15rem; /* extra top padding: the tape overlaps it */
  box-shadow: 5px 6px 0 var(--pop-shadow);
}
/* A hand-pinned wall, not a spreadsheet — alternate the tilt. */
.znote:nth-child(3n+1) { transform: rotate(-0.9deg); }
.znote:nth-child(3n+2) { transform: rotate(0.7deg); }
.znote:nth-child(3n)   { transform: rotate(-0.3deg); }
@media (prefers-reduced-motion: no-preference) {
  .znote { transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .znote:hover { transform: rotate(0deg) translate(-1px, -1px); box-shadow: 7px 9px 0 var(--pop-pink); }
}
.znote-tape {
  top: -13px;
  left: 50%;
  margin-left: -42px;
  transform: rotate(-3deg);
}

/* Lime-family ink rather than the bright lime fill: on cream paper #B9E14B is
   1.7:1, while --pop-lime-ink is tuned for text on paper in both themes. */
.znote-stars {
  display: flex;
  gap: 0.1rem;
  color: var(--pop-lime-ink);
}
.znote-text {
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--pop-ink);
  margin: 0;
  /* Long reviews are capped so one essay cannot stretch a whole grid row. */
  overflow-wrap: anywhere;
}
.znote-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.65rem;
  border-top: 2px dashed var(--pop-line);
}
/* Blush sticker: the fill stays light in dark mode, so its text takes the
   constant --pop-ink-on-accent (same rule as .zabout-mark / .zhero-mark). */
.znote-product {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pop-ink-on-accent);
  background: var(--pop-blush);
  border: 1.5px solid var(--pop-ink-on-accent);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
}
.znote-by {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}
.znote-author { font-weight: 700; color: var(--pop-ink); }
.znote-date { color: var(--pop-ink-mute); }

.loading-eyebrow {
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--pop-ink-mute);
}
</style>
