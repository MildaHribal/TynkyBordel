<script setup lang="ts">
import { useCartStore } from "~/stores/cart";
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuth } from '~/composables/useAuth';
import { Icon } from '@iconify/vue';

const cart = useCartStore();
const { currentUser, signOut } = useAuth();
const toast = useCosmicToast();
const router = useRouter();

const isScrolled = ref(false);
const isMobileMenuOpen = ref(false);
const showBackToTop = ref(false);

// ── Inline search state ─────────────────────────────────────────────────────
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const isSearchFocused = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const showSearchDropdown = computed(
  () => isSearchFocused.value && searchQuery.value.length >= 2,
);

watch(searchQuery, (q) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!q || q.length < 2) {
    searchResults.value = [];
    return;
  }
  searchTimeout = setTimeout(async () => {
    isSearching.value = true;
    try {
      const res = await $fetch(`/api/products?search=${encodeURIComponent(q)}`);
      searchResults.value = res as any[];
    } catch (err) {
      console.error(err);
    } finally {
      isSearching.value = false;
    }
  }, 180);
});

const closeSearch = () => {
  isSearchFocused.value = false;
  searchQuery.value = '';
};

const goToResult = (slug: string) => {
  closeSearch();
  isMobileMenuOpen.value = false;
  router.push(`/product/${slug}`);
};

// ── Auth ────────────────────────────────────────────────────────────────────
const logout = async () => {
  await signOut();
  isMobileMenuOpen.value = false;
  toast.success('Odhlášení', 'Úspěšně jste se odhlásili.');
};

// ── Scroll behaviors ────────────────────────────────────────────────────────
// The main navbar scrolls away with the page. The floating cart should appear
// only AFTER the navbar (~100px tall) is gone — otherwise both carts show at once.
const navbarGone = ref(false);
const handleScroll = () => {
  const y = window.scrollY;
  isScrolled.value = y > 20;
  navbarGone.value = y > 110;
  showBackToTop.value = y > 400;
};
const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// ── Focus-out closes dropdown; small delay so click on result still fires ──
const searchWrapRef = ref<HTMLElement | null>(null);
const onSearchBlur = () => {
  setTimeout(() => {
    if (!searchWrapRef.value?.contains(document.activeElement)) {
      isSearchFocused.value = false;
    }
  }, 120);
};

// ── Mobile menu body-lock ───────────────────────────────────────────────────
watch(isMobileMenuOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : '';
  }
});

onMounted(() => {
  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  if (typeof document !== 'undefined') document.body.style.overflow = '';
});
</script>

