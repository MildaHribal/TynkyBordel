import Stripe from 'stripe';
import { db } from '../utils/db';
import { products, orders, orderItems } from '../database/schema';
import { eq, inArray } from 'drizzle-orm';
import { getOptionalSession } from '../utils/session';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  // Check BEFORE constructing the client: `new Stripe('')` throws, which turned
  // a missing key into an opaque 500 instead of this 503.
  if (!config.stripeSecretKey) {
    throw createError({ statusCode: 503, statusMessage: 'Platební brána není nakonfigurovaná' });
  }
  const stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2026-02-25.clover' });

  const body = await readBody(event);
  const {
    items,
    customerName,
    customerEmail,
    shippingMethod,
    shippingPrice,
    packetaBranchId,
    packetaBranchName,
    phone,
    paymentMethod,
    ...form
  } = body;

  if (!items?.length || !customerEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Chybějící položky v košíku nebo email' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Zadaný email nemá správný formát' });
  }

  // 1. Získání produktů z DB pro ověření ceny
  const productIds = items.map((i: any) => Number(i.id));
  const dbProducts = await db.select().from(products).where(inArray(products.id, productIds));

  const lineItems = items.map((item: any) => {
    const dbProduct = dbProducts.find(p => p.id === Number(item.id));
    if (!dbProduct) throw createError({ statusCode: 404, statusMessage: `Produkt ${item.id} nenalezen` });

    return {
      price_data: {
        currency: 'czk',
        product_data: {
          name: dbProduct.name,
          images: dbProduct.image ? [dbProduct.image.startsWith('http') ? dbProduct.image : `${config.public.siteUrl}/${dbProduct.image}`] : [],
        },
        unit_amount: Math.round(dbProduct.price * 100), // Stripe používá haléře/centy
      },
      quantity: item.quantity || 1,
    };
  });

  // Přidání dopravy jako samostatné položky pokud není zdarma
  if (shippingPrice > 0) {
    lineItems.push({
      price_data: {
        currency: 'czk',
        product_data: { name: `Doprava (${shippingMethod})` },
        unit_amount: Math.round(shippingPrice * 100),
      },
      quantity: 1,
    });
  }

  // 2. Vytvoření "čekající" objednávky v DB
  const sessionUser = await getOptionalSession(event);
  const totalAmount = items.reduce((acc: number, item: any) => {
    const p = dbProducts.find(prod => prod.id === Number(item.id));
    return acc + (p?.price || 0) * (item.quantity || 1);
  }, 0) + (shippingPrice || 0);

  const [newOrder] = await db.insert(orders).values({
    customerName,
    customerEmail,
    customerPhone: phone ?? null,
    shippingAddress: `${form.street}, ${form.zip} ${form.city} | Doprava: ${shippingMethod}`,
    shippingMethod: shippingMethod ?? null,
    paymentMethod: paymentMethod ?? 'card',
    packetaBranchId: packetaBranchId ?? null,
    packetaBranchName: packetaBranchName ?? null,
    totalPrice: totalAmount,
    status: 'pending',
    paymentStatus: 'unpaid',
    userId: sessionUser?.user?.id ?? null,
  }).returning();

  // Uložení položek objednávky
  for (const item of items) {
    const p = dbProducts.find(prod => prod.id === Number(item.id));
    if (p) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        productId: p.id,
        title: p.name,
        price: p.price,
        quantity: item.quantity || 1,
        image: p.image,
      });
    }
  }

  // 3. Vytvoření Stripe Session
  const origin = getRequestHeader(event, 'origin') || config.public.siteUrl;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    customer_email: customerEmail,
    success_url: `${origin}/checkout?success=true&orderId=${newOrder.id}`,
    cancel_url: `${origin}/checkout?cancel=true&orderId=${newOrder.id}`,
    metadata: {
      orderId: newOrder.id.toString(),
    },
  });

  await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, newOrder.id));

  return { url: session.url };
});

