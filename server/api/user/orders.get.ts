import { db } from '../../utils/db';
import { orders, orderItems, products } from '../../database/schema';
import { eq, desc, asc, inArray } from 'drizzle-orm';
import { requireSession } from '../../utils/session';

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  if (userOrders.length === 0) return [];

  // All items for all of the user's orders in one query (was N+1: one SELECT per
  // order). The LEFT JOIN resolves whether the referenced product is still
  // something the storefront will actually show.
  const rows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      title: orderItems.title,
      price: orderItems.price,
      quantity: orderItems.quantity,
      image: orderItems.image,
      productSlug: products.slug,
      productStock: products.stock,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, userOrders.map((o) => o.id)))
    .orderBy(asc(orderItems.id));

  const itemsByOrder = new Map<number, any[]>();

  for (const { productSlug, productStock, ...item } of rows) {
    // Order items are a snapshot (title/price/image), so they survive the
    // product being sold or deleted — but the storefront hides sold-out
    // products and /api/products/[id] hard-404s on stock 0. This shop sells
    // one-off originals, so that is the common case for anything already
    // ordered. Only hand the profile a link when the product page would
    // genuinely render; otherwise the customer would click a link in their own
    // order history and land on an error screen.
    const isViewable = productSlug !== null && (productStock ?? 0) > 0;

    const list = itemsByOrder.get(item.orderId);
    const entry = {
      ...item,
      // Slug-based URL, same shape the product cards link to. Null = render the
      // snapshot as plain text.
      productUrl: isViewable ? `/product/${productSlug}` : null,
      productAvailable: isViewable,
    };

    if (list) list.push(entry);
    else itemsByOrder.set(item.orderId, [entry]);
  }

  return userOrders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));
});
