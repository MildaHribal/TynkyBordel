<script setup lang="ts">
import { useCartStore } from "~/stores/cart";

import { useAuth } from "~/composables/useAuth";
import { CARD_PAYMENT_ENABLED, COD_FEE, SHIPPING_FEE } from "~~/shared/shop";

const cart = useCartStore();
const { currentUser } = useAuth();
const toast = useCosmicToast();
const router = useRouter();

useSeoMeta({
  title: 'Pokladna',
  description: 'Dokončení objednávky v Tynky Bordel.',
  robots: 'noindex,nofollow',
});

const step = ref<'form' | 'success'>('form');
const orderId = ref<number | string | null>(null);
const isSubmitting = ref(false);
const agreedToTerms = ref(false);
const paymentMethod = ref<'cash' | 'bank-transfer' | 'card'>('cash');

// PayPal card payment is only offered when the master switch is on AND a client
// id is configured. Until then only Dobírka + Převod na účet are shown.
const paypalClientId = useRuntimeConfig().public.paypalClientId as string;
const cardEnabled = computed(() => CARD_PAYMENT_ENABLED && Boolean(paypalClientId));

type BankInfo = {
  iban: string;
  holder: string;
  amount: number;
  variableSymbol: number | string;
  qrDataUrl: string | null;
};
const successBank = ref<BankInfo | null>(null);
const successPaymentMethod = ref<'cash' | 'bank-transfer' | 'card'>('cash');

// A chosen pickup point (Zásilkovna Z-BOX or Balíkovna). `method` decides which
// widget picked it and which shipping method is sent to the server.
type PickupPoint = { id: string; name: string; address: string };
const shippingMethod = ref<'packeta-zbox' | 'balikovna'>('packeta-zbox');
const pickupPoint = ref<PickupPoint | null>(null);
const balikovnaOpen = ref(false);

// Switching the carrier invalidates a previously picked point.
watch(shippingMethod, () => { pickupPoint.value = null; });

const form = ref({
  customerName: '',
  customerEmail: '',
  phone: '',
});

// Same constants the server prices the order with — see shared/shop.ts.
const SHIPPING_PRICE = SHIPPING_FEE;

// ── Packeta widget: load script once ────────────────────────────────
useHead({
  script: [
    { src: 'https://widget.packeta.com/v6/www/js/library.js', async: true },
  ],
});

const openPacketaWidget = () => {
  const w = window as any;
  if (typeof w.Packeta === 'undefined') {
    toast.error('Widget Zásilkovny se nepodařilo načíst.', 'Zkuste obnovit stránku.');
    return;
  }
  const apiKey = useRuntimeConfig().public.packetaApiKey;

  w.Packeta.Widget.pick(
    apiKey,
    (point: any) => {
      if (!point) return;
      const address = [point.street, point.city, point.zip].filter(Boolean).join(', ');
      pickupPoint.value = {
        id: String(point.id),
        name: point.name || point.nameStreet || `Z-BOX ${point.id}`,
        address,
      };
    },
    {
      country: 'cz',
      language: 'cs',
      // Filter to Z-BOX pickup points only
      vendors: [{ country: 'cz', group: 'zbox' }],
    },
  );
};

// ── Balíkovna widget (Česká pošta) — iframe + postMessage ───────────
// Docs: https://b2c.cpost.cz/locations/?type=BALIKOVNY. The iframe posts back a
// { message: 'pickerResult', point: {...} } event when a point is picked.
function openBalikovnaWidget() {
  balikovnaOpen.value = true;
}

function onBalikovnaMessage(event: MessageEvent) {
  // Only trust messages from the Balíkovna origin.
  if (typeof event.origin === 'string' && !event.origin.includes('cpost.cz')) return;
  const data: any = event.data;
  if (!data || data.message !== 'pickerResult' || !data.point) return;
  const p = data.point;
  pickupPoint.value = {
    id: String(p.id),
    name: p.name || 'Balíkovna',
    address: p.address || [p.zip, p.municipality_name].filter(Boolean).join(' '),
  };
  balikovnaOpen.value = false;
}

