<script setup lang="ts">
import { useCartStore } from "~/stores/cart";

import type { Product } from "~~/types";

const cart = useCartStore();

const props = defineProps<{
  product: Product,
  isPriority?: boolean
}>()

const imageWrapRef = ref<HTMLElement | null>(null)
const { flyToCart } = useFlyToCartAnimation()

const imageSrc = computed(() => {
  const image = props.product.image
  if (!image) {
    return null
  }

  return image.startsWith('http') || image.startsWith('/') ? image : `/${image}`
})

const productUrl = computed(() => {
  const slug = (props.product as any).slug
  return slug ? `/product/${slug}` : `/product/${props.product.id}`
})

// Aligned-but-crooked grid: each card gets a small, STABLE tilt derived from its
// id, so the wall of cards looks hand-pinned rather than machine-perfect. Hover
// straightens it. (Deterministic → no hydration mismatch, no reshuffle on nav.)
const TILTS = [-2.4, 1.6, -1.1, 2.2, -0.7, 1.2]
const tilt = computed(() => {
  const n = Number(props.product.id)
  return TILTS[Number.isFinite(n) ? Math.abs(n) % TILTS.length : props.product.id.toString().length % TILTS.length]
})

// Second product photo, revealed with a crossfade on hover (if the product has
// more than one image).
const secondImageSrc = computed(() => {
  const imgs = props.product.images
  if (!Array.isArray(imgs) || imgs.length === 0) return null
  const resolved = imgs
    .filter(Boolean)
    .map((i) => (i.startsWith('http') || i.startsWith('/') ? i : `/${i}`))
  const second = resolved.find((i) => i !== imageSrc.value)
  return second || null
})

// Only mount the hover image on devices that actually hover (desktop). On touch
// phones the crossfade never fires, so downloading a second photo per card is
// pure wasted payload — this keeps it out of the DOM entirely on mobile.
const canHover = ref(false)
onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    canHover.value = window.matchMedia('(hover: hover)').matches
  }
})

// …and even on desktop, don't fetch it until the pointer actually arrives.
// Mounting it eagerly doubled the number of product images the homepage
// requests (40 tiles → 80 images); `loading="lazy"` only delays them to
// near-viewport, it doesn't prevent them. Most visitors hover a handful of
// cards at most, so this turns a guaranteed 2× image cost into a per-card
// one paid only when it's about to be seen. Latched, so leaving and
// re-entering doesn't unmount and refetch.
const hasHovered = ref(false)
const onCardEnter = () => { hasHovered.value = true }

const isImageLoading = ref(true)
const isImageError = ref(false)
const isAddedToCart = ref(false)
let addedToCartTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => imageSrc.value,
  (nextImage) => {
    isImageLoading.value = Boolean(nextImage)
    isImageError.value = false
  },
  { immediate: true },
)

const onImageLoaded = () => {
  isImageLoading.value = false
}

const onImageError = () => {
  isImageLoading.value = false
  isImageError.value = true
}

// When navigating back, product images are already in the browser cache, so the
// <img> is `complete` before Vue attaches the @load listener and the load event
// never fires — leaving the image stuck at opacity:0. Detect that on mount.
onMounted(async () => {
  await nextTick()
  const img = imageWrapRef.value?.querySelector('img') as HTMLImageElement | null
  if (img?.complete) {
    if (img.naturalWidth > 0) isImageLoading.value = false
    else onImageError()
  }
})

const showAddedState = () => {
  isAddedToCart.value = true

  if (addedToCartTimer) {
    clearTimeout(addedToCartTimer)
  }

  addedToCartTimer = setTimeout(() => {
    isAddedToCart.value = false
    addedToCartTimer = null
  }, 1700)
}

onBeforeUnmount(() => {
  if (addedToCartTimer) {
    clearTimeout(addedToCartTimer)
  }
})

const handleAddToCart = (event: MouseEvent) => {
  cart.addToCart(props.product)
  showAddedState()

  flyToCart({
    sourceEl: imageWrapRef.value ?? (event.currentTarget as HTMLElement | null),
    imageSrc: imageSrc.value,
  })
}

