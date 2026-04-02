# Phase 4A — Tickets and checkout

> Goal: full service-to-payment loop works end to end; cashier dashboard updates live; admin has an operational day view.
>
> Phase 4B (cloth batches) can begin in parallel once this phase is done.

---

## T033 — Tickets table migration

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T019, T029

### What to do
Create the `tickets` table: `id`, `business_day_id` (FK), `employee_id` (FK — the performing stylist), `client_id` (FK nullable), `guest_name` (nullable), `status` (`logged` | `awaiting_payment` | `closed` | `reopened`), `closed_at` (nullable), `closed_by` (nullable), `created_at`, `created_by`.

Add `idempotency_key` (text, nullable, unique) now — the offline policy (T077) decided this must be present from the start, not retrofitted.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] Either `client_id` or `guest_name` must be present (check constraint or app-level)
- [ ] `status` uses a Drizzle `pgEnum`
- [ ] `idempotency_key` column exists and has a unique index
- [ ] Requires an open business day (enforced at app level)

---

## T034 — Ticket items table migration

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T033, T023

### What to do
Create `ticket_items`: `id`, `ticket_id` (FK), `service_variant_id` (FK), `quantity` (default 1), `unit_price` (snapshot at time of logging), `commission_pct` (snapshot), `override_price` (nullable), `override_reason` (nullable), `created_at`.

Snapshotting price and commission at log time prevents historic records from changing when the catalog changes later.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] `unit_price` and `commission_pct` are copied from the service variant at insert time (never read live)
- [ ] `override_price` can be set only by cashier (enforced at API level)

---

## T035 — Ticket creation (stylist / secretary / cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T034, T031, T028

### What to do
Build the "Log service" flow: select employee (pre-selected if the logged-in user is a stylist), select service and variant, select or create client (or enter a guest name), submit. The ticket is created in `logged` status.

Walk-in customers are the default: there is no required appointment field; linking to an appointment is optional and set automatically in Phase 5 when a ticket is opened from an appointment card.

The API route must accept an idempotency key so offline replay (Phase 9) does not create duplicate tickets.

### Acceptance criteria
- [ ] Stylist can create a ticket for themselves only
- [ ] Secretary and cashier can create a ticket for any employee
- [ ] Service and variant selector shows only active catalog items
- [ ] Client selector supports saved clients (search) and guest name entry
- [ ] Walk-in ticket can be created without linking to any appointment
- [ ] Ticket appears on the cashier dashboard immediately (via real-time event — T098 abstraction)
- [ ] Cannot create a ticket if no business day is open
- [ ] API accepts `Idempotency-Key` header and returns the same response on duplicate submission

---

## T036 — Cashier dashboard with live updates

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T035, T098

### What to do
Build the main cashier screen: a board showing all open tickets grouped by employee. Each card shows: employee name, service, client name, status, and time elapsed since creation. When a ticket is created or updated, a real-time event (via the `packages/realtime` abstraction) pushes to connected clients and the board updates without a full reload.

### Acceptance criteria
- [ ] Board shows all `logged` and `awaiting_payment` tickets for the current business day
- [ ] Tickets are grouped by employee
- [ ] New ticket appears on the board within 2 seconds of creation
- [ ] Status change to `awaiting_payment` visually highlights the card (e.g. colour change or badge)
- [ ] Board is usable on both desktop and tablet/phone

---

## T037 — Ticket status transitions and permissions

**Phase:** 4A — Tickets and checkout
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
- [ ] Real-time event published on every status change (via T098 abstraction)

---

## T038 — Checkout flow (cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T037

### What to do
Build the cashier checkout screen for a ticket: show line items with prices, subtotal, and a payment section. Cashier selects payment method(s) and confirms. On confirm: record payment, mark ticket `closed`.

Add optimistic lock: if another session has already closed the ticket, return a conflict error rather than silently double-closing.

### Acceptance criteria
- [ ] Line items shown with snapshotted prices
- [ ] Subtotal computed correctly (including any override prices)
- [ ] Payment method required before closing (cash / card / bank transfer)
- [ ] Concurrent checkout attempt on the same ticket → one succeeds, one receives a clear conflict error
- [ ] On close: ticket status → `closed`, `closed_at` and `closed_by` set
- [ ] Real-time event fires on close so the board removes the ticket

---

