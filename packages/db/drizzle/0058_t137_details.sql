CREATE TABLE "detail_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"detail_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"builtin" text,
	"splits_stock" boolean DEFAULT false NOT NULL,
	"allow_free_text" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_details_builtin" CHECK ("details"."builtin" IS NULL OR "details"."builtin" IN ('size', 'color', 'style'))
);
--> statement-breakpoint
CREATE TABLE "product_detail_values" (
	"cloth_piece_id" uuid NOT NULL,
	"detail_id" uuid NOT NULL,
	"value_id" uuid NOT NULL,
	CONSTRAINT "product_detail_values_cloth_piece_id_detail_id_value_id_pk" PRIMARY KEY("cloth_piece_id","detail_id","value_id")
);
--> statement-breakpoint
CREATE TABLE "product_details" (
	"cloth_piece_id" uuid NOT NULL,
	"detail_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"all_values" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_details_cloth_piece_id_detail_id_pk" PRIMARY KEY("cloth_piece_id","detail_id")
);
--> statement-breakpoint
ALTER TABLE "detail_values" ADD CONSTRAINT "detail_values_detail_id_details_id_fk" FOREIGN KEY ("detail_id") REFERENCES "public"."details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_detail_values" ADD CONSTRAINT "product_detail_values_cloth_piece_id_cloth_pieces_id_fk" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_detail_values" ADD CONSTRAINT "product_detail_values_detail_id_details_id_fk" FOREIGN KEY ("detail_id") REFERENCES "public"."details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_details" ADD CONSTRAINT "product_details_cloth_piece_id_cloth_pieces_id_fk" FOREIGN KEY ("cloth_piece_id") REFERENCES "public"."cloth_pieces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_details" ADD CONSTRAINT "product_details_detail_id_details_id_fk" FOREIGN KEY ("detail_id") REFERENCES "public"."details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_detail_values_label" ON "detail_values" USING btree ("detail_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_details_name" ON "details" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_details_builtin" ON "details" USING btree ("builtin");--> statement-breakpoint
-- T137: the three details existing columns store, and every product starts using them.
INSERT INTO "details" ("name", "builtin", "splits_stock", "allow_free_text", "sort_order") VALUES
  ('Talla', 'size', true, true, 0),
  ('Color', 'color', true, true, 1),
  ('Estilo', 'style', false, true, 2);--> statement-breakpoint
INSERT INTO "product_details" ("cloth_piece_id", "detail_id")
  SELECT p."id", d."id" FROM "cloth_pieces" p CROSS JOIN "details" d;
