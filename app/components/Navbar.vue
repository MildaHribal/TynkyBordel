<script setup lang="ts">
import { useCartStore } from "~/stores/cart";
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuth } from '~/composables/useAuth';
import { useTheme } from '~/composables/useTheme';


const cart = useCartStore();
const { currentUser, signOut } = useAuth();
// Světlý/tmavý režim. Samotné přebarvení stránky (i ikonku slunce↔měsíc) řeší
// CSS — odtud jde jen klik a stav pro čtečky. Detaily v composables/useTheme.ts.
const { isDark: isDarkTheme, label: themeLabel, toggle: toggleTheme } = useTheme();
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
// Odpovědi můžou dorazit v jiném pořadí, než v jakém odešly — bereme jen tu
// poslední, jinak pomalejší dotaz na „kl" přepíše výsledky pro „klicenka".
let searchRequestId = 0;

const hasSearchQuery = computed(() => searchQuery.value.trim().length >= 2);
const showSearchDropdown = computed(() => isSearchFocused.value && hasSearchQuery.value);
// Na mobilu je panel s výsledky samostatný blok pod inputem — kdyby závisel na
// fokusu, zmizel by ve chvíli, kdy uživatel schová klávesnici nebo scrolluje.
const showMobileResults = computed(() => hasSearchQuery.value);

