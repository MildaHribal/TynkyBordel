<script setup lang="ts">

import { ref, onMounted, onUnmounted } from 'vue'

const route = useRoute()

const navItems = [
  { label: 'Přehled',    icon: 'lucide:layout-dashboard', to: '/admin' },
  { label: 'Produkty',   icon: 'lucide:package',          to: '/admin/products' },
  { label: 'Objednávky', icon: 'lucide:shopping-bag',     to: '/admin/orders' },
  { label: 'Zákazníci',  icon: 'lucide:users',            to: '/admin/customers' },
  { label: 'E-maily',    icon: 'lucide:mail',             to: '/admin/emails' },
  { label: 'Obsah',      icon: 'lucide:type',             to: '/admin/obsah' },
]

const isActive = (path: string) => {
  if (path === '/admin') return route.path === '/admin'
  return route.path.startsWith(path)
}

// ── PWA setup (admin only) ──────────────────────────────────────────────
// Inject manifest link + theme color into the page head and register the
// service worker once the layout mounts. Keeping this in the admin layout
// scopes the PWA to admin pages without polluting the public site.
useHead({
  link: [
    { rel: 'manifest', href: '/manifest.webmanifest' },
    { rel: 'apple-touch-icon', href: '/pwa/icon-192.png' },
  ],
  meta: [
    { name: 'theme-color', content: '#2a1340' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    { name: 'apple-mobile-web-app-title', content: 'Tynky Admin' },
  ],
})

const installEvent = ref<any>(null)
const isInstalled = ref(false)

const onBIP = (e: Event) => {
  e.preventDefault()
  installEvent.value = e
}
const onAppInstalled = () => {
  installEvent.value = null
  isInstalled.value = true
}

async function install() {
  if (!installEvent.value) return
  installEvent.value.prompt()
  const choice = await installEvent.value.userChoice
  if (choice.outcome === 'accepted') {
    installEvent.value = null
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(display-mode: standalone)').matches) {
    isInstalled.value = true
  }
  window.addEventListener('beforeinstallprompt', onBIP)
  window.addEventListener('appinstalled', onAppInstalled)

  // Register the service worker (scoped to /admin/) — PRODUCTION ONLY.
  //
  // Same correctness fix as the storefront SW (plugins/sw.client.ts): admin-sw.js
  // serves cache-first, and in `nuxt dev` the /_nuxt/ chunk paths are unhashed and
  // stable, so a worker registered on localhost pins the first version of every
  // admin component it ever saw — the classic "my changes don't show up / localhost
  // is more broken than production". On dev we instead tear down any worker a
  // previous run installed under /admin/ and drop its cache.
  if ('serviceWorker' in navigator) {
    if (import.meta.dev) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(
          regs.filter((r) => r.scope.endsWith('/admin/')).map((r) => r.unregister()),
        ))
        .then((results) => {
          if (!results.some(Boolean)) return
          console.info('[pwa] dev: unregistered stale admin service worker')
          return caches?.delete('tynky-admin-v1')
        })
        .catch((err) => console.warn('[pwa] dev SW cleanup failed', err))
    } else {
      navigator.serviceWorker
        .register('/admin-sw.js', { scope: '/admin/' })
        .catch((err) => console.warn('[pwa] SW register failed', err))
    }
  }
})
onUnmounted(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('beforeinstallprompt', onBIP)
  window.removeEventListener('appinstalled', onAppInstalled)
})
</script>

