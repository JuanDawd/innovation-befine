CREATE TYPE "public"."pedido_destination_enum" AS ENUM('client', 'inventory');--> statement-breakpoint
CREATE TYPE "public"."pedido_line_kind_enum" AS ENUM('garment', 'adjustment');--> statement-breakpoint
CREATE TABLE "pedido_line_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"size_id" uuid,
	"size_other" text,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pedido_line_cells_quantity" CHECK ("pedido_line_cells"."quantity" >= 1),
	CONSTRAINT "chk_pedido_line_cells_size" CHECK (("pedido_line_cells"."size_id" IS NULL) <> ("pedido_line_cells"."size_other" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "pedido_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"kind" "pedido_line_kind_enum" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cloth_piece_variant_id" uuid,
	"color_id" uuid,
	"color_other" text,
	"style" text,
	"instructions" text,
	"unit_price" bigint,
	"price_reason" text,
	"amount" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pedido_lines_kind" CHECK (("pedido_lines"."kind" = 'garment'
          AND "pedido_lines"."cloth_piece_variant_id" IS NOT NULL
          AND "pedido_lines"."unit_price" IS NOT NULL
          AND "pedido_lines"."amount" IS NULL)
        OR ("pedido_lines"."kind" = 'adjustment'
          AND "pedido_lines"."cloth_piece_variant_id" IS NULL
          AND "pedido_lines"."unit_price" IS NULL
          AND "pedido_lines"."amount" IS NOT NULL
          AND "pedido_lines"."price_reason" IS NOT NULL
          AND "pedido_lines"."color_id" IS NULL
          AND "pedido_lines"."color_other" IS NULL)),
	CONSTRAINT "chk_pedido_lines_unit_price" CHECK ("pedido_lines"."unit_price" IS NULL OR "pedido_lines"."unit_price" >= 0),
	CONSTRAINT "chk_pedido_lines_amount" CHECK ("pedido_lines"."amount" IS NULL OR "pedido_lines"."amount" <> 0),
	CONSTRAINT "chk_pedido_lines_color" CHECK ("pedido_lines"."color_id" IS NULL OR "pedido_lines"."color_other" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "pedidos_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" uuid,
	"destination" "pedido_destination_enum" NOT NULL,
	"estimated_delivery_at" timestamp with time zone,
	"notes" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pedidos_destination_client" CHECK (("pedidos"."destination" = 'client' AND "pedidos"."client_id" IS NOT NULL)
        OR ("pedidos"."destination" = 'inventory' AND "pedidos"."client_id" IS NULL)),
	CONSTRAINT "chk_pedidos_cancellation" CHECK (("pedidos"."cancelled_at" IS NULL) = ("pedidos"."cancellation_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "pedido_line_cells" ADD CONSTRAINT "pedido_line_cells_line_id_pedido_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."pedido_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_line_cells" ADD CONSTRAINT "pedido_line_cells_size_id_garment_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."garment_sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_lines" ADD CONSTRAINT "pedido_lines_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_lines" ADD CONSTRAINT "pedido_lines_cloth_piece_variant_id_cloth_piece_variants_id_fk" FOREIGN KEY ("cloth_piece_variant_id") REFERENCES "public"."cloth_piece_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_lines" ADD CONSTRAINT "pedido_lines_color_id_garment_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."garment_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pedido_line_cells_line" ON "pedido_line_cells" USING btree ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pedido_line_cells_line_size" ON "pedido_line_cells" USING btree ("line_id","size_id") WHERE "pedido_line_cells"."size_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pedido_line_cells_line_size_other" ON "pedido_line_cells" USING btree ("line_id",lower("size_other")) WHERE "pedido_line_cells"."size_other" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_pedido_lines_pedido" ON "pedido_lines" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pedidos_number" ON "pedidos" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_pedidos_client" ON "pedidos" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_pedidos_estimated_delivery" ON "pedidos" USING btree ("estimated_delivery_at");