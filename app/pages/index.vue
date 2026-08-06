<script setup lang="ts">
import ProductCard from "~/components/products/ProductCard.vue";
import { Icon } from "@iconify/vue";
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

const { data: allProducts, pending, error } = await useFetch<Product[]>('/api/products?limit=40')

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

// ── Category filter pills ("Čerstvé z ateliéru") ────────────────────────────
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
              <NuxtLink to="#kolekce" class="zine-btn">
                Zobrazit všechno <Icon icon="lucide:arrow-down" height="16" />
              </NuxtLink>
              <span v-if="inStockCount" class="zhero-stock">
                <span class="zhero-dot"></span>{{ inStockCount }} kousků skladem
              </span>
            </div>
          </div>

          <div class="zhero-collage" aria-hidden="true">
            <div v-for="(pic, i) in heroPics" :key="pic.id" :class="['zpolaroid', `zpolaroid--${i}`]">
              <span class="zine-tape zpolaroid-tape"></span>
              <NuxtImg
                :src="heroSrc(pic.image)" :alt="pic.title || ''"
                width="360" height="360" format="webp" quality="78"
                :loading="i === 0 ? 'eager' : 'lazy'" class="zpolaroid-img"
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
          <div class="zfilters">
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
              :is-priority="idx < 4"
            />
          </div>
          <p v-if="filtered.length === 0" class="zempty">V téhle kategorii zatím nic není.</p>
        </div>
      </section>

      <!-- ═══ ABOUT ═══ -->
      <section id="about" class="zsection">
        <div class="zabout zine-panel">
          <div class="zabout-art">
            <NuxtImg
              src="/hero/mushroom-eye.png" alt="Autorská ilustrace"
              width="440" height="440" format="webp" quality="80" loading="lazy" class="zabout-img"
            />
          </div>
          <div class="zabout-copy">
            <span class="zine-eyebrow zine-eyebrow--ondark">✶ O mně</span>
            <h2 class="zabout-title">Akustická děvka,<br />která musí furt něco tvořit</h2>
            <p class="zabout-desc">
              Jsem obsessed smažkama. Vytvářím jak hovna, tak absolutní bangery —
              obrazy, sochy z papírmašé, klíčenky. Každý kousek je originál, vyrobený rukama.
            </p>
            <NuxtLink to="#kolekce" class="zine-btn zine-btn--lime zine-btn--ondark">
              Celý příběh <Icon icon="lucide:arrow-right" height="16" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- ═══ INFO TILES ═══ -->
      <section class="zsection">
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

      <!-- ═══ NEWSLETTER ═══ -->
      <NewsletterSignup />
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
  color: #fff;
  background: var(--pop-pink);
  padding: 0 0.18em;
  border: 3px solid var(--pop-ink);
  border-radius: 6px;
  box-shadow: 4px 4px 0 rgba(32, 17, 52, 0.9);
  display: inline-block;
  transform: rotate(-1.5deg);
}
.zhero-sub {
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 1.05rem;
  line-height: 1.55;
  color: rgba(32, 17, 52, 0.78);
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
  box-shadow: 5px 6px 0 rgba(32, 17, 52, 0.85);
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
.zfilter:hover { transform: translateY(-1px); background: rgba(32, 17, 52, 0.06); }
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
  color: rgba(32, 17, 52, 0.55);
  padding: 3rem 0;
}

/* ── About panel ── */
.zabout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  padding: 1.75rem;
  align-items: center;
}
@media (min-width: 820px) { .zabout { grid-template-columns: 0.8fr 1.2fr; gap: 2.5rem; padding: 2.75rem; } }
.zabout-art { display: flex; justify-content: center; }
.zabout-img {
  width: 100%; max-width: 300px; border-radius: 12px;
  border: 2px solid rgba(240, 231, 210, 0.25);
}
.zabout-title {
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  line-height: 0.95;
  text-transform: uppercase;
  color: #fff;
  margin: 0.7rem 0 1rem;
}
.zabout-desc {
  font-family: 'Manrope', system-ui;
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(240, 231, 210, 0.82);
  margin: 0 0 1.6rem;
  max-width: 52ch;
}

/* ── Info tiles ── */
.ztiles { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 720px) { .ztiles { grid-template-columns: repeat(3, 1fr); } }
.ztile {
  position: relative;
  background: #fbf7ee;
  border: 2px solid var(--pop-ink);
  border-radius: 12px;
  padding: 1.5rem 1.5rem 1.4rem;
  box-shadow: 4px 4px 0 rgba(32, 17, 52, 0.85);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.ztile:hover { transform: translate(-1px, -1px); box-shadow: 6px 6px 0 rgba(32, 17, 52, 0.85); }
.ztile-num {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.8rem;
  color: var(--pop-pink-ink);
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
  font-family: 'Manrope', system-ui;
  font-size: 0.9rem;
  line-height: 1.5;
  color: rgba(32, 17, 52, 0.7);
  margin: 0;
}

.loading-eyebrow {
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(32, 17, 52, 0.55);
}
</style>
