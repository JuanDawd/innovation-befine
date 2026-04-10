CREATE TYPE "public"."stylist_subtype_enum" AS ENUM('hairdresser', 'manicurist', 'masseuse', 'makeup_artist', 'spa_manager');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"stylist_subtype" "stylist_subtype_enum",
	"daily_rate" integer,
	"expected_work_days" integer DEFAULT 6 NOT NULL,
	"show_earnings" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_employees_user_id" UNIQUE("user_id"),
	CONSTRAINT "chk_employees_expected_work_days" CHECK ("employees"."expected_work_days" >= 1 AND "employees"."expected_work_days" <= 7)
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;