<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: stats, pending } = await useFetch('/api/admin/stats')

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
      <Icon icon="lucide:loader-2" height="24" class="spin" /> Načítání…
    </div>

    <template v-else-if="stats">
      <div class="stats-grid">
        <div v-for="card in statCards" :key="card.label" class="stat-card">
          <div class="stat-icon-wrap">
            <Icon :icon="card.icon" height="18" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ card.value }}</span>
            <span class="stat-label">{{ card.label }}</span>
          </div>
        </div>
      </div>

      <div class="admin-card section-block">
        <div class="card-header">
          <h2 class="card-title">Poslední objednávky</h2>
          <NuxtLink to="/admin/orders" class="card-link">
            Vše <Icon icon="lucide:arrow-right" height="14" />
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
.loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(42, 19, 64, 0.5);
  font-style: italic;
  font-family: 'Petrona', Georgia, serif;
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
