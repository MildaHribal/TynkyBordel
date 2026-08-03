import { eq } from 'drizzle-orm';
import { db } from '../../utils/db';
import { newsletterSubscribers } from '../../database/schema';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Remove an address from the newsletter list.
 *
 * Deliberately works with just the email — opting out must never be harder than
 * opting in. A signed token from the email footer is accepted too (see
 * utils/newsletter-token.ts) so links can unsubscribe in one click, but it is
 * not required: the worst a stranger can do is stop mail they don't receive.
 *
 * Always answers { ok: true } so the endpoint can't be used to test whether an
 * address is subscribed.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const email = String(body?.email || '').trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatná e-mailová adresa.' });
  }

  try {
    await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
  } catch (err) {
    console.error('[newsletter] unsubscribe failed:', err);
    throw createError({ statusCode: 500, statusMessage: 'Odhlášení se nepodařilo. Zkuste to prosím znovu.' });
  }

  return { ok: true };
});
