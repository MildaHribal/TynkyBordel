<script setup lang="ts">

import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~~/app/composables/useAuth'
// Imported explicitly because the order items render it through `<component :is>`.
// Nuxt auto-imports components by rewriting the *static* `resolveComponent("X")`
// call the template compiler emits; a dynamic `:is="'NuxtLink'"` compiles to
// `resolveDynamicComponent("NuxtLink")` instead, which Nuxt does not rewrite and
// Vue cannot resolve (NuxtLink is not globally registered) — it silently fell
// back to rendering a literal, unclickable <NuxtLink> element.
import { NuxtLink } from '#components'

definePageMeta({
  middleware: ['auth']
})

useSeoMeta({
  title: 'Můj profil',
  robots: 'noindex,nofollow',
})

const { currentUser, signOut } = useAuth()
const router = useRouter()

const activeTab = ref('profile')

// Fetch User Data
const toast = useCosmicToast()

// Změněno na useLazyAsyncData BEZ "await". Komponenta se hned vykreslí a placeholders poběží, dokud nepřijedou data.
const { data: asyncProfile, refresh: refreshProfile, pending: profilePending } = useLazyAsyncData(
  'user-profile-data', 
  () => $fetch<any>('/api/user/profile'),
  { default: () => null }
)
const profile = computed(() => asyncProfile.value || null)

// Zbytek "Lazy" - načtení proběhne asynchronně a neblokuje první vykreslení
const { data: orders, pending: ordersPending, refresh: refreshOrders } = useLazyFetch<any[]>('/api/user/orders')
const { data: favorites, pending: favoritesPending } = useLazyFetch('/api/user/favorites')
const { data: reviews, pending: reviewsPending, refresh: refreshReviews } = useLazyFetch<any[]>('/api/user/reviews')

// Profile Form
const isSaving = ref(false)
const formData = ref({
  name: profile.value?.name || '',
  phone: profile.value?.phone || '',
  street: profile.value?.street || '',
  city: profile.value?.city || '',
  zip: profile.value?.zip || '',
})

watch(profile, (value) => {
  if (!value) return
  formData.value = {
    name: value.name || '',
    phone: value.phone || '',
    street: value.street || '',
    city: value.city || '',
    zip: value.zip || '',
  }
}, { immediate: true })

async function saveProfile() {
  isSaving.value = true
  try {
    await $fetch('/api/user/profile', {
      method: 'PATCH',
      body: formData.value
    })
    await refreshProfile()
    toast.success('Uloženo', 'Údaje byly úspěšně uloženy.')
  } catch (err: any) {
    toast.error('Uložení se nezdařilo', err?.data?.statusMessage || err?.message || 'Zkuste to prosím znovu.')
  } finally {
    isSaving.value = false
  }
}

async function handleSignOut() {
  await signOut()
  toast.success('Odhlášení', 'Úspěšně jste se odhlásili. Mír a lásku! ✌️')
  router.push('/user/login')
}

// Order Status Helper
const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: 'Čekající',
    paid: 'Zaplaceno',
    shipped: 'Odesláno',
    delivered: 'Doručeno',
    cancelled: 'Zrušeno'
  }
  return map[status] || status
}
const statusClass = (status: string) => {
  const map: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    paid: 'bg-blue-500/20 text-blue-400',
    shipped: 'bg-sky-500/20 text-sky-300',
    delivered: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400'
  }
  return map[status] || 'bg-white/10 text-white/70'
}

// Order detail is collapsed by default; clicking a card expands it.
const expandedOrder = ref<number | null>(null)
const toggleOrder = (id: number) => {
  expandedOrder.value = expandedOrder.value === id ? null : id
}

