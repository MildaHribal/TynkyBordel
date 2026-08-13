import { eq } from 'drizzle-orm';
import { db } from '../../../../utils/db';
import { products } from '../../../../database/schema';
import { requireAdmin } from '../../../../utils/session';

/**
 * Take a product off the storefront, or put it back.
 *
 * Sold pieces now stay listed as "PRODÁNO" indefinitely — the wall of sold work
 * is the shop's best advertising — so there has to be a way to end that, and it
 * must not be "delete the product". Hiding keeps the row, its photos, its slug
 * and its links from past orders; it only stops the piece being listed.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatné ID produktu' });
  }

  const body = await readBody(event);
  if (typeof body?.hidden !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Chybí údaj hidden (true/false)' });
  }

  const [updated] = await db
    .update(products)
    .set({ hidden: body.hidden, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning({ id: products.id, name: products.name, hidden: products.hidden });

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Produkt nenalezen' });
  }

  // The catalog cache is purged by the afterResponse hook in
  // server/plugins/02-invalidate-catalog-cache.ts — this path is under
  // /api/admin/products, which it already matches.
  return updated;
});
