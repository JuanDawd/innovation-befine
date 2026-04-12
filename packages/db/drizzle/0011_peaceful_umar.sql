CREATE TYPE "public"."notification_type_enum" AS ENUM('edit_request_approved', 'edit_request_rejected', 'ticket_reopened', 'piece_assigned', 'appointment_reminder', 'price_changed', 'generic');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_employee_id" uuid NOT NULL,
	"type" "notification_type_enum" DEFAULT 'generic' NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_employee_id_employees_id_fk" FOREIGN KEY ("recipient_employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_created" ON "notifications" USING btree ("recipient_employee_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications" USING btree ("recipient_employee_id","is_read","is_archived");