-- Keep a sold piece visible for 24 hours, marked "PRODÁNO".
--
-- This shop sells one-off originals, so the moment something sells it dropped
-- out of the catalog entirely — the shop looked emptier after a good day than
-- after a bad one, and a visitor who saw a piece an hour ago found a dead link.
-- Showing it crossed out for a day is both honest and the best advertising the
-- shop has: it proves things actually sell.
--
-- The timestamp is written by the same statement that reserves stock (see
-- server/utils/createOrder.ts), so it cannot drift from the stock value, and it
-- is cleared whenever stock goes back above zero (cancellation, restock).
-- NULL means "not sold out" — every existing row starts there, which is correct
-- for anything currently in stock and also for pieces sold long ago (they stay
-- hidden, exactly as before).

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sold_out_at" timestamp;

-- The storefront asks "stock = 0 AND sold_out_at > now() - 24h" on every catalog
-- read, so give that predicate an index.
CREATE INDEX IF NOT EXISTS "products_sold_out_at_idx" ON "products" ("sold_out_at");
