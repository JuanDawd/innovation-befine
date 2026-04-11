CREATE TABLE "ticket_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"method" "payment_method_enum" NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_ticket_payments_amount" CHECK ("ticket_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ticket_payments" ADD CONSTRAINT "ticket_payments_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE restrict ON UPDATE no action;