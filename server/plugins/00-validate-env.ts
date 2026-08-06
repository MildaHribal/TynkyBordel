/**
 * Fail-fast validation of required environment variables in production.
 * Dev mode logs warnings but does not exit, so `nuxt dev` still starts.
 */
export default defineNitroPlugin(() => {
  const isProd = process.env.NODE_ENV === 'production'

  const required = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'NUXT_PUBLIC_SITE_URL',
  ]

  // The things that actually matter for the live shop now: order/reset emails,
  // the bank-transfer QR, and the Zásilkovna pickup widget. (Stripe is dormant;
  // PayPal card is off by default — see CARD_PAYMENT_ENABLED in shared/shop.ts.)
  const recommended = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'NUXT_PUBLIC_PACKETA_API_KEY',
    'NUXT_PACKETA_API_SECRET',
  ]

  const missing = required.filter((k) => !process.env[k])
  const missingRecommended = recommended.filter((k) => !process.env[k])

  if (missing.length) {
    const msg = `[env] Missing required environment variables: ${missing.join(', ')}`
    if (isProd) throw new Error(msg)
    console.warn(msg)
  }

  if (missingRecommended.length) {
    console.warn(
      `[env] Recommended environment variables not set: ${missingRecommended.join(', ')}`,
    )
  }

  // Bank transfer is one of only two live payment methods — without an account
  // the customer sees a "platba není nakonfigurována" fallback and no QR code.
  const hasIban = process.env.BANK_ACCOUNT_IBAN
  const hasLocal = process.env.BANK_ACCOUNT_NUMBER && process.env.BANK_ACCOUNT_BANK_CODE
  if (!hasIban && !hasLocal) {
    console.warn(
      '[env] No bank account configured (BANK_ACCOUNT_IBAN or BANK_ACCOUNT_NUMBER + BANK_ACCOUNT_BANK_CODE) — bank-transfer orders will have no QR/payment details.',
    )
  }

  if (isProd && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('[env] BETTER_AUTH_SECRET must be at least 32 characters in production')
  }
})
