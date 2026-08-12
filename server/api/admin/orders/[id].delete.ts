import { db } from '../../../utils/db';
import { orders, orderItems, invoices } from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../../utils/session';
import { releaseStock } from '../../../utils/createOrder';

/**
 * Permanently delete an order — the way to clear test orders out of production
 * without database access (the VPS is not ours to SSH into).
 *
 * `order_items` and `invoices` are declared ON DELETE CASCADE, so removing the
 * order row takes its children with it. This is destructive and has no undo, so
 * the UI asks for confirmation and this handler refuses the one case that would
 * leave the books inconsistent: an invoice already issued in Fakturoid.
 *
 * Normal cancellations should use PUT status=cancelled instead — that keeps the
 * record and its history.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID objednávky je povinné' });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nenalezena' });
  }

  // An issued invoice is a real accounting document living in Fakturoid. Deleting
  // the order it belongs to would orphan it, so make that a deliberate two-step:
  // cancel it over there first.
  const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, id)).limit(1);
  if (invoice?.status === 'issued') {
    throw createError({
      statusCode: 409,
      statusMessage: `K objednávce je vystavená faktura ${invoice.number ?? ''}`.trim() +
        '. Nejdřív ji stornuj ve Fakturoidu, pak objednávku smaž.',
    });
  }

  // Return the reserved pieces — unless the order was already cancelled, which
  // restocked them once already (same guard as the status update).
  let restocked = 0;
  if (order.status !== 'cancelled') {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const restockable = items
      .filter((i) => i.productId != null)
      .map((i) => ({
        productId: i.productId as number,
        title: i.title,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
      }));
    if (restockable.length) {
      await releaseStock(restockable);
      restocked = restockable.reduce((sum, i) => sum + i.quantity, 0);
    }
  }

  await db.delete(orders).where(eq(orders.id, id));

  console.log(`[orders] admin deleted order ${order.orderNumber || id} (${order.customerEmail}), restocked ${restocked} pcs`);

  return { deleted: true, orderNumber: order.orderNumber || String(id), restocked };
});
