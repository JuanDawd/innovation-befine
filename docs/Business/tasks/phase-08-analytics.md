# Phase 8 — Analytics

> Goal: admin can see revenue and employee performance for any day/week/month with comparison to the prior period, without manual work.

---

## T071 — Analytics data queries

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T038, T066

### What to do
Write the core SQL/Drizzle queries powering all analytics views:
- `revenueByPeriod(start, end)` — sum of closed ticket totals (override price applied) within the period.
- `jobsCountByEmployee(start, end)` — count of closed tickets per employee.
- `earningsByEmployee(start, end)` — total computed earnings per employee (using the same logic as T063–T065).
- Each query accepts a date range expressed as business day IDs.

### Acceptance criteria
- [ ] Queries return correct results on a dataset with at least 30 days of seeded data
- [ ] All queries complete in < 500 ms on realistic data (add indexes as needed in T074)
- [ ] Queries are in a shared `packages/db/src/queries/analytics.ts` file

---

## T072 — Daily revenue dashboard

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T071

### What to do
Build the analytics home screen for admin: daily revenue for the current business day (or most recent closed day), total jobs, and total earnings paid out. Include a comparison to the previous business day (delta and percentage).

### Acceptance criteria
- [ ] Shows current day totals prominently
- [ ] Comparison row beneath: "vs yesterday: +X% / -X%"
- [ ] Updates in near-real-time (real-time event on ticket close can trigger a refresh)
- [ ] Responsive

---

## T073 — Weekly and monthly revenue dashboards

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T071

### What to do
Extend the analytics screen with weekly and monthly tabs:
- **Week**: current ISO week revenue, jobs, and earnings; vs prior week.
- **Month**: current calendar month; vs prior month.
Each tab shows the same three metrics (revenue, jobs count, earnings paid).

### Acceptance criteria
- [ ] Tabs or sections for day / week / month
- [ ] Prior period comparison visible in all three
- [ ] Week and month calculations use business days (not calendar dates) to align with the business model
- [ ] Loading state while queries run

---

## T074 — Per-employee performance views

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T071

### What to do
Add a "By employee" section in the analytics screen: a table showing each active employee, their job count, and their earnings for the selected period. Sortable by any column. Clicking an employee opens a drill-down with their day-by-day breakdown.

### Acceptance criteria
- [ ] Table shows all active employees (inactive employees excluded by default; toggle to include)
- [ ] Sortable by name, jobs count, earnings
- [ ] Drill-down shows per-business-day breakdown for the selected period
- [ ] Correct by employee role (stylist uses commission model, clothier uses piece model)

---

## T075 — Analytics database indexes

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T071

### What to do
Analyze the analytics queries (T071) with `EXPLAIN ANALYZE` on Neon and add the necessary indexes. Expected candidates: `tickets(business_day_id, status)`, `ticket_items(ticket_id)`, `batch_pieces(business_day_id, status, assigned_to_employee_id)`.

### Acceptance criteria
- [ ] All analytics queries complete in < 200 ms on 6 months of realistic seeded data
- [ ] No sequential scans on large tables
- [ ] Indexes documented in a comment in the schema file

---

## T101 — Analytics seed script

**Phase:** 8 — Analytics *(new — Senior SWE review F24)*
**Status:** pending
**Dependencies:** T071

### What to do
Create a `db:seed:analytics` script that generates 6 months of realistic business data: randomized tickets across employees, varying daily revenue, some no-shows, cloth batches with approvals, and payouts. This data is needed to test analytics queries (T071–T075) on realistic volumes and to verify that reports render correctly with real-world variance.

### Acceptance criteria
- [ ] Script generates ~180 business days of data (6 months)
- [ ] Data includes variation: weekday vs weekend patterns, different employee workloads, occasional no-shows
- [ ] All analytics queries (T071) return meaningful, non-zero results after seeding
- [ ] Script is idempotent (can be re-run; clears and re-seeds analytics data)
- [ ] Does not affect or overwrite real data if run against a non-empty database (operates in a seeded namespace or requires explicit flag)

---

## T076 — CSV export (stretch)

**Phase:** 8 — Analytics
**Status:** pending
**Dependencies:** T071

### What to do
Add a "Download CSV" button to the analytics screen that exports the selected period's data as a CSV file suitable for sharing with an accountant.

### Acceptance criteria
- [ ] CSV includes: business day date, revenue, jobs count, per-employee earnings
- [ ] File name includes the period (e.g. `innovation-befine-2026-03.csv`)
- [ ] Download works on mobile (opens as a file, not a new tab)
