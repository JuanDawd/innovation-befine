# Phase 4 — Daily operations: tickets, checkout, and cloth batches

> Goal: full service-to-payment loop works end to end; cashier dashboard updates live; cloth batches are assignable and trackable.

---

## T033 — Tickets table migration

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T019, T029

### What to do
Create the `tickets` table: `id`, `business_day_id` (FK), `employee_id` (FK — the performing stylist/clothier), `client_id` (FK nullable), `guest_name` (nullable), `status` (`logged` | `awaiting_payment` | `closed` | `reopened`), `closed_at` (nullable), `closed_by` (nullable), `created_at`, `created_by`.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] Either `client_id` or `guest_name` must be present (check constraint or app-level)
- [ ] `status` uses a Drizzle `pgEnum`
- [ ] Requires an open business day (`business_day_id` must reference a non-closed day — enforced at app level)

---

## T034 — Ticket items table migration

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T033, T023

### What to do
Create `ticket_items`: `id`, `ticket_id` (FK), `service_variant_id` (FK), `quantity` (default 1), `unit_price` (snapshot at time of logging — do not read live price), `commission_pct` (snapshot), `override_price` (nullable), `override_reason` (nullable), `created_at`.

Snapshotting price and commission at log time prevents historic records from changing when the catalog changes later.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] `unit_price` and `commission_pct` are copied from the service variant at insert time (never read live)
- [ ] `override_price` can be set only by cashier (enforced at API level)

---

## T035 — Ticket creation (stylist / secretary / cashier)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T034, T031, T028

### What to do
Build the "Log service" flow: select employee (pre-selected if the logged-in user is a stylist), select service and variant, select or create client (or guest), submit. The ticket is created in `logged` status.

### Acceptance criteria
- [ ] Stylist can create a ticket for themselves only
- [ ] Secretary and cashier can create a ticket for any employee
- [ ] Service and variant selector shows only active catalog items
- [ ] Client selector supports saved clients (search) and guest flow
- [ ] Ticket appears on the cashier dashboard immediately (via Pusher event)
- [ ] Cannot create a ticket if no business day is open

---

## T036 — Cashier dashboard with live updates

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T035, T009

### What to do
Build the main cashier screen: a board showing all open tickets grouped by employee. Each card shows: employee name, service, client name, status, and time elapsed. When a ticket is created or updated, Pusher pushes an event and the board updates without a full reload.

### Acceptance criteria
- [ ] Board shows all `logged` and `awaiting_payment` tickets for the current business day
- [ ] Tickets are grouped by employee
- [ ] New ticket appears on the board within 2 seconds of creation (Pusher latency)
- [ ] Status changes (to `awaiting_payment`) visually highlight the card
- [ ] Board is usable on both desktop and tablet/phone

---

## T037 — Ticket status transitions

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T035

### What to do
Implement the allowed status transitions and who can trigger each:
- `logged → awaiting_payment`: stylist (own ticket), secretary, cashier
- `awaiting_payment → closed`: cashier only (happens during checkout T038)
- `closed → reopened`: cashier only
- `reopened → awaiting_payment`: cashier only (re-enters checkout flow)

### Acceptance criteria
- [ ] Each transition has a server action / API route that checks the caller's role
- [ ] Unauthorized transition attempts return 403
- [ ] Status history is not required for MVP (only current status matters)
- [ ] Pusher event fired on every status change

---

## T038 — Checkout flow (cashier)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T037

### What to do
Build the cashier checkout screen for a ticket: show line items with prices, subtotal, and a payment section. Cashier selects payment method(s) and confirms. On confirm: record payment, compute employee earnings contribution, mark ticket `closed`.

### Acceptance criteria
- [ ] Line items shown with snapshotted prices
- [ ] Subtotal computed correctly (including any override prices)
- [ ] Payment method required before closing (cash / card / bank transfer)
- [ ] On close: ticket status → `closed`, `closed_at` and `closed_by` set
- [ ] Pusher event fires on close so the board removes the ticket

---

## T039 — Split payment at checkout

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T038

### What to do
Allow the cashier to record more than one payment method on a single ticket (e.g. part cash, part card). Create a `ticket_payments` table: `id`, `ticket_id` (FK), `method` (`cash` | `card` | `transfer`), `amount`, `created_at`. The sum of amounts must equal the ticket subtotal (validated on submit).

### Acceptance criteria
- [ ] `ticket_payments` migration runs without errors
- [ ] Cashier can add multiple payment rows before confirming
- [ ] Submit blocked if payment amounts do not sum to the ticket total
- [ ] Single-method payment works as a special case (one row)

---

## T040 — Price override at checkout (cashier)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T038

### What to do
Allow the cashier to override the price of any line item at checkout. The override price replaces the snapshotted price for subtotal computation. A reason text is required and stored in `ticket_items.override_reason` (not displayed in the frontend UI to non-admin roles).

