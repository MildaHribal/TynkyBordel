/**
 * How long a sold-out piece stays on the storefront before it disappears.
 *
 * One constant, shared by the catalog query, the product detail endpoint and
 * the admin, so "still visible" can never mean two different things in two
 * places — the classic way a product ends up listed on the homepage while its
 * detail page 404s.
 */
export const SOLD_OUT_VISIBLE_HOURS = 24

/** Postgres interval literal for the same window. */
export const SOLD_OUT_VISIBLE_INTERVAL = `${SOLD_OUT_VISIBLE_HOURS} hours`
