<script setup lang="ts">
import { Icon } from '@iconify/vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: orders, pending, refresh } = await useFetch<any[]>('/api/admin/orders')
const toast = useCosmicToast()

const searchQuery = ref('')
const statusFilter = ref('')

const STATUSES = [
  { value: 'pending',   label: 'Čekající',  cls: 'badge-pending' },
  { value: 'shipped',   label: 'Odesláno',  cls: 'badge-shipped' },
  { value: 'delivered', label: 'Doručeno',  cls: 'badge-delivered' },
  { value: 'cancelled', label: 'Stornováno', cls: 'badge-cancelled' },
] as const

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Nezaplaceno',
  paid: 'Zaplaceno',
  refunded: 'Vráceno',
}
const PAYMENTS = [
  { value: 'unpaid',   label: 'Nezaplaceno' },
  { value: 'paid',     label: 'Zaplaceno' },
  { value: 'refunded', label: 'Vráceno' },
] as const
const PAYMENT_CLASS: Record<string, string> = {
  unpaid: 'badge-unpaid',
  paid: 'badge-paid',
  refunded: 'badge-refunded',
}

const statusMeta = (v: string) => STATUSES.find((s) => s.value === v) ?? { label: v, cls: 'badge-pending' }

const filteredOrders = computed(() => {
  if (!orders.value) return []
  let r = orders.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    r = r.filter((o: any) =>
      o.customerName.toLowerCase().includes(q) ||
      o.customerEmail.toLowerCase().includes(q) ||
      String(o.id).includes(q),
    )
  }
  if (statusFilter.value) r = r.filter((o: any) => o.status === statusFilter.value)
  return r
})

const updatingId = ref<number | null>(null)
async function changeStatus(orderId: number, newStatus: string) {
  updatingId.value = orderId
  try {
    await $fetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      body: { status: newStatus },
    })
    await refresh()
    if (newStatus === 'shipped' || newStatus === 'delivered') {
      toast.success('Aktualizováno', `Status změněn, email zákazníkovi odeslán.`)
    } else if (newStatus === 'cancelled') {
      toast.success('Stornováno', 'Kusy z objednávky se vrátily zpět na sklad.')
    } else {
      toast.success('Aktualizováno', 'Status objednávky změněn.')
    }
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Nepodařilo se uložit.')
  } finally {
    updatingId.value = null
  }
}

async function changePayment(orderId: number, newPayment: string) {
  updatingId.value = orderId
  try {
    await $fetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      body: { paymentStatus: newPayment },
    })
    await refresh()
    if (newPayment === 'paid') {
      toast.success('Zaplaceno', 'Platba označena, potvrzovací email zákazníkovi odeslán.')
    } else {
      toast.success('Aktualizováno', 'Stav platby změněn.')
    }
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Nepodařilo se uložit.')
  } finally {
    updatingId.value = null
  }
}

