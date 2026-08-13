import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * One-click unsubscribe tokens.
 *
 * A token is an HMAC of the (lower-cased) email, so it needs no storage and
 * can't be guessed. Put `unsubscribeUrl(email)` in the footer of every campaign
 * — an opt-out that costs the recipient one click is what GDPR expects.
 */

function secret(): string {
  // Reuses the auth secret, which is already required in production.
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is required to sign newsletter tokens');
  return value;
}

function sign(purpose: string, email: string): string {
  return createHmac('sha256', secret())
    .update(`${purpose}:${email.trim().toLowerCase()}`)
    .digest('hex');
}

function matches(expectedToken: string, token: string): boolean {
  if (!token) return false;
  try {
    const expected = Buffer.from(expectedToken);
    const provided = Buffer.from(String(token));
    // timingSafeEqual throws on length mismatch — compare lengths first.
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function newsletterToken(email: string): string {
  return sign('newsletter', email);
}

export function verifyNewsletterToken(email: string, token: string): boolean {
  return matches(newsletterToken(email), token);
}

/**
 * Double opt-in confirmation token.
 *
 * Deliberately a different purpose prefix than the unsubscribe token: both are
 * HMACs of the same address, so without the prefix one link would work as the
 * other — an unsubscribe URL harvested from a footer could confirm a signup the
 * recipient never wanted, which is exactly the proof-of-consent this is for.
 */
export function confirmToken(email: string): string {
  return sign('newsletter-confirm', email);
}

export function verifyConfirmToken(email: string, token: string): boolean {
  return matches(confirmToken(email), token);
}

/** Absolute URL to drop into the footer of a newsletter. */
export function unsubscribeUrl(email: string, siteUrl?: string): string {
  const base = (siteUrl || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({ email, token: newsletterToken(email) });
  return `${base}/newsletter/odhlaseni?${params.toString()}`;
}

/** Absolute URL for the "confirm your subscription" button in the opt-in email. */
export function confirmUrl(email: string, siteUrl?: string): string {
  const base = (siteUrl || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({ email, token: confirmToken(email) });
  return `${base}/newsletter/potvrzeni?${params.toString()}`;
}
