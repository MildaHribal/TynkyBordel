import { db } from '../../../utils/db';
import { products, categories } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { SOLD_OUT_VISIBLE_HOURS } from '../../../../shared/catalog';

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

  // A sold piece stays reachable for the same 24 hours the catalog keeps
  // listing it — otherwise every "PRODÁNO" card on the homepage would link
  // straight to a 404, which is precisely the broken behaviour this window
  // exists to fix. Older sold-outs 404 as before.
  const soldRecently =
    soldOut &&
    product.soldOutAt != null &&
    Date.now() - new Date(product.soldOutAt).getTime() < SOLD_OUT_VISIBLE_HOURS * 3600_000;

  if (soldOut && !soldRecently) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Product not found',
    });
  }

  return { ...product, soldOut };
});
