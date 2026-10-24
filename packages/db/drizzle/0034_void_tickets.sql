ALTER TYPE "public"."ticket_status_enum" ADD VALUE 'voided';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_voided_by_employees_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;