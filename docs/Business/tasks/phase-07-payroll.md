# Phase 7 — Payroll settlement and audit

> Goal: admin can compute what each employee earned for any period, record the payout, and have a full audit trail with no period paid twice.

---

## T063 — Earnings computation: stylists

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T038

### What to do
Create a server function `computeStylistEarnings(employeeId, businessDayIds[])` that sums `(override_price ?? unit_price) * commission_pct / 100` for all closed ticket items belonging to the employee in the given business days. Exclude tickets flagged `needs_review` (from reopens in T042).

### Acceptance criteria
- [ ] Function returns total earnings and a line-by-line breakdown (ticket, service, amount)
- [ ] Uses snapshotted prices, not live catalog
- [ ] Excludes `needs_review` tickets with a note in the breakdown
- [ ] Handles zero tickets gracefully (returns 0)
- [ ] Unit-tested with at least 3 scenarios (normal, override price, no tickets)

---

## T064 — Earnings computation: clothiers

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T047

### What to do
Create `computeClothierEarnings(employeeId, businessDayIds[])` that sums `cloth_pieces.clothier_pay` for all `approved` batch pieces assigned to the employee in the given business days.

### Acceptance criteria
- [ ] Only `approved` pieces count (not `done_pending_approval`)
- [ ] Returns total and a line-by-line breakdown (batch, piece type, quantity, amount)
- [ ] Unit-tested with at least 2 scenarios

---

## T065 — Earnings computation: secretary

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T021

### What to do
Create `computeSecretaryEarnings(employeeId, businessDayIds[])` that counts business days the employee was expected to work (no `vacation` or `approved_absence` absence) and multiplies by `employees.daily_rate`.

### Acceptance criteria
- [ ] Missed days count (no absence record for the day → employee was expected; missed = still counts unless explicitly marked absent)
- [ ] Vacation and approved_absence days excluded from the count
- [ ] Returns total, day count, and daily rate
- [ ] Unit-tested

---

## T066 — Payouts table migration

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T006

### What to do
Create `payouts`: `id`, `employee_id` (FK), `amount`, `method` (`cash` | `card` | `transfer`), `paid_at`, `period_business_day_ids` (integer array — the business day IDs covered by this payout), `recorded_by`, `notes` (nullable), `created_at`.

Also add `payout_ticket_items`: `payout_id`, `ticket_item_id` (for stylists — links payout to specific items; allows detecting conflicts on reopen). And `payout_batch_pieces`: `payout_id`, `batch_piece_id` (for clothiers).

### Acceptance criteria
- [ ] Migrations run without errors
- [ ] `period_business_day_ids` stored as a Postgres integer array
- [ ] Junction tables exist for linking payouts to the specific work items they cover

---

## T067 — Payout recording UI (admin)

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T063, T064, T065, T066

### What to do
Build the admin payroll screen: select an employee, select a date range (business days), preview computed earnings (with line-by-line breakdown), confirm amount, select payment method, and submit. On submit, create the payout record and mark the covered items as settled.

### Acceptance criteria
- [ ] Admin can select any employee and any range of business days
- [ ] Preview shows breakdown before committing
- [ ] Admin can adjust the amount before confirming (field editable; original computed value shown alongside)
- [ ] On submit: payout record created; covered items linked in junction tables
- [ ] Settled items no longer appear in the "unpaid" list

---

## T068 — Double-pay prevention

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T067

### What to do
Before creating a payout, check that none of the selected business days for the employee have already been covered by a prior payout. Block the submit with a clear error listing the already-settled days.

### Acceptance criteria
- [ ] Server-side check (not just frontend) prevents duplicate settlement
- [ ] Error message lists the conflicting days and the prior payout ID
- [ ] Partial overlap (some days already settled, some not) is clearly communicated

---

## T069 — Employee earnings view (own earnings)

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T063, T064, T065, T015

### What to do
Build the "My earnings" screen for stylists, clothiers, and secretaries. Shows: total earned today, this week, this month; breakdown by job/piece; payout history (what has been paid). Visibility gated by `employees.show_earnings` flag.

### Acceptance criteria
- [ ] Screen only accessible when `show_earnings = true` (returns 404 or redirects if false)
- [ ] Correctly computes earnings for the viewing employee's role and model
- [ ] Payout history shows past payouts with date and amount
- [ ] Responsive — primary use case is a phone

---

## T070 — Unsettled earnings alert

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T067

### What to do
On the admin dashboard, show a badge or section listing employees with unsettled earnings (work done in closed business days but no payout covering those days). Link directly to the payout screen for each employee.

### Acceptance criteria
- [ ] Any closed business day with approved work and no payout triggers the alert
- [ ] Alert disappears once a payout covers the period
- [ ] Alert shown on admin home screen (not buried in a submenu)
