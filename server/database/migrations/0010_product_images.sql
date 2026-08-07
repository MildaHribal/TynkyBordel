-- Product images move into the database.
--
-- Uploaded files were written to .output/public/uploads and kept disappearing
-- in production: the docker volume meant to persist that directory was not
-- mounted in the running container, so uploads landed in the ephemeral layer
-- and every redeploy erased them. Diagnostics proved it — files shipped in the
-- git repo (part of the image) were on disk, the admin's upload was not.
--
-- Postgres is the one store on this deployment that demonstrably survives
-- redeploys, so the encoded WebP bytes now live here. Volume is low (a few
-- hundred KB per photo, single-digit products) — bytea is a fine fit. The
-- filesystem copy under .output/public/uploads still exists, but only as a
-- cache for IPX, re-materialised from this table on every boot.

CREATE TABLE IF NOT EXISTS "product_images" (
  "file_name"    text PRIMARY KEY,
  "data"         bytea NOT NULL,
  "content_type" text NOT NULL DEFAULT 'image/webp',
  "size"         integer NOT NULL,
  "created_at"   timestamp NOT NULL DEFAULT now()
);
