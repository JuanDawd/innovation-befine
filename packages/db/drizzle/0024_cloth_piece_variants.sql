-- Cloth piece variants — garment construction types with their own piece_rate.
-- Backfills existing cloth_pieces into variants named "Estándar".

-- 1. Create cloth_piece_variants table
--> statement-breakpoint
CREATE TABLE "cloth_piece_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloth_piece_id" uuid NOT NULL,
	"name" text NOT NULL,
	"piece_rate" bigint NOT NULL,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "chk_cloth_piece_variants_piece_rate" CHECK ("cloth_piece_variants"."piece_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cloth_piece_variants" ADD CONSTRAINT "fk_cloth_piece_variants_piece" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_cloth_piece_variants_piece" ON "cloth_piece_variants" USING btree ("cloth_piece_id");

-- 2. Backfill: one "Estándar" variant per existing cloth_piece (preserves piece_rate)
--> statement-breakpoint
INSERT INTO "cloth_piece_variants" ("cloth_piece_id", "name", "piece_rate")
SELECT id, 'Estándar', piece_rate FROM "cloth_pieces";

-- 3. Add cloth_piece_variant_id to batch_pieces (nullable first for backfill)
--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD COLUMN "cloth_piece_variant_id" uuid;
--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD CONSTRAINT "fk_batch_pieces_variant" FOREIGN KEY ("cloth_piece_variant_id") REFERENCES "public"."cloth_piece_variants"("id") ON DELETE restrict ON UPDATE no action;

-- 4. Backfill batch_pieces: match via cloth_piece_id → first variant of that piece
--> statement-breakpoint
UPDATE "batch_pieces" bp
SET "cloth_piece_variant_id" = (
	SELECT cpv.id
	FROM "cloth_piece_variants" cpv
	WHERE cpv.cloth_piece_id = bp.cloth_piece_id
	LIMIT 1
);

-- 5. Now enforce NOT NULL
--> statement-breakpoint
ALTER TABLE "batch_pieces" ALTER COLUMN "cloth_piece_variant_id" SET NOT NULL;

-- 6. Drop piece_rate from cloth_pieces (now lives on variants)
--> statement-breakpoint
ALTER TABLE "cloth_pieces" DROP COLUMN "piece_rate";
--> statement-breakpoint
ALTER TABLE "cloth_pieces" DROP CONSTRAINT IF EXISTS "chk_cloth_pieces_piece_rate";
