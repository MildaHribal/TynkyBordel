import { and, eq } from 'drizzle-orm';
import { db } from '../../utils/db';
import { orderItems, orders, reviews } from '../../database/schema';
import { requireSession } from '../../utils/session';
import {
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
  isReviewableStatus,
} from '../../utils/reviews';

/**
 * POST /api/user/reviews — the customer reviews something they bought.
 *
 * The review is keyed on an ORDER LINE (`orderItemId`), not on a product, which
 * is what makes "only a real buyer, only once" enforceable without trusting
 * anything the browser sends:
 *
 *   - proof of purchase: the line is looked up through the caller's own orders
 *     (`orders.user_id = session user`), so an id belonging to someone else's
 *     order simply is not found;
 *   - only once: `reviews.order_item_id` carries a UNIQUE index (migration
 *     0012). The pre-check below returns a friendly 409, and the constraint
 *     catches the double-submit race the pre-check cannot.
 *
 * The old product-page endpoint gated on "has this user ever ordered this
 * product" and allowed one review per product, silently overwriting the earlier
 * one. Keyed per line, a repeat buyer gets a say on each purchase instead.
 *
 * Cache: the homepage renders these and is `swr: 3600`, so the write has to
 * drop the cached HTML or the review shows up an hour late. That is done by the
 * afterResponse hook in server/plugins/02-invalidate-catalog-cache.ts, which
 * matches this path — deliberately not here, so it cannot delay or fail the
 * write itself.
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event);
  const userId = session.user.id;

  const body = await readBody(event);

  const orderItemId = Number(body?.orderItemId);
  if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Chybí položka objednávky' });
  }

  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Vyber hodnocení 1–5 hvězdiček' });
  }

  // The homepage wall is made of text, so a rating with no words would render as
  // an empty card. The comment is required here (the old product-page form had
  // it optional).
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
  if (comment.length < REVIEW_COMMENT_MIN) {
    throw createError({ statusCode: 400, statusMessage: 'Napiš prosím pár slov o produktu' });
  }
  if (comment.length > REVIEW_COMMENT_MAX) {
    throw createError({ statusCode: 400, statusMessage: 'Recenze je příliš dlouhá' });
  }

  // Scoped to the caller's own orders — a stranger's line and a non-existent
  // line both come back empty, and neither confirms the other exists.
  const [line] = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      title: orderItems.title,
      orderStatus: orders.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.id, orderItemId), eq(orders.userId, userId)))
    .limit(1);

  if (!line) {
    throw createError({ statusCode: 404, statusMessage: 'Položka objednávky nenalezena' });
  }

  if (!isReviewableStatus(line.orderStatus)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Recenzi můžeš napsat, až bude objednávka vyřízená.',
    });
  }

  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.orderItemId, orderItemId))
    .limit(1);

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Tuhle položku už jsi ohodnotil(a).' });
  }

  try {
    const [row] = await db
      .insert(reviews)
      .values({
        orderItemId,
        productId: line.productId,
        // Snapshot: the order line already stores the name the customer bought
        // it under, and it survives the product being deleted.
        productTitle: line.title,
        userId,
        userName: session.user.name?.trim() || 'Zákazník',
        rating,
        comment,
      })
      .returning();

    return row;
  } catch (err: any) {
    // 23505 = unique_violation on reviews_order_item_id_unique_idx: two submits
    // crossed in flight. Same answer as the pre-check.
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Tuhle položku už jsi ohodnotil(a).' });
    }
    throw err;
  }
});
