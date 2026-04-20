-- T020: employee_absences
CREATE TYPE "public"."absence_type_enum" AS ENUM('vacation', 'approved_absence', 'missed');
--> statement-breakpoint
CREATE TABLE "employee_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "absence_type_enum" NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_employee_absences_employee_date" UNIQUE("employee_id","date")
);
--> statement-breakpoint
ALTER TABLE "employee_absences" ADD CONSTRAINT "fk_employee_absences_employee" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_absences" ADD CONSTRAINT "fk_employee_absences_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_employee_absences_employee_date" ON "employee_absences" USING btree ("employee_id", "date");

-- T042 wire-up: needs_review flag — marks tickets whose reopen requires payroll exclusion
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "needs_review" boolean NOT NULL DEFAULT false;

-- T066: payouts, payout_ticket_items, payout_batch_pieces
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"original_computed_amount" bigint NOT NULL,
	"adjustment_reason" text,
	"method" "payment_method_enum" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_business_day_ids" uuid[] NOT NULL,
	"recorded_by" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_ticket_items" (
	"payout_id" uuid NOT NULL,
	"ticket_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batch_pieces" (
	"payout_id" uuid NOT NULL,
	"batch_piece_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_employee" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "fk_payouts_recorded_by" FOREIGN KEY ("recorded_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_ticket_items" ADD CONSTRAINT "fk_payout_ticket_items_payout" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_ticket_items" ADD CONSTRAINT "fk_payout_ticket_items_item" FOREIGN KEY ("ticket_item_id") REFERENCES "public"."ticket_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_batch_pieces" ADD CONSTRAINT "fk_payout_batch_pieces_payout" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payout_batch_pieces" ADD CONSTRAINT "fk_payout_batch_pieces_piece" FOREIGN KEY ("batch_piece_id") REFERENCES "public"."batch_pieces"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_payouts_employee" ON "payouts" USING btree ("employee_id");
--> statement-breakpoint
CREATE INDEX "idx_payout_ticket_items_payout" ON "payout_ticket_items" USING btree ("payout_id");
--> statement-breakpoint
CREATE INDEX "idx_payout_batch_pieces_payout" ON "payout_batch_pieces" USING btree ("payout_id");
