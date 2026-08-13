import { and, eq } from 'drizzle-orm';
import { db } from '../../../../utils/db';
import { fakturoidSubjects, invoices, orderItems, orders } from '../../../../database/schema';
import { requireAdmin } from '../../../../utils/session';
import { sendInvoiceEmail } from '../../../../utils/email';
import {
  createInvoice,
  downloadInvoicePdf,
  fakturoidConfigured,
  findOrCreateSubject,
  normaliseEmail,
  type InvoiceLine,
} from '../../../../utils/fakturoid';
import { COD_FEE, SHIPPING_FEE } from '../../../../../shared/shop';

/**
 * POST /api/admin/orders/:id/issue-invoice — issue the order's invoice in
 * Fakturoid and archive the resulting PDF.
 *
 * Invoices are NEVER issued automatically at checkout: the confirmation e-mail
 * only carries a payment request. An admin issues the document explicitly, and
 * this endpoint is what that button calls.
 *
 * ── Order of operations (this is the whole design) ──────────────────────────
 *  1. INSERT a `pending` row for the order with
 *     `.onConflictDoNothing({ target: invoices.orderId })`.
 *  2. If nothing came back, another request already owns this order:
 *       - `issued` / `pending` → return that row, do nothing else.
 *       - `failed`             → flip it back to `pending` (conditionally, so
 *                                only one retrier wins) and continue.
 *  3. ONLY THEN talk to Fakturoid.
 *  4. Any failure sets the row to `failed` with the message in `invoices.error`.
 *
 * Idempotency comes from the UNIQUE INDEX `invoices_order_id_unique_idx`, not
 * from an application-level "is this order already invoiced?" read. That read
 * is not atomic: two clicks arriving together would both see "no invoice yet"
 * and both create one in Fakturoid — and an invoice, once issued, cannot simply
 * be deleted. The database is the arbiter; the loser of the INSERT race gets
 * zero rows back and returns the winner's state.
 */

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * Kč (as stored) → integer haléře.
 *
 * `products.price`, `orders.total_price` and `order_items.price` are
 * `double precision`, i.e. binary floats. `249.9 * 100` is
 * `24989.999999999996`, so a bare `* 100` would truncate to 24989 (249,89 Kč)
 * and every invoice would be a haléř short of the amount actually charged.
 * `Math.round` at this one boundary is what stops that; everything downstream
 * (the line sum check, `halereToDecimalString`) is integer arithmetic.
 *
 * Migrating those columns to integers is a separate, deliberate change — this
 * endpoint only defends itself at the boundary.
 */
function czkToHalere(czk: number): number {
  if (typeof czk !== 'number' || !Number.isFinite(czk)) {
    throw createError({
      statusCode: 500,
      statusMessage: `Neplatná částka v objednávce (${czk}).`,
    });
  }
  return Math.round(czk * 100);
}

// ─── Payment method ─────────────────────────────────────────────────────────

/**
 * Order payment method → Fakturoid `payment_method`.
 *
 * The shop stores `cash` (dobírka) / `bank-transfer` / `card`. Fakturoid is
 * told `cod` or `bank`; a card (PayPal) order — the method is currently
 * switched off shop-wide, see CARD_PAYMENT_ENABLED — is invoiced as `bank`,
 * because the money did arrive by transfer as far as the document is
 * concerned, and `cod` would wrongly tell the customer to pay the courier.
 */
function fakturoidPaymentMethod(orderPaymentMethod: string | null): 'bank' | 'cod' {
  return orderPaymentMethod === 'cash' ? 'cod' : 'bank';
}

// ─── Address ────────────────────────────────────────────────────────────────

/**
 * Best-effort split of `orders.shipping_address` into street / zip / city.
 *
 * The column is a single pipe-joined string assembled at checkout, roughly:
 *   "Z-BOX Plzeň | Kurzova 16 | 155 00 Praha | Tel: +420… | Doprava: Zásilkovna"
 *
 * Only the parts that can be recognised with confidence are returned — a wrong
 * address on an accounting document is worse than a missing one, and Fakturoid
 * only requires the subject's name.
 */
