<script setup lang="ts">
import { useCartStore } from "~/stores/cart";
// The one flat shipping fee the server actually prices orders with — never
// re-typed here, so the PDP note and the structured data can't drift from the
// checkout total (see shared/shop.ts).
import { SHIPPING_FEE } from "~~/shared/shop";

import ContactForm from "~/components/ContactForm.vue";

const route = useRoute();
const router = useRouter();

const goBack = () => {
  // Go back to wherever the user came from (category, catalog, homepage…) so the
  // browser restores the exact scroll position of that page. Fall back to the
  // homepage only when there's no in-app history to return to.
  if (import.meta.client && window.history.state?.back) {
    router.back();
  } else {
    router.push('/');
  }
};
// Blocking fetch (not lazy): navigation waits for the product so the page fades
// straight into real content instead of flashing a loading skeleton first.
const { data: asyncProduct, pending, error } = useAsyncData(`product-${route.params.id}`, () =>
  Promise.all([
    $fetch<any>(`/api/products/${route.params.id}`)
  ])
);
const product = computed(() => asyncProduct.value?.[0] || null);

// Fetch similar products based on the loaded product category
const { data: asyncSimilarProducts } = useLazyAsyncData(
  `similar-${route.params.id}`,
  async () => {
    if (!product.value?.category) return [];
    try {
      const res = await $fetch<any>(`/api/products?category=${encodeURIComponent(product.value.category)}&limit=8`);
      return res?.filter((p: any) => p.id !== product.value.id) || [];
    } catch {
      return [];
    }
  },
  { watch: [product] }
);
const similarProducts = computed(() => asyncSimilarProducts.value?.slice(0, 6) || []);
const cart = useCartStore();
const { flyToCart } = useFlyToCartAnimation()
const toast = useCosmicToast()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl || useRequestURL().origin

const mainImageWrapRef = ref<HTMLElement | null>(null)
const addToCartButtonRef = ref<HTMLButtonElement | null>(null)
const selectedImageIndex = ref(0);
const imageSlideDirection = ref<'next' | 'prev'>('next');
const isMainImageLoading = ref(false);
const isMainImageError = ref(false);
const thumbnailLoading = ref<Record<number, boolean>>({});
const thumbnailError = ref<Record<number, boolean>>({});
const isAddedToCart = ref(false)
let addedToCartTimer: ReturnType<typeof setTimeout> | null = null
const isTogglingFavorite = ref(false);
const selectedQuantity = ref(1);

// Fetch favorite status (API returns isFavorite: false when not logged in)
interface FavoriteStatus { isFavorite: boolean }
const { data: favoriteStatus, refresh: refreshFavorite } = useLazyFetch<FavoriteStatus>(
  () => product.value?.id ? `/api/products/${product.value.id}/favorite` : '',
  { 
    immediate: !!product.value?.id,
    watch: [product],
    default: () => ({ isFavorite: false }) 
  }
);

const isFavorite = computed(() => favoriteStatus.value?.isFavorite ?? false);

const allImages = computed(() => {
  if (!product.value) return [];
  const imgs = (product.value as any).images;
  if (imgs && Array.isArray(imgs) && imgs.length > 0) {
    return imgs.map((img: string) => (img.startsWith("http") || img.startsWith("/") ? img : `/${img}`));
  }
  if (product.value.image) {
    return [
      product.value.image.startsWith("http") || product.value.image.startsWith("/") ? product.value.image : `/${product.value.image}`,
    ];
  }
  return [];
});

const selectedImage = computed(() => allImages.value[selectedImageIndex.value] || null);
const imageTransitionName = computed(() => (
  imageSlideDirection.value === 'next' ? 'gallery-slide-next' : 'gallery-slide-prev'
));

const setSelectedImage = (index: number) => {
  if (index === selectedImageIndex.value) {
    return;
  }

  imageSlideDirection.value = index > selectedImageIndex.value ? 'next' : 'prev';
  selectedImageIndex.value = index;
};

watch(
  () => selectedImage.value,
  () => {
    isMainImageError.value = false;
  },
);

watch(
  () => allImages.value,
  (images) => {
    if (selectedImageIndex.value >= images.length) {
      selectedImageIndex.value = 0;
    }

    const nextError: Record<number, boolean> = {};
    images.forEach((_, index) => {
      nextError[index] = false;
    });

    thumbnailLoading.value = {};
    thumbnailError.value = nextError;
  },
  { immediate: true },
);

const onMainImageLoaded = () => {
  isMainImageLoading.value = false;
};

const onMainImageError = () => {
  isMainImageLoading.value = false;
  isMainImageError.value = true;
};

const onThumbnailLoaded = (index: number) => {
  thumbnailLoading.value[index] = false;
};

const onThumbnailError = (index: number) => {
  thumbnailLoading.value[index] = false;
  thumbnailError.value[index] = true;
};

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

const canonicalUrl = computed(() => {
  const slug = (product.value as any)?.slug
  return `${siteUrl}/product/${slug || route.params.id}`
})

