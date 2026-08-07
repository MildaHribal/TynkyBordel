<script setup lang="ts">

import type { Product } from '~~/types';

const props = defineProps<{
  products: (Product & { slug?: string; shortDescription?: string })[];
}>();

const index = ref(0);
const wrapRef = ref<HTMLElement | null>(null);
let autoplayTimer: ReturnType<typeof setInterval> | null = null;
const isPaused = ref(false);

const current = computed(() => props.products[index.value]);

const next = () => {
  if (!props.products.length) return;
  index.value = (index.value + 1) % props.products.length;
};
const prev = () => {
  if (!props.products.length) return;
  index.value = (index.value - 1 + props.products.length) % props.products.length;
};

const goto = (i: number) => {
  if (i < 0 || i >= props.products.length) return;
  index.value = i;
};

// Swipe navigation for phones (arrows are hidden there).
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;
const onTouchStart = (e: TouchEvent) => {
  if (!e.touches[0]) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchActive = true;
  isPaused.value = true;
};
const onTouchEnd = (e: TouchEvent) => {
  isPaused.value = false;
  if (!touchActive || !e.changedTouches[0]) return;
  touchActive = false;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) next();
    else prev();
  }
};

const resolveImage = (src?: string | null) => {
  if (!src) return null;
  return src.startsWith('http') || src.startsWith('/') ? src : `/${src}`;
};

const productUrl = (p: Product & { slug?: string }) => {
  return p.slug ? `/product/${p.slug}` : `/product/${p.id}`;
};

onMounted(() => {
  autoplayTimer = setInterval(() => {
    if (!isPaused.value) next();
  }, 6500);
});
onBeforeUnmount(() => {
  if (autoplayTimer) clearInterval(autoplayTimer);
});

defineExpose({ next, prev });
</script>

<template>
  <section
    v-if="products.length"
    class="big-slider"
    ref="wrapRef"
    @mouseenter="isPaused = true"
    @mouseleave="isPaused = false"
    aria-roledescription="carousel"
    :aria-label="`Nejlepší kousky (${products.length})`"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <Transition name="slide-fade" mode="out-in">
      <article :key="current.id" class="slide">
        <!-- Left: full product image (contain, black bg) -->
        <NuxtLink :to="productUrl(current)" class="slide-image-link" :aria-label="`Detail produktu: ${current.title || current.name}`">
          <NuxtImg
            v-if="resolveImage(current.image)"
            :src="resolveImage(current.image)!"
            :alt="current.title || current.name"
            width="1000"
            height="1000"
            format="webp"
            quality="74"
            sizes="sm:100vw md:60vw lg:900px"
            loading="eager"
            fetchpriority="high"
            class="slide-image"
          />
        </NuxtLink>

        <!-- Right: description card -->
        <div class="slide-side">
          <div class="slide-card">
            <div class="slide-eyebrow">— {{ current.category || 'Originál' }}</div>
            <h3 class="slide-title">{{ current.title || current.name }}</h3>
            <p v-if="current.shortDescription || current.description" class="slide-desc">
              {{ current.shortDescription || current.description }}
            </p>
            <div class="slide-meta">
              <span class="slide-price">{{ current.price }} Kč</span>
              <NuxtLink :to="productUrl(current)" class="slide-cta">
                Koupit
                <Icon icon="lucide:arrow-up-right" height="16" />
              </NuxtLink>
            </div>
          </div>
        </div>
      </article>
    </Transition>

    <!-- Arrows -->
    <button
      v-if="products.length > 1"
      class="slide-arrow slide-arrow--prev"
      @click="prev"
      aria-label="Předchozí"
    >
      <Icon icon="lucide:chevron-left" height="22" />
    </button>
    <button
      v-if="products.length > 1"
      class="slide-arrow slide-arrow--next"
      @click="next"
      aria-label="Další"
    >
      <Icon icon="lucide:chevron-right" height="22" />
    </button>

    <!-- Dots -->
    <div v-if="products.length > 1" class="slide-dots" role="tablist">
      <button
        v-for="(_, i) in products"
        :key="i"
        class="slide-dot"
        :class="{ 'is-active': i === index }"
        @click="goto(i)"
        :aria-label="`Snímek ${i + 1}`"
        role="tab"
      ></button>
    </div>
  </section>
</template>

<style scoped>
.big-slider {
  position: relative;
  max-width: 1400px;
  margin: 0 auto;
  border-radius: 1.75rem;
  overflow: hidden;
  background: #000000;
  box-shadow: 0 14px 40px rgba(20, 35, 26, 0.18);
  border: 1px solid rgba(20, 35, 26, 0.1);
}

