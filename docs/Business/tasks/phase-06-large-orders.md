# Phase 6 — Large cloth orders

> Goal: a large client order can be tracked from deposit through final payment, linked to production batches, without spreadsheets.

---

## T057 — Large orders table migration

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T029

### What to do

Create `large_orders`: `id`, `client_id` (FK — must be a saved client, not guest), `description` (text), `total_price`, `balance_due` (computed in queries: `total_price - sum(payments)` — not stored as a column), `status` (`pending` | `in_production` | `ready` | `delivered` | `paid_in_full` | `cancelled`), `estimated_delivery_at` (nullable), `notes` (nullable), `cancellation_reason` (nullable — required when status is `cancelled`), `cancelled_at` (nullable), `created_by`, `created_at`, `updated_at`. Note: `deposit_paid` column removed — deposit status is computed from the `large_order_payments` table to avoid dual source of truth (M-13 resolution).

Also create `large_order_payments`: `id`, `order_id` (FK), `amount`, `method` (`cash` | `card` | `transfer`), `paid_at`, `recorded_by`.

### Acceptance criteria

- [ ] Both migrations run without errors
- [ ] `status` uses Drizzle `pgEnum`
- [ ] `balance_due` is computed in queries (not stored redundantly)

---

## T058 — Large order creation and edit UI (admin / secretary)

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T057, T030

### What to do

Build the large order form: select saved client, enter description, total price, deposit amount and method, estimated delivery date, and notes. Display the order detail view after creation.

### Acceptance criteria

- [ ] Only saved clients (not guests) can be linked to a large order
- [ ] Initial deposit creates a `large_order_payments` record automatically
- [ ] Order status starts at `pending`
- [ ] Admin and secretary can edit description, total price, ETA, and notes
- [ ] Balance due computed and displayed: `total_price - sum(payments)`

---

## T059 — Order status flow (admin / secretary)

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T058

### What to do

Add status transition buttons to the order detail view: `pending → in_production → ready → delivered → paid_in_full`. Also add a `cancelled` action available from any status except `paid_in_full`. Only admin and secretary can update the status. Each transition records `updated_by` and `updated_at`. Cancellation requires a reason and records `cancelled_at`.

### Acceptance criteria

- [ ] Status can only move forward (no backward transitions without a direct DB override)
- [ ] `cancelled` is reachable from any status except `paid_in_full`; requires a cancellation reason
- [ ] Cancellation of an order with deposits recorded prompts a confirmation noting whether deposits are refundable (business decision: document refund policy)
- [ ] Each transition is timestamped
- [ ] Status badge on the order card/list updates immediately

---

## T060 — Link cloth batches to large orders

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T059, T044

### What to do

When creating a cloth batch (T045), allow optionally selecting a large order to link it to. Update `cloth_batches.large_order_id` (already nullable from T044). On the order detail view, show all linked batches and their completion progress.

### Acceptance criteria

- [ ] Batch creation form has an optional "Linked order" selector
- [ ] Order detail view shows: total pieces across linked batches, approved pieces count, % complete
- [ ] Batch list on the order view links to the batch detail
- [ ] Unlinked batches (standalone production) are unaffected

---

## T061 — Additional payment recording

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T058

### What to do

Allow admin/secretary to record additional payments against a large order over time (e.g. balance payment on delivery). Each payment creates a `large_order_payments` record and updates the displayed balance.

### Acceptance criteria

- [ ] "Record payment" button on order detail view
- [ ] Payment amount, method, and date recorded
- [ ] Balance due updates after each payment
- [ ] Status automatically transitions to `paid_in_full` when balance reaches zero (or admin can trigger manually)
- [ ] Payment history visible on order detail

---

## T062 — Large orders list view

**Phase:** 6 — Large orders
**Status:** pending
**Dependencies:** T059, T061

### What to do

Build the large orders list screen: all orders with client name, status, total price, balance due, and ETA. Filter by status. Admin and secretary can access; cashier read-only.

### Acceptance criteria

- [ ] List sortable by ETA and creation date
- [ ] Filter by status
- [ ] Balance due highlighted in a warning color if order is `delivered` but not `paid_in_full`
- [ ] Responsive — works on mobile
- [ ] Empty state shown when no large orders exist (message + "Create order" CTA)

> **Role clarification (T06R-R3):** The app has four roles — `cashier_admin`, `secretary`, `stylist`, `clothier`. There is no standalone cashier role. Both `cashier_admin` and `secretary` have full read/write access to large orders. Stylist and clothier have no access (enforced by server actions). The original "cashier read-only" clause is removed as there is no matching role.
