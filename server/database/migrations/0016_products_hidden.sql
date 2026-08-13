-- "Sold" pieces stay on the storefront until the owner takes them down herself.
--
-- 0014 gave them a 24-hour window on the assumption that a sold original should
-- age out on its own. That was wrong for this shop: the wall of sold work is the
-- shop's best advertising, and the owner wants to decide when a piece leaves it —
-- not a timer. The window is gone; visibility is now an explicit choice.
--
-- `hidden` is that choice, and it is deliberately NOT the same as deleting the
-- product: the row keeps its photos, its slug and its link from past orders, it
-- just stops appearing in the shop. Deleting stays available for genuine
-- mistakes.
--
-- Defaults to false, so every existing piece — including the six currently
-- showing as PRODÁNO — keeps its place until someone decides otherwise.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false;

-- The storefront filters on this on every catalog read.
CREATE INDEX IF NOT EXISTS "products_hidden_idx" ON "products" ("hidden");
