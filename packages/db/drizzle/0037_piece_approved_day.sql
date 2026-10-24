ALTER TABLE "craftable_pieces" ADD COLUMN "approved_business_day_id" uuid;--> statement-breakpoint
ALTER TABLE "craftable_pieces" ADD CONSTRAINT "craftable_pieces_approved_business_day_id_business_days_id_fk" FOREIGN KEY ("approved_business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- H-57 backfill: pieces approved before this column existed keep paying on
-- their product's day — the day existing payouts already settled.
UPDATE "craftable_pieces" cp SET "approved_business_day_id" = c."business_day_id"
FROM "craftables" c
WHERE c."id" = cp."craftable_id" AND cp."status" = 'approved';--> statement-breakpoint
CREATE INDEX "idx_craftable_pieces_approved_day" ON "craftable_pieces" USING btree ("assigned_to_employee_id","approved_business_day_id");--> statement-breakpoint
ALTER TABLE "craftable_pieces" ADD CONSTRAINT "chk_craftable_pieces_approved_day" CHECK ("craftable_pieces"."status" <> 'approved' OR "craftable_pieces"."approved_business_day_id" IS NOT NULL);