onMounted(() => window.addEventListener('message', onBalikovnaMessage));
onBeforeUnmount(() => window.removeEventListener('message', onBalikovnaMessage));

// ── Prefill from user profile ───────────────────────────────────────
const { data: userProfile } = await useFetch(
  () => (currentUser.value ? '/api/user/profile' : ''),
  { immediate: !!currentUser.value, watch: [currentUser], default: () => null },
);

watch(
  [userProfile, currentUser],
  ([profile, user]) => {
    const p: any = profile;
    if (p) {
      form.value.customerName = p.name ?? form.value.customerName;
      form.value.customerEmail = user?.email ?? p.email ?? form.value.customerEmail;
      form.value.phone = p.phone ?? form.value.phone;
    } else if (user?.email && !form.value.customerEmail) {
      form.value.customerEmail = user.email;
    }
  },
  { immediate: true },
);

// ── Validation & totals ─────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s()\-]{9,20}$/;
const codFee = computed(() => (paymentMethod.value === 'cash' ? COD_FEE : 0));
const totalWithShipping = computed(() => cart.totalPrice + SHIPPING_PRICE + codFee.value);

const formValid = computed(() => {
  return (
    cart.items.length > 0 &&
    form.value.customerName.trim().length > 1 &&
    emailRegex.test(form.value.customerEmail) &&
    phoneRegex.test(form.value.phone.trim()) &&
    !!pickupPoint.value &&
    agreedToTerms.value
  );
});

// Shared order payload (used by the bank/COD flow and the PayPal capture).
function orderBody() {
  const shippingAddressText = pickupPoint.value ? `${pickupPoint.value.name} — ${pickupPoint.value.address}` : '';
  return {
    customerName: form.value.customerName,
    customerEmail: form.value.customerEmail,
    phone: form.value.phone,
    street: shippingAddressText,
    city: shippingMethod.value === 'balikovna' ? 'Balíkovna' : 'Z-BOX',
    zip: '',
    paymentMethod: paymentMethod.value,
    shippingMethod: shippingMethod.value,
    packetaBranchId: pickupPoint.value?.id,
    packetaBranchName: shippingAddressText,
    // Recorded on the order as evidence the terms/GDPR checkbox was ticked.
    agreedToTerms: agreedToTerms.value,
    items: cart.items.map((item) => ({ id: item.id, quantity: item.quantity })),
  };
}

// ── Submit (cash / bank transfer) ───────────────────────────────────
async function placeOrder() {
  if (!formValid.value || cart.items.length === 0 || !pickupPoint.value) return;
  isSubmitting.value = true;
  try {
    const response: any = await $fetch('/api/orders', { method: 'POST', body: orderBody() });
    orderId.value = response.orderNumber || response.orderId;
    successPaymentMethod.value = paymentMethod.value;
    successBank.value = response.bank || null;
    cart.clearCart();
    step.value = 'success';
  } catch (err: any) {
    toast.error(
      'Objednávku se nepodařilo odeslat',
      err?.data?.statusMessage || err?.statusMessage || 'Zkuste to znovu.',
    );
  } finally {
    isSubmitting.value = false;
  }
}

// ── PayPal card payment ─────────────────────────────────────────────
let paypalSdkPromise: Promise<any> | null = null;
const paypalRendered = ref(false);

