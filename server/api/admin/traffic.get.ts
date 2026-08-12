import { requireAdmin } from '../../utils/session';
import { flush, trafficSummary } from '../../utils/analytics';

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
  return await trafficSummary(days);
});
