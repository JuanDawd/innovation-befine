-- T05R-R2: Fix price_change_acknowledged column default.
-- Semantics: true = no pending price change (default state), false = price changed and awaiting secretary acknowledgment.
-- The original default(false) caused every fresh booking to show a false-positive "price changed" badge.

ALTER TABLE "appointments" ALTER COLUMN "price_change_acknowledged" SET DEFAULT true;

-- Backfill: any existing row with false that has no future price change is safe to reset to true.
-- Rows already showing a legitimate pending notification (price changed after booking) will be
-- corrected by the next editVariant call; we cannot distinguish them from false-positive rows
-- without an audit log, so we backfill all to true (no-pending state) and let staff re-notify
-- if a price change occurred and was missed. This is the least-harmful recovery path.
UPDATE "appointments" SET "price_change_acknowledged" = true WHERE "price_change_acknowledged" = false;
