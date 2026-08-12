import { db } from '../../../utils/db';
import { products, categories } from '../../../database/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '../../../utils/session';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID produktu je povinné',
    });
  }

  // Build update data
  const updateData: Record<string, any> = { updatedAt: new Date() };

  if (body.title !== undefined) {
    updateData.name = body.title;
    updateData.slug = slugify(body.title);
  }
  if (body.description !== undefined) updateData.description = body.description;
  if (body.price !== undefined) updateData.price = Number(body.price);
  if (body.image !== undefined) updateData.image = body.image;
  if (body.images !== undefined) updateData.images = body.images;
  if (body.stock !== undefined) {
    const stock = Number(body.stock);
    updateData.stock = stock;
    // Keep sold_out_at consistent with whatever the admin just typed, the same
    // way checkout and cancellation do. COALESCE preserves the original sale
    // time: editing a sold piece's description must not restart its 24-hour
    // window on the storefront.
    updateData.soldOutAt = stock > 0 ? null : sql`coalesce(${products.soldOutAt}, now())`;
  }

  // Resolve category
  if (body.categoryId !== undefined) {
    updateData.categoryId = body.categoryId ? Number(body.categoryId) : null;
  } else if (body.category !== undefined) {
    if (body.category) {
      const existing = await db
        .select()
        .from(categories)
        .where(eq(categories.name, body.category));

      if (existing.length > 0) {
        updateData.categoryId = existing[0].id;
      } else {
        const [newCat] = await db
          .insert(categories)
          .values({ name: body.category, slug: slugify(body.category) })
          .returning();
        updateData.categoryId = newCat.id;
      }
    } else {
      updateData.categoryId = null;
    }
  }

  const result = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();

  if (result.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Produkt nenalezen',
    });
  }

  // Return with category name
  const updated = result[0];
  let categoryName: string | null = null;
  if (updated.categoryId) {
    const cat = await db.select().from(categories).where(eq(categories.id, updated.categoryId));
    categoryName = cat[0]?.name ?? null;
  }

  return {
    ...updated,
    title: updated.name,
    category: categoryName,
  };
});
