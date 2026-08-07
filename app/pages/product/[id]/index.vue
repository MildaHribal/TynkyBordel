<script setup lang="ts">
import { useCartStore } from "~/stores/cart";
import { Icon } from "@iconify/vue";
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
const reviewRating = ref(5);
const reviewComment = ref("");
const isSubmittingReview = ref(false);
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

// Fetch reviews
interface Review {
  id: number;
  userName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const { data: productReviews, refresh: refreshReviews, pending: reviewsPending } = useLazyFetch<Review[]>(
  () => product.value?.id ? `/api/products/${product.value.id}/reviews` : '',
  { 
    immediate: !!product.value?.id,
    watch: [product],
    default: () => [] 
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
  const reviews = productReviews.value || [];
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
        returnFees: 'https://schema.org/FreeReturn'
      },
      // Shipping — dispatched from Czechia via Zásilkovna/Balíkovna.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CZ' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' }
        }
      }
    }
  };

  if (reviews.length > 0) {
    const avgRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avgRating.toFixed(1),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1
    };
    schema.review = reviews.map((r: any) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1
      },
      author: {
        '@type': 'Person',
        name: r.userName || 'Zákazník'
      },
      reviewBody: r.comment || '',
      datePublished: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : undefined
    }));
  } else if (p.rating) {
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

const submitReview = async () => {
  if (!product.value?.id || isSubmittingReview.value) return;
  if (reviewRating.value < 1 || reviewRating.value > 5) return;
  isSubmittingReview.value = true;
  try {
    await $fetch(`/api/products/${product.value.id}/review`, {
      method: "POST",
      body: { rating: reviewRating.value, comment: reviewComment.value },
    });
    reviewComment.value = "";
    reviewRating.value = 5;
    await refreshReviews();
    toast.success('Díky!', 'Recenze byla odeslána.')
  } catch (err: any) {
    if (err?.statusCode === 401 || err?.data?.statusCode === 401) {
      toast.info('Je potřeba přihlášení', 'Pro recenzi se prosím přihlaste.')
      return
    }
    toast.error('Nepodařilo se odeslat recenzi', err?.data?.statusMessage || "Recenzi se nepodařilo odeslat.");
  } finally {
    isSubmittingReview.value = false;
  }
};
</script>

<template>
  <div class="product-detail max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-12">
    <!-- Loading Skeleton -->
    <div v-if="pending" class="relative">
      <div class="inline-flex items-center gap-2 text-white/40 mb-4 md:mb-8">
        <Icon icon="ep:arrow-left-bold" height="16" />
        <span class="text-sm">Zpět</span>
      </div>

      <div class="glass-card-strong overflow-hidden animate-pulse">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">
          
          <!-- Image Skeleton -->
          <div class="p-4 md:p-8 bg-white/[0.02]">
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
    <div v-else-if="error" class="glass-card-strong p-8 md:p-12 text-center">
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
        <Icon icon="ep:arrow-left-bold" height="16" class="transition-transform group-hover:-translate-x-1" />
        <span class="text-xs md:text-sm font-semibold tracking-wide uppercase">Zpět</span>
      </NuxtLink>

      <div class="glass-card-strong overflow-hidden" v-fly="{ direction: 'up', distance: 42 }">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">

          <!-- Image Section -->
          <div class="p-4 md:p-8 bg-white/[0.02]">
            <!-- Main Image -->
            <div ref="mainImageWrapRef" class="relative w-full aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-black/20 mb-3 md:mb-4 group/main">
              <Transition :name="imageTransitionName" mode="out-in">
                <div
                  :key="selectedImage ? `${selectedImage}-${selectedImageIndex}` : `fallback-${selectedImageIndex}`"
                  class="absolute inset-0"
                >
                  <NuxtImg
                    v-if="selectedImage && !isMainImageError"
                    :src="selectedImage"
                    :alt="product.title || product.name"
                    class="h-full w-full object-cover object-center"
                    width="1200"
                    height="1200"
                    format="webp"
                    sizes="sm:100vw md:100vw lg:50vw xl:50vw"
                    loading="eager"
                    @load="onMainImageLoaded"
                    @error="onMainImageError"
                  />

                  <div v-if="!selectedImage || isMainImageError" class="flex h-full w-full items-center justify-center text-white/20">
                    <Icon icon="mdi:image-off-outline" height="48" />
                  </div>
                </div>
              </Transition>

              <div
                v-if="selectedImage && isMainImageLoading && !isMainImageError"
                class="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]"
              >
                <Icon icon="lucide:loader-2" class="animate-spin text-primary-300/80" height="34" />
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
                class="relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg md:rounded-xl overflow-hidden border-2 transition-all duration-300 micro-lift"
                :class="selectedImageIndex === idx
                  ? 'border-primary-500 ring-2 ring-primary-400/55 shadow-lg shadow-primary-500/30'
                  : 'border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'"
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
                  <Icon icon="lucide:loader-2" class="animate-spin text-primary-300/80" height="16" />
                </div>

                <div
                  v-if="thumbnailError[idx]"
                  class="absolute inset-0 flex items-center justify-center bg-black/30 text-white/30"
                >
                  <Icon icon="mdi:image-off-outline" height="16" />
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

            <!-- Price -->
            <div class="flex items-baseline gap-2 mb-5 md:mb-8">
              <span class="text-3xl md:text-4xl font-black neon-text-rainbow">{{ product.price }}</span>
              <span class="text-lg md:text-xl text-white/40">Kč</span>
            </div>

            <!-- Description -->
            <div v-if="product.description" class="text-white/50 mb-6 md:mb-10 leading-relaxed text-sm md:text-base border-l-2 border-primary-500/30 pl-4">
              <p>{{ product.description }}</p>
            </div>

            <!-- Stock & Actions -->
            <div class="border-t border-white/10 pt-5 md:pt-8">
              <div class="flex items-center justify-between mb-5 md:mb-8">
                <div class="flex items-center gap-2">
                  <div class="flex items-center glass-card px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl">
                    <div
                      class="h-2 w-2 md:h-2.5 md:w-2.5 rounded-full mr-2 md:mr-3 shadow-[0_0_10px_currentColor]"
                      :class="product.stock > 0 ? 'bg-green-400 text-green-400' : 'bg-red-500 text-red-500'"
                    ></div>
                    <span
                      class="text-xs md:text-sm font-semibold tracking-wide uppercase"
                      :class="product.stock > 0 ? 'text-green-300' : 'text-red-300'"
                    >
                      {{ product.stock > 0 ? 'Skladem' : 'Vyprodáno' }}
                    </span>
                  </div>
                  <button
                    @click="toggleFavorite"
                    :disabled="isTogglingFavorite"
                    class="flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-300 micro-lift"
                    :class="isFavorite
                      ? 'border-secondary-500/50 bg-secondary-500/20 text-secondary-400'
                      : 'border-white/10 hover:border-secondary-500/30 text-white/50 hover:text-secondary-400'"
                    :title="isFavorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'"
                  >
                    <Icon v-if="isTogglingFavorite" icon="lucide:loader-2" class="animate-spin" height="20" />
                    <Icon v-else :icon="isFavorite ? 'mdi:heart' : 'mdi:heart-outline'" height="22" />
                  </button>
                </div>
              </div>

              <!-- Quantity Selector -->
              <div v-if="product.stock > 0" class="flex items-center gap-4 mb-6">
                <span class="text-sm font-semibold text-white/50 uppercase tracking-wider">Množství:</span>
                <div class="flex items-center glass-card px-2 py-1 rounded-xl border border-white/10">
                  <button 
                    @click="selectedQuantity = Math.max(1, selectedQuantity - 1)"
                    type="button"
                    class="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  >
                    <Icon icon="mdi:minus" height="20" />
                  </button>
                  <input 
                    v-model.number="selectedQuantity"
                    type="number"
                    min="1"
                    :max="product.stock"
                    class="w-12 text-center bg-transparent border-none focus:ring-0 text-white font-bold"
                  />
                  <button 
                    @click="selectedQuantity = Math.min(product.stock, selectedQuantity + 1)"
                    type="button"
                    class="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  >
                    <Icon icon="mdi:plus" height="20" />
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
                <Icon :icon="isAddedToCart ? 'mdi:check-bold' : 'mdi:cart-plus'" height="22" />
                {{ product.stock > 0 ? (isAddedToCart ? 'Přidáno do košíku' : 'Přidat do košíku') : 'Nedostupné' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Similar Products -->
      <div v-if="similarProducts.length > 0" class="mt-12 md:mt-16">
        <h2 class="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8 neon-text-cyan flex items-center gap-3">
          <Icon icon="lucide:sparkles" class="text-yellow-300" />
          Také by se vám mohlo líbit
        </h2>
        <ProductCarousel :products="similarProducts" />
      </div>

      <!-- Recenze -->
      <div class="glass-card-strong p-6 md:p-8 mt-12 md:mt-16 min-h-[500px]" v-fly="{ direction: 'up', delay: 70, distance: 48 }">
        <h2 class="text-xl font-bold text-white mb-6 pb-4 border-b border-white/10 flex items-center gap-2">
          <Icon icon="mdi:star-outline" class="text-primary-400" height="24" />
          Recenze ({{ productReviews?.length ?? 0 }})
        </h2>

        <!-- Formulář pro přihlášené -->
        <div class="mb-8 p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 class="text-sm font-semibold text-white mb-4">Napsat recenzi</h3>
          <form @submit.prevent="submitReview" class="space-y-4">
            <div>
              <label class="block text-xs text-white/50 mb-2">Hodnocení</label>
              <div class="flex gap-1">
                <button
                  v-for="n in 5"
                  :key="n"
                  type="button"
                  @click="reviewRating = n"
                  class="p-1 transition-colors"
                >
                  <Icon :icon="n <= reviewRating ? 'mdi:star' : 'mdi:star-outline'" height="24" :class="n <= reviewRating ? 'text-yellow-400' : 'text-white/30'" />
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs text-white/50 mb-2">Komentář (volitelné)</label>
              <textarea v-model="reviewComment" rows="3" placeholder="Co se vám na produktu líbilo?" class="input-cosmic w-full resize-none" />
            </div>
            <button type="submit" :disabled="isSubmittingReview" class="btn-cosmic micro-lift px-6 py-2.5 flex items-center gap-2">
              <Icon v-if="isSubmittingReview" icon="lucide:loader-2" class="animate-spin" height="18" />
              <Icon v-else icon="mdi:send-outline" height="18" />
              {{ isSubmittingReview ? 'Odesílám...' : 'Odeslat recenzi' }}
            </button>
          </form>
        </div>

        <!-- Seznam recenzí -->
        <div v-if="reviewsPending" class="space-y-4">
          <div v-for="i in 3" :key="i" class="p-4 rounded-xl bg-white/5 border border-white/10 animate-pulse h-28"></div>
        </div>
        <div v-else-if="productReviews && productReviews.length > 0" class="space-y-4">
          <div v-for="(rev, revIndex) in productReviews" :key="rev.id" class="p-4 rounded-xl bg-white/5 border border-white/10" v-fly="{ direction: 'up', delay: (revIndex % 6) * 40, distance: 24, duration: 620 }">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-white">{{ rev.userName }}</span>
              <div class="flex text-yellow-400">
                <Icon v-for="n in 5" :key="n" :icon="n <= rev.rating ? 'mdi:star' : 'mdi:star-outline'" height="14" />
              </div>
            </div>
            <p v-if="rev.comment" class="text-sm text-white/70">&bdquo;{{ rev.comment }}&ldquo;</p>
            <div class="text-[11px] text-white/40 mt-2">{{ rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('cs-CZ') : '' }}</div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-white/50 text-sm">Zatím zde nejsou žádné recenze.</div>
      </div>

      <!-- Contact Form / Newsletter -->
      <div class="mt-16 md:mt-24 mb-10">
        <ContactForm />
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="glass-card-strong p-8 md:p-12 text-center" v-fly="{ direction: 'up', distance: 32 }">
      <div class="text-4xl md:text-5xl mb-4">🌑</div>
      <h2 class="text-2xl md:text-3xl font-bold text-white mb-4 neon-text">Produkt nenalezen</h2>
      <p class="text-white/40 mb-6 md:mb-8 text-sm md:text-base">Tento produkt se ztratil ve vesmíru...</p>
      <NuxtLink to="/" class="btn-cosmic-outline inline-flex items-center gap-2 text-sm md:text-base">
        <Icon icon="ep:arrow-left-bold" height="16" />
        Zpět
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* ── Pastel theme override for product detail page ──
   The original markup uses Tailwind utility classes hardcoded for the dark
   cosmic theme (text-white, glass-card, bg-white/X). On the pastel page bg
   these become unreadable. We surgically override descendant utilities via
   attribute selectors instead of rewriting the 600+ lines of markup.    */
.product-detail :is(h1, h2, h3) {
  color: var(--pop-ink, #14231a) !important;
}
.product-detail [class~="text-white"],
.product-detail [class*="text-white/"] {
  color: var(--pop-ink, #14231a) !important;
}
/* Light tints originally used for muted text — keep them muted on light bg. */
.product-detail [class~="text-white\\/40"],
.product-detail [class~="text-white\\/50"],
.product-detail [class~="text-white\\/55"] {
  color: rgba(20, 35, 26, 0.6) !important;
}
.product-detail [class~="text-white\\/30"],
.product-detail [class~="text-white\\/20"] {
  color: rgba(20, 35, 26, 0.45) !important;
}
.product-detail [class~="text-white\\/70"] {
  color: rgba(20, 35, 26, 0.78) !important;
}

/* "Glass" cards become solid cream zine cards (hard border + offset shadow). */
.product-detail :deep(.glass-card-strong) {
  background: #fbf7ee !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 2px solid var(--pop-ink, #14231a) !important;
  border-radius: 16px !important;
  box-shadow: 6px 6px 0 rgba(20, 35, 26, 0.85) !important;
}
.product-detail :deep(.glass-card) {
  background: #fbf7ee !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 2px solid rgba(20, 35, 26, 0.35) !important;
  box-shadow: none !important;
}

/* Cosmic gradient title + neon text are unreadable on light — fall back to ink. */
.product-detail :deep(.neon-text),
.product-detail :deep(.neon-text-cyan),
.product-detail :deep(.neon-text-rainbow) {
  color: var(--pop-ink, #14231a) !important;
  background: none !important;
  -webkit-text-fill-color: var(--pop-ink, #14231a) !important;
  text-shadow: none !important;
}
.product-detail :deep(.cosmic-badge) {
  background: rgba(20, 35, 26, 0.08) !important;
  color: var(--pop-ink, #14231a) !important;
  border: 1px solid rgba(20, 35, 26, 0.18) !important;
  text-shadow: none !important;
}

/* Translucent white surfaces → translucent ink. */
.product-detail [class*="bg-white/"] {
  background: rgba(255, 255, 255, 0.6) !important;
}
.product-detail [class*="bg-black/"] {
  background: rgba(20, 35, 26, 0.06) !important;
}

/* Borders that were rgba(white) on dark → rgba(ink) on light. */
.product-detail [class*="border-white/"] {
  border-color: rgba(20, 35, 26, 0.15) !important;
}

/* Description "neon left bar" turns into a subtle ink bar. */
.product-detail [class*="border-primary-500/"] {
  border-color: rgba(179, 50, 76, 0.4) !important;
}

/* Status pill (skladem / vyprodáno) — keep semantic colors but dark on light. */
.product-detail :deep(.text-green-300) { color: #1f7a3a !important; }
.product-detail :deep(.text-red-300)   { color: #8a2a2a !important; }

/* Main heading: bigger + display font on top of dark color. Bricolage Grotesque
   (the zine display face) has proper Czech latin-ext glyphs — Caprasimo mangled
   the diacritics (ě/č/ř/ů sat detached and oversized). */
.product-detail :deep(h1) {
  font-family: var(--font-zine), 'Bricolage Grotesque', system-ui, sans-serif !important;
  font-weight: 800 !important;
  letter-spacing: -0.02em;
}
.product-detail :deep(h2) {
  font-family: 'Gloock', Georgia, serif !important;
}

/* Price — switch the rainbow gradient to a clean dark display number. */
.product-detail :deep(.neon-text-rainbow) {
  font-family: 'Gloock', Georgia, serif !important;
  background-clip: unset !important;
  -webkit-background-clip: unset !important;
}

/* Add-to-cart button (still dark/colorful gradient is OK against pastel). */
.product-detail :deep(.btn-cosmic),
.product-detail :deep(.btn-cosmic-outline) {
  color: #fff !important;
  text-shadow: none !important;
}

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
.pdp-buy--go {
  background: var(--pop-pink, #E585AA);
  color: var(--pop-ink, #14231a);
  box-shadow: 5px 5px 0 var(--pop-pink-ink, #b34a72);
}
.pdp-buy--go:hover { transform: translate(-1px, -1px); box-shadow: 6px 6px 0 var(--pop-pink-ink, #b5185f); }
.pdp-buy--go:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 var(--pop-pink-ink, #b5185f); }
.pdp-buy--added {
  background: var(--pop-lime, #B9E14B);
  color: var(--pop-ink, #14231a);
  box-shadow: 5px 5px 0 var(--pop-lime-ink, #4d6b0e);
}
.pdp-buy--off {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.35);
  border-color: rgba(255, 255, 255, 0.15);
  cursor: not-allowed;
}
</style>
