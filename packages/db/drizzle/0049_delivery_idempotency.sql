ALTER TABLE "deliveries" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_idempotency_key_unique" UNIQUE("idempotency_key");