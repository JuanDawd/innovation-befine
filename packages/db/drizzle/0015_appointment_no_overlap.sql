-- T051: Double-booking prevention — DB-level exclusion constraint
--
-- make_interval() is not IMMUTABLE, so we can't use it directly in a GIST
-- index expression. Workaround: compute the end timestamp via integer
-- multiplication (minutes * interval '1 minute') which IS immutable, then
-- wrap in an IMMUTABLE helper function so PostgreSQL accepts it in an index.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

CREATE OR REPLACE FUNCTION appointment_end_at(scheduled_at timestamptz, duration_minutes integer)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT scheduled_at + (duration_minutes * interval '1 minute')
$$;--> statement-breakpoint

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING GIST (
    stylist_employee_id WITH =,
    tstzrange(
      scheduled_at,
      appointment_end_at(scheduled_at, duration_minutes),
      '[)'
    ) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'rescheduled', 'no_show'));
