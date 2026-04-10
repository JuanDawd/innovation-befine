CREATE TABLE "business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enforce_subtype_service_restriction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_business_settings_single_row" CHECK ("business_settings"."id" = '00000000-0000-0000-0000-000000000001')
);
--> statement-breakpoint
-- Seed the single settings row on first migration
INSERT INTO "business_settings" ("id", "enforce_subtype_service_restriction", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', false, now(), now())
ON CONFLICT ("id") DO NOTHING;
