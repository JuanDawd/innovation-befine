CREATE TYPE "public"."appointment_status_enum" AS ENUM('booked', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"guest_name" text,
	"stylist_employee_id" uuid NOT NULL,
	"service_variant_id" uuid,
	"service_summary" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"status" "appointment_status_enum" DEFAULT 'booked' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"confirmation_sent_at" timestamp with time zone,
	"price_change_acknowledged" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_stylist_employee_id_employees_id_fk" FOREIGN KEY ("stylist_employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_variant_id_service_variants_id_fk" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_appointments_stylist_scheduled" ON "appointments" USING btree ("stylist_employee_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_appointments_scheduled_at" ON "appointments" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_appointments_client" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_status" ON "appointments" USING btree ("status");