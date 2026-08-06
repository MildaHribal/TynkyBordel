import { db } from '../../../utils/db';
import { reviews, orders, orderItems } from '../../../database/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireSession } from '../../../utils/session';

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const userId = session.user?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userName = session.user?.name || 'Anonym'

  const productId = parseInt(event.context.params?.id || '0');
  if (!productId) throw createError({ statusCode: 400 });

  // Verified-purchase gate: only customers who actually ordered this product
  // (in a non-cancelled order) may review it. Stops anyone with an account from
  // spamming ratings on products they never bought.
  const [purchased] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orderItems.productId, productId),
      eq(orders.userId, userId),
      ne(orders.status, 'cancelled'),
    ))
    .limit(1);
  if (!purchased) {
    throw createError({ statusCode: 403, statusMessage: 'Recenzi můžeš přidat až po zakoupení tohoto produktu.' });
  }

  const body = await readBody(event);
  const rating = Number(body?.rating)
  const comment = body?.comment ? String(body.comment).trim() : null
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatné hodnocení' })
  }
  if (comment && comment.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Komentář je příliš dlouhý' })
  }

  const existing = await db.query.reviews.findFirst({
    where: and(eq(reviews.productId, productId), eq(reviews.userId, userId))
  })

  if (existing) {
    const [updated] = await db.update(reviews)
      .set({
        rating,
        comment,
        userName,
      })
      .where(eq(reviews.id, existing.id))
      .returning()
    return updated
  }

  const [row] = await db.insert(reviews)
    .values({
      productId,
      userId,
      userName,
      rating,
      comment
    })
    .returning();

  return row;
});
