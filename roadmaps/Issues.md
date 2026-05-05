# Issues Triage Queue

> This is NOT a roadmap. This is a living triage queue for client-reported bugs, operational gaps, and field issues discovered after MVP launch. Each issue is categorised by severity and status.
>
> **Workflow:** Bugs → move to `Stabilization.md`. Features → move to `PostMVP.md`. Update status to `Moved` with a reference when promoted. Only open/active issues live here; resolved and closed items are archived in the Resolution Log at the bottom.
>
> **Severity:** Critical (data loss / security / financial error) · High (significant rework if missed) · Medium (important, not blocking) · Low (polish / edge case)
> **Status:** Open · In Progress · Waiting · Moved · Closed

---

## Critical

---

## Issue ID: ISS-001

- **Title:** SSE channels are publicly subscribable — no auth gate
- **Description:** The SSE route handler at `/api/realtime/[channel]` performs no session or role check. Any unauthenticated HTTP client can stream real-time ticket events, notification IDs, and employee PII from the `cashier` and `notifications` channels.
- **Steps to Reproduce:**
  1. Without a session cookie, send `GET /api/realtime/cashier` with an `Accept: text/event-stream` header.
  2. Observe that the connection is accepted and events are streamed.
- **Expected Behavior:** Unauthenticated request is rejected with 401.
- **Actual Behavior:** Stream is opened and events delivered without authentication.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Require a valid session in the SSE route handler (`auth.api.getSession`). Gate per channel: `cashier` → `cashier_admin` only; `notifications` → any authenticated user scoped to their own `employee_id`.

---

## Issue ID: ISS-002

- **Title:** Deactivated employees can log in again after session revocation
- **Description:** `deactivateEmployee()` revokes active sessions via `auth.api.revokeUserSessions()` but does not ban the user in Better Auth. A deactivated employee can immediately create a new session by logging in again.
- **Steps to Reproduce:**
  1. Deactivate an employee from the admin panel.
  2. On a separate browser, attempt to log in with that employee's credentials.
  3. Observe that login succeeds.
- **Expected Behavior:** Login attempt is blocked with an "account deactivated" error.
- **Actual Behavior:** Login succeeds and the employee can access the system.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** In `deactivateEmployee()`, call `auth.api.banUser({ userId, banReason: "Employee deactivated" })` before revoking sessions.

---

## Issue ID: ISS-003

- **Title:** `neon-http` driver breaks all `db.transaction()` calls
- **Description:** The Neon HTTP driver does not support transactions — calling `db.transaction()` throws `"No transactions support in neon-http driver"`. All financial and state-mutating transactions fail at runtime.
- **Steps to Reproduce:**
  1. Switch `packages/db/src/index.ts` to the `neon-http` driver.
  2. Attempt a checkout, ticket creation, or batch creation.
  3. Observe an unhandled `Error: No transactions support in neon-http driver`.
- **Expected Behavior:** Transactions work correctly.
- **Actual Behavior:** All transaction call sites throw at runtime.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Revert `packages/db/src/index.ts` to the WebSocket Pool driver (`drizzle-orm/neon-serverless`). Never use `drizzle-orm/neon-http` — it is incompatible with `db.transaction()`.

---

## Issue ID: ISS-004

- **Title:** `/large-orders/*` is unreachable for every authenticated role
- **Description:** The middleware `roleCanAccess()` only allows paths that start with the role's home prefix or appear in `SHARED_APP_PATHS`. `/large-orders` matches neither, so every request is rewritten to `/403`. The large-orders nav link is dead.
- **Steps to Reproduce:**
  1. Sign in as `cashier_admin`.
  2. Click the "Pedidos grandes" nav link.
  3. Observe a 403 page.
- **Expected Behavior:** Admin and secretary can access `/large-orders`.
- **Actual Behavior:** Every role receives a 403.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Register `/large-orders` in `SHARED_APP_PATHS` and enforce role gating at the page/action layer.

---

## Issue ID: ISS-005

- **Title:** `price_change_acknowledged` default inverted — first price change never notifies
- **Description:** `appointments.price_change_acknowledged` defaults to `false`. Every newly-booked appointment starts already "needing acknowledgement" even with no price change. The `editVariant` filter excludes fresh appointments, so the first price change after a booking never sends a notification.
- **Steps to Reproduce:**
  1. Book a new appointment.
  2. Edit the service variant price.
  3. Observe that no in-app notification is created for the new appointment.