useSeoMeta({
  title: () => (product.value ? `${(product.value as any).title || (product.value as any).name}` : 'Produkt'),
  description: () => {
    const p: any = product.value
    const desc = p?.shortDescription || p?.description || ''
    return desc ? String(desc).slice(0, 160) : 'Detail produktu v Tynky Bordel.'
  },
  ogTitle: () => (product.value ? `${(product.value as any).title || (product.value as any).name} | Tynky Bordel` : 'Produkt | Tynky Bordel'),
  ogDescription: () => {
    const p: any = product.value
    const desc = p?.shortDescription || p?.description || ''
    return desc ? String(desc).slice(0, 200) : 'Detail produktu v Tynky Bordel.'
  },
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
  ogImage: () => selectedImage.value || undefined,
  twitterCard: 'summary_large_image',
})
const jsonLd = computed(() => {
  if (!product.value) return [];
  const p: any = product.value;
  const img = selectedImage.value?.startsWith('http') ? selectedImage.value : `${siteUrl}${selectedImage.value || ''}`;

  // Keep prices "valid" a year out so Google doesn't flag a stale/expired offer.
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  const priceValidUntil = validUntil.toISOString().split('T')[0];

  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonicalUrl.value}#product`,
    name: p.title || p.name,
    description: p.shortDescription || p.description,
    image: img,
    sku: String(p.id),
    mpn: String(p.id),
    category: p.category || undefined,
    brand: {
      '@type': 'Brand',
      name: p.brand || 'Tynky Bordel'
    },
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'CZK',
      priceValidUntil,
      itemCondition: 'https://schema.org/NewCondition',
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonicalUrl.value,
      seller: { '@id': `${siteUrl}/#organization` },
      // Return policy — 14 days per Czech distance-selling law.
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'CZ',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 14,
        returnMethod: 'https://schema.org/ReturnByMail',
        // NOT FreeReturn — both the VOP and /reklamace say the buyer pays the
        // return postage, and Google renders FreeReturn as a "free returns"
        // badge in the search result, which would be a false claim.
        // ReturnFeesCustomerResponsibility is the enum for exactly that case.
        // ReturnShippingFees is the wrong one here: it obliges us to state a
        // concrete returnShippingFeesAmount, and we can't — the buyer picks
        // their own carrier, so the amount is unknown to us.
        returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility'
      },
      // Shipping — dispatched from Czechia via Zásilkovna/Balíkovna.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CZ' },
        // The flat fee charged on every order. Without it Google guesses (and
        // may show the product as shipping-cost-unknown); with it the rich
        // result matches the checkout total to the crown.
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: SHIPPING_FEE,
          currency: 'CZK'
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          // 2–7 working days, the same window /obchodni-podminky, /reklamace and
          // the shipping note on this page all promise. It used to claim 1–3,
          // which undercut every one of them — structured data a buyer can hold
          // us to must not be more optimistic than the terms.
          handlingTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 7, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' }
        }
      }
    }
  };

  // No `review` / aggregateRating from customer reviews any more: reviews are
  // written per purchased order line and displayed on the homepage, not here
  // (see the note in the template). Google requires a review's markup to be
  // visible on the same page, so emitting it here would be invalid structured
  // data. The manual `p.rating` fallback below stays.
  if (p.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: p.rating,
      reviewCount: p.reviewsCount || 1,
      bestRating: 5,
      worstRating: 1
    };
  }

  // Breadcrumb: Domů › (kategorie) › produkt
  const crumbs: any[] = [{ '@type': 'ListItem', position: 1, name: 'Domů', item: `${siteUrl}/` }];
  if (p.category) {
    crumbs.push({ '@type': 'ListItem', position: 2, name: p.category, item: `${siteUrl}/category/${encodeURIComponent(p.category)}` });
  }
  crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: p.title || p.name, item: canonicalUrl.value });
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
  };

  return [schema, breadcrumbSchema];
});

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  script: jsonLd.value.map((s) => ({
    type: 'application/ld+json',
    innerHTML: JSON.stringify(s)
  }))
}))

const addToCart = (event?: MouseEvent) => {
  if (!product.value || product.value.stock <= 0) {
    return
  }

  cart.addToCart(product.value, selectedQuantity.value)
  showAddedState()

  flyToCart({
    sourceEl: mainImageWrapRef.value ?? addToCartButtonRef.value ?? (event?.currentTarget as HTMLElement | null),
    imageSrc: selectedImage.value,
  })
};

const toggleFavorite = async () => {
  if (!product.value?.id || isTogglingFavorite.value) return;
  isTogglingFavorite.value = true;
  try {
    const result: any = await $fetch(`/api/products/${product.value.id}/favorite`, { method: "POST" });
    await refreshFavorite();
    if (result?.isFavorite === true) toast.success('Přidáno', 'Produkt je v oblíbených.')
    else if (result?.isFavorite === false) toast.info('Odebráno', 'Produkt byl odebrán z oblíbených.')
  } catch (err: any) {
    if (err?.statusCode === 401 || err?.data?.statusCode === 401) {
      toast.info('Je potřeba přihlášení', 'Pro oblíbené se prosím přihlaste.')
      return
    }
    toast.error('Nepodařilo se', err?.data?.statusMessage || "Akci se nepodařilo provést.");
  } finally {
    isTogglingFavorite.value = false;
  }
};

</script>

