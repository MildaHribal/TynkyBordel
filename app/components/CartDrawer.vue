<script setup lang="ts">
import { watch } from 'vue'

import { useCartStore } from '~/stores/cart'

const cart = useCartStore()

const resolveImage = (src?: string | null) => {
  if (!src) return null
  return src.startsWith('http') || src.startsWith('/') ? src : `/${src}`
}

// Lock body scroll while the drawer is open.
watch(() => cart.isDrawerOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})
onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="cart-fade">
      <div v-if="cart.isDrawerOpen" class="cart-backdrop" @click="cart.closeDrawer()" />
    </Transition>

    <!-- Panel -->
    <Transition name="cart-slide">
      <aside v-if="cart.isDrawerOpen" class="cart-drawer" role="dialog" aria-label="Košík">
        <header class="cart-head">
          <div class="cart-head-title">
            <Icon name="mdi:cart" height="20" />
            <span>Košík</span>
            <span v-if="cart.itemCount > 0" class="cart-head-count">{{ cart.itemCount }}</span>
          </div>
          <button class="cart-close" @click="cart.closeDrawer()" aria-label="Zavřít košík">
            <Icon name="mdi:close" height="22" />
          </button>
        </header>

        <!-- Empty -->
        <div v-if="cart.items.length === 0" class="cart-empty">
          <div class="cart-empty-emoji">🛒</div>
          <p class="cart-empty-text">Košík je zatím prázdný.</p>
          <NuxtLink to="/#kolekce" class="cart-empty-cta" @click="cart.closeDrawer()">Prohlédnout kousky</NuxtLink>
        </div>

        <!-- Items -->
        <div v-else class="cart-items">
          <div v-for="item in cart.items" :key="item.id" class="cart-item">
            <NuxtLink :to="`/product/${(item as any).slug || item.id}`" class="cart-thumb" @click="cart.closeDrawer()">
              <NuxtImg
                v-if="resolveImage(item.image)"
                :src="resolveImage(item.image)!"
                :alt="item.title || item.name"
                width="140" height="140" format="webp"
                class="cart-thumb-img"
              />
            </NuxtLink>
            <div class="cart-item-body">
              <div class="cart-item-title">{{ item.title || item.name }}</div>
              <div class="cart-item-price">{{ item.price.toLocaleString('cs-CZ') }} Kč</div>
              <div class="cart-item-controls">
                <div class="cart-qty">
                  <button class="cart-qty-btn" @click="cart.updateQuantity(item.id, item.quantity - 1)" :disabled="item.quantity <= 1" aria-label="Ubrat">
                    <Icon name="mdi:minus" height="14" />
                  </button>
                  <span class="cart-qty-val">{{ item.quantity }}</span>
                  <button class="cart-qty-btn" @click="cart.updateQuantity(item.id, item.quantity + 1)" aria-label="Přidat">
                    <Icon name="mdi:plus" height="14" />
                  </button>
                </div>
                <button class="cart-remove" @click="cart.removeFromCart(item.id)" aria-label="Odebrat z košíku">
                  <Icon name="mdi:trash-can-outline" height="18" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer v-if="cart.items.length > 0" class="cart-foot">
          <div class="cart-total">
            <span>Celkem</span>
            <span class="cart-total-amount">{{ cart.totalPrice.toLocaleString('cs-CZ') }} Kč</span>
          </div>
          <NuxtLink to="/checkout" class="cart-checkout" @click="cart.closeDrawer()">
            K pokladně
            <Icon name="lucide:arrow-right" height="17" />
          </NuxtLink>
          <NuxtLink to="/cart" class="cart-view-link" @click="cart.closeDrawer()">
            Přejít do košíku
          </NuxtLink>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cart-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(20, 8, 36, 0.5);
  backdrop-filter: blur(2px);
}

.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 111;
  height: 100dvh;
  width: min(420px, 100vw);
  background: #fbf7f2;
  display: flex;
  flex-direction: column;
  box-shadow: -18px 0 50px rgba(20, 8, 36, 0.28);
}