- **Expected Behavior:** A notification is created for every appointment affected by a price change.
- **Actual Behavior:** Fresh appointments are excluded by the dedup filter due to the inverted default.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Flip the column default to `true`. Add a backfill migration. Adjust the `editVariant` filter and UI badge condition accordingly.

---

## Issue ID: ISS-006

- **Title:** `recordPayout` double-pay check is outside the transaction — race condition
- **Description:** The conflict scan in `recordPayout` runs before the transaction opens. Two admins clicking "Confirm" simultaneously both pass the check, then both insert overlapping payouts.
- **Steps to Reproduce:**
  1. Open the payroll page as two admin users simultaneously.
  2. Both select the same employee and same days.
  3. Both click "Confirm" within the same window.
  4. Observe two payout rows for the same employee + days.
- **Expected Behavior:** Only one payout is created; the second returns a `CONFLICT` error.
- **Actual Behavior:** Two payouts are inserted, doubling the employee's pay.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Move the conflict check inside the transaction with a `SELECT ... FOR UPDATE` lock. Or use a `payout_period_days(payout_id, business_day_id, employee_id)` junction table with `UNIQUE(employee_id, business_day_id)`.

---

## Issue ID: ISS-007

- **Title:** `payouts` table missing `idempotency_key` — retry creates duplicate payouts
- **Description:** `payouts` has no `idempotency_key` column with a unique constraint. Any retry (accidental double-click, network retry) creates a second payout record.
- **Steps to Reproduce:**
  1. Click "Record payout" and immediately click again before the response returns.
  2. Observe two payout rows for the same employee + days.
- **Expected Behavior:** Duplicate submission returns the existing payout with no second row inserted.
- **Actual Behavior:** Two payout rows are created.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Add `idempotency_key uuid NOT NULL UNIQUE` to the `payouts` table. Generate a UUID client-side when the user opens the preview screen. Use `INSERT ... ON CONFLICT DO NOTHING RETURNING *`.

---

## Issue ID: ISS-008

- **Title:** Analytics silently excludes the currently-open business day
- **Description:** `getBusinessDayIdsByPeriod` filters `closedAt IS NOT NULL` for both current and prior windows. Admins see revenue=0 and jobs=0 for "today" even while tickets are actively closing.
- **Steps to Reproduce:**
  1. Open a business day and close several tickets.
  2. Open the analytics dashboard and select "Hoy".
  3. Observe revenue = $0 and jobs = 0 despite closed tickets.
- **Expected Behavior:** Analytics includes closed tickets from the currently-open business day.
- **Actual Behavior:** The open day is silently excluded from all analytics windows.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Drop `closedAt IS NOT NULL` from the current-window filter. Keep it only on the prior window.

---

## Issue ID: ISS-009

- **Title:** `earningsByEmployee` returns $0 for all secretaries
- **Description:** `earningsByEmployee` only aggregates stylist commission and clothier piece_rate. The `getAnalyticsSummary` call never supplements with secretary earnings. Secretaries never appear in the per-employee performance table and the total earnings figure is understated.
- **Steps to Reproduce:**
  1. Have a secretary work several days in a period.
  2. Open analytics → per-employee table.
  3. Observe the secretary is absent from the table.
- **Expected Behavior:** Secretary appears in the table with earnings = `daily_rate × days_worked`.
- **Actual Behavior:** Secretary is absent; top-line earnings figure is understated by their full salary.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Add a secretary branch to the SQL aggregation or call `computeSecretaryEarnings` per secretary in application code and merge results. Add a parity test.

---

## Issue ID: ISS-010

- **Title:** `paidOffline` checkout flow is a stub — mutations stuck in queue forever
- **Description:** `MutationType` declares `"paidOffline"` but `dispatchMutation` has no handler for it. No `processPaidOfflineCheckout` server action exists. Cashiers who go offline and enqueue a payment see it stuck in the queue indefinitely.
- **Steps to Reproduce:**
  1. Simulate offline mode.
  2. Attempt to check out a ticket.
  3. Reconnect to the internet.
  4. Observe the mutation never flushes.
- **Expected Behavior:** On reconnect, the queued `paidOffline` mutation flushes and the ticket closes.
- **Actual Behavior:** The mutation stays in the queue forever.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Implement `processPaidOfflineCheckout` and wire the `"paidOffline"` branch in `dispatchMutation`.

---

## Issue ID: ISS-011