watch(searchQuery, (q) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  const term = q.trim();
  if (term.length < 2) {
    searchRequestId++;
    searchResults.value = [];
    isSearching.value = false;
    return;
  }
  // Spinner zapínáme hned, ne až po debounce — jinak během psaní problikne
  // hláška „Nic pro…", i když se teprve chystáme hledat.
  isSearching.value = true;
  searchTimeout = setTimeout(async () => {
    const requestId = ++searchRequestId;
    try {
      const res = await $fetch(`/api/products?search=${encodeURIComponent(term)}&limit=8`);
      if (requestId !== searchRequestId) return;
      searchResults.value = res as any[];
    } catch (err) {
      if (requestId !== searchRequestId) return;
      searchResults.value = [];
      console.error(err);
    } finally {
      if (requestId === searchRequestId) isSearching.value = false;
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

// Enter otevře první (nejrelevantnější) výsledek — samostatná stránka s
// výsledky vyhledávání zatím neexistuje.
const onSearchEnter = () => {
  const first = searchResults.value[0];
  if (first?.slug) goToResult(first.slug);
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
// Desktopový a mobilní vyhledávač měly obě `ref="searchWrapRef"`. Vue si stejný
// template ref přepisuje, takže po zavření mobilního menu zůstal ref null a
// blur pak zavíral našeptávač i při kliku dovnitř. Každý má proto svůj vlastní.
const searchWrapRef = ref<HTMLElement | null>(null);
const mobileSearchWrapRef = ref<HTMLElement | null>(null);
const onSearchBlur = () => {
  setTimeout(() => {
    const active = document.activeElement;
    const stillInside =
      searchWrapRef.value?.contains(active) ||
      mobileSearchWrapRef.value?.contains(active);
    if (!stillInside) isSearchFocused.value = false;
  }, 120);
};

// ── Mobile menu body-lock ───────────────────────────────────────────────────
watch(isMobileMenuOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : '';
  }
  // Zavřené menu = zahozený dotaz, ať se našeptávač nevynoří na desktopu.
  if (!open) closeSearch();
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
      <NuxtImg src="/hero/logo-mushroom.png" alt="" class="brand-art" width="40" height="40" format="webp" quality="86" loading="eager" />
      <span class="brand-text">Týnky Bordel</span>
    </NuxtLink>

    <!-- Center: Desktop nav pill with links + inline search -->
    <nav class="navbar-main hidden md:flex" :class="{ 'navbar--scrolled': isScrolled }">
      <NuxtLink to="/#kolekce" class="nav-link">Shop</NuxtLink>
      <NuxtLink to="/#about" class="nav-link">About</NuxtLink>

      <div class="nav-search" ref="searchWrapRef">
        <Icon name="iconamoon:search-fill" height="16" class="nav-search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Hledej…"
          class="nav-search-input"
          @focus="isSearchFocused = true"
          @blur="onSearchBlur"
          @keydown.esc="closeSearch"
          @keydown.enter.prevent="onSearchEnter"
        />

        <!-- Results dropdown (desktop) -->
        <div v-if="showSearchDropdown" class="search-dropdown">
          <div v-if="isSearching" class="search-state">
            <Icon name="lucide:loader-2" class="animate-spin" height="16" />
            Hledám…
          </div>
          <div v-else-if="searchResults.length === 0" class="search-state">
            Nic pro <strong>„{{ searchQuery }}"</strong>.
          </div>
          <ul v-else class="search-list">
            <li v-for="prod in searchResults" :key="prod.id">
              <!-- mousedown jen drží fokus v inputu (jinak by blur zavřel panel
                   dřív, než klik dorazí); navigujeme až na click, aby to fungovalo
                   i dotykem a klávesnicí. -->
              <button
                type="button"
                class="search-item"
                @mousedown.prevent
                @click="goToResult(prod.slug)"
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
      <!-- Linktree (desktop) — stejné „samolepkové" tlačítko jako profil a
           košík, jen odkazuje ven; sedí hned vlevo od přepínače tématu. -->
      <a
        href="https://linktr.ee/tynky_bordel"
        target="_blank"
        rel="noopener noreferrer"
        class="nav-avatar-btn hidden md:flex"
        title="Linktree"
        aria-label="Linktree"
      >
        <Icon name="simple-icons:linktree" height="18" />
      </a>

      <!-- Přepínač tématu (desktop) — hned vedle tlačítka profilu.
           Ikona se řídí CSS proměnnou --tb-dark, ne Vue stavem, takže je
           správná už v prvním snímku a nepřehraje si animaci při načtení. -->
      <button
        type="button"
        class="nav-avatar-btn theme-toggle hidden md:flex"
        :aria-label="themeLabel"
        :title="themeLabel"
        :aria-pressed="isDarkTheme"
        @click="toggleTheme"
      >
        <svg class="theme-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <g class="theme-sun">
            <circle cx="12" cy="12" r="5" />
            <g class="theme-sun-rays">
              <line x1="12" y1="1.5" x2="12" y2="3.6" />
              <line x1="12" y1="20.4" x2="12" y2="22.5" />
              <line x1="1.5" y1="12" x2="3.6" y2="12" />
              <line x1="20.4" y1="12" x2="22.5" y2="12" />
              <line x1="4.6" y1="4.6" x2="6.1" y2="6.1" />
              <line x1="17.9" y1="17.9" x2="19.4" y2="19.4" />
              <line x1="4.6" y1="19.4" x2="6.1" y2="17.9" />
              <line x1="17.9" y1="6.1" x2="19.4" y2="4.6" />
            </g>
          </g>
          <path class="theme-moon" d="M15.55 4.83a8 8 0 1 0 0 14.34a7.2 7.2 0 0 1 0-14.34Z" />
        </svg>
      </button>

      <NuxtLink to="/user" class="nav-avatar-btn hidden md:flex" title="Můj profil" aria-label="Můj profil">
        <Icon name="mdi:account" height="20" />
      </NuxtLink>

      <button type="button" data-cart-anchor="true" class="nav-avatar-btn relative hidden md:flex" title="Košík" aria-label="Košík" @click="cart.openDrawer()">
        <Icon name="mdi:cart" height="20" />
        <span v-if="cart.itemCount > 0" class="cart-badge-small">{{ cart.itemCount }}</span>
      </button>

      <!-- Přepínač tématu (telefony) — stejná sada tlačítek jako košík/menu. -->
      <button
        type="button"
        class="mobile-icon-btn theme-toggle md:hidden"
        :aria-label="themeLabel"
        :title="themeLabel"
        :aria-pressed="isDarkTheme"
        @click="toggleTheme"
      >
        <svg class="theme-icon" viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
          <g class="theme-sun">
            <circle cx="12" cy="12" r="5" />
            <g class="theme-sun-rays">
              <line x1="12" y1="1.5" x2="12" y2="3.6" />
              <line x1="12" y1="20.4" x2="12" y2="22.5" />
              <line x1="1.5" y1="12" x2="3.6" y2="12" />
              <line x1="20.4" y1="12" x2="22.5" y2="12" />
              <line x1="4.6" y1="4.6" x2="6.1" y2="6.1" />
              <line x1="17.9" y1="17.9" x2="19.4" y2="19.4" />
              <line x1="4.6" y1="19.4" x2="6.1" y2="17.9" />
              <line x1="17.9" y1="6.1" x2="19.4" y2="4.6" />
            </g>
          </g>
          <path class="theme-moon" d="M15.55 4.83a8 8 0 1 0 0 14.34a7.2 7.2 0 0 1 0-14.34Z" />
        </svg>
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
        <Icon name="mdi:cart-outline" height="21" />
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
              <Icon name="mdi:close" height="24" />
            </button>
          </div>

          <!-- Mobile search — input i výsledky musí být v jednom obalu, protože
               onSearchBlur se ptá, jestli fokus zůstal uvnitř. -->
          <div ref="mobileSearchWrapRef" class="mobile-search-wrap">
            <div class="mobile-search">
              <Icon name="iconamoon:search-fill" height="18" class="mobile-search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Hledej produkty…"
                class="mobile-search-input"
                @focus="isSearchFocused = true"
                @blur="onSearchBlur"
                @keydown.esc="closeSearch"
                @keydown.enter.prevent="onSearchEnter"
                autofocus
              />
              <button
                v-if="searchQuery"
                type="button"
                class="mobile-search-clear"
                aria-label="Vymazat"
                @mousedown.prevent
                @click="searchQuery = ''"
              >
                <Icon name="mdi:close" height="16" />
              </button>
            </div>

            <div v-if="showMobileResults" class="mobile-results">
              <div v-if="isSearching" class="search-state">
                <Icon name="lucide:loader-2" class="animate-spin" height="18" /> Hledám…
              </div>
              <div v-else-if="searchResults.length === 0" class="search-state">
                Nic pro <strong>„{{ searchQuery }}"</strong>.
              </div>
              <ul v-else class="search-list">
                <li v-for="prod in searchResults" :key="prod.id">
                  <button type="button" class="search-item" @mousedown.prevent @click="goToResult(prod.slug)">
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
          </div>

          <!-- Nav links -->
          <nav class="mobile-nav">
            <NuxtLink to="/#kolekce" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon name="lucide:shopping-bag" height="20" />
              <span>Shop</span>
            </NuxtLink>
            <NuxtLink to="/#about" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon name="lucide:user-round" height="20" />
              <span>About</span>
            </NuxtLink>
            <a
              href="https://linktr.ee/tynky_bordel"
              target="_blank"
              rel="noopener noreferrer"
              class="mobile-link"
              aria-label="Linktree"
              @click="isMobileMenuOpen = false"
            >
              <Icon name="simple-icons:linktree" height="20" />
              <span>Linktree</span>
            </a>
            <NuxtLink to="/cart" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon name="lucide:shopping-cart" height="20" />
              <span>Košík</span>
              <span v-if="cart.itemCount > 0" class="mobile-badge">{{ cart.itemCount }}</span>
            </NuxtLink>
            <NuxtLink to="/user" class="mobile-link" @click="isMobileMenuOpen = false">
              <Icon name="lucide:circle-user-round" height="20" />
              <span>{{ currentUser ? 'Můj profil' : 'Přihlášení' }}</span>
            </NuxtLink>
            <button v-if="currentUser" class="mobile-link mobile-link--danger" @click="logout">
              <Icon name="lucide:log-out" height="20" />
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
        <Icon name="lucide:arrow-up" height="20" />
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
        <Icon name="mdi:cart" height="20" />
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
  font-family: var(--font-zine);
  /* Bricolage is sliced to wght 600-800 (scripts/build-fonts.py), so the old
     400 had no master in the file — the browser faux-thinned it and the brand
     read washed out. 800 is the display weight the rest of the identity uses. */
  font-weight: 800;
  font-size: 1.3rem;
  letter-spacing: -0.01em;
  text-transform: none;
  line-height: 1;
  white-space: nowrap;
  color: var(--pop-ink);
}
@media (min-width: 768px) { .brand-text { font-size: 1.5rem; } }

/* ── Center pill (desktop) ────────────────────────────── */
.navbar-main {
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem 0.4rem 1rem;
  background: var(--pop-card);
  border: 2px solid var(--pop-ink);
  border-radius: 9999px;
  color: var(--pop-ink);
  box-shadow: 3px 3px 0 var(--pop-shadow);
  transition: box-shadow 0.25s ease;
  position: relative;
}
.navbar--scrolled { box-shadow: 4px 4px 0 var(--pop-shadow); }

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.85rem;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pop-ink);
  text-decoration: none;
  border-radius: 9999px;
  transition: background 0.2s ease, color 0.2s ease;
  white-space: nowrap;
}
/* Pink fill stays light in dark mode, so the label on it must stay dark. */
.nav-link:hover { background: var(--pop-pink); color: var(--pop-ink-on-accent); }

/* ── Inline search (desktop) ─────────────────────────── */
.nav-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.35rem;
  padding: 0.3rem 0.65rem 0.3rem 0.75rem;
  background: var(--pop-ink-wash);
  border: 1.5px solid var(--pop-line);
  border-radius: 9999px;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, width 0.25s ease;
  width: 180px;
}
.nav-search:focus-within {
  background: var(--pop-sheet);
  border-color: var(--pop-ink);
  width: 260px;
  box-shadow: 0 4px 14px var(--pop-shadow-soft);
}
.nav-search-icon { color: var(--pop-ink-mute); flex-shrink: 0; }
.nav-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.82rem;
  color: var(--pop-ink);
}
.nav-search-input::placeholder { color: var(--pop-ink-faint); }

