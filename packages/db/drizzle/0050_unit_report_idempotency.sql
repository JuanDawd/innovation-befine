ALTER TABLE "unit_reports" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "unit_reports" ADD CONSTRAINT "unit_reports_idempotency_key_unique" UNIQUE("idempotency_key");