- **Title:** `createTicket` not wired to shared idempotency helper
- **Description:** `markPieceDone` uses the shared `idempotency_keys` table helper; `createTicket` uses a column-level dedup instead. The two mechanisms are not reconciled and other mutations (claimPiece, approvePiece, recordPayout) have no idempotency guard at all.
- **Steps to Reproduce:**
  1. Create a ticket offline.
  2. Reconnect and observe two ticket rows if the connection dropped after the insert but before the response.
- **Expected Behavior:** Duplicate ticket creation with the same key returns the existing ticket.
- **Actual Behavior:** Depends on timing — potential for duplicates if the column-level constraint is not hit.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Wire `createTicket` to `checkIdempotency`/`storeIdempotency`. Document the idempotency strategy per route.

---

## Issue ID: ISS-012

- **Title:** `getUnsettledPeriodsForEmployee` blocks deactivation for every employee
- **Description:** The function returns every closed business day without a payout for the employee, without checking if the employee actually worked those days. A newly hired stylist is treated as having unsettled earnings for the entire company history.
- **Steps to Reproduce:**
  1. Hire a new employee today.
  2. Attempt to deactivate them the same day.
  3. Observe that deactivation is blocked due to "unsettled earnings" on days before they were hired.
- **Expected Behavior:** Only days where the employee actually earned money count as unsettled.
- **Actual Behavior:** Every historical closed day counts as unsettled.
- **Severity:** Critical
- **Status:** Closed
- **Suggested Fix:** Use role-aware detection: stylist → closed ticket days; clothier → approved piece days; secretary → closed days within hire/termination window minus absences.

---

---

## High

---

## Issue ID: ISS-013

- **Title:** T022b termination has no UI flow — feature is dead code
- **Description:** `terminateEmployee` server action exists but the only deactivation button in the UI calls `deactivateEmployee`. When that returns `CONFLICT`, the admin sees "use the termination option" — but no termination option exists. The entire feature is inaccessible.
- **Steps to Reproduce:**
  1. Attempt to deactivate an employee with unsettled earnings.
  2. Observe the CONFLICT error message telling you to "use termination."
  3. Search the UI for a "termination" option — none exists.
- **Expected Behavior:** A Termination Dialog opens showing the unsettled amount and a Confirm button.
- **Actual Behavior:** There is no termination UI. The feature is dead code.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** When `deactivateEmployee` returns `CONFLICT`, open a Termination Dialog using the `ConfirmationDialog` pattern.

---

## Issue ID: ISS-014

- **Title:** Phase 7 financial logic has zero real unit tests
- **Description:** All 23 tests in `earnings.test.ts` reimplemented the helper functions locally rather than importing the real modules. Production payroll logic is untested. The `needs_review` exclusion, `approved`-only filter, and banker's rounding are unverified.
- **Steps to Reproduce:**
  1. Open `apps/web/src/lib/payroll/__tests__/earnings.test.ts`.
  2. Observe that no test imports `computeStylistEarnings`, `computeClothierEarnings`, or `computeSecretaryEarnings`.
- **Expected Behavior:** Tests import and exercise the real production functions.
- **Actual Behavior:** Tests exercise local stubs that do not reflect production code.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** Replace inline reimplementations with imports from real modules. Add a Drizzle test harness with transaction rollback.

---

## Issue ID: ISS-015

- **Title:** Earnings pages unreachable — missing nav entries
- **Description:** `/stylist/earnings`, `/clothier/earnings`, and `/secretary/earnings` exist as routes but `NAV_ITEMS` for these roles has no entry pointing to them. Employees with `show_earnings = true` cannot find their earnings page.
- **Steps to Reproduce:**
  1. Sign in as a stylist.
  2. Inspect the sidebar nav.
  3. Observe no "Mis ganancias" or equivalent link.
- **Expected Behavior:** A nav entry for each role points to their earnings page, visible when `show_earnings = true`.
- **Actual Behavior:** No nav entry exists; page is unreachable through normal navigation.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** Add conditional nav entries per role. On mobile, add as a second tab in the bottom bar.

---

## Issue ID: ISS-016

- **Title:** Analytics dashboard has no real-time refresh on ticket close
- **Description:** The analytics dashboard has no subscription to the `packages/realtime` SSE channel. Admins must manually reload to see updated numbers after checkouts. The T072 AC explicitly requires near-real-time updates.
- **Steps to Reproduce:**
  1. Open analytics dashboard in one tab.
  2. Close a ticket in another tab.
  3. Observe that revenue on the dashboard does not update.