// Cancelling is offered only while the API would allow it (order.canCancel —
// pending + unpaid, see server/utils/orders.ts). Irreversible for the customer,
// hence the spelled-out confirm.
const cancellingId = ref<number | null>(null)
async function cancelOrder(order: any) {
  if (!confirm(
    `Opravdu zrušit objednávku #${order.orderNumber || order.id}?\n\n` +
    'Kousky se hned vrátí do prodeje a může je koupit někdo jiný. Tohle nejde vzít zpět.',
  )) return

  cancellingId.value = order.id
  try {
    await $fetch(`/api/user/orders/${order.id}/cancel`, { method: 'POST' })
    await refreshOrders()
    toast.success('Zrušeno', `Objednávka #${order.orderNumber || order.id} byla zrušena.`)
  } catch (err: any) {
    toast.error('Nepodařilo se zrušit', err?.data?.statusMessage || 'Zkus to prosím znovu.')
  } finally {
    cancellingId.value = null
  }
}

const paymentLabel = (m?: string | null) => {
  const map: Record<string, string> = {
    cash: 'Dobírka',
    'bank-transfer': 'Převodem na účet',
    card: 'Kartou přes PayPal',
    paypal: 'PayPal',
  }
  return (m && (map[m] || m)) || '—'
}
const paymentStatusLabel = (s?: string | null) => {
  const map: Record<string, string> = {
    unpaid: 'Nezaplaceno',
    paid: 'Zaplaceno',
    refunded: 'Vráceno',
  }
  return (s && (map[s] || s)) || '—'
}
const shippingLabel = (m?: string | null) => {
  const map: Record<string, string> = {
    'packeta-zbox': 'Zásilkovna — Z-BOX',
    packeta: 'Zásilkovna',
    balikovna: 'Balíkovna (Česká pošta)',
    personal: 'Osobní odběr',
  }
  return (m && (map[m] || m)) || '—'
}
// ── Recenze psané u zakoupené položky ───────────────────────────────────────
// This is the ONLY place a review can be written. The shop sells one-off
// originals, so a review form on the product page was unusable: by the time
// anyone had an opinion, the piece was sold and the page gone. The API keys each
// review on the order line (`orderItemId`), which is what proves the purchase
// and limits it to one review per bought item — `item.canReview` and
// `item.review` come straight from that same rule, so the form is only offered
// where POST /api/user/reviews would actually accept it.
const reviewFormFor = ref<number | null>(null)
const reviewRating = ref(5)
const reviewComment = ref('')
const isSubmittingReview = ref(false)

const openReviewForm = (item: any) => {
  reviewFormFor.value = item.id
  reviewRating.value = 5
  reviewComment.value = ''
}
const closeReviewForm = () => {
  reviewFormFor.value = null
  reviewComment.value = ''
}

async function submitReview(item: any) {
  if (isSubmittingReview.value) return
  if (reviewComment.value.trim().length < 3) {
    toast.info('Ještě chybí text', 'Napiš prosím pár slov o produktu.')
    return
  }
  isSubmittingReview.value = true
  try {
    await $fetch('/api/user/reviews', {
      method: 'POST',
      body: {
        orderItemId: item.id,
        rating: reviewRating.value,
        comment: reviewComment.value.trim(),
      },
    })
    closeReviewForm()
    // Both lists change: the order line now carries a review, and "Moje recenze"
    // has one more row.
    await Promise.all([refreshOrders(), refreshReviews()])
    toast.success('Díky!', 'Recenze je venku — najdeš ji dole na hlavní stránce.')
  } catch (err: any) {
    toast.error('Recenzi se nepodařilo uložit', err?.data?.statusMessage || err?.message || 'Zkuste to prosím znovu.')
  } finally {
    isSubmittingReview.value = false
  }
}

