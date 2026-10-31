ALTER TABLE "assignments" ADD COLUMN "moved_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restructures" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "restructures" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restructures" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "restructures" ADD CONSTRAINT "restructures_rejected_by_employees_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_restructures_pedido_pending" ON "restructures" USING btree ("pedido_id") WHERE "restructures"."approved_at" IS NULL AND "restructures"."rejected_at" IS NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "chk_assignments_moved_out" CHECK ("assignments"."moved_out" >= 0);--> statement-breakpoint
ALTER TABLE "restructures" ADD CONSTRAINT "chk_restructures_rejection" CHECK (("restructures"."rejected_by" IS NULL) = ("restructures"."rejected_at" IS NULL));--> statement-breakpoint
-- T120: moved-out units no longer count on the cell (0042's guard, updated).
CREATE OR REPLACE FUNCTION guard_cell_units(p_cell_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_quantity integer;
  v_live integer;
  v_approved integer;
  v_delivered integer;
BEGIN
  SELECT quantity INTO v_quantity FROM pedido_line_cells WHERE id = p_cell_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Scrapped units re-open on the pedido, so they no longer count as assigned.
  SELECT
    COALESCE(SUM(a.quantity - a.moved_out - COALESCE(r.scrapped, 0)), 0),
    COALESCE(SUM(COALESCE(r.approved, 0) - a.moved_out), 0)
  INTO v_live, v_approved
  FROM assignments a
  LEFT JOIN (
    SELECT assignment_id, SUM(scrapped) AS scrapped, SUM(approved) AS approved
    FROM unit_reviews GROUP BY assignment_id
  ) r ON r.assignment_id = a.id
  WHERE a.cell_id = p_cell_id;

  SELECT COALESCE(SUM(quantity), 0) INTO v_delivered
  FROM delivery_cells WHERE cell_id = p_cell_id;

  IF v_live > v_quantity THEN
    RAISE EXCEPTION 'Assigned units (%) exceed the cell quantity (%)', v_live, v_quantity
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_cell_assigned_units';
  END IF;
  IF v_delivered > v_approved THEN
    RAISE EXCEPTION 'Delivered units (%) exceed approved units (%)', v_delivered, v_approved
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_cell_delivered_units';
  END IF;
END;
$$;
