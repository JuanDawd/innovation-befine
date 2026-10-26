ALTER TABLE "clothier_day_closings" ADD COLUMN "lines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clothier_day_closings" ADD COLUMN "submitted_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clothier_day_closings" ADD CONSTRAINT "chk_clothier_day_closings_units" CHECK ("clothier_day_closings"."submitted_units" >= 0);