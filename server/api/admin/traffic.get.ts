import { requireAdmin } from '../../utils/session';
import { EXCLUDE_COOKIE, flush, trafficSummary } from '../../utils/analytics';

/**
 * Visitor numbers for the admin overview.
 *
 * Flushes the in-memory buffer first, so opening the page shows the visit that
 * happened ten seconds ago rather than making the owner wonder why the counter
 * looks stuck.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const days = Math.min(Math.max(Number(getQuery(event).days) || 30, 1), 90);

  await flush();
  const summary = await trafficSummary(days);

  // requireAdmin above has just set the cookie if it was missing, so this is
  // reported from the request rather than the response: on the very first admin
  // load it is still "not yet", and true from the next one on. Shown in the
  // panel so the owner can see the exclusion is actually in effect instead of
  // taking it on trust.
  return { ...summary, excluded: getCookie(event, EXCLUDE_COOKIE) === '1' };
});
