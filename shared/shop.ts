/**
 * Single source of truth for shop identity, fees and shipping options.
 *
 * Shared by the storefront (checkout, legal pages) and the server (order
 * pricing) so a number can never say 79 Kč in one place and 99 Kč in another.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  FILL THIS IN BEFORE GOING LIVE
//
// A Czech e-shop must state the seller's real identity — trade name, registered
// address and IČO — in its terms and privacy policy. These strings are rendered
// verbatim on /obchodni-podminky, /ochrana-osobnich-udaju and /reklamace.
//
// Anything left empty renders as a loud "[DOPLNIT: …]" marker on the public
// page, on purpose: an obviously unfinished page is far less harmful than a
// convincing but invented address.
// ─────────────────────────────────────────────────────────────────────────────
export const BUSINESS = {
  /** Legal name of the sole trader (jméno podnikatele). */
  legalName: 'Kristýna Egnerová',
  /** IČO from the trade licence. */
  ico: '17896789',
  /** DIČ — leave empty when not VAT-registered. */
  dic: '',
  /** Registered place of business, exactly as in the trade register. */
  address: {
    street: 'Kurzova 2222/16',
    city: 'Praha 13',
    zip: '155 00',
  },
  /** Where returns and complaints are physically sent. Usually the same address. */
  returnsAddressSameAsRegistered: true,
  email: 'info@tynkybordel.shop',
  /** Optional — shown only when set. */
  phone: '',
  /** Sole traders under the threshold are not VAT payers. */
  isVatPayer: false,
  domain: 'tynkybordel.shop',
  /** Supervisory body for a plain retail trade licence. */
  tradeAuthority: 'Živnostenský úřad příslušný podle sídla podnikatele',
} as const

/** Renders a value or a visible placeholder, so gaps can't pass unnoticed. */
export function orPlaceholder(value: string | undefined | null, label: string): string {
  const trimmed = (value ?? '').trim()
  return trimmed || `[DOPLNIT: ${label}]`
}

/** "Ulice 1, 301 00 Plzeň" — or a placeholder when unset. */
export function formattedAddress(): string {
  const { street, city, zip } = BUSINESS.address
  if (!street.trim() || !city.trim() || !zip.trim()) {
    return '[DOPLNIT: sídlo — ulice, PSČ, město]'
  }
  return `${street}, ${zip} ${city}`
}

/** True once every legally required identity field is filled in. */
export function isIdentityComplete(): boolean {
  const { street, city, zip } = BUSINESS.address
  return Boolean(BUSINESS.ico.trim() && street.trim() && city.trim() && zip.trim())
}

// ─── Fees ────────────────────────────────────────────────────────────────────
/** Flat shipping, charged on every order. */
export const SHIPPING_FEE = 79
/** Cash-on-delivery surcharge, on top of shipping. */
export const COD_FEE = 60

// ─── Shipping options actually offered at checkout ───────────────────────────
// Keep in sync with the radio buttons in pages/checkout.vue — this list is what
// /reklamace advertises to customers.
export const SHIPPING_OPTIONS = [
  {
    id: 'packeta-zbox',
    name: 'Zásilkovna — Z-BOX',
    note: 'Samoobslužný box, vyzvednutí PIN kódem 24/7.',
    price: SHIPPING_FEE,
    icon: 'mdi:archive-outline',
  },
  {
    id: 'balikovna',
    name: 'Balíkovna (Česká pošta)',
    note: 'Výdejní místo na poště i mimo ni.',
    price: SHIPPING_FEE,
    icon: 'mdi:mailbox-outline',
  },
] as const

// ─── Card payment master switch ──────────────────────────────────────────────
// Card (PayPal) is intentionally OFF until the seller has a live PayPal account.
// This one flag gates the checkout radio, the legal-page wording and the list of
// data processors in the privacy policy, so they can never advertise a payment
// method that isn't actually available. Flip to `true` (and set
// NUXT_PUBLIC_PAYPAL_CLIENT_ID + PAYPAL_ENV=live) to re-enable card payments.
export const CARD_PAYMENT_ENABLED = false

// ─── Payment options actually offered at checkout ────────────────────────────
export const PAYMENT_OPTIONS = [
  { id: 'cash', name: 'Dobírka', note: `Platba při převzetí (+ ${COD_FEE} Kč).` },
  { id: 'bank-transfer', name: 'Převod na účet', note: 'Včetně QR kódu pro rychlou platbu.' },
  ...(CARD_PAYMENT_ENABLED
    ? [{ id: 'card', name: 'Karta přes PayPal', note: 'Online platba, objednávka se potvrdí ihned.' }]
    : []),
] as const
