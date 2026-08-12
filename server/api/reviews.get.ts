import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../utils/db';
import { products, reviews } from '../database/schema';

/**
 * GET /api/reviews — the public wall of customer reviews shown at the bottom of
 * the homepage.
 *
 * Reviews are no longer attached to a product page (originals sell out and their
 * pages disappear), so this is the one place they are read from. Each row
 * carries what the wall renders: which piece it is about, who wrote it, the
 * stars and the text.
 *
 * NOT a `defineCachedEventHandler`. The homepage HTML is already cached by the
 * `swr: 3600` route rule and purged on write (see
 * server/plugins/02-invalidate-catalog-cache.ts); a second cache layer under
 * `nitro:handlers:` would need its own purge rule to match — the catalog purge
 * only matches keys containing "products" — and would otherwise keep serving a
 * stale wall behind a freshly rebuilt page.
 *
 * `productTitle` is the snapshot taken when the review was written, so it still
 * names the piece after the product row is deleted; the live product name wins
 * while it exists (the owner may have fixed a typo since).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const requested = Number(query.limit);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 50) : 12;

  return await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      userName: reviews.userName,
      createdAt: reviews.createdAt,
      // coalesce, not a JS fallback: the live name is preferred, the snapshot is
      // what is left once the product is gone.
      productName: sql<string | null>`coalesce(${products.name}, ${reviews.productTitle})`,
      productImage: products.image,
    })
    .from(reviews)
    // LEFT: a review whose product was deleted still belongs on the wall.
    .leftJoin(products, eq(reviews.productId, products.id))
    // Rating-only rows would render as an empty card. New reviews always carry
    // text (the API requires it); this filters out any legacy row that doesn't.
    .where(and(isNotNull(reviews.comment), ne(reviews.comment, '')))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit);
});
