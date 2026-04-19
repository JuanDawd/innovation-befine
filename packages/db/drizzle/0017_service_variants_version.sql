-- T05R-R8: Add version column to service_variants for optimistic locking.
-- Prevents concurrent editVariant calls from double-firing price-change notifications.

ALTER TABLE "service_variants" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
