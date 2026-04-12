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

Create the `tickets` table: `id`, `business_day_id` (FK), `employee_id` (FK — the performing stylist), `client_id` (FK nullable), `guest_name` (nullable), `appointment_id` (FK nullable — links to appointments table when ticket is created from an appointment; set automatically in Phase 5), `checkout_session_id` (FK nullable — set when the ticket is closed as part of a batch checkout; references `checkout_sessions.id`), `status` (`logged` | `awaiting_payment` | `closed` | `reopened` | `paid_offline`), `closed_at` (nullable), `closed_by` (nullable), `created_at`, `created_by`.

Add `idempotency_key` (text, nullable, unique) now — the offline policy (T077) decided this must be present from the start, not retrofitted.

Also create the `checkout_sessions` table: `id`, `business_day_id` (FK), `cashier_id` (FK — employee who processed the checkout), `client_id` (FK nullable — the client who paid; set when all tickets in the session belong to the same saved client), `total_amount` (bigint — sum of all ticket totals in the session), `is_partially_reopened` (boolean, default false — set when one or more tickets in the session are reopened after checkout), `created_at`.

### Acceptance criteria

- [ ] Both migrations run without errors
- [ ] Either `client_id` or `guest_name` must be present on tickets (check constraint or app-level)
- [ ] `status` uses a Drizzle `pgEnum` including `paid_offline`
- [ ] `idempotency_key` column exists and has a unique index
- [ ] `appointment_id` column exists as a nullable FK (populated in Phase 5 when a ticket is opened from an appointment)
- [ ] `checkout_session_id` column exists as a nullable FK referencing `checkout_sessions`
- [ ] `checkout_sessions` table created with all required columns
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
- [ ] **Stylist UX:** When logged in as a stylist, the flow is optimized for speed — stylist is pre-selected, prominent "Log service" CTA, minimal steps. Designed and tested **mobile-first** (phone is the primary device for stylists between clients).

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
- [ ] **Cashier UX:** Optimized for desktop information density — status columns or Kanban-style board layout. Keyboard navigation between ticket cards (arrow keys to select, Enter to open checkout).
- [ ] **Stretch:** Keyboard shortcuts — `Ctrl/Cmd+K` or equivalent for quick search/actions; `Enter` to open selected ticket's checkout
- [ ] **Real-time animation:** New tickets fade in with a 2-second highlight; status changes animate the badge colour (300ms transition); closed tickets fade out with a 500ms delay; bulk updates stagger by 100ms
- [ ] Empty state shown when no tickets exist for the current business day (message: "No open tickets — services will appear here as they're logged")

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

## T038 — Checkout flow (cashier) — batch checkout

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T037

### What to do

Build the cashier checkout screen with **batch checkout** support: the cashier selects one or more `awaiting_payment` tickets (typically all tickets for the same customer visit) and checks them out together in a single payment transaction.

On submit: create a `checkout_session` record, record payment(s) via `ticket_payments` (referencing the session), and mark all selected tickets `closed` — all in a single DB transaction.

Add optimistic lock: if another session has already closed any ticket in the batch, return a conflict error.

**Offline checkout:** if the cashier is offline, they can mark selected tickets as `paid_offline` (records method and amount locally). On reconnect, the sync process closes the tickets and creates the checkout_session server-side. Cashier's version always wins on sync conflict.

### Acceptance criteria

- [ ] Cashier can select multiple `awaiting_payment` tickets for batch checkout (default: all tickets for the same client currently awaiting payment)
- [ ] Single-ticket checkout works as a degenerate case of batch checkout
- [ ] Line items shown per ticket with snapshotted prices
- [ ] Batch total computed correctly across all selected tickets (including any override prices)
- [ ] Payment method(s) apply to the batch total (not per-ticket)
- [ ] A `checkout_session` record is created atomically with all ticket closures
- [ ] Concurrent checkout attempt on the same ticket → one succeeds, one receives a clear conflict error
- [ ] On close: all ticket statuses → `closed`, `closed_at` and `closed_by` set; `checkout_session_id` set on each ticket
- [ ] Real-time event fires on close so the board removes all closed tickets
- [ ] **Offline checkout:** when offline, cashier can set tickets to `paid_offline` status with payment method. On sync, checkout_session is created server-side; cashier's version always wins
- [ ] **Ticket reopen from batch:** reopening one ticket detaches it from its `checkout_session` (sets `checkout_session_id = null`, status → `reopened`); the session's `is_partially_reopened` flag is set to true
- [ ] **Post-checkout confirmation screen:** transaction summary (services, client, total, payment breakdown, time). "Print receipt" button (browser print dialog). "Email receipt" if client has email
- [ ] **Confirmation dialog:** uses the destructive confirmation pattern before finalizing
- [ ] **Stretch:** `Enter` key confirms payment on the active dialog; `Escape` cancels/closes modals

---

## T039 — Split payment at checkout

**Phase:** 4A — Tickets and checkout
**Status:** pending
**Dependencies:** T038

### What to do

Allow the cashier to record more than one payment method for a checkout session. Create a `ticket_payments` table: `id`, `checkout_session_id` (FK — references `checkout_sessions.id`), `method` (`cash` | `card` | `transfer`), `amount`, `created_at`. The sum of amounts must equal the session total.

Note: payment is recorded at the **session level** (not per-ticket), since batch checkout groups multiple tickets under one payment transaction.

### Acceptance criteria

- [ ] `ticket_payments` migration runs without errors with `checkout_session_id` FK
- [ ] Cashier can add multiple payment rows before confirming
- [ ] Submit blocked if payment amounts do not sum to the session total
- [ ] Single-method payment works as a special case (one row)
- [ ] `payment_method_enum` reused from T006 shared enum definition

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
- [ ] **Admin override history view:** admin can see a paginated list of all price overrides across all tickets — columns: ticket ID, service, original price, override price, delta (COP), reason, cashier, date. Accessible from the admin settings or reports section

---

## T041 — Edit approval flow (secretary / stylist → cashier)

**Phase:** 4A — Tickets and checkout
**Status:** done
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
- [ ] **Notification grouping:** Multiple notifications of the same type within 5 minutes are grouped (e.g. "3 new edit requests" instead of 3 separate items)
- [ ] **Notification actions:** Where applicable, notifications include an inline action button (e.g. "View request" on an edit approval notification) so the user can act without navigating away
- [ ] **Mark all read:** A "Mark all as read" action in the dropdown header
- [ ] **Persistence:** Notifications auto-archive after 7 days; "Show older" link to view archived
- [ ] **Stretch:** Browser push notifications for critical events (new ticket for cashier, batch assignment for clothier) — requires service worker from T081
- [ ] Empty state in notification dropdown: "No notifications" with a subtle icon

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
- [ ] Empty state shown when no closed tickets exist for the selected day (message: "No closed tickets for this day")
- [ ] **Stretch:** Print stylesheet — `@media print` hides navigation and formats content for A4/Letter paper

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
- [ ] Empty state shown when no business day is open (message + "Open day" CTA); also shown when business day is open but no activity yet