<template>
  <div class="admin-shell admin-layout">
    <aside class="admin-sidebar">
      <NuxtLink to="/admin" class="sidebar-logo">
        <span class="logo-mark">🍄</span>
        <span class="logo-text">Tynky · Admin</span>
      </NuxtLink>

      <nav class="sidebar-nav">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="['sidebar-link', { active: isActive(item.to) }]"
        >
          <Icon :name="item.icon" height="18" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <button
        v-if="installEvent && !isInstalled"
        @click="install"
        class="install-btn"
        title="Nainstalovat jako aplikaci"
      >
        <Icon name="lucide:download" height="16" />
        <span>Instalovat aplikaci</span>
      </button>

      <NuxtLink to="/" class="sidebar-back">
        <Icon name="lucide:arrow-left" height="16" />
        <span>Zpět na shop</span>
      </NuxtLink>
    </aside>

    <!-- Mobile bottom tab bar — thumb-reachable primary navigation. Hidden on
         desktop, where the sidebar takes over. -->
    <nav class="admin-tabbar">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :class="['tabbar-link', { active: isActive(item.to) }]"
      >
        <Icon :name="item.icon" height="21" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
}

.admin-sidebar {
  width: 232px;
  background: var(--adx-veil-60);
  border-right: 1px solid var(--adx-vink-08);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 40;
  padding: 1.5rem 0.75rem;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.25rem 0.85rem 1.25rem;
  text-decoration: none;
  color: var(--adx-vink);
  border-bottom: 1px solid var(--adx-vink-08);
  margin-bottom: 1rem;
}

.logo-mark {
  font-size: 1.4rem;
  line-height: 1;
}

.logo-text {
  font-family: var(--font-zine);
  font-size: 1.25rem;
  letter-spacing: -0.02em;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.85rem;
  border-radius: 9px;
  color: var(--adx-vink-70);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.18s ease;
}
.sidebar-link:hover {
  color: var(--adx-vink);
  background: var(--adx-vink-05);
}
.sidebar-link.active {
  color: var(--adx-vink);
  background: var(--adx-accent-10);
  font-weight: 600;
}

.install-btn {
  margin-top: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: var(--adx-vink-fill);
  color: var(--adx-on-vink-fill);
  border: none;
  border-radius: 9px;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  justify-content: center;
  transition: background 0.18s ease;
}
.install-btn:hover { background: var(--adx-vink-fill-hover); }

.sidebar-back {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  color: var(--adx-vink-50);
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  border-top: 1px solid var(--adx-vink-08);
  padding-top: 1rem;
  margin-top: 0.75rem;
  transition: color 0.18s ease;
}
.sidebar-back:hover { color: var(--adx-vink); }

.admin-main {
  flex: 1;
  margin-left: 232px;
  padding: 2.25rem 2.25rem 3rem;
  min-height: 100vh;
  max-width: 100%;
}

/* Bottom tab bar — mobile only. Hidden on desktop. */
.admin-tabbar { display: none; }

