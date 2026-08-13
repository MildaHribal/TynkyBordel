import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../../../utils/db';
import { orders, orderItems } from '../../../../database/schema';
import { requireSession } from '../../../../utils/session';
import { generateOrderConfirmationPdf } from '../../../../utils/invoice';

/**
 * GET /api/user/orders/:id/invoice — the customer's own copy of the ORDER
 * CONFIRMATION that was attached to their order e-mail, for viewing or
 * downloading from the order history.
 *
 * The path still says "invoice" only because links to it are already in the
 * wild (e-mails, bookmarks, the order history); the document it serves is a
 * potvrzení objednávky and has never been an accounting document. Renaming the
 * route would break those links for no gain.
 *
 * It regenerates the SAME pdfkit document `sendOrderStatusEmail` attaches (see
 * server/utils/email.ts) rather than storing a copy at checkout: the document
 * is a pure function of the order, so there is nothing to keep in sync and no
 * risk of an order having an e-mailed confirmation but no downloadable one. The
 * Fakturoid invoice (server/database/schema.ts `invoices`) is the separate,
 * admin-issued accounting document with its own number series and is
 * deliberately NOT what this serves.
 *
 * `?download=1` sends it as an attachment; otherwise it opens inline in the
 * browser's PDF viewer. Both are same-origin GETs, so the session cookie rides
 * along automatically when the link is opened.
 */
export default defineEventHandler(async (event) => {
  const session = await requireSession(event);

  const orderId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatné ID objednávky' });
  }

  // Scope the lookup to the caller's own orders. A stranger's id and a
  // non-existent id both return 404 — never confirm that someone else's order
  // exists.
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, session.user.id)))
    .limit(1);

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nenalezena' });
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id));

  if (items.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nemá žádné položky' });
  }

  // Built exactly like the e-mail attachment so the two documents match. The
  // number and date mirror what the customer already received: the document
  // number is the order number, and the date is when the order was placed rather
  // than "now", so re-opening it doesn't re-date the document.
  const pdf = await generateOrderConfirmationPdf({
    // The customer-facing number, same as the e-mailed document's `č. …` — the
    // bare DB id would make the two copies of one confirmation disagree.
    number: order.orderNumber || order.id,
    issuedAt: order.createdAt ?? new Date(),
    customerName: order.customerName,
    customerAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    variableSymbol: order.variableSymbol,
    items: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
    total: order.totalPrice,
    paid: order.paymentStatus === 'paid',
  });

  const download = String(getQuery(event).download ?? '') === '1';
  const filename = `potvrzeni-objednavky-${order.orderNumber || order.id}.pdf`;

  setResponseHeaders(event, {
    'content-type': 'application/pdf',
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    // A customer's own document must never be cached by Cloudflare or a shared proxy.
    'cache-control': 'private, no-store',
    'content-length': pdf.length,
  });

  return pdf;
});
