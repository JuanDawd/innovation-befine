CREATE TABLE "cloth_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_day_id" uuid NOT NULL,
	"ticket_id" uuid,
	"cloth_piece_id" uuid NOT NULL,
	"cloth_piece_variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" bigint NOT NULL,
	"price_override" bigint,
	"client_id" uuid,
	"guest_name" text,
	"sold_by" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cloth_sales_quantity" CHECK ("cloth_sales"."quantity" >= 1),
	CONSTRAINT "chk_cloth_sales_unit_price" CHECK ("cloth_sales"."unit_price" >= 0),
	CONSTRAINT "chk_cloth_sales_price_override" CHECK ("cloth_sales"."price_override" IS NULL OR "cloth_sales"."price_override" >= 0),
	CONSTRAINT "chk_cloth_sales_client_or_guest" CHECK ("cloth_sales"."client_id" IS NOT NULL OR ("cloth_sales"."guest_name" IS NOT NULL AND "cloth_sales"."guest_name" <> '') OR ("cloth_sales"."client_id" IS NULL AND "cloth_sales"."guest_name" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_cloth_piece_id_cloth_pieces_id_fk" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_cloth_piece_variant_id_cloth_piece_variants_id_fk" FOREIGN KEY ("cloth_piece_variant_id") REFERENCES "public"."cloth_piece_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_sold_by_employees_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cloth_sales_business_day" ON "cloth_sales" USING btree ("business_day_id");--> statement-breakpoint
CREATE INDEX "idx_cloth_sales_ticket" ON "cloth_sales" USING btree ("ticket_id");