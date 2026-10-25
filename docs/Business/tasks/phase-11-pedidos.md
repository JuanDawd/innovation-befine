# Phase 11 — Pedidos (unified orders, production, stock, activity log)

> Goal: one Pedido model replaces Productos and Pedidos grandes; production is counted in units that pay clothiers and drive progress from the same numbers; every peso goes through the till; stock is real; every action is logged. Spec: [`pedidos-spec.md`](../pedidos-spec.md).
>
> Sub-phases: **11A** data model · **11B** pedidos · **11C** production · **11D** money and stock · **11E** activity log and analytics · **11F** rollout. No data migration — current orders/products are test data.

---

## 11A — Data model

## T110 — Sizes and colours catalog

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** —

### What to do

Create `garment_sizes` (`id`, `label`, `sort_order`, `is_active`) and `garment_colors` (`id`, `label`, `hex` nullable, `is_active`). Add a "Tallas y colores" tab to Catálogo (admin) to create, reorder, deactivate. Seed common sizes (XS–XXL, 2–16) and a starter colour list.

### Acceptance criteria

- [x] Admin can add, rename, reorder and deactivate sizes and colours; deactivated ones stay on existing records
- [x] Changes are written to the activity log (once T114 lands; until then the catalog audit log)
- [x] Non-admin roles cannot edit the lists

---

## T111 — Pedido core schema

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** T110

### What to do

Create `pedidos`, `pedido_lines` (`kind` garment | adjustment) and `pedido_line_cells` per spec §4. Sequential human number (`#0412`). `client_id` nullable with `destination` (`client` | `inventory`) and a CHECK that client pedidos have a client and inventory pedidos do not. Line `unit_price` is a snapshot; `price_reason` required when it differs from the variant's selling price.

### Acceptance criteria

- [x] Migrations run; enums via `pgEnum`; money as `bigint`
- [x] CHECK constraints: destination ↔ client, quantities ≥ 1, prices ≥ 0
- [x] Optimistic locking `version` on `pedidos`
- [x] Unit tests for the total = sum of lines (garment cells × unit price + adjustment amounts)

---

## T112 — Production schema

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** T111

### What to do

Create `assignments`, `unit_reports`, `unit_reviews`, `clothier_day_closings`, `deliveries`, `delivery_cells` per spec §4. Piece rate is copied onto the assignment at creation.

### Acceptance criteria

- [x] DB constraints: sum of assignments per cell ≤ cell quantity; approved + returned + scrapped per assignment ≤ reported; delivered per cell ≤ approved
- [x] One closing per employee per business day (unique)
- [x] Pure query helpers for per-cell assigned / reported / approved / delivered, with unit tests

---

## T113 — Money and stock schema

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** T111

### What to do

Create `pedido_payments` (signed amount for refunds, `business_day_id` nullable until attached, `received_at`, `after_hours`, `note`), `stock_movements` and `restructures` per spec §4. Add `business_day_id`, `received_at`, `after_hours`, `size_id`, `color_id` to `cloth_sales`.

### Acceptance criteria

- [x] Stock on hand per variant + size + colour is a query (sum of movements), never a column
- [x] Balance and saldo a favor are queries, never columns
- [x] Unit tests: balance with partial payments, refunds, adjustment lines

---

## T114 — Activity log foundation

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** —

### What to do

Create `activity_log` per spec §4 and a `logActivity(tx, entry)` helper that must run inside the caller's transaction. Hook Better Auth sign-in, sign-out and failed sign-in (with IP and user agent). Fold `catalog_audit_log` writes into it.

### Acceptance criteria

- [x] No update/delete path exists for `activity_log` (app code and a DB trigger rejecting UPDATE/DELETE)
- [x] An action that fails rolls back its log entry (integration test)
- [x] Sign-in, sign-out and failed attempts are logged with device info
- [x] Spanish summary generated per action type

---

## T115 — New settings

**Phase:** 11A — Data model
**Status:** done
**Dependencies:** —

### What to do

Add to `business_settings` and Configuración: **secretary can record pedido payments** (default off), **clothier claim limit** (units, default 50), **pay for scrapped units** (default off).