<template>
  <div class="product-detail max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-12">
    <!-- Loading Skeleton -->
    <div v-if="pending" class="relative">
      <div class="inline-flex items-center gap-2 text-white/40 mb-4 md:mb-8">
        <Icon name="ep:arrow-left-bold" height="16" />
        <span class="text-sm">Zpět</span>
      </div>

      <div class="pdp-panel overflow-hidden animate-pulse">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">

          <!-- Image Skeleton -->
          <div class="pdp-gallery p-4 md:p-8">
            <div class="w-full aspect-square rounded-xl md:rounded-2xl bg-white/5 mb-3 md:mb-4"></div>
            <div class="flex gap-2 md:gap-3 overflow-hidden h-16 md:h-20">
              <div class="w-16 md:w-20 rounded-lg md:rounded-xl bg-white/5 flex-shrink-0"></div>
              <div class="w-16 md:w-20 rounded-lg md:rounded-xl bg-white/5 flex-shrink-0"></div>
              <div class="w-16 md:w-20 rounded-lg md:rounded-xl bg-white/5 flex-shrink-0"></div>
            </div>
          </div>

          <!-- Content Skeleton -->
          <div class="flex flex-col justify-center p-5 md:p-8 lg:p-12">
            <div class="h-6 w-24 bg-white/10 rounded-full mb-3 md:mb-5"></div>
            <div class="h-10 md:h-12 w-4/5 bg-white/10 rounded mb-3 md:mb-5"></div>
            <div class="h-10 w-32 bg-white/10 rounded mb-5 md:mb-8"></div>
            
            <div class="space-y-3 mb-6 md:mb-10 pl-4 border-l-2 border-white/5">
              <div class="h-4 w-full bg-white/10 rounded"></div>
              <div class="h-4 w-11/12 bg-white/10 rounded"></div>
              <div class="h-4 w-4/5 bg-white/10 rounded"></div>
            </div>

            <div class="border-t border-white/10 pt-5 md:pt-8">
              <div class="flex justify-between items-center mb-5 md:mb-8">
                <div class="h-10 w-32 bg-white/10 rounded-xl"></div>
                <div class="h-4 w-16 bg-white/10 rounded"></div>
              </div>
              <div class="h-14 md:h-16 w-full bg-white/10 rounded-xl md:rounded-2xl"></div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="pdp-panel pdp-panel--dark p-8 md:p-12 text-center">
      <div class="text-4xl mb-4">😵</div>
      <p class="font-bold text-lg text-white mb-2">Chyba při načítání</p>
      <p class="text-white/50">{{ error.message }}</p>
    </div>

    <!-- Product Detail -->
    <div v-else-if="product" class="relative">
      <!-- Back button -->
      <NuxtLink 
        to="/" 
        @click.prevent="goBack"
        v-fly="{ direction: 'left', distance: 20, duration: 640 }" 
        class="relative z-[100] inline-flex items-center gap-2 text-white/50 hover:text-white transition-all mb-6 md:mb-10 group cursor-pointer px-4 py-2 -ml-4"
      >
        <Icon name="ep:arrow-left-bold" height="16" class="transition-transform group-hover:-translate-x-1" />
        <span class="text-xs md:text-sm font-semibold tracking-wide uppercase">Zpět</span>
      </NuxtLink>

      <div class="pdp-panel overflow-hidden" v-fly="{ direction: 'up', distance: 42 }">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">

          <!-- Image Section -->
          <div class="pdp-gallery p-4 md:p-8">
            <!-- Main Image -->
            <div ref="mainImageWrapRef" class="pdp-frame relative w-full aspect-square overflow-hidden mb-3 md:mb-4 group/main">
              <Transition :name="imageTransitionName" mode="out-in">
                <div
                  :key="selectedImage ? `${selectedImage}-${selectedImageIndex}` : `fallback-${selectedImageIndex}`"
                  class="absolute inset-0"
                >
                  <!-- The product page's LCP element. `densities="1"` because
                       nuxt.config's image.densities never applies: defu
                       concatenates module-option arrays, so the runtime value is
                       [1,1,2] and a DPR-2.6 phone pulled a 1280×1280 render for
                       a half-width slot. Remove the prop once the config is
                       fixed, not before. -->
                  <NuxtImg
                    v-if="selectedImage && !isMainImageError"
                    :src="selectedImage"
                    :alt="product.title || product.name"
                    class="h-full w-full object-cover object-center"
                    width="1200"
                    height="1200"
                    format="webp"
                    quality="80"
                    densities="1"
                    sizes="100vw md:560px lg:620px"
                    loading="eager"
                    fetchpriority="high"
                    @load="onMainImageLoaded"
                    @error="onMainImageError"
                  />

                  <div v-if="!selectedImage || isMainImageError" class="flex h-full w-full items-center justify-center text-white/20">
                    <Icon name="mdi:image-off-outline" height="48" />
                  </div>
                </div>
              </Transition>

              <div
                v-if="selectedImage && isMainImageLoading && !isMainImageError"
                class="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]"
              >
                <Icon name="lucide:loader-2" class="animate-spin text-primary-300/80" height="34" />
              </div>

              <!-- Image counter -->
              <div v-if="allImages.length > 1" class="absolute bottom-3 right-3 cosmic-badge text-[10px] z-10 font-bold">
                {{ selectedImageIndex + 1 }} / {{ allImages.length }}
              </div>
            </div>

            <!-- Thumbnail Strip -->
            <div v-if="allImages.length > 1" class="flex gap-2 md:gap-3 overflow-x-auto px-1 pt-1 pb-2 -mx-1 hide-scrollbar">
              <button
                v-for="(img, idx) in allImages"
                :key="idx"
                @click="setSelectedImage(idx)"
                class="pdp-thumb relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden transition-all duration-300 micro-lift"
                :class="selectedImageIndex === idx ? 'pdp-thumb--on' : 'pdp-thumb--off'"
              >
                <NuxtImg
                  v-if="!thumbnailError[idx]"
                  :src="img"
                  :alt="`${product.title || product.name} - ${idx + 1}`"
                  class="w-full h-full object-cover"
                  width="160"
                  height="160"
                  format="webp"
                  loading="lazy"
                  @error="onThumbnailError(idx)"
                />

                <div
                  v-if="thumbnailLoading[idx] && !thumbnailError[idx]"
                  class="absolute inset-0 flex items-center justify-center bg-black/30"
                >
                  <Icon name="lucide:loader-2" class="animate-spin text-primary-300/80" height="16" />
                </div>

                <div
                  v-if="thumbnailError[idx]"
                  class="absolute inset-0 flex items-center justify-center bg-black/30 text-white/30"
                >
                  <Icon name="mdi:image-off-outline" height="16" />
                </div>
              </button>
            </div>
          </div>

          <!-- Content Section -->
          <div class="flex flex-col justify-center p-5 md:p-8 lg:p-12 text-white">
            <!-- Category -->
            <div class="mb-3 md:mb-5">
              <span class="cosmic-badge">
                {{ product.category }}
              </span>
            </div>

            <!-- Title -->
            <h1 class="text-2xl md:text-3xl lg:text-5xl font-extrabold tracking-tight text-white mb-3 md:mb-5 neon-text leading-tight">
              {{ product.title }}
            </h1>

            <!-- Price. The gap below it belongs to the shipping note when that
                 note is shown; a sold-out piece has no note, so the price keeps
                 the original spacing itself. -->
            <div
              class="flex items-baseline gap-2"
              :class="product.stock > 0 ? 'mb-2 md:mb-3' : 'mb-5 md:mb-8'"
            >
              <span class="text-3xl md:text-4xl font-black neon-text-rainbow">{{ product.price }}</span>
              <span class="pdp-currency text-lg md:text-xl">Kč</span>
            </div>

            <!-- What the price does NOT include, said here rather than three
                 clicks later in the checkout. Meeting the shipping fee and the
                 dispatch window for the first time on the payment step is a
                 classic reason to abandon a cart, so it's a footnote to the
                 price — attached to it, never shouting over it.
                 The 2–7 pracovních dnů is the same promise /reklamace and
                 /obchodni-podminky make; if one changes, all three must.
                 The fee itself comes from shared/shop.ts, so it can't drift
                 from what the server actually charges.
                 Hidden for a sold-out piece (those stay up for 24 h marked
                 PRODÁNO) — promising a dispatch window for something nobody can
                 buy would be a claim we can't keep. -->
            <p v-if="product.stock > 0" class="pdp-ship-note mb-5 md:mb-8">
              <Icon name="mdi:truck-outline" height="14" class="pdp-ship-note__icon" />
              <span>+ doprava {{ SHIPPING_FEE }} Kč · odesíláme do 2–7 pracovních dnů</span>
              <NuxtLink to="/reklamace" class="pdp-ship-note__link">Doprava a reklamace</NuxtLink>
            </p>

            <!-- Description -->
            <div v-if="product.description" class="text-white/50 mb-6 md:mb-10 leading-relaxed text-sm md:text-base border-l-2 border-primary-500/30 pl-4">
              <p>{{ product.description }}</p>
            </div>

            <!-- Stock & Actions -->
            <div class="border-t border-white/10 pt-5 md:pt-8">
              <div class="flex items-center justify-between mb-5 md:mb-8">
                <div class="flex items-center gap-2">
                  <div class="pdp-chip flex items-center px-3 md:px-4 py-2 md:py-2.5">
                    <div
                      class="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full mr-2 md:mr-3 shadow-[0_0_10px_currentColor]"
                      :class="product.stock > 0 ? 'bg-green-400 text-green-400' : 'bg-red-500 text-red-500'"
                    ></div>
                    <span
                      class="text-xs md:text-sm font-semibold tracking-wide uppercase"
                      :class="product.stock > 0 ? 'text-green-300' : 'text-red-300'"
                    >
                      {{ product.stock > 0 ? 'Skladem' : 'Prodáno' }}
                    </span>
                  </div>
                  <button
                    @click="toggleFavorite"
                    :disabled="isTogglingFavorite"
                    class="pdp-fav flex items-center justify-center w-10 h-10 transition-all duration-300 micro-lift"
                    :class="isFavorite ? 'pdp-fav--on' : 'pdp-fav--off'"
                    :title="isFavorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'"
                  >
                    <Icon v-if="isTogglingFavorite" name="lucide:loader-2" class="animate-spin" height="20" />
                    <Icon v-else :name="isFavorite ? 'mdi:heart' : 'mdi:heart-outline'" height="22" />
                  </button>
                </div>
              </div>

              <!-- Quantity Selector — only when more than one piece is in stock.
                   Most products are one-of-a-kind (stock 1), so a stepper there
                   would be pointless; quantity stays pinned at 1. -->
              <div v-if="product.stock > 1" class="flex items-center gap-4 mb-6">
                <span class="text-sm font-semibold text-white/50 uppercase tracking-wider">Množství:</span>
                <div class="pdp-chip pdp-chip--stepper flex items-center px-2 py-1">
                  <button 
                    @click="selectedQuantity = Math.max(1, selectedQuantity - 1)"
                    type="button"
                    class="pdp-step w-10 h-10 flex items-center justify-center transition-colors"
                  >
                    <Icon name="mdi:minus" height="20" />
                  </button>
                  <input 
                    v-model.number="selectedQuantity"
                    type="number"
                    min="1"
                    :max="product.stock"
                    class="pdp-qty w-12 text-center bg-transparent border-none focus:ring-0 font-bold"
                  />
                  <button 
                    @click="selectedQuantity = Math.min(product.stock, selectedQuantity + 1)"
                    type="button"
                    class="pdp-step w-10 h-10 flex items-center justify-center transition-colors"
                  >
                    <Icon name="mdi:plus" height="20" />
                  </button>
                </div>
              </div>

              <button
                ref="addToCartButtonRef"
                type="button"
                @click="addToCart"
                class="pdp-buy w-full min-h-[3.5rem] md:min-h-[4rem] px-6 flex items-center justify-center gap-2 md:gap-3 py-4 text-base md:text-lg focus:outline-none"
                :disabled="product.stock <= 0"
                :class="product.stock > 0
                  ? (isAddedToCart ? 'pdp-buy--added' : 'pdp-buy--go')
                  : 'pdp-buy--off'"
              >
                <Icon :name="isAddedToCart ? 'mdi:check-bold' : 'mdi:cart-plus'" height="22" />
                {{ product.stock > 0 ? (isAddedToCart ? 'Přidáno do košíku' : 'Přidat do košíku') : 'Prodáno' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Similar Products -->
      <div v-if="similarProducts.length > 0" class="mt-12 md:mt-16">
        <h2 class="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8 neon-text-cyan flex items-center gap-3">
          <Icon name="lucide:sparkles" class="pdp-spark" />
          Také by se vám mohlo líbit
        </h2>
        <ProductCarousel :products="similarProducts" />
      </div>

      <!-- Recenze zde ZÁMĚRNĚ nejsou: každý kus je originál, takže ve chvíli, kdy
           by ho někdo mohl hodnotit, je prodaný a tahle stránka už neexistuje.
           Zákazník píše recenzi v historii objednávek (/user → Moje objednávky)
           a všechny recenze se ukazují dole na hlavní stránce. -->

      <!-- Contact Form / Newsletter -->
      <div class="mt-16 md:mt-24 mb-10">
        <ContactForm />
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="pdp-panel pdp-panel--dark p-8 md:p-12 text-center" v-fly="{ direction: 'up', distance: 32 }">
      <div class="text-4xl md:text-5xl mb-4">🌑</div>
      <h2 class="text-2xl md:text-3xl font-bold text-white mb-4 neon-text">Produkt nenalezen</h2>
      <p class="text-white/40 mb-6 md:mb-8 text-sm md:text-base">Tento produkt se ztratil ve vesmíru...</p>
      <NuxtLink to="/" class="btn-cosmic-outline inline-flex items-center gap-2 text-sm md:text-base">
        <Icon name="ep:arrow-left-bold" height="16" />
        Zpět
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   PDP SURFACES — one palette, five roles
   ─────────────────────────────────────────────────────────────────────────
   olive        --pop-plum    the product panels. The detail page is the
                              product card blown up, so it keeps the card's
                              ground (and its chrome: 2px ink border, hard
                              offset shadow, no blur).
   raised olive --pop-plum-2  a surface sitting ON an olive panel: the gallery
                              half, and every review entry.
   cream        --pop-cream   "paper stickers" pasted onto the olive — the
                              stock pill, the quantity stepper, the review
                              form. This is what keeps the page from becoming
                              a wall of green, and it borrows the page's own
                              paper rather than introducing a new colour.
   black        #000000       photo frames only, exactly like ProductCard's
                              .card-image — the product shots are shot on
                              black and blend into it.
   near-black   --pop-panel   reserved for the error / not-found states, so a
                              failure reads as a different kind of surface.
   The page ground itself is untouched cream paper: the back link, the
   "podobné kousky" heading and the carousel below it still sit on it.

   The markup is still the old dark-cosmic Tailwind (text-white, bg-white/X),
   so descendant utilities are re-pointed via attribute selectors rather than
   rewriting 300 lines of template. Two ladders: page ground → ink, inside a
   panel → on-dark, inside a cream sticker → ink again.

   NOTE: the previous version of these selectors wrote the Tailwind slash as
   `text-white\\/40`, which in a CSS string is backslash+slash and matched
   nothing. Plain tokens here — no escaping is needed inside quotes.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 0. Two local colours the shared palette has no exact match for ─────
   Everything else on this page goes through main.css's --pop-* tokens, which
   flip themselves via light-dark(). These two do not exist there:

   --pdp-on-olive  The paper white for every foreground on the olive panels.
                   It is deliberately NOT --pop-on-dark (#F0E7D2): this page
                   was tuned at the brighter #FDF7EC and every contrast note
                   below is measured against it. The olive panels are dark in
                   BOTH themes, so there is nothing to flip — one constant.
   --pdp-ok        The "Skladem" green. It lands on the cream sticker, which
                   IS the page ground and therefore flips to near-black in
                   dark, so the green has to flip with it. --pop-danger
                   already covers the red half of the pill; there is no green
                   equivalent (--pop-green is a single constant that only
                   works on a dark ground), so the light side keeps this
                   file's on-cream green and the dark side takes --pop-green's
                   value, which is what that constant was picked for.
   Guarded exactly like main.css: without light-dark() the plain block stands
   and the light theme is untouched. */
.product-detail {
  --pdp-on-olive: #FDF7EC;
  --pdp-ok: #1b6b33;
}
@supports (color: light-dark(#fff, #000)) {
  .product-detail {
    --pdp-ok: light-dark(#1b6b33, #A8DF8E);
  }
}

/* ── 1. Page ground: cream paper ──────────────────────────────────────── */
.product-detail :is(h1, h2, h3) {
  color: var(--pop-ink, #14231a) !important;
}
.product-detail [class~="text-white"],
.product-detail [class*="text-white/"] {
  color: var(--pop-ink, #14231a) !important;
}
/* 5.16:1 — the back link is small uppercase text, so the muted tint has to
   clear AA for normal text, not just large. */
.product-detail [class~="text-white/40"],
.product-detail [class~="text-white/50"] {
  color: color-mix(in srgb, var(--pop-ink) 68%, transparent) !important;
}
/* Tailwind's hover variant is the token `hover:text-white`, which no
   [class~="text-white"] selector catches — so the back link used to flip to
   pure white (1.1:1 on paper) the moment you pointed at it. */
.product-detail [class*="hover:text-white"]:hover {
  color: var(--pop-ink, #14231a) !important;
}
/* Neon gradients are unreadable on paper — flatten to ink. */
.product-detail .neon-text,
.product-detail .neon-text-cyan,
.product-detail .neon-text-rainbow {
  color: var(--pop-ink, #14231a) !important;
  background: none !important;
  background-clip: unset !important;
  -webkit-background-clip: unset !important;
  -webkit-text-fill-color: currentColor !important;
  text-shadow: none !important;
}
/* The sparkle beside "Také by se vám mohlo líbit" was text-yellow-300, which
   is 1.15:1 on cream. Rose-ink is the palette's on-cream accent: 4.12:1. */
.pdp-spark {
  color: var(--pop-pink-ink, #b34a72);
}

/* Main heading: display face on top of the colour. Bricolage Grotesque has
   proper Czech latin-ext glyphs — Caprasimo mangled the diacritics. */
.product-detail h1 {
  font-family: var(--font-zine), sans-serif !important;
  font-weight: 800 !important;
  letter-spacing: -0.02em;
}
.product-detail h2 {
  font-family: var(--font-mono) !important;
}

/* ── 2. Panels ─────────────────────────────────────────────────────────── */
.pdp-panel {
  background: var(--pop-plum, #3b5222);
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 16px;
  box-shadow: 6px 6px 0 var(--pop-shadow);
}
/* Error / not-found keep the near-black zine panel so a failed load doesn't
   look like a product. */
.pdp-panel--dark {
  background: var(--pop-panel, #201c19);
}
/* Gallery half sits one step up from the buy box, the way a mounted photo
   sits on a board. */
.pdp-gallery {
  background: var(--pop-plum-2, #4c6330);
}
@media (min-width: 1024px) {
  .pdp-gallery {
    border-right: 2px solid color-mix(in srgb, var(--pdp-on-olive) 28%, transparent);
  }
}

/* ── 3. Foregrounds inside a panel (on-dark) ───────────────────────────
   Values are the ones already contrast-checked for the olive "about" panel
   on the homepage, so the two pages agree. */
.product-detail .pdp-panel :is(h1, h2, h3) {
  color: var(--pdp-on-olive) !important; /* 8.15:1 on olive */
}
.product-detail .pdp-panel [class~="text-white"],
.product-detail .pdp-panel [class*="text-white/"] {
  color: var(--pdp-on-olive) !important;
}
.product-detail .pdp-panel [class~="text-white/40"],
.product-detail .pdp-panel [class~="text-white/50"],
.product-detail .pdp-panel [class~="text-white/70"] {
  color: color-mix(in srgb, var(--pop-on-dark) 85%, transparent) !important; /* 5.63:1 on olive */
}
/* These two only ever appear over the black photo frame (missing-image and
   thumbnail-error icons); 0.2/0.3 white would vanish, 0.45 cream is 4.20:1. */
.product-detail .pdp-panel [class~="text-white/20"],
.product-detail .pdp-panel [class~="text-white/30"] {
  color: color-mix(in srgb, var(--pdp-on-olive) 45%, transparent) !important;
}
.product-detail .pdp-panel .neon-text,
.product-detail .pdp-panel .neon-text-rainbow {
  color: var(--pdp-on-olive) !important;
  text-shadow: none !important;
}
/* Price → the same acid lime the card uses for its price. 5.77:1 on olive. */
.product-detail .pdp-panel .neon-text-rainbow,
.pdp-currency {
  color: var(--pop-lime, #B9E14B) !important;
  font-family: var(--font-mono) !important;
}
/* Shipping / dispatch footnote under the price. It has no Tailwind colour
   utility on purpose — the attribute selectors above would only re-point it,
   and this line needs its own deliberate weight — so everything is set here.
   Muted cream at 85% is the same on-olive secondary already used for the
   description (5.63:1), one step below the lime price, and the mono face at
   0.75rem keeps it in the "small print" register next to the 2rem price.
   Both colours are constants that do not flip: the panel is dark olive in
   light AND dark mode, so the note reads identically in both. */
.pdp-ship-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.4;
  color: color-mix(in srgb, var(--pop-on-dark) 85%, transparent);
}
@media (min-width: 768px) {
  .pdp-ship-note { font-size: 0.8125rem; }
}
/* The truck is decorative — dimmer than the text so it doesn't become the
   first thing the eye lands on after the price. */
.pdp-ship-note__icon {
  flex-shrink: 0;
  color: color-mix(in srgb, var(--pdp-on-olive) 60%, transparent);
}
/* Lime, not pink: pink only reaches 3.42:1 on olive, which is fine for an icon
   but not for a link this small. Lime is 5.77:1 — the same value the price
   uses, which also reads as "these two belong together". */
.pdp-ship-note__link {
  color: var(--pop-lime, #B9E14B);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
.pdp-ship-note__link:hover {
  text-decoration-thickness: 2px;
}

/* Divider hairlines: white/10 disappears on olive, cream/0.28 is the same
   hairline the homepage olive panel uses for its image border. */
.product-detail .pdp-panel [class*="border-white/"] {
  border-color: color-mix(in srgb, var(--pdp-on-olive) 28%, transparent) !important;
}
/* Description's accent bar — solid pink reads as a deliberate rule (3.42:1),
   the old 30%-alpha primary was invisible on this ground. */
.product-detail .pdp-panel [class*="border-primary-500/"] {
  border-color: var(--pop-pink, #E585AA) !important;
}
/* Loading-skeleton blocks. */
.product-detail .pdp-panel [class*="bg-white/"] {
  background: color-mix(in srgb, var(--pdp-on-olive) 14%, transparent) !important;
}
/* Scrims that sit over a photo, so they stay genuinely dark. */
.product-detail .pdp-panel [class*="bg-black/"] {
  background: rgba(0, 0, 0, 0.4) !important;
}
/* Spinners on those scrims — the leftover cosmic primary isn't in the zine
   palette; lime is, and it is 13.6:1 on the black frame. */
.product-detail .pdp-panel [class*="text-primary-300"] {
  color: var(--pop-lime, #B9E14B) !important;
}
/* Category chip + image counter become a blush sticker: ink on blush is
   11.94:1 and it works on both the olive panel and the black photo. */
.product-detail .pdp-panel .cosmic-badge {
  background: var(--pop-blush, #F7D3E0) !important;
  color: var(--pop-ink-on-accent, #14231a) !important;
  border: 2px solid var(--pop-ink-on-accent, #14231a) !important;
  font-family: var(--font-mono, monospace) !important;
  text-shadow: none !important;
}

/* ── 4. Photo frames — black, exactly like ProductCard .card-image ──────
   Literal #000000 on purpose, in both themes: the product shots are lit on a
   black seamless and the frame is the photo continuing past its own edge. A
   token here would make the frame drift away from the photograph. */
.pdp-frame {
  background: #000000;
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 0.6rem;
}
@media (min-width: 768px) {
  .pdp-frame { border-radius: 0.85rem; }
}

.pdp-thumb {
  background: #000000;
  border: 2px solid;
  border-radius: 0.5rem;
}
@media (min-width: 768px) {
  .pdp-thumb { border-radius: 0.6rem; }
}
.pdp-thumb--off {
  border-color: color-mix(in srgb, var(--pdp-on-olive) 28%, transparent);
  opacity: 0.62;
}
.pdp-thumb--off:hover {
  border-color: color-mix(in srgb, var(--pdp-on-olive) 60%, transparent);
  opacity: 1;
}
/* Lime, not pink, for the selected thumbnail: it sits on the raised olive
   gallery half where pink only reaches 2.64:1 but lime clears 4.45:1. */
.pdp-thumb--on {
  border-color: var(--pop-lime, #B9E14B);
  opacity: 1;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--pop-lime) 35%, transparent);
}

/* ── 5. Cream "paper stickers" on the olive ───────────────────────────── */
.pdp-chip {
  background: var(--pop-cream, #F0E7D2);
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 0.7rem;
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--pop-shadow) 65%, transparent);
}
.pdp-chip--stepper {
  border-radius: 0.8rem;
}
/* Back to ink inside the sticker — these win over the on-dark block above on
   specificity (4 classes vs 3), so order here is not load-bearing. */
.product-detail .pdp-panel .pdp-chip [class~="text-green-300"] {
  color: var(--pdp-ok) !important; /* 5.34:1 on cream; the old #1f7a3a was 4.37:1 */
}
.product-detail .pdp-panel .pdp-chip [class~="text-red-300"] {
  color: var(--pop-danger) !important; /* 6.98:1 */
}
/* The status dot inherits the same value so the pill reads as one object. */
.product-detail .pdp-panel .pdp-chip [class~="bg-green-400"] {
  background: var(--pdp-ok) !important;
  color: var(--pdp-ok) !important;
}
.product-detail .pdp-panel .pdp-chip [class~="bg-red-500"] {
  background: var(--pop-danger) !important;
  color: var(--pop-danger) !important;
}
.pdp-step {
  color: color-mix(in srgb, var(--pop-ink) 72%, transparent); /* 5.84:1 on cream */
}
.pdp-step:hover {
  color: var(--pop-ink, #14231a);
}
.pdp-qty {
  color: var(--pop-ink, #14231a);
  font-family: var(--font-mono, monospace);
}

/* Favourites toggle sits directly on the olive, not on a sticker. */
.pdp-fav {
  border: 2px solid color-mix(in srgb, var(--pdp-on-olive) 28%, transparent);
  border-radius: 0.7rem;
}
.pdp-fav--off {
  color: color-mix(in srgb, var(--pop-on-dark) 85%, transparent); /* 5.63:1 */
}
.pdp-fav--off:hover {
  color: var(--pop-pink, #E585AA); /* 3.42:1 — icon, so the 3:1 bar applies */
  border-color: var(--pop-pink, #E585AA);
}
/* Pink is a FILL that stays light in both themes, so its foreground and its
   outline take --pop-ink-on-accent (dark in both), not --pop-ink (which
   inverts to near-white and would leave a light heart on a light button). */
.pdp-fav--on {
  background: var(--pop-pink, #E585AA);
  border-color: var(--pop-ink-on-accent, #14231a);
  color: var(--pop-ink-on-accent, #14231a); /* 6.43:1 */
}

/* ── 6. Reviews ────────────────────────────────────────────────────────── */
/* Nothing here any more — the review list and form left this page (see the note
   in the template); their styles left with them. */

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.gallery-slide-next-enter-active,
.gallery-slide-next-leave-active,
.gallery-slide-prev-enter-active,
.gallery-slide-prev-leave-active {
  transition:
    transform 0.4s var(--ease-snappy),
    opacity 0.34s var(--ease-fluid),
    filter 0.34s var(--ease-fluid);
}

.gallery-slide-next-enter-from {
  opacity: 0;
  transform: translate3d(9%, 0, 0) scale(1.02);
  filter: blur(4px);
}

.gallery-slide-next-leave-to {
  opacity: 0;
  transform: translate3d(-7%, 0, 0) scale(0.98);
  filter: blur(4px);
}

.gallery-slide-prev-enter-from {
  opacity: 0;
  transform: translate3d(-9%, 0, 0) scale(1.02);
  filter: blur(4px);
}

.gallery-slide-prev-leave-to {
  opacity: 0;
  transform: translate3d(7%, 0, 0) scale(0.98);
  filter: blur(4px);
}

@media (prefers-reduced-motion: reduce) {
  .gallery-slide-next-enter-active,
  .gallery-slide-next-leave-active,
  .gallery-slide-prev-enter-active,
  .gallery-slide-prev-leave-active {
    transition: none !important;
  }
}

/* Zine "Přidat do košíku" button */
.pdp-buy {
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 2px solid var(--pop-cream, #F0E7D2);
  border-radius: 12px;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.2s ease;
}
/* Both states are accent FILLS (pink / lime) that stay light in both themes,
   so the label is --pop-ink-on-accent. --pop-ink here would flip to near-white
   and the button would read as a blank pink slab. */
.pdp-buy--go {
  background: var(--pop-pink, #E585AA);
  color: var(--pop-ink-on-accent, #14231a);
  box-shadow: 5px 5px 0 var(--pop-pink-ink, #b34a72);
}
.pdp-buy--go:hover { transform: translate(-1px, -1px); box-shadow: 6px 6px 0 var(--pop-pink-ink, #b5185f); }
.pdp-buy--go:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--pop-pink-ink, #b5185f); }
.pdp-buy--added {
  background: var(--pop-lime, #B9E14B);
  color: var(--pop-ink-on-accent, #14231a);
  box-shadow: 5px 5px 0 var(--pop-lime-ink, #4d6b0e);
}
/* Disabled state used to be 6%-white on 35%-white, which was invisible on
   every ground. A darkened patch of the panel's own olive reads as "switched
   off" while still carrying its label at 5.52:1. */
.pdp-buy--off {
  /* --pop-ink-on-accent is the palette's "stays dark in both themes" ink, which
     is exactly what a darkening scrim needs — --pop-ink would invert and bleach
     the button in dark mode. */
  background: color-mix(in srgb, var(--pop-ink-on-accent) 35%, transparent);
  color: color-mix(in srgb, var(--pop-on-dark) 72%, transparent);
  border-color: color-mix(in srgb, var(--pdp-on-olive) 25%, transparent);
  box-shadow: none;
  cursor: not-allowed;
}
</style>
