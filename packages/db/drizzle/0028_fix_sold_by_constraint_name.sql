-- Remediation: 0026 created the sold_by FK with a custom name "fk_batch_pieces_sold_by"
-- but 0027 tried to rename "batch_pieces_sold_by_employees_id_fk" (Drizzle convention).
-- This migration reconciles the final state so the constraint has the correct name.
--> statement-breakpoint
DO $$
BEGIN
  -- If the custom name from 0026 still exists (0027 rename failed or was skipped), rename it now.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_batch_pieces_sold_by'
      AND conrelid = 'craftable_pieces'::regclass
  ) THEN
    ALTER TABLE "craftable_pieces"
      RENAME CONSTRAINT "fk_batch_pieces_sold_by"
      TO "craftable_pieces_sold_by_employees_id_fk";
  END IF;

  -- If 0027's rename landed it as batch_pieces_sold_by_employees_id_fk (wrong table prefix), rename to correct name.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batch_pieces_sold_by_employees_id_fk'
      AND conrelid = 'craftable_pieces'::regclass
  ) THEN
    ALTER TABLE "craftable_pieces"
      RENAME CONSTRAINT "batch_pieces_sold_by_employees_id_fk"
      TO "craftable_pieces_sold_by_employees_id_fk";
  END IF;
END $$;
