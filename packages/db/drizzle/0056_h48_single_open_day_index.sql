-- H-48: production never got this index from 0004 (it was missing from the Drizzle
-- schema, so nothing noticed). IF NOT EXISTS: databases built from the migrations have it.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_days_single_open" ON "business_days" USING btree ((1)) WHERE "business_days"."closed_at" IS NULL;--> statement-breakpoint
-- H-48: a second, stale bookkeeping table; the migrator only uses drizzle.__drizzle_migrations.
-- Moved, not dropped, like the old model in 0054.
ALTER TABLE IF EXISTS "public"."__drizzle_migrations" SET SCHEMA "archive";
