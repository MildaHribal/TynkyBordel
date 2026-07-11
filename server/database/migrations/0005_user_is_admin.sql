-- Simple boolean admin flag. Flip is_admin=true in the DB to grant admin access.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;

-- Preserve any existing text-role admins so nobody loses access on upgrade.
UPDATE "user" SET "is_admin" = true WHERE "role" = 'admin';
