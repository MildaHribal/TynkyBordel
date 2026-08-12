import { eq, and } from 'drizzle-orm';
import { db } from '../../../../utils/db';
import { orders, orderItems } from '../../../../database/schema';
import { requireSession } from '../../../../utils/session';
import { releaseStock } from '../../../../utils/createOrder';
import { sendOrderCancelledNotification } from '../../../../utils/email';
import { cancelRefusalReason, isCancellableByCustomer } from '../../../../utils/orders';

/**
 * The customer cancels their own order from the order history.
 *
 * Scoped to the caller's own orders, so an id belonging to somebody else is not
 * found rather than refused — nothing here confirms that another person's order
 * exists. See server/utils/orders.ts for when this is allowed and why "unpaid"
 * on its own is the wrong test.
 *
 * The pieces go back on sale immediately: this shop sells one-off originals, so
 * a cancelled order holding stock means the piece is invisible to everyone else
 * until someone notices by hand.
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatné číslo objednávky' });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.userId, session.user.id)))
    .limit(1);

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nenalezena' });
  }

  if (!isCancellableByCustomer(order.status, order.paymentStatus)) {
    throw createError({
      statusCode: 409,
      statusMessage: cancelRefusalReason(order.status, order.paymentStatus),
    });
  }

  // Conditional update: the WHERE still carries the pending/unpaid test, so two
  // clicks racing each other cannot both restock the same order. The loser
  // updates nothing and is told the order is already cancelled.
  const updated = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.status, 'pending'), eq(orders.paymentStatus, 'unpaid')))
    .returning();

  if (updated.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Tahle objednávka už je zrušená.' });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  await releaseStock(
    items
      .filter((i) => i.productId != null)
      .map((i) => ({
        productId: i.productId as number,
        title: i.title,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
      })),
  );

  // Fire-and-forget: the cancellation is already saved, and the customer must
  // not wait on SMTP to see it confirmed.
  sendOrderCancelledNotification({
    orderNumber: order.orderNumber || String(order.id),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    totalPrice: order.totalPrice,
    items: items.map((i) => ({ title: i.title, quantity: i.quantity })),
  }).catch((err) => console.error('[orders] cancellation notice failed:', err));

  console.log(`[orders] customer cancelled order ${order.orderNumber || id}`);

  return { cancelled: true, orderNumber: order.orderNumber || String(order.id) };
});
