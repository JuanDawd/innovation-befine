-- T07R-R1 + T07R-R2 + T07R-R17: payout_period_days junction table,
-- idempotency_key on payouts, drop period_business_day_ids array

-- 1. Add idempotency_key to payouts
--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "idempotency_key" uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_idempotency_key_unique" UNIQUE ("idempotency_key");

-- 2. Create payout_period_days junction table
-- UNIQUE(employee_id, business_day_id) is the physical double-pay guard
--> statement-breakpoint
CREATE TABLE "payout_period_days" (
	"payout_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"business_day_id" uuid NOT NULL,
	CONSTRAINT "uq_payout_period_days_employee_day" UNIQUE("employee_id","business_day_id")
);
--> statement-breakpoint
ALTER TABLE "payout_period_days" ADD CONSTRAINT "fk_payout_period_days_payout" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_period_days" ADD CONSTRAINT "fk_payout_period_days_employee" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_period_days" ADD CONSTRAINT "fk_payout_period_days_business_day" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_payout_period_days_payout" ON "payout_period_days" USING btree ("payout_id");
--> statement-breakpoint
CREATE INDEX "idx_payout_period_days_employee" ON "payout_period_days" USING btree ("employee_id");

-- 3. Backfill payout_period_days from existing period_business_day_ids (if any)
-- Safe no-op when table is empty at migration time
--> statement-breakpoint
INSERT INTO "payout_period_days" ("payout_id", "employee_id", "business_day_id")
SELECT p.id, p.employee_id, unnest(p.period_business_day_ids)
FROM payouts p
ON CONFLICT DO NOTHING;

-- 4. Drop period_business_day_ids (now superseded by junction table)
--> statement-breakpoint
ALTER TABLE "payouts" DROP COLUMN "period_business_day_ids";
