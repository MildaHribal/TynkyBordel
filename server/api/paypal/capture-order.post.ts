import { getOptionalSession } from '../../utils/session';
import { sendOrderStatusEmail, sendNewOrderNotification } from '../../utils/email';
import { capturePaypalOrder, getPaypalOrder, paypalConfigured } from '../../utils/paypal';
import { persistOrder, quoteOrder } from '../../utils/createOrder';

/**
 * Capture an approved PayPal payment, then create the internal order as PAID.
 *
 * The cart is sent again with the capture request, so it MUST be re-priced and
 * cross-checked against what PayPal actually holds — otherwise a buyer could
 * approve a cheap order and then capture it with an expensive cart, getting the
 * expensive goods recorded as fully paid.
 *
 * Order of operations matters:
 *   1. re-price the submitted cart server-side
 *   2. compare with the amount PayPal has approved — mismatch aborts BEFORE any
 *      money moves
 *   3. capture, then re-check the amount actually captured
 *   4. only then persist the order (which also reserves stock)
 */

// PayPal amounts are decimal strings ("1234.00"); compare with a 1 haléř tolerance.
const AMOUNTS_MATCH = (a: number, b: number) => Math.abs(a - b) < 0.01;

export default defineEventHandler(async (event) => {
  if (!paypalConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'Platba kartou není momentálně dostupná.' });
  }

  const body = await readBody(event);
  const paypalOrderId = body?.paypalOrderId;
  if (!paypalOrderId) {
    throw createError({ statusCode: 400, statusMessage: 'Chybí ID PayPal platby' });
  }

  // 1) Re-price the submitted cart. This is the only total we will trust.
  const { totalPrice: expectedTotal } = await quoteOrder(body?.items, 'card');

  // 2) Cross-check against the amount the buyer actually approved at PayPal.
  //    Nothing has been charged yet, so a mismatch here costs the customer nothing.
  const approved = await getPaypalOrder(String(paypalOrderId));
  const approvedUnit = approved?.purchase_units?.[0]?.amount;
  const approvedAmount = Number(approvedUnit?.value);
  const approvedCurrency = approvedUnit?.currency_code;

  if (!Number.isFinite(approvedAmount) || !AMOUNTS_MATCH(approvedAmount, expectedTotal) || approvedCurrency !== 'CZK') {
    console.error(
      `[paypal] amount mismatch BEFORE capture — refusing. paypalOrderId=${paypalOrderId} ` +
        `approved=${approvedUnit?.value} ${approvedCurrency} expected=${expectedTotal.toFixed(2)} CZK`,
    );
    throw createError({
      statusCode: 400,
      statusMessage: 'Obsah košíku se změnil. Načti prosím pokladnu znovu a zkus platbu zopakovat.',
    });
  }

  // 3) Capture the money.
  const capture = await capturePaypalOrder(String(paypalOrderId));
  if (capture?.status !== 'COMPLETED') {
    throw createError({ statusCode: 402, statusMessage: 'Platba nebyla dokončena' });
  }
  const capturedPayment = capture?.purchase_units?.[0]?.payments?.captures?.[0];
  const captureId = capturedPayment?.id || paypalOrderId;

  // Verify what was really captured — the pre-check used the order, this uses
  // the settled payment.
  const capturedAmount = Number(capturedPayment?.amount?.value);
  const capturedCurrency = capturedPayment?.amount?.currency_code;
  if (!Number.isFinite(capturedAmount) || !AMOUNTS_MATCH(capturedAmount, expectedTotal) || capturedCurrency !== 'CZK') {
    console.error(
      `[paypal] CAPTURED WRONG AMOUNT — do not ship, reconcile manually. captureId=${captureId} ` +
        `captured=${capturedPayment?.amount?.value} ${capturedCurrency} expected=${expectedTotal.toFixed(2)} CZK`,
    );
    throw createError({
      statusCode: 500,
      statusMessage:
        'Platba proběhla v nesprávné výši a objednávku jsme neuložili. Napiš nám prosím na info@tynkybordel.shop, vyřešíme to.',
    });
  }

  // 4) Persist the order as paid. Force the card payment method.
  const session = await getOptionalSession(event);
  let result;
  try {
    result = await persistOrder(
      { ...body, paymentMethod: 'card' },
      { userId: session?.user?.id ?? null, paymentStatus: 'paid' },
    );
  } catch (err) {
    console.error(`[paypal] CAPTURED but order persist FAILED — reconcile manually. captureId=${captureId}`, err);
    throw createError({
      statusCode: 500,
      statusMessage: 'Platba proběhla, ale objednávku se nepodařilo uložit. Napiš nám prosím na info@tynkybordel.shop.',
    });
  }

  const { order, items } = result;

  // Belt-and-braces: persistOrder re-prices independently, so a product price
  // edited in the seconds between the quote and the insert would show up here.
  // The customer has paid and the order is real — just make it loud in the log.
  if (!AMOUNTS_MATCH(order.totalPrice, capturedAmount)) {
    console.error(
      `[paypal] order total drifted from captured amount — check manually. captureId=${captureId} ` +
        `orderNumber=${order.orderNumber} captured=${capturedAmount} stored=${order.totalPrice}`,
    );
  }

  // Confirmation email (the "paid" template doubles as the order confirmation).
  sendOrderStatusEmail(
    {
      id: order.orderNumber || order.id,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      totalPrice: order.totalPrice,
      shippingAddress: order.shippingAddress,
      items: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
    },
    'paid',
  ).catch((err) => console.error('[paypal] paid email failed:', err));

  sendNewOrderNotification({
    orderNumber: order.orderNumber || String(order.id),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    totalPrice: order.totalPrice,
    variableSymbol: order.variableSymbol,
    items: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
  }).catch((err) => console.error('[paypal] shop notification failed:', err));

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.orderNumber || String(order.id),
  };
});