// The API only fills `productUrl` when the product still exists AND is in stock,
// i.e. when /product/<slug> would actually render. Everything else (sold one-off
// originals, deleted products) stays plain text — clicking through to a 404 from
// your own order history is worse than not linking at all.
const itemLink = (item: any): string | null => item?.productUrl || null
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 md:py-14">
    <header class="profile-head">
      <span class="zine-eyebrow">✶ Uživatelský profil</span>
      <h1 class="zine-section-title">Můj bordel</h1>
      <p class="profile-sub">Tvoje objednávky, adresa a oblíbené kousky na jednom místě.</p>
    </header>
    <div class="flex flex-col md:flex-row gap-8">

      <!-- Sidebar -->
      <div class="w-full md:w-64 flex-shrink-0">
        <div class="glass-card-strong p-6 text-center mb-6">
          <div class="w-20 h-20 rounded-full mx-auto mb-4 bg-gradient-to-tr from-primary-500 to-secondary-500 flex items-center justify-center text-2xl font-black text-white shadow-lg">
            {{ currentUser?.name?.charAt(0) || '?' }}
          </div>
          <h2 class="text-xl font-bold text-white leading-tight">{{ currentUser?.name }}</h2>
          <p class="text-sm text-white/50 break-all">{{ currentUser?.email }}</p>
        </div>

        <nav class="glass-card-strong p-2 flex flex-row flex-wrap md:flex-col gap-2 justify-center md:justify-start">
          <button @click="activeTab = 'profile'" :class="['flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap flex-grow md:flex-grow-0', activeTab === 'profile' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white']">
            <Icon name="mdi:account-outline" height="20" /> <span class="hidden sm:inline">Osobní údaje</span><span class="sm:hidden">Profil</span>
          </button>
          <button @click="activeTab = 'orders'" :class="['flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap flex-grow md:flex-grow-0', activeTab === 'orders' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white']">
            <Icon name="mdi:shopping-outline" height="20" /> <span class="hidden sm:inline">Moje objednávky</span><span class="sm:hidden">Objednávky</span>
          </button>
          <button @click="activeTab = 'favorites'" :class="['flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap flex-grow md:flex-grow-0', activeTab === 'favorites' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white']">
            <Icon name="mdi:heart-outline" height="20" /> <span class="hidden sm:inline">Oblíbené</span><span class="sm:hidden">Oblíbené</span>
          </button>
          <button @click="activeTab = 'reviews'" :class="['flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap flex-grow md:flex-grow-0', activeTab === 'reviews' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white']">
            <Icon name="mdi:star-outline" height="20" /> <span class="hidden sm:inline">Moje recenze</span><span class="sm:hidden">Recenze</span>
          </button>
          <div class="w-full h-px bg-white/10 my-1 md:block hidden"></div>
          <button @click="handleSignOut" class="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors text-left whitespace-nowrap flex-grow md:flex-grow-0 w-full md:w-auto justify-center md:justify-start mt-2 md:mt-0 border md:border-none border-red-500/20">
            <Icon name="mdi:logout" height="20" /> Odhlásit se
          </button>
        </nav>
      </div>

      <!-- Main Content -->
      <div class="flex-grow min-w-0">

        <!-- ── PROFILE ── -->
        <div v-if="activeTab === 'profile'" class="glass-card-strong p-6 md:p-8 animate-fade-in min-h-[500px]">
          <h2 class="text-2xl font-bold text-white mb-6 pb-4 border-b border-white/10">Osobní údaje</h2>
          
          <div v-if="profilePending" class="space-y-6 max-w-2xl animate-pulse">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <div class="h-4 w-20 bg-white/10 rounded"></div>
                <div class="h-12 w-full bg-white/5 rounded-xl border border-white/5"></div>
              </div>
              <div class="space-y-2">
                <div class="h-4 w-20 bg-white/10 rounded"></div>
                <div class="h-12 w-full bg-white/5 rounded-xl border border-white/5"></div>
              </div>
            </div>
            
            <div class="h-6 w-40 bg-white/10 rounded mt-8 mb-4"></div>
            
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="h-4 w-32 bg-white/10 rounded"></div>
                <div class="h-12 w-full bg-white/5 rounded-xl border border-white/5"></div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <div class="h-4 w-20 bg-white/10 rounded"></div>
                  <div class="h-12 w-full bg-white/5 rounded-xl border border-white/5"></div>
                </div>
                <div class="space-y-2">
                  <div class="h-4 w-16 bg-white/10 rounded"></div>
                  <div class="h-12 w-full bg-white/5 rounded-xl border border-white/5"></div>
                </div>
              </div>
            </div>
          </div>

          <form v-else @submit.prevent="saveProfile" class="space-y-6 max-w-2xl">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm text-white/50 mb-2">Celé jméno</label>
                <input v-model="formData.name" type="text" class="input-cosmic" required>
              </div>
              <div>
                <label class="block text-sm text-white/50 mb-2">Telefon</label>
                <input v-model="formData.phone" type="tel" class="input-cosmic">
              </div>
            </div>

            <h3 class="text-lg font-bold text-white mt-8 mb-4">Doručovací adresa</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm text-white/50 mb-2">Ulice a číslo popisné</label>
                <input v-model="formData.street" type="text" class="input-cosmic">
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-white/50 mb-2">Město</label>
                  <input v-model="formData.city" type="text" class="input-cosmic">
                </div>
                <div>
                  <label class="block text-sm text-white/50 mb-2">PSČ</label>
                  <input v-model="formData.zip" type="text" class="input-cosmic">
                </div>
              </div>
            </div>

            <div class="pt-6 border-t border-white/10 mt-8 flex justify-end">
              <button type="submit" :disabled="isSaving" class="btn-cosmic px-8 flex items-center gap-2">
                <Icon v-if="isSaving" name="lucide:loader-2" class="animate-spin" height="18" />
                <Icon v-else name="mdi:content-save-outline" height="18" />
                {{ isSaving ? 'Ukládám...' : 'Uložit změny' }}
              </button>
            </div>
          </form>
        </div>

        <!-- ── ORDERS ── -->
        <div v-else-if="activeTab === 'orders'" class="glass-card-strong p-6 md:p-8 animate-fade-in min-h-[500px]">
          <h2 class="text-2xl font-bold text-white mb-6 pb-4 border-b border-white/10">Moje objednávky</h2>

          <div v-if="ordersPending" class="space-y-4">
            <div v-for="i in 3" :key="i" class="p-5 rounded-xl border border-white/10 bg-white/5 animate-pulse h-32"></div>
          </div>
          <div v-else-if="orders && orders.length > 0" class="space-y-4">
            <div v-for="order in orders" :key="order.id" class="rounded-xl border border-white/10 bg-white/5 transition-all overflow-hidden">
              <!-- Clickable header — toggles the detail -->
              <button
                type="button"
                @click="toggleOrder(order.id)"
                class="w-full text-left p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/5 transition-colors"
                :aria-expanded="expandedOrder === order.id"
              >
                <div>
                  <div class="font-mono text-primary-400 font-bold mb-1">Objednávka #{{ order.orderNumber || order.id }}</div>
                  <div class="text-sm text-white/50">
                    {{ order.createdAt ? new Date(order.createdAt).toLocaleDateString('cs-CZ') : '' }}
                    · {{ order.items?.length || 0 }} {{ (order.items?.length || 0) === 1 ? 'položka' : 'položek' }}
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-lg font-black text-white">{{ order.totalPrice }} Kč</span>
                  <span :class="['px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider', statusClass(order.status)]">
                    {{ statusLabel(order.status) }}
                  </span>
                  <Icon
                    name="mdi:chevron-down" height="22"
                    class="text-white/40 transition-transform duration-200 flex-shrink-0"
                    :class="{ 'rotate-180': expandedOrder === order.id }"
                  />
                </div>
              </button>

              <!-- Expandable detail -->
              <div v-show="expandedOrder === order.id" class="px-5 pb-5">
                <!-- Order meta -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-4 mb-5">
                  <div>
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Způsob platby</div>
                    <div class="text-sm text-white">{{ paymentLabel(order.paymentMethod) }}</div>
                  </div>
                  <div>
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Stav platby</div>
                    <div class="text-sm text-white">{{ paymentStatusLabel(order.paymentStatus) }}</div>
                  </div>
                  <div>
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Doprava</div>
                    <div class="text-sm text-white">
                      {{ shippingLabel(order.shippingMethod) }}
                      <span v-if="order.packetaBranchName" class="text-white/50">· {{ order.packetaBranchName }}</span>
                    </div>
                  </div>
                  <div>
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Doručovací adresa</div>
                    <div class="text-sm text-white whitespace-pre-line">{{ order.shippingAddress || '—' }}</div>
                  </div>
                  <div v-if="order.customerPhone">
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Telefon</div>
                    <div class="text-sm text-white">{{ order.customerPhone }}</div>
                  </div>
                  <div v-if="order.variableSymbol">
                    <div class="text-xs uppercase tracking-wider text-white/60 mb-1">Variabilní symbol</div>
                    <div class="text-sm text-white font-mono">{{ order.variableSymbol }}</div>
                  </div>
                </div>

                <!-- Items — clickable through to the product, each with its own
                     review slot. The review UI lives OUTSIDE the link component:
                     a button or a form nested inside an <a> is invalid HTML and
                     every click would also navigate. -->
                <div class="text-sm font-medium text-white/70 mb-3">Položky ({{ order.items?.length || 0 }}):</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div v-for="item in order.items" :key="item.id" class="rounded-lg">
                    <component
                      :is="itemLink(item) ? NuxtLink : 'div'"
                      :to="itemLink(item) || undefined"
                      class="flex items-center gap-3 rounded-lg p-2 -m-2 transition-colors"
                      :class="itemLink(item) ? 'group hover:bg-white/10 cursor-pointer' : ''"
                      :title="itemLink(item) ? `Zobrazit produkt: ${item.title}` : undefined"
                    >
                      <div class="w-11 h-11 rounded-md bg-white/5 overflow-hidden flex-shrink-0">
                        <NuxtImg
                          v-if="item.image"
                          :src="item.image.startsWith('http') ? item.image : `/${item.image}`"
                          class="w-full h-full object-cover"
                          width="88" height="88" format="webp" loading="lazy"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div
                          class="text-sm truncate transition-colors"
                          :class="itemLink(item) ? 'text-white group-hover:text-primary-300' : 'text-white'"
                        >{{ item.title }}</div>
                        <div class="text-xs text-white/60">{{ item.quantity }} × {{ item.price }} Kč</div>
                        <div v-if="!itemLink(item)" class="text-[11px] text-white/60 mt-0.5">
                          Originál je fuč — už není v prodeji
                        </div>
                      </div>
                      <Icon
                        v-if="itemLink(item)" name="mdi:arrow-right" height="16"
                        class="text-white/30 flex-shrink-0 transition-all group-hover:text-primary-300 group-hover:translate-x-0.5"
                      />
                    </component>

                    <!-- Už napsaná recenze -->
                    <div v-if="item.review" class="mt-3 pt-3 border-t border-white/10">
                      <div class="flex items-center gap-2 mb-1">
                        <div class="flex text-yellow-500">
                          <Icon v-for="n in 5" :key="n" :name="n <= item.review.rating ? 'mdi:star' : 'mdi:star-outline'" height="14" />
                        </div>
                        <span class="text-[11px] uppercase tracking-wider text-white/60">Tvoje recenze</span>
                      </div>
                      <p class="text-xs text-white/70 italic">&bdquo;{{ item.review.comment }}&ldquo;</p>
                    </div>

                    <!-- Napsat recenzi -->
                    <div v-else-if="item.canReview" class="mt-3 pt-3 border-t border-white/10">
                      <button
                        v-if="reviewFormFor !== item.id"
                        type="button"
                        @click="openReviewForm(item)"
                        class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-primary-500/50 transition-colors"
                      >
                        <Icon name="mdi:star-outline" height="16" /> Napsat recenzi
                      </button>

                      <form v-else @submit.prevent="submitReview(item)" class="space-y-3">
                        <div>
                          <div class="text-[11px] uppercase tracking-wider text-white/60 mb-1">Hodnocení</div>
                          <div class="flex gap-1">
                            <button
                              v-for="n in 5" :key="n" type="button"
                              @click="reviewRating = n"
                              class="p-0.5 text-yellow-500 hover:scale-110 transition-transform"
                              :aria-label="`${n} z 5 hvězdiček`"
                              :aria-pressed="reviewRating === n"
                            >
                              <Icon :name="n <= reviewRating ? 'mdi:star' : 'mdi:star-outline'" height="22" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label class="block text-[11px] uppercase tracking-wider text-white/60 mb-1">
                            Jak se ti kousek líbí?
                          </label>
                          <textarea
                            v-model="reviewComment" rows="3" maxlength="1000"
                            placeholder="Pár slov o produktu — ukáže se dole na hlavní stránce."
                            class="input-cosmic w-full resize-none text-sm"
                          />
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                          <button type="submit" :disabled="isSubmittingReview" class="btn-cosmic px-4 py-2 text-sm flex items-center gap-2">
                            <Icon v-if="isSubmittingReview" name="lucide:loader-2" class="animate-spin" height="16" />
                            <Icon v-else name="mdi:send-outline" height="16" />
                            {{ isSubmittingReview ? 'Odesílám…' : 'Odeslat recenzi' }}
                          </button>
                          <button type="button" @click="closeReviewForm" class="px-3 py-2 text-sm text-white/60 hover:text-white transition-colors">
                            Zrušit
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                <!-- Potvrzení objednávky — the same document that was e-mailed with
                     the order, viewable inline or downloadable. It is NOT a faktura:
                     the accounting invoice is issued separately in Fakturoid with its
                     own number series, so calling it one here would promise a
                     document this endpoint doesn't serve. The URL keeps saying
                     /invoice on purpose — links to it already exist in sent e-mails
                     and bookmarks, and renaming the route would break them.
                     Plain anchors so the session cookie rides along on the
                     same-origin GET. -->
                <div class="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
                  <span class="text-xs uppercase tracking-wider text-white/60">Potvrzení objednávky</span>
                  <a
                    :href="`/api/user/orders/${order.id}/invoice`"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-primary-500/50 transition-colors"
                  >
                    <Icon name="mdi:file-document-outline" height="18" /> Zobrazit
                  </a>
                  <a
                    :href="`/api/user/orders/${order.id}/invoice?download=1`"
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-primary-500/50 transition-colors"
                  >
                    <Icon name="mdi:download" height="18" /> Stáhnout
                  </a>
                </div>

                <!-- Cancel — only while nothing is dispatched and nothing is
                     paid (order.canCancel mirrors the API's own rule). -->
                <div v-if="order.canCancel" class="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <span class="text-xs text-white/50">
                    Objednávka se ještě nevyřizuje, takže ji můžeš zrušit.
                  </span>
                  <button
                    type="button"
                    :disabled="cancellingId === order.id"
                    @click="cancelOrder(order)"
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-400/30 text-red-300 hover:bg-red-500/10 hover:border-red-400/60 transition-colors disabled:opacity-50"
                  >
                    <Icon v-if="cancellingId === order.id" name="lucide:loader-2" class="animate-spin" height="16" />
                    <Icon v-else name="mdi:close-circle-outline" height="16" />
                    {{ cancellingId === order.id ? 'Ruším…' : 'Zrušit objednávku' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-12">
            <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white/20">
              <Icon name="mdi:shopping-off-outline" height="32" />
            </div>
            <p class="text-white/60 mb-6">Zatím nemáte žádné objednávky.</p>
            <NuxtLink to="/" class="btn-cosmic inline-block">Začít nakupovat</NuxtLink>
          </div>
        </div>

        <!-- ── FAVORITES ── -->
        <div v-else-if="activeTab === 'favorites'" class="glass-card-strong p-6 md:p-8 animate-fade-in min-h-[500px]">
          <h2 class="text-2xl font-bold text-white mb-6 pb-4 border-b border-white/10 flex items-center gap-2">
            <Icon name="mdi:heart" class="text-secondary-500" /> Oblíbené produkty
          </h2>

          <div v-if="favoritesPending" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div v-for="i in 3" :key="i" class="rounded-xl border border-white/10 bg-white/5 animate-pulse aspect-square"></div>
          </div>
          <div v-else-if="favorites && favorites.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <NuxtLink v-for="product in favorites" :key="product.id" :to="`/product/${product.slug}`" class="group relative rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-primary-500/50 transition-all flex flex-col">
              <div class="aspect-square bg-black/20 relative">
                <NuxtImg
                  v-if="product.image"
                  :src="product.image.startsWith('http') ? product.image : `/${product.image}`"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  width="500"
                  height="500"
                  format="webp"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  loading="lazy"
                />
              </div>
              <div class="p-3">
                <h3 class="text-sm font-medium text-white truncate">{{ product.name }}</h3>
                <div class="font-bold text-primary-300 mt-1">{{ product.price }} Kč</div>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="text-center py-12">
            <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white/20">
              <Icon name="mdi:heart-broken-outline" height="32" />
            </div>
            <p class="text-white/60">Zatím nemáte oblíbené žádné produkty.</p>
          </div>
        </div>

        <!-- ── REVIEWS ── -->
        <div v-else-if="activeTab === 'reviews'" class="glass-card-strong p-6 md:p-8 animate-fade-in min-h-[500px]">
          <h2 class="text-2xl font-bold text-white mb-6 pb-4 border-b border-white/10">Moje recenze</h2>

          <div v-if="reviewsPending" class="space-y-4">
            <div v-for="i in 3" :key="i" class="p-5 rounded-xl border border-white/10 bg-white/5 animate-pulse h-24"></div>
          </div>
          <div v-else-if="reviews && reviews.length > 0" class="space-y-4">
            <!-- The product may be long gone (sold one-off original, deleted by
                 the admin): the API then returns the snapshotted name and a null
                 slug, so nothing links anywhere. -->
            <div v-for="review in reviews" :key="review.id" class="p-5 rounded-xl border border-white/10 bg-white/5">
              <div class="flex gap-4">
                <component
                  :is="review.productSlug ? NuxtLink : 'div'"
                  :to="review.productSlug ? `/product/${review.productSlug}` : undefined"
                  class="w-16 h-16 rounded-lg bg-black/20 overflow-hidden flex-shrink-0 border border-white/10"
                  :class="review.productSlug ? 'hover:border-primary-400' : ''"
                >
                  <NuxtImg
                    v-if="review.productImage"
                    :src="review.productImage.startsWith('http') ? review.productImage : `/${review.productImage}`"
                    class="w-full h-full object-cover"
                    width="128"
                    height="128"
                    format="webp"
                    loading="lazy"
                  />
                </component>
                <div class="flex-grow">
                  <div class="flex items-start justify-between mb-1">
                    <component
                      :is="review.productSlug ? NuxtLink : 'span'"
                      :to="review.productSlug ? `/product/${review.productSlug}` : undefined"
                      class="text-white font-medium transition-colors"
                      :class="review.productSlug ? 'hover:text-primary-300' : ''"
                    >
                      {{ review.productName || 'Produkt' }}
                    </component>
                    <div class="text-xs text-white/60">{{ review.createdAt ? new Date(review.createdAt).toLocaleDateString('cs-CZ') : '' }}</div>
                  </div>
                  <div class="flex text-yellow-500 mb-2">
                    <Icon v-for="n in 5" :key="n" :name="n <= review.rating ? 'mdi:star' : 'mdi:star-outline'" height="16" />
                  </div>
                  <p class="text-sm text-white/70 italic">&bdquo;{{ review.comment }}&ldquo;</p>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-12">
            <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white/20">
              <Icon name="mdi:comment-outline" height="32" />
            </div>
            <p class="text-white/60">Zatím jste nenapsali žádnou recenzi.</p>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.profile-head { margin-bottom: 2rem; }
/* The header is the only part of this page that sits on the PAGE GROUND rather
   than on a .glass-card-strong panel, so it is the only part that needs to
   flip: hardcoded 60% ink measured 1.05:1 on the dark ground — invisible.
   --pop-ink-mute is the token for exactly this role (muted text on paper) and
   carries 0.64 rather than 0.60 in light, the alpha main.css settled on to
   clear AA on cream. */
.profile-sub {
  font-family: var(--font-mono, monospace);
  font-size: 0.86rem;
  color: var(--pop-ink-mute, rgba(20, 35, 26, 0.64));
  margin-top: 0.6rem;
}
</style>
