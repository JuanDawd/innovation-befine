# Phase 7 — Payroll settlement and audit

> Goal: admin can compute what each employee earned for any period, record the payout, and have a full audit trail with no period paid twice.
>
> This phase also includes absence tracking (T020, T021) — moved here from Phase 1 because absence data is only consumed by T065 (secretary earnings). It also includes the deactivation guard (T022b) which requires the payroll system to check for unsettled earnings.

---

## T020 — Absences and vacation table migration

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T012

### What to do

Create the `employee_absences` table: `id`, `employee_id`, `type` (`vacation` | `approved_absence` | `missed`), `date` (calendar date — linked to a business day by date matching), `note` (nullable), `created_by`, `created_at`.

### Acceptance criteria

- [ ] Migration runs without errors
- [ ] `type` uses Drizzle `pgEnum`
- [ ] A given employee cannot have two absence records for the same date (unique constraint on `employee_id + date`)

---

## T021 — Vacation and absence management UI (admin)

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T020

### What to do

Build a UI where admin can add, edit, and delete absence records per employee. Show a monthly calendar view indicating which employees have absences on which days, with colour coding per absence type.

### Acceptance criteria

- [ ] Admin can log vacation, approved absence, or missed day for any employee
- [ ] Calendar view shows coloured indicators per absence type
- [ ] "Who works today" query returns active employees without an absence on the current business day's date
- [ ] Used immediately by T065 (secretary earnings computation)
- [ ] **Calendar UX:** Month grid view with coloured dots per absence type (vacation = blue, approved absence = amber, missed = red). Mobile: simplified to a list grouped by date. Navigation arrows for previous/next month.

---

## T022b — Deactivation guard and termination payment

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T022a, T067

### What to do

Extend the basic deactivation (T022a) with: block deactivation if the employee has unsettled earnings (using the payout system from T067). Add a "termination" path: admin enters a final settlement amount, which creates a payout record covering all outstanding periods, then deactivates immediately.

### Acceptance criteria

- [ ] Attempting to deactivate an employee with unsettled earnings shows a block message listing the unpaid period(s)
- [ ] Termination flow: enter termination amount → create payout record → deactivate account (all in one transaction)
- [ ] After termination payout, no unsettled earnings remain for that employee
- [ ] Deactivation with no outstanding earnings proceeds immediately (no change to T022a flow)

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
**Dependencies:** T021, T020

### What to do

Create `computeSecretaryEarnings(employeeId, businessDayIds[])` that counts business days the employee was expected to work — respecting the employee's `expected_work_days` field (supports part-time employees). A full-time employee (expected_work_days = 6) is expected every business day except absences. A part-time employee (e.g. expected_work_days = 3) is expected on the first N business days of the week (or as defined by a schedule, MVP uses simple count). Multiply days worked by `employees.daily_rate`.

### Acceptance criteria

- [ ] Missed days count (no absence record for the day → employee was expected; missed = still counts unless explicitly marked absent)
- [ ] Vacation and approved_absence days excluded from the count
- [ ] Part-time support: `expected_work_days` from employee record determines how many business days per week the employee is expected. Days worked capped at `expected_work_days` per week.
- [ ] Returns total, day count, daily rate, and expected_work_days
- [ ] Unit-tested with scenarios: full-time (6 days), part-time (3 days), vacation deduction, missed day

---

## T066 — Payouts table migration

**Phase:** 7 — Payroll
**Status:** pending
**Dependencies:** T006

### What to do

Create `payouts`: `id`, `employee_id` (FK), `amount`, `original_computed_amount` (integer — the system-computed amount before any admin adjustment), `adjustment_reason` (text, nullable — required when `amount` differs from `original_computed_amount`), `method` (`cash` | `card` | `transfer`), `paid_at`, `period_business_day_ids` (integer array — the business day IDs covered by this payout), `recorded_by`, `notes` (nullable), `created_at`.

Also add `payout_ticket_items`: `payout_id`, `ticket_item_id` (for stylists — links payout to specific items; allows detecting conflicts on reopen). And `payout_batch_pieces`: `payout_id`, `batch_piece_id` (for clothiers).

### Acceptance criteria

- [ ] Migrations run without errors
- [ ] `period_business_day_ids` stored as a Postgres integer array
- [ ] Junction tables exist for linking payouts to the specific work items they cover
- [ ] `original_computed_amount` column exists and is populated automatically from the earnings computation
- [ ] `adjustment_reason` column exists (text, nullable) and is required when the admin adjusts the payout amount away from the computed value

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
- [ ] Empty state shown when no earnings exist for the period (message: "No earnings recorded for this period")

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
- [ ] Empty state when no unsettled earnings exist (alert area hidden or shows "All earnings settled" message)
