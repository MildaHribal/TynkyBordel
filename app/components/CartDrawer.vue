<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'

import { useCartStore } from '~/stores/cart'
// Flat shipping is charged on every order (server/utils/createOrder.ts), so the
// drawer's amount is a subtotal, not a total. The drawer is a quick peek — the
// COD surcharge depends on a payment method picked later, so it stays for the
// cart page and checkout.
import { SHIPPING_FEE } from '~~/shared/shop'

const cart = useCartStore()

const resolveImage = (src?: string | null) => {
  if (!src) return null
  return src.startsWith('http') || src.startsWith('/') ? src : `/${src}`
}

// ── Focus management ──────────────────────────────────────────────────────
// The drawer is a modal dialog: while it is open, focus must stay inside it,
// Escape must close it, and closing must hand focus back to whatever opened it
// (the navbar cart button).
const panelRef = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

const focusableItems = () => {
  const root = panelRef.value
  if (!root) return [] as HTMLElement[]
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.getClientRects().length > 0)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    cart.closeDrawer()
    return
  }

  if (event.key !== 'Tab') return

  const root = panelRef.value
  if (!root) return

  const items = focusableItems()
  if (items.length === 0) {
    event.preventDefault()
    root.focus()
    return
  }

  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// Lock body scroll while the drawer is open.
watch(() => cart.isDrawerOpen, async (open) => {
  if (!import.meta.client) return

  document.body.style.overflow = open ? 'hidden' : ''

  if (open) {
    lastFocused = document.activeElement as HTMLElement | null
    await nextTick()
    panelRef.value?.focus()
  } else if (lastFocused) {
    lastFocused.focus?.()
    lastFocused = null
  }
})

onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop — flat ink scrim (no backdrop-filter: a blur here costs a
         full-viewport compositor pass every frame the drawer animates, and the
         zine language wants a flat printed shadow anyway). -->
    <Transition name="cart-fade">
      <div v-if="cart.isDrawerOpen" class="cart-backdrop" @click="cart.closeDrawer()" />
    </Transition>

    <!-- Panel -->
    <Transition name="cart-slide">
      <aside
        v-if="cart.isDrawerOpen"
        ref="panelRef"
        class="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Košík"
        tabindex="-1"
        @keydown="onKeydown"
      >
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

        <!-- Tape strip straddling the header seam — the "pasted cut-out" tell. -->
        <span class="zine-tape cart-tape" aria-hidden="true" />

        <!-- Empty -->
        <div v-if="cart.items.length === 0" class="cart-empty">
          <div class="cart-empty-emoji">🛒</div>
          <p class="cart-empty-text">Košík je zatím prázdný.</p>
          <NuxtLink to="/#kolekce" class="zine-btn zine-btn--lime cart-empty-cta" @click="cart.closeDrawer()">Prohlédnout kousky</NuxtLink>
        </div>

        <!-- Items -->
        <div v-else class="cart-items">
          <div v-for="item in cart.items" :key="item.id" class="zine-card-cream cart-item">
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
              <div class="zine-price cart-item-price">{{ item.price.toLocaleString('cs-CZ') }} Kč</div>
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
            <span class="cart-total-label">Mezisoučet</span>
            <span class="zine-price cart-total-amount">{{ cart.totalPrice.toLocaleString('cs-CZ') }} Kč</span>
          </div>
          <p class="cart-total-note">+ doprava {{ SHIPPING_FEE }} Kč</p>
          <NuxtLink to="/checkout" class="zine-btn zine-btn--lime cart-checkout" @click="cart.closeDrawer()">
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
/* ══════════════════════════════════════════════════════════════════════════
   CART DRAWER — retro-zine.
   A cream paper sheet taped over the page: flat cut-out surfaces, 2px ink
   borders, hard (never blurred) offset shadows, mono labels, sticker buttons
   that physically press in. No backdrop-filter, no permanent will-change.
   ══════════════════════════════════════════════════════════════════════════ */

.cart-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(20, 35, 26, 0.55);
}
/* The scrim has no shared token — it is the only full-viewport dimmer in the
   app. On cream, 55% ink reads as a printed shadow; over the violet ground the
   same wash barely separates the drawer from the page, so dark mode uses a
   deeper, cooler ink at 66%. Guarded exactly like the palette in main.css. */
