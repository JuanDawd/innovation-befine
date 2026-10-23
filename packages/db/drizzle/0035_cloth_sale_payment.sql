ALTER TABLE "cloth_sales" ADD COLUMN "payment_method" "payment_method_enum";--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_idempotency_key_unique" UNIQUE("idempotency_key");