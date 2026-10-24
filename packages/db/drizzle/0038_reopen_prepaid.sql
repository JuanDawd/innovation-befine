ALTER TABLE "ticket_payments" DROP CONSTRAINT "chk_ticket_payments_amount";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "prepaid_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_payments" ADD CONSTRAINT "chk_ticket_payments_amount" CHECK ("ticket_payments"."amount" <> 0);