<template>
  <!-- Main navbar — in flow, scrolls away with the page. -->
  <div class="navbar-shell">
    <!-- Left: Brand -->
    <NuxtLink to="/" class="brand-link" @click="isMobileMenuOpen = false">
      <NuxtImg src="/hero/logo-mushroom.png" alt="" class="brand-art" width="40" height="40" format="webp" quality="85" loading="eager" />
      <span class="brand-text">Týnky Bordel</span>
    </NuxtLink>

    <!-- Center: Desktop nav pill with links + inline search -->
    <nav class="navbar-main hidden md:flex" :class="{ 'navbar--scrolled': isScrolled }">
      <NuxtLink to="/#kolekce" class="nav-link">Shop</NuxtLink>
      <NuxtLink to="/#about" class="nav-link">About</NuxtLink>
      <NuxtLink to="/reklamace" class="nav-link">Doprava</NuxtLink>

      <div class="nav-search" ref="searchWrapRef">
        <Icon icon="iconamoon:search-fill" height="16" class="nav-search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Hledej…"
          class="nav-search-input"
          @focus="isSearchFocused = true"
          @blur="onSearchBlur"
          @keydown.esc="closeSearch"
        />

        <!-- Results dropdown (desktop) -->
        <div v-if="showSearchDropdown" class="search-dropdown">
          <div v-if="isSearching" class="search-state">
            <Icon icon="lucide:loader-2" class="animate-spin" height="16" />
            Hledám…
          </div>
          <div v-else-if="searchResults.length === 0" class="search-state">
            Nic pro <strong>„{{ searchQuery }}"</strong>.
          </div>
          <ul v-else class="search-list">
            <li v-for="prod in searchResults" :key="prod.id">
              <button
                type="button"
                class="search-item"
                @mousedown.prevent="goToResult(prod.slug)"
              >
                <div class="search-thumb">
                  <NuxtImg
                    v-if="prod.image"
                    :src="prod.image.startsWith('http') || prod.image.startsWith('/') ? prod.image : `/${prod.image}`"
                    width="80"
                    height="80"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div class="search-item-body">
                  <span class="search-item-title">{{ prod.title }}</span>
                  <span v-if="prod.category" class="search-item-cat">{{ prod.category }}</span>
                </div>
                <span class="search-item-price">{{ prod.price }} Kč</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <!-- Right: User + Cart (desktop) / Hamburger (mobile) -->
    <div class="navbar-right">
      <NuxtLink to="/user" class="nav-avatar-btn hidden md:flex" title="Můj profil" aria-label="Můj profil">
        <Icon icon="mdi:account" height="20" />
      </NuxtLink>

      <button type="button" data-cart-anchor="true" class="nav-avatar-btn relative hidden md:flex" title="Košík" aria-label="Košík" @click="cart.openDrawer()">
        <Icon icon="mdi:cart" height="20" />
        <span v-if="cart.itemCount > 0" class="cart-badge-small">{{ cart.itemCount }}</span>
      </button>

      <!-- Cart (phones) — quick access to the drawer -->
      <button
        type="button"
        data-cart-anchor="true"
        class="mobile-icon-btn md:hidden relative"
        title="Košík"
        aria-label="Košík"
        @click="cart.openDrawer()"
      >
        <Icon icon="mdi:cart-outline" height="21" />
        <span v-if="cart.itemCount > 0" class="cart-badge-small">{{ cart.itemCount }}</span>
      </button>

      <button
        class="hamburger-btn md:hidden"
        :class="{ 'is-open': isMobileMenuOpen }"
        @click="isMobileMenuOpen = !isMobileMenuOpen"
        :aria-label="isMobileMenuOpen ? 'Zavřít menu' : 'Otevřít menu'"
      >
        <span class="hamburger-line" />
        <span class="hamburger-line" />
        <span class="hamburger-line" />
      </button>
    </div>
  </div>

  <!-- ─── Mobile menu overlay ─────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="mobile-menu">
      <div v-if="isMobileMenuOpen" class="mobile-menu">
        <div class="mobile-menu-inner">
          <!-- Header with close button -->
          <div class="mobile-menu-header">
            <NuxtLink to="/" class="mobile-menu-brand" @click="isMobileMenuOpen = false">Týnky Bordel</NuxtLink>
            <button class="mobile-close-btn" @click="isMobileMenuOpen = false" aria-label="Zavřít menu">
              <Icon icon="mdi:close" height="24" />
            </button>
          </div>

          <!-- Mobile search -->
          <div class="mobile-search" ref="searchWrapRef">
            <Icon icon="iconamoon:search-fill" height="18" class="mobile-search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Hledej produkty…"
              class="mobile-search-input"
              @focus="isSearchFocused = true"
              @blur="onSearchBlur"
              @keydown.esc="closeSearch"
              autofocus
            />
            <button v-if="searchQuery" class="mobile-search-clear" @click="searchQuery = ''" aria-label="Vymazat">
              <Icon icon="mdi:close" height="16" />
            </button>
          </div>

          <div v-if="showSearchDropdown" class="mobile-results">
            <div v-if="isSearching" class="search-state">
              <Icon icon="lucide:loader-2" class="animate-spin" height="18" /> Hledám…
            </div>
            <div v-else-if="searchResults.length === 0" class="search-state">
              Nic pro <strong>„{{ searchQuery }}"</strong>.
            </div>
            <ul v-else class="search-list">
              <li v-for="prod in searchResults" :key="prod.id">
                <button type="button" class="search-item" @mousedown.prevent="goToResult(prod.slug)">
                  <div class="search-thumb">
                    <NuxtImg
                      v-if="prod.image"
                      :src="prod.image.startsWith('http') || prod.image.startsWith('/') ? prod.image : `/${prod.image}`"
                      width="80" height="80" class="w-full h-full object-cover"
                    />
                  </div>
                  <div class="search-item-body">
                    <span class="search-item-title">{{ prod.title }}</span>
                    <span v-if="prod.category" class="search-item-cat">{{ prod.category }}</span>
                  </div>
                  <span class="search-item-price">{{ prod.price }} Kč</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Nav links -->
          <nav class="mobile-nav">
            <NuxtLink to="/#kolekce" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon icon="lucide:shopping-bag" height="20" />
              <span>Shop</span>
            </NuxtLink>
            <NuxtLink to="/#about" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon icon="lucide:user-round" height="20" />
              <span>About</span>
            </NuxtLink>
            <NuxtLink to="/reklamace" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon icon="lucide:truck" height="20" />
              <span>Doprava &amp; reklamace</span>
            </NuxtLink>
            <NuxtLink to="/cart" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon icon="lucide:shopping-cart" height="20" />
              <span>Košík</span>
              <span v-if="cart.itemCount > 0" class="mobile-badge">{{ cart.itemCount }}</span>
            </NuxtLink>
            <NuxtLink to="/user" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon icon="lucide:circle-user-round" height="20" />
              <span>{{ currentUser ? 'Můj profil' : 'Přihlášení' }}</span>
            </NuxtLink>
            <button v-if="currentUser" class="mobile-link mobile-link--danger" @click="logout">
              <Icon icon="lucide:log-out" height="20" />
              <span>Odhlásit se</span>
            </button>
          </nav>

          <div class="mobile-footer">
            © {{ new Date().getFullYear() }} Tynky Bordel
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ─── Scroll-to-top button ────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="scroll-top">
      <button
        v-if="showBackToTop && !isMobileMenuOpen"
        @click="scrollToTop"
        class="scroll-top-btn"
        title="Nahoru"
        aria-label="Zpět nahoru"
      >
        <Icon icon="lucide:arrow-up" height="20" />
      </button>
    </Transition>
  </Teleport>

  <!-- ─── Floating cart (top-right when navbar out of view) ────────────── -->
  <Teleport to="body">
    <Transition name="cart-float">
      <button
        v-if="navbarGone && !isMobileMenuOpen"
        type="button"
        data-cart-anchor="true"
        class="cart-float-btn"
        title="Košík"
        aria-label="Košík"
        @click="cart.openDrawer()"
      >
        <Icon icon="mdi:cart" height="20" />
        <span v-if="cart.itemCount > 0" class="cart-float-badge">{{ cart.itemCount }}</span>
      </button>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Shell ────────────────────────────────────────────── */
