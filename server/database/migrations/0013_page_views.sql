-- Server-side traffic counting, so the shop owner can see visitor numbers in
-- their own admin.
--
-- Why not just read PostHog: posthog-js is gated behind opt-in cookie consent
-- (analytics is not strictly necessary, so § 89 of the Czech Electronic
-- Communications Act requires consent), which means it only ever counts the
-- visitors who click "accept". Counting here happens on the server from data
-- the request already carries, needs no consent, and therefore covers everyone.
--
-- No personal data is stored. A visitor is distinguished by a hash of
-- (daily-rotating secret salt + IP + user agent) — the IP itself is never
-- written down, and yesterday's hashes cannot be linked to today's because the
-- salt changes with the date. That is the same approach Plausible and Fathom
-- use to stay cookie-free.

-- One row per day per page. Counts are incremented in batches, not per request.
CREATE TABLE IF NOT EXISTS "page_views" (
  "day"   date NOT NULL,
  "path"  text NOT NULL,
  "views" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("day", "path")
);

-- One row per visitor per day; COUNT(*) over a day is the unique-visitor number.
-- Pruned after 90 days by the flusher, so this stays tiny.
CREATE TABLE IF NOT EXISTS "page_view_visitors" (
  "day"  date NOT NULL,
  "hash" text NOT NULL,
  PRIMARY KEY ("day", "hash")
);

CREATE INDEX IF NOT EXISTS "page_views_day_idx" ON "page_views" ("day");
CREATE INDEX IF NOT EXISTS "page_view_visitors_day_idx" ON "page_view_visitors" ("day");
