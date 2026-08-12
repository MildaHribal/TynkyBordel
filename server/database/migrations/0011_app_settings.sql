-- Runtime settings that must be changeable WITHOUT touching the VPS.
--
-- The deploy pipeline is `git push → image build → webhook → container restart`.
-- Everything else about the box — .env.production, docker-compose.prod.yml — is
-- only reachable over SSH, which the shop owner does not have (the VPS belongs to
-- a friend). So when SMTP credentials never made it into the container, there was
-- no way to fix transactional email at all: the code was fine, the env was not,
-- and neither could be corrected from here.
--
-- This table is that missing channel. The mailer reads its config from here first
-- and falls back to the SMTP_* env vars, so email can be configured from
-- /admin/emails/smtp in the browser. Secrets are stored encrypted (AES-256-GCM,
-- key derived from BETTER_AUTH_SECRET) so a database dump in ./backups is not a
-- password leak — see server/utils/settings.ts.

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key"        text PRIMARY KEY,
  "value"      text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
