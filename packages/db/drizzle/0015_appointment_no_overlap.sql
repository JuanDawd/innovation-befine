-- T051: Double-booking prevention — DB-level exclusion constraint
--
-- Uses PostgreSQL's EXCLUDE USING GIST to prevent overlapping active
-- appointments for the same stylist. The tstzrange covers
-- [scheduled_at, scheduled_at + interval duration_minutes).
--
-- Cancelled, rescheduled, and no_show appointments are excluded from the
-- constraint via a partial index condition so they never block new bookings.
--
-- Requires btree_gist extension for the (uuid, tstzrange) combined exclusion.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING GIST (
    stylist_employee_id WITH =,
    tstzrange(
      scheduled_at,
      scheduled_at + make_interval(mins => duration_minutes),
      '[)'
    ) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'rescheduled', 'no_show'));
