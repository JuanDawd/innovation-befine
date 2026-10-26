CREATE TYPE "public"."stock_movement_kind_enum" AS ENUM('production', 'adjustment', 'sale', 'scrap', 'restructure');--> statement-breakpoint
CREATE TABLE "pedido_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "payment_method_enum" NOT NULL,
	"business_day_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"after_hours" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid NOT NULL,
	"note" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedido_payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "chk_pedido_payments_amount" CHECK ("pedido_payments"."amount" <> 0),
	CONSTRAINT "chk_pedido_payments_business_day" CHECK ("pedido_payments"."business_day_id" IS NOT NULL OR "pedido_payments"."after_hours"),
	CONSTRAINT "chk_pedido_payments_refund_note" CHECK ("pedido_payments"."amount" > 0 OR "pedido_payments"."note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "restructures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reason" text NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_restructures_approval" CHECK (("restructures"."approved_by" IS NULL) = ("restructures"."approved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloth_piece_variant_id" uuid NOT NULL,
	"size_id" uuid,
	"color_id" uuid,
	"quantity" integer NOT NULL,
	"kind" "stock_movement_kind_enum" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_stock_movements_quantity" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "chk_stock_movements_reason" CHECK ("stock_movements"."kind" NOT IN ('adjustment', 'scrap', 'restructure') OR "stock_movements"."reason" IS NOT NULL),
	CONSTRAINT "chk_stock_movements_ref" CHECK (("stock_movements"."ref_type" IS NULL) = ("stock_movements"."ref_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cloth_sales" ALTER COLUMN "business_day_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "after_hours" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "size_id" uuid;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD COLUMN "color_id" uuid;--> statement-breakpoint
ALTER TABLE "pedido_payments" ADD CONSTRAINT "pedido_payments_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_payments" ADD CONSTRAINT "pedido_payments_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_payments" ADD CONSTRAINT "pedido_payments_recorded_by_employees_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restructures" ADD CONSTRAINT "restructures_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restructures" ADD CONSTRAINT "restructures_requested_by_employees_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restructures" ADD CONSTRAINT "restructures_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cloth_piece_variant_id_cloth_piece_variants_id_fk" FOREIGN KEY ("cloth_piece_variant_id") REFERENCES "public"."cloth_piece_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_size_id_garment_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."garment_sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_color_id_garment_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."garment_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pedido_payments_pedido" ON "pedido_payments" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_payments_business_day" ON "pedido_payments" USING btree ("business_day_id");--> statement-breakpoint
CREATE INDEX "idx_pedido_payments_unattached" ON "pedido_payments" USING btree ("received_at") WHERE "pedido_payments"."business_day_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_restructures_pedido" ON "restructures" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_item" ON "stock_movements" USING btree ("cloth_piece_variant_id","size_id","color_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_ref" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_size_id_garment_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."garment_sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "cloth_sales_color_id_garment_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."garment_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloth_sales" ADD CONSTRAINT "chk_cloth_sales_business_day" CHECK ("cloth_sales"."business_day_id" IS NOT NULL OR "cloth_sales"."after_hours");