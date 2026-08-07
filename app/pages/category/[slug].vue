<script setup lang="ts">
import { useRoute } from 'vue-router'
import ProductCard from "~/components/products/ProductCard.vue"
import Sidebar from "~/components/Sidebar.vue"

import type { Product } from '~~/types'

definePageMeta({
  pageTransition: true,
})

const route = useRoute()
const currentSlug = computed(() => route.params.slug as string || 'vsechny')

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl || useRequestURL().origin
useSeoMeta({
  title: 'Produkty',
  description: 'Nejlepší kousky v našem kosmickém obchodě. Vyberte si podle kategorie.',
  ogTitle: 'Produkty — Tynky Bordel',
  ogType: 'website',
  ogUrl: `${siteUrl}/category/${currentSlug.value}`,
})

const { data: rawProducts, pending: productsPending, error: productsError } = useLazyFetch<Product[]>('/api/products?limit=100')
const { data: categoriesData, pending: categoriesPending, error: categoriesError } = useLazyFetch<any[]>('/api/categories')

const pending = computed(() => productsPending.value || categoriesPending.value)
const error = computed(() => productsError.value || categoriesError.value)

const productsWithIds = computed(() => {
  if (!rawProducts.value) return [];
  return rawProducts.value.map((p, index) => ({
    ...p,
    id: p.id || `${(p.title || 'product').replace(/\s+/g, '-')}-${index}`
  }));
});

const categoryTree = computed(() => {
  if (!categoriesData.value) return [];
  
  const orderMap: Record<string, number> = {
    'MODA': 20,
    'BIZUTERIE': 10,
    'DOPLNKY': 30,
    'OBRAZY': 40,
    'OSTATNÍ': 50
  };

  const map = new Map();
  categoriesData.value.forEach(cat => map.set(cat.id, { ...cat, children: [] }));
  const tree: any[] = [];
  categoriesData.value.forEach(cat => {
    const node = map.get(cat.id);
    if (cat.parentId) {
      map.get(cat.parentId)?.children.push(node);
    } else {
      tree.push(node);
    }
  });

  return tree.sort((a, b) => {
    const orderA = orderMap[a.name] || 999;
    const orderB = orderMap[b.name] || 999;
    return orderA - orderB;
  });
});

const getSubCategoryIds = (catId: number): number[] => {
  if (!categoriesData.value) return [];
  const children = categoriesData.value.filter(c => c.parentId === catId).map(c => c.id);
  let allIds = [...children];
  children.forEach(childId => {
    allIds = [...allIds, ...getSubCategoryIds(childId)];
  });
  return allIds;
}

const filteredProducts = computed(() => {
  if (!productsWithIds.value) return []
  if (currentSlug.value === 'vsechny') return productsWithIds.value
  
  const selectedCat = categoriesData.value?.find(c => c.slug === currentSlug.value);
  if (!selectedCat) return [];

  const validCategoryIds = [selectedCat.id, ...getSubCategoryIds(selectedCat.id)];
  return productsWithIds.value.filter(p => validCategoryIds.includes(p.categoryId));
})

const showMobileFilters = ref(false)

const currentCategoryName = computed(() => {
  if (currentSlug.value === 'vsechny') return 'Všechny produkty'
  const found = categoriesData.value?.find(c => c.slug === currentSlug.value)
  return found ? found.name : 'Kategorie'
})

// ── Structured data: breadcrumb + product ItemList for this category ─────────
const categoryUrl = computed(() => `${siteUrl}/category/${currentSlug.value}`)
const jsonLd = computed(() => {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Domů', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: currentCategoryName.value, item: categoryUrl.value },
    ],
  }
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${currentCategoryName.value} — Tynky Bordel`,
    url: categoryUrl.value,
    isPartOf: { '@id': `${siteUrl}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: filteredProducts.value.length,
      itemListElement: filteredProducts.value.map((p: any, index: number) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          url: `${siteUrl}/product/${p.slug || p.id}`,
          name: p.title || p.name,
          image: p.image?.startsWith('http') ? p.image : `${siteUrl}${p.image?.startsWith('/') ? '' : '/'}${p.image || ''}`,
          offers: {
            '@type': 'Offer',
            price: p.price,
            priceCurrency: 'CZK',
            availability: (p.stock ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
        },
      })),
    },
  }
  return [breadcrumb, collection]
})

useHead(() => ({
  link: [{ rel: 'canonical', href: categoryUrl.value }],
  script: jsonLd.value.map((s) => ({ type: 'application/ld+json', innerHTML: JSON.stringify(s) })),
}))
</script>

<template>
  <div class="w-full overflow-x-hidden min-h-screen pt-24 pb-12">
    <!-- Header -->
    <div class="px-4 md:px-8 max-w-7xl mx-auto flex items-center justify-between gap-3 mb-8">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight neon-text-cyan">
          {{ currentCategoryName }}
        </h1>
        <span class="text-2xl md:text-4xl hippie-float">✨</span>
      </div>

      <button
        @click="showMobileFilters = !showMobileFilters"
        class="lg:hidden flex items-center gap-2 px-3 py-2 glass-card text-white/60 hover:text-white text-sm transition-all"
      >
        <Icon name="mdi:filter-variant" height="18" />
        <span class="hidden sm:inline">Kategorie</span>
      </button>
    </div>

    <!-- Mobile categories view -->
    <Transition name="expand">
      <div v-if="showMobileFilters" class="lg:hidden mx-4 mb-6">
        <div class="glass-card p-4">
          <Sidebar
            :categoryTree="categoryTree"
            :currentSlug="currentSlug"
          />
        </div>
      </div>
    </Transition>

    <div class="flex max-w-[1400px] mx-auto w-full">
      <!-- Desktop Sidebar -->
      <div class="hidden lg:block w-72 flex-shrink-0">
        <Sidebar
          :categoryTree="categoryTree"
          :currentSlug="currentSlug"
        />
      </div>

      <!-- Main Content -->
      <div class="flex-1 lg:pl-8 lg:pr-4 px-4 w-full">
        <div v-if="pending" class="flex items-center justify-center min-h-[40vh]">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p class="text-white/40">Načítání produktů z jiné dimenze...</p>
          </div>
        </div>
        
        <div v-else-if="error" class="glass-card mt-8 p-6 md:p-8 text-center">
          <p class="text-red-400 text-lg">{{ error.message }}</p>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="glass-card p-12 text-center text-white/50">
          <p class="text-xl">V této kategorii zatím žádné neobjevené poklady. 🪐</p>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div
            v-for="(product, productIndex) in filteredProducts"
            :key="product.id"
            class="block h-full transform hover:-translate-y-2 transition-transform duration-300"
            v-fly="{
              direction: productIndex % 2 === 0 ? 'up' : 'zoom',
              distance: 26,
              duration: 620,
              delay: Math.min((productIndex % 8) * 42, 280),
              threshold: 0.1,
            }"
          >
            <ProductCard :product="product"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
