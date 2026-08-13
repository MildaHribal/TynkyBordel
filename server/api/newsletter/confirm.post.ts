import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../utils/db';
import { newsletterSubscribers } from '../../database/schema';
import { verifyConfirmToken } from '../../utils/newsletter-token';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Second half of the double opt-in: the address confirms itself.
 *
 * The token is required here (unlike unsubscribing, where it is optional) —
 * this endpoint *creates* a consent record, so it may only ever be reached by
 * someone who could read the mail we sent to that address.
 *
 * Idempotent: clicking the link twice, or a mail client prefetching it, must
 * not look like a failure. Only the first click moves confirmed_at, so the
 * stored consent keeps the date of the actual confirmation.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const email = String(body?.email || '').trim().toLowerCase();
  const token = String(body?.token || '');

  if (!email || !EMAIL_RE.test(email) || !verifyConfirmToken(email, token)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Odkaz pro potvrzení je neplatný nebo neúplný.',
    });
  }

  try {
    await db
      .update(newsletterSubscribers)
      .set({ confirmedAt: new Date() })
      .where(and(eq(newsletterSubscribers.email, email), isNull(newsletterSubscribers.confirmedAt)));
  } catch (err) {
    console.error('[newsletter] confirm failed:', err);
    throw createError({
      statusCode: 500,
      statusMessage: 'Potvrzení se nepodařilo. Zkuste to prosím znovu.',
    });
  }

  // Deliberately `ok` even when no row matched: the address may have unsubscribed
  // in the meantime, and telling the clicker "you are not on the list" would say
  // more about that address than a signed link entitles anyone to know.
  return { ok: true };
});