/* ── Search dropdown ─────────────────────────────────── */
.search-dropdown {
  position: absolute;
  top: calc(100% + 0.6rem);
  right: 0;
  z-index: 60;
  width: 380px;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--pop-sheet);
  border: 1px solid var(--pop-line);
  border-radius: 1rem;
  box-shadow: 0 18px 44px var(--pop-shadow-soft);
  padding: 0.4rem;
}

.search-state {
  padding: 1.25rem 1rem;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.88rem;
  color: var(--pop-ink-mute);
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
.search-item:hover { background: var(--pop-ink-wash); }
.search-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--pop-card-2);
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
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--pop-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-item-cat {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.66rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pop-ink-mute);
}
.search-item-price {
  font-family: var(--font-body);
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
  background: var(--pop-sheet);
  border: 2px solid var(--pop-ink);
  color: var(--pop-ink);
  box-shadow: 2px 2px 0 var(--pop-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
  text-decoration: none;
  position: relative;
  cursor: pointer;
}
@media (min-width: 768px) { .nav-avatar-btn { display: flex; width: 46px; height: 46px; } }
.nav-avatar-btn:hover {
  transform: translate(-1px, -1px);
  background: var(--pop-pink);
  /* pink fill → dark glyph, in both themes */
  color: var(--pop-ink-on-accent);
  box-shadow: 3px 3px 0 var(--pop-shadow);
}
.nav-avatar-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--pop-shadow); }

