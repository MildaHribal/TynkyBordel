import { db } from '../../../utils/db';
import { categories, products } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../../utils/session';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, 'id'));

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID kategorie je povinné',
    });
  }

  // Products keep existing without a category, and subcategories move up one
  // level instead of becoming invisible orphans (the admin's tree builder
  // drops nodes whose parent no longer exists). Without the product unlink,
  // deleting a category in use died on the foreign key as an opaque 500.
  const result = await db.transaction(async (tx) => {
    const [victim] = await tx.select().from(categories).where(eq(categories.id, id));
    if (!victim) return [];
    await tx.update(products).set({ categoryId: null }).where(eq(products.categoryId, id));
    await tx.update(categories).set({ parentId: victim.parentId ?? null }).where(eq(categories.parentId, id));
    return tx.delete(categories).where(eq(categories.id, id)).returning();
  });

  if (result.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Kategorie nenalezena',
    });
  }

  return { success: true, message: 'Kategorie smazána' };
});