function parseShippingAddress(raw: string | null): { street?: string; city?: string; zip?: string } {
  if (!raw) return {};

  const segments = raw
    .split('|')
    .map(s => s.trim())
    .filter(s => s && !/^(tel:|doprava:)/i.test(s));

  const result: { street?: string; city?: string; zip?: string } = {};

  for (const segment of segments) {
    // Czech postcode: "155 00 Praha 13" / "15500 Praha 13".
    const zipMatch = segment.match(/^(\d{3}\s?\d{2})\s+(.+)$/);
    if (zipMatch && !result.zip) {
      result.zip = zipMatch[1];
      result.city = zipMatch[2];
      continue;
    }
    // First non-postcode, non-pickup-point segment containing a digit is the
    // street ("Kurzova 2222/16"). Pickup-point names rarely carry one.
    if (!result.street && /\d/.test(segment)) {
      result.street = segment;
    }
  }

  return result;
}

// ─── Storage key ────────────────────────────────────────────────────────────

/**
 * Archive key for the issued PDF.
 *
 * Invoice numbers are usually "2026-0001", but a numbering scheme with a slash
 * would carve out an unintended directory in the fs driver, so the number is
 * reduced to a safe basename. Falls back to the Fakturoid id if the API ever
 * returns an invoice without a number.
 */
