-- T135 — retire the previous order/product model (spec §4).
--
-- The tables leave the app's schema but are NOT dropped: they move, with their
-- data, indexes, constraints and triggers, into the "archive" schema. Nothing in
-- the app reads them any more (enforced by no-old-model.test.ts); production
-- data stays recoverable until someone checks it and drops the archive schema
-- by hand (DROP SCHEMA archive CASCADE).
--
-- catalog_audit_log was already copied into activity_log by 0046.
CREATE SCHEMA IF NOT EXISTS "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."catalog_audit_log" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."production_logs" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."cloth_piece_assignments" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."payout_craftable_pieces" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."craftable_pieces" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."craftables" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."large_order_payments" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."order_items" SET SCHEMA "archive";--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."large_orders" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."catalog_action" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."catalog_entity_type" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."large_order_status_enum" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."craftable_claim_source_enum" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."craftable_piece_status_enum" SET SCHEMA "archive";--> statement-breakpoint
ALTER TYPE "public"."craftable_source_enum" SET SCHEMA "archive";
