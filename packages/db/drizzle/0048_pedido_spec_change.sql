ALTER TYPE "public"."notification_type_enum" ADD VALUE 'pedido_changed' BEFORE 'generic';--> statement-breakpoint
ALTER TABLE "pedido_lines" ADD COLUMN "spec_change" jsonb;--> statement-breakpoint
ALTER TABLE "pedido_lines" ADD COLUMN "spec_changed_at" timestamp with time zone;