/* Mobile: stacked — a square image on top (product fully visible on black), the
   card in normal flow below. (Overlaying the card hid small product photos.) */
.slide {
  position: relative;
  display: block;
  overflow: hidden;
  background: #000000;
}
@media (min-width: 768px) {
  .slide {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    aspect-ratio: 16 / 9;
  }
}

.slide-image-link {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000000;
  overflow: hidden;
}
@media (min-width: 768px) {
  .slide-image-link { aspect-ratio: auto; height: 100%; min-height: 0; }
}
.slide-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  /* Generous padding "zooms the product out" so it's fully visible; the black
     frame fills whatever space is left (product photos are shot on black). */
  padding: 1rem;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
@media (min-width: 768px) {
  .slide-image { padding: 3.25rem; }
}
.slide-image-link:hover .slide-image {
  transform: scale(1.02);
}

.slide-side {
  position: static;
  display: block;
  padding: 0.6rem 0.6rem 2rem;
  background: #000000;
}
@media (min-width: 768px) {
  .slide-side {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 2rem 4rem 2rem 1rem;
  }
}

.slide-card {
  background: #ffffff;
  color: var(--pop-ink);
  border-radius: 1rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.35);
}
@media (min-width: 768px) {
  .slide-card {
    padding: 2.15rem 2rem 1.75rem;
    max-width: 470px;
    /* Nudge the card a touch down and left (toward the image) for a more
       editorial, overlapping composition. */
    transform: translate(-2rem, 1.4rem);
  }
}

.slide-eyebrow {
  font-family: 'Manrope', system-ui;
  font-size: 0.7rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(20, 35, 26, 0.6);
  font-weight: 700;
  margin-bottom: 0.65rem;
}

.slide-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.55rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--pop-ink);
  margin: 0 0 0.75rem;
}
@media (min-width: 768px) {
  .slide-title { font-size: 2.05rem; }
}

.slide-desc {
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(20, 35, 26, 0.78);
  margin: 0 0 1.25rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (min-width: 768px) {
  .slide-desc { -webkit-line-clamp: 4; font-size: 1rem; }
}

.slide-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid rgba(20, 35, 26, 0.1);
  padding-top: 0.9rem;
}
.slide-price {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.35rem;
  color: var(--pop-ink);
  letter-spacing: -0.01em;
}
.slide-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.65rem 1.1rem;
  background: #1a0f28;
  color: #ffffff;
  border-radius: 9999px;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background 0.2s ease, transform 0.2s ease;
}
.slide-cta:hover {
  background: #14231a;
  transform: translateY(-1px);
}

/* Phones: no separate white block — info sits directly on the black slide as one
   cohesive dark unit (product photo blends into the frame), no long description.
   NOTE: this block MUST come after the base .slide-* rules above so it wins the
   cascade (same specificity → later source order). */
@media (max-width: 767px) {
  .slide-card {
    background: transparent;
    box-shadow: none;
    padding: 0.3rem 0.9rem 0.2rem;
    max-width: none;
    border-radius: 0;
  }
  .slide-eyebrow { color: #ffb3d0; margin-bottom: 0.4rem; }
  .slide-title { color: #fbf4ea; font-size: 1.35rem; margin-bottom: 0.55rem; }
  .slide-desc { display: none; }
  .slide-meta { border-top-color: rgba(255, 255, 255, 0.14); padding-top: 0.8rem; }
  .slide-price { color: #fbf4ea; font-size: 1.4rem; }
  .slide-cta {
    background: #fbf4ea;
    color: #1c0d2e;
    padding: 0.65rem 1.15rem;
    font-size: 0.72rem;
  }
  .slide-cta:hover { background: #ffffff; }
}

/* Arrows */
.slide-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--pop-ink);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.slide-arrow:hover {
  background: #ffffff;
  transform: translateY(-50%) scale(1.05);
}
.slide-arrow--prev { left: 1.25rem; }
.slide-arrow--next { right: 1.25rem; }
/* Phones use swipe + dots instead of the side arrows. */
@media (max-width: 767px) {
  .slide-arrow { display: none; }
}

/* Dots — sit in a small dark pill so they stay visible on both image + card */
.slide-dots {
  position: absolute;
  bottom: 0.9rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  border-radius: 9999px;
}
/* On phones the dots sit on the black card area, so drop the pill background. */
@media (max-width: 767px) {
  .slide-dots {
    bottom: 0.9rem;
    background: transparent;
    backdrop-filter: none;
    padding: 0;
  }
}
.slide-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.4);
  border: none;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.slide-dot.is-active {
  background: #ffffff;
  transform: scale(1.2);
}

/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.5s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
}
</style>
