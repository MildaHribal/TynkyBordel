-- Reviews move from the product page into the customer's order history.
--
-- This shop sells one-off originals: once a piece is sold, its product page is
-- gone (stock 0 is hidden and /api/products/[id] 404s), so a review form on the
-- product page could only ever be used by someone who had NOT bought the piece.
-- The customer now writes the review from /user → Moje objednávky, on the exact
-- line they bought, and every review is shown together at the bottom of the
-- homepage.
--
-- Three changes, all additive and idempotent:
--
--  1. `order_item_id` — the purchased line the review belongs to. It is both the
--     proof of purchase (the row is only reachable through the buyer's own
--     order) and the "only once" key: a UNIQUE index means one review per bought
--     item. Postgres treats NULLs as distinct in a unique index, so the legacy
--     rows written by the old product-page form (which have no order line) do
--     not collide with each other.
--
--  2. `product_title` — a snapshot of the product name, so a review still says
--     what it is about after the product row is deleted. Same reasoning as the
--     title/price/image snapshot on order_items.
--
--  3. `product_id` becomes nullable with ON DELETE SET NULL instead of CASCADE.
--     Migration 0009 made exactly this change to order_items for exactly this
--     reason: deleting a sold-out original is the normal case here, and it must
--     not silently delete the customer's review off the homepage wall.

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "order_item_id" integer;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "product_title" text;

DO $$ BEGIN
  ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_order_item_id_order_items_id_fk"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "reviews_order_item_id_unique_idx"
  ON "reviews" ("order_item_id");

-- product_id: drop NOT NULL and swap CASCADE for SET NULL.
ALTER TABLE "reviews" ALTER COLUMN "product_id" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_product_id_products_id_fk";
END $$;

DO $$ BEGIN
  ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill the snapshot for rows that already exist, so old reviews render with
-- a product name too. Only fills what is still empty — safe to re-run.
UPDATE "reviews" r
SET "product_title" = p."name"
FROM "products" p
WHERE r."product_id" = p."id" AND r."product_title" IS NULL;
