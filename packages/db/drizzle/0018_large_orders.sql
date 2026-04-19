CREATE TYPE "public"."large_order_status_enum" AS ENUM('pending', 'in_production', 'ready', 'delivered', 'paid_in_full', 'cancelled');
--> statement-breakpoint
CREATE TABLE "large_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"description" text NOT NULL,
	"total_price" bigint NOT NULL,
	"status" "large_order_status_enum" DEFAULT 'pending' NOT NULL,
	"estimated_delivery_at" timestamp with time zone,
	"notes" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "large_order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "payment_method_enum" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "large_orders" ADD CONSTRAINT "fk_large_orders_clients" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "large_orders" ADD CONSTRAINT "fk_large_orders_employees" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "large_order_payments" ADD CONSTRAINT "fk_large_order_payments_orders" FOREIGN KEY ("order_id") REFERENCES "public"."large_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "large_order_payments" ADD CONSTRAINT "fk_large_order_payments_employees" FOREIGN KEY ("recorded_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cloth_batches" ADD CONSTRAINT "fk_cloth_batches_large_orders" FOREIGN KEY ("large_order_id") REFERENCES "public"."large_orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_large_orders_client" ON "large_orders" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "idx_large_orders_status" ON "large_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_large_order_payments_order" ON "large_order_payments" USING btree ("order_id");
