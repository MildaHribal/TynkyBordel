-- Randomized product number so the storefront/admin don't expose the sequential
-- serial id (which leaks how many products exist and the order they were added).
-- Mirrors the randomized order_number added in 0004.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_number" text;

-- Backfill existing rows with UNIQUE, genuinely-random 8-digit numbers.
DO $$
DECLARE r RECORD; newnum text;
BEGIN
  FOR r IN SELECT id FROM products WHERE product_number IS NULL LOOP
    LOOP
      newnum := LPAD((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE product_number = newnum);
    END LOOP;
    UPDATE products SET product_number = newnum WHERE id = r.id;
  END LOOP;
END $$;

-- Idempotent unique constraint (swallow "already exists" so it can safely re-run).
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_product_number_unique" UNIQUE("product_number");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
