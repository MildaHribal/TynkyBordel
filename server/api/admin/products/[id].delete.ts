import { db } from '../../../utils/db';
import { products } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../../utils/session';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, 'id'));

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID produktu je povinné',
    });
  }

  // Order lines keep their own copy of the title/price/image and the FK is
  // ON DELETE SET NULL (migration 0009), so deleting a sold-out original leaves
  // past orders intact. Any OTHER table that still points here would surface as
  // a 23503 — catch it and say what is holding the product rather than letting
  // a raw Postgres error become an opaque 500 in the admin.
  let result;
  try {
    result = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();
  } catch (err: any) {
    if (err?.code === '23503') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Produkt nejde smazat — je ještě navázaný na jiné záznamy.',
      });
    }
    throw err;
  }

  if (result.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Produkt nenalezen',
    });
  }

  return { success: true, message: 'Produkt smazán' };
});