### Acceptance criteria

- [x] Admin-only edit; each change logged
- [x] Defaults applied on existing deployments

---

## 11B — Pedidos

## T116 — Create / edit pedido

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T111, T030

### What to do

One form (modal + full page, per the creation-route pattern) for client or inventory pedidos. Client picker with inline create (name + required phone); "Para inventario" option. Lines: piece + variant, colour, style, instructions, **size grid**. Price defaults to selling price × units, editable with reason; adjustment line with reason; delivery date; notes.

### Acceptance criteria

- [ ] Guests cannot be selected; inline-created clients require a phone
- [ ] Line price defaults to `selling_price` (never `piece_rate`); variants without one require a typed price + reason
- [ ] Total is always the sum of lines; no free-typed total
- [ ] Works with or without an open business day; nothing is silently skipped
- [ ] Validation inline, keyboard operable, 44 px targets on touch

---

## T117 — Pedidos list and detail

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T116, T118

### What to do

List with filters: destino, estado, **grandes (10+ units)**, atrasados; whole row opens the pedido. Detail: lines × sizes with assigned · approved · delivered per cell, status explanation ("128 de 150 aprobadas"), payments and balance, deliveries, **Historial** tab (T132).

### Acceptance criteria

- [ ] Status shown is derived (T118), with its reason
- [ ] Phone, tablet and desktop layouts; no horizontal overflow
- [ ] Secretary sees totals and balances but no revenue figures

---

## T118 — Derived status engine

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T112, T113

### What to do

Pure function computing Pendiente / En producción / Listo / Entrega parcial / Entregado / Pagado / Cancelado from cells, assignments, reviews, deliveries and payments (spec §3.3). Inventory pedidos end at Listo.

### Acceptance criteria

- [ ] 100 % branch coverage unit tests, including partial delivery, payments before delivery, restructure and cancellation
- [ ] No status column is written by app code (cancellation fields aside)

---

## T119 — Edit rules after production starts

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T116, T112

### What to do

Enforce spec §3.4.16: increases always; decreases only down to assigned units; spec changes on assigned units with reason and clothier notification; remove a line only if unassigned; price changes with reason, overpayment → saldo a favor. Cancellation per §3.4.18.

### Acceptance criteria

- [ ] Server rejects edits that would drop below assigned / approved / delivered units, with a clear Spanish message
- [ ] Assigned clothiers get a notification and see "Cambió: …" on their work
- [ ] Every edit logged with before/after and reason

---

## T120 — Admin-approved restructure

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T119, T127, T128

### What to do

"Reestructurar pedido": anyone with edit rights drafts the change; admin approves. On approval, in one transaction: approved undelivered units → stock or scrap (per batch); reported-unapproved units → approve-and-move or reject with reason; unstarted assignments cancelled with notifications; total recalculated; overpayment → saldo a favor.

### Acceptance criteria

- [ ] Clothiers keep pay for approved units moved out of the pedido
- [ ] Stock movements created for units sent to stock; scrap written off with reason
- [ ] One `restructures` row + activity log entry with requester, approver and full summary

---

## T121 — Deliveries in units

**Phase:** 11B — Pedidos
**Status:** pending
**Dependencies:** T112

### What to do

"Registrar entrega": quantities per cell, only from approved undelivered units, with date and who delivered; prefilled with everything deliverable (one click for small pedidos).

### Acceptance criteria

- [ ] Cannot deliver more than approved − delivered per cell
- [ ] Status moves to Entrega parcial / Entregado automatically
- [ ] Logged

---

## 11C — Production

## T122 — Assigning work

**Phase:** 11C — Production
**Status:** pending
**Dependencies:** T112

### What to do

Secretary/admin assign units of a cell to a clothier (from the pedido detail and from Producción). Piece rate copied from the variant; admin can override one assignment's rate with reason.

### Acceptance criteria

- [ ] Cannot assign beyond the cell's unassigned units (optimistic locking)
- [ ] Clothier notified; sees rate and expected earnings
- [ ] Rate override visible to the clothier before work starts; logged