## T039 — Split payment at checkout

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T038

### What to do
Allow the cashier to record more than one payment method on a single ticket. Create a `ticket_payments` table: `id`, `ticket_id` (FK), `method` (`cash` | `card` | `transfer`), `amount`, `created_at`. The sum of amounts must equal the ticket subtotal.

### Acceptance criteria
- [ ] `ticket_payments` migration runs without errors
- [ ] Cashier can add multiple payment rows before confirming
- [ ] Submit blocked if payment amounts do not sum to the ticket total
- [ ] Single-method payment works as a special case (one row)

---

## T040 — Price override at checkout (cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T038

### What to do
Allow the cashier to override the price of any line item at checkout. A reason text is required and stored in `ticket_items.override_reason` (not displayed in the frontend UI to non-admin roles).

### Acceptance criteria
- [ ] Override price field visible to cashier on each line item at checkout
- [ ] Reason text stored in DB
- [ ] Override reason not rendered in any non-admin view
- [ ] Override triggers commission recalculation based on override price

---

## T041 — Edit approval flow (secretary / stylist → cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T035, T048

### What to do
When a secretary or stylist wants to edit a ticket item they logged, they submit an edit request. The cashier sees the pending request on the dashboard and approves or rejects it. Cashier can edit directly without an approval step.

### Acceptance criteria
- [ ] `ticket_edit_requests` table: `id`, `ticket_item_id`, `requested_by`, `new_service_variant_id`, `status` (`pending` | `approved` | `rejected`), `created_at`, `resolved_at`, `resolved_by`
- [ ] Secretary / stylist sees a "Request edit" button (not a direct "Edit")
- [ ] Cashier sees a badge / notification count for pending edit requests
- [ ] Approval updates the ticket item; rejection leaves it unchanged
- [ ] In-app notification (via T048) sent to the requester on decision

---

## T042 — Ticket reopen and earnings recompute flag (cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T038

### What to do
Cashier can reopen a closed ticket. On reopen: status → `reopened`; any payout that included this ticket's earnings is flagged `needs_review`.

### Acceptance criteria
- [ ] "Reopen" button visible on closed tickets in the history view (cashier only)
- [ ] Status transitions correctly; real-time event fires
- [ ] Payout records that included this ticket are flagged `needs_review`
- [ ] Cashier must go through checkout again to re-close

---

## T048 — In-app notification system (MVP)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T098

### What to do
Create a minimal in-app notification system: a `notifications` table (`id`, `recipient_employee_id`, `message`, `link` nullable, `is_read`, `created_at`). A bell icon in the nav shell (T090) shows the unread count. Clicking opens a dropdown list. Real-time events (via `packages/realtime` abstraction) deliver new notifications instantly.

### Acceptance criteria
- [ ] Notification created when a cashier approves or rejects an edit request (T041)
- [ ] Bell icon in the nav shows unread count badge
- [ ] Clicking a notification marks it read and (if link provided) navigates to the relevant screen
- [ ] Works on mobile and desktop
- [ ] Phase 4B will add clothier piece-assignment notifications; Phase 5 will add appointment notifications

---

## T092 — Closed ticket history view (admin / cashier)

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T038

### What to do
Build an operational history screen: admin and cashier can view all closed tickets for any business day. Each ticket shows employee name, client name, service, total, payment method, and who closed it. Search by client name. This is distinct from the analytics dashboard (Phase 8), which answers aggregate questions.

### Acceptance criteria
- [ ] Defaults to today's closed tickets
- [ ] Navigate to any previous business day
- [ ] Search by client name (saved or guest)
- [ ] Clicking a ticket shows its full detail (line items, payment breakdown, override notes)
- [ ] Responsive

---

## T093 — Admin home / day-at-a-glance screen

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T036, T038

### What to do
Build the admin landing page after login: business day status (open/closed), count of open tickets, revenue collected so far today, and quick-action buttons (open day, go to payroll, go to analytics). This is a live operational view, not historical analytics.

### Acceptance criteria
- [ ] Shows whether the business day is open or closed
- [ ] Live count of open tickets (updates via real-time events)
- [ ] Revenue figure: sum of closed ticket totals for the current business day
- [ ] Quick-action links to key admin screens
- [ ] Unsettled earnings alert badge (stub — will be wired in T070, Phase 7)