.navbar-shell {
  position: relative;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  min-height: 60px;
}
@media (min-width: 768px) {
  .navbar-shell { padding: 0.75rem 1rem; }
}
@media (min-width: 768px) {
  .navbar-shell { gap: 1.5rem; padding: 1rem 2rem 0; }
}

/* ── Brand ────────────────────────────────────────────── */
.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  color: var(--pop-ink);
  transition: transform 0.25s ease;
}
.brand-link:hover { transform: scale(1.02); }
.brand-art { width: 32px; height: 32px; object-fit: contain; }
@media (min-width: 768px) { .brand-art { width: 38px; height: 38px; } }
.brand-text {
  font-family: 'Berkshire Swash', cursive;
  font-weight: 400;
  font-size: 1.3rem;
  letter-spacing: -0.01em;
  text-transform: none;
  line-height: 1;
  white-space: nowrap;
  color: #14231a;
}
@media (min-width: 768px) { .brand-text { font-size: 1.5rem; } }

/* ── Center pill (desktop) ────────────────────────────── */
.navbar-main {
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem 0.4rem 1rem;
  background: #FBF5EA;
  border: 2px solid var(--pop-ink, #14231a);
  border-radius: 9999px;
  color: var(--pop-ink, #14231a);
  box-shadow: 3px 3px 0 rgba(20, 35, 26, 0.85);
  transition: box-shadow 0.25s ease;
  position: relative;
}
.navbar--scrolled { box-shadow: 4px 4px 0 rgba(20, 35, 26, 0.85); }

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.85rem;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pop-ink, #14231a);
  text-decoration: none;
  border-radius: 9999px;
  transition: background 0.2s ease, color 0.2s ease;
  white-space: nowrap;
}
.nav-link:hover { background: var(--pop-pink, #E585AA); color: var(--pop-ink, #14231a); }

/* ── Inline search (desktop) ─────────────────────────── */
.nav-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.35rem;
  padding: 0.3rem 0.65rem 0.3rem 0.75rem;
  background: rgba(20, 35, 26, 0.06);
  border: 1.5px solid rgba(20, 35, 26, 0.16);
  border-radius: 9999px;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, width 0.25s ease;
  width: 180px;
}
.nav-search:focus-within {
  background: #ffffff;
  border-color: var(--pop-ink, #14231a);
  width: 260px;
  box-shadow: 0 4px 14px rgba(20, 35, 26, 0.12);
}
.nav-search-icon { color: rgba(20, 35, 26, 0.5); flex-shrink: 0; }
.nav-search:focus-within .nav-search-icon { color: rgba(20, 35, 26, 0.55); }
.nav-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.82rem;
  color: var(--pop-ink, #14231a);
}
.nav-search-input::placeholder { color: rgba(20, 35, 26, 0.45); }
.nav-search:focus-within .nav-search-input { color: var(--pop-ink); }
.nav-search:focus-within .nav-search-input::placeholder { color: rgba(20, 35, 26, 0.35); }

/* ── Search dropdown ─────────────────────────────────── */
.search-dropdown {
  position: absolute;
  top: calc(100% + 0.6rem);
  right: 0;
  z-index: 60;
  width: 380px;
  max-height: 60vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1rem;
  box-shadow: 0 18px 44px rgba(20, 35, 26, 0.25);
  padding: 0.4rem;
}

.search-state {
  padding: 1.25rem 1rem;
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 0.88rem;
  color: rgba(20, 35, 26, 0.6);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
}
.search-state strong { color: var(--pop-ink); font-weight: 700; margin: 0 0.15rem; }

.search-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.search-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.55rem 0.65rem;
  background: transparent;
  border: none;
  border-radius: 0.55rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
  color: var(--pop-ink);
}
.search-item:hover { background: rgba(20, 35, 26, 0.06); }
.search-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: #f1ebdf;
  flex-shrink: 0;
}
.search-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.search-item-title {
  font-family: 'Manrope', system-ui;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--pop-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-item-cat {
  font-family: 'Manrope', system-ui;
  font-weight: 600;
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(20, 35, 26, 0.5);
}
.search-item-price {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--pop-ink);
  flex-shrink: 0;
}

/* ── Right zone (avatars + hamburger) ────────────────── */
.navbar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
@media (min-width: 768px) { .navbar-right { gap: 0.75rem; } }

/* Desktop-only top-bar icons. Scoped styles outrank Tailwind's `hidden md:flex`
   utilities (higher specificity via the [data-v] attribute), so the mobile-hidden
   / desktop-shown behaviour is enforced here with a media query instead. */
.nav-avatar-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid var(--pop-ink, #14231a);
  color: var(--pop-ink);
  box-shadow: 2px 2px 0 rgba(20, 35, 26, 0.85);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
  text-decoration: none;
  position: relative;
}
@media (min-width: 768px) { .nav-avatar-btn { display: flex; width: 46px; height: 46px; } }
.nav-avatar-btn:hover {
  transform: translate(-1px, -1px);
  background: var(--pop-pink, #E585AA);
  box-shadow: 3px 3px 0 rgba(20, 35, 26, 0.85);
}

.cart-badge-small {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffffff;
  background: #b3324c;
  border-radius: 9999px;
  border: 2px solid #ffffff;
}

/* ── Hamburger (mobile) ──────────────────────────────── */
/* Mobile cart button — matches the hamburger so the pair reads as one control set. */
.mobile-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: #1a0f28;
  color: #fbf4ea;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(20, 35, 26, 0.2);
  transition: background 0.2s ease, transform 0.15s ease;
}
.mobile-icon-btn:hover { background: #14231a; }
.mobile-icon-btn:active { transform: scale(0.93); }
/* Scoped display above outranks Tailwind's `md:hidden`, so enforce hide on
   desktop explicitly — otherwise the mobile cart shows next to the desktop one. */
@media (min-width: 768px) { .mobile-icon-btn { display: none; } }

.hamburger-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: #1a0f28;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(20, 35, 26, 0.2);
  transition: background 0.2s ease;
  padding: 0;
}
.hamburger-btn:hover { background: #14231a; }
/* Phones only — hidden from tablet/desktop up (scoped rule outranks `md:hidden`). */
@media (min-width: 768px) { .hamburger-btn { display: none; } }

.hamburger-line {
  display: block;
  width: 18px;
  height: 2px;
  background: #ffffff;
  border-radius: 2px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.2s ease;
  transform-origin: center;
}
.hamburger-btn.is-open .hamburger-line:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger-btn.is-open .hamburger-line:nth-child(2) { opacity: 0; }
.hamburger-btn.is-open .hamburger-line:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* ── Mobile menu ─────────────────────────────────────── */
.mobile-menu {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #ffffff;
  overflow-y: auto;
}
.mobile-menu-inner {
  min-height: 100%;
  padding: 1.25rem 1.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.mobile-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}
.mobile-menu-brand {
  font-family: 'Berkshire Swash', cursive;
  font-size: 1.5rem;
  color: #14231a;
  text-decoration: none;
  letter-spacing: -0.01em;
}
.mobile-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgba(20, 35, 26, 0.06);
  color: #14231a;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.mobile-close-btn:hover {
  background: rgba(20, 35, 26, 0.12);
  transform: rotate(90deg);
}

.mobile-search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  background: #f1ebdf;
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1rem;
}
.mobile-search-icon { color: rgba(20, 35, 26, 0.55); flex-shrink: 0; }
.mobile-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: 'Manrope', system-ui;
  font-weight: 500;
  font-size: 1rem;
  color: var(--pop-ink);
}
.mobile-search-input::placeholder { color: rgba(20, 35, 26, 0.4); }
.mobile-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  background: rgba(20, 35, 26, 0.1);
  border: none;
  color: rgba(20, 35, 26, 0.6);
  cursor: pointer;
}

