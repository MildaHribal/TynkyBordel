<script setup lang="ts">


definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: stats, pending } = await useFetch('/api/admin/stats')

// Traffic is counted on the server (server/utils/analytics.ts), not by PostHog,
// because posthog-js only loads after the visitor accepts analytics cookies and
// would therefore report a fraction of the real number.
type Traffic = {
  series: Array<{ day: string; views: number; visitors: number }>
  topPages: Array<{ path: string; views: number }>
  totals: Record<'today' | 'last7' | 'last30', { views: number; visitors: number }>
}
const { data: traffic } = await useLazyFetch<Traffic>('/api/admin/traffic')

// Bars are scaled against the busiest day in the window, so a quiet shop still
// shows shape instead of fourteen invisible slivers.
const peak = computed(() => Math.max(1, ...(traffic.value?.series ?? []).map((d) => d.visitors)))

// The API only returns days that saw traffic; fill the gaps so the chart reads
// as a calendar rather than a list of busy days squashed together.
const last14 = computed(() => {
  const bySeries = new Map((traffic.value?.series ?? []).map((d) => [d.day, d]))
  const out: Array<{ day: string; views: number; visitors: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
    out.push(bySeries.get(key) ?? { day: key, views: 0, visitors: 0 })
  }
  return out
})

const dayLabel = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })

const pageLabel = (path: string) => (path === '/' ? 'Hlavní stránka' : path)

const statCards = computed(() => {
  if (!stats.value) return []
  return [
    { label: 'Příjem',        value: `${(stats.value.totalRevenue ?? 0).toLocaleString('cs-CZ')} Kč`, icon: 'lucide:banknote' },
    { label: 'Objednávky',    value: stats.value.totalOrders ?? 0, icon: 'lucide:shopping-bag' },
    { label: 'Produkty',      value: stats.value.totalProducts ?? 0, icon: 'lucide:package' },
    { label: 'Zákazníci',     value: stats.value.totalCustomers ?? 0, icon: 'lucide:users' },
    { label: 'Čekající',      value: stats.value.pendingOrders ?? 0, icon: 'lucide:clock' },
    { label: 'Nízké zásoby',  value: stats.value.lowStockProducts ?? 0, icon: 'lucide:alert-triangle' },
  ]
})

