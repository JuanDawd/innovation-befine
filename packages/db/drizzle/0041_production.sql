CREATE TYPE "public"."assignment_source_enum" AS ENUM('assigned', 'claimed');--> statement-breakpoint
CREATE TYPE "public"."unit_report_kind_enum" AS ENUM('report', 'rework');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"piece_rate" bigint NOT NULL,
	"rate_reason" text,
	"source" "assignment_source_enum" NOT NULL,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_assignments_quantity" CHECK ("assignments"."quantity" >= 0),
	CONSTRAINT "chk_assignments_piece_rate" CHECK ("assignments"."piece_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clothier_day_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"business_day_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"correction_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_clothier_day_closings_approval" CHECK (("clothier_day_closings"."approved_by" IS NULL) = ("clothier_day_closings"."approved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"cell_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "chk_delivery_cells_quantity" CHECK ("delivery_cells"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "unit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"kind" "unit_report_kind_enum" DEFAULT 'report' NOT NULL,
	"business_day_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_unit_reports_quantity" CHECK ("unit_reports"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "unit_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"approved" integer DEFAULT 0 NOT NULL,
	"returned" integer DEFAULT 0 NOT NULL,
	"scrapped" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"business_day_id" uuid NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_unit_reviews_counts" CHECK ("unit_reviews"."approved" >= 0 AND "unit_reviews"."returned" >= 0 AND "unit_reviews"."scrapped" >= 0
        AND "unit_reviews"."approved" + "unit_reviews"."returned" + "unit_reviews"."scrapped" >= 1),
	CONSTRAINT "chk_unit_reviews_reason" CHECK (("unit_reviews"."returned" = 0 AND "unit_reviews"."scrapped" = 0) OR "unit_reviews"."reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cell_id_pedido_line_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."pedido_line_cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clothier_day_closings" ADD CONSTRAINT "clothier_day_closings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clothier_day_closings" ADD CONSTRAINT "clothier_day_closings_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clothier_day_closings" ADD CONSTRAINT "clothier_day_closings_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivered_by_employees_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cells" ADD CONSTRAINT "delivery_cells_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cells" ADD CONSTRAINT "delivery_cells_cell_id_pedido_line_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."pedido_line_cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reports" ADD CONSTRAINT "unit_reports_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reports" ADD CONSTRAINT "unit_reports_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reports" ADD CONSTRAINT "unit_reports_reported_by_employees_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD CONSTRAINT "unit_reviews_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD CONSTRAINT "unit_reviews_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_reviews" ADD CONSTRAINT "unit_reviews_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignments_cell" ON "assignments" USING btree ("cell_id");--> statement-breakpoint
CREATE INDEX "idx_assignments_employee" ON "assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_clothier_day_closings_employee_day" ON "clothier_day_closings" USING btree ("employee_id","business_day_id");--> statement-breakpoint
CREATE INDEX "idx_clothier_day_closings_business_day" ON "clothier_day_closings" USING btree ("business_day_id");--> statement-breakpoint
CREATE INDEX "idx_deliveries_pedido" ON "deliveries" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_delivery_cells_delivery_cell" ON "delivery_cells" USING btree ("delivery_id","cell_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_cells_cell" ON "delivery_cells" USING btree ("cell_id");--> statement-breakpoint
CREATE INDEX "idx_unit_reports_assignment" ON "unit_reports" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_unit_reports_business_day" ON "unit_reports" USING btree ("business_day_id");--> statement-breakpoint
CREATE INDEX "idx_unit_reviews_assignment" ON "unit_reviews" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_unit_reviews_business_day" ON "unit_reviews" USING btree ("business_day_id");