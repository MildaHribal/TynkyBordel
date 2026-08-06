import { db } from '../../utils/db';
import { products, categories } from '../../database/schema';
import { and, eq, ilike, or, sql, desc } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  // Filter by category NAME (matches what the product detail page passes when
  // fetching "podobné kousky"). Without this the `category` param was ignored
  // and the similar-products row was just the newest 8 products.
  const category = typeof query.category === 'string' ? query.category.trim() : '';

  const conditions = [];
  if (search) {
    conditions.push(or(
      ilike(products.name, `%${search}%`),
      ilike(products.description, `%${search}%`)
    ));
  }
  if (category) {
    conditions.push(eq(categories.name, category));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  let queryBuilder = db
    .select({
      id: products.id,
      title: products.name,
      name: products.name,
      slug: products.slug,
      description: products.description,
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
    .where(whereClause)
    .$dynamic();

  if (query.random === 'true') {
    queryBuilder = queryBuilder.orderBy(sql`RANDOM()`);
  } else {
    queryBuilder = queryBuilder.orderBy(desc(products.id));
  }

  if (query.limit && !isNaN(Number(query.limit))) {
    queryBuilder = queryBuilder.limit(Number(query.limit));
  }

  return await queryBuilder;
});