@media (max-width: 768px) {
  /* Stack vertically: top bar, then content (tab bar is fixed, out of flow). */
  .admin-layout { flex-direction: column; }

  /* Sidebar becomes a slim sticky top bar: just brand + back-to-shop. The
     section links move to the bottom tab bar so they're reachable by thumb. */
  .admin-sidebar {
    width: 100%;
    height: auto;
    position: sticky;
    top: 0;
    flex-direction: row;
    padding: 0.7rem 1rem;
    align-items: center;
    gap: 0.5rem;
    overflow: visible;
    border-right: 0;
    border-bottom: 1px solid var(--adx-vink-08);
  }
  .sidebar-logo {
    padding: 0;
    border-bottom: 0;
    margin-bottom: 0;
    margin-right: auto;
    white-space: nowrap;
  }
  /* Section nav + install prompt live in the bottom bar on mobile. */
  .sidebar-nav,
  .install-btn { display: none; }
  .sidebar-back {
    border-top: 0;
    padding: 0.4rem 0.5rem;
    margin-top: 0;
    white-space: nowrap;
  }
  .sidebar-back span { display: none; }

  .admin-main {
    margin-left: 0;
    /* Leave room for the fixed bottom tab bar (+ iOS home indicator). */
    padding: 1.15rem 1rem calc(5.25rem + env(safe-area-inset-bottom));
  }

  .admin-tabbar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--adx-veil-92);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--adx-vink-10);
    padding: 0.4rem 0.35rem calc(0.4rem + env(safe-area-inset-bottom));
    box-shadow: 0 -4px 20px var(--adx-vink-06);
  }
  .tabbar-link {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0.35rem 0.15rem;
    min-height: 52px;
    border-radius: 12px;
    text-decoration: none;
    color: var(--adx-vink-50);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .tabbar-link span {
    text-align: center;
    line-height: 1.1;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tabbar-link.active {
    color: var(--adx-accent);
    background: var(--adx-accent-09);
  }
  .tabbar-link:active { background: var(--adx-vink-06); }
}
</style>

<!-- Admin-only global CSS — loaded only when the admin layout renders,
     keeping it out of the storefront's render-blocking bundle. -->
<style src="~~/assets/css/admin.css"></style>

<style>
/* ══════════════════════════════════════════════════════════════
   ADMIN PALETTE — --adx-*
   ──────────────────────────────────────────────────────────────
   Why this exists, and why it lives here rather than in main.css:

   The admin is NOT painted with the storefront's --pop-* palette. It
   has its own pastel-pink skin (assets/css/admin.css, the --ad-*
   tokens) plus a violet ink (#2a1340 / rgba(42,19,64,α)) hardcoded
   throughout the admin pages. None of those values coincide with a
   --pop-* token, so mapping them onto --pop-* would repaint the admin
   in light mode. Instead this block does exactly what main.css does
   for the shop — it declares the admin's OWN palette once, with the
   light half byte-identical to what was hardcoded before (light mode
   is a pixel-for-pixel no-op) and a dark half taken from main.css's
   "midnight riso" ramp (#1B1129 ground · #2B1E3F card · #33244C sheet
   · #3C2B58 raised · #EFE6F6 ink).

   Naming: --adx-ink* is the GREEN ink family (#14231a) admin.css
   uses; --adx-vink* is the VIOLET ink family (#2a1340) the admin
   pages use. Both collapse onto the same near-white in dark mode.

   The block is global (not scoped) on purpose: the product/order
   modals are `<Teleport to="body">`d out of .admin-shell, so they can
   only see custom properties declared on :root.

   The @supports guard is the same one main.css uses: on a browser
   without light-dark() the whole redefinition is dropped and the
   plain light values below stand, rather than every var resolving to
   an invalid value.
   ══════════════════════════════════════════════════════════════ */
:root {
  /* ── Surfaces ── */
  --adx-bg:          #FFF5F7;
  --adx-bg-top:      #FFE9EE;   /* .admin-shell gradient, top */
  --adx-bg-bottom:   #FFD8DF;   /* .admin-shell gradient, bottom */
  --adx-surface:     #FFFFFF;   /* cards, table fill, inputs */
  --adx-surface-2:   #FAF1F4;   /* table head, row hover, wells */
  --adx-modal:       #FFFFFF;   /* the teleported modal sheet */
  --adx-raised:      #FFFFFF;   /* a tile raised off --adx-surface-2 */

  /* Translucent veils: white over the pink gradient in light, a
     translucent violet over the violet ground in dark. */
  --adx-veil-60:     rgba(255, 255, 255, 0.6);   /* sidebar */
  --adx-veil-92:     rgba(255, 255, 255, 0.92);  /* mobile tab bar, photo chips */
  --adx-veil-90:     rgba(255, 255, 255, 0.9);   /* chips laid over a photo */
  --adx-veil-45:     rgba(255, 255, 255, 0.45);  /* sub-bars inside a well */

  /* ── Green ink (admin.css family) ── */
  --adx-ink:         #14231a;
  --adx-ink-soft:    #5a3f6a;
  --adx-muted:       rgba(20, 35, 26, 0.45);
  --adx-line:        rgba(20, 35, 26, 0.08);
  --adx-line-strong: rgba(20, 35, 26, 0.18);
  --adx-line-modal:  rgba(20, 35, 26, 0.10);
  --adx-line-field:  rgba(20, 35, 26, 0.15);
  --adx-label:       rgba(20, 35, 26, 0.65);
  --adx-icon-mute:   rgba(20, 35, 26, 0.55);
  --adx-hover-wash:  rgba(20, 35, 26, 0.05);

  /* Solid primary button. The fill is dark in light mode and must NOT
     follow --adx-ink (which flips near-white) or the label would sit
     white-on-white; it becomes a lifted violet instead. */
  --adx-btn:         #14231a;
  --adx-btn-hover:   #21382a;
  --adx-btn-ink:     #ffffff;

  /* ── Violet ink (admin-page family) ── */
  --adx-vink:        #2a1340;
  --adx-vink-70:     rgba(42, 19, 64, 0.70);
  --adx-vink-65:     rgba(42, 19, 64, 0.65);
  --adx-vink-60:     rgba(42, 19, 64, 0.60);
  --adx-vink-55:     rgba(42, 19, 64, 0.55);
  --adx-vink-50:     rgba(42, 19, 64, 0.50);
  --adx-vink-30:     rgba(42, 19, 64, 0.30);
  --adx-vink-18:     rgba(42, 19, 64, 0.18);
  --adx-vink-10:     rgba(42, 19, 64, 0.10);
  --adx-vink-08:     rgba(42, 19, 64, 0.08);
  --adx-vink-06:     rgba(42, 19, 64, 0.06);
  --adx-vink-05:     rgba(42, 19, 64, 0.05);
  --adx-vink-04:     rgba(42, 19, 64, 0.04);
  /* Same trap as --adx-btn: a solid violet fill with light text. */
  --adx-vink-fill:       #2a1340;
  --adx-vink-fill-hover: #3a1f55;
  --adx-on-vink-fill:    #ffffff;

  /* ── Accent (rose) ──
     --adx-accent is TEXT/borders on paper, so it lightens in dark.
     --adx-accent-fill is a FILL and stays saturated in both themes —
     white on #b3324c is 6.0:1 either way — which is why its label
     (--adx-on-accent) is a constant white and not --adx-btn-ink. */
  --adx-accent:      #b3324c;
  --adx-accent-2:    #b3305f;   /* payment select, orders */
  --adx-accent-fill: #b3324c;
  --adx-on-accent:   #ffffff;
  --adx-accent-40:   rgba(179, 50, 76, 0.40);
  --adx-accent-35:   rgba(179, 50, 76, 0.35);
  --adx-accent-30:   rgba(179, 50, 76, 0.30);
  --adx-accent-25:   rgba(179, 50, 76, 0.25);
  --adx-accent-10:   rgba(179, 50, 76, 0.10);
  --adx-accent-09:   rgba(179, 50, 76, 0.09);
  --adx-accent-08:   rgba(179, 50, 76, 0.08);
  --adx-accent-06:   rgba(179, 50, 76, 0.06);
  --adx-accent-05:   rgba(179, 50, 76, 0.05);
  --adx-accent-04:   rgba(179, 50, 76, 0.04);
  --adx-hotpink-40:  rgba(255, 92, 138, 0.40);
}

@supports (color: light-dark(#fff, #000)) {
  :root {
    --adx-bg:          light-dark(#FFF5F7, #1B1129);
    --adx-bg-top:      light-dark(#FFE9EE, #241934);
    --adx-bg-bottom:   light-dark(#FFD8DF, #1B1129);
    --adx-surface:     light-dark(#FFFFFF, #33244C);
    --adx-surface-2:   light-dark(#FAF1F4, #3C2B58);
    --adx-modal:       light-dark(#FFFFFF, #2B1E3F);
    --adx-raised:      light-dark(#FFFFFF, #4A3768);

    --adx-veil-60:     light-dark(rgba(255, 255, 255, 0.6),  rgba(51, 36, 76, 0.72));
    --adx-veil-92:     light-dark(rgba(255, 255, 255, 0.92), rgba(43, 30, 63, 0.94));
    --adx-veil-90:     light-dark(rgba(255, 255, 255, 0.9),  rgba(27, 17, 41, 0.86));
    --adx-veil-45:     light-dark(rgba(255, 255, 255, 0.45), rgba(27, 17, 41, 0.35));

    --adx-ink:         light-dark(#14231a, #EFE6F6);
    --adx-ink-soft:    light-dark(#5a3f6a, #C6B6D8);
    --adx-muted:       light-dark(rgba(20, 35, 26, 0.45), rgba(239, 230, 246, 0.68));
    --adx-line:        light-dark(rgba(20, 35, 26, 0.08), rgba(239, 230, 246, 0.16));
    --adx-line-strong: light-dark(rgba(20, 35, 26, 0.18), rgba(239, 230, 246, 0.32));
    --adx-line-modal:  light-dark(rgba(20, 35, 26, 0.10), rgba(239, 230, 246, 0.18));
    --adx-line-field:  light-dark(rgba(20, 35, 26, 0.15), rgba(239, 230, 246, 0.26));
    --adx-label:       light-dark(rgba(20, 35, 26, 0.65), rgba(239, 230, 246, 0.72));
    --adx-icon-mute:   light-dark(rgba(20, 35, 26, 0.55), rgba(239, 230, 246, 0.70));
    --adx-hover-wash:  light-dark(rgba(20, 35, 26, 0.05), rgba(239, 230, 246, 0.10));

    --adx-btn:         light-dark(#14231a, #573F80);
    --adx-btn-hover:   light-dark(#21382a, #674C95);
    --adx-btn-ink:     light-dark(#ffffff, #F6EFFB);

    --adx-vink:        light-dark(#2a1340, #EFE6F6);
    --adx-vink-70:     light-dark(rgba(42, 19, 64, 0.70), rgba(239, 230, 246, 0.75));
    --adx-vink-65:     light-dark(rgba(42, 19, 64, 0.65), rgba(239, 230, 246, 0.72));
    --adx-vink-60:     light-dark(rgba(42, 19, 64, 0.60), rgba(239, 230, 246, 0.70));
    --adx-vink-55:     light-dark(rgba(42, 19, 64, 0.55), rgba(239, 230, 246, 0.68));
    --adx-vink-50:     light-dark(rgba(42, 19, 64, 0.50), rgba(239, 230, 246, 0.66));
    --adx-vink-30:     light-dark(rgba(42, 19, 64, 0.30), rgba(239, 230, 246, 0.45));
    --adx-vink-18:     light-dark(rgba(42, 19, 64, 0.18), rgba(239, 230, 246, 0.30));
    --adx-vink-10:     light-dark(rgba(42, 19, 64, 0.10), rgba(239, 230, 246, 0.18));
    --adx-vink-08:     light-dark(rgba(42, 19, 64, 0.08), rgba(239, 230, 246, 0.16));
    --adx-vink-06:     light-dark(rgba(42, 19, 64, 0.06), rgba(239, 230, 246, 0.12));
    --adx-vink-05:     light-dark(rgba(42, 19, 64, 0.05), rgba(239, 230, 246, 0.10));
    --adx-vink-04:     light-dark(rgba(42, 19, 64, 0.04), rgba(239, 230, 246, 0.09));
    --adx-vink-fill:       light-dark(#2a1340, #573F80);
    --adx-vink-fill-hover: light-dark(#3a1f55, #674C95);
    --adx-on-vink-fill:    light-dark(#ffffff, #F6EFFB);

    /* #b3324c is a wine red tuned for cream; on violet it drops to
       ~2:1, so dark mode borrows --pop-pink-ink's dark value. */
    --adx-accent:      light-dark(#b3324c, #F5A3C2);
    --adx-accent-2:    light-dark(#b3305f, #F5A3C2);
    --adx-accent-fill: #b3324c;
    --adx-on-accent:   #ffffff;
    --adx-accent-40:   light-dark(rgba(179, 50, 76, 0.40), rgba(245, 163, 194, 0.45));
    --adx-accent-35:   light-dark(rgba(179, 50, 76, 0.35), rgba(245, 163, 194, 0.40));
    --adx-accent-30:   light-dark(rgba(179, 50, 76, 0.30), rgba(245, 163, 194, 0.38));
    --adx-accent-25:   light-dark(rgba(179, 50, 76, 0.25), rgba(245, 163, 194, 0.34));
    --adx-accent-10:   light-dark(rgba(179, 50, 76, 0.10), rgba(245, 163, 194, 0.16));
    --adx-accent-09:   light-dark(rgba(179, 50, 76, 0.09), rgba(245, 163, 194, 0.15));
    --adx-accent-08:   light-dark(rgba(179, 50, 76, 0.08), rgba(245, 163, 194, 0.14));
    --adx-accent-06:   light-dark(rgba(179, 50, 76, 0.06), rgba(245, 163, 194, 0.12));
    --adx-accent-05:   light-dark(rgba(179, 50, 76, 0.05), rgba(245, 163, 194, 0.11));
    --adx-accent-04:   light-dark(rgba(179, 50, 76, 0.04), rgba(245, 163, 194, 0.10));
    --adx-hotpink-40:  light-dark(rgba(255, 92, 138, 0.40), rgba(245, 163, 194, 0.45));
  }
}

/* ══════════════════════════════════════════════════════════════
   COMPAT LAYER for assets/css/admin.css
   ──────────────────────────────────────────────────────────────
   admin.css is outside this change's remit, so its hardcoded light
   values are re-pointed at the palette above from here instead. Two
   kinds of rule live below and nothing else:

     1. the --ad-* remap, which flips every admin.css rule that
        already goes through a token (cards, tables, inputs, chips…);
     2. one override per admin.css rule that hardcodes a colour and
        would otherwise stay light-only — or, worse, break: e.g.
        `.btn-primary { background: var(--ad-ink); color: #fff }`
        turns white-on-white the moment --ad-ink flips near-white.

   Every light value below is copied verbatim from admin.css, so this
   layer is inert in light mode. When admin.css is itself tokenised,
   delete this section wholesale.

   Selectors carry a `body` prefix purely to outrank admin.css's own
   (0,2,0) selectors without depending on stylesheet order.
   ══════════════════════════════════════════════════════════════ */
body .admin-shell {
  --ad-bg:            var(--adx-bg);
  --ad-surface:       var(--adx-surface);
  --ad-surface-2:     var(--adx-surface-2);
  --ad-border:        var(--adx-line);
  --ad-border-strong: var(--adx-line-strong);
  --ad-ink:           var(--adx-ink);
  --ad-ink-soft:      var(--adx-ink-soft);
  --ad-muted:         var(--adx-muted);
  --ad-accent:        var(--adx-accent);
  --ad-accent-bg:     var(--adx-accent-08);

  background: linear-gradient(180deg, var(--adx-bg-top) 0%, var(--adx-bg-bottom) 100%);
}

/* THE TRAP: --ad-ink is this button's FILL, and it now flips. */
body .admin-shell .btn-primary,
body .admin-modal .btn-primary {
  background: var(--adx-btn);
  color: var(--adx-btn-ink);
}
body .admin-shell .btn-primary:hover,
body .admin-modal .btn-primary:hover { background: var(--adx-btn-hover); }

body .admin-shell .action-btn.delete-btn:hover {
  background: var(--adx-accent-08);
  border-color: var(--adx-accent-30);
}

/* Status pills. The light halves are admin.css's own values; the dark
   halves lift each hue to a tint that clears 4.5:1 on the violet
   sheet, because these six words are the order state the shop is run
   on and they must never go dim. */
body .admin-shell .badge-pending,
body .admin-shell .badge-unpaid {
  color:        light-dark(#8a5a00, #FFC978);
  background:   light-dark(rgba(255, 200, 80, 0.18), rgba(255, 201, 120, 0.18));
  border-color: light-dark(rgba(138, 90, 0, 0.25), rgba(255, 201, 120, 0.45));
}
body .admin-shell .badge-shipped {
  color:        light-dark(#2a5fa8, #9CC4FF);
  background:   light-dark(rgba(60, 130, 220, 0.15), rgba(156, 196, 255, 0.16));
  border-color: light-dark(rgba(42, 95, 168, 0.3), rgba(156, 196, 255, 0.45));
}
body .admin-shell .badge-delivered,
body .admin-shell .badge-paid {
  color:        light-dark(#2a7a3a, #8FE0A2);
  background:   light-dark(rgba(70, 170, 90, 0.18), rgba(143, 224, 162, 0.16));
  border-color: light-dark(rgba(42, 122, 58, 0.3), rgba(143, 224, 162, 0.45));
}
body .admin-shell .badge-refunded {
  color:        light-dark(#8a2a2a, #FF9AA2);
  background:   light-dark(rgba(220, 80, 80, 0.15), rgba(255, 154, 162, 0.16));
  border-color: light-dark(rgba(138, 42, 42, 0.3), rgba(255, 154, 162, 0.45));
}
body .admin-shell .badge-cancelled {
  color:        light-dark(#5a5a6a, #C6C2D8);
  background:   light-dark(rgba(120, 120, 140, 0.15), rgba(198, 194, 216, 0.16));
  border-color: light-dark(rgba(90, 90, 106, 0.3), rgba(198, 194, 216, 0.40));
}
body .admin-shell .stock-ok {
  color:      light-dark(#2a7a3a, #8FE0A2);
  background: light-dark(rgba(70, 170, 90, 0.14), rgba(143, 224, 162, 0.16));
}
body .admin-shell .stock-low {
  color:      light-dark(#8a2a2a, #FF9AA2);
  background: light-dark(rgba(220, 80, 80, 0.14), rgba(255, 154, 162, 0.16));
}

/* The modal is teleported out of .admin-shell, so admin.css styles it
   with its own hardcoded block — every line of which is repeated here
   against the palette. */
body .admin-modal {
  background:   var(--adx-modal);
  border-color: var(--adx-line-modal);
  color:        var(--adx-ink);
}
body .admin-modal .modal-header {
  background:          var(--adx-modal);
  border-bottom-color: var(--adx-line);
}
body .admin-modal .modal-title { color: var(--adx-ink); }
body .admin-modal .modal-close { color: var(--adx-icon-mute); }
body .admin-modal .modal-close:hover {
  background: var(--adx-hover-wash);
  color: var(--adx-ink);
}
body .admin-modal .modal-footer { border-top-color: var(--adx-line); }
body .admin-modal .form-label { color: var(--adx-label); }
body .admin-modal .form-input,
body .admin-modal .form-textarea {
  background:   var(--adx-surface);
  border-color: var(--adx-line-field);
  color:        var(--adx-ink);
}
body .admin-modal .form-input:focus,
body .admin-modal .form-textarea:focus { border-color: var(--adx-accent); }
body .admin-modal .btn-ghost {
  color: var(--adx-ink);
  border-color: var(--adx-line-strong);
}
body .admin-modal .btn-ghost:hover { background: var(--adx-surface-2); }

@media (max-width: 640px) {
  /* admin.css pins the sticky footer to #fff so the buttons don't show
     the scrolling body through them. */
  body .admin-modal .modal-footer { background: var(--adx-modal); }
}
</style>
