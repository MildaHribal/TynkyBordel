import { db } from '../../utils/db';
import { reviews, products } from '../../database/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireSession } from '../../utils/session';

/**
 * GET /api/user/reviews — the caller's own reviews, listed in /user → Moje recenze.
 *
 * LEFT join, not inner: since migration 0012 a review outlives the product it is
 * about (originals get sold and deleted), and the customer must still see what
 * they wrote. `productTitle` is the snapshot for exactly that case, and
 * `productSlug` is null when there is no page left to link to.
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event)

  const userReviews = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      orderItemId: reviews.orderItemId,
      productName: sql<string | null>`coalesce(${products.name}, ${reviews.productTitle})`,
      productSlug: products.slug,
      productImage: products.image
    })
    .from(reviews)
    .leftJoin(products, eq(reviews.productId, products.id))
    .where(eq(reviews.userId, session.user.id))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));

  return userReviews;
});