### Acceptance criteria
- [ ] Override price field visible to cashier on each line item at checkout
- [ ] Reason text stored in DB
- [ ] Override reason not rendered in any non-admin view
- [ ] Override triggers commission recalculation based on override price

---

## T041 — Edit approval flow (secretary / stylist → cashier)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T035

### What to do
When a secretary or stylist wants to edit a ticket item they logged (e.g. wrong service selected), they submit an edit request. The cashier sees the pending request on the dashboard and approves or rejects it. If approved, the item is updated. Cashier can edit directly without an approval step.

### Acceptance criteria
- [ ] `ticket_edit_requests` table: `id`, `ticket_item_id`, `requested_by`, `new_service_variant_id`, `status` (`pending` | `approved` | `rejected`), `created_at`, `resolved_at`, `resolved_by`
- [ ] Secretary / stylist sees a "Request edit" button (not "Edit" directly)
- [ ] Cashier sees a badge / notification count for pending edit requests
- [ ] Approval updates the ticket item; rejection leaves it unchanged
- [ ] Pusher event notifies the requester of the decision

---

## T042 — Ticket reopen and earnings recompute (cashier)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T038

### What to do
Cashier can reopen a closed ticket. On reopen: status → `reopened`; any payout that included this ticket's earnings is flagged as requiring review (actual payout reversal is a Phase 7 concern — flag it now).

### Acceptance criteria
- [ ] "Reopen" button visible on closed tickets (cashier only)
- [ ] Status transitions correctly
- [ ] Payout records that included this ticket are flagged `needs_review`
- [ ] Cashier must go through checkout again to re-close

---

## T043 — Walk-in flow

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T035

### What to do
Confirm that the ticket creation flow (T035) supports walk-in customers with no prior appointment. There should be no required "appointment" field on the ticket creation form; the link to an appointment is optional (set automatically when a ticket is created from an appointment in Phase 5).

### Acceptance criteria
- [ ] Ticket can be created without linking to any appointment
- [ ] Walk-in tickets appear on the cashier board identically to appointment-derived tickets
- [ ] No UX friction for the most common case (walk-in with a guest name)

---

## T044 — Cloth batches table migration

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T019, T026

### What to do
Create:
- `cloth_batches`: `id`, `business_day_id` (FK), `created_by`, `notes` (nullable), `large_order_id` (FK nullable — linked in Phase 6), `created_at`
- `batch_pieces`: `id`, `batch_id` (FK), `cloth_piece_id` (FK), `assigned_to_employee_id` (FK nullable), `status` (`pending` | `done_pending_approval` | `approved`), `completed_at` (nullable), `approved_at` (nullable), `approved_by` (nullable)

### Acceptance criteria
- [ ] Both migrations run without errors
- [ ] `status` uses Drizzle `pgEnum`
- [ ] `large_order_id` is nullable (standalone batches allowed)

---

## T045 — Cloth batch creation UI (secretary / admin)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T044, T028

### What to do
Build the batch creation form: add pieces by selecting piece type and assigning an employee (or leaving unassigned for the whole batch). Show the batch as a table of rows. Submit creates the batch and piece records.

### Acceptance criteria
- [ ] Secretary and admin can create batches
- [ ] Pieces can be assigned to different clothiers per row
- [ ] Unassigned pieces are visible to all clothiers
- [ ] Batch is linked to the current open business day

---

## T046 — Clothier batch view and piece completion

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T045

### What to do
Build the clothier's home screen: list of batch pieces assigned to them (or unassigned) for the current day. Clothier can mark a piece as done (`done_pending_approval`).

### Acceptance criteria
- [ ] Clothier sees only pieces assigned to them (or unassigned)
- [ ] "Mark as done" button transitions piece to `done_pending_approval`
- [ ] In-app notification sent to secretary/admin when a piece is marked done

---

## T047 — Piece approval flow (secretary / admin)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T046

### What to do
Build the secretary/admin view of pending piece approvals. They can approve (status → `approved`, `approved_at` and `approved_by` set) or directly mark pieces done without waiting for the clothier.

### Acceptance criteria
- [ ] Pending approvals visible in a dedicated section or badge
- [ ] Approve action updates status and timestamps
- [ ] Direct "mark done" by admin bypasses the approval queue
- [ ] Approved piece count feeds into clothier earnings computation (Phase 7)

---

## T048 — In-app notification system (MVP)

**Phase:** 4 — Daily operations
**Status:** pending
**Dependencies:** T009

### What to do
Create a minimal in-app notification system: a `notifications` table (`id`, `recipient_employee_id`, `message`, `link` nullable, `is_read`, `created_at`). A bell icon in the nav shows the unread count. Clicking opens a dropdown list. Pusher delivers new notifications in real time.

### Acceptance criteria
- [ ] Notification created when a batch piece is assigned to a clothier
- [ ] Notification created when a cashier approves or rejects an edit request
- [ ] Bell icon shows unread count badge
- [ ] Clicking a notification marks it read and (if link provided) navigates to the relevant screen
- [ ] Works on mobile and desktop