// ── Favorites (optimistic toggle; grid doesn't pre-fetch state to save requests)
const toast = useCosmicToast()
const isFavorite = ref(false)
const favLoading = ref(false)

const toggleFavorite = async () => {
  if (favLoading.value) return
  favLoading.value = true
  const prev = isFavorite.value
  isFavorite.value = !prev
  try {
    const res = await $fetch<{ isFavorite: boolean }>(`/api/products/${props.product.id}/favorite`, { method: 'POST' })
    isFavorite.value = res.isFavorite
  } catch (e) {
    isFavorite.value = prev
    toast.error('Oblíbené', 'Pro ukládání oblíbených se přihlas.')
  } finally {
    favLoading.value = false
  }
}
</script>

<template>
  <NuxtLink
    :to="productUrl"
    class="product-card group relative flex w-full flex-col h-full"
    :style="{ '--tilt': tilt + 'deg' }"
    :aria-label="product.title"
    @pointerenter="onCardEnter"
    @focusin="onCardEnter"
  >
    <!-- Image frame -->
    <div ref="imageWrapRef" class="card-image relative w-full aspect-[5/4] overflow-hidden rounded-xl">
      <NuxtImg
        v-if="imageSrc && !isImageError"
        :src="imageSrc"
        :alt="product.title"
        class="card-img w-full h-full object-cover"
        :class="[ isImageLoading ? 'is-loading' : '' ]"
        width="500"
        height="400"
        format="webp"
        quality="72"
        sizes="45vw md:31vw lg:23vw"
        :loading="isPriority ? 'eager' : 'lazy'"
        :preload="isPriority || undefined"
        :fetchpriority="isPriority ? 'high' : 'auto'"
        @load="onImageLoaded"
        @error="onImageError"
      />

      <!-- Second photo, cross-faded in on hover (desktop pointers only) -->
      <NuxtImg
        v-if="secondImageSrc && !isImageError && canHover && hasHovered"
        :src="secondImageSrc"
        :alt="product.title"
        class="card-img card-img--hover w-full h-full object-cover"
        width="500"
        height="400"
        format="webp"
        quality="72"
        sizes="45vw md:31vw lg:23vw"
        loading="lazy"
        aria-hidden="true"
      />

      <div
        v-if="imageSrc && isImageLoading && !isImageError"
        class="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      >
        <Icon name="lucide:loader-2" height="26" class="animate-spin text-white/70" />
      </div>

      <div v-if="!imageSrc || isImageError" class="w-full h-full flex flex-col items-center justify-center text-white/20 bg-white/5">
        <Icon name="mdi:image-off-outline" height="44" />
      </div>

      <!-- Desktop add-to-cart button -->
      <div class="card-cta absolute inset-x-0 bottom-0 p-2.5 hidden lg:flex justify-end">
        <button
          @click.prevent.stop="handleAddToCart"
          class="add-btn"
          :class="{ 'is-added': isAddedToCart }"
          :aria-label="'Přidat do košíku: ' + product.title"
        >
          <Icon :name="isAddedToCart ? 'mdi:check-bold' : 'mdi:plus'" height="18" />
        </button>
      </div>
    </div>

    <!-- Info block -->
    <div class="card-info">
      <h3 class="card-title">
        {{ product.title }}
      </h3>

      <p v-if="product.description" class="card-desc">{{ product.description }}</p>

      <!-- Add-to-cart on the card is desktop-only (the hover pill over the image).
           On mobile the whole card links to the product detail. -->
      <div class="card-info-bottom">
        <div class="card-price">
          <span class="psy-display price-num">{{ product.price }}</span>
          <span class="price-currency">Kč</span>
        </div>

        <button
          class="fav-btn"
          :class="{ 'is-fav': isFavorite, 'is-loading': favLoading }"
          @click.prevent.stop="toggleFavorite"
          :aria-label="isFavorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'"
          :title="isFavorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'"
        >
          <Icon :name="isFavorite ? 'mdi:heart' : 'mdi:heart-outline'" height="20" />
        </button>
      </div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.product-card {
  text-decoration: none;
  color: inherit;
  background: var(--pop-plum, #182a1c);
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 0.85rem;
  padding: 0.5rem 0.5rem 0.6rem;
  transform: rotate(var(--tilt, 0deg));
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease;
  box-shadow: 4px 5px 0 rgba(32, 8, 40, 0.55);
}
.product-card:hover {
  transform: rotate(0deg) translateY(-4px);
  box-shadow: 7px 9px 0 var(--pop-pink, #E7488B);
  z-index: 2;
}

/* ── Image frame — black so the product photos (shot on black) blend in ── */
.card-image {
  background: #000000;
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 0.6rem;
  transition: border-color 0.3s ease;
}

.card-img {
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease;
  opacity: 1;
}
.card-img.is-loading {
  opacity: 0;
  transform: scale(1.04);
}
.product-card:hover .card-img {
  transform: scale(1.06);
}

/* Second photo overlays the first and cross-fades in on hover. */
.card-img--hover {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.product-card:hover .card-img--hover {
  opacity: 1;
}

/* Add-to-cart button (desktop) — floating pill */
.card-cta {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.product-card:hover .card-cta {
  opacity: 1;
  transform: translateY(0);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  /* Opaque rather than translucent-with-backdrop-filter. A blur here is billed
     once per card, and with 40 tiles on the homepage that is 40 backdrop
     filters the compositor has to maintain — for a 34px button sitting on a
     solid black photo frame, where the blur is invisible anyway. */
  background: rgba(10, 0, 16, 0.92);
  border: 1px solid rgba(255, 107, 181, 0.55);
  color: #fff;
  transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
}
.add-btn:hover {
  background: #ff6bb5;
  border-color: #ff6bb5;
  transform: scale(1.06);
  box-shadow: 0 8px 22px rgba(255, 107, 181, 0.45);
}
.add-btn.is-added {
  background: #34d399;
  border-color: #34d399;
}

/* ── Info ──────────────────────────────────────────── */
.card-info {
  margin-top: 0.55rem;
  padding: 0 0.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-grow: 1;
}

.card-title {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.92rem;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: #FDF7EC;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (min-width: 768px) {
  .card-title { font-size: 0.98rem; -webkit-line-clamp: 1; }
}

/* Short description in the space freed up by the shorter landscape image. */
.card-desc {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #ffffff;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (max-width: 639px) {
  .card-desc { display: none; }
}

/* Favorites (heart) button */
.fav-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}
.fav-btn:hover { color: #ff6bb5; border-color: rgba(255, 107, 181, 0.5); background: rgba(255, 107, 181, 0.1); }
.fav-btn:active { transform: scale(0.9); }
.fav-btn.is-fav { color: #ff5c8a; border-color: rgba(255, 92, 138, 0.55); background: rgba(255, 92, 138, 0.14); }
.fav-btn.is-loading { opacity: 0.6; }
/* Phones: tighter card so the image dominates; show the title (not the number),
   price underneath, no add button. */
@media (max-width: 639px) {
  .product-card { padding: 0.45rem 0.45rem 0.7rem; border-radius: 1rem; }
  .card-info { margin-top: 0.6rem; gap: 0.3rem; padding: 0 0.15rem; }
  .card-title {
    font-size: 1.08rem;
    line-height: 1.25;
    min-height: 0;
    -webkit-line-clamp: 2;
  }
  .card-info-bottom { padding-top: 0.45rem; }
  .price-num { font-size: 1.35rem; }
  .fav-btn { width: 36px; height: 36px; }
}

.card-info-bottom {
  margin-top: auto;
  padding-top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.card-price {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
  padding-top: 0.45rem;
}

.price-num {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 1.4rem;
  letter-spacing: -0.01em;
  color: var(--pop-lime, #B9E14B);
  line-height: 1;
}
@media (min-width: 768px) {
  .price-num { font-size: 1.5rem; }
}

.price-currency {
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pop-lime, #B9E14B);
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .product-card:hover { transform: none; }
  .product-card:hover .card-img { transform: none; }
}
</style>
