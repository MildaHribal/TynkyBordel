-- Automatic invoicing via Fakturoid (API v3) — storage layer only.
--
-- `invoices`: at most one row per order, created when the admin clicks
-- "Issue invoice" (never at checkout — the order confirmation only carries a
-- payment request + QR code). The UNIQUE INDEX on order_id is what makes
-- issuing idempotent: two concurrent clicks race to INSERT and Postgres
-- rejects the loser. Do NOT replace it with an application-level
-- "already invoiced?" read — that check is not atomic.
--
-- `fakturoid_subjects`: e-mail → Fakturoid subject (odběratel) id, so a repeat
-- buyer does not get a duplicate subject created over there. Keyed on e-mail
-- because most checkouts are guest checkouts — orders.user_id is nullable, and
-- customer_email is the only identity every order carries.
--
-- Seller is a Czech OSVČ and NOT a VAT payer, B2C only, so no VAT columns.
-- No monetary column lives here on purpose: the amount belongs to the order,
-- and Fakturoid is the system of record for the issued document. (Repo rule:
-- any money column must be `integer` in haléře — never float, never numeric.)
--
-- Idempotent: safe to re-run on an already-patched database with live rows.

-- When the payment was confirmed. Payments are not reconciled automatically —
-- the admin checks the bank statement and marks the order paid, which stamps
-- this. Nullable, no backfill: we have no record of when past orders were
-- actually paid, and guessing from updated_at would fabricate accounting data.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" timestamp;

CREATE TABLE IF NOT EXISTS "fakturoid_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"fakturoid_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fakturoid_id" integer,
	"number" text,
	"pdf_key" text,
	"sent_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" IN ('pending', 'issued', 'failed'))
);

-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS; swallow "already exists"
-- so a partially-applied state cannot wedge the boot migration runner.
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- The idempotency guarantee for invoice issuing.
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_order_id_unique_idx" ON "invoices" USING btree ("order_id");

-- The de-duplication guarantee for Fakturoid subjects. Plain (case-sensitive)
-- index: callers must store the e-mail lower-cased and trimmed.
CREATE UNIQUE INDEX IF NOT EXISTS "fakturoid_subjects_email_unique_idx" ON "fakturoid_subjects" USING btree ("email");