/* ── Theme toggle: sun ⇄ moon ─────────────────────────
   Sticker treatment is inherited from .nav-avatar-btn / .mobile-icon-btn
   (surface fill, 2px ink border, 2px 2px 0 hard offset, press-in on :active),
   so only the icon lives here.

   THE MORPH — it is not a cross-fade of two glyphs. One disc, one ring of
   rays, and one "bite" circle painted in the button's own fill colour:
     · the bite flies in diagonally from outside the icon and eats the disc's
       upper-right, leaving a crescent,
     · the rays retract into the disc (scale toward the centre) and fade,
     · the whole icon counter-rotates and the disc swells a hair as it lands.

   All three are driven by --tb-dark (0 → 1, set in main.css). That means the
   icon is already in the right pose on the very first paint — no JS, no
   flash, and no load-time animation to watch. Flipping the token is what
   animates it, because the computed transform changes and transitions. */
.theme-toggle {
  /* The bite must be painted in exactly the button's fill, whatever it is. */
  --toggle-bg: var(--pop-sheet);
}
.theme-toggle:hover { --toggle-bg: var(--pop-pink); }

.theme-icon {
  display: block;
  /* One rotation drives the whole handoff, so the two shapes always agree. */
  transform: rotate(calc(var(--tb-dark) * -50deg));
  transition: transform 520ms var(--ease-fluid, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Sun and crescent are separate, self-contained shapes. The previous version
   built the crescent by covering a disc with a second circle painted in the
   button's own background colour — which showed up as a stray notch the moment
   that background changed (hover) or the fill didn't match exactly. */
.theme-sun,
.theme-moon {
  transform-box: view-box;
  transform-origin: 12px 12px;
  transition:
    transform 520ms var(--ease-fluid, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 240ms ease;
}

.theme-sun {
  fill: currentColor;
  opacity: calc(1 - var(--tb-dark));
  transform: scale(calc(1 - 0.35 * var(--tb-dark)));
}

.theme-sun-rays {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
}

/* The crescent is a disc (centre 12,12 · r 8) with a second disc (centre 16.2,12
   · r 7.2) subtracted — the cut is offset purely along X, so the moon opens to
   the SIDE and reads as a C rather than having its bite taken out of the
   bottom. It is still one closed contour of two arcs, not a disc covered by a
   circle painted in the button's fill, so it survives any background. Both
   circles are concentric on Y with the sun, so the scale below is centric. */
.theme-moon {
  fill: currentColor;
  opacity: var(--tb-dark);
  transform: scale(calc(0.65 + 0.35 * var(--tb-dark)));
}

@media (prefers-reduced-motion: reduce) {
  .theme-icon,
  .theme-sun,
  .theme-moon {
    transition: none !important;
  }
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
  /* The chip is a deep wine that is dark in BOTH themes, so its glyph is the
     constant --pop-on-dark rather than --pop-ink (which flips to near-white and
     would vanish). The wine itself has no token: --pop-danger is a *text*
     colour and flips to a pale rose in dark mode, which is the opposite of what
     a filled counter needs. */
  --badge-wine: #b3324c;
  color: var(--pop-on-dark);
  background: var(--badge-wine);
  border-radius: 9999px;
  /* ring matches whatever surface the badge sits on */
  border: 2px solid var(--pop-sheet);
}

/* ── Hamburger (mobile) ──────────────────────────────── */
/* Mobile cart button — matches the hamburger so the pair reads as one control set. */
/* Same sticker treatment as .nav-avatar-btn on desktop — white fill, 2px ink
   border, hard offset shadow. These were still the old cosmic design: a dark
   purple disc with a blurred drop shadow, which read as a foreign element
   floating over the cream paper. */
.mobile-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: var(--pop-sheet);
  color: var(--pop-ink);
  border: 2px solid var(--pop-ink);
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--pop-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
}
.mobile-icon-btn:hover { background: var(--pop-pink); color: var(--pop-ink-on-accent); transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--pop-shadow); }
.mobile-icon-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--pop-shadow); }
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
  background: var(--pop-sheet);
  border: 2px solid var(--pop-ink);
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--pop-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
  padding: 0;
}
.hamburger-btn:hover { background: var(--pop-pink); transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--pop-shadow); }
.hamburger-btn:hover .hamburger-line { background: var(--pop-ink-on-accent); }
.hamburger-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--pop-shadow); }
/* Phones only — hidden from tablet/desktop up (scoped rule outranks `md:hidden`). */
@media (min-width: 768px) { .hamburger-btn { display: none; } }

