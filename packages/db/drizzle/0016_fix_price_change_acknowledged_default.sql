ALTER TABLE "appointments" ALTER COLUMN "price_change_acknowledged" SET DEFAULT true;
--> statement-breakpoint
UPDATE "appointments" SET "price_change_acknowledged" = true WHERE "price_change_acknowledged" = false;