@supports (color: light-dark(#fff, #000)) {
  .cart-backdrop { background: light-dark(rgba(20, 35, 26, 0.55), rgba(9, 5, 17, 0.66)); }
}

.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 111;
  height: 100dvh;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  /* Warm paper + the same dotted print grid the page body uses, so the drawer
     reads as another sheet of the zine rather than a UI panel. */
  background-color: var(--pop-cream, #F0E7D2);
  /* The dots and the printed edge are a hair different from the body's shared
     --pop-dot-* / --pop-shadow-soft (11%/6% ink here vs 14%/7% violet there,
     22% vs 18% for the edge), so they get local props: the light values stay
     byte-identical to what shipped, and the dark values mirror how main.css
     inverts the same textures — pale violet dots, a lilac riso edge, because a
     near-black offset simply vanishes against the #1B1129 ground. */
  --cart-dot-1: rgba(20, 35, 26, 0.11);
  --cart-dot-2: rgba(20, 35, 26, 0.06);
  --cart-edge: rgba(20, 35, 26, 0.22);
  background-image:
    radial-gradient(var(--cart-dot-1) 1.3px, transparent 1.5px),
    radial-gradient(var(--cart-dot-2) 1px, transparent 1.2px);
  background-size: 26px 26px, 52px 52px;
  background-position: 0 0, 13px 13px;
  border-left: 3px solid var(--pop-ink, #14231a);
  /* Flat second rule instead of a 50px blur — a printed edge, and free. */
  box-shadow: -7px 0 0 var(--cart-edge);
}
@supports (color: light-dark(#fff, #000)) {
  .cart-drawer {
    --cart-dot-1: light-dark(rgba(20, 35, 26, 0.11), rgba(216, 196, 255, 0.09));
    --cart-dot-2: light-dark(rgba(20, 35, 26, 0.06), rgba(216, 196, 255, 0.05));
    --cart-edge:  light-dark(rgba(20, 35, 26, 0.22), rgba(198, 166, 255, 0.30));
  }
}
.cart-drawer:focus { outline: none; }

/* ── Header — olive bar, same green as the product cards ─────────────────── */
.cart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  background: var(--pop-plum, #3b5222);
  border-bottom: 3px solid var(--pop-ink, #14231a);
}
.cart-head-title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: 1.35rem;
  line-height: 1;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  /* Text on the olive bar, which is dark in BOTH themes → --pop-on-dark.
     7.29:1 on light olive, 6.55:1 on the lifted dark olive. */
  color: var(--pop-on-dark, #F0E7D2);
}
.cart-head-count {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  background: var(--pop-lime, #B9E14B);
  /* Lime stays light in both themes, so its ink and border must stay dark —
     --pop-ink would turn near-white here and vanish. Same pairing as .zine-price. */
  color: var(--pop-ink-on-accent, #14231a);
  border: 2px solid var(--pop-ink-on-accent, #14231a);
  border-radius: 5px;
  padding: 0.05rem 0.4rem;
  transform: rotate(-4deg);
  box-shadow: 2px 2px 0 var(--pop-shadow);
}
.cart-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  border: 2px solid var(--pop-ink, #14231a);
  background: var(--pop-cream, #F0E7D2);
  color: var(--pop-ink, #14231a);
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--pop-shadow);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.2s ease;
}
/* Hovering swaps the fill for pink, which stays light in both themes — the icon
   has to swap to the constant dark ink with it. */
.cart-close:hover { background: var(--pop-pink, #E585AA); color: var(--pop-ink-on-accent, #14231a); }
.cart-close:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--pop-shadow); }

/* Tape strip pinning the header to the sheet. */
.cart-tape {
  top: 56px;
  left: 20px;
  width: 74px;
  height: 22px;
  transform: rotate(-5deg);
  pointer-events: none;
}

/* ── Empty ───────────────────────────────────────────────────────────────── */
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
.cart-empty-emoji {
  font-size: 2.6rem;
  line-height: 1;
  transform: rotate(-6deg);
}
.cart-empty-text {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pop-ink-soft, #4e6153);
  margin: 0;
}
.cart-empty-cta { margin-top: 0.35rem; }

/* ── Items ───────────────────────────────────────────────────────────────── */
.cart-items {
  flex: 1;
  overflow-y: auto;
  padding: 1.1rem 1.15rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  scrollbar-width: thin;
  scrollbar-color: var(--pop-ink-soft, #4e6153) transparent;
}
/* .zine-card-cream supplies the paper fill, 2px ink border and hard shadow. */
.cart-item {
  display: flex;
  gap: 0.8rem;
  padding: 0.6rem;
}
.cart-thumb {
  flex-shrink: 0;
  width: 76px;
  height: 76px;
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 8px;
  overflow: hidden;
  /* Product photos are shot on black — the frame matches ProductCard. */
  background: #000;
  display: block;
}
.cart-thumb-img { width: 100%; height: 100%; object-fit: cover; }
.cart-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem; }
.cart-item-title {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.86rem;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--pop-ink, #14231a);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* .zine-price supplies the lime tag + ink border. */
.cart-item-price { font-size: 0.8rem; }

.cart-item-controls {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.15rem;
}
.cart-qty {
  display: inline-flex;
  align-items: center;
  background: var(--pop-cream, #F0E7D2);
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 8px;
  box-shadow: 2px 2px 0 var(--pop-shadow);
  overflow: hidden;
}
.cart-qty-btn {
  width: 27px;
  height: 27px;
  border: none;
  background: transparent;
  color: var(--pop-ink, #14231a);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
/* Lime / pink fills stay light in both themes → the glyph takes the constant
   dark ink, not --pop-ink (which is near-white in dark mode). */
.cart-qty-btn:hover:not(:disabled) { background: var(--pop-lime, #B9E14B); color: var(--pop-ink-on-accent, #14231a); }
.cart-qty-btn:active:not(:disabled) { background: var(--pop-pink, #E585AA); color: var(--pop-ink-on-accent, #14231a); }
.cart-qty-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.cart-qty-val {
  min-width: 24px;
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.8rem;
  color: var(--pop-ink, #14231a);
  border-left: 2px solid var(--pop-ink, #14231a);
  border-right: 2px solid var(--pop-ink, #14231a);
  padding: 0.1rem 0.15rem;
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cart-remove {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  border: 2px solid var(--pop-ink-on-accent, #14231a);
  border-radius: 8px;
  background: var(--pop-blush, #F7D3E0);
  /* Blush (and the pink hover) stay light in both themes → constant dark ink. */
  color: var(--pop-ink-on-accent, #14231a);
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--pop-shadow);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.2s ease;
}
.cart-remove:hover { background: var(--pop-pink, #E585AA); }
.cart-remove:active { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--pop-shadow); }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.cart-foot {
  border-top: 3px solid var(--pop-ink, #14231a);
  padding: 1rem 1.15rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--pop-cream, #F0E7D2);
}
.cart-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.cart-total-label {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--pop-ink, #14231a);
}
/* .zine-price again — the total is just a bigger price tag, tilted. */
.cart-total-amount {
  font-size: 1.05rem;
  padding: 0.25rem 0.6rem;
  transform: rotate(-1.5deg);
  box-shadow: 3px 3px 0 var(--pop-shadow);
}
/* Sits right under the amount it qualifies, so it pulls back against the
   footer's 0.75rem flex gap and stays right-aligned with the price tag. */
.cart-total-note {
  margin: -0.4rem 0 0;
  text-align: right;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pop-ink-soft, #4e6153);
}
.cart-checkout { width: 100%; }
.cart-view-link {
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pop-ink-soft, #4e6153);
  text-decoration: underline;
  text-underline-offset: 3px;
}
/* --pop-pink-ink is only 4.12:1 on cream — too thin for a 0.68rem label, so the
   hover goes one rose step deeper (primary-700, already in main.css) for 5.83:1.
   That deep rose is unreadable on the #1B1129 ground, and no shared token holds
   "rose that works on paper in both themes" (--pop-pink-ink is tuned per theme
   but too pale here in light), so the dark side takes the light-mode rose. */
.cart-view-link:hover { color: var(--color-primary-700, #97325c); }
@supports (color: light-dark(#fff, #000)) {
  .cart-view-link:hover { color: light-dark(#97325c, #F5A3C2); }
}

/* ── Transitions ─────────────────────────────────────────────────────────── */
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
  .cart-fade-enter-active,
  .cart-fade-leave-active { transition: none; }
  .cart-close:active,
  .cart-remove:active { transform: none; }
}
</style>
