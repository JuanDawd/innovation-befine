CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"large_order_id" uuid NOT NULL,
	"cloth_piece_id" uuid NOT NULL,
	"cloth_piece_variant_id" uuid NOT NULL,
	"piece_name" varchar(120) NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_order_items_quantity" CHECK ("order_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cloth_piece_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"craftable_piece_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"assigned_quantity" integer NOT NULL,
	"completed_quantity" integer DEFAULT 0 NOT NULL,
	"approved_quantity" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cpa_assigned_quantity" CHECK ("cloth_piece_assignments"."assigned_quantity" >= 1),
	CONSTRAINT "chk_cpa_completed_quantity" CHECK ("cloth_piece_assignments"."completed_quantity" >= 0),
	CONSTRAINT "chk_cpa_approved_quantity" CHECK ("cloth_piece_assignments"."approved_quantity" >= 0),
	CONSTRAINT "chk_cpa_completed_lte_assigned" CHECK ("cloth_piece_assignments"."completed_quantity" <= "cloth_piece_assignments"."assigned_quantity"),
	CONSTRAINT "chk_cpa_approved_lte_completed" CHECK ("cloth_piece_assignments"."approved_quantity" <= "cloth_piece_assignments"."completed_quantity")
);
--> statement-breakpoint
CREATE TABLE "production_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"logged_date" date NOT NULL,
	"logged_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_production_logs_quantity" CHECK ("production_logs"."quantity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_large_order_id_large_orders_id_fk" FOREIGN KEY ("large_order_id") REFERENCES "public"."large_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cloth_piece_id_cloth_pieces_id_fk" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cloth_piece_variant_id_cloth_piece_variants_id_fk" FOREIGN KEY ("cloth_piece_variant_id") REFERENCES "public"."cloth_piece_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_piece_assignments" ADD CONSTRAINT "cloth_piece_assignments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_piece_assignments" ADD CONSTRAINT "cloth_piece_assignments_craftable_piece_id_craftable_pieces_id_fk" FOREIGN KEY ("craftable_piece_id") REFERENCES "public"."craftable_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_piece_assignments" ADD CONSTRAINT "cloth_piece_assignments_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_assignment_id_cloth_piece_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."cloth_piece_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_logged_by_employees_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_items_large_order" ON "order_items" USING btree ("large_order_id");--> statement-breakpoint
CREATE INDEX "idx_cpa_order_item" ON "cloth_piece_assignments" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_cpa_assignee" ON "cloth_piece_assignments" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_production_logs_assignment" ON "production_logs" USING btree ("assignment_id","logged_date");
