import { getTicker } from '../utils/site-content';

/**
 * Editable storefront copy, for the public pages that render it.
 *
 * Not a cached handler: the values come from the in-memory settings cache
 * already, so there is nothing to save, and a second cache layer would need its
 * own purge rule to match — the catalog purge only matches keys containing
 * "products", so a stale copy would survive the page rebuild around it.
 */
export default defineEventHandler(async () => {
  return { ticker: await getTicker() };
});
