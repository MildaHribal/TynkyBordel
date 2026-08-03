import { db } from './db';
import { orders, orderItems, products } from '../database/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { COD_FEE, SHIPPING_FEE } from '../../shared/shop';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Czech / international phone: digits, optional +, spaces, dashes, parens; ≥ 9 digits.
const phoneRegex = /^\+?[\d\s()\-]{9,20}$/;

// Fees come from shared/shop.ts so checkout, the legal pages and the charged
// total can never disagree. Re-exported for existing importers.
export { COD_FEE, SHIPPING_FEE };

export const VALID_PAYMENT_METHODS = new Set(['cash', 'bank-transfer', 'card']);

// Randomized, non-sequential identifiers so IDs don't leak order volume and the
// variable symbol isn't guessable. Order number is 8 digits; VS is 10 (SPAYD max).
const randDigits = (len: number) => {
  let out = String(1 + Math.floor(Math.random() * 9)); // no leading zero
  for (let i = 1; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
};

const shippingLabels: Record<string, string> = {
  'zasilkovna': 'Zásilkovna',
  'ceska-posta': 'Česká pošta',
  'balikovna': 'Balíkovna',
  'osobni': 'Osobní vyzvednutí',
  'packeta-zbox': 'Zásilkovna Z-BOX',
};

export type OrderItemData = {
  productId: number;
  title: string;
  price: number;
  quantity: number;
  image: string | null;
};

// Upper bound per line so a typo/hostile payload can't request 10 000 pieces.
const MAX_QUANTITY_PER_ITEM = 50;

/**
 * Normalize the client cart into `{ id, quantity }` pairs: ids coerced to
 * integers, quantities to positive integers, and duplicate lines merged.
 *
 * Merging matters because stock is reserved per line — two lines with the same
 * product id would otherwise be checked against stock independently and could
 * together oversell. A negative/zero/NaN quantity is rejected outright (a
 * negative one previously SUBTRACTED from the order total).
 */
function normalizeItems(items: any[]): Array<{ id: number; quantity: number }> {
  const merged = new Map<number, number>();

  for (const item of items) {
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Košík obsahuje neplatnou položku' });
    }

    const rawQuantity = item?.quantity ?? 1;
    const quantity = Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Neplatné množství v košíku' });
    }

    merged.set(id, (merged.get(id) ?? 0) + quantity);
  }

  for (const quantity of merged.values()) {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw createError({
        statusCode: 400,
        statusMessage: `Maximálně ${MAX_QUANTITY_PER_ITEM} kusů od jednoho produktu v objednávce`,
      });
    }
  }

  return Array.from(merged, ([id, quantity]) => ({ id, quantity }));
}

/**
 * Price a cart server-side WITHOUT persisting anything or touching stock.
 *
 * Used by the PayPal flow: the amount the buyer is asked to approve, and the
 * amount we later verify was actually captured, both come from here — so the
 * charged amount and the recorded order can never drift apart.
 */
export async function quoteOrder(
  items: any[],
  paymentMethod: string,
): Promise<{ totalPrice: number; items: OrderItemData[] }> {
  if (!items?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Košík je prázdný' });
  }

  const cart = normalizeItems(items);

  let totalPrice = 0;
  const priced: OrderItemData[] = [];

  for (const { id, quantity } of cart) {
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) {
      throw createError({ statusCode: 404, statusMessage: `Produkt s ID ${id} nenalezen` });
    }
    totalPrice += product.price * quantity;
    priced.push({
      productId: product.id,
      title: product.name,
      price: product.price,
      quantity,
      image: product.image,
    });
  }

  totalPrice += SHIPPING_FEE;
  if (paymentMethod === 'cash') totalPrice += COD_FEE;

  return { totalPrice, items: priced };
}

/**
 * Validate a checkout body, re-price it against the DB, and persist the order +
 * items with a randomized order number. Shared by the bank-transfer/COD flow
 * (/api/orders) and the PayPal capture flow so both stay in sync.
 *
 * Prices are ALWAYS recomputed server-side from the DB — the client total is
 * never trusted.
 */
