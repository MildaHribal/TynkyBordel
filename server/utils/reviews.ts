/**
 * Shared rules for customer reviews.
 *
 * Reviews are written from the order history (/user → Moje objednávky), one per
 * purchased line — see server/database/schema.ts and migration 0012. These
 * constants are shared so the UI (which decides whether to offer the form) and
 * the API (which enforces it) can never drift apart.
 */

/**
 * Order states in which the customer may review what they bought.
 *
 * `pending` is excluded: the piece has not been paid for or dispatched yet, so
 * there is nothing to have an opinion about. `cancelled` is excluded for the
 * obvious reason. Everything the admin has moved forward — paid, shipped,
 * delivered — counts as "vyřízená objednávka" and unlocks the form.
 */
export const REVIEWABLE_ORDER_STATUSES = ['paid', 'shipped', 'delivered'] as const;

export function isReviewableStatus(status?: string | null): boolean {
  return !!status && (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

/** Comments are shown in full on the homepage wall, so they stay short. */
export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_COMMENT_MIN = 3;
