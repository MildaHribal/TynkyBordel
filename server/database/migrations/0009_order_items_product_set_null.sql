-- Let a product be deleted without taking order history with it.
--
-- order_items.product_id referenced products(id) with ON DELETE NO ACTION, and
-- every product in this shop has order_items rows — so deleting ANY product
-- raised a foreign-key violation (23503) and the admin's delete button just
-- failed. Since the shop sells one-off originals that sell out, being unable to
-- remove a product is the normal case, not an edge case.
--
-- SET NULL is safe here because order_items already snapshots what it needs:
-- `title`, `price` and `image` are stored on the row itself (see schema.ts), and
-- product_id was already nullable. After a delete the order still shows exactly
-- what was bought and for how much; only the link to the live product page goes
-- away — which is correct, because that product no longer exists. The profile's
-- order history already renders unlinked items as plain text.
--
-- CASCADE would have been wrong: it would silently delete the customer's order
-- lines, corrupting order totals and accounting records.

DO $$ BEGIN
  ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_id_products_id_fk";
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