function pdfStorageKey(number: string | null | undefined, fakturoidId: number): string {
  const base = (number ?? '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `invoices/${base || `id-${fakturoidId}`}.pdf`;
}

// ─── Response ───────────────────────────────────────────────────────────────

type InvoiceRow = typeof invoices.$inferSelect;

/** Everything the admin UI needs to render this order's invoice state. */
function toResponse(row: InvoiceRow, alreadyExisted: boolean) {
  return {
    orderId: row.orderId,
    invoiceId: row.id,
    status: row.status,
    number: row.number,
    fakturoidId: row.fakturoidId,
    pdfKey: row.pdfKey,
    sentAt: row.sentAt,
    error: row.error,
    /** True when this call did not issue anything — the invoice already existed. */
    alreadyExisted,
  };
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const orderId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'ID objednávky je povinné' });
  }

  // Checked before the row is claimed: with no credentials the call can never
  // succeed, and leaving a `failed` row behind for a misconfiguration would
  // only add noise to the admin list.
  if (!fakturoidConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Fakturoid není nakonfigurován (chybí přihlašovací údaje).',
    });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Objednávka nenalezena' });
  }
  if (!order.customerEmail) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Objednávka nemá e-mail zákazníka, fakturu nelze vystavit.',
    });
  }

  // ── 1. Claim the order ────────────────────────────────────────────────────
  const [claimed] = await db
    .insert(invoices)
    .values({ orderId, status: 'pending' })
    .onConflictDoNothing({ target: invoices.orderId })
    .returning();

  let invoiceRow: InvoiceRow;

  if (claimed) {
    invoiceRow = claimed;
  } else {
    // ── 2. Somebody else owns the row ───────────────────────────────────────
    const [existing] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, orderId))
      .limit(1);

    if (!existing) {
      // The conflicting row vanished between the INSERT and this SELECT
      // (a delete, essentially). Nothing sane to do but ask for a retry.
      throw createError({
        statusCode: 409,
        statusMessage: 'Faktura se právě mění jinde. Zkus to prosím znovu.',
      });
    }

    if (existing.status === 'issued' || existing.status === 'pending') {
      // Already issued, or another request is issuing it right now. Either way
      // this call must NOT produce a second invoice.
      return toResponse(existing, true);
    }

    // `failed` → retry path. The status guard makes the takeover atomic, so
    // two admins retrying at the same moment still yield one Fakturoid call.
    const [reopened] = await db
      .update(invoices)
      .set({ status: 'pending', error: null })
      .where(and(eq(invoices.id, existing.id), eq(invoices.status, 'failed')))
      .returning();

    if (!reopened) {
      const [current] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.orderId, orderId))
        .limit(1);
      return toResponse(current ?? existing, true);
    }

    invoiceRow = reopened;
  }

  // From here on the row is ours and is `pending`; every exit path must either
  // mark it `issued` or mark it `failed`.
  try {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Objednávka nemá žádné položky, fakturu nelze vystavit.',
      });
    }

    // ── Lines ───────────────────────────────────────────────────────────────
    // One line per ordered item, then shipping, then the COD surcharge — the
    // same three components `quoteOrder`/`persistOrder` used to build
    // `orders.total_price`. Fees come from shared/shop.ts, never hardcoded.
    const isCod = order.paymentMethod === 'cash';
    const lines: InvoiceLine[] = items.map(item => ({
      name: item.title,
      quantity: item.quantity,
      unitPriceHalere: czkToHalere(item.price),
    }));

    lines.push({
      name: 'Doprava',
      quantity: 1,
      unitPriceHalere: czkToHalere(SHIPPING_FEE),
    });

    if (isCod) {
      lines.push({
        name: 'Dobírka',
        quantity: 1,
        unitPriceHalere: czkToHalere(COD_FEE),
      });
    }

    // ── The one check that must never be skipped ────────────────────────────
    // The invoice and the amount the customer was actually asked to pay (the
    // QR code / COD amount) must agree to the haléř. They are computed from
    // the same data but at different times: if the shipping fee or the COD
    // surcharge in shared/shop.ts changes after an order is placed, this sum
    // silently drifts away from the stored total. Fail loudly instead —
    // issuing an invoice for a different amount than was charged is an
    // accounting problem, not a display glitch.
    const linesTotal = lines.reduce((sum, l) => sum + l.unitPriceHalere * l.quantity, 0);
    const orderTotal = czkToHalere(order.totalPrice);
    if (linesTotal !== orderTotal) {
      throw createError({
        statusCode: 422,
        statusMessage:
          `Součet položek faktury (${(linesTotal / 100).toFixed(2)} Kč) neodpovídá `
          + `ceně objednávky (${(orderTotal / 100).toFixed(2)} Kč). Faktura nebyla vystavena.`,
      });
    }

    // ── Subject (odběratel) ─────────────────────────────────────────────────
    // Normalised on both sides: the `fakturoid_subjects` unique index is a
    // plain btree, so Jan@Example.cz and jan@example.cz would otherwise get two
    // rows and two duplicate subjects in Fakturoid.
    const email = normaliseEmail(order.customerEmail);
    const address = parseShippingAddress(order.shippingAddress);
    const subjectInput = {
      email,
      name: order.customerName,
      street: address.street ?? null,
      city: address.city ?? null,
      zip: address.zip ?? null,
      phone: order.customerPhone,
    };

    const [cachedSubject] = await db
      .select()
      .from(fakturoidSubjects)
      .where(eq(fakturoidSubjects.email, email))
      .limit(1);

    let subjectId = cachedSubject?.fakturoidId ?? (await findOrCreateSubject(subjectInput));

    // ── Invoice ─────────────────────────────────────────────────────────────
    // The variable symbol is the one the customer was actually given: the
    // bank-transfer VS from the confirmation e-mail and the QR code
    // (`orders.variable_symbol`, falling back to the id exactly as
    // /api/orders does). The human-facing order number goes in the note, so
    // the document still points back at the order.
    const variableSymbol = order.variableSymbol || String(order.id);
    const noteParts = [`Objednávka č. ${order.orderNumber || order.id}`];
    if (order.paidAt) {
      noteParts.push(`Uhrazeno ${order.paidAt.toLocaleDateString('cs-CZ')}`);
    }

    const invoicePayload = {
      subjectId,
      variableSymbol,
      paymentMethod: fakturoidPaymentMethod(order.paymentMethod),
      lines,
      note: noteParts.join(' · '),
    };

    let created;
    try {
      created = await createInvoice(invoicePayload);
    } catch (err) {
      // A cached subject id can go stale — the subject may have been deleted
      // in Fakturoid, which surfaces here as a 422 on subject_id. Drop the
      // cache entry, re-resolve against Fakturoid (the source of truth) and
      // try once more, so a stale row can't wedge this order permanently.
      if (!cachedSubject) throw err;
      await db.delete(fakturoidSubjects).where(eq(fakturoidSubjects.email, email));
      subjectId = await findOrCreateSubject(subjectInput);
      created = await createInvoice({ ...invoicePayload, subjectId });
    }

    // Cache the subject only once an invoice has actually been accepted for it.
    await db
      .insert(fakturoidSubjects)
      .values({ email, fakturoidId: subjectId })
      .onConflictDoUpdate({
        target: fakturoidSubjects.email,
        set: { fakturoidId: subjectId, updatedAt: new Date() },
      });

    // ── PDF archive ─────────────────────────────────────────────────────────
    // The archived file is the invoice. It is never re-rendered from current
    // data: prices, the seller's address and this code will all change, and a
    // document re-generated in 2031 would no longer match the one the customer
    // received. `downloadInvoicePdf` retries Fakturoid's 204-while-rendering
    // and throws rather than ever handing back an empty buffer.
    const pdf = await downloadInvoicePdf(created.id);
    const pdfKey = pdfStorageKey(created.number, created.id);
    await useStorage().setItemRaw(pdfKey, pdf);

    // Marked `issued` only now — after the PDF is safely stored. If the
    // download failed, the row stays `failed` and the admin can retry; the
    // retry finds the invoice already in Fakturoid only via a new call, which
    // is the known cost of keeping "issued" honest.
    const [issued] = await db
      .update(invoices)
      .set({
        status: 'issued',
        fakturoidId: created.id,
        number: created.number,
        pdfKey,
        error: null,
      })
      .where(eq(invoices.id, invoiceRow.id))
      .returning();

    // ── E-mail the invoice to the customer ──────────────────────────────────
    // Here and nowhere earlier: after the PDF is stored and the row is
    // `issued`, and outside any transaction. A bounced e-mail must never roll
    // back an invoice Fakturoid has already issued and numbered, so a failure
    // only logs and leaves the invoice `issued` — the admin can resend by
    // downloading the archived PDF.
    //
    // The mailed file is the archived buffer, not a re-download: the customer
    // must receive exactly the document that is on record.
    let sentAt: Date | null = null;
    try {
      const sent = await sendInvoiceEmail({
        to: email,
        customerName: order.customerName,
        orderNumber: String(order.orderNumber || order.id),
        invoiceNumber: created.number ?? null,
        pdf,
      });
      if (sent) {
        sentAt = new Date();
        await db.update(invoices).set({ sentAt }).where(eq(invoices.id, invoiceRow.id));
      } else {
        // sendMail already logged why (no SMTP configured, or the send failed).
        console.warn(`[invoice] ${created.number ?? created.id} not e-mailed to ${email} — see the [mail] line above.`);
      }
    } catch (err) {
      console.error(`[invoice] e-mailing ${created.number ?? created.id} to ${email} failed:`, err);
    }

    return toResponse(sentAt && issued ? { ...issued, sentAt } : (issued ?? invoiceRow), false);
  } catch (err: any) {
    // ── 4. Record the failure on the row we own ─────────────────────────────
    const message = String(
      err?.statusMessage || err?.message || 'Neznámá chyba při vystavování faktury',
    ).slice(0, 2000);

    const [failed] = await db
      .update(invoices)
      .set({ status: 'failed', error: message })
      .where(eq(invoices.id, invoiceRow.id))
      .returning();

    console.error(`[invoice] order ${orderId} failed:`, err);

    throw createError({
      statusCode: err?.statusCode && err.statusCode >= 400 ? err.statusCode : 502,
      statusMessage: message,
      data: toResponse(failed ?? { ...invoiceRow, status: 'failed', error: message }, false),
    });
  }
});