function loadPaypalSdk(): Promise<any> {
  if (!import.meta.client || !paypalClientId) return Promise.resolve(null);
  if ((window as any).paypal) return Promise.resolve((window as any).paypal);
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalClientId)}&currency=CZK&intent=capture&enable-funding=card`;
    s.onload = () => resolve((window as any).paypal);
    s.onerror = () => reject(new Error('PayPal SDK se nepodařilo načíst'));
    document.head.appendChild(s);
  });
  return paypalSdkPromise;
}

async function renderPaypalButtons() {
  if (paypalRendered.value) return;
  const paypal = await loadPaypalSdk().catch(() => null);
  const container = document.getElementById('paypal-buttons');
  if (!paypal || !container) return;
  paypalRendered.value = true;
  container.innerHTML = '';
  paypal.Buttons({
    style: { layout: 'vertical', shape: 'pill', color: 'black', label: 'pay' },
    // Block payment until the form is valid.
    onClick: (_data: any, actions: any) => {
      if (!formValid.value) {
        toast.error('Nejdřív vyplň objednávku', 'Zkontroluj jméno, e-mail, telefon, výdejní místo a souhlas.');
        return actions.reject();
      }
      return actions.resolve();
    },
    createOrder: async () => {
      const r: any = await $fetch('/api/paypal/create-order', {
        method: 'POST',
        body: { items: cart.items.map((i) => ({ id: i.id, quantity: i.quantity })) },
      });
      return r.id;
    },
    onApprove: async (data: any) => {
      try {
        const r: any = await $fetch('/api/paypal/capture-order', {
          method: 'POST',
          body: { paypalOrderId: data.orderID, ...orderBody() },
        });
        orderId.value = r.orderNumber || r.orderId;
        successPaymentMethod.value = 'card';
        successBank.value = null;
        cart.clearCart();
        step.value = 'success';
      } catch (err: any) {
        toast.error('Platba selhala', err?.data?.statusMessage || 'Zkus to prosím znovu.');
      }
    },
    onError: () => {
      toast.error('Platba kartou selhala', 'Zkus to prosím znovu nebo zvol jiný způsob platby.');
    },
  }).render('#paypal-buttons');
}

// Render the PayPal buttons the first time the card method is chosen.
watch(paymentMethod, async (m) => {
  if (m === 'card' && cardEnabled.value) {
    await nextTick();
    renderPaypalButtons();
  }
});
</script>

<template>
  <div class="checkout-page mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
    <!-- ─── Form ─────────────────────────────────────────────────── -->
    <div v-if="step === 'form'" class="flex flex-col lg:flex-row gap-6">
      <div class="flex-grow min-w-0">
        <div class="flex items-center gap-3 mb-6">
          <NuxtLink to="/cart" class="checkout-back" aria-label="Zpět do košíku">
            <Icon name="ep:arrow-left-bold" height="18" />
          </NuxtLink>
          <h1 class="checkout-title">Pokladna</h1>
        </div>

        <!-- Osobní údaje -->
        <section class="checkout-card mb-4">
          <h2 class="checkout-section-title">
            <Icon name="mdi:account-outline" class="checkout-section-icon" height="18" />
            Kontaktní údaje
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="checkout-label">Jméno a příjmení *</label>
              <input v-model="form.customerName" type="text" required placeholder="Jan Novák" class="checkout-input" />
            </div>
            <div>
              <label class="checkout-label">Email *</label>
              <input v-model="form.customerEmail" type="email" required placeholder="jan@email.cz" class="checkout-input" />
            </div>
            <div class="md:col-span-2">
              <label class="checkout-label">Telefon *</label>
              <input v-model="form.phone" type="tel" required placeholder="+420 123 456 789" class="checkout-input" />
            </div>
          </div>
        </section>

        <!-- Z-BOX výběr -->
        <section class="checkout-card mb-4">
          <h2 class="checkout-section-title">
            <Icon name="mdi:package-variant-closed" class="checkout-section-icon" height="18" />
            Doprava
          </h2>

          <!-- Carrier choice -->
          <div class="payment-options mb-4">
            <label class="payment-option" :class="{ 'is-active': shippingMethod === 'packeta-zbox' }">
              <input type="radio" v-model="shippingMethod" value="packeta-zbox" class="payment-radio" />
              <div class="payment-icon payment-icon--bank"><Icon name="mdi:archive-outline" height="22" /></div>
              <div class="flex-grow">
                <div class="payment-title">Zásilkovna — Z-BOX</div>
                <div class="payment-note">Samoobslužný box, vyzvednutí PIN kódem 24/7.</div>
              </div>
            </label>
            <label class="payment-option" :class="{ 'is-active': shippingMethod === 'balikovna' }">
              <input type="radio" v-model="shippingMethod" value="balikovna" class="payment-radio" />
              <div class="payment-icon payment-icon--card"><Icon name="mdi:mailbox-outline" height="22" /></div>
              <div class="flex-grow">
                <div class="payment-title">Balíkovna (Česká pošta)</div>
                <div class="payment-note">Výdejní místo na poště, mimo poštu i AlzaBox.</div>
              </div>
            </label>
          </div>

          <!-- Selected pickup point -->
          <div class="zbox-row">
            <div class="flex items-center gap-3 min-w-0">
              <div class="zbox-icon">
                <Icon :name="shippingMethod === 'balikovna' ? 'mdi:mailbox-outline' : 'mdi:archive-outline'" height="24" />
              </div>
              <div class="min-w-0">
                <div class="checkout-caption">{{ shippingMethod === 'balikovna' ? 'Vybraná Balíkovna' : 'Vybraný Z-BOX' }}</div>
                <template v-if="pickupPoint">
                  <div class="zbox-name">
                    <Icon name="mdi:check-decagram" class="zbox-check" />
                    {{ pickupPoint.name }}
                  </div>
                  <div class="zbox-address">{{ pickupPoint.address }}</div>
                </template>
                <div v-else class="zbox-empty">Ještě není vybráno</div>
              </div>
            </div>
            <button
              @click.prevent="shippingMethod === 'balikovna' ? openBalikovnaWidget() : openPacketaWidget()"
              class="btn-primary-pop whitespace-nowrap"
            >
              <Icon name="mdi:map-marker" height="18" />
              {{ pickupPoint ? 'Změnit' : (shippingMethod === 'balikovna' ? 'Vybrat Balíkovnu' : 'Vybrat Z-BOX') }}
            </button>
          </div>
        </section>

        <!-- Balíkovna picker modal (iframe from Česká pošta) -->
        <Teleport to="body">
          <div v-if="balikovnaOpen" class="balikovna-overlay" @click.self="balikovnaOpen = false">
            <div class="balikovna-modal">
              <div class="balikovna-modal-head">
                <span>Vyber Balíkovnu</span>
                <button class="balikovna-close" @click="balikovnaOpen = false" aria-label="Zavřít">✕</button>
              </div>
              <iframe
                title="Výběr Balíkovny"
                src="https://b2c.cpost.cz/locations/?type=BALIKOVNY"
                allow="geolocation"
                class="balikovna-iframe"
              ></iframe>
            </div>
          </div>
        </Teleport>

        <!-- Platba -->
        <section class="checkout-card mb-4">
          <h2 class="checkout-section-title">
            <Icon name="mdi:cash-multiple" class="checkout-section-icon" height="18" />
            Platba
          </h2>
          <div class="payment-options">
            <label class="payment-option" :class="{ 'is-active': paymentMethod === 'cash' }">
              <input type="radio" v-model="paymentMethod" value="cash" class="payment-radio" />
              <div class="payment-icon">
                <Icon name="mdi:cash-multiple" height="22" />
              </div>
              <div class="flex-grow">
                <div class="payment-title">
                  Dobírka
                  <span class="payment-fee">+{{ COD_FEE }} Kč</span>
                </div>
                <div class="payment-note">Zaplatíte při vyzvednutí v Z-BOXu.</div>
              </div>
            </label>
            <label class="payment-option" :class="{ 'is-active': paymentMethod === 'bank-transfer' }">
              <input type="radio" v-model="paymentMethod" value="bank-transfer" class="payment-radio" />
              <div class="payment-icon payment-icon--bank">
                <Icon name="mdi:bank-transfer" height="22" />
              </div>
              <div class="flex-grow">
                <div class="payment-title">Převod na účet</div>
                <div class="payment-note">Zobrazí se QR kód pro rychlou platbu. Objednávka se odešle po přijetí platby.</div>
              </div>
            </label>
            <label v-if="cardEnabled" class="payment-option" :class="{ 'is-active': paymentMethod === 'card' }">
              <input type="radio" v-model="paymentMethod" value="card" class="payment-radio" />
              <div class="payment-icon payment-icon--card">
                <Icon name="mdi:credit-card-outline" height="22" />
              </div>
              <div class="flex-grow">
                <div class="payment-title">Platba kartou</div>
                <div class="payment-note">Zaplať online kartou přes PayPal. Objednávka se rovnou potvrdí.</div>
              </div>
            </label>
          </div>
        </section>

        <!-- Souhlas -->
        <div class="mb-5">
          <label class="terms-row">
            <input v-model="agreedToTerms" type="checkbox" class="terms-checkbox" />
            <span class="terms-text">
              Souhlasím s
              <NuxtLink to="/obchodni-podminky" target="_blank" class="terms-link">obchodními podmínkami</NuxtLink>
              a
              <NuxtLink to="/ochrana-osobnich-udaju" target="_blank" class="terms-link">zásadami zpracování osobních údajů</NuxtLink>.
            </span>
          </label>
        </div>

        <!-- Card (PayPal) → PayPal buttons; otherwise the normal submit button. -->
        <template v-if="paymentMethod === 'card'">
          <div v-if="!formValid" class="paypal-hint">
            Vyplň prosím jméno, e-mail, telefon, výdejní místo a odsouhlas podmínky — pak se objeví platební tlačítko.
          </div>
          <div id="paypal-buttons" class="paypal-buttons" :class="{ 'is-disabled': !formValid }"></div>
        </template>
        <button
          v-else
          @click="placeOrder"
          :disabled="!formValid || isSubmitting"
          class="btn-primary-pop w-full justify-center py-4 text-lg"
        >
          <Icon v-if="isSubmitting" name="lucide:loader-2" height="22" class="animate-spin" />
          <Icon v-else name="mdi:check-decagram" height="22" />
          {{ isSubmitting ? 'Odesíláme...' : 'Odeslat objednávku' }}
        </button>
      </div>

      <!-- Souhrn -->
      <aside class="lg:w-80 flex-shrink-0">
        <div class="summary-card sticky top-24">
          <h3 class="summary-title">Váš košík</h3>
          <div class="summary-items">
            <div v-for="item in cart.items" :key="item.id" class="summary-item">
              <div class="summary-thumb">
                <NuxtImg
                  v-if="item.image"
                  :src="item.image.startsWith('http') ? item.image : `/${item.image}`"
                  class="w-full h-full object-cover"
                  width="80"
                  height="80"
                  format="webp"
                  loading="lazy"
                />
                <div v-else class="summary-thumb-empty">
                  <Icon name="mdi:image-off" height="14" />
                </div>
              </div>
              <div class="min-w-0 flex-grow">
                <div class="summary-item-title">{{ item.title }}</div>
                <div class="summary-item-qty">{{ item.quantity }} × {{ item.price }} Kč</div>
              </div>
            </div>
          </div>

          <div class="summary-totals">
            <div class="summary-row">
              <span>Mezisoučet</span><span>{{ cart.totalPrice }} Kč</span>
            </div>
            <div class="summary-row">
              <span>Doprava ({{ shippingMethod === 'balikovna' ? 'Balíkovna' : 'Zásilkovna Z-BOX' }})</span><span>{{ SHIPPING_PRICE }} Kč</span>
            </div>
            <div v-if="codFee > 0" class="summary-row">
              <span>Dobírka</span><span>{{ codFee }} Kč</span>
            </div>
            <div class="summary-row summary-total">
              <span>Celkem</span>
              <span>{{ totalWithShipping }} Kč</span>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- ─── Success ──────────────────────────────────────────────── -->
    <div v-else class="max-w-xl mx-auto text-center py-16">
      <div class="success-badge">
        <Icon name="mdi:check-bold" height="48" />
      </div>
      <h1 class="success-title">Objednáno! 🚀</h1>
      <p class="success-subtitle">
        Objednávka <span class="success-code">#{{ orderId }}</span> byla přijata.
      </p>

      <!-- Bank transfer: show QR + payment details -->
      <div v-if="successPaymentMethod === 'bank-transfer'" class="success-panel bank-panel">
        <h3 class="bank-title">Zaplať převodem</h3>
        <p class="bank-lead">
          Naskenuj QR kód v mobilním bankovnictví nebo použij údaje níže. Objednávka se zpracuje po přijetí platby.
        </p>

        <div v-if="successBank && successBank.qrDataUrl" class="bank-qr-wrap">
          <img :src="successBank.qrDataUrl" alt="QR kód pro platbu převodem" class="bank-qr" width="220" height="220" />
        </div>

        <div v-if="successBank" class="bank-details">
          <div v-if="successBank.accountNumber" class="bank-row"><span>Číslo účtu</span><strong>{{ successBank.accountNumber }}</strong></div>
          <div class="bank-row"><span>IBAN</span><strong>{{ successBank.iban }}</strong></div>
          <div class="bank-row"><span>Částka</span><strong>{{ successBank.amount.toLocaleString('cs-CZ') }} Kč</strong></div>
          <div class="bank-row"><span>Variabilní symbol</span><strong>{{ successBank.variableSymbol }}</strong></div>
          <div class="bank-row"><span>Zpráva pro příjemce</span><strong>Objednávka {{ successBank.variableSymbol }}</strong></div>
        </div>
        <div v-else class="bank-warning">
          <Icon name="mdi:alert-circle-outline" height="18" />
          Platební údaje nejsou nakonfigurovány — pošlu ti je e-mailem.
        </div>

        <div class="bank-footer">
          Potvrzení objednávky ti dorazí na e-mail. Po přijetí platby přijde další potvrzení.
        </div>
      </div>

      <!-- Card: paid instantly -->
      <div v-else-if="successPaymentMethod === 'card'" class="success-panel">
        ✅ Platba kartou proběhla úspěšně — objednávka je zaplacená. Potvrzení ti dorazí na e-mail.
        <template v-if="currentUser">
          Najdeš ji i v
          <NuxtLink to="/user" class="terms-link">Můj profil → Objednávky</NuxtLink>.
        </template>
      </div>

      <div v-else class="success-panel">
        Do e-mailu ti dorazí potvrzení. Platba proběhne při vyzvednutí v Z-BOXu.
        <template v-if="currentUser">
          Objednávku najdeš v
          <NuxtLink to="/user" class="terms-link">Můj profil → Objednávky</NuxtLink>.
        </template>
      </div>

      <NuxtLink to="/" class="btn-primary-pop px-8 py-3 inline-flex">
        <Icon name="mdi:store-outline" height="20" />
        Zpět k nakupování
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* ── Palette overrides (checkout uses dark text on pastel body) ── */
.checkout-page {
  color: var(--pop-ink, #14231a);
}

.checkout-back {
  color: rgba(20, 35, 26, 0.45);
  transition: color 0.2s;
}
.checkout-back:hover {
  color: var(--pop-ink, #14231a);
}

.checkout-title {
  font-family: 'Berkshire Swash', 'Petrona', cursive;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  line-height: 1;
  color: var(--pop-ink, #14231a);
  letter-spacing: -0.02em;
}

/* ── Cards ── */
.checkout-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1.25rem;
  padding: 1.25rem 1.25rem;
  box-shadow: 0 2px 12px rgba(20, 35, 26, 0.06);
}
@media (min-width: 768px) {
  .checkout-card { padding: 1.5rem 1.5rem; }
}

.checkout-section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--pop-ink, #14231a);
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(20, 35, 26, 0.08);
}
.checkout-section-icon {
  color: var(--pop-lavender, #b34a72);
}

.checkout-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(20, 35, 26, 0.6);
  margin-bottom: 0.35rem;
  letter-spacing: 0.02em;
}

.checkout-input {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(20, 35, 26, 0.15);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 0.65rem;
  color: var(--pop-ink, #14231a);
  font-size: 0.95rem;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.checkout-input::placeholder {
  color: rgba(20, 35, 26, 0.35);
}
.checkout-input:focus {
  outline: none;
  border-color: rgba(179, 50, 76, 0.55);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(179, 50, 76, 0.12);
}

.checkout-note {
  font-size: 0.85rem;
  color: rgba(20, 35, 26, 0.65);
  margin-bottom: 1rem;
}
.checkout-caption {
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(20, 35, 26, 0.55);
  font-weight: 700;
  margin-bottom: 0.15rem;
}

/* ── Balíkovna picker modal ── */
.balikovna-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(20, 8, 36, 0.6);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.balikovna-modal {
  width: min(760px, 100%);
  height: min(85vh, 820px);
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
.balikovna-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  font-weight: 700;
  color: #14231a;
  border-bottom: 1px solid rgba(20, 35, 26, 0.1);
}
.balikovna-close {
  border: 0;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: rgba(20, 35, 26, 0.6);
  padding: 4px 8px;
  border-radius: 8px;
}
.balikovna-close:hover { background: rgba(20, 35, 26, 0.08); }
.balikovna-iframe {
  flex-grow: 1;
  width: 100%;
  border: 0;
}

/* ── Z-BOX row ── */
.zbox-row {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
  padding: 0.9rem 1rem;
  border-radius: 0.9rem;
  background: rgba(169, 203, 191, 0.18);
  border: 1px solid rgba(179, 50, 76, 0.2);
}
@media (min-width: 640px) {
  .zbox-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
.zbox-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #cc0000, #ff3d3d);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(204, 0, 0, 0.25);
}
.zbox-name {
  font-weight: 700;
  color: var(--pop-ink, #14231a);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.95rem;
}
.zbox-check {
  color: #2e7d32;
}
.zbox-address {
  font-size: 0.8rem;
  color: rgba(20, 35, 26, 0.7);
  margin-top: 2px;
}
.zbox-empty {
  color: #b3324c;
  font-weight: 600;
  font-size: 0.9rem;
}

/* ── Payment options ── */
.payment-options { display: flex; flex-direction: column; gap: 0.6rem; }
.payment-option {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(20, 35, 26, 0.12);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.payment-option:hover { border-color: rgba(20, 35, 26, 0.3); }
.payment-option.is-active {
  border-color: #b3324c;
  background: rgba(179, 50, 76, 0.06);
  box-shadow: 0 0 0 3px rgba(179, 50, 76, 0.08);
}
.payment-radio {
  width: 18px;
  height: 18px;
  accent-color: #b3324c;
  cursor: pointer;
  flex-shrink: 0;
}
.payment-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(46, 125, 50, 0.15);
  color: #2e7d32;
  display: flex;
  align-items: center;
  justify-content: center;
}
.payment-icon--bank {
  background: rgba(179, 50, 76, 0.15);
  color: #b34a72;
}
.payment-icon--card {
  background: rgba(0, 112, 186, 0.15);
  color: #0070ba;
}
.paypal-hint {
  font-size: 0.85rem;
  color: rgba(20, 35, 26, 0.6);
  background: rgba(20, 35, 26, 0.05);
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  text-align: center;
}
.paypal-buttons {
  min-height: 48px;
  transition: opacity 0.2s ease;
}
.paypal-buttons.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}
.payment-title {
  font-weight: 700;
  color: var(--pop-ink, #14231a);
  font-size: 0.98rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.payment-fee {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #b3324c;
  background: rgba(179, 50, 76, 0.1);
  border: 1px solid rgba(179, 50, 76, 0.25);
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
}
.payment-note {
  font-size: 0.8rem;
  color: rgba(20, 35, 26, 0.7);
}

/* ── Bank transfer success panel ── */
.bank-panel {
  text-align: left;
}
.bank-title {
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 700;
  font-size: 1.4rem;
  color: var(--pop-ink);
  margin: 0 0 0.75rem;
  text-align: center;
}
.bank-lead {
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(20, 35, 26, 0.75);
  margin: 0 0 1.25rem;
  text-align: center;
}
.bank-qr-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 1.25rem;
}
.bank-qr {
  border-radius: 0.75rem;
  background: #ffffff;
  padding: 0.75rem;
  box-shadow: 0 4px 18px rgba(20, 35, 26, 0.14);
  border: 1px solid rgba(20, 35, 26, 0.1);
}
.bank-details {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(20, 35, 26, 0.1);
}
.bank-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.9rem;
  color: rgba(20, 35, 26, 0.7);
}
.bank-row strong {
  color: var(--pop-ink);
  font-weight: 700;
  word-break: break-all;
  text-align: right;
}
.bank-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  background: rgba(255, 200, 80, 0.18);
  border: 1px solid rgba(138, 90, 0, 0.25);
  color: #6a4400;
  border-radius: 0.75rem;
  font-size: 0.88rem;
}
.bank-footer {
  margin-top: 1.25rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(20, 35, 26, 0.08);
  font-size: 0.82rem;
  color: rgba(20, 35, 26, 0.6);
  text-align: center;
}

/* ── Terms ── */
.terms-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
  cursor: pointer;
}
.terms-checkbox {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  accent-color: #b34a72;
  cursor: pointer;
  flex-shrink: 0;
}
.terms-text {
  font-size: 0.85rem;
  color: rgba(20, 35, 26, 0.75);
  line-height: 1.5;
}
.terms-link {
  color: #b34a72;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.terms-link:hover { color: #97325c; }

/* ── Primary button (pastel-safe) ── */
.btn-primary-pop {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 1.2rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #b34a72, #b3324c);
  color: #fff;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  box-shadow: 0 4px 18px rgba(179, 50, 76, 0.3);
}
.btn-primary-pop:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(179, 50, 76, 0.4);
}
.btn-primary-pop:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

/* ── Summary card ── */
.summary-card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1.25rem;
  padding: 1.25rem;
  box-shadow: 0 4px 20px rgba(20, 35, 26, 0.08);
}
.summary-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--pop-ink, #14231a);
  margin-bottom: 1rem;
}
.summary-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
  margin-bottom: 1rem;
}
.summary-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.summary-thumb {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(20, 35, 26, 0.06);
}
.summary-thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(20, 35, 26, 0.3);
}
.summary-item-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--pop-ink, #14231a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.summary-item-qty {
  font-size: 0.72rem;
  color: rgba(20, 35, 26, 0.55);
}
.summary-totals {
  border-top: 1px solid rgba(20, 35, 26, 0.1);
  padding-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: rgba(20, 35, 26, 0.65);
}
.summary-total {
  padding-top: 0.6rem;
  border-top: 1px solid rgba(20, 35, 26, 0.1);
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--pop-ink, #14231a);
  margin-top: 0.2rem;
}

/* ── Success ── */
.success-badge {
  position: relative;
  display: inline-flex;
  width: 96px;
  height: 96px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #b34a72, #b3324c);
  color: #fff;
  align-items: center;
  justify-content: center;
  margin: 0 auto 2rem;
  box-shadow: 0 12px 30px rgba(179, 50, 76, 0.35);
}
.success-title {
  font-family: 'Berkshire Swash', 'Petrona', cursive;
  font-size: clamp(2rem, 6vw, 3rem);
  color: var(--pop-ink, #14231a);
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
}
.success-subtitle {
  font-size: 1.05rem;
  color: rgba(20, 35, 26, 0.7);
  margin-bottom: 1.75rem;
}
.success-code {
  font-family: 'Menlo', monospace;
  font-weight: 700;
  color: #b34a72;
}
.success-panel {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(20, 35, 26, 0.1);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  color: rgba(20, 35, 26, 0.75);
  font-size: 0.95rem;
  margin-bottom: 2rem;
  text-align: left;
}
</style>
