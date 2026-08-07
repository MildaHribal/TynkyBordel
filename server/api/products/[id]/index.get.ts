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

  // Public detail: a sold-out product (stock reached 0) is hidden from the
  // storefront, so a direct link 404s. Admin uses its own endpoints.
  if ((result[0].stock ?? 0) <= 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Product not found',
    });
  }

  return result[0];
});
