-- T112: unit limits that span rows (spec §3.2–3.3).
--
-- CHECK constraints cannot sum across rows, so these AFTER triggers do it.
-- Each guard first locks its parent row (FOR UPDATE), so two concurrent
-- writers on the same cell or assignment are serialised and cannot both pass
-- under READ COMMITTED. Lock order is always assignment → cell.
-- Violations raise check_violation (23514) with a named constraint, so the
-- action layer maps them like any other CHECK failure.

CREATE OR REPLACE FUNCTION guard_assignment_units(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_quantity integer;
  v_reported integer;
  v_rework integer;
  v_returned integer;
  v_reviewed integer;
BEGIN
  SELECT quantity INTO v_quantity FROM assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(quantity) FILTER (WHERE kind = 'report'), 0),
    COALESCE(SUM(quantity) FILTER (WHERE kind = 'rework'), 0)
  INTO v_reported, v_rework
  FROM unit_reports WHERE assignment_id = p_assignment_id;

  SELECT COALESCE(SUM(returned), 0), COALESCE(SUM(approved + returned + scrapped), 0)
  INTO v_returned, v_reviewed
  FROM unit_reviews WHERE assignment_id = p_assignment_id;

  IF v_reported > v_quantity THEN
    RAISE EXCEPTION 'Reported units (%) exceed assigned units (%)', v_reported, v_quantity
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_assignment_reported_units';
  END IF;
  IF v_rework > v_returned THEN
    RAISE EXCEPTION 'Rework units (%) exceed returned units (%)', v_rework, v_returned
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_assignment_rework_units';
  END IF;
  IF v_reviewed > v_reported + v_rework THEN
    RAISE EXCEPTION 'Reviewed units (%) exceed reported units (%)', v_reviewed, v_reported + v_rework
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_assignment_reviewed_units';
  END IF;
END;
$$;--> statement-breakpoint

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
    COALESCE(SUM(a.quantity - COALESCE(r.scrapped, 0)), 0),
    COALESCE(SUM(COALESCE(r.approved, 0)), 0)
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
$$;--> statement-breakpoint

-- assignments: own limits + the cell it draws from (old and new on a move).
CREATE OR REPLACE FUNCTION trg_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM guard_assignment_units(NEW.id);
    PERFORM guard_cell_units(NEW.cell_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.cell_id <> NEW.cell_id THEN
    PERFORM guard_cell_units(OLD.cell_id);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_assignments_guard
AFTER INSERT OR UPDATE ON assignments
FOR EACH ROW EXECUTE FUNCTION trg_assignments_guard();--> statement-breakpoint

-- pedido_line_cells: lowering a quantity cannot go below what is assigned.
CREATE OR REPLACE FUNCTION trg_pedido_line_cells_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM guard_cell_units(NEW.id);
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_pedido_line_cells_guard
AFTER UPDATE OF quantity ON pedido_line_cells
FOR EACH ROW EXECUTE FUNCTION trg_pedido_line_cells_guard();--> statement-breakpoint

-- unit_reports and unit_reviews: assignment limits; reviews also move the
-- cell's approved / scrapped counts. Deletes are checked too (removing a
-- review can leave delivered > approved).
CREATE OR REPLACE FUNCTION trg_unit_rows_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_row record;
  v_cell_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  PERFORM guard_assignment_units(v_row.assignment_id);
  IF TG_TABLE_NAME = 'unit_reviews' THEN
    SELECT cell_id INTO v_cell_id FROM assignments WHERE id = v_row.assignment_id;
    PERFORM guard_cell_units(v_cell_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignment_id <> NEW.assignment_id THEN
    PERFORM guard_assignment_units(OLD.assignment_id);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_unit_reports_guard
AFTER INSERT OR UPDATE OR DELETE ON unit_reports
FOR EACH ROW EXECUTE FUNCTION trg_unit_rows_guard();--> statement-breakpoint

CREATE TRIGGER trg_unit_reviews_guard
AFTER INSERT OR UPDATE OR DELETE ON unit_reviews
FOR EACH ROW EXECUTE FUNCTION trg_unit_rows_guard();--> statement-breakpoint

-- delivery_cells: delivered ≤ approved, and only cells of the delivery's pedido.
CREATE OR REPLACE FUNCTION trg_delivery_cells_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM deliveries d
    JOIN pedido_lines l ON l.pedido_id = d.pedido_id
    JOIN pedido_line_cells c ON c.line_id = l.id
    WHERE d.id = NEW.delivery_id AND c.id = NEW.cell_id
  ) THEN
    RAISE EXCEPTION 'Cell % is not on the delivery''s pedido', NEW.cell_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_delivery_cells_pedido';
  END IF;
  PERFORM guard_cell_units(NEW.cell_id);
  IF TG_OP = 'UPDATE' AND OLD.cell_id <> NEW.cell_id THEN
    PERFORM guard_cell_units(OLD.cell_id);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_delivery_cells_guard
AFTER INSERT OR UPDATE ON delivery_cells
FOR EACH ROW EXECUTE FUNCTION trg_delivery_cells_guard();