.hamburger-line {
  display: block;
  width: 18px;
  height: 2.5px;
  background: var(--pop-ink);
  border-radius: 2px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.2s ease, background 0.2s ease;
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
  /* Cream paper with the same dotted print grid as <body> and the cart drawer,
     instead of flat white — the white sheet read as a system dialog rather than
     part of the shop. */
  background-color: var(--pop-cream);
  background-image:
    radial-gradient(var(--pop-dot-1) 1.3px, transparent 1.5px),
    radial-gradient(var(--pop-dot-2) 1px, transparent 1.2px);
  background-size: 26px 26px, 52px 52px;
  background-position: 0 0, 13px 13px;
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
  font-family: var(--font-zine);
  font-weight: 800;
  font-size: 1.5rem;
  text-transform: uppercase;
  color: var(--pop-ink);
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
  background: var(--pop-sheet);
  color: var(--pop-ink);
  border: 2px solid var(--pop-ink);
  box-shadow: 2px 2px 0 var(--pop-shadow);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
}
.mobile-close-btn:hover {
  background: var(--pop-pink);
  color: var(--pop-ink-on-accent);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--pop-shadow);
}
.mobile-close-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--pop-shadow);
}

/* Obal inputu + výsledků; rodičovský `gap` na ně už nesahá, řeší si ho sám. */
.mobile-search-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mobile-search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 1rem;
  background: var(--pop-card);
  border: 2px solid var(--pop-ink);
  border-radius: 9px;
}
.mobile-search-icon { color: var(--pop-ink-mute); flex-shrink: 0; }
.mobile-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 1rem;
  color: var(--pop-ink);
}
.mobile-search-input::placeholder { color: var(--pop-ink-faint); }
.mobile-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  background: var(--pop-ink-wash-2);
  border: none;
  color: var(--pop-ink-mute);
  cursor: pointer;
}

