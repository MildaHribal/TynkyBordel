<script setup lang="ts">

import { ref, onMounted, onUnmounted } from 'vue'

const route = useRoute()

const navItems = [
  { label: 'Přehled',    icon: 'lucide:layout-dashboard', to: '/admin' },
  { label: 'Produkty',   icon: 'lucide:package',          to: '/admin/products' },
  { label: 'Objednávky', icon: 'lucide:shopping-bag',     to: '/admin/orders' },
  { label: 'Zákazníci',  icon: 'lucide:users',            to: '/admin/customers' },
  { label: 'E-maily',    icon: 'lucide:mail',             to: '/admin/emails' },
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

  // Register the service worker (scoped to /admin/).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/admin-sw.js', { scope: '/admin/' })
      .catch((err) => console.warn('[pwa] SW register failed', err))
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
  background: rgba(255, 255, 255, 0.6);
  border-right: 1px solid rgba(42, 19, 64, 0.08);
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
  color: #2a1340;
  border-bottom: 1px solid rgba(42, 19, 64, 0.08);
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
  color: rgba(42, 19, 64, 0.7);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.18s ease;
}
.sidebar-link:hover {
  color: #2a1340;
  background: rgba(42, 19, 64, 0.05);
}
.sidebar-link.active {
  color: #2a1340;
  background: rgba(179, 50, 76, 0.1);
  font-weight: 600;
}

.install-btn {
  margin-top: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: #2a1340;
  color: #fff;
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
.install-btn:hover { background: #3a1f55; }

.sidebar-back {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  color: rgba(42, 19, 64, 0.5);
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  border-top: 1px solid rgba(42, 19, 64, 0.08);
  padding-top: 1rem;
  margin-top: 0.75rem;
  transition: color 0.18s ease;
}
.sidebar-back:hover { color: #2a1340; }

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
    border-bottom: 1px solid rgba(42, 19, 64, 0.08);
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
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(16px);
    border-top: 1px solid rgba(42, 19, 64, 0.1);
    padding: 0.4rem 0.35rem calc(0.4rem + env(safe-area-inset-bottom));
    box-shadow: 0 -4px 20px rgba(42, 19, 64, 0.06);
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
    color: rgba(42, 19, 64, 0.5);
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
    color: var(--ad-accent, #b3324c);
    background: rgba(179, 50, 76, 0.09);
  }
  .tabbar-link:active { background: rgba(42, 19, 64, 0.06); }
}
</style>

<!-- Admin-only global CSS — loaded only when the admin layout renders,
     keeping it out of the storefront's render-blocking bundle. -->
<style src="~~/assets/css/admin.css"></style>