.cart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.15rem 1.25rem;
  border-bottom: 1px solid rgba(20, 35, 26, 0.1);
}
.cart-head-title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.2rem;
  color: #14231a;
}
.cart-head-count {
  font-family: 'Manrope', system-ui;
  font-size: 0.72rem;
  font-weight: 700;
  background: #14231a;
  color: #fff;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}
.cart-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: none;
  background: rgba(20, 35, 26, 0.06);
  color: #14231a;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.cart-close:hover { background: rgba(20, 35, 26, 0.12); transform: rotate(90deg); }

/* Empty */
.cart-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
}
.cart-empty-emoji { font-size: 2.75rem; opacity: 0.7; }
.cart-empty-text { color: rgba(20, 35, 26, 0.6); font-family: 'Manrope', system-ui; }
.cart-empty-cta {
  margin-top: 0.5rem;
  padding: 0.75rem 1.4rem;
  border-radius: 999px;
  background: #14231a;
  color: #fff;
  text-decoration: none;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Items */
.cart-items {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.cart-item {
  display: flex;
  gap: 0.85rem;
  padding: 0.7rem;
  background: #fff;
  border: 1px solid rgba(20, 35, 26, 0.08);
  border-radius: 14px;
}
.cart-thumb {
  flex-shrink: 0;
  width: 74px;
  height: 74px;
  border-radius: 10px;
  overflow: hidden;
  background: #1a0f28;
  display: block;
}
.cart-thumb-img { width: 100%; height: 100%; object-fit: cover; }
.cart-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.cart-item-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 600;
  font-size: 0.95rem;
  color: #14231a;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cart-item-price {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 0.98rem;
  color: #b3324c;
}
.cart-item-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}
.cart-qty {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border: 1px solid rgba(20, 35, 26, 0.15);
  border-radius: 999px;
  padding: 0.1rem;
}
.cart-qty-btn {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #14231a;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.cart-qty-btn:hover:not(:disabled) { background: rgba(20, 35, 26, 0.08); }
.cart-qty-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cart-qty-val { min-width: 22px; text-align: center; font-weight: 700; font-size: 0.85rem; color: #14231a; }
.cart-remove {
  border: none;
  background: transparent;
  color: rgba(20, 35, 26, 0.45);
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 8px;
  transition: color 0.15s ease, background 0.15s ease;
}
.cart-remove:hover { color: #b3324c; background: rgba(179, 50, 76, 0.08); }

/* Footer */
.cart-foot {
  border-top: 1px solid rgba(20, 35, 26, 0.1);
  padding: 1rem 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  background: #fbf7f2;
}
.cart-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-family: 'Manrope', system-ui;
  font-weight: 600;
  color: rgba(20, 35, 26, 0.7);
}
.cart-total-amount {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.5rem;
  color: #14231a;
}
.cart-checkout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.9rem;
  border-radius: 999px;
  background: #14231a;
  color: #fff;
  text-decoration: none;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: background 0.2s ease, transform 0.2s ease;
}
.cart-checkout:hover { background: #21382a; transform: translateY(-1px); }
.cart-view-link {
  text-align: center;
  color: rgba(20, 35, 26, 0.65);
  text-decoration: underline;
  font-family: 'Manrope', system-ui;
  font-size: 0.85rem;
}
.cart-view-link:hover { color: #14231a; }

/* Transitions */
.cart-fade-enter-active,
.cart-fade-leave-active { transition: opacity 0.25s ease; }
.cart-fade-enter-from,
.cart-fade-leave-to { opacity: 0; }

.cart-slide-enter-active,
.cart-slide-leave-active { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.cart-slide-enter-from,
.cart-slide-leave-to { transform: translateX(100%); }

@media (prefers-reduced-motion: reduce) {
  .cart-slide-enter-active,
  .cart-slide-leave-active { transition: none; }
}
</style>
