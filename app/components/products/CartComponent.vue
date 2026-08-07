<script setup lang="ts">
import { useCartStore } from "~/stores/cart";


const cart = useCartStore()
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-12">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6 md:mb-8">
      <NuxtLink to="/" class="text-white/30 hover:text-white transition-colors" aria-label="Zpět k nakupování">
        <Icon name="ep:arrow-left-bold" height="18" />
      </NuxtLink>
      <h1 class="text-2xl md:text-3xl font-extrabold text-white neon-text">Váš košík 🛒</h1>
    </div>

    <!-- Empty Cart -->
    <div v-if="cart.items.length === 0" class="glass-card-strong p-10 md:p-16 text-center">
      <div class="text-5xl md:text-6xl mb-4 md:mb-6">🌑</div>
      <p class="text-lg md:text-xl text-white/50 mb-6 md:mb-8">Váš košík je zatím prázdný.</p>
      <NuxtLink to="/" class="btn-cosmic inline-flex items-center gap-2 text-sm md:text-base">
        <span>Pokračovat v nákupu</span>
        <Icon name="ep:right" height="18" />
      </NuxtLink>
    </div>

    <!-- Cart with items -->
    <div v-else class="flex flex-col lg:flex-row gap-4 md:gap-6">
      <!-- Items -->
      <div class="flex-grow glass-card overflow-hidden">
        <div class="divide-y divide-white/5">
          <div
            v-for="item in cart.items"
            :key="item.id"
            class="p-4 md:p-5 flex items-center hover:bg-white/[0.02] transition-colors"
          >
            <!-- Image -->
            <div class="h-16 w-16 md:h-20 md:w-20 flex-shrink-0 overflow-hidden rounded-lg md:rounded-xl bg-white/5 border border-white/10">
              <img
                v-if="item.image"
                :src="item.image.startsWith('http') || item.image.startsWith('/') ? item.image : `/${item.image}`"
                :alt="item.title"
                class="h-full w-full object-cover"
              >
              <div v-else class="h-full w-full flex items-center justify-center text-white/20">
                <Icon name="mdi:image-off-outline" height="20" />
              </div>
            </div>

            <!-- Info -->
            <div class="ml-3 md:ml-5 flex flex-1 flex-col min-w-0">
              <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                  <h3 class="font-bold text-white text-xs md:text-sm truncate">
                    <NuxtLink :to="`/product/${item.id}`" class="hover:text-primary-300 transition-colors">
                      {{ item.title }}
                    </NuxtLink>
                  </h3>
                  <p class="text-[10px] md:text-xs text-white/30 mt-0.5">{{ item.category }}</p>
                </div>
                <span class="text-white font-bold text-xs md:text-sm neon-text flex-shrink-0">{{ item.price }} Kč</span>
              </div>
              
              <div class="flex items-center gap-2 md:gap-4 mt-2 md:mt-3">
                <!-- Quantity Selector in Cart -->
                <div class="flex items-center h-8 bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                  <button 
                    @click="cart.updateQuantity(item.id, item.quantity - 1)"
                    type="button"
                    class="w-8 h-full flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/5"
                  >
                    <Icon name="mdi:minus" height="14" />
                  </button>
                  <span class="w-8 text-center text-xs font-bold text-white">{{ item.quantity }}</span>
                  <button 
                    @click="cart.updateQuantity(item.id, item.quantity + 1)"
                    type="button"
                    class="w-8 h-full flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/5"
                  >
                    <Icon name="mdi:plus" height="14" />
                  </button>
                </div>

                <button
                  @click="cart.removeFromCart(item.id)"
                  type="button"
                  class="text-[10px] md:text-xs text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Icon name="mdi:trash-can-outline" height="12" />
                  <span class="hidden sm:inline">Odstranit</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Order Summary -->
      <div class="lg:w-80 flex-shrink-0">
        <div class="glass-card-strong p-5 md:p-6 lg:sticky lg:top-6 gradient-border">
          <h3 class="text-base md:text-lg font-bold text-white mb-4 md:mb-6 neon-text-cyan">Souhrn objednávky</h3>

          <dl class="space-y-3 md:space-y-4 text-sm">
            <div class="flex justify-between">
              <dt class="text-white/40">Mezisoučet</dt>
              <dd class="font-medium text-white">{{ cart.totalPrice }} Kč</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-white/40">Doprava</dt>
              <dd class="font-medium text-green-400">Zdarma</dd>
            </div>
            <div class="cosmic-divider !my-3 md:!my-4"></div>
            <div class="flex items-center justify-between">
              <dt class="text-sm md:text-base font-bold text-white">Celkem</dt>
              <dd class="text-xl md:text-2xl font-black neon-text-rainbow">{{ cart.totalPrice }} Kč</dd>
            </div>
          </dl>

          <NuxtLink to="/checkout" class="btn-cosmic w-full mt-6 md:mt-8 py-3.5 md:py-4 text-sm md:text-base flex items-center justify-center gap-2">
            <Icon name="mdi:credit-card-outline" height="18" />
            Přejít k pokladně
          </NuxtLink>

          <div class="mt-3 md:mt-4 text-center">
            <NuxtLink to="/" class="text-xs md:text-sm text-white/30 hover:text-primary-400 transition-colors">
              nebo pokračovat v nákupu →
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
</style>