.mobile-results {
  background: #ffffff;
  border: 1px solid rgba(20, 35, 26, 0.08);
  border-radius: 1rem;
  padding: 0.4rem;
  max-height: 45vh;
  overflow-y: auto;
}

.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.mobile-link {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem 1.1rem;
  background: #f1ebdf;
  border: 1px solid rgba(20, 35, 26, 0.06);
  border-radius: 0.9rem;
  text-decoration: none;
  font-family: 'Manrope', system-ui;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  color: var(--pop-ink);
  transition: transform 0.2s ease, background 0.2s ease;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
.mobile-link:hover { transform: translateX(3px); background: #ede4d3; }
.mobile-link--danger { color: #8a2a2a; }
.mobile-badge {
  margin-left: auto;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffffff;
  background: #b3324c;
  border-radius: 9999px;
}

.mobile-footer {
  margin-top: auto;
  text-align: center;
  font-family: 'Manrope', system-ui;
  font-size: 0.72rem;
  color: rgba(20, 35, 26, 0.4);
  padding-top: 1rem;
}

/* ── Floating buttons ────────────────────────────────── */
.scroll-top-btn {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 60;
  width: 46px;
  height: 46px;
  border-radius: 9999px;
  background: var(--pop-pink, #E585AA);
  color: var(--pop-ink, #14231a);
  border: 2px solid var(--pop-ink, #14231a);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 3px 3px 0 rgba(20, 35, 26, 0.6);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.scroll-top-btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 rgba(20, 35, 26, 0.6);
}
@media (min-width: 768px) {
  .scroll-top-btn { right: 1.75rem; bottom: 1.75rem; width: 50px; height: 50px; }
}

.cart-float-btn {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 60;
  width: 46px;
  height: 46px;
  border-radius: 9999px;
  background: #ffffff;
  color: var(--pop-ink);
  border: 1px solid rgba(20, 35, 26, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(20, 35, 26, 0.18);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
}
.cart-float-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 10px 24px rgba(20, 35, 26, 0.24);
}
@media (min-width: 768px) {
  .cart-float-btn { top: 1.25rem; right: 1.5rem; width: 50px; height: 50px; }
}
/* Phones: keep the floating cart visible when scrolled (dark, matching the
   navbar buttons); it stays top-right while scroll-to-top sits bottom-right. */
@media (max-width: 767px) {
  .cart-float-btn {
    background: #1a0f28;
    color: #fbf4ea;
    border: none;
    box-shadow: 0 6px 18px rgba(20, 8, 36, 0.32);
  }
}
.cart-float-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffffff;
  background: #b3324c;
  border-radius: 9999px;
  border: 2px solid #ffffff;
}

/* ── Transitions ─────────────────────────────────────── */
.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}

.scroll-top-enter-active,
.scroll-top-leave-active,
.cart-float-enter-active,
.cart-float-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.scroll-top-enter-from,
.scroll-top-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.8);
}
.cart-float-enter-from,
.cart-float-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.85);
}
</style>
