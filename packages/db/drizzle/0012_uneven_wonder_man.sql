CREATE TYPE "public"."edit_request_status_enum" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "ticket_edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_item_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"new_service_variant_id" uuid NOT NULL,
	"status" "edit_request_status_enum" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ticket_edit_requests" ADD CONSTRAINT "ticket_edit_requests_ticket_item_id_ticket_items_id_fk" FOREIGN KEY ("ticket_item_id") REFERENCES "public"."ticket_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_edit_requests" ADD CONSTRAINT "ticket_edit_requests_requested_by_employees_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_edit_requests" ADD CONSTRAINT "ticket_edit_requests_new_service_variant_id_service_variants_id_fk" FOREIGN KEY ("new_service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_edit_requests" ADD CONSTRAINT "ticket_edit_requests_resolved_by_employees_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_edit_requests_item" ON "ticket_edit_requests" USING btree ("ticket_item_id");--> statement-breakpoint
CREATE INDEX "idx_edit_requests_status" ON "ticket_edit_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_edit_requests_requester" ON "ticket_edit_requests" USING btree ("requested_by");