import { db } from '../../../utils/db';
import { products, categories } from '../../../database/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id');

  if (!idOrSlug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Product ID is required',
    });
  }

  const numericId = Number(idOrSlug)
  const whereClause = Number.isFinite(numericId)
    ? eq(products.id, numericId)
    : eq(products.slug, idOrSlug)

  const result = await db
    .select({
      id: products.id,
      title: products.name,
      name: products.name,
      slug: products.slug,
      description: products.description,
      shortDescription: products.shortDescription,
      price: products.price,
      image: products.image,
      images: products.images,
      stock: products.stock,
      soldOutAt: products.soldOutAt,
      hidden: products.hidden,
      category: categories.name,
      categoryId: products.categoryId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause);

  if (result.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Product not found',
    });
  }

  const product = result[0]!;
  const soldOut = (product.stock ?? 0) <= 0;

  // Reachable exactly when the catalog lists it, and for the same reasons —
  // if these two ever disagree, a "PRODÁNO" card on the homepage links straight
  // to a 404. Taken down by the owner, or never stocked and never sold: gone.
  const listed = !product.hidden && (!soldOut || product.soldOutAt != null);

  if (!listed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Product not found',
    });
  }

  return { ...product, soldOut };
});
