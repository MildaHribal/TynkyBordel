<script setup lang="ts">


definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: customers, pending } = await useFetch<any[]>('/api/admin/customers')

const searchQuery = ref('')

const filteredCustomers = computed(() => {
  if (!customers.value) return []
  if (!searchQuery.value) return customers.value
  const q = searchQuery.value.toLowerCase()
  return customers.value.filter(
    (c: any) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
  )
})

const totalRevenue = computed(() =>
  customers.value?.reduce((sum: number, c: any) => sum + c.totalSpent, 0) ?? 0,
)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Zákazníci</h1>
        <p class="page-subtitle">Kdo nakupuje shopik</p>
      </div>
    </div>

    <div class="stats-grid" v-if="!pending && customers" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-bottom: 1.5rem;">
      <div class="stat-card">
        <div class="stat-icon-wrap"><Icon icon="lucide:users" height="18" /></div>
        <div class="stat-info">
          <span class="stat-value">{{ customers.length }}</span>
          <span class="stat-label">Celkem zákazníků</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap"><Icon icon="lucide:banknote" height="18" /></div>
        <div class="stat-info">
          <span class="stat-value">{{ totalRevenue.toLocaleString('cs-CZ') }} Kč</span>
          <span class="stat-label">Celková útrata</span>
        </div>
      </div>
    </div>

    <div class="filters-row">
      <div class="search-box">
        <Icon icon="lucide:search" height="16" class="search-icon" />
        <input v-model="searchQuery" type="text" placeholder="Jméno nebo email…" class="search-input" />
      </div>
    </div>

    <div v-if="pending" class="loading">
      <Icon icon="lucide:loader-2" height="20" class="spin" /> Načítání…
    </div>

    <div v-else class="admin-card">
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Zákazník</th>
              <th>Email</th>
              <th>Objednávky</th>
              <th>Útrata</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in filteredCustomers" :key="c.email">
              <td class="cell-primary">
                <div class="customer-cell" style="flex-direction: row; align-items: center; gap: 0.6rem;">
                  <div class="customer-avatar">{{ c.name.charAt(0).toUpperCase() }}</div>
                  <span class="customer-name">{{ c.name }}</span>
                </div>
              </td>
              <td class="mono" data-label="Email">{{ c.email }}</td>
              <td data-label="Objednávky">{{ c.orders }}</td>
              <td class="price" data-label="Útrata">{{ c.totalSpent.toLocaleString('cs-CZ') }} Kč</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
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
</style>