---

## T123 — Mi trabajo (clothier)

**Phase:** 11C — Production
**Status:** pending
**Dependencies:** T122, T115

### What to do

Phone-first screen: **Correcciones** first, then assigned work by delivery date ("Para hoy / Atrasado"), **Disponibles** to claim (choose quantity, up to the claim limit; client pedidos before inventory), release unreported units, report finished units per size.

### Acceptance criteria

- [ ] Claim limit enforced server-side
- [ ] Release only when nothing on the assignment has been reported
- [ ] No client prices anywhere on clothier screens
- [ ] 44 px targets, one-handed use, works offline-tolerant like the current board

---

## T124 — Producción review queue

**Phase:** 11C — Production
**Status:** pending
**Dependencies:** T123

### What to do

Queue of reported units grouped by clothier. Per report: approve N, return M as rework (reason list + free text), scrap K (reason). Returned units reappear first on the clothier's phone; scrapped units re-open as unassigned on the pedido.

### Acceptance criteria

- [ ] Approve + return + scrap ≤ reported (server-checked)
- [ ] Rework is paid once when approved, at the assignment rate
- [ ] Scrapped-unit pay follows the setting
- [ ] Defect reasons stored for analytics

---

## T125 — Cerrar mi jornada

**Phase:** 11C — Production
**Status:** pending
**Dependencies:** T123, T124

### What to do

Clothier closing: today's assignments with "¿Cuántas terminaste hoy?" prefilled from the day's reports; 0 must be confirmed. Secretary/admin approve or correct (reason) in Producción. Reminder notification near closing time.

### Acceptance criteria

- [ ] One closing per clothier per business day
- [ ] Corrections logged with reason; clothier sees the corrected numbers
- [ ] Close-business-day dialog lists clothiers without a closing (warning, not a block)

---

## T126 — Clothier payroll on approved units

**Phase:** 11C — Production
**Status:** pending
**Dependencies:** T124, T125

### What to do

Replace `compute-clothier-earnings` with approved units × assignment rate (plus scrapped units when the setting is on). "Liquidar" blocked until the day's closing is submitted **and** approved, with the reason shown.

### Acceptance criteria

- [ ] Earnings explainable line by line (pedido, size, units, rate)
- [ ] Unit tests: rework paid once, rate overrides, scrapped setting on/off, restructure moves
- [ ] Mis ganancias shows the same figures the cashier settles

---

## 11D — Money and stock

## T127 — Pedido payments and the till

**Phase:** 11D — Money and stock
**Status:** pending
**Dependencies:** T113, T115

### What to do

Record payments (cash / card / transfer) on the pedido; attach to the open business day. **After-hours:** keep `received_at`, attach to the next day on open with note "Pagado fuera de horario el {fecha} a las {hora}". Refunds / applying saldo a favor. Secretary can record payments only when the setting is on.

### Acceptance criteria

- [ ] Balance and Pagado status update immediately
- [ ] After-hours payments attach exactly once to the next opened day (idempotent)
- [ ] Logged with both received time and assigned day

---

## T128 — Stock ledger and Inventario

**Phase:** 11D — Money and stock
**Status:** pending
**Dependencies:** T113, T124

### What to do

Approved units of inventory pedidos create `+` movements automatically. Inventario screen: stock per garment × size × colour, movement history, admin adjustments with reason (cajero view-only).

### Acceptance criteria

- [ ] Stock never negative except through the logged admin override
- [ ] Every movement links to its source (review, sale, adjustment, restructure)

---

## T129 — Vender prenda from stock

**Phase:** 11D — Money and stock
**Status:** pending
**Dependencies:** T128, T127

### What to do

Rebuild Vender prenda: pick garment, colour, size with live availability; block overselling; admin override records a negative adjustment with reason. Sale belongs to the open business day or follows the after-hours rule. Retire the separate `sellProductPiece` path.

### Acceptance criteria

- [ ] Sale creates a `−` stock movement and appears in the till under Prendas
- [ ] Concurrent sales of the last unit: one succeeds, one gets a clear message

