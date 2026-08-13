-- Double opt-in for the newsletter (GDPR art. 7(1): consent must be provable).
--
-- Until now /api/newsletter wrote nothing but the address, so the list held no
-- evidence of any consent at all — and since nobody had to confirm the address,
-- anyone could subscribe a stranger. Three columns fix that:
--
--   confirmed_at    NULL = an interest nobody has verified yet; never mail it.
--                   Set when the recipient clicks the link in the opt-in email.
--   consent_source  which form the consent came from ('footer-form', …), so a
--                   later complaint can be answered with "given here".
--   consent_ip_hash sha256(BETTER_AUTH_SECRET : ip) — the same one-way scheme
--                   as server/utils/analytics.ts. A raw IP is personal data we
--                   have no reason to keep; the hash still shows the consent
--                   came from a real request. NULL when no IP was available.
--
-- IF NOT EXISTS everywhere: production already has this table with rows in it,
-- and the runner must stay safe to re-run.

ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;
ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "consent_source" text;
ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "consent_ip_hash" text;

-- Rows that predate this migration are treated as confirmed.
--
-- They subscribed themselves through the old form, which is a real (if thinly
-- documented) opt-in — leaving them NULL would silently mean "never mail these
-- people", i.e. throwing the whole existing list away for a formality nobody
-- could have satisfied at the time. created_at is the honest date of that
-- consent, so it becomes confirmed_at. The runner applies each file once (it
-- records applied names), so this cannot later confirm a pending sign-up.
UPDATE "newsletter_subscribers"
SET "confirmed_at" = "created_at"
WHERE "confirmed_at" IS NULL;

UPDATE "newsletter_subscribers"
SET "consent_source" = 'legacy-form'
WHERE "consent_source" IS NULL;
