CREATE TYPE "public"."catalog_action" AS ENUM('create', 'update', 'soft_delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."catalog_entity_type" AS ENUM('service', 'service_variant', 'cloth_piece');--> statement-breakpoint
CREATE TABLE "catalog_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "catalog_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "catalog_action" NOT NULL,
	"changed_by" text NOT NULL,
	"previous_data" jsonb,
	"new_data" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloth_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"piece_rate" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cloth_pieces_piece_rate" CHECK ("cloth_pieces"."piece_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"customer_price" bigint NOT NULL,
	"commission_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_service_variants_commission_pct" CHECK ("service_variants"."commission_pct" >= 0 AND "service_variants"."commission_pct" <= 100),
	CONSTRAINT "chk_service_variants_customer_price" CHECK ("service_variants"."customer_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_audit_log" ADD CONSTRAINT "catalog_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;