- **Expected Behavior:** Dashboard updates within seconds of a ticket closing.
- **Actual Behavior:** Dashboard shows stale data until manual reload.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** Subscribe to the `cashier` SSE channel's `ticket.closed` event. On receipt, refetch the current period (throttled to 1 refresh/5s).

---

## Issue ID: ISS-017

- **Title:** `editEmployee` has no optimistic lock — concurrent edits clobber each other
- **Description:** `editEmployee` does a plain `UPDATE employees SET ... WHERE id = $1` with no `version` column. Two admins editing the same employee simultaneously overwrite each other silently. For a row that drives payroll (`dailyRate`, `expectedWorkDays`), a stale write produces silently wrong settlements.
- **Steps to Reproduce:**
  1. Open the edit form for an employee in two browser tabs simultaneously.
  2. Change `dailyRate` in tab A and save.
  3. Change `commissionPct` in tab B (with the old `dailyRate` still loaded) and save.
  4. Observe tab A's `dailyRate` change is lost.
- **Expected Behavior:** The second save returns `STALE_DATA` and prompts the user to reload.
- **Actual Behavior:** The second save silently overwrites all fields including tab A's change.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** Add `version` to the `employees` table. Include `WHERE id = $1 AND version = $expected` in the UPDATE. Return `STALE_DATA` on zero-row update.

---

## Issue ID: ISS-018

- **Title:** `recordLargeOrderPayment` allows overpayment and unsafe auto-transition
- **Description:** Three related defects: (1) `amount` has no upper bound — the ledger records excess while balance clamps to 0 via `Math.max`. (2) Auto-transition to `paid_in_full` checks order status from a pre-transaction read, not inside the transaction. (3) Two concurrent payments that each zero the balance can both trigger the `paid_in_full` update.
- **Steps to Reproduce:**
  1. Create a large order for $100.000.
  2. Record a payment of $999.999.999.
  3. Observe the balance shows $0 but $999.899.999 in excess was recorded.
- **Expected Behavior:** Payment amount is capped at the outstanding balance. Concurrent payments are serialised.
- **Actual Behavior:** Overpayment is accepted silently. Concurrent race is possible.
- **Severity:** High
- **Status:** Closed
- **Suggested Fix:** Reject when `amount > max(0, totalPrice - totalPaid)`. Re-read order row inside the transaction with `FOR UPDATE`. Bump `version` on every write.

---

---

## Medium

---

## Issue ID: ISS-019

- **Title:** Cashier and clothier missing from catalog read access list (T028)
- **Description:** T028 lists stylists and secretary as having catalog read access but does not include cashiers (who need service data for checkout) or clothiers (who need piece data for batch views).
- **Steps to Reproduce:**
  1. Sign in as `clothier`.
  2. Open a batch and attempt to view piece details.
  3. Observe a permission error or missing data.
- **Expected Behavior:** Cashiers can read service/variant data; clothiers can read cloth-piece catalog data.
- **Actual Behavior:** Read access is not granted to these roles.
- **Severity:** Medium
- **Status:** Open
- **Suggested Fix:** Add `cashier_admin` to service/variant read access and `clothier` to cloth-piece catalog read access in T028 implementation.

---

## Issue ID: ISS-020

- **Title:** Spreadsheet import has no validation or rollback
- **Description:** The data migration import script (T100) handles duplicate detection but has no validation rules for imported data (phone format, email format, name length) and no rollback mechanism if bad data is introduced.
- **Steps to Reproduce:**
  1. Import a spreadsheet with malformed phone numbers.
  2. Observe that bad records are imported without error.
- **Expected Behavior:** Invalid rows are flagged and rejected before any data is written.
- **Actual Behavior:** Invalid data is imported silently.
- **Severity:** Medium
- **Status:** Open
- **Suggested Fix:** Add input validation to the import script. Create a backup point before import or tag imported records for easy identification and rollback.

---

## Issue ID: ISS-021

- **Title:** iOS PWA — no install prompt or documented workaround for staff
- **Description:** The PWA install prompt appears on Android Chrome but not on iOS Safari. Staff likely use iPhones. No "Add to Home Screen" instructions exist for iOS users.
- **Steps to Reproduce:**
  1. Open the app on an iPhone in Safari.
  2. Observe no install prompt.