.mobile-results {
  background: var(--pop-sheet);
  border: 1px solid var(--pop-line);
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
  padding: 0.95rem 1.1rem;
  background: var(--pop-card);
  border: 2px solid var(--pop-ink);
  border-radius: 10px;
  box-shadow: 3px 3px 0 var(--pop-shadow);
  text-decoration: none;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pop-ink);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.2s ease;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
.mobile-link:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--pop-shadow); background: var(--pop-pink); color: var(--pop-ink-on-accent); }
.mobile-link:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--pop-shadow); }
.mobile-link--danger { color: var(--pop-danger); }
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
  /* Same theme-invariant wine chip as .cart-badge-small. */
  --badge-wine: #b3324c;
  color: var(--pop-on-dark);
  background: var(--badge-wine);
  border-radius: 9999px;
}

.mobile-footer {
  margin-top: auto;
  text-align: center;
  font-family: var(--font-body);
  font-size: 0.72rem;
  color: var(--pop-ink-faint);
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
  background: var(--pop-pink);
  color: var(--pop-ink-on-accent);
  border: 2px solid var(--pop-ink-on-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 3px 3px 0 var(--pop-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.scroll-top-btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 var(--pop-shadow);
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
  background: var(--pop-sheet);
  color: var(--pop-ink);
  border: 1px solid var(--pop-line);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px var(--pop-shadow-soft);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
}
.cart-float-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 10px 24px var(--pop-shadow-soft);
}
@media (min-width: 768px) {
  .cart-float-btn { top: 1.25rem; right: 1.5rem; width: 50px; height: 50px; }
}
/* Phones: keep the floating cart visible when scrolled (dark, matching the
   navbar buttons); it stays top-right while scroll-to-top sits bottom-right. */
@media (max-width: 767px) {
  .cart-float-btn {
    background: var(--pop-sheet);
    color: var(--pop-ink);
    border: 2px solid var(--pop-ink);
    box-shadow: 3px 3px 0 var(--pop-shadow);
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
  /* Same theme-invariant wine chip as .cart-badge-small. Teleported to <body>,
     so it cannot inherit the property from the navbar and redeclares it. */
  --badge-wine: #b3324c;
  color: var(--pop-on-dark);
  background: var(--badge-wine);
  border-radius: 9999px;
  border: 2px solid var(--pop-sheet);
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
