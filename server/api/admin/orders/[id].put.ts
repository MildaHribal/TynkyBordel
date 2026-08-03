import { db } from '../../../utils/db';
import { orders, orderItems } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { sendOrderStatusEmail } from '../../../utils/email';
import { requireAdmin } from '../../../utils/session';
import { releaseStock } from '../../../utils/createOrder';

// 'cancelled' also returns the reserved pieces to stock — see below. Without it
// an unpaid bank-transfer order would hold a one-of-a-kind item forever.
const VALID_STATUSES = ['pending', 'shipped', 'delivered', 'cancelled'] as const;
const VALID_PAYMENTS = ['unpaid', 'paid', 'refunded'] as const;

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody(event);

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID objednávky je povinné' });
  }

  // Status and payment can be updated independently — an order can be marked
  // "zaplaceno" without touching its fulfillment status, and vice versa.
  const hasStatus = body.status !== undefined && body.status !== null;
  const hasPayment = body.paymentStatus !== undefined && body.paymentStatus !== null;

  if (!hasStatus && !hasPayment) {
    throw createError({ statusCode: 400, statusMessage: 'Není co aktualizovat' });
  }
  if (hasStatus && !VALID_STATUSES.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatný stav objednávky' });
  }
  if (hasPayment && !VALID_PAYMENTS.includes(body.paymentStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatný stav platby' });
  }

  // Read current values so we only email on real transitions.
  const existing = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (existing.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nenalezena' });
  }
  const prevStatus = existing[0].status as string;
  const prevPaymentStatus = existing[0].paymentStatus as string;

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (hasStatus) updateData.status = body.status;
  if (hasPayment) updateData.paymentStatus = body.paymentStatus;

  const result = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, id))
    .returning();

  const updated = result[0];
  const newStatus = updated.status as string;

  // Cancelling frees the reserved pieces so they can be sold again. Guarded by
  // the previous status so re-saving a cancelled order can't restock it twice.
  if (hasStatus && newStatus === 'cancelled' && prevStatus !== 'cancelled') {
    const cancelledItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    await releaseStock(
      cancelledItems
        .filter((i) => i.productId != null)
        .map((i) => ({
          productId: i.productId as number,
          title: i.title,
          price: i.price,
          quantity: i.quantity,
          image: i.image,
        })),
    );
  }

  // Load items once if we might send any email.
  const willEmailStatus =
    hasStatus && (newStatus === 'shipped' || newStatus === 'delivered') && prevStatus !== newStatus;
  const willEmailPaid =
    hasPayment && body.paymentStatus === 'paid' && prevPaymentStatus !== 'paid';

  if ((willEmailStatus || willEmailPaid) && updated.customerEmail) {
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    const payload = {
      id: updated.orderNumber || updated.id,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      totalPrice: updated.totalPrice,
      shippingAddress: updated.shippingAddress,
      items: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
    };

    if (willEmailPaid) {
      sendOrderStatusEmail(payload, 'paid').catch((err) =>
        console.error('[orders] paid email failed:', err),
      );
    }
    if (willEmailStatus) {
      sendOrderStatusEmail(payload, newStatus as 'shipped' | 'delivered').catch((err) =>
        console.error('[orders] status email failed:', err),
      );
    }
  }

  return updated;
});