export async function persistOrder(
  body: any,
  opts: { userId?: string | null; paymentStatus?: 'unpaid' | 'paid' } = {},
): Promise<{ order: typeof orders.$inferSelect; items: OrderItemData[]; totalPrice: number }> {
  const {
    customerName, customerEmail, phone, street, city, zip,
    paymentMethod, shippingMethod, packetaBranchId, packetaBranchName, items,
  } = body;

  if (!customerName || !customerEmail || !paymentMethod || !items?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Všechna povinná pole musí být vyplněna' });
  }
  if (!emailRegex.test(customerEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Zadaný email nemá správný formát' });
  }
  if (!phone || !phoneRegex.test(String(phone).trim())) {
    throw createError({ statusCode: 400, statusMessage: 'Zadejte platné telefonní číslo' });
  }
  if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
    throw createError({ statusCode: 400, statusMessage: 'Neplatná platební metoda' });
  }

  const shippingLabel = shippingLabels[shippingMethod] || shippingMethod || 'Neuvedeno';
  const shippingAddress = [
    packetaBranchName || null,
    street || null,
    [zip, city].filter(Boolean).join(' ') || null,
    phone ? `Tel: ${phone}` : null,
    `Doprava: ${shippingLabel}`,
  ].filter(Boolean).join(' | ');

  const cart = normalizeItems(items);
  const paymentStatus = opts.paymentStatus ?? 'unpaid';
  const termsAcceptedAt = body.agreedToTerms === true ? new Date() : null;

  // Everything below runs in ONE transaction: stock reservation, the order row
  // and its items. If any step fails, the reserved stock is released too.
  //
  // The whole transaction is retried on a duplicate order_number — Postgres
  // aborts a transaction after a unique violation, so retrying inside it is not
  // possible. A retry re-runs the stock reservation from scratch, which is safe
  // because the failed attempt was rolled back.
  let outcome: { order: typeof orders.$inferSelect; items: OrderItemData[]; totalPrice: number } | undefined;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      outcome = await db.transaction(async (tx) => {
        // Re-price against the DB and reserve stock in the same statement.
        // The `stock >= quantity` guard makes this atomic: two simultaneous
        // checkouts for the last piece can't both succeed — the loser gets 0
        // rows back. This is what stops one-of-a-kind items being sold twice.
        let totalPrice = 0;
        const orderItemsData: OrderItemData[] = [];

        for (const { id, quantity } of cart) {
          const [reserved] = await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${quantity}`, updatedAt: new Date() })
            .where(and(eq(products.id, id), gte(products.stock, quantity)))
            .returning();

          if (!reserved) {
            // Distinguish "no such product" from "not enough left" so the
            // customer gets a message they can act on.
            const [product] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
            if (!product) {
              throw createError({ statusCode: 404, statusMessage: `Produkt s ID ${id} nenalezen` });
            }
            throw createError({
              statusCode: 409,
              statusMessage:
                product.stock > 0
                  ? `„${product.name}" už je skladem jen ${product.stock}× — uprav prosím množství v košíku.`
                  : `„${product.name}" je bohužel právě vyprodaný — odeber ho prosím z košíku.`,
            });
          }

          totalPrice += reserved.price * quantity;
          orderItemsData.push({
            productId: reserved.id,
            title: reserved.name,
            price: reserved.price,
            quantity,
            image: reserved.image,
          });
        }

        // Flat shipping on every order + cash-on-delivery surcharge for COD only.
        totalPrice += SHIPPING_FEE;
        if (paymentMethod === 'cash') totalPrice += COD_FEE;

        const [newOrder] = await tx.insert(orders).values({
          orderNumber: randDigits(8),
          variableSymbol: randDigits(10),
          customerName,
          customerEmail,
          customerPhone: phone ?? null,
          shippingAddress,
          shippingMethod: shippingMethod ?? null,
          paymentMethod: paymentMethod ?? null,
          packetaBranchId: packetaBranchId ?? null,
          packetaBranchName: packetaBranchName ?? null,
          totalPrice,
          status: 'pending',
          paymentStatus,
          termsAcceptedAt,
          userId: opts.userId ?? undefined,
        }).returning();

        if (!newOrder) {
          throw createError({ statusCode: 500, statusMessage: 'Objednávku se nepodařilo vytvořit' });
        }

        for (const item of orderItemsData) {
          await tx.insert(orderItems).values({
            orderId: newOrder.id,
            productId: item.productId,
            title: item.title,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
          });
        }

        return { order: newOrder, items: orderItemsData, totalPrice };
      });
      break;
    } catch (err: any) {
      if (err?.code === '23505' && attempt < 4) continue; // duplicate order_number
      throw err;
    }
  }

  if (!outcome) {
    throw createError({ statusCode: 500, statusMessage: 'Objednávku se nepodařilo vytvořit' });
  }

  return outcome;
}

/**
 * Put stock back after an order that never became real (e.g. a PayPal payment
 * whose amount didn't check out). Best-effort: failures are logged, never thrown,
 * because the caller is already handling a more important error.
 */
export async function releaseStock(items: OrderItemData[]): Promise<void> {
  for (const item of items) {
    try {
      await db
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
        .where(eq(products.id, item.productId));
    } catch (err) {
      console.error(`[stock] failed to release ${item.quantity}× product ${item.productId}:`, err);
    }
  }
}
