-- T078: server-side idempotency store for mutating actions
-- Keys expire after 24h; lazy cleanup on lookup.

--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL
);
