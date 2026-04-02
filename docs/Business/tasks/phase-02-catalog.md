# Phase 2 — Catalog and pricing

> Goal: admin can define every service type (with variants and commissions) and every cloth piece type (with clothier pay). All pricing is audited.

---

## T023 — Services and variants table migration

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T006

### What to do
Create two tables:
- `services`: `id`, `name`, `description` (nullable), `is_active`, `created_at`, `updated_at`
- `service_variants`: `id`, `service_id` (FK), `name` (e.g. "Short", "Medium", "Long"), `customer_price`, `commission_pct` (numeric, 0–100), `is_active`, `created_at`, `updated_at`

A service with no meaningful variants still has at least one default variant (named "Standard").

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] `commission_pct` has a check constraint (0 ≤ value ≤ 100)
- [ ] `customer_price` is stored as integer cents (or numeric with 2 decimal places) — decide once and document
- [ ] Both tables have `is_active` to allow soft-deletion

---

## T024 — Service catalog CRUD UI (admin)

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T023

### What to do
Build the admin service catalog screen: list all services with their variants, prices, and commission %. Admin can create, edit, and soft-delete services and variants.

### Acceptance criteria
- [ ] Admin sees all services and their variants in one view
- [ ] Can create a new service (with at least one variant)
- [ ] Can add, edit, and soft-delete variants on an existing service
- [ ] Inactive services/variants are hidden from non-admin views
- [ ] Non-admin roles cannot access this screen

---

## T025 — Catalog audit log

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T024

### What to do
Create a `catalog_audit_log` table (`id`, `entity_type`, `entity_id`, `changed_by`, `changed_at`, `old_value` jsonb, `new_value` jsonb). On every create/edit of a service or variant, insert a record. Display the log on each service's detail view (admin only).

### Acceptance criteria
- [ ] Every price or commission change creates an audit record
- [ ] Audit log shows what changed, who changed it, and when
- [ ] Audit log is append-only (no deletes from the admin UI)

---

## T026 — Cloth pieces table migration

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T006

### What to do
Create the `cloth_pieces` table: `id`, `name`, `description` (nullable), `sale_price`, `clothier_pay`, `is_active`, `created_at`, `updated_at`.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] Both price fields use the same numeric storage convention as T023
- [ ] `is_active` for soft-deletion

---

## T027 — Cloth piece catalog CRUD UI (admin)

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T026

### What to do
Build the admin cloth piece catalog screen: list all piece types with sale price and clothier pay. Admin can create, edit, and soft-delete entries.

### Acceptance criteria
- [ ] Admin can create a new cloth piece type
- [ ] Admin can edit name, description, sale price, and clothier pay
- [ ] Soft-delete hides the piece from batch creation for new batches (existing assignments unaffected)
- [ ] Audit log (T025 pattern) records price changes

---

## T028 — Catalog read access for non-admin roles

**Phase:** 2 — Catalog
**Status:** pending
**Dependencies:** T024, T027

### What to do
Expose read-only API endpoints (or server actions) that return active services/variants and active cloth pieces. These will be consumed in Phase 4 (ticket creation, batch creation).

### Acceptance criteria
- [ ] Stylists and secretary can fetch the list of active services and variants
- [ ] Secretary can fetch the list of active cloth piece types
- [ ] Response includes `id`, `name`, `customer_price`, and `commission_pct` for services
- [ ] Write endpoints (create/edit/delete) return 403 for non-admin roles
