-- Backfill sold_out_at for pieces that sold before 0014 added the column.
--
-- 0014 introduced the 24-hour "PRODÁNO" window, but only new sales write the
-- timestamp. Everything sold before the deploy has sold_out_at NULL, which the
-- storefront reads as "sold long ago, hide it" — so the six pieces the shop had
-- just sold vanished exactly as they used to, and the feature looked broken on
-- the only data anyone cared about.
--
-- The sale time is recoverable: it is when the order carrying that piece was
-- placed. Cancelled orders are excluded — those released their stock, so the
-- piece is on sale again and must not be stamped. MAX() picks the most recent
-- sale for anything that sold more than once.
--
-- Only fills NULLs on pieces that are actually out of stock, so re-running is a
-- no-op and nothing already stamped gets its window restarted.

UPDATE "products" p
SET "sold_out_at" = latest.sold_at
FROM (
  SELECT oi."product_id", MAX(o."created_at") AS sold_at
  FROM "order_items" oi
  JOIN "orders" o ON o."id" = oi."order_id"
  WHERE o."status" <> 'cancelled' AND oi."product_id" IS NOT NULL
  GROUP BY oi."product_id"
) AS latest
WHERE p."id" = latest."product_id"
  AND p."stock" <= 0
  AND p."sold_out_at" IS NULL
  AND latest.sold_at IS NOT NULL;
