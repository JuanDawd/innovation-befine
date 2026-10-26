CREATE TABLE "payout_unit_reviews" (
	"payout_id" uuid NOT NULL,
	"unit_review_id" uuid NOT NULL,
	CONSTRAINT "uq_payout_unit_reviews_review" UNIQUE("unit_review_id")
);
--> statement-breakpoint
ALTER TABLE "payout_unit_reviews" ADD CONSTRAINT "payout_unit_reviews_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_unit_reviews" ADD CONSTRAINT "payout_unit_reviews_unit_review_id_unit_reviews_id_fk" FOREIGN KEY ("unit_review_id") REFERENCES "public"."unit_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payout_unit_reviews_payout" ON "payout_unit_reviews" USING btree ("payout_id");