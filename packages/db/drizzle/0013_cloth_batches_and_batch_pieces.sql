CREATE TYPE "public"."batch_piece_status_enum" AS ENUM('pending', 'done_pending_approval', 'approved');--> statement-breakpoint
CREATE TYPE "public"."claim_source_enum" AS ENUM('assigned', 'self_claimed');--> statement-breakpoint
CREATE TABLE "batch_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"cloth_piece_id" uuid NOT NULL,
	"assigned_to_employee_id" uuid,
	"claim_source" "claim_source_enum",
	"claimed_at" timestamp with time zone,
	"status" "batch_piece_status_enum" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloth_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_day_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"notes" text,
	"large_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD CONSTRAINT "batch_pieces_batch_id_cloth_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cloth_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD CONSTRAINT "batch_pieces_cloth_piece_id_cloth_pieces_id_fk" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD CONSTRAINT "batch_pieces_assigned_to_employee_id_employees_id_fk" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_pieces" ADD CONSTRAINT "batch_pieces_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_batches" ADD CONSTRAINT "cloth_batches_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_batches" ADD CONSTRAINT "cloth_batches_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;