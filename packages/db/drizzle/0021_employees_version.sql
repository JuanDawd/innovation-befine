-- T07R-R14: add version column to employees for optimistic locking on editEmployee

--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "version" smallint NOT NULL DEFAULT 0;
