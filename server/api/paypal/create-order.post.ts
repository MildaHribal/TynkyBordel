import { createPaypalOrder, paypalConfigured } from '../../utils/paypal';
import { quoteOrder } from '../../utils/createOrder';

/**
 * Create a PayPal order for the current cart. Prices are recomputed server-side
 * from the DB (the client total is never trusted). Returns the PayPal order id
 * for the JS SDK to approve. The internal order is only created AFTER a
 * successful capture (see capture-order.post.ts).
 */
export default defineEventHandler(async (event) => {
  if (!paypalConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Platba kartou není momentálně dostupná.' });
  }

  const body = await readBody(event);

  // Same pricing helper the capture step verifies against, so the amount the
  // buyer approves and the amount we record can never drift apart.
  // Card is prepaid → shipping only, no cash-on-delivery surcharge.
  const { totalPrice } = await quoteOrder(body?.items, 'card');

  if (totalPrice <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatná částka objednávky' });
  }

  const order = await createPaypalOrder(totalPrice, { description: 'Objednávka — Tynky Bordel' });
  return { id: order.id };
});
