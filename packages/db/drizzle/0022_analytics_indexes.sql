-- T075: Analytics database indexes
-- Targets analytics queries defined in packages/db/src/queries/analytics.ts.
-- All indexes verified against EXPLAIN ANALYZE patterns on the analytics query set.

-- tickets(business_day_id, status) — covers revenueByPeriod, jobsCountByEmployee, dailyRevenueBreakdown
--> statement-breakpoint
CREATE INDEX "idx_tickets_business_day_status" ON "tickets" USING btree ("business_day_id", "status");

-- tickets(employee_id, status) — covers per-employee drill-down and jobsCountByEmployee
--> statement-breakpoint
CREATE INDEX "idx_tickets_employee_status" ON "tickets" USING btree ("employee_id", "status");

-- ticket_items(ticket_id) — covers JOIN from tickets to ticket_items in all revenue queries
--> statement-breakpoint
CREATE INDEX "idx_ticket_items_ticket_id" ON "ticket_items" USING btree ("ticket_id");

-- batch_pieces(assigned_to_employee_id, status) — covers clothier earnings aggregation
--> statement-breakpoint
CREATE INDEX "idx_batch_pieces_employee_status" ON "batch_pieces" USING btree ("assigned_to_employee_id", "status");

-- batch_pieces(batch_id) — covers JOIN from cloth_batches to batch_pieces
--> statement-breakpoint
CREATE INDEX "idx_batch_pieces_batch_id" ON "batch_pieces" USING btree ("batch_id");
