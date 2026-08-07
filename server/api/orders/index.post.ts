import { getOptionalSession } from '../../utils/session';
import { sendOrderStatusEmail, sendNewOrderNotification, type BankTransferBlock } from '../../utils/email';
import { buildSpayd, getBankAccount, spaydToDataUrl, spaydToBuffer } from '../../utils/spayd';
import { persistOrder } from '../../utils/createOrder';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const session = await getOptionalSession(event);

  // Card orders MUST come through the PayPal capture flow, which only persists
  // an order once the money has actually been captured and verified. Accepting
  // "card" here would let anyone create an order marked as a card payment
  // without paying anything.
  if (body?.paymentMethod === 'card') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Platbu kartou dokonči prosím přes platební tlačítko.',
    });
  }

  // Validate, re-price and persist (shared with the PayPal flow).
  const { order: newOrder, items: orderItemsData, totalPrice } = await persistOrder(body, {
    userId: session?.user?.id ?? null,
  });

  // Bank transfer: generate SPAYD + QR + bank info to return + include in email.
  let bank: BankTransferBlock | undefined;
  if (body.paymentMethod === 'bank-transfer') {
    const { iban, localFormat } = getBankAccount();
    if (iban) {
      const variableSymbol = newOrder.variableSymbol || String(newOrder.id);
      const spayd = buildSpayd({
        amount: totalPrice,
        variableSymbol,
        message: `Objednavka ${newOrder.orderNumber || newOrder.id}`,
      });
      // data: URL for the browser confirmation, PNG buffer for the email (CID).
      const [qrDataUrl, qrBuffer] = await Promise.all([
        spaydToDataUrl(spayd),
        spaydToBuffer(spayd),
      ]);
      bank = {
        iban,
        accountNumber: localFormat || null,
        amount: totalPrice,
        variableSymbol,
        qrDataUrl,
        qrBuffer,
      };
    }
  }

  // Fire-and-forget confirmation email so we don't hang the response on SMTP.
  sendOrderStatusEmail(
    {
      id: newOrder.orderNumber || newOrder.id,
      customerName: newOrder.customerName,
      customerEmail: newOrder.customerEmail,
      totalPrice: newOrder.totalPrice,
      shippingAddress: newOrder.shippingAddress,
      paymentMethod: newOrder.paymentMethod,
      variableSymbol: newOrder.variableSymbol,
      items: orderItemsData.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
    },
    'created',
    bank,
  ).catch((err) => console.error('[orders] created email failed:', err));

  // Tell the shop an order landed — otherwise the only way to notice is to open
  // /admin/orders. Also fire-and-forget so SMTP never delays the customer.
  sendNewOrderNotification({
    orderNumber: newOrder.orderNumber || String(newOrder.id),
    customerName: newOrder.customerName,
    customerEmail: newOrder.customerEmail,
    customerPhone: newOrder.customerPhone,
    shippingAddress: newOrder.shippingAddress,
    paymentMethod: newOrder.paymentMethod,
    paymentStatus: newOrder.paymentStatus,
    totalPrice: newOrder.totalPrice,
    variableSymbol: newOrder.variableSymbol,
    items: orderItemsData.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })),
  }).catch((err) => console.error('[orders] shop notification failed:', err));

  return {
    success: true,
    orderId: newOrder.id,
    orderNumber: newOrder.orderNumber || String(newOrder.id),
    paymentMethod: body.paymentMethod,
    // Only echo bank details for bank-transfer so the client can render the QR immediately.
    bank: bank
      ? {
          iban: bank.iban,
          accountNumber: bank.accountNumber,
          holder: getBankAccount().holder,
          amount: bank.amount,
          variableSymbol: bank.variableSymbol,
          qrDataUrl: bank.qrDataUrl,
        }
      : null,
  };
});
