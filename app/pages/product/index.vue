<script setup lang="ts">
import ProductCard from '~/components/products/ProductCard.vue'
import type { Product } from '~~/types'

const { data: products, pending, error } = useLazyFetch<Product[]>('/api/products')
</script>

<template>
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-6">Products</h1>

    <div v-if="pending" class="text-center">
      Loading...
    </div>
    <div v-else-if="error" class="text-red-500 text-center">
      {{ error.message }}
    </div>
    <div v-else-if="products && products.length > 0" class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
      <div
          v-for="product in products"
          :key="product.id"
          class="block h-full"
      >
        <ProductCard :product="product" />
      </div>
    </div>
    <div v-else class="text-center text-gray-500">
      No products found.
    </div>
  </div>
</template>

<style scoped>

</style>