const selectedOrder = ref<any>(null)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Objednávky</h1>
        <p class="page-subtitle">Aktualizace statusu rozešle zákazníkovi email</p>
      </div>
    </div>

    <div class="filters-row">
      <div class="search-box">
        <Icon icon="lucide:search" height="16" class="search-icon" />
        <input v-model="searchQuery" type="text" placeholder="Jméno, email, ID…" class="search-input" />
      </div>
      <select v-model="statusFilter" class="filter-select">
        <option value="">Všechny stavy</option>
        <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>

    <p class="results-count" v-if="!pending">{{ filteredOrders.length }} objednávek</p>

    <div v-if="pending" class="loading">
      <Icon icon="lucide:loader-2" height="20" class="spin" /> Načítání…
    </div>

    <div v-else class="admin-card">
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Zákazník</th>
              <th>Položky</th>
              <th>Celkem</th>
              <th>Platba</th>
              <th>Stav</th>
              <th>Datum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filteredOrders" :key="o.id">
              <td class="mono cell-primary">#{{ o.orderNumber || o.id }}</td>
              <td data-label="Zákazník">
                <div class="customer-cell">
                  <span class="customer-name">{{ o.customerName }}</span>
                  <span class="customer-email">{{ o.customerEmail }}</span>
                </div>
              </td>
              <td data-label="Položky">
                <span v-for="(item, i) in (o.items || []).slice(0, 2)" :key="i" class="item-tag">
                  {{ item.title }} × {{ item.quantity }}
                </span>
                <span v-if="(o.items?.length || 0) > 2" class="item-more">+{{ o.items.length - 2 }}</span>
              </td>
              <td class="price" data-label="Celkem">{{ o.totalPrice.toLocaleString('cs-CZ') }} Kč</td>
              <td data-label="Platba">
                <span :class="['badge', PAYMENT_CLASS[o.paymentStatus] || 'badge-unpaid']">
                  {{ PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus }}
                </span>
              </td>
              <td data-label="Stav">
                <span :class="['badge', statusMeta(o.status).cls]">
                  {{ statusMeta(o.status).label }}
                </span>
              </td>
              <td class="mono" data-label="Datum">{{ new Date(o.createdAt).toLocaleDateString('cs-CZ') }}</td>
              <td class="cell-actions">
                <div class="actions-cell">
                  <button class="action-btn" @click="selectedOrder = o" title="Detail">
                    <Icon icon="lucide:eye" height="14" />
                  </button>
                  <select
                    :value="o.paymentStatus"
                    @change="changePayment(o.id, ($event.target as HTMLSelectElement).value)"
                    class="status-select payment-select"
                    :disabled="updatingId === o.id"
                    title="Stav platby"
                  >
                    <option v-for="p in PAYMENTS" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                  <select
                    :value="o.status"
                    @change="changeStatus(o.id, ($event.target as HTMLSelectElement).value)"
                    class="status-select"
                    :disabled="updatingId === o.id"
                    title="Stav objednávky"
                  >
                    <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="selectedOrder" class="admin-modal-overlay" @click.self="selectedOrder = null">
          <div class="admin-modal modal-lg">
            <div class="modal-header">
              <h3 class="modal-title">Objednávka #{{ selectedOrder.orderNumber || selectedOrder.id }}</h3>
              <button @click="selectedOrder = null" class="modal-close" aria-label="Zavřít">
                <Icon icon="lucide:x" height="18" />
              </button>
            </div>
            <div class="modal-body">
              <div class="detail-grid">
                <div>
                  <div class="detail-label">Zákazník</div>
                  <div class="detail-value">{{ selectedOrder.customerName }}</div>
                  <div class="detail-sub">{{ selectedOrder.customerEmail }}</div>
                </div>
                <div>
                  <div class="detail-label">Adresa</div>
                  <div class="detail-value">{{ selectedOrder.shippingAddress }}</div>
                </div>
                <div>
                  <div class="detail-label">Stav</div>
                  <span :class="['badge', statusMeta(selectedOrder.status).cls]">
                    {{ statusMeta(selectedOrder.status).label }}
                  </span>
                </div>
                <div>
                  <div class="detail-label">Platba</div>
                  <span :class="['badge', PAYMENT_CLASS[selectedOrder.paymentStatus] || 'badge-unpaid']">
                    {{ PAYMENT_LABELS[selectedOrder.paymentStatus] || selectedOrder.paymentStatus }}
                  </span>
                </div>
              </div>

              <div class="detail-section">
                <div class="detail-label">Položky</div>
                <div class="items-list">
                  <div v-for="item in selectedOrder.items" :key="item.id" class="line-item">
                    <div class="line-thumb">
                      <img v-if="item.image" :src="item.image.startsWith('http') || item.image.startsWith('/') ? item.image : `/${item.image}`" :alt="item.title" />
                    </div>
                    <div class="line-info">
                      <div class="line-name">{{ item.title }}</div>
                      <div class="line-qty">× {{ item.quantity }}</div>
                    </div>
                    <div class="line-price">{{ (item.price * item.quantity).toLocaleString('cs-CZ') }} Kč</div>
                  </div>
                </div>
              </div>

              <div class="total-row">
                <span>Celkem</span>
                <span class="total-amount">{{ selectedOrder.totalPrice.toLocaleString('cs-CZ') }} Kč</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

/* Payment dropdown sits next to the status dropdown; tint it pink so the two
   controls read as distinct at a glance. */
.actions-cell :deep(.payment-select),
.actions-cell .payment-select {
  border-color: rgba(255, 92, 138, 0.4);
  color: #b3305f;
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal-only styles (shell tokens applied via global admin classes) */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}
.detail-label {
  font-size: 0.66rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(42, 19, 64, 0.55);
  margin-bottom: 0.3rem;
  font-weight: 600;
}
.detail-value { font-size: 0.95rem; color: #2a1340; line-height: 1.35; }
.detail-sub { font-size: 0.82rem; color: rgba(42, 19, 64, 0.55); margin-top: 0.15rem; }

.detail-section { margin-top: 1.25rem; }
.items-list { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
.line-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.7rem;
  background: rgba(42, 19, 64, 0.04);
  border-radius: 9px;
  border: 1px solid rgba(42, 19, 64, 0.06);
}
.line-thumb {
  width: 36px;
  height: 36px;
  background: rgba(42, 19, 64, 0.04);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.line-thumb img { width: 100%; height: 100%; object-fit: cover; }
.line-info { flex: 1; }
.line-name { font-size: 0.9rem; font-weight: 600; }
.line-qty { font-size: 0.78rem; color: rgba(42, 19, 64, 0.55); }
.line-price { font-family: 'Gloock', Georgia, serif; font-size: 0.95rem; }

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1rem;
  border-top: 1px solid rgba(42, 19, 64, 0.08);
  margin-top: 1rem;
  font-size: 0.9rem;
  color: rgba(42, 19, 64, 0.7);
  font-weight: 600;
}
.total-amount {
  font-family: 'Gloock', Georgia, serif;
  font-size: 1.4rem;
  color: #2a1340;
}
</style>
