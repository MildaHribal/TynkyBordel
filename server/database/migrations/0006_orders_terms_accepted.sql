-- Record when the customer accepted the terms + privacy policy at checkout.
-- Kept as a nullable timestamp: orders placed before this column existed simply
-- have no record, and the checkout UI has always required the checkbox.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp;
