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

const inStockCount = computed(() =>
  collection.value.filter((p: any) => (p.stock ?? 0) > 0).length
)

// Polaroid collage in the hero: the three freshest pieces with an image.
const heroPics = computed(() =>
  collection.value.filter((p: any) => p.image).slice(0, 3)
)


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

const ticker = ['Jeden kus od každého', 'Odesílám z Prahy do 2 dnů', '14 dní na vrácení', 'Ručně v Praze', 'Platba převodem i dobírkou']

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
              Obrazy, sochy z papírmašé, klíčenky. Všechno originál, všechno z ruky.
              Platba převodem nebo dobírkou.
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
                width="220" height="220" format="webp" quality="78"
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
          <template v-for="n in 2" :key="n">
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
        </div>

        <div class="max-w-[1340px] mx-auto">
          <div class="zgrid">
            <ProductCard
              v-for="(prod, idx) in collection"
              :key="prod.id"
              :product="prod"
              :is-priority="idx < 2"
            />
          </div>
          <p v-if="collection.length === 0" class="zempty">Zatím tu nic není.</p>
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
              src="/hero/mushroom-eye.png" alt="Autorská ilustrace"
              width="300" height="300" format="webp" quality="80" loading="lazy"
              sizes="300px"
              class="zabout-img"
            />
          </div>
          <div class="zabout-copy">
            <span class="zine-eyebrow">✶ O mně</span>
            <h2 class="zabout-title">Akustická děvka,<br />která musí furt něco tvořit</h2>
            <p class="zabout-desc">
              Jsem obsessed smažkama. Vytvářím jak hovna, tak absolutní bangery —
              obrazy, sochy z papírmašé, klíčenky. Každý kousek je originál, vyrobený rukama.
            </p>
          </div>
        </div>
      </section>

      <!-- ═══ INFO TILES ═══ -->
      <section class="zsection below-fold">
        <div class="ztiles">
          <div class="ztile">
            <span class="ztile-num">01</span>
            <h3 class="ztile-title">Z Prahy do 2 dnů</h3>
            <p class="ztile-desc">Zásilkovna Z-BOX i Balíkovna, 79 Kč.</p>
          </div>
          <div class="ztile">
            <span class="ztile-num">02</span>
            <h3 class="ztile-title">Platba jak chceš</h3>
            <p class="ztile-desc">QR převod nebo dobírka +60 Kč.</p>
          </div>
          <div class="ztile">
            <span class="ztile-num">03</span>
            <h3 class="ztile-title">14 dní na vrácení</h3>
            <p class="ztile-desc">Nesedí? Vyměníme nebo vrátíme peníze.</p>
          </div>
        </div>
      </section>
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
  color: var(--pop-ink);
  background: var(--pop-pink);
  padding: 0 0.18em;
  border: 3px solid var(--pop-ink);
  border-radius: 6px;
  box-shadow: 4px 4px 0 rgba(20, 35, 26, 0.9);
  display: inline-block;
  transform: rotate(-1.5deg);
}
.zhero-sub {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.55;
  color: rgba(20, 35, 26, 0.78);
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
  box-shadow: 0 0 0 3px rgba(185, 225, 75, 0.35);
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
  background: #fbf7ee;
  padding: 8px 8px 26px;
  border: 2px solid var(--pop-ink);
  box-shadow: 5px 6px 0 rgba(20, 35, 26, 0.85);
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
  color: rgba(20, 35, 26, 0.55);
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
  box-shadow: 6px 6px 0 rgba(20, 35, 26, 0.85);
}
@media (min-width: 820px) { .zabout { grid-template-columns: 0.8fr 1.2fr; gap: 2.5rem; padding: 2.75rem; } }
.zabout-art { display: flex; justify-content: center; }
.zabout-img {
  width: 100%; max-width: 300px; border-radius: 12px;
  border: 2px solid rgba(253, 247, 236, 0.28);
}
.zabout-title {
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  line-height: 0.95;
  text-transform: uppercase;
  /* 8.15:1 on the olive ground. */
  color: #FDF7EC;
  margin: 0.7rem 0 1rem;
}
.zabout-desc {
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.6;
  /* Softer than the title but still 5.6:1 — the body copy has to clear AA,
     so this is as far down as the alpha can go on this green. */
  color: rgba(240, 231, 210, 0.85);
  margin: 0 0 1.6rem;
  max-width: 52ch;
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
  box-shadow: 4px 5px 0 rgba(32, 8, 40, 0.55);
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
  color: rgba(20, 35, 26, 0.7);
  margin: 0;
}

.loading-eyebrow {
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(20, 35, 26, 0.55);
}
</style>
