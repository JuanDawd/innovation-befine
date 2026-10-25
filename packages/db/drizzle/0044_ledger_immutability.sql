-- T113: pedido_payments and stock_movements are ledgers — never edited or
-- deleted (CLAUDE.md: financial records are never deleted; spec §3.6: stock
-- is the sum of movements). A mistake is corrected by a new, opposite row.
--
-- One update is allowed on pedido_payments: attaching an after-hours payment
-- (business_day_id NULL → a day) when the next business day opens (§3.5.20).

CREATE OR REPLACE FUNCTION trg_stock_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only; record an opposite movement instead'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_stock_movements_immutable';
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_stock_movements_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION trg_stock_movements_immutable();--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_pedido_payments_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.business_day_id IS NULL
    AND NEW.business_day_id IS NOT NULL
    AND (to_jsonb(NEW) - 'business_day_id') = (to_jsonb(OLD) - 'business_day_id')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'pedido_payments is append-only; record a refund instead'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_pedido_payments_immutable';
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_pedido_payments_immutable
BEFORE UPDATE OR DELETE ON pedido_payments
FOR EACH ROW EXECUTE FUNCTION trg_pedido_payments_immutable();
