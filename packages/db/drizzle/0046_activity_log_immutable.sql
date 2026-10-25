-- T114: activity_log is append-only for everyone (spec §3.9.26).
CREATE OR REPLACE FUNCTION trg_activity_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_activity_log_immutable';
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_activity_log_immutable
BEFORE UPDATE OR DELETE ON activity_log
FOR EACH ROW EXECUTE FUNCTION trg_activity_log_immutable();--> statement-breakpoint

-- Fold catalog_audit_log into activity_log: copy every existing entry, with
-- the same Spanish summaries logActivity() writes from now on. The old table
-- stays until T135 retires it; nothing writes to it any more.
INSERT INTO activity_log (
  actor_user_id, actor_role, business_day_id, action, entity_type, entity_id,
  summary, before, after, created_at
)
SELECT
  c.changed_by,
  u.role,
  (
    SELECT d.id FROM business_days d
    WHERE d.opened_at <= c.created_at AND (d.closed_at IS NULL OR d.closed_at >= c.created_at)
    ORDER BY d.opened_at DESC LIMIT 1
  ),
  CASE c.action
    WHEN 'create' THEN 'catalog.create'
    WHEN 'update' THEN 'catalog.update'
    WHEN 'soft_delete' THEN 'catalog.deactivate'
    WHEN 'restore' THEN 'catalog.restore'
  END,
  c.entity_type::text,
  c.entity_id::text,
  CASE c.action
    WHEN 'create' THEN 'Creó '
    WHEN 'update' THEN 'Editó '
    WHEN 'soft_delete' THEN 'Desactivó '
    WHEN 'restore' THEN 'Restauró '
  END
  || CASE c.entity_type
    WHEN 'service' THEN 'el servicio'
    WHEN 'service_variant' THEN 'la variante de servicio'
    WHEN 'cloth_piece' THEN 'la prenda'
    WHEN 'garment_size' THEN 'la talla'
    WHEN 'garment_color' THEN 'el color'
  END
  || COALESCE(
    ' «' || COALESCE(
      c.new_data->>'name', c.new_data->>'label', c.previous_data->>'name', c.previous_data->>'label'
    ) || '»',
    ''
  ),
  c.previous_data,
  c.new_data,
  c.created_at
FROM catalog_audit_log c
LEFT JOIN users u ON u.id = c.changed_by;
