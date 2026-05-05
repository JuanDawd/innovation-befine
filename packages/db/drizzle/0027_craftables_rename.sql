-- Task 3.1: Rename cloth_batches → craftables, batch_pieces → craftable_pieces
-- Task 3.2: Add quantity column to craftable_pieces
-- Task 3.3: Add per-piece note columns to craftable_pieces
-- Task 3.4: Add auto_approved flag and source enum to craftables

-- 1. Rename the batch_piece_status_enum
--> statement-breakpoint
ALTER TYPE "batch_piece_status_enum" RENAME TO "craftable_piece_status_enum";

-- 2. Rename claim_source_enum (scoped to craftables domain)
--> statement-breakpoint
ALTER TYPE "claim_source_enum" RENAME TO "craftable_claim_source_enum";

-- 3. Rename cloth_batches → craftables
--> statement-breakpoint
ALTER TABLE "cloth_batches" RENAME TO "craftables";

-- 4. Rename batch_pieces → craftable_pieces
--> statement-breakpoint
ALTER TABLE "batch_pieces" RENAME TO "craftable_pieces";

-- 5. Rename batch_id column → craftable_id
--> statement-breakpoint
ALTER TABLE "craftable_pieces" RENAME COLUMN "batch_id" TO "craftable_id";

-- 6. Rename FKs on craftables
--> statement-breakpoint
ALTER TABLE "craftables"
  RENAME CONSTRAINT "cloth_batches_business_day_id_business_days_id_fk"
  TO "craftables_business_day_id_business_days_id_fk";
--> statement-breakpoint
ALTER TABLE "craftables"
  RENAME CONSTRAINT "cloth_batches_created_by_employees_id_fk"
  TO "craftables_created_by_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "craftables"
  RENAME CONSTRAINT "cloth_batches_large_order_id_large_orders_id_fk"
  TO "craftables_large_order_id_large_orders_id_fk";

-- 7. Rename FKs on craftable_pieces
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_batch_id_cloth_batches_id_fk"
  TO "craftable_pieces_craftable_id_craftables_id_fk";
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_cloth_piece_id_cloth_pieces_id_fk"
  TO "craftable_pieces_cloth_piece_id_cloth_pieces_id_fk";
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_cloth_piece_variant_id_cloth_piece_variants_id_fk"
  TO "craftable_pieces_cloth_piece_variant_id_cloth_piece_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_assigned_to_employee_id_employees_id_fk"
  TO "craftable_pieces_assigned_to_employee_id_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_approved_by_employees_id_fk"
  TO "craftable_pieces_approved_by_employees_id_fk";
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  RENAME CONSTRAINT "batch_pieces_sold_by_employees_id_fk"
  TO "craftable_pieces_sold_by_employees_id_fk";

-- 8. Rename indexes on craftable_pieces
--> statement-breakpoint
ALTER INDEX "idx_batch_pieces_employee_status" RENAME TO "idx_craftable_pieces_employee_status";
--> statement-breakpoint
ALTER INDEX "idx_batch_pieces_batch_id" RENAME TO "idx_craftable_pieces_craftable_id";
--> statement-breakpoint
ALTER INDEX "idx_batch_pieces_sold_at" RENAME TO "idx_craftable_pieces_sold_at";

-- 9. Rename payout_batch_pieces → payout_craftable_pieces and its FK + index
--> statement-breakpoint
ALTER TABLE "payout_batch_pieces" RENAME TO "payout_craftable_pieces";
--> statement-breakpoint
ALTER TABLE "payout_craftable_pieces"
  RENAME COLUMN "batch_piece_id" TO "craftable_piece_id";
--> statement-breakpoint
ALTER TABLE "payout_craftable_pieces"
  RENAME CONSTRAINT "payout_batch_pieces_payout_id_payouts_id_fk"
  TO "payout_craftable_pieces_payout_id_payouts_id_fk";
--> statement-breakpoint
ALTER TABLE "payout_craftable_pieces"
  RENAME CONSTRAINT "payout_batch_pieces_batch_piece_id_batch_pieces_id_fk"
  TO "payout_craftable_pieces_craftable_piece_id_craftable_pieces_id_fk";
--> statement-breakpoint
ALTER INDEX "idx_payout_batch_pieces_payout" RENAME TO "idx_payout_craftable_pieces_payout";

-- === Task 3.2: Add quantity to craftable_pieces ===
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  ADD COLUMN "quantity" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  ADD CONSTRAINT "chk_craftable_pieces_quantity" CHECK ("quantity" >= 1);

-- === Task 3.3: Add per-piece note columns to craftable_pieces ===
--> statement-breakpoint
ALTER TABLE "craftable_pieces"
  ADD COLUMN "color" varchar(80),
  ADD COLUMN "style" varchar(80),
  ADD COLUMN "size" varchar(40),
  ADD COLUMN "instructions" text;

-- === Task 3.4: Add source enum and auto_approved to craftables ===
--> statement-breakpoint
CREATE TYPE "craftable_source_enum" AS ENUM ('manual', 'large_order');
--> statement-breakpoint
ALTER TABLE "craftables"
  ADD COLUMN "source" "craftable_source_enum" NOT NULL DEFAULT 'manual',
  ADD COLUMN "auto_approved" boolean NOT NULL DEFAULT false;