- **Expected Behavior:** iOS users have documented instructions for adding the app to their home screen.
- **Actual Behavior:** No guidance exists; iOS users may not discover the PWA workflow.
- **Severity:** Medium
- **Status:** Open
- **Suggested Fix:** Document iOS PWA "Add to Home Screen" workflow in the training guide (T088).

---

## Issue ID: ISS-022

- **Title:** Resend free tier may not cover daily email volume
- **Description:** Resend free tier allows 100 emails/day. If 80+ appointments generate confirmation and potential rescheduling emails daily, the limit could be reached. No volume estimate exists.
- **Steps to Reproduce:**
  1. Book 80+ appointments in one day.
  2. Send confirmation emails to each.
  3. Observe Resend rate limit being hit.
- **Expected Behavior:** Email delivery is reliable under expected daily volume.
- **Actual Behavior:** Unknown — no volume estimate has been done.
- **Severity:** Medium
- **Status:** Open
- **Suggested Fix:** Estimate daily email volume and document in `docs/research/notification-channels.md`. Plan for the $20/mo Pro tier if needed.

---

## Issue ID: ISS-023

- **Title:** No account lockout UX message after rate limiting on login
- **Description:** Better Auth rate limits the login endpoint, but the login UI does not show what message to display after too many failed attempts (e.g., "Too many attempts, try again in X minutes").
- **Steps to Reproduce:**
  1. Attempt to log in with incorrect credentials 10 times rapidly.
  2. Observe that the UI shows the same generic error with no indication of rate limiting or retry time.
- **Expected Behavior:** After exceeding the rate limit, the UI shows "Too many attempts. Try again in X minutes."
- **Actual Behavior:** Generic error message with no rate-limit context.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Add rate-limit feedback message to the login form. Detect the rate-limit error code and render the appropriate localised copy.

---

## Issue ID: ISS-024

- **Title:** No password complexity rules beyond minimum length
- **Description:** Password validation only rejects passwords shorter than 8 characters. No requirements for mixed case, numbers, or special characters. Not documented as a conscious decision.
- **Steps to Reproduce:**
  1. Set a password of "aaaaaaaa" (8 lowercase letters).
  2. Observe it is accepted.
- **Expected Behavior:** Either: complexity rules are enforced, or the decision to omit them is explicitly documented.
- **Actual Behavior:** No complexity rules; decision undocumented.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Document as a conscious decision or add complexity rules to the password change form.

---

## Issue ID: ISS-025

- **Title:** No pagination on catalog audit log
- **Description:** The catalog audit log (T025) has no pagination or date filtering. On a frequently-edited catalog, the log grows unbounded and the page becomes slow.
- **Steps to Reproduce:**
  1. Edit a service variant 500+ times over several months.
  2. Open the audit log.
  3. Observe all 500+ rows rendered without pagination.
- **Expected Behavior:** Audit log is paginated or filterable by date range.
- **Actual Behavior:** All rows rendered in a single list.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Add pagination to the audit log display (page size 50).

---

## Issue ID: ISS-026

- **Title:** No maximum variant count per service
- **Description:** A service can have unlimited variants. A catalog with 50+ variants per service produces an unwieldy admin UI with no warning or soft limit.
- **Steps to Reproduce:**
  1. Add 20+ variants to a single service.
  2. Observe the admin UI becomes difficult to navigate.
- **Expected Behavior:** A warning or soft limit is shown when the variant count exceeds a configurable threshold (e.g., 10).
- **Actual Behavior:** No limit or warning exists.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Show a UI warning when more than 10 variants are added.

---

## Issue ID: ISS-027

- **Title:** Polling every 5 minutes may be aggressive for version check
- **Description:** Each open tab polls `/api/version` every 5 minutes (T102). With many staff members and tabs, this adds unnecessary API load.
- **Steps to Reproduce:**
  1. Open 10 staff tabs simultaneously.
  2. Observe 10 requests per 5-minute interval to `/api/version`.
- **Expected Behavior:** Version check frequency is tuned to avoid unnecessary load.
- **Actual Behavior:** Every tab polls at a fixed 5-minute interval regardless of activity.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Increase interval to 15 minutes or use the service worker (T081) to consolidate the check.

---

## Issue ID: ISS-028

- **Title:** No soft-launch / canary rollout strategy for go-live
- **Description:** The T089 production cutover checklist is all-or-nothing. A phased rollout (admin uses the app for 1 week before stylists onboard) would reduce go-live risk.
- **Steps to Reproduce:** N/A — this is a process gap.
- **Expected Behavior:** Go-live plan includes a phased rollout section.
- **Actual Behavior:** No phased rollout strategy is documented.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Add a phased rollout recommendation to T089: admin-only for week 1, then stylists/clothier, then secretary.