---

## T130 — Caja de hoy and close summary by source

**Phase:** 11D — Money and stock
**Status:** pending
**Dependencies:** T127, T129, T125

### What to do

Summary strip and close-day dialog split income into Servicios · Pedidos · Prendas with totals per method and the after-hours line; close dialog adds the clothiers-without-closing warning. Service tickets stay open-day only.

### Acceptance criteria

- [ ] Totals reconcile with the sum of tickets, pedido payments and sales for the day (integration test)
- [ ] After-hours money shown separately on the day it attached to

---

## 11E — Activity log and analytics

## T131 — Activity log coverage

**Phase:** 11E — Log and analytics
**Status:** pending
**Dependencies:** T114 and the actions it covers

### What to do

Call `logActivity` from every action listed in spec §3.9.27 (money, production, stock, pedidos, business day, employees, settings, catalog, auth), including existing ticket/checkout/payroll actions.

### Acceptance criteria

- [ ] A test enumerates server actions and fails when one mutates data without logging
- [ ] Summaries readable in Spanish, money formatted `$12.500`

---

## T132 — Actividad screen and Historial tabs

**Phase:** 11E — Log and analytics
**Status:** pending
**Dependencies:** T131

### What to do

Admin "Actividad": timeline with filters (person, action type, date range, pedido/client), paginated. "Historial" tab on pedido, ticket, client and employee detail; cashier/secretary see it for the record they are working on.

### Acceptance criteria

- [ ] Admin-only Actividad route (RBAC tested)
- [ ] Before/after shown as a readable diff
- [ ] Handles 100k+ entries with indexed filters

---

## T133 — Analítica additions

**Phase:** 11E — Log and analytics
**Status:** pending
**Dependencies:** T127, T126, T128

### What to do

Add sections per spec §3.11: ingresos por fuente; pedidos (cuentas por cobrar, on-time %, overdue, lead time, saldo a favor); producción (units per clothier, return rate, assignment-to-approval time, labour cost vs price per garment type); inventario (on hand, value, sold, slow movers, write-offs). Same periods, comparison and CSV export.

### Acceptance criteria

- [ ] Admin-only; secretary never sees these figures
- [ ] Figures reconcile with the underlying ledgers (tests on seeded data)

---

## 11F — Rollout

## T134 — Navigation and RBAC

**Phase:** 11F — Rollout
**Status:** pending
**Dependencies:** T117, T123, T124, T128, T132

### What to do

Per-role menus: Pedidos, Producción, Inventario, Actividad, Mi trabajo; remove Productos and Pedidos grandes. Update `docs/testing/rbac-matrix` (or equivalent) and middleware per spec §3.8.

### Acceptance criteria

- [ ] RBAC e2e covers every new route for every role
- [ ] Old routes redirect to their replacements

---

## T135 — Retire the old model and reset test data

**Phase:** 11F — Rollout
**Status:** pending
**Dependencies:** T134

### What to do

Drop `craftables`, `craftable_pieces`, `cloth_piece_assignments`, `production_logs`, `large_orders`, `order_items`, `large_order_payments`, `catalog_audit_log` and their code. Script to wipe test pedidos/products/tickets/payments while keeping catalog, employees and settings. Realistic demo seed for the new model (Colombian names, real services and garments).

### Acceptance criteria

- [ ] No references to dropped tables remain (typecheck + grep in CI)
- [ ] Reset script is idempotent and refuses to run without an explicit flag

---

## T136 — E2E, training guide and screenshots

**Phase:** 11F — Rollout
**Status:** pending
**Dependencies:** T135

### What to do

E2E: create pedido → assign/claim → report → review (incl. rework) → close jornada → settle pay → deliver partially → pay (incl. after-hours) → Pagado; inventory pedido → stock → Vender prenda. Update training guides and regenerate screenshots (desktop project only).

### Acceptance criteria

- [ ] Full flow green on chromium and mobile-chrome
- [ ] Training guides cover Pedidos, Producción, Inventario, Mi trabajo, Actividad
