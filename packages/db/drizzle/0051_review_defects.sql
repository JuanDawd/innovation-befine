ALTER TABLE "unit_reviews" DROP CONSTRAINT "chk_unit_reviews_reason";--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD COLUMN "return_code" text;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD COLUMN "scrap_code" text;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD COLUMN "scrap_reason" text;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD COLUMN "scrap_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE INDEX "idx_unit_reviews_return_code" ON "unit_reviews" USING btree ("return_code");--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD CONSTRAINT "unit_reviews_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD CONSTRAINT "chk_unit_reviews_reason" CHECK (("unit_reviews"."returned" = 0 OR coalesce("unit_reviews"."return_code", "unit_reviews"."reason") IS NOT NULL)
        AND ("unit_reviews"."scrapped" = 0 OR coalesce("unit_reviews"."scrap_code", "unit_reviews"."scrap_reason", "unit_reviews"."reason") IS NOT NULL));