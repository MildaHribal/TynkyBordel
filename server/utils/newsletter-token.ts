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

export function newsletterToken(email: string): string {
  return createHmac('sha256', secret())
    .update(`newsletter:${email.trim().toLowerCase()}`)
    .digest('hex');
}

export function verifyNewsletterToken(email: string, token: string): boolean {
  if (!token) return false;
  try {
    const expected = Buffer.from(newsletterToken(email));
    const provided = Buffer.from(String(token));
    // timingSafeEqual throws on length mismatch — compare lengths first.
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

/** Absolute URL to drop into the footer of a newsletter. */
export function unsubscribeUrl(email: string, siteUrl?: string): string {
  const base = (siteUrl || process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({ email, token: newsletterToken(email) });
  return `${base}/newsletter/odhlaseni?${params.toString()}`;
}
