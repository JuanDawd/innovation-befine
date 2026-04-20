-- T107: index business_days(opened_at) for analytics period-resolution queries

--> statement-breakpoint
CREATE INDEX "idx_business_days_opened_at" ON "business_days" USING btree ("opened_at");
