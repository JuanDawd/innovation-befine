ALTER TYPE "public"."catalog_entity_type" ADD VALUE 'garment_size';--> statement-breakpoint
ALTER TYPE "public"."catalog_entity_type" ADD VALUE 'garment_color';--> statement-breakpoint
CREATE TABLE "garment_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"hex" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_garment_colors_hex" CHECK ("garment_colors"."hex" IS NULL OR "garment_colors"."hex" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "garment_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_garment_colors_label" ON "garment_colors" USING btree (lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_garment_sizes_label" ON "garment_sizes" USING btree (lower("label"));--> statement-breakpoint
INSERT INTO "garment_sizes" ("label", "sort_order") VALUES
	('XS', 10), ('S', 20), ('M', 30), ('L', 40), ('XL', 50), ('XXL', 60),
	('2', 110), ('4', 120), ('6', 130), ('8', 140), ('10', 150), ('12', 160), ('14', 170), ('16', 180);--> statement-breakpoint
INSERT INTO "garment_colors" ("label", "hex") VALUES
	('Negro', '#000000'), ('Blanco', '#FFFFFF'), ('Beige', '#D9C6A5'), ('Gris', '#808080'),
	('Azul marino', '#1F2A44'), ('Azul', '#2F6FD6'), ('Rojo', '#C62828'), ('Vino', '#6D1A2E'),
	('Rosado', '#F2A7C3'), ('Fucsia', '#D81B78'), ('Verde', '#2E7D32'), ('Amarillo', '#F4C430'),
	('Naranja', '#EF7D1A'), ('Morado', '#6A3D9A'), ('Café', '#6B4423'), ('Estampado', NULL);
