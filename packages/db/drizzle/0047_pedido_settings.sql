ALTER TABLE "business_settings" ADD COLUMN "secretary_can_record_pedido_payments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "clothier_claim_limit" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "pay_scrapped_units" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "chk_business_settings_claim_limit" CHECK ("business_settings"."clothier_claim_limit" BETWEEN 1 AND 10000);