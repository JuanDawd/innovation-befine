CREATE TABLE "ticket_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"service_variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" bigint NOT NULL,
	"commission_pct" numeric(5, 2) NOT NULL,
	"override_price" bigint,
	"override_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_ticket_items_quantity" CHECK ("ticket_items"."quantity" >= 1),
	CONSTRAINT "chk_ticket_items_unit_price" CHECK ("ticket_items"."unit_price" >= 0),
	CONSTRAINT "chk_ticket_items_override_price" CHECK ("ticket_items"."override_price" IS NULL OR "ticket_items"."override_price" >= 0),
	CONSTRAINT "chk_ticket_items_override_reason" CHECK ("ticket_items"."override_price" IS NULL OR ("ticket_items"."override_reason" IS NOT NULL AND "ticket_items"."override_reason" <> ''))
);
--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_service_variant_id_service_variants_id_fk" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE restrict ON UPDATE no action;