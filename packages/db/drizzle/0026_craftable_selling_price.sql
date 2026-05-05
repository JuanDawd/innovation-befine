-- Craftable selling price — adds selling_price to cloth_piece_variants
-- and sold_at / sold_price / sold_by to batch_pieces to record sales.

-- 1. Add selling_price to cloth_piece_variants (nullable — null = not for sale)
--> statement-breakpoint
ALTER TABLE "cloth_piece_variants"
  ADD COLUMN "selling_price" bigint,
  ADD CONSTRAINT "chk_cloth_piece_variants_selling_price"
    CHECK ("selling_price" IS NULL OR "selling_price" >= 0);

-- 2. Add sale tracking columns to batch_pieces
--> statement-breakpoint
ALTER TABLE "batch_pieces"
  ADD COLUMN "sold_at" timestamp with time zone,
  ADD COLUMN "sold_price" bigint,
  ADD COLUMN "sold_by" uuid;
--> statement-breakpoint
ALTER TABLE "batch_pieces"
  ADD CONSTRAINT "fk_batch_pieces_sold_by"
    FOREIGN KEY ("sold_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;

-- 3. Index for analytics: approved + sold pieces per business day
--> statement-breakpoint
CREATE INDEX "idx_batch_pieces_sold_at" ON "batch_pieces" USING btree ("sold_at") WHERE "sold_at" IS NOT NULL;