---

## Issue ID: ISS-029

- **Title:** Brand logo missing from confirmation email template
- **Description:** The appointment confirmation email template (T055) specifies content but does not require brand assets (logo, colours) from T105. Emails are unbranded.
- **Steps to Reproduce:**
  1. Send an appointment confirmation email.
  2. Observe no brand logo or brand colours in the email.
- **Expected Behavior:** Email header includes the Innovation Befine brand logo from T105.
- **Actual Behavior:** Email is unbranded.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Add brand assets to the email template requirements. Pull logo from `public/brand/`.

---

## Issue ID: ISS-030

- **Title:** Confirmation email client-facing link — security undefined
- **Description:** The research notes mention a "confirm/cancel link" in the email, but the app is staff-internal. How a non-user (the client) interacts with this link, including authentication and security, is undefined.
- **Steps to Reproduce:** N/A — design gap.
- **Expected Behavior:** A decision is documented: either a tokenized public link or manual secretary confirmation.
- **Actual Behavior:** The mechanism is undefined.
- **Severity:** Low
- **Status:** Open
- **Suggested Fix:** Document the endpoint design. If client self-service is not planned, remove "confirm/cancel link" from email requirements.

---

---

## Resolution Log

| Issue ID | Title (short)                                 | Resolution                                                                  | Date       | Reference |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------- | ---------- | --------- |
| ISS-001  | SSE no auth gate                              | Added session check to SSE handler; removed /api/realtime from SHARED_PATHS | 2026-04-24 | T04R-R1   |
| ISS-002  | Deactivated employee can re-login             | Added `auth.api.banUser()` to `deactivateEmployee()`                        | 2026-04-24 | T01R-R1   |
| ISS-003  | neon-http breaks transactions                 | Reverted to WebSocket Pool driver                                           | 2026-04-24 | T05R-R1   |
| ISS-004  | /large-orders unreachable                     | Registered `/large-orders` in `SHARED_APP_PATHS`                            | 2026-04-24 | T06R-R1   |
| ISS-005  | price_change_acknowledged inverted            | Flipped column default to `true`; backfill migration added                  | 2026-04-24 | T05R-R2   |
| ISS-006  | recordPayout race condition                   | Moved conflict check inside transaction with `FOR UPDATE`                   | 2026-04-24 | T10R-R4   |
| ISS-007  | payouts missing idempotency_key               | Added `idempotency_key uuid UNIQUE` to payouts table                        | 2026-04-24 | T10R-R4   |
| ISS-008  | Analytics excludes open business day          | Removed `closedAt IS NOT NULL` from current-window filter                   | 2026-04-24 | T10R-R4   |
| ISS-009  | earningsByEmployee returns $0 for secretaries | Added secretary branch to analytics aggregation                             | 2026-04-24 | T10R-R4   |
| ISS-010  | paidOffline flow is a stub                    | Implemented `processPaidOfflineCheckout` + wired mutation branch            | 2026-04-24 | T10R-R4   |
| ISS-011  | createTicket not using idempotency helper     | Wired `createTicket` to `checkIdempotency`/`storeIdempotency`               | 2026-04-24 | T10R-R4   |
| ISS-012  | getUnsettledPeriodsForEmployee overcounts     | Replaced with role-aware detection using actual worked days                 | 2026-04-24 | T10R-R4   |
| ISS-013  | Termination has no UI                         | Added Termination Dialog using ConfirmationDialog pattern                   | 2026-04-24 | T10R-R4   |
| ISS-014  | Phase 7 zero real unit tests                  | Replaced inline stubs with real module imports + test harness               | 2026-04-24 | T07R-R9   |
| ISS-015  | Earnings pages unreachable                    | Added conditional nav entries per role                                      | 2026-04-24 | T10R-R4   |
| ISS-016  | Analytics no real-time refresh                | Subscribed to `ticket.closed` SSE event; throttled refetch                  | 2026-04-24 | T10R-R4   |
| ISS-017  | editEmployee no optimistic lock               | Added `version` column; WHERE includes version check                        | 2026-04-24 | T10R-R4   |
| ISS-018  | recordLargeOrderPayment allows overpayment    | Amount bounded to outstanding balance; FOR UPDATE on order row              | 2026-04-24 | T06R-R2   |
