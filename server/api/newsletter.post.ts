import { createHash } from 'node:crypto';
import { getRequestIP, getHeader } from 'h3';
import type { H3Event } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '../utils/db';
import { newsletterSubscribers } from '../database/schema';
import { confirmUrl } from '../utils/newsletter-token';
import { sendNewsletterConfirmationEmail } from '../utils/newsletter-email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Best-effort client IP, same reasoning as server/utils/rate-limit.ts:
 * Cloudflare's header is set by the edge and can't be spoofed through it, the
 * last X-Forwarded-For hop is what our own proxy saw, the socket is the
 * fallback. (That helper keeps its version private, hence the copy.)
 */
function clientIp(event: H3Event): string | null {
  const cf = getHeader(event, 'cf-connecting-ip')?.trim();
  if (cf) return cf;

  const forwarded = getHeader(event, 'x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }

  return getRequestIP(event) || null;
}

/**
 * One-way IP fingerprint, identical scheme to server/utils/analytics.ts.
 * A raw IP is personal data with no use here; the hash is only ever compared
 * against a hash of the same address, which is all a consent record needs.
 */
function hashIp(ip: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || 'shopik-newsletter';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}

/**
 * Newsletter sign-up — double opt-in.
 *
 * Writing the address down is not consent: anybody can type a stranger's email
 * into a footer form, and GDPR art. 7(1) wants the consent *demonstrable*. So a
 * sign-up only ever creates an unconfirmed row (`confirmedAt` NULL) plus the
 * evidence of where the tick came from, and the address itself has to confirm
 * by clicking the link we mail it.
 *
 * The answer is always the same `{ ok: true }`, new address or not — differing
 * replies would turn this endpoint into a way to ask "is this person on the
 * list?", which is itself a leak about somebody who never talked to us.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const email = String(body?.email || '').trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatná e-mailová adresa.' });
  }

  // Must be an explicit true: a missing or falsy value means the box in the form
  // was not ticked, and a pre-ticked or implied consent is no consent at all.
  if (body?.consent !== true) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bez souhlasu se zasíláním novinek tě přihlásit nemůžeme.',
    });
  }

  const ip = clientIp(event);
  const consentIpHash = ip ? hashIp(ip) : null;
  // Which form the tick came from; free-form so other entry points can be told
  // apart later without another migration.
  const consentSource = String(body?.source || 'footer-form').slice(0, 64);

  try {
    const [existing] = await db
      .select({ confirmedAt: newsletterSubscribers.confirmedAt })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    // Already confirmed: nothing to prove and nothing to send. Re-mailing a
    // confirmed subscriber on every form submit would let anyone use the form
    // to pester an address that is already ours.
    if (existing?.confirmedAt) return { ok: true };

    await db
      .insert(newsletterSubscribers)
      .values({ email, confirmedAt: null, consentSource, consentIpHash })
      .onConflictDoUpdate({
        target: newsletterSubscribers.email,
        // A repeated sign-up refreshes the evidence but must not confirm
        // anything — only the click on the emailed link may do that.
        set: { consentSource, consentIpHash },
      });
  } catch (err) {
    console.error('[newsletter] insert failed:', err);
    throw createError({ statusCode: 500, statusMessage: 'Nepodařilo se uložit. Zkuste to prosím znovu.' });
  }

  // Best effort: the row is saved either way, and a mail server hiccup must not
  // read as "your address was rejected". Nothing is mailed to the list until
  // the confirmation lands, so a lost mail costs only this one sign-up.
  try {
    await sendNewsletterConfirmationEmail({ to: email, url: confirmUrl(email) });
  } catch (err) {
    console.error('[newsletter] confirmation email failed:', err);
  }

  return { ok: true };
});
