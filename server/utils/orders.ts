/**
 * Who may cancel an order, and when.
 *
 * Shared by the customer-facing cancel endpoint and the order-history API, so
 * the profile can never offer a button the API would refuse.
 *
 * The obvious rule — "unpaid means cancellable" — is wrong for this shop.
 * Cash on delivery (`dobírka`) stays `unpaid` right through packing, shipping
 * and delivery, so payment status alone would let a customer cancel a parcel
 * that is already with the courier, and the cancellation would put a piece back
 * on sale that has physically left. The order must therefore ALSO still be
 * `pending` — nothing has been dispatched yet.
 *
 * Anything past that point is a conversation with the shop, not a button.
 */
export function isCancellableByCustomer(status: string, paymentStatus: string): boolean {
  return status === 'pending' && paymentStatus === 'unpaid';
}

/** Why the button is not offered — shown to the customer, so keep it plain. */
export function cancelRefusalReason(status: string, paymentStatus: string): string {
  if (status === 'cancelled') return 'Tahle objednávka už je zrušená.';
  if (paymentStatus === 'paid') {
    return 'Objednávka je už zaplacená, takže ji nejde zrušit sama od sebe. Napiš nám a domluvíme se.';
  }
  if (paymentStatus === 'refunded') return 'U téhle objednávky už proběhlo vrácení peněz.';
  return 'Objednávka je už vyřizovaná, takže ji nejde zrušit sama od sebe. Napiš nám a domluvíme se.';
}