const STATUS_LABEL: Record<string, string> = {
  pending: 'Čekající',
  shipped: 'Odesláno',
  delivered: 'Doručeno',
  cancelled: 'Zrušeno',
}
const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Přehled</h1>
        <p class="page-subtitle">Co se v shopiku právě děje</p>
      </div>
    </div>

    <div v-if="pending" class="loading">
      <Icon name="lucide:loader-2" height="24" class="spin" /> Načítání…
    </div>

    <template v-else-if="stats">
      <div class="stats-grid">
        <div v-for="card in statCards" :key="card.label" class="stat-card">
          <div class="stat-icon-wrap">
            <Icon :name="card.icon" height="18" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ card.value }}</span>
            <span class="stat-label">{{ card.label }}</span>
          </div>
        </div>
      </div>

      <div class="admin-card section-block">
        <div class="card-header">
          <h2 class="card-title">Návštěvnost</h2>
          <span class="card-note">bez cookies · počítáno na serveru</span>
        </div>

        <div v-if="!traffic" class="traffic-empty">Načítám…</div>
        <template v-else>
          <div class="traffic-totals">
            <div class="traffic-total">
              <span class="traffic-num">{{ traffic.totals.today.visitors }}</span>
              <span class="traffic-cap">návštěvníků dnes</span>
              <span class="traffic-sub">{{ traffic.totals.today.views }} zobrazení</span>
            </div>
            <div class="traffic-total">
              <span class="traffic-num">{{ traffic.totals.last7.visitors }}</span>
              <span class="traffic-cap">za 7 dní</span>
              <span class="traffic-sub">{{ traffic.totals.last7.views }} zobrazení</span>
            </div>
            <div class="traffic-total">
              <span class="traffic-num">{{ traffic.totals.last30.visitors }}</span>
              <span class="traffic-cap">za 30 dní</span>
              <span class="traffic-sub">{{ traffic.totals.last30.views }} zobrazení</span>
            </div>
          </div>

          <div class="traffic-chart">
            <div
              v-for="d in last14"
              :key="d.day"
              class="traffic-bar-wrap"
              :title="`${dayLabel(d.day)}: ${d.visitors} návštěvníků, ${d.views} zobrazení`"
            >
              <div class="traffic-bar" :style="{ height: Math.round((d.visitors / peak) * 100) + '%' }"></div>
              <span class="traffic-bar-label">{{ dayLabel(d.day) }}</span>
            </div>
          </div>

          <div v-if="traffic.topPages.length" class="traffic-pages">
            <h3 class="traffic-pages-title">Nejnavštěvovanější stránky</h3>
            <div v-for="p in traffic.topPages" :key="p.path" class="traffic-page">
              <span class="traffic-page-path">{{ pageLabel(p.path) }}</span>
              <span class="traffic-page-views">{{ p.views }}</span>
            </div>
          </div>
          <p v-else class="traffic-empty">
            Zatím žádná data — první návštěvy se objeví do půl minuty po jejich příchodu.
          </p>
        </template>
      </div>

      <div class="admin-card section-block">
        <div class="card-header">
          <h2 class="card-title">Poslední objednávky</h2>
          <NuxtLink to="/admin/orders" class="card-link">
            Vše <Icon name="lucide:arrow-right" height="14" />
          </NuxtLink>
        </div>
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Zákazník</th>
                <th>Položek</th>
                <th>Celkem</th>
                <th>Stav</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in stats.recentOrders" :key="o.id">
                <td class="mono cell-primary">#{{ o.orderNumber || o.id }}</td>
                <td data-label="Zákazník">
                  <div class="customer-cell">
                    <span class="customer-name">{{ o.customerName }}</span>
                    <span class="customer-email">{{ o.customerEmail }}</span>
                  </div>
                </td>
                <td data-label="Položek">{{ o.items?.length ?? 0 }}</td>
                <td class="price" data-label="Celkem">{{ o.totalPrice.toLocaleString('cs-CZ') }} Kč</td>
                <td data-label="Stav">
                  <span :class="['badge', STATUS_CLASS[o.status] || 'badge-pending']">
                    {{ STATUS_LABEL[o.status] || o.status }}
                  </span>
                </td>
                <td class="mono" data-label="Datum">{{ o.createdAt ? new Date(o.createdAt).toLocaleDateString('cs-CZ') : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-card section-block" v-if="stats.categoryCounts">
        <div class="card-header">
          <h2 class="card-title">Kategorie produktů</h2>
        </div>
        <div class="categories-block">
          <div
            v-for="(count, category) in stats.categoryCounts"
            :key="String(category)"
            class="category-chip"
          >
            <span>{{ category }}</span>
            <span class="count">{{ count }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Traffic panel ─────────────────────────────────────────────── */
.card-note {
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--adx-vink-50);
}

.traffic-totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  padding: 0 0 1rem;
}
.traffic-total { display: flex; flex-direction: column; gap: 0.1rem; }
.traffic-num {
  font-family: var(--font-gloock), Georgia, serif;
  font-size: 1.7rem;
  line-height: 1.05;
  color: var(--adx-vink);
}
.traffic-cap { font-size: 0.78rem; color: var(--adx-vink-65); }
.traffic-sub { font-size: 0.7rem; color: var(--adx-vink-50); }

.traffic-chart {
  display: flex;
  align-items: flex-end;
  gap: 0.3rem;
  height: 110px;
  padding-bottom: 1.15rem;
  position: relative;
}
.traffic-bar-wrap {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  position: relative;
  cursor: default;
}
.traffic-bar {
  width: 100%;
  min-height: 3px;
  border-radius: 4px 4px 0 0;
  background: var(--adx-accent-fill);
  opacity: 0.85;
  transition: opacity 0.15s ease;
}
.traffic-bar-wrap:hover .traffic-bar { opacity: 1; }
.traffic-bar-label {
  position: absolute;
  bottom: -1.05rem;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.6rem;
  color: var(--adx-vink-50);
  white-space: nowrap;
}

.traffic-pages { padding-top: 0.5rem; border-top: 1px solid var(--adx-vink-08); }
.traffic-pages-title {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--adx-vink-55);
  font-weight: 700;
}
.traffic-page {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0;
  font-size: 0.83rem;
  color: var(--adx-vink);
  border-bottom: 1px solid var(--adx-vink-04);
}
.traffic-page:last-child { border-bottom: 0; }
.traffic-page-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.78rem;
}
.traffic-page-views { font-weight: 700; flex-shrink: 0; }

.traffic-empty {
  padding: 0.5rem 0 1rem;
  font-size: 0.83rem;
  color: var(--adx-vink-55);
}

@media (max-width: 640px) {
  .traffic-totals { grid-template-columns: 1fr 1fr; }
  .traffic-chart { height: 84px; }
  .traffic-bar-label { display: none; }
}

.loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--adx-vink-50);
  font-style: italic;
  font-family: var(--font-body);
  padding: 2rem 0;
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.section-block { margin-top: 1.5rem; }
.categories-block {
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
</style>
