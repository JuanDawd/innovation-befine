# Issues tracker — Innovation Befine

> **Purpose:** Living document that captures gaps, loopholes, inconsistencies, and risks discovered during project audits and development. Every issue found during development **must** be logged here with a severity, status, and resolution.
>
> **Last audit:** April 2026 (pre-development comprehensive audit + two independent project assessments + stakeholder decision session)

---

## Severity definitions

| Severity     | Meaning                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Critical** | Blocks delivery or could cause data loss, financial errors, or security breaches            |
| **High**     | Significant gap that will cause rework if not addressed before or during the affected phase |
| **Medium**   | Important improvement that should be addressed but won't block progress                     |
| **Low**      | Minor polish, documentation cleanup, or edge case worth noting                              |

## Status definitions

| Status          | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| **Open**        | Issue identified, not yet resolved                     |
| **In progress** | Actively being addressed                               |
| **Resolved**    | Fix applied; reference the commit or task              |
| **Won't fix**   | Consciously decided not to address; document rationale |

---

## Critical issues

### C-01 — Missing `appointment_id` column on tickets table

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T033 (tickets migration), T053 (appointment status), T035 (ticket creation)
- **Description:** T053 says "completing an appointment optionally links to a ticket" and T035 says "linking to an appointment is optional and set automatically in Phase 5." However, the `tickets` table schema in T033 has no `appointment_id` column. Without this FK, there is no mechanism to connect tickets to appointments.
- **Fix:** Add `appointment_id (FK nullable)` to the T033 schema definition.

### C-02 — Dependency graph missing P4B → P7 edge

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** `project-plan.md` dependency graph, Phase 7 (payroll)
- **Description:** Phase 7 computes clothier earnings from approved batch pieces (T064 depends on T047, which is in Phase 4B). The mermaid dependency graph only shows `P4A --> P7`, not `P4B --> P7`. Phase 7 could theoretically start before cloth batch approvals exist, making clothier payroll untestable.
- **Fix:** Add `P4B --> P7` edge to the dependency graph in `project-plan.md`.

### C-03 — Currency decision still unresolved

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T099 (i18n), every UI that displays money, earnings computations
- **Description:** The open question "Confirm the currency used by the business (COP, USD, or other)" blocks T099 and every money-display task. COP has no cents (integer storage = whole pesos), while USD uses cents. This affects `formatMoney()`, decimal separators, and all price display logic.
- **Fix:** Confirmed: **COP (Colombian Pesos)**. No cents — integer storage = whole pesos. `formatMoney(pesos)` uses Colombian locale (e.g. "$12.500"). T099 ACs updated.

### C-04 — No data privacy/compliance research

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** Entire project
- **Description:** The app stores PII (client names, phone, email, appointment history) and financial data (employee pay, payments). Latin American countries have data protection laws (Colombia: Ley 1581 de 2012, Brazil: LGPD, Mexico: LFPDPPP). No research document addresses compliance, data retention policies, or right-to-deletion requirements. The soft-delete pattern (preserving history) may conflict with deletion requests.
- **Fix:** Created `docs/research/data-privacy-compliance.md` covering Colombian Ley 1581 de 2012, PII inventory, consent model, anonymization-over-deletion approach, data retention policy, cross-border transfer considerations, and SIC registration requirements.

### C-05 — Deactivated employees can still log in

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T01R-R1)
- **Affected:** T022a (basic employee deactivation)
- **Description:** `deactivateEmployee()` revokes active sessions via `auth.api.revokeUserSessions()` but does NOT ban the user in Better Auth. A deactivated employee can immediately create a new session by logging in again. Better Auth has a built-in ban mechanism (`banned`, `banReason` columns on the users table, plus `auth.api.banUser()`). The T022a acceptance criteria explicitly states "login attempt is blocked", which is currently unmet.
- **Fix:** In `deactivateEmployee()`, call `auth.api.banUser({ userId, banReason: "Employee deactivated" })` before revoking sessions. The login form already handles 403 (banned) responses — it shows the `invalidCredentials` error message. Tracked as T01R-R1.

### C-06 — SSE channels are publicly subscribable (no auth gate)

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T098 (realtime abstraction), T036 (cashier dashboard), T048 (notifications)
- **Description:** `middleware.ts` treats `/api/realtime` as a "shared" path and short-circuits with `NextResponse.next()` before the session lookup (`isPublic(pathname) || isShared(pathname)` branch). The route handler at `apps/web/src/app/api/realtime/[channel]/route.ts` also performs no session or role check. Any unauthenticated HTTP client can `GET /api/realtime/cashier` and stream real-time ticket events (IDs, status transitions, `edit_requested` badges). The `notifications` channel leaks notification IDs and recipient employee IDs. Combined with browser-side event shapes, this exposes operational data and employee PII.
- **Fix:** Require a valid session in the SSE route handler (`auth.api.getSession`). Gate per-channel: `cashier` → `cashier_admin` only; `clothier` → `clothier` only; `notifications` → any authenticated user (but scope events to the caller's `employee_id` server-side). Remove `/api/realtime` from `SHARED_PATHS` so middleware enforces authentication as a defence-in-depth layer. Tracked as T04R-R1.

### C-07 — `createNotification` is a client-callable server action

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T048 (in-app notifications)
- **Description:** `createNotification` is `export async function` inside `apps/web/src/app/(protected)/notifications/actions.ts`, whose first line is `"use server"`. Every export in a `"use server"` module is a Next.js server action accessible to any authenticated client. The doc-comment says "internal helper — never from the client" but Next.js cannot enforce that. A malicious authenticated user (e.g. a stylist) can invoke `createNotification` with any `recipientEmployeeId`, `type`, `message`, and `link`, spamming other employees' inboxes and potentially phishing them with crafted `link` targets.
- **Fix:** Move `createNotification` into a non-`"use server"` module (e.g. `apps/web/src/lib/notifications.ts`) imported directly by the callers that need it (`resolveEditRequest`, `createBatch`, `markPieceDone`). Keep `"use server"` only for the three user-facing actions (`listNotifications`, `markRead`, `markAllRead`). Apply the same treatment to `archiveOldNotifications` (see L-21). Tracked as T04R-R2.

---

### C-08 — `neon-http` driver swap broke all `db.transaction()` call sites

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T038 checkout, T035 ticket creation, T044/T045 batch creation, T053/T032b appointment status, T041 edit-request resolve — every call site that uses `db.transaction(...)`.
- **Description:** Commit `fb29e55` ("fix: switch Neon driver from WebSocket Pool to HTTP neon()") replaced `drizzle-orm/neon-serverless` (Pool/WebSocket) with `drizzle-orm/neon-http` to chase a `JSON.parse` error in Better Auth session lookups. The HTTP driver does not support transactions — its session implementation throws `new Error("No transactions support in neon-http driver")` at runtime. All five financial/state-mutating transactions in the codebase will now throw on first invocation: `processCheckout`, `createTicket`, `createBatch`, `transitionAppointment` (no-show + status), `resolveEditRequest`. The commit message claimed "Transactions still work via neon-http batch mode" — that was wrong; `batch()` is a different API and Drizzle's `.transaction()` does not lower to it. Test suite did not catch this because no integration tests exercise `db.transaction` against a real Neon endpoint.
- **Fix:** Revert `packages/db/src/index.ts` to the WebSocket Pool driver. The original JSON-parse error was a stale-pool symptom and should be addressed by either (a) disposing the pool on Next.js HMR, (b) using `Pool({ ..., maxIdleTime: ... })` with shorter idle, or (c) using `neonConfig.poolQueryViaFetch = true` which keeps the Pool API but routes single-statement queries over HTTP while preserving transaction behaviour for explicit `pool.connect() → BEGIN/COMMIT`. Tracked as T05R-R1.

---

### C-09 — T109 dedup logic inverts intent — first price change never notifies

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T109 (price change notification), T049 (appointments table)
- **Description:** `appointments.price_change_acknowledged` defaults to `false` (per the migration and Drizzle schema). The intent of the column is "secretary has acknowledged the latest price change" — so a fresh appointment with no price change should logically be `true` (no pending change to acknowledge). The implementation has it reversed: every newly-booked appointment starts with `false`. In `editVariant` the dedup filter `affected.filter((a) => a.priceChangeAcknowledged)` therefore excludes every fresh appointment, meaning **the first price change after a booking never sends a notification**. The reset-to-`false` UPDATE in the same code path is a no-op for these rows, so the only side effect is the absence of notifications. Effectively T109's primary AC ("an in-app notification is sent for each affected appointment") is silently violated for the most common case.
- **Fix:** Flip the column default to `true`, add a backfill migration setting all existing rows to `true`, change `editVariant`'s filter to "rows where current value is `true` (need to flag and notify)", and adjust the UI badge condition (`appointment-list.tsx`) accordingly. Tracked as T05R-R2.

---

### C-10 — T053 `reschedule` action is missing — AC explicitly requires it

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T053 (appointment status management)
- **Description:** T053 acceptance criteria say "All six status transitions are reachable from the UI" and "Reschedule re-runs the overlap check". The status enum includes `rescheduled`, but `transitionAppointmentSchema.action` is `enum(["confirm", "cancel", "no_show", "complete", "reopen"])` — `reschedule` is absent. `ALLOWED_TRANSITIONS` has no entry for it. `AppointmentStatusActions` exposes confirm/cancel/no_show/complete/reopen buttons only. There is no UI path, no schema entry, and no server-side handler for rescheduling. T053 was marked done in `60781c4` despite this gap.
- **Fix:** Extend `transitionAppointmentSchema` with `reschedule` (action enum + required `newScheduledAt: z.iso.datetime({ offset: true })` + optional `newDurationMinutes`); add `booked → rescheduled` and `confirmed → rescheduled` to `ALLOWED_TRANSITIONS`; refactor the overlap-check logic out of `createAppointment` into a shared helper and call it from the reschedule branch with the new slot; add a Reschedule button + inline date/time form to `AppointmentStatusActions`. Tracked as T05R-R3.

---

### C-12 — `recordPayout` double-pay check is outside the transaction (race condition)

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T067, T068 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:252–344`)
- **Description:** The T068 conflict scan (`for (const existing of existingPayouts)`) runs against `getDb()` BEFORE `txDb.transaction(...)`. Two admins clicking "Confirm" within the same window for the same employee + business days both pass the check, then both insert payouts that overlap. The `payouts` table has no unique constraint on `(employee_id, period_business_day_ids[])`, no `version` column, and no `SELECT … FOR UPDATE` on a parent row. CLAUDE.md mandates either optimistic locking or `SELECT … FOR UPDATE` for every concurrent financial mutation. Result: a stylist can be paid twice for the same closed business day with no DB-level guard.
- **Fix:** Move the conflict check inside `txDb.transaction(...)` and add a guard that locks the relevant rows: either (a) `SELECT id, period_business_day_ids FROM payouts WHERE employee_id = $1 FOR UPDATE` followed by the in-tx overlap check, or (b) introduce a `payout_period_days(payout_id, business_day_id, employee_id)` junction table with `UNIQUE(employee_id, business_day_id)` and replace the `period_business_day_ids` array with rows in this table — the unique index then physically prevents double-pay even under concurrency. Option (b) is preferable because it removes the array-scan in `getUnsettledEmployees` and `getUnsettledPeriodsForEmployee` too.

---

### C-13 — `payouts` is missing `idempotency_key` (financial mutation guarantee broken)

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T066, T067 (`packages/db/src/schema/payouts.ts`, `apps/web/src/app/(protected)/admin/payroll/actions.ts`)
- **Description:** CLAUDE.md "Financial mutations — mandatory checklist" requires every money-movement mutation to include a client-generated `idempotency_key` UUID with a unique constraint, and to use `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`. The `payouts` table has no such column; `recordPayout` accepts no key from the client. Any retry — accidental double-click during loading, network retry, fast-mode replay — silently creates a duplicate payout (which then also tricks T068 because the second `recordPayout` call computes its check before the first row is committed). This is the same class of bug we fixed for `processCheckout` in T04R-R3.
- **Fix:** Add `idempotency_key uuid NOT NULL UNIQUE` to the `payouts` schema (migration), generate a UUID on the client when the user opens the preview screen, pass it through `recordPayout`, and use the conflict-aware insert pattern. Refetch and return the existing payout when the conflict fires (same shape as T04R-R3).

---

### C-14 — `getUnsettledPeriodsForEmployee` blocks deactivation for every employee, always

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T022b (`apps/web/src/app/(protected)/admin/employees/actions/update-employee.ts:220–241`)
- **Description:** The function returns "every closed business day not covered by a payout for this employee" — but it never checks whether the employee actually worked on those days. So a stylist hired yesterday is treated as having unsettled earnings for every closed business day in the company's history. T022b's third AC ("Deactivation with no outstanding earnings proceeds immediately — no change to T022a flow") is unreachable for any employee unless every previous business day has been paid out for them, which is structurally impossible. Worse, `terminateEmployee` (line 283) inherits the same overcounted set: the termination payout's `period_business_day_ids` includes days the employee never worked, corrupting the audit trail and pre-blocking those days from being paid out to the same employee in the unlikely-but-possible re-hire scenario.
- **Fix:** Replace the "every closed day not in a payout" rule with role-aware detection: stylist → distinct `tickets.business_day_id` for closed tickets owned by employee not yet covered; clothier → distinct `cloth_batches.business_day_id` for approved pieces assigned to employee not yet covered; secretary → closed business days within hire/termination window minus vacation/approved_absence absences not yet covered. The same logic already exists (correctly, for stylist + clothier; incorrectly, for secretary — see C-15) inside `getUnsettledEmployees` — extract it into a shared helper and reuse from both call sites.

---

### C-15 — Secretary unsettled detection in `getUnsettledEmployees` ignores absences

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T070, T065 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:467–470`)
- **Description:** For secretaries the alert logic is `unsettledDays = closedDays.filter((d) => !settled.has(d.id))` — every closed business day that is not yet covered by a payout is treated as unsettled, regardless of whether the secretary was on vacation/approved_absence on that day. T065 explicitly excludes vacation + approved_absence from the daysWorked count. Result: the unsettled alert always lists secretaries with day counts higher than what `previewEarnings` will actually compute, and admins are pushed to "liquidate" days that compute to $0 work. This also drives part of C-14: the deactivation guard inherits the same wrong inclusion.
- **Fix:** Mirror T065's exclusion in the secretary branch of `getUnsettledEmployees`: pull `employee_absences` rows for the employee and filter out dates where `type IN ('vacation','approved_absence')`. Same fix needs to be reflected in the C-14 helper.

---

### C-16 — Analytics silently excludes the currently-open business day

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071, T072, T073, T074, T076 (`packages/db/src/queries/analytics.ts:326` — `${businessDays.closedAt} IS NOT NULL` in `getBusinessDayIdsByPeriod`)
- **Description:** `getBusinessDayIdsByPeriod` filters `closedAt IS NOT NULL` for **both** current and prior windows. Admins who open the analytics tab during an active business day see revenue=0, jobs=0, earnings=0 for "day" (and the open-day contribution is missing from "week"/"month" too). The empty-state banner then fires: "No hay ingresos para este período — cierra tickets para ver los totales", which is misleading since tickets _are_ closing. The T072 AC explicitly calls out "current business day (or most recent closed day)" — neither behaviour is implemented; the open day is just silently dropped. All downstream surfaces (CSV export, comparison chart, per-employee table) inherit the gap.
- **Fix:** Drop `closedAt IS NOT NULL` from the current-window filter; keep it (or a softer "ended in the past" check) only on the prior window if needed for clean comparisons. Verify `revenueByPeriod`/`earningsByEmployee`/`employeeDayBreakdown` handle open days (tickets with status=closed already exist on open days). Add a unit test that an open day with 2 closed tickets contributes its revenue.

---

### C-17 — `earningsByEmployee` returns 0 for all secretaries, under-reporting the total

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071, T072, T073, T074, T076 (`packages/db/src/queries/analytics.ts:128–222`, `341–474`)
- **Description:** `earningsByEmployee` only aggregates stylist commission and clothier piece_rate. The in-file comment says "returns 0 for secretary roles and callers should supplement with computeSecretaryEarnings", but `getAnalyticsSummary` never does the supplemental call — it sums the aggregated rows directly. Result: (1) the top-line `earnings` card understates the real payroll cost by the full secretary `daily_rate × daysWorked` each period; (2) secretaries never appear in the per-employee performance table or CSV; (3) prior-period comparisons are consistently biased the same direction so the delta % looks fine, hiding the error. Same omission in `employeeDayBreakdown` (the secretary branch is present but only uses `daily_rate` without the ISO-week `expected_work_days` cap from T065).
- **Fix:** Either (a) add a secretary branch to the SQL aggregation that joins `business_days` and subtracts vacation/approved_absence days, multiplied by `employees.daily_rate`, with the same ISO-week cap as `computeSecretaryEarnings`; or (b) call `computeSecretaryEarnings` per secretary in application code and merge results. Either way the analytics earnings total must match the sum of payouts that would be computed by T065 on the same window. Add a test that asserts parity.

---

### C-18 — `paidOffline` offline-checkout flow is a stub

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T079 (`apps/web/src/lib/mutation-queue.ts:14`, `apps/web/src/lib/use-queue-flush.ts:22–49`, checkout actions)
- **Description:** `MutationType` declares `"paidOffline"` and the T079 AC + resolved decisions explicitly support cashier-offline checkout: "cashier marks tickets `paid_offline`… syncs on reconnect… server creates `checkout_session` and closes all tickets atomically; cashier's version always wins on conflict." The implementation has none of it: `dispatchMutation` handles only `markPieceDone` and `createTicket`, and no `processPaidOfflineCheckout` server action exists. The `paid_offline` value is present in the ticket status enum (from T033) and in i18n copy, but there is no code path that transitions a ticket to it. A cashier who enqueues a `paidOffline` mutation would see it stuck in the queue forever.
- **Fix:** Implement `processPaidOfflineCheckout({ ticketIds, paymentMethod, amount, idempotencyKey })` that (a) validates the cashier's session, (b) transitions all targeted tickets to `paid_offline` within a transaction, (c) on the subsequent online flush creates the `checkout_session`, transitions tickets to `closed`, and records `ticket_payments` — all atomically with cashier-wins conflict resolution. Wire the `"paidOffline"` branch in `dispatchMutation`. Add an integration test that the round-trip (offline enqueue → reconnect → close) leaves exactly one checkout session with the correct total.

---

### C-19 — `createTicket` is not wired to the shared idempotency helper

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T078 (`apps/web/src/app/(protected)/tickets/actions/index.ts:189–246`, `apps/web/src/lib/idempotency.ts`)
- **Description:** T078 AC: "Covered routes: ticket creation, piece mark-done." `markPieceDone` calls `checkIdempotency`/`storeIdempotency`; `createTicket` does not. Instead, `createTicket` uses the older column-level dedup via `tickets.idempotency_key` introduced in T033. The two mechanisms are not reconciled: (a) the shared `idempotency_keys` table was designed to cover all mutating routes including ticket creation, so the AC is half-met; (b) future mutating routes that aren't tickets (e.g. `claimPiece`, `approvePiece`, `recordPayout`) have no idempotency guard at all. An offline retry of `createTicket` uses column dedup which is fine, but the design intent of T078 was a single abstraction.
- **Fix:** Either (a) wire `createTicket` to `checkIdempotency`/`storeIdempotency` as well, keeping `tickets.idempotency_key` only as a backstop unique constraint; or (b) formally document that `tickets.idempotency_key` is authoritative for ticket creation, remove the "ticket creation" line from T078 AC, and document per-route idempotency strategy. Either way both mechanisms should not remain silently duplicated. Add an integration test that duplicate `createTicket` with the same key is a no-op.

---

### C-20 — T078 accepts idempotency as a parameter, not as `Idempotency-Key` header

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T078 (`apps/web/src/lib/idempotency.ts`, callers)
- **Description:** T078 AC: "Accept an `Idempotency-Key` header." The implementation takes the key as a positional `rawIdempotencyKey` parameter on the server action. External clients (curl, third-party integrations, future mobile apps) cannot use it — they can only set HTTP headers, not call server actions with arbitrary arguments. For offline flushes from this app's own IndexedDB queue this is fine; for the "any mutating API route" coverage implied by the AC, it is not.
- **Fix:** Read `idempotency-key` via `headers().get("idempotency-key")` inside the idempotency helper; fall back to the parameter for server actions that pre-fetch it. Document the HTTP contract in `docs/api-conventions.md`. If no public HTTP surface is planned post-MVP, rewrite the T078 AC to reflect server-action-only usage instead.

---

## High-priority issues

### H-01 — Phase 0 scope inflation

- **Severity:** High
- **Status:** Resolved
- **Affected:** Phase 0 timeline and deliverability
- **Description:** Phase 0 started with ~8 work packages. After three senior reviews, it now has 20 tasks including: monorepo, linting, env vars, Vercel, Neon, Drizzle, auth spike, UI library spike, Pusher spike, RBAC, seed script, offline policy, Sentry, testing infra, CI/CD, API conventions, real-time abstraction, i18n, design system + tokens, and wireframes. No analysis estimates whether this is achievable as a single phase.
- **Fix:** Phase 0 split into **0A (Infrastructure)** and **0B (Standards & Design)**. 0A: T001, T003, T004, T005, T006, T007, T008, T009, T010, T011, T085, T094, T095. 0B: T002, T077, T097, T098, T099, T103, T104. Updated in `phase-00-foundation.md` and `progress.md`.

### H-02 — Sentry timing stale in `business.md`

- **Severity:** High
- **Status:** Resolved
- **Affected:** `docs/Business/business.md` line 65
- **Description:** `business.md` says "Error tracking | Sentry (free tier) | Phase 10" but the SWE review moved T085 to Phase 0. The client-facing document is inaccurate.
- **Fix:** Update `business.md` to reflect Sentry in Phase 0.

### H-03 — T013 circular dependency with T054 (Resend)

- **Severity:** High
- **Status:** Resolved
- **Affected:** T013 (employee account creation), T054 (Resend email integration)
- **Description:** T013 says the new employee "receives a password reset email (via Resend)" but doesn't list T054 as a formal dependency. If T054 isn't done, the email send silently fails and the new employee can't log in.
- **Fix:** Either add T054 as a formal dependency of T013, or specify that the admin can set an initial password manually when email isn't available yet.

### H-04 — Better Auth fallback plan is too shallow

- **Severity:** High
- **Status:** Resolved
- **Affected:** T007 (auth spike), entire auth layer
- **Description:** Better Auth is the newest and least battle-tested option (2024-2025). The mitigation is a 1-2 hour spike, which only tests initial setup, not production edge cases (session handling under load, RBAC with nested permissions). If critical issues emerge in Phase 3+, switching requires rewriting all auth code, middleware, and RBAC checks.
- **Fix:** Added a comprehensive "Migration Path" section to `docs/research/auth-providers.md` documenting concrete migration steps to Auth.js (2 days) and Clerk (1.5 days), including decision triggers for when to migrate.

### H-05 — Pusher reliability for financial operations

- **Severity:** High
- **Status:** Resolved
- **Affected:** T036 (cashier dashboard), T098 (real-time abstraction)
- **Description:** Pusher's free tier has no message delivery guarantee (fire-and-forget). For the cashier dashboard driving checkout decisions, a missed event means the cashier doesn't see a ticket awaiting payment. No fallback mechanism is documented.
- **Fix:** Added 30-second polling fallback to T098 acceptance criteria. The abstraction auto-activates polling when the push transport fails or disconnects. Cashier dashboard never relies solely on push events.

### H-06 — No security audit on go-live checklist

- **Severity:** High
- **Status:** Resolved
- **Affected:** T089 (production cutover)
- **Description:** The go-live checklist (T089) includes Sentry, uptime monitoring, and backups, but no security review. For a POS system handling payment data and PII, a basic OWASP top-10 review should be required before production.
- **Fix:** Add a "security review" acceptance criterion to T089 covering: CSRF protection, XSS prevention, CSP headers, rate limiting on non-auth endpoints, SQL injection prevention verification.

### H-07 — No Neon free-tier storage capacity estimate

- **Severity:** High
- **Status:** Resolved
- **Affected:** T005 (Neon setup), T101 (analytics seed script)
- **Description:** Neon free tier provides 0.5 GB storage. No estimate calculates expected data volume. The analytics seed script (T101) generates 6 months of data — nobody has verified this fits within 0.5 GB. Hitting the limit during staging would block development.
- **Fix:** Added a detailed "Storage Capacity Estimate" section to `docs/research/postgres-providers.md`. 6 months of production data estimated at ~28 MB — well within the 0.5 GB free tier. Upgrade threshold: ~8–10 years at current growth rate.

### H-08 — Shared payment method enum defined three times

- **Severity:** High
- **Status:** Resolved
- **Affected:** T039 (ticket_payments), T057 (large_order_payments), T066 (payouts)
- **Description:** The `payment_method` enum (`cash | card | transfer`) is defined independently in three different table migrations. This creates maintenance risk — adding a new method requires updating three enums.
- **Fix:** Define a single shared `payment_method_enum` in the schema and reference it from all three tables.

### H-09 — No `appointment_id` column creates orphaned link

- **Severity:** High
- **Status:** Resolved
- **Affected:** Same as C-01 (duplicate tracking, different angle)
- **Description:** See C-01. Additionally, without this FK, analytics queries cannot determine revenue generated from appointments vs walk-ins.
- **Fix:** Same as C-01.

### H-10 — Large orders missing `cancelled` status

- **Severity:** High
- **Status:** Resolved
- **Affected:** T059 (order status flow)
- **Description:** The order status flow is `pending → in_production → ready → delivered → paid_in_full` with no `cancelled` status. If a client cancels a large order, the record is stuck in its current status indefinitely.
- **Fix:** Add `cancelled` to the status enum. Define whether deposits on cancelled orders are refundable (business decision).

### H-11 — No rate limiting beyond login endpoint

- **Severity:** High
- **Status:** Resolved
- **Affected:** T017 (password reset), T056 (email send), general API
- **Description:** T007 mentions rate limiting on login via Better Auth, but other sensitive endpoints (password reset requests, email sends, ticket creation) have no documented rate limits. An internal user could accidentally or maliciously trigger excessive operations.
- **Fix:** Document rate limiting policy in `docs/standards-api.md` (T097). Apply rate limiting to all mutation endpoints.

### H-12 — Neon cold start impact on POS workflow

- **Severity:** High
- **Status:** Resolved
- **Affected:** T005 (Neon setup), T019 (business day open)
- **Description:** Neon's free tier auto-suspends after inactivity, causing the first query to take slightly longer. For a POS system, the first transaction of the business day (opening the day) could experience a noticeable delay with no user feedback.
- **Fix:** Added loading state to T019 "Open Day" action. Added "Cold Start Mitigation" section to `docs/research/postgres-providers.md` documenting the chosen approach and alternatives.

---

### H-28 — `recordPayout` skips Zod validation despite handling money

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T067 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:201–348`)
- **Description:** CLAUDE.md "Every server action validates input with a Zod schema before business logic" is unconditional. `recordPayout` accepts a typed object literal, performs only spot checks (`businessDayIds.length`, `amount !== originalComputedAmount` requires reason, `amount < 0` is checked client-side only), and trusts the rest. There is no `payouts` schema in `packages/types/src/schemas/`, so `employeeId` and the day IDs aren't validated as UUIDs, `amount` and `originalComputedAmount` aren't bounded as integers, `notes`/`adjustmentReason` have no max length, and `method` isn't enforced server-side beyond the TS union (which strips at runtime). `terminateEmployee` has the same shape (no Zod, hand-rolled spot checks). For a financial mutation this is a regression of the standard the rest of Phase 4–6 already meets.
- **Fix:** Create `packages/types/src/schemas/payout.ts` exporting `recordPayoutSchema` and `terminateEmployeeSchema` (uuid IDs, `int().nonnegative()` for money, max-length text, enum for method, idempotency_key after C-13). Replace the typed parameters with `unknown` + `safeParse` in both server actions, returning `VALIDATION_ERROR` with field-level details on failure.

---

### H-29 — `getMyEarnings` exposes already-paid earnings as if unpaid

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T069 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:499–596`, `apps/web/src/components/my-earnings-view.tsx`)
- **Description:** "My earnings — today / this week / this month" calls `computeStylistEarnings` / `computeClothierEarnings` / `computeSecretaryEarnings` over the period's closed business days without checking whether those days have been settled by a prior payout. After a payout is recorded, the same earnings continue to show up under "this week" / "this month" — so the employee sees the same money twice (once in the dashboard, once in the payout history below). T069 ACs: "shows total earned today/this week/this month; breakdown by job/piece; payout history (what has been paid)" — the dashboard half must reflect what's still owed, not lifetime totals over the period.
- **Fix:** When computing the three summary cards, exclude business_day_ids already covered by any payout for this employee (same pattern as the admin payroll preview). Surface the payout history below as the source of truth for "paid" amounts. Add a unit test ensuring computed today/week/month drop after a payout is recorded.

---

### H-30 — `getMyEarnings` and `previewEarnings` use mismatched week boundaries

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T065, T069 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:520–522`, `apps/web/src/lib/payroll/compute-secretary-earnings.ts:27–34`)
- **Description:** `getMyEarnings` defines "this week" as `now - now.getDay()` (Sunday-baseline, Bogota TZ ignored — uses server UTC). `computeSecretaryEarnings` keys by ISO weeks (Monday-baseline). For a Sunday viewer, "this week" includes only Sunday under the dashboard but the secretary cap applies under the previous ISO week — so a part-time secretary's "this week" earnings can disagree with what the admin sees in payroll preview for the same range. Same applies to all roles via the day filter being inclusive vs exclusive at midnight UTC instead of Bogota.
- **Fix:** Centralize week-boundary helpers in one place (`lib/dates.ts`) anchored to America/Bogota and ISO week (Monday). Use the same helper for the dashboard summaries and the secretary computation. Same applies to `today` (currently `new Date().toISOString().slice(0,10)` which is UTC, not Bogota — late-night POS sessions can show "today $0" while the cashier is still on the same business day).

---

### H-31 — T022b termination has no UI flow

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T022b (`apps/web/src/components/employee-list.tsx`)
- **Description:** T022b AC requires a UI flow: "enter termination amount → create payout record → deactivate account (all in one transaction)". The server action `terminateEmployee` exists and does the right thing transactionally (apart from the input validation gap in H-28), but the only UI button in `employee-list.tsx` is `handleDeactivate` calling `deactivateEmployee`. When that returns `CONFLICT`, the admin is told "use the termination option" — but no termination option exists in the UI. The entire feature is dead code from an end-user perspective.
- **Fix:** When `deactivateEmployee` returns `CONFLICT`, open a Termination Dialog showing the unsettled day count, the system-computed termination amount (call `previewEarnings` for the unsettled days), an editable amount field, a method selector, a required reason field, and a destructive Confirm button that calls `terminateEmployee`. Reuse the existing `ConfirmationDialog` pattern from Phase 6R for consistency.

---

### H-32 — Phase 7 financial logic has zero real unit tests

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T063, T064, T065, T067, T068 (`apps/web/src/lib/payroll/__tests__/earnings.test.ts`)
- **Description:** The 23 tests in `earnings.test.ts` reimplement the helper functions inline (`computeStylistItemEarnings`, `computeSecretaryDays`, `bankersRound`, `isoWeekKey`) and assert on those local copies — they never import the real `computeStylistEarnings`, `computeClothierEarnings`, or `computeSecretaryEarnings` from `apps/web/src/lib/payroll/*.ts`. So the production query logic, the `needs_review` exclusion, the `approved`-only filter, the `overridePrice ?? unitPrice` fallback, the dailyRate-null guard, the empty-businessDayIds short circuit, and the database join shape are all untested. Additionally, T068's double-pay check, the role-gate path, the rate-limit path, and the adjustment-reason validation have no tests at all. CLAUDE.md "Earnings computation… commission… status transitions… permission checks… double-pay prevention… financial data integrity" lists every Phase 7 function as **mandatory** unit-test coverage, plus 80% threshold for `packages/db/src/queries/`.
- **Fix:** Replace the inline reimplementations with imports from the real modules. Add a test harness (in-memory pglite or Drizzle's `pg-mock` against a transaction-rolled-back fixture) so the real functions can be exercised. Cover at minimum: (a) stylist with reopen/needs_review excluded, (b) clothier with done_pending_approval excluded, (c) secretary with vacation excluded but missed counted, (d) secretary part-time cap per week, (e) `recordPayout` double-pay rejection, (f) `recordPayout` requires `adjustmentReason` when `amount !== originalComputedAmount`, (g) role-gate FORBIDDEN paths.

---

### H-33 — Earnings views are unreachable from navigation

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T069 (`apps/web/src/components/nav-config.ts`)
- **Description:** `/stylist/earnings`, `/clothier/earnings`, `/secretary/earnings` exist as routes and the page components mount `MyEarningsView`, but `NAV_ITEMS` for these three roles has no entry pointing to them. Stylist nav has only "myTickets"; clothier has only "myWork"; secretary has dashboard/largeOrders/batches/appointments. Employees with `show_earnings = true` cannot discover their own earnings page. T069 AC: "Build the 'My earnings' screen for stylists, clothiers, and secretaries" — implicitly requires it to be reachable.
- **Fix:** Add a conditional nav entry per role pointing to `/{role}/earnings`. Visibility should respect `employees.show_earnings` — fetch the flag in the layout that builds the nav (or hide the link until the flag is true on the server). On mobile (stylist + clothier) add as second tab in the bottom bar.

---

### H-34 — Analytics dashboard has no real-time refresh

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T072 (`apps/web/src/app/(protected)/admin/analytics/analytics-dashboard.tsx`)
- **Description:** T072 AC: "Updates in near-real-time (real-time event on ticket close can trigger a refresh)". The dashboard is a pure client component with no subscription to `packages/realtime` — admins must manually switch periods or reload the page to see updated numbers after checkouts. Combined with C-16 (open day excluded entirely), the dashboard becomes a stale snapshot until day close. The `packages/realtime` `useRealtimeEvent` hook already exists (used by cashier dashboard) — this is a wiring gap, not a new infrastructure requirement.
- **Fix:** Subscribe the dashboard to the `cashier` SSE channel's `ticket.closed` event. On receipt, refetch the current period (throttled to 1 refresh/5s to avoid thrashing during batch checkouts). Alternative: use `router.refresh()` on receipt to re-run the server component.

---

### H-35 — T074 active-employee filter + include-inactive toggle unimplemented

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T074 (`packages/db/src/queries/analytics.ts:94–222`, `apps/web/src/app/(protected)/admin/analytics/analytics-dashboard.tsx:253–339`)
- **Description:** T074 AC: "Table shows all active employees (inactive employees excluded by default; toggle to include)". The implementation has neither the default filter nor the toggle. `earningsByEmployee`, `jobsCountByEmployee`, and `employeeDayBreakdown` make no reference to `employees.isActive`. Any employee who was deactivated mid-period is silently included in the table and the drill-down; any inactive employee with zero earnings is excluded only because the aggregation returns no rows, not because of a filter. There is no user-facing control to toggle the filter.
- **Fix:** (1) thread `includeInactive?: boolean` through `getAnalyticsSummary`, `getEmployeePerformance`, `getEmployeeDrillDown`; (2) default `false`; (3) add `AND employees.isActive = true` unless `includeInactive` is set; (4) surface a checkbox above the employee table that toggles the flag and re-fetches. Drill-down respects the same flag.

---

### H-36 — Analytics server actions skip Zod validation

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071–T076 (`apps/web/src/app/(protected)/admin/analytics/actions.ts`)
- **Description:** `getAnalyticsSummary(period)`, `getEmployeePerformance(period)`, `getAnalyticsCsvData(period)`, and `getEmployeeDrillDown(employeeId, period)` type their params but never validate them. `period` is used in SQL-branching JS code and interpolated into `toLocaleDateString` downstream; a client could pass an arbitrary string. `employeeId` is passed directly to `employeeDayBreakdown` and to a `.where(eq(employees.id, employeeId))` clause — Drizzle coerces and Postgres would reject the bad UUID, but the error surfaces as an untyped `INTERNAL_ERROR` instead of a clean `VALIDATION_ERROR`. CLAUDE.md: "Every server action validates input with a Zod schema before business logic."
- **Fix:** Create `packages/types/src/schemas/analytics.ts` with `periodSchema` (enum `["day","week","month"]`), `employeeIdSchema` (uuid), `includeInactiveSchema` (boolean optional). Convert the four actions to take `unknown` + `safeParse` and return `VALIDATION_ERROR` with field-level details on failure.

---

### H-37 — Zero unit tests for Phase 8 analytics logic

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071–T076, T101 (no test files under `packages/db/src/queries/` or `apps/web/src/app/(protected)/admin/analytics/__tests__/`)
- **Description:** CLAUDE.md mandates unit tests for "earnings computation (commission, piece_rate, daily_rate)", "permission / role checks", "financial data integrity". Analytics queries compute revenue, per-employee earnings, and prior-period comparisons — all financial logic — and have zero tests. Today's 213 passing tests include the Phase 7 payroll logic, but analytics is untested. Bugs like C-16 (open-day exclusion), C-17 (secretary under-report), and L-35 (UTC date slice) were only catchable by code review; a regression in any of these would ship silently.
- **Fix:** Add `packages/db/src/queries/__tests__/analytics.test.ts` (or `apps/web/src/app/(protected)/admin/analytics/__tests__/`) covering: `revenueByPeriod` on closed + open day, zero-ticket days, needs_review exclusion, override-price use; `earningsByEmployee` per role including secretary parity with `computeSecretaryEarnings`; `getBusinessDayIdsByPeriod` boundaries (week Mon, month 1st, year turnover); role gate FORBIDDEN for non-admin roles; CSV totals match the aggregate queries. Target 80%+ branch coverage of `packages/db/src/queries/analytics.ts` per CLAUDE.md threshold.

---

### H-38 — Service worker has no explicit `NetworkOnly` rule for mutating requests

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T081 (`apps/web/next.config.ts:29–49`)
- **Description:** `workboxOptions.runtimeCaching` has two rules: Cache First for static assets, SWR for `/api/(?!realtime).*`. No explicit matcher excludes POST/PUT/DELETE methods. Workbox by default caches GET only, but the SWR URL pattern is wide enough to match authenticated admin mutations. The T081 AC explicitly calls for "Mutating requests (POST/PUT): NetworkOnly (handled by IndexedDB queue instead)" — the rule is relied on by convention, not by code. If Workbox defaults change or a future rule broadens matching, mutating requests could be served stale.
- **Fix:** Prepend an explicit `{ urlPattern: /.*/, method: "POST", handler: "NetworkOnly" }` + same for `PUT`, `DELETE`, `PATCH`. Verify with `sw.js` inspection that mutating requests bypass the cache.

---

### H-39 — Zero tests for T078/T079/T080 offline infrastructure

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T078, T079, T080 (no test files under `apps/web/src/lib/__tests__/mutation-queue.test.ts`, `idempotency.test.ts`, or `use-queue-flush.test.ts`)
- **Description:** CLAUDE.md mandates unit tests for "financial data integrity" and "double-pay / duplicate prevention" — idempotency is the heart of both. The T078 helper, the IndexedDB queue, the flush hook, and the SyncStatus UI have zero tests. The only offline-relevant tests that exist are Phase 4 checkout idempotency (column-level). A regression in `checkIdempotency` (e.g. H-41 race), `dispatchMutation` (e.g. missing mutation type as in C-18), or `useQueueFlush` (e.g. infinite-loop on persistent failure) would ship silently.
- **Fix:** Add Vitest tests: (a) `idempotency.test.ts` — miss/hit/expired lazy delete; (b) `mutation-queue.test.ts` — enqueue/list/dequeue/markAttempted on `fake-indexeddb`; (c) `dispatch.test.ts` — success/failure per supported mutation type; (d) `use-queue-flush.test.tsx` — state transitions on online/offline events. Target 80%+ branch coverage.

---

### H-40 — PWA icons are SVG only; Lighthouse PWA ≥ 80 unverified

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T082 (`apps/web/src/app/manifest.ts:13–26`, `apps/web/public/brand/icon-192.svg`, `icon-512.svg`)
- **Description:** Chrome's PWA installability and Lighthouse PWA audit score favour raster icons (PNG 192×192 + 512×512) with a `"any maskable"` purpose pair. The current manifest uses SVGs only, with the 512 entry carrying `purpose: "maskable"` alone (not `"any maskable"`). T082 AC: "Lighthouse PWA score ≥ 80 on production" and "PWA icons use brand assets from T105 (192×192 and 512×512)" — the dimension claim is met on paper but not in format. No performance-results.md update captures the actual Lighthouse score.
- **Fix:** Add PNG versions at the two required sizes (export from the SVGs), include both in `icons[]`, and set at least one 512 entry to `purpose: "any maskable"`. Run Lighthouse PWA audit against a production build and record the score in `docs/testing/performance-results.md`. If < 80, log as blocking.

---

### H-41 — `checkIdempotency` lazy-expiry race lets duplicates slip through

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T078 (`apps/web/src/lib/idempotency.ts:20–38`)
- **Description:** When a key has expired, `checkIdempotency` does: SELECT → DELETE → return null. Two concurrent requests arriving with the same expired key both SELECT, both DELETE (the second is a no-op), both fall through to re-execute the mutation. At expiry boundaries this collapses idempotency guarantees — users retrying at the TTL edge can see double-execution. The same race exists for any `storeIdempotency` call following a cleared key because `onConflictDoNothing` silently skips the insert while the mutation already committed (see M-48).
- **Fix:** Use a single `DELETE … WHERE expires_at < now() RETURNING *` race-safe statement to own the expiry. Or keep the row and gate reads on `expires_at > now()`; sweep expired rows in a scheduled job. Wrap the check in the same transaction as the mutation (see M-48 fix) so the whole thing is atomic.

---

### H-42 — SyncStatus hides failed-item count while offline

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T080 (`apps/web/src/components/sync-status.tsx:36–63`)
- **Description:** T080 AC: "Failed items show a count (not just an icon)". Today, the failed-count badge only renders in the `online + syncing/failed` toast branch. The offline banner shows `pendingCount` but not `failedCount`. A cashier who dropped offline with 3 already-failed mutations sees only a pending total that excludes them, and has no way to see that 3 were rejected server-side before going offline. The Retry button also only appears when online.
- **Fix:** Render `failedCount` in the offline banner alongside `pendingCount`. Optionally show a disabled "Reintentar al volver la conexión" affordance so users understand state.

---

## Medium-priority issues

### M-01 — No-show count never decrements

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T032b (no-show increment), T053 (appointment status)
- **Description:** If an appointment is incorrectly marked as no-show and the status is corrected, the `no_show_count` on the client record is never decremented. The count only goes up.
- **Fix:** Added decrement logic to T032b ACs: when a no-show status is reversed (changed back to completed/confirmed), `no_show_count` is decremented atomically. Decrement does not go below zero.

### M-02 — No guest-to-saved-client conversion

- **Severity:** Medium
- **Status:** Won't fix
- **Affected:** T031 (guest flow), T030 (saved clients)
- **Description:** There is no mechanism to convert a guest entry into a saved client. If a walk-in customer becomes a regular, previous guest visits cannot be linked to their new profile.
- **Fix:** Deferred to post-MVP enhancement. Guest records are name-only with no persistent data, so no historical linking is possible at the data level anyway.

### M-03 — `service_summary` on appointments is disconnected from catalog

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T049 (appointments migration), T035 (ticket creation)
- **Description:** The `service_summary` field on appointments is free text, not linked to the catalog. When a ticket is created from an appointment, there's no automatic service pre-selection, creating potential inconsistencies between what was booked and what was billed.
- **Fix:** Added `service_variant_id (FK nullable)` to T049 appointments table schema. When present, ticket creation from the appointment auto-populates the service. `service_summary` remains as fallback for non-catalog descriptions.

### M-04 — T028 missing cashier and clothier read access

- **Severity:** Medium
- **Status:** Open
- **Affected:** T028 (catalog read access)
- **Description:** T028 lists stylists and secretary as having read access but doesn't mention cashiers (who need service data for checkout) or clothiers (who need piece data for batch views).
- **Fix:** Add cashier and clothier to the read-access list for their respective catalog domains.

### M-05 — Client table has no unique constraint on phone or email

- **Severity:** Medium
- **Status:** Won't fix
- **Affected:** T029 (clients migration), T100 (data migration)
- **Description:** The `clients` table allows duplicate phone numbers and emails, making duplicate detection during data migration (T100) difficult. Whether duplicates are intentional is undocumented.
- **Fix:** No unique constraint — staff manages duplicates manually. Some clients share phones (family members). The data migration script (T100) handles deduplication via duplicate detection (flag duplicates, don't block import).

### M-06 — T019 — No mechanism to reopen a prematurely closed business day

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T019 (business day), operational workflow
- **Description:** Once a business day is closed, there is no path to reopen it. If the admin closes the day prematurely, tickets cannot be created for that day. The decision to disallow reopening is not explicitly documented.
- **Fix:** Added reopen capability to T019 ACs: admin can reopen the most recently closed business day with audit trail (who, when, reason). Only the single most recently closed day can be reopened.

### M-07 — T065 — "Days expected to work" assumes full-time for all employees

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T065 (secretary earnings), T020/T021 (absences), T012 (employees table)
- **Description:** Secretary earnings are calculated as `daily_rate × days_worked`. The system assumes every active employee is expected to work every business day. Part-time employees or employees with specific schedules are not supported.
- **Fix:** Confirmed: part-time employees exist. Added `expected_work_days` (integer, default 6, range 1–7) to T012 employees table. T065 earnings computation updated to respect this field. Full schedule management deferred to post-MVP.

### M-08 — T067 — Payout amount adjustment has no audit trail

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T067 (payout recording), T066 (payouts table)
- **Description:** The admin can adjust the payout amount before confirming, but there's no requirement to store the reason for adjustment or the original computed value. For a financial system, this is a significant audit gap.
- **Fix:** Added `original_computed_amount` (integer) and `adjustment_reason` (text, nullable, required when amount differs from computed) to T066 payouts table schema.

### M-09 — T100 — No data validation or rollback for spreadsheet import

- **Severity:** Medium
- **Status:** Open
- **Affected:** T100 (data migration from spreadsheets)
- **Description:** The import script handles duplicate detection but specifies no validation rules for imported data (phone format, email format, name length). Also, no rollback mechanism if bad data is introduced.
- **Fix:** Add input validation to the import script. Create a backup point before import or tag imported records for easy identification.

### M-10 — T082 — iOS PWA limitations not addressed

- **Severity:** Medium
- **Status:** Open
- **Affected:** T082 (PWA install prompt), T081 (service worker)
- **Description:** The PWA spec mentions "Install prompt appears on Android Chrome" but doesn't address iOS Safari limitations (no install prompt, limited service worker scope). Staff likely use iPhones.
- **Fix:** Document iOS PWA behaviour and add "Add to Home Screen" instructions for iOS users to the training guide (T088).

### M-11 — No T062 dependency on T061 (payments)

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T062 (large orders list view)
- **Description:** T062 shows "balance due" which is computed from payments (T061), but T062 only depends on T059. It should depend on T061 as well.
- **Fix:** Add T061 to T062's dependency list.

### M-12 — Resend free tier may not cover daily email volume

- **Severity:** Medium
- **Status:** Open
- **Affected:** T054 (Resend integration), T056 (confirmation emails)
- **Description:** Resend free tier allows 100 emails/day. If 80+ appointments generate confirmation + potential rescheduling emails daily, the limit could be tight. No volume estimate exists.
- **Fix:** Estimate daily email volume and document in `docs/research/notification-channels.md`. Plan for the $20/mo Pro tier if needed.

### M-13 — T057 — `deposit_paid` column is redundant with payments table

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T057 (large orders migration)
- **Description:** The schema has both `deposit_paid` (column) and the initial deposit recorded in `large_order_payments`. This creates a dual source of truth that can diverge.
- **Fix:** Removed `deposit_paid` column from T057 schema. Deposit status is computed from the `large_order_payments` table. Single source of truth.

### M-14 — Timezone handling for appointments

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T049 (appointments), T052 (calendar view), all time displays
- **Description:** Appointments use `timestamp with time zone` but no specification locks the display timezone to the business location. On devices with different timezone settings, appointments could display at wrong times.
- **Fix:** Added business timezone constant `America/Bogota` (UTC-5) to T002 standards. All timestamps stored in UTC; all user-facing displays converted to business timezone regardless of device locale.

### M-15 — No state management or form library research document

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** Tech stack consistency
- **Description:** TanStack Query, Zustand, React Hook Form + Zod, date-fns, Recharts, and Lucide were accepted into the tech stack from inline review recommendations, but unlike Neon, Better Auth, Pusher, and Resend, they have no dedicated research document with pros/cons/alternatives.
- **Fix:** Created `docs/research/frontend-libraries.md` with comparison tables and rationale for each library vs alternatives.

### M-16 — Pusher free-tier message volume not estimated

- **Severity:** Medium
- **Status:** Resolved (Won't fix)
- **Affected:** T009 (Pusher spike), T098 (real-time abstraction)
- **Description:** Pusher free tier allows 200K messages/day. No estimate calculates expected daily message volume based on tickets, status changes, notifications, and connected clients. Without this, the team doesn't know when to plan migration.
- **Fix:** **Stale** — Pusher was replaced by native SSE (April 2026 grilling session). No third-party service, no message volume limits. Issue no longer applies.

### M-17 — `commission_pct` precision not specified

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T023 (services migration), T063 (earnings computation)
- **Description:** `commission_pct` is stored as `numeric(0–100)` but the exact precision (e.g., `numeric(5,2)` for values like `15.50%`) is not defined. This affects earnings computation accuracy.
- **Fix:** Updated T023 ACs: `commission_pct` is `numeric(5,2)`. Rounding policy: banker's rounding (round half-even) for all financial calculations — documented in T002 standards.

### M-18 — Real-time migration from Pusher has no task

- **Severity:** Medium
- **Status:** Won't fix
- **Affected:** `docs/research/realtime-transport.md`, project plan
- **Description:** The research file says "Build this in Phase 9" but Phase 9 is specifically about offline/PWA. No actual task covers migrating from Pusher to SSE + Postgres LISTEN/NOTIFY.
- **Fix:** Documented as a post-MVP activity in `docs/research/realtime-transport.md`. No task allocated. The real-time abstraction layer (T098) ensures migration requires changes only in `packages/realtime/`.

### H-18 — `editClient` allows editing archived clients

- **Severity:** High
- **Status:** Resolved
- **Affected:** T030 (client CRUD)
- **Description:** The `editClient` server action does not check `isActive` before allowing edits. An archived client can be edited via a direct API call (the UI hides the edit button, but the server-side guard is missing). This violates the soft-delete semantics — archived records should be immutable until unarchived.
- **Fix:** Add `eq(clients.isActive, true)` to the `editClient` WHERE clause. Return `NOT_FOUND` or `CONFLICT` if the client is archived. Tracked as T03R-R1.

### M-26 — Hardcoded strings in `client-search-widget.tsx`

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T031 (guest flow), T099 (i18n)
- **Description:** Three hardcoded strings bypass i18n: two `aria-label="Quitar selección"` (lines 282, 304) and one `OK` button label (line 336). All user-facing strings must use `next-intl` per CLAUDE.md conventions.
- **Fix:** Add i18n keys (`clients.clearSelection`, `common.ok`) and replace hardcoded strings. Tracked as T03R-R2.

### M-28 — T042 payout `needs_review` flag is a stub, AC silently unmet

- **Severity:** Medium
- **Status:** Deferred
- **Affected:** T042 (ticket reopen), T066 (payouts table, Phase 7)
- **Description:** T042 AC says "Payout records that included this ticket are flagged `needs_review`." Payouts don't exist yet — the table is created in T066 (Phase 7). `reopenTicket` has a `NOTE (T066 stub)` comment acknowledging this, but T042 was still marked `done` and committed without linking the deferral anywhere reviewers would see. Risk: T066 ships without the reopen-flag wiring because the dependency isn't captured.
- **Fix:** Add an AC to T066 that explicitly says "extend `reopenTicket` to flag overlapping payouts as `needs_review = true`" with a pointer to the stub comment. No code change needed now.

### M-29 — `resolveEditRequest` is not wrapped in a transaction

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T041 (edit approval flow)
- **Description:** When a cashier approves an edit, three writes happen sequentially without a transaction: (1) update `ticket_items` with the new variant + re-snapshotted price/commission, (2) update `ticket_edit_requests` to `approved` with resolver and timestamp, (3) insert a notification row. If step 2 or 3 fails, the ticket has already been re-priced but the request stays `pending` (letting the requester submit a duplicate) and the requester gets no notification. Because the new snapshot changes the ticket total, this is a financial-data-integrity concern under CLAUDE.md's mandate.
- **Fix:** Wrap the `ticket_items` update and the `ticket_edit_requests` update in `db.transaction`. Fire the SSE event and create the notification only after commit. Tracked as T04R-R7.

### M-27 — `clientId` parameter not validated as UUID

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T030 (client CRUD)
- **Description:** The `editClient`, `archiveClient`, and `unarchiveClient` server actions accept `clientId: string` without validating it's a valid UUID. While Drizzle parameterizes the query (no SQL injection), a malformed ID causes an unnecessary DB round-trip and a generic `NOT_FOUND` error instead of a clear `VALIDATION_ERROR`.
- **Fix:** Add `z.string().uuid()` validation on `clientId` at the top of each action. Tracked as T03R-R3.

### M-30 — Default `price_change_acknowledged = false` causes false-positive UI flag on every fresh booking

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T049 (appointments table), T109 (price-change UI), T052 (appointment list)
- **Description:** Closely related to C-09. Because `appointments.price_change_acknowledged` defaults to `false`, every newly-booked or confirmed appointment renders an amber row + warning badge + "Precio notificado" button in the secretary calendar — even when no price change has occurred. Secretaries will quickly start ignoring the badge ("alarm fatigue"), which defeats the purpose of T109's visual cue.
- **Fix:** Resolved as a side effect of C-09's column-default flip (T05R-R2). After that change, fresh bookings render normally and the badge appears only when a real price change has happened. Tracked under T05R-R2.

### M-31 — `acknowledgeAppointmentPriceChange` lacks rate limiting

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T109 (price-change acknowledge)
- **Description:** Per CLAUDE.md "General mutations: 60/min per user", every server-action mutation should call `checkRateLimit(rateLimits.general, userId)` before doing work. `acknowledgeAppointmentPriceChange` (in `apps/web/src/app/(protected)/appointments/actions.ts`) is missing this guard, while sibling actions (`createAppointment`, `transitionAppointment`) include it. A logged-in user could pound the action in a loop and bypass the project-wide cap.
- **Fix:** Add the standard rate-limit block to `acknowledgeAppointmentPriceChange`. Tracked as T05R-R6.

---

### M-36 — `recordPayout` returns existing payout history scoped to all employees, not the selected one

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T067 (`apps/web/src/app/(protected)/admin/payroll/page.tsx:14`)
- **Description:** `PayrollPage` calls `listPayouts()` with no `employeeId`, so the history table at the bottom of `PayrollScreen` shows every payout for every employee even after the admin has selected a specific employee in the "Liquidate" flow. The action signature already supports filtering (`listPayouts(employeeId?)`), and the URL query string carries `?employeeId=` after a click in `UnsettledAlert`. Behaviorally the screen is functional but the history table becomes noisy in production.
- **Fix:** Read `searchParams.employeeId` in `page.tsx` and pass it to `listPayouts()`. Optionally add an employee filter dropdown above the history table for ad-hoc filtering.

---

### M-37 — `listClosedBusinessDays` flattens settled-day check across all employees

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T067 (`apps/web/src/app/(protected)/admin/payroll/actions.ts:117–119`)
- **Description:** `isSettled` is computed as `settledIds.has(r.id)` where `settledIds` aggregates **every** payout's day IDs across **every** employee. So once any employee has been paid for business day X, the day disappears from the unsettled-days picker for every other employee — the admin can never select that day to pay a different employee for the same day. The screen does have a "settledDaysNote" but the days are not selectable. Functionally this means: if the secretary is paid first for the week, none of the stylists or clothiers can be paid for the same week.
- **Fix:** Make `listClosedBusinessDays` accept the selected `employeeId` and compute settled-ness scoped to that employee only. Move the call from `page.tsx` (which has no employee context) into `payroll-screen.tsx` using a server-action call inside a `useEffect` after the employee is selected, or use `searchParams.employeeId` and re-render with the right list per employee.

---

### M-38 — Hardcoded Spanish day-of-week labels bypass i18n

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T021 (`apps/web/src/app/(protected)/admin/absences/absence-calendar.tsx:23`)
- **Description:** `const DAYS_OF_WEEK = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]` is hardcoded Spanish, breaking the i18n contract. With the English locale active, the calendar header still renders in Spanish.
- **Fix:** Either pull the labels from `next-intl` (`t("absences.dayLabels.0")` … `t("absences.dayLabels.6")`) or compute them from `Intl.DateTimeFormat(locale, { weekday: "short" })` driven by `useLocale()`.

---

### M-39 — `editEmployee` returns role/dailyRate updates without optimistic lock

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T014, T065 (`apps/web/src/app/(protected)/admin/employees/actions/update-employee.ts:35–119`)
- **Description:** Two admins editing the same employee concurrently can clobber each other's changes — `editEmployee` simply does `UPDATE employees SET … WHERE id = $1` with no `version` column or last-write-wins safeguard. For a row whose `dailyRate` and `expectedWorkDays` directly drive payroll, a stale write produces silently wrong settlements. The same call also updates `users.name` and `auth.api.setRole` outside any transaction — if the auth role update fails the employee row is already changed.
- **Fix:** Add `version` to the `employees` table (if not present), include `WHERE id = $1 AND version = $expected` in the `UPDATE`, return `STALE_DATA` on zero-row update. Wrap the three writes (employees update, users name update, auth role update) into a single sequence with a try/rollback semantic — auth.api.setRole isn't transactional, so capture the prior role and restore on failure.

---

### M-40 — Analytics queries never filter on `employees.isActive`

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071, T074 (`packages/db/src/queries/analytics.ts:94–222`, `341–474`)
- **Description:** `earningsByEmployee`, `jobsCountByEmployee`, and `employeeDayBreakdown` join `employees` but never filter on `isActive`. A deactivated employee who had tickets/batches during the period still appears in the results with their historical earnings. T074 AC (H-35) explicitly excludes inactive by default with a toggle — M-40 is the query-layer counterpart to that UI-level gap.
- **Fix:** Thread `includeInactive` through the query signatures, defaulting to `false`, and add `AND employees.isActive = true` when absent. Piggybacks on T08R-R4 / H-35 plumbing.

---

### M-41 — `employeeDayBreakdown` secretary branch ignores `expected_work_days` cap

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071, T074 (`packages/db/src/queries/analytics.ts:436–473`, `apps/web/src/lib/payroll/compute-secretary-earnings.ts`)
- **Description:** The secretary branch of `employeeDayBreakdown` just emits `{ jobs: present ? 1 : 0, earnings: present ? dailyRate : 0 }` per closed business day. T065 (`computeSecretaryEarnings`) applies a per-ISO-week cap at `expected_work_days` so a 5-day-per-week secretary who worked 6 days gets paid for 5, not 6. The analytics drill-down therefore shows a higher total than what `previewEarnings` will propose to pay — admins see the bigger number and enter that amount, over-paying part-time secretaries.
- **Fix:** Extract the ISO-week capping logic from `computeSecretaryEarnings` into a shared helper (e.g. `capByExpectedWorkDays`) and call it from both `computeSecretaryEarnings` and `employeeDayBreakdown`. Add a test: a 3-day-per-week secretary with 4 present days in an ISO week computes to 3 × dailyRate, not 4.

---

### M-42 — Week comparison is apples-to-oranges when today is not Sunday

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T073 (`packages/db/src/queries/analytics.ts:297–309`)
- **Description:** Resolved-decisions: "weekly = previous calendar week (Mon–Sun)". Implementation: current window is Monday → `bogotaToday`, prior window is Monday → Sunday of the previous week. On Wednesday the user compares a 3-day window to a 7-day window — unsurprisingly the delta is always negative until Sunday. The comparison misleads rather than informs.
- **Fix:** Either (a) keep current window as Mon → upcoming Sunday (future-dated days have no data so they contribute 0 and the comparison stays like-for-like until the week ends), or (b) truncate the prior window to the same weekday offset (Mon → prior Wednesday when today is Wednesday). Either choice must be documented under "Analytics comparison periods" in progress.md so the behaviour is discoverable.

---

### M-43 — Analytics server actions have no rate limiting

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071–T076 (`apps/web/src/app/(protected)/admin/analytics/actions.ts`)
- **Description:** None of `getAnalyticsSummary`, `getEmployeePerformance`, `getAnalyticsCsvData`, or `getEmployeeDrillDown` call `checkRateLimit`. CLAUDE.md requires "General mutations: 60/min per user" and has explicit caps for heavier actions. These endpoints run six aggregation queries each (`getAnalyticsSummary`) and are trivially enumerable — a CSV-export loop could download months of payroll data in seconds. Reads, yes, but auth-gated financial reads are still rate-limit worthy.
- **Fix:** Add `checkRateLimit(rateLimits.general)` (60/min) to the three read-style actions and a tighter cap (e.g. 20/min) to `getAnalyticsCsvData` given its weight.

---

### M-44 — `seed-analytics.ts` destroys real production data on every run

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T101 (`packages/db/src/seed-analytics.ts:81–102`)
- **Description:** `clearAnalyticsData` deletes every row from `clients`, `large_orders`, `large_order_payments`, `employee_absences`, `tickets`, `ticket_items`, `ticket_payments`, `checkout_sessions`, `cloth_batches`, `batch_pieces`, `payouts`, `payout_period_days`, `payout_ticket_items`, `payout_batch_pieces`, `business_days` — regardless of whether they were seeded or real. The `--analytics` flag gate prevents accidental execution only against accidental `pnpm db:seed` confusion; any dev who runs `pnpm db:seed:analytics` against a shared staging database wipes real operator data. T101 AC: "Does not affect or overwrite real data if run against a non-empty database (operates in a seeded namespace or requires explicit flag)" — only the flag side of this AC is satisfied.
- **Fix:** Either (a) tag seeded rows with a `seeded_namespace` marker column (or use a distinct `client.name` prefix already present — `Cliente Seed ${i+1}` — and filter delete by name/id list), or (b) add a second `--confirm-destructive` flag + loud banner naming the tables to be wiped, and require a DB URL that does not match production patterns. Option (a) is stronger; either is acceptable.

---

### M-45 — Payroll UI has no "pay today" / per-day shortcut (user add-on)

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T09R-R9)
- **Affected:** T067 (`apps/web/src/app/(protected)/admin/payroll/payroll-screen.tsx`)
- **Description:** Stakeholder feedback during Phase 9 review: "the payments to the employees are daily but I don't see the option in nómina. I see pay by day worked — that's not the same." Current flow: admin selects an employee, then manually ticks individual closed business day chips, then previews, then confirms. For the common case of "settle today's work right now" the admin still has to find and click today's date chip among a list of unsettled days. There is no single-click "pay today" shortcut. Additionally, the preview's language is "daysWorked / expectedWorkDays" which reads as secretary-specific framing even when the selected employee is a stylist or clothier — reinforcing the perception that daily payment isn't supported for them.
- **Fix:** (a) Add a "Pagar día de hoy" button beside the employee selector that auto-ticks today's closed business day (if one exists and isn't settled) and jumps directly to preview. (b) Add role-aware copy above the day picker ("Selecciona los días a liquidar — cada día se paga de forma independiente") so stylists/clothiers see the same daily-payment affordance. (c) Keep multi-day selection for back-settlement cases. Tracked as T09R-R9.

---

### M-46 — No endpoint-level response contract test suite (user add-on)

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T09R-R10)
- **Affected:** All server actions + API routes
- **Description:** Stakeholder feedback: "test all the endpoints, make sure everyone returns what is expected." Today's unit tests cover business logic modules (earnings computation, status transitions, etc.) and a small number of server actions. There is no systematic test that every mutating or reading server action/API route (a) returns the correct `ActionResult<T>` success shape for authorised callers, (b) returns `FORBIDDEN` for disallowed roles with the correct error code, (c) returns `UNAUTHORIZED` for unauthenticated, (d) returns `VALIDATION_ERROR` for malformed inputs. Regressions in the standard response shape or in role gating surface in production, not in CI.
- **Fix:** Build an endpoint inventory table under `docs/testing/endpoint-inventory.md`. Add a contract test suite under `apps/web/src/app/__tests__/endpoints/` that iterates through every listed endpoint × every role × each of the four shape assertions, executed against an in-memory pglite fixture. Target: every inventoried endpoint covered before go-live. Tracked as T09R-R10.

---

### M-47 — No integration tests for cross-module flows (user add-on)

- **Severity:** Medium
- **Status:** Resolved (T09R-R11)
- **Affected:** All phases
- **Description:** Stakeholder feedback: "add integration testing." Unit tests exercise individual modules in isolation. Cross-module flows — appointment → ticket creation → checkout → payout, batch → approve → payout, large_order → batch link → payment recording → auto-paid-in-full, offline-queue flush after reconnect — have no end-to-end coverage. Bugs that only manifest at module seams (e.g. C-19 idempotency cross-wiring, H-32 Phase 7 financial tests that stubbed real modules before T07R-R9) keep appearing because no test forces the modules to interoperate on live data.
- **Fix:** Added `apps/web/src/app/__tests__/integration/cross-module-flows.test.ts` with 25 Vitest cases covering the four required flows: (a) appointment→ticket→checkout→payout unsettled-day coverage + double-payout unique-constraint simulation; (b) batch→pieces→approve→clothier payout including variant-rate resolution; (c) large-order status auto-transition across partial, full, overpayment, and cancelled states; (d) offline-queue flush with idempotency cache, ordering, dequeue/retry, and same-key dedup. Documented in `docs/testing/README.md` § "Integration tests for cross-module flows".

---

### M-48 — `storeIdempotency` runs outside the mutation transaction

- **Severity:** Medium
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T078 (`apps/web/src/lib/idempotency.ts:40–52`, callers)
- **Description:** The helper inserts the key + response after the mutation completes (`onConflictDoNothing`). A second concurrent request arriving before the first has stored its key finds no cached row, re-executes the mutation, and both responses race to insert — the second insert is silently skipped. The real-world effect: two `markPieceDone` calls both succeed and the response cache is the first-committer's view, while the second committer has already applied a second state transition (which the optimistic lock on the piece usually catches, but not always if other fields mutate). The T078 contract promises "Check if the key already exists → return cached response. Otherwise execute the operation and store the key + response in the same transaction" — "same transaction" is not implemented.
- **Fix:** Wrap `checkIdempotency` + mutation + `storeIdempotency` in a single `db.transaction(async (tx) => …)`. Under Postgres READ COMMITTED the first transaction's INSERT acquires a row lock on `idempotency_keys.key`; the second transaction's INSERT blocks until the first commits, then fails the unique constraint and re-reads the cached response. Use `ON CONFLICT (key) DO UPDATE SET response_body = response_body RETURNING response_body` to atomically fetch-or-insert.

---

## Low-priority issues

### L-20 — T032 work bundled into T030/T031 commits

- **Severity:** Low
- **Status:** Open
- **Affected:** T032 (no-show display), commit convention
- **Description:** T032 (no-show count display) has no dedicated commit. The implementation was bundled into the T030 and T031 commits. CLAUDE.md requires one commit per task (`feat(T0XX): ...`). The work is complete and correct, but the git history doesn't reflect the task boundary.
- **Fix:** Process note — not worth rebasing. Future tasks must follow the one-commit-per-task convention.

### L-01 — T016 — No account lockout UX after rate limiting

- **Severity:** Low
- **Status:** Open
- **Affected:** T016 (login page)
- **Description:** Better Auth rate limits the login endpoint, but the login UI doesn't specify what message to show after too many failed attempts (e.g., "Too many attempts, try again in X minutes").
- **Fix:** Add rate-limit feedback message to T016 acceptance criteria.

### L-02 — T091 — No password complexity rules beyond minimum length

- **Severity:** Low
- **Status:** Open
- **Affected:** T091 (self-service password change)
- **Description:** Only specifies "< 8 characters" rejection. No requirement for mixed case, numbers, or special characters. Acceptable if intentional, but should be documented.
- **Fix:** Document as a conscious decision or add complexity rules.

### L-03 — T025 — No pagination on audit log

- **Severity:** Low
- **Status:** Open
- **Affected:** T025 (catalog audit log)
- **Description:** On a frequently-edited catalog, the audit log could grow large. No pagination or date filtering is specified for the audit log display.
- **Fix:** Add pagination to T025 acceptance criteria.

### L-04 — T023 — No maximum variant count per service

- **Severity:** Low
- **Status:** Open
- **Affected:** T023 (services migration), T024 (service catalog UI)
- **Description:** A service can have unlimited variants. Could lead to an unwieldy UI. Consider a soft limit or a warning.
- **Fix:** Add a UI warning if more than 10 variants are added (configurable threshold).

### L-05 — WhatsApp pricing data is outdated

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`
- **Description:** WhatsApp pricing section contains 2025 data in a document dated April 2026. Meta's pricing model changes frequently.
- **Fix:** Note as "pricing approximate, verify before implementation."

### L-06 — SMS pricing uses US rates for Latin American business

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`
- **Description:** SMS pricing references US Twilio rates ($0.0079/SMS) when the business is in Latin America.
- **Fix:** Update with the specific country's rates when known.

### L-07 — T032 displays a no-show count that's always 0 until Phase 5

- **Severity:** Low
- **Status:** Open
- **Affected:** T032 (no-show display, Phase 3), T032b (increment logic, Phase 5)
- **Description:** The no-show count display exists in Phase 3 but the increment mechanism doesn't arrive until Phase 5. Phase 3 deliverable can only verify "it displays 0."
- **Fix:** Acceptable as-is (design exists early), but note this in testing — meaningful verification requires Phase 5 to be complete.

### L-08 — T102 — Polling every 5 minutes may be aggressive

- **Severity:** Low
- **Status:** Open
- **Affected:** T102 (stale-tab detection)
- **Description:** Each tab polls `/api/version` every 5 minutes. With many staff members and tabs, this adds unnecessary API load.
- **Fix:** Consider using the service worker (T081) for the check, or increase interval to 15 minutes.

### L-09 — No file/image storage research

- **Severity:** Low
- **Status:** Won't fix
- **Affected:** General project scope
- **Description:** Large cloth orders may benefit from reference photos; employee profiles might need photos. No file storage solution is researched (Vercel Blob, S3, Cloudinary). File upload is implicitly out of scope but never explicitly stated.
- **Fix:** File/image uploads explicitly documented as out of scope for MVP in `docs/Business/business.md` scope exclusions.

### L-10 — `business.md` ORM reference mentions Prisma/Kysely

- **Severity:** Low
- **Status:** Resolved
- **Affected:** `docs/research/postgres-providers.md`
- **Description:** Line mentions "the ORM (Prisma/Drizzle/Kysely)" listing three options, but the project decided on Drizzle ORM. Creates confusion for new readers.
- **Fix:** Update to reference only Drizzle ORM.

### L-11 — T089 — No soft-launch / canary rollout strategy

- **Severity:** Low
- **Status:** Open
- **Affected:** T089 (production cutover)
- **Description:** The cutover checklist is all-or-nothing. A phased rollout (admin uses the app for 1 week before stylists onboard) would reduce risk.
- **Fix:** Add a phased rollout recommendation to T089.

### L-12 — T087 — Health endpoint doesn't check DB connectivity

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T087 (uptime monitoring)
- **Description:** The `/api/health` endpoint returns `{ status: "ok" }` but doesn't verify DB connectivity. If Neon is down, the health check still passes.
- **Fix:** Add a lightweight DB ping (`SELECT 1`) to the health endpoint.

### L-13 — T055 — No brand logo in email template

- **Severity:** Low
- **Status:** Open
- **Affected:** T055 (appointment confirmation email)
- **Description:** The email template AC specifies content but doesn't require brand logo/colours from T105.
- **Fix:** Add brand assets to the email template requirements.

### L-14 — Confirmation email endpoint security for non-users

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`, T056
- **Description:** The research mentions a "confirm/cancel link" in the email, implying a public endpoint. But the app is internal-only. How a non-user (the client) interacts with this link, including authentication and security, is undefined.
- **Fix:** Define the endpoint: is it a tokenized public link, or does confirmation happen manually by the secretary?

### L-15 — `commission_pct` precision not specified

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T023, T063 (earnings computation)
- **Description:** Moved from M-17 scope — `commission_pct` is stored as `numeric(0–100)` but rounding policy for fractional commissions (e.g. 33.33% of $100 = $33.33 or $33.34?) is not defined. This affects every stylist payout and compounds over time.
- **Fix:** Rounding policy defined in T002 standards: **banker's rounding (round half-even)** for all financial calculations. `commission_pct` precision = `numeric(5,2)`. Test cases with pre-calculated expected results in `docs/testing/phase-07-test-plan.md`.

### H-13 — Race condition scenarios undocumented for financial operations

- **Severity:** High
- **Status:** Resolved
- **Affected:** T038 (checkout), T051 (double-booking), T067 (payout), T068 (double-pay)
- **Description:** POS systems are inherently concurrent — multiple cashiers/stylists act simultaneously. No test scenarios document what happens with concurrent checkout of the same ticket, ticket modification during checkout, overlapping payouts, or business day closure during ticket creation.
- **Fix:** Created `docs/testing/concurrency-test-plan.md` with 8 race condition scenarios, each documenting preconditions, concurrent actions, expected outcomes, and verification methods.

### H-14 — Business day boundary edge cases untested

- **Severity:** High
- **Status:** Resolved
- **Affected:** T019 (business day), Phase 1, analytics queries
- **Description:** The business day spans calendar boundaries (e.g. 6 AM to 2 AM). No test scenarios cover: tickets across midnight belonging to the same day, opening a day without closing the previous one, analytics spanning midnight, timezone edge cases (Neon in UTC, business in Colombia UTC-5).
- **Fix:** Business day boundary test scenarios included in `docs/testing/phase-04a-test-plan.md`. Timezone constant defined (America/Bogota) in T002 standards.

### H-15 — No UAT task before go-live

- **Severity:** High
- **Status:** Resolved
- **Affected:** T088 (training), T089 (production cutover)
- **Description:** No task exists between training (T088) and go-live (T089) where actual staff use the system in a realistic scenario and provide feedback before production.
- **Fix:** Added T106 (User Acceptance Testing) to Phase 10, between T088 and T089. Each role representative uses staging for one full business day with realistic data. T089 now depends on T106.

### H-19 — Checkout idempotency uses PK without `onConflictDoNothing`

- **Severity:** High
- **Status:** Resolved
- **Affected:** T038 (checkout flow), T039 (split payment)
- **Description:** `processCheckout` stores `input.idempotencyKey` as the `checkout_sessions.id` (primary key) to deduplicate, but the insert uses a plain `db.insert(...).values(...).returning()` — no `.onConflictDoNothing({ target: checkoutSessions.id })`. If two concurrent requests arrive with the same key (offline replay + manual submit, or rapid double-click before the first response returns), both transactions read no existing row in the pre-check, both try to insert, Postgres serialises, and the loser's `INSERT` raises a duplicate-key error. That error is caught by the generic `catch` and returned as `INTERNAL_ERROR` — the caller gets no idempotent reply. CLAUDE.md's financial-mutation checklist mandates the `INSERT ... ON CONFLICT DO NOTHING RETURNING *, then fetch if empty` pattern for exactly this reason. Also: the `tickets.idempotency_key` column introduced in T033 (per the offline policy) is not referenced by checkout at all — idempotency is keyed at the session level only. That's a correct choice but should be documented.
- **Fix:** Replace the in-transaction `existingSession` pre-check and naked insert with `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id`. If no row is returned, re-fetch the existing session and rebuild the summary from the persisted `ticket_payments` rows rather than re-inserting them. Add a test that fires two concurrent `processCheckout` calls with the same `idempotencyKey` and asserts both receive `{ success: true }` with the same `sessionId`. Tracked as T04R-R3.

### H-20 — `createBatch` is not atomic (orphan-batch risk)

- **Severity:** High
- **Status:** Resolved
- **Affected:** T045 (cloth batch creation)
- **Description:** `createBatch` does two separate `db.insert(...)` calls — one into `cloth_batches`, one into `batch_pieces` — outside a `db.transaction` block. The inline comment even says "Create batch + pieces in a transaction" but the wrapping is missing. If the `batch_pieces` insert fails (invalid `cloth_piece_id`, FK violation, network blip), the `cloth_batches` row is orphaned and visible in the secretary/admin batch list without any pieces. Assigned clothiers receive no notifications yet staff see a phantom batch.
- **Fix:** Wrap both inserts in `db.transaction(async (tx) => { ... })`. Send clothier notifications only after the transaction commits (not inside it). Tracked as T04R-R4.

### H-21 — No rate limiting on any Phase 4 mutation

- **Severity:** High
- **Status:** Resolved
- **Affected:** T035 (ticket creation), T037 (status transitions), T038 (checkout), T040 (override), T041 (edit requests), T042 (reopen), T045/T046/T047 (batch flows)
- **Description:** CLAUDE.md locks `@upstash/ratelimit` as the rate-limit stack and prescribes concrete caps (ticket creation 30/min/user, general mutations 60/min/user, etc.). `@upstash/ratelimit` appears only in `pnpm-lock.yaml` and documentation — no application code imports it. Every Phase 4 mutation runs without a limiter: a compromised session, a buggy client polling loop, or a malicious insider can pound these endpoints with no backpressure. Checkout and override in particular are high-impact financial mutations.
- **Fix:** Introduce `apps/web/src/lib/rate-limit.ts` using `@upstash/ratelimit` + Upstash REST (same provider category the stack already lists) or an in-memory/DB fallback. Apply to: `createTicket`, `processCheckout`, `setOverridePrice`, `requestEdit`, `resolveEditRequest`, `reopenTicket`, `createBatch`, `claimPiece`, `markPieceDone`, `approvePiece`. Use caps from CLAUDE.md. Tracked as T04R-R5.

### H-22 — Mandatory unit tests missing for Phase 4 financial and status logic

- **Severity:** High
- **Status:** Resolved
- **Affected:** T035, T037, T038, T039, T040, T041, T042, T046, T047
- **Description:** CLAUDE.md declares unit tests mandatory for: status transitions, permission checks, double-pay / duplicate prevention, financial data integrity, and commission calculations. The current test suite has 46 passing tests — all in `middleware-helpers`, `utils`, `i18n/formatting`, and `roles`. Zero tests cover `processCheckout`, `setOverridePrice`, `createTicket`, the four ticket-status transitions, `reopenTicket`, `requestEdit`/`resolveEditRequest`, `claimPiece`, `markPieceDone`, or `approvePiece`. Per-task QA gates were not enforced. CLAUDE.md also mandates 80% coverage on `packages/db/src/queries/` — that directory does not exist and the financial logic lives inside server actions instead.
- **Fix:** Add Vitest unit tests covering (a) ticket status transition matrix × role, (b) checkout idempotency (same key → same session), (c) payment-sum-vs-total mismatch, (d) optimistic-lock conflict on concurrent checkout, (e) override price recomputes totals, (f) non-cashier cannot set override, (g) batch-piece self-claim race, (h) mark-done by the wrong clothier is rejected, (i) approve skips pending pieces without version bump. Use a transactional test harness that rolls back after each test per CLAUDE.md. Defer the `queries/` directory convention to a separate conversation. Tracked as T04R-R6.

### H-23 — T032b reopen path leaves DB exclusion errors uncaught

- **Severity:** High
- **Status:** Resolved
- **Affected:** T032b (no-show count), T051 (double-booking constraint)
- **Description:** The `appointments_no_overlap` exclusion constraint (T051) has the partial predicate `WHERE status NOT IN ('cancelled','rescheduled','no_show')`, which means a `no_show` row is not part of the exclusion index. When another booking is later created in the same slot, the no-show row's slot becomes occupied. T032b's new `reopen` action transitions `no_show → booked`, which re-enters the exclusion index. If the slot is now taken, Postgres raises `SQLSTATE 23P01` (exclusion_violation) and the raw error bubbles up through `db.transaction(...)` because there is no `try/catch` in `transitionAppointment`. The user sees a 500 with a Drizzle stack trace instead of a friendly conflict message.
- **Fix:** Wrap the reopen branch in `try/catch`, detect `error.code === '23P01'` (or message-match `appointments_no_overlap`), and return `{ success: false, error: { code: "CONFLICT", message: "El horario ya está ocupado por otra cita" } }`. Tracked as T05R-R4.

### H-24 — T109 multi-step writes are not transactional

- **Severity:** High
- **Status:** Resolved
- **Affected:** T109 (price change notification), T024 (catalog edit)
- **Description:** `editVariant` performs (1) variant update, (2) audit-log insert, (3) appointment-flag reset (UPDATE), (4) N notification inserts (one per affected appointment × number of secretaries) — none wrapped in a single transaction. If the process crashes between steps the variant is updated but appointments are not re-flagged, or the flag reset succeeds but only some secretaries get notified. Per CLAUDE.md, multi-write side effects from a single user action should be atomic; the same standard was applied in T04R-R4 (createBatch) and T04R-R7 (resolveEditRequest).
- **Fix:** Move steps (1)–(3) into a `db.transaction`. Defer notification creation (step 4) to post-commit (collect the appointment list inside the transaction, then `await Promise.all(...)` for notifications outside). Tracked as T05R-R5.

### H-17 — Missing `updated_at` column on `employees` and `business_days` tables

- **Severity:** High
- **Status:** Resolved
- **Affected:** T012 (employees migration), T019 (business days migration)
- **Description:** CLAUDE.md conventions require all tables to include `updated_at` (`timestamp with time zone`, default `now()`) with auto-refresh via Drizzle `.$onUpdate()`. Both the `employees` and `business_days` tables are missing this column. This will cause issues in Phase 7 (payroll) and Phase 4A (tickets) where `updated_at` is needed for audit trails and stale-data detection. The `business_settings` table correctly includes `updated_at`, confirming this is an oversight on the other two.
- **Fix:** Add a new migration to add `updated_at` columns to both tables. Update Drizzle schemas with `.$onUpdate(() => new Date())`. Tracked as T01R-R2.

### H-16 — No post-deployment smoke test

- **Severity:** High
- **Status:** Resolved
- **Affected:** T095 (CI/CD pipeline)
- **Description:** CI runs lint, typecheck, and unit tests on PRs, but after deployment to staging/production, no automated verification confirms the deployed app works (login, DB connection, core flow).
- **Fix:** Added post-deployment smoke test AC to T095: Playwright suite runs against the deployed URL after Vercel deploys.

### M-19 — No structured logging for silent business logic failures

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T085 (Sentry), financial operations
- **Description:** Sentry captures thrown errors, but silent business logic failures are more dangerous: a payout junction table insert silently fails, a real-time event fails to publish, a commission uses a stale rate. No structured logging exists for these cases.
- **Fix:** Added structured business logic logging AC to T085: pino or similar for every financial operation, logging operation type, actor, amount, entities, and timestamps.

### M-20 — No integration test scenarios at phase boundaries

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** All phases
- **Description:** Task dependencies are documented, but no integration test verifies that deliverables from Phase N-1 work correctly with Phase N's code (e.g., a client created in Phase 3 links to a ticket in Phase 4A, earnings from Phase 4A aggregate in Phase 7 payroll).
- **Fix:** Integration test approach documented in `docs/testing/README.md`. When starting Phase N, the first task includes an integration test verifying Phase N-1 deliverables.

### M-21 — `pino-pretty` referenced but not installed

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T085 (Sentry / logger), `apps/web/src/lib/logger.ts`
- **Description:** `logger.ts` uses `pino-pretty` as a dev transport, but the package is not in `apps/web/package.json`. Importing the logger in development will crash with a module-not-found error.
- **Fix:** `pnpm add -D pino-pretty --filter @befine/web`. Tracked as T0AR-R1.

### M-22 — Seed script inserts are not transactional

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T011 (seed script), `packages/db/src/seed.ts`
- **Description:** User and account rows are inserted with separate `db.insert()` calls. If the account insert fails (e.g. network error), the user row remains but has no credentials. Re-running the seed won't fix it because the email check skips existing users.
- **Fix:** Wrapped both inserts in `db.transaction()`. Tracked as T0AR-R2.

### M-23 — Middleware allows cross-role page access

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T010 (RBAC), `apps/web/src/middleware.ts`
- **Description:** Middleware checked authentication only — any authenticated user could navigate to any role's page (e.g. a stylist accessing `/cashier`). Would have exposed unauthorized data once Phase 1 added real content.
- **Fix:** Added `roleCanAccess()` gating — each role restricted to its own path prefix; unauthorized access redirects to role home. Tracked as T0AR-R3.

### M-25 — Duplicate `ROLE_HOME` constant in middleware-helpers and login-form

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T016 (login page), T018 (session middleware)
- **Description:** `ROLE_HOME` is defined identically in both `apps/web/src/lib/middleware-helpers.ts` and `apps/web/src/components/login-form.tsx`. If a role's home path changes, both locations must be updated. Since `middleware-helpers.ts` is a server module and `login-form.tsx` is a client component, they can't directly share the import.
- **Fix:** Move `ROLE_HOME` to a shared constants file in `@befine/types` (which is isomorphic) and import from both locations. Tracked as T01R-R3.

### M-24 — Sentry PII scrubbing covers only request data

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T085 (Sentry), `sentry.client.config.ts`, `sentry.server.config.ts`
- **Description:** `beforeSend` only scrubbed `event.request.data`. PII could also appear in exception messages, breadcrumbs, and extra data.
- **Fix:** Extended `beforeSend` to scrub exception messages (email regex), breadcrumb messages/data, and extra data on both client and server configs. Tracked as T0AR-R4.

### L-16 — `use-sse.ts` is dead code superseded by T098 abstraction

- **Severity:** Low
- **Status:** Resolved
- **Affected:** `apps/web/src/hooks/use-sse.ts`, T009, T098
- **Description:** T098's `useRealtimeEvent` creates its own `EventSource` directly rather than delegating to `useSSE`. The spike hook's comment claimed it would be "the underlying primitive" but T098 was implemented independently. Any Phase 4A+ code accidentally importing `useSSE` would bypass the abstraction.
- **Fix:** Added `@deprecated` JSDoc to `use-sse.ts` directing developers to `useRealtimeEvent`. Hook kept for spike reference.

### L-18 — Inconsistent role-check pattern across server actions

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T019 (business day actions), T013/T014/T015/T022a (employee actions)
- **Description:** `business-day.ts` uses a `isCashierAdmin()` helper function while `update-employee.ts` and `create-employee.ts` inline the check as `session.user.role !== "cashier_admin"`. Both work but are inconsistent. CLAUDE.md documents a `hasRole(session.user, "cashier_admin")` pattern.
- **Fix:** Create a shared `hasRole(session, role)` helper and standardize all server actions. Low priority — cosmetic consistency. Tracked as T01R-R4.

### L-19 — Admin settings page not yet created (disabled nav item)

- **Severity:** Low
- **Status:** Open
- **Affected:** T108 (business settings)
- **Description:** T108 AC allows "a stub screen for now" and the nav item exists in `nav-config.ts` (`/admin/settings`, disabled: true), but no actual page exists at that route. Acceptable for Phase 1 since `enforce_subtype_service_restriction` only becomes meaningful in Phase 4A (T035/T028).
- **Fix:** Create stub settings page before Phase 4A. No remediation needed now.

### L-17 — `useRealtimeEvent` ref updates use `useEffect` instead of `useLayoutEffect`

- **Severity:** Low
- **Status:** Resolved (2026-04-24, covered by Phase 9R)
- **Affected:** `packages/realtime/src/client.ts`
- **Description:** Callback refs (`onDataRef`, `onPollRef`) are updated in a `useEffect` (runs after paint), not `useLayoutEffect` (runs synchronously after DOM mutation). There is a one-render window where refs could be stale. In practice this is benign — callbacks only fire from async sources (SSE messages, polling timers) — but it's inconsistent with the pattern used in `use-sse.ts`.
- **Fix:** Low priority. Switch ref update to `useLayoutEffect` if stale-callback bugs surface in Phase 4A.

### L-21 — `archiveOldNotifications` exposed as a server action

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T048 (notifications)
- **Description:** `archiveOldNotifications` lives in the same `"use server"` module as the user-facing notification actions, so it is a callable endpoint. Any authenticated user can invoke it directly; it only archives their own notifications, so the blast radius is limited to "archive my own items" — no data theft or spam, but it's an unnecessary endpoint surface. Also it isn't actually called from anywhere today (the "lazy archive on list" comment in the source is aspirational).
- **Fix:** Either move it into the same non-`"use server"` module as `createNotification` (see C-07) and call it from `listNotifications`, or delete it entirely and rely on a scheduled job later. Tracked with T04R-R2.

### L-22 — Dead duplicate `transitionToReopened` server action

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T042 (ticket reopen)
- **Description:** `transitionToReopened` in `apps/web/src/app/(protected)/tickets/actions/index.ts` is an orphaned reopen implementation superseded by `reopenTicket` in `admin/tickets/history/actions.ts`. The admin version correctly detaches the ticket from its `checkout_session`, updates `is_partially_reopened`, and contains the payout stub comment; the dead one does none of that. A future refactor could accidentally wire it back up and silently regress T042's AC.
- **Fix:** Delete `transitionToReopened` (it has no callers in the app code — only lingering graphify-out references). Tracked as T04R-R8.

### L-23 — Phase 4 server actions skip Zod validation on scalar inputs

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T041 (`requestEdit`, `resolveEditRequest`), T042 (`reopenTicket`), T046 (`claimPiece`, `markPieceDone`), T047 (`approvePiece`, `adminMarkApproved`), T048 (`markRead`)
- **Description:** CLAUDE.md requires every server action to validate input with a Zod schema before business logic. Several Phase 4 actions accept raw `string`/`number` parameters (e.g. `ticketItemId: string`, `pieceId: string`, `expectedVersion: number`) and rely on the DB to reject malformed IDs. The Drizzle query is parameterised so there's no SQL-injection risk, but the convention ensures consistent error codes (`VALIDATION_ERROR` vs generic `INTERNAL_ERROR` on a bad UUID) and keeps the validation boundary explicit.
- **Fix:** Define shared Zod schemas in `packages/types/src/schemas/` (`editRequestSchema`, `reopenTicketSchema`, `claimPieceSchema`, etc.) and `safeParse` inputs at the top of each action. Tracked as T04R-R9.

---

### C-11 — `/large-orders/*` unreachable for every authenticated role

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T058, T059, T061, T062 (entire Phase 6 UI), `nav-config.ts`
- **Description:** The middleware's `roleCanAccess()` allows a request only when the pathname starts with the role's home prefix (`/cashier`, `/secretary`, `/stylist`, `/clothier`), `/admin` (for `cashier_admin`), or one of `SHARED_APP_PATHS` (`/profile`). `/large-orders` matches none of these, so every authenticated request to `/large-orders*` is rewritten to `/403`. The large-orders nav link (added to both `cashier_admin` and `secretary` in `nav-config.ts`) is therefore dead. Server actions defined under that path are also unreachable from the UI, so the entire Phase 6 feature is non-functional despite passing its structural ACs.
- **Fix:** Either (a) register `/large-orders` in `SHARED_APP_PATHS` and keep role enforcement in the page/server-action layer, or (b) move the route to `/admin/large-orders` + `/secretary/large-orders` (matching the existing prefix convention) and update every internal link, `revalidatePath`, and nav entry. Add middleware-helpers unit tests that explicitly assert each role's access to `/large-orders*`. Tracked as T06R-R1.

---

### H-25 — T062 "cashier read-only" AC unimplementable against current 4-role model

- **Severity:** High
- **Status:** Resolved
- **Affected:** T062
- **Description:** T062 AC reads "Admin and secretary can access; cashier read-only." The app has four roles: `cashier_admin`, `secretary`, `stylist`, `clothier` — there is no standalone "cashier" role. Current implementation only grants access to `cashier_admin` and `secretary` (both can write). The AC is either a vestige of an earlier role model or requires introducing a read-only check path, which no other Phase 6 server action supports.
- **Fix:** Disambiguate the AC. Either (a) strike the "cashier read-only" clause and treat `cashier_admin` + `secretary` as the full access set (preferred, matches the rest of the app), or (b) split the auth helper into `requireOrderWrite` vs `requireOrderRead` and clarify which role is the read-only one. Update `phase-06-large-orders.md` accordingly. Tracked as T06R-R3.

---

### H-26 — `recordLargeOrderPayment` allows overpayment, silent clamp, and unsafe auto-transition

- **Severity:** High
- **Status:** Resolved
- **Affected:** T061
- **Description:** Three related defects:
  1. No upper bound — `amount` only has to be `>= 1`. A secretary can accidentally record $999.999.999 against a $100.000 order; the ledger records the excess, balance displayed clamps to 0 via `Math.max`, and the overpayment is hidden.
  2. The auto-transition to `paid_in_full` checks `order.status !== "paid_in_full"` from the pre-transaction read, not inside the transaction. A concurrent `cancel` can interleave, leaving the order simultaneously "paid" and "cancelled" in effect (payments recorded after cancel are allowed by the server because the pre-read saw `pending`).
  3. The order row is not re-read under a lock (`FOR UPDATE`) and the existing `version` column is not incremented on auto-transition, so two concurrent payments that each individually zero the balance can both fire the `paid_in_full` update.
- **Fix:** (a) Reject when `amount > max(0, totalPrice - totalPaid)` with a `VALIDATION_ERROR` unless the caller passes an explicit `allowOverpayment: true` flag (requires admin); (b) re-read the order row inside the transaction with `SELECT ... FOR UPDATE` (or with `WHERE version = $expected`) and abort the auto-transition if the status has changed or is `cancelled`; (c) bump `version` on every write. Add a success toast on record (UI currently just refreshes silently). Tracked as T06R-R2.

---

### H-27 — T059 cancellation-with-deposits confirmation AC not implemented

- **Severity:** High
- **Status:** Resolved
- **Affected:** T059
- **Description:** T059 AC says "Cancellation of an order with deposits recorded prompts a confirmation noting whether deposits are refundable (business decision: document refund policy)." Current UI shows only an inline text input asking for the reason — no listing of recorded payments, no refund-policy copy, no explicit confirmation step distinct from typing the reason. The server accepts the cancel transition regardless of whether `sum(payments) > 0`. A single accidental click → typed reason → Enter is enough to cancel a $2M order with deposits recorded.
- **Fix:** UI: open a `ConfirmationDialog` that lists existing payments + total paid, displays the refund-policy copy (pull from `business_settings`), and requires an explicit "Confirm cancel" button plus a non-empty reason. Server: when action is `cancel` and `sumPayments > 0`, require a boolean `acknowledgedDeposits` flag in the schema; reject if missing. Tracked as T06R-R4.

---

### M-32 — `editLargeOrder` missing optimistic lock, terminal-state guard, and total-below-paid guard

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T058
- **Description:** `editLargeOrder` does not accept a `version` and does not increment it, so concurrent edits overwrite each other silently. It also does not check the order's current `status`, so a race between the client hiding the edit button (on terminal status) and the server accepting the request can modify `paid_in_full` or `cancelled` orders. Finally, there is no guard preventing `totalPrice` from being lowered below the already-paid total, which then silently clamps `balanceDue` to 0 via `Math.max`.
- **Fix:** Extend `editLargeOrderSchema` with `version: z.number().int()`. In the handler, `WHERE id = $id AND version = $version AND status NOT IN ('paid_in_full', 'cancelled')`, bump version, return `STALE_DATA` on zero rows. Add `parsed.data.totalPrice >= totalPaid` check before the update. Tracked as T06R-R5.

---

### M-33 — Zero unit tests added for Phase 6 (CLAUDE.md mandate)

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T057–T062
- **Description:** CLAUDE.md lists "Status transitions", "Permission / role checks", "Double-pay / duplicate prevention", and "Financial data integrity" as categories with mandatory unit tests. Phase 6 covers all four (order status flow, secretary vs cashier_admin write gate, auto-transition to `paid_in_full`, balance computation in integer pesos) yet added zero tests — regression count stayed at 148 after Phase 5.
- **Fix:** Add Vitest unit tests covering: allowed transition matrix (including rejecting reverse transitions), cancellation-reason-required, auto-`paid_in_full` threshold (exact, under, over), balance computation with 0/1/N payments, role gates on all six actions, archived-client rejection on create, idempotency on duplicate deposit submission. Tracked as T06R-R6.

---

### M-34 — Create vs edit schema inconsistency on `estimatedDeliveryAt` + `notes`

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T058
- **Description:** `createLargeOrderSchema` uses `.optional()` (undefined allowed, null rejected) while `editLargeOrderSchema` uses `.optional().nullable()` (both allowed) for the same fields. The client passes `null` from `editLargeOrderForm` for the edit path but `undefined` on create. Also, `initialDepositAmount` and `initialDepositMethod` are independently optional — nothing prevents a caller from passing amount without method (amount would be silently ignored by the `if (…amount && …method)` branch).
- **Fix:** Align both schemas on `.nullish()` for `estimatedDeliveryAt` and `notes`. Add a Zod `.refine()` on the create schema: `(amount > 0) === !!method`. Tracked as T06R-R7.

---

### H-28 — Lighthouse: background/foreground contrast ratio failure (WCAG AA)

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** Unknown component (Lighthouse desktop audit, 2026-04-24)
- **Description:** Lighthouse Accessibility score is 95 (not 100). One or more colour pairs fail the WCAG AA contrast requirement (4.5:1 for normal text, 3:1 for large text). Exact element not identified — requires inspecting the Lighthouse "Accessibility" section in Chrome DevTools to see which element is flagged.
- **Fix:** Open Chrome DevTools Lighthouse → Accessibility → "Background and foreground colors do not have a sufficient contrast ratio" — click the failing element. Adjust the relevant Tailwind/CSS colour token to meet WCAG AA. Re-run Lighthouse to verify score reaches 100. Must be fixed before T089 (go-live) — CLAUDE.md mandates WCAG AA.

---

### M-35 — Archived-client TOCTOU in `createLargeOrder`

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T058
- **Description:** `listClientsForOrder` filters to `isActive = true`, but `createLargeOrder` re-fetches the client only by `id` — if the client is archived between dropdown load and submit, a new large order is attached to an archived client. AC of T058 explicitly requires "Only saved clients (not guests) can be linked", and by extension the soft-delete convention implies archived clients cannot receive new orders.
- **Fix:** In `createLargeOrder`, add `eq(clients.isActive, true)` to the client lookup and return `VALIDATION_ERROR` with message "El cliente está archivado" when not found. Tracked as T06R-R8.

---

### L-26 — Unsafe `sql.raw` array interpolation in `getLargeOrderBatchSummary`

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T060
- **Description:** The query builds `sql.raw(\`ARRAY['\${batchIds.join("','")}']::uuid[]\`)`by string concatenation. Because`batchIds`comes from the database (UUID PKs), there is no real injection vector today, but the pattern bypasses parameter binding and will break the first time someone refactors the source of`batchIds`.
- **Fix:** Replace with `inArray(batchPieces.batchId, batchIds)` from `drizzle-orm`. Tracked as T06R-R9.

---

### L-27 — Hardcoded Spanish "Registrado por" in `large-order-detail.tsx`

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T061
- **Description:** The payment-history table header at `large-order-detail.tsx:366` reads `Registrado por` as a literal string, bypassing `next-intl`. Violates the "no hardcoded user-facing strings" policy in CLAUDE.md.
- **Fix:** Add `largeOrders.recordedBy` key to `es.json` + `en.json`; replace literal with `{t("recordedBy")}`. Tracked as T06R-R10.

---

### L-28 — Missing `revalidatePath('/large-orders/[id]')` on detail-page mutations

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T058, T059, T061
- **Description:** `editLargeOrder`, `transitionLargeOrder`, and `recordLargeOrderPayment` call `revalidatePath("/large-orders")` (the list) but not `/large-orders/[orderId]` (the detail page). Another tab viewing the same order does not re-render server data on navigation until the cache TTL expires. `router.refresh()` handles the current tab but not cross-tab.
- **Fix:** Add `revalidatePath(\`/large-orders/\${orderId}\`)` alongside the list revalidation in all three mutations. Tracked as T06R-R11.

---

### L-29 — Destructive cancel action lacks a `ConfirmationDialog`

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T059
- **Description:** CLAUDE.md: "Destructive actions require a `ConfirmationDialog` before executing." The current cancel flow shows a secondary button that reveals an inline reason input next to a red Cancel button. There is no modal, no summary of consequences, no typed-to-confirm pattern. Click-through velocity is high. Related to H-27 but tracked separately because even orders with no deposits should get a confirmation.
- **Fix:** Wrap the cancel action in the shared `ConfirmationDialog` primitive. The dialog owns the reason input and the destructive confirm button. Tracked as T06R-R12.

---

### L-30 — `MyEarningsView` empty state only triggers on empty payout history

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T07R-R15)
- **Affected:** T069 (`apps/web/src/components/my-earnings-view.tsx:38`)
- **Description:** T069 AC explicitly: "Empty state shown when no earnings exist for the period (message: 'No earnings recorded for this period')". The component only shows the empty state when `payoutHistory.length === 0` — but a brand-new employee with $0 today/week/month and no payouts shows the message; an established employee viewing their first slow week sees three "$0" cards with no contextual message and no payout history block at all. Mismatch with AC wording.
- **Fix:** Render the empty-state line when `today === 0 && thisWeek === 0 && thisMonth === 0 && payoutHistory.length === 0` — but also when the period summaries are zero, regardless of history, surface a softer "Sin movimientos en este período" line above the cards.

---

### L-31 — Mobile "Add absence" button defaults to today, allows future-dated entries silently

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T07R-R16)
- **Affected:** T021 (`apps/web/src/app/(protected)/admin/absences/absence-calendar.tsx:202–207`)
- **Description:** On mobile, tapping "Registrar ausencia" sets `selectedDate = new Date().toISOString().slice(0, 10)`. The form then accepts any employee + type and saves the absence for today regardless of which month is currently in view. There's no date picker — the admin has to know to navigate to today first. Worse, since absences accept future dates without warning, an admin can pre-load vacation days but the UI gives no signal that it's intentional vs accidental.
- **Fix:** On mobile, swap the inline form for a sheet/drawer with an explicit `<input type="date">` defaulted to "today in Bogota" but freely editable. On desktop, keep click-on-cell as the date picker (current UX is fine there).

---

### L-32 — `payouts.period_business_day_ids` array prevents efficient unsettled queries

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T066 (`packages/db/src/schema/payouts.ts:31`)
- **Description:** Storing covered days as `uuid[]` requires every "is this day settled?" check to either (a) load every payout into memory and `flatMap` (current code in `listClosedBusinessDays`, `getUnsettledEmployees`, `getUnsettledPeriodsForEmployee`) or (b) write a `ANY(period_business_day_ids)` query that can't use a normal B-tree index. As payout volume grows, all three call sites become O(payouts × closedDays). Resolved together with C-12 if the suggested junction table approach is taken.
- **Fix:** When fixing C-12, prefer a `payout_period_days(payout_id, business_day_id, employee_id)` table with `UNIQUE(employee_id, business_day_id)` plus indexes on each FK. Drop `period_business_day_ids` from `payouts`.

---

### L-33 — CSV export shape loses business-day granularity per employee

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T076 (`apps/web/src/app/(protected)/admin/analytics/actions.ts:140–181`)
- **Description:** T076 AC: "CSV includes: business day date, revenue, jobs count, per-employee earnings". The current CSV is two disjoint sections — (1) date,revenue,jobs and (2) employeeName,role,earnings totalled across the period. Accountants cannot pivot per-day-per-employee without going back to the app. Also the joined section has no shared key between the two blocks, so spreadsheet pivots are not possible.
- **Fix:** Reshape into one table: one row per `(businessDayId, employeeId)` with columns `date, employeeName, role, jobs, earnings, dailyRevenue, dailyJobs`. Rename the file if filename collision with the current shape matters.

---

### L-34 — Employee table not sortable by jobs count

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T074 (`apps/web/src/app/(protected)/admin/analytics/analytics-dashboard.tsx:251–339`)
- **Description:** T074 AC: "Sortable by name, jobs count, earnings". The current implementation only fetches `totalEarnings` per employee (via `earningsByEmployee`) — not a job count — and the `SortKey` type is `"name" | "earnings"`. Clicking any "Jobs" header would be a no-op because the data is not there.
- **Fix:** Either (a) join `jobsCountByEmployee` into `getAnalyticsSummary`'s earningsTable and add a `"jobs"` sort key with a visible column; or (b) formally drop "jobs count" from T074's AC since the admin can already see total jobs on the metric card. Option (a) is closer to the spec.

---

### L-35 — `dailyRevenueBreakdown.date` uses UTC slice, not Bogota

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T071 (`packages/db/src/queries/analytics.ts:258–263`, `399–403`, `428–432`, `464–473`)
- **Description:** Five call sites format `date` as `new Date(openedAt).toISOString().slice(0, 10)`. `toISOString` is UTC; `openedAt` is stored UTC. For seed days opened at 08:00 Bogota (13:00 UTC) the sliced date is correct, but any day opened after 19:00 Bogota (00:00+ UTC next day) reports the UTC date — one day ahead of the Bogota date. Not a concern for the current seed data (fixed 08:00 opens) but brittle for real operations.
- **Fix:** Use `toLocaleDateString("en-CA", { timeZone: "America/Bogota" })` — the same helper (`bogotaDateStr`) already exists in `seed-analytics.ts:68–70`. Extract to a shared `@befine/db` utility and replace the 5 call sites.

---

### L-36 — `performance-results.md` has three pending manual measurements

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T107 (`docs/testing/performance-results.md:55–95`)
- **Description:** T107 AC: "Results documented in `docs/testing/performance-results.md`" and "Any endpoint or page exceeding its target is flagged as blocking in `docs/issues-tracker.md` and fixed before T089 (go-live)". The doc marks client-side navigation, LCP-on-mobile-4G, and SSE delivery latency as ⏳ "Manual measurement pending". While the DB-level numbers are complete, the user-perceivable metrics that T107 was written to enforce are not actually captured yet.
- **Fix:** Run the three manual measurements (Chrome DevTools Performance/Lighthouse on a running deployment; two-tab SSE test) and record the numbers. If any target is missed, log a new blocking issue here. This can follow T08R-R3 (real-time refresh) because SSE latency is affected by that change.

---

### L-37 — `useQueueFlush` flushes on mount regardless of prior offline state

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T079 (`apps/web/src/lib/use-queue-flush.ts:85–91`)
- **Description:** The effect calls `flush()` unconditionally if `navigator.onLine` on mount. For users who have never been offline (the overwhelming majority of sessions), this triggers an IndexedDB read and a no-op flush on every page load. Harmless but wasteful.
- **Fix:** Track a ref that flips to `true` on the `offline` event and only call `flush()` on the next `online` event if the ref was set. First-page-load flush can be replaced with a one-time "check-if-queue-has-items" via `listQueued` + early return if empty.

---

### L-38 — `SyncStatus` `role` prop is typed as `string`

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T080 (`apps/web/src/components/sync-status.tsx:16`)
- **Description:** The prop is declared `role: string` so the `role === "cashier_admin"` branch is stringly-typed. Other roles could be passed in without TypeScript complaining.
- **Fix:** Import `AppRole` from `@befine/types` and type the prop as `AppRole`. Layout already casts the role before passing, so the fix is localised.

---

### L-39 — PWA manifest missing `scope` and `lang`

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T082 (`apps/web/src/app/manifest.ts`)
- **Description:** `scope` defaults to `start_url`'s directory which is fine, but being explicit (`scope: "/"`) helps iOS Safari PWA behavior. `lang: "es"` is missing — the app is Spanish-primary per CLAUDE.md and i18n setup.
- **Fix:** Add `scope: "/"` and `lang: "es"` to the manifest return.

---

### L-40 — No service-worker update prompt UI

- **Severity:** Low
- **Status:** Resolved (2026-04-24, T10R-R4)
- **Affected:** T081 (`apps/web/next.config.ts:50–53`)
- **Description:** Workbox is configured with `skipWaiting: true` and `clientsClaim: true`, which means a new SW version takes over on next navigation without asking the user. Users mid-session on a long-lived tab don't get a prompt when a new release ships — they just see behaviour change mid-action or on reload. For a POS app where cashiers keep the same tab open all day, this is subtly disruptive.
- **Fix:** Subscribe to the `controllerchange` event on `navigator.serviceWorker` and show a toast "Hay una nueva versión — recarga para actualizar" with a Reload button. Alternative: keep `skipWaiting: false` and explicitly `registration.waiting.postMessage({ type: "SKIP_WAITING" })` after user confirms.

---

### M-49 — Missing meta description on all pages (SEO score 83)

- **Severity:** Medium
- **Status:** Open
- **Affected:** All pages (`apps/web/src/app/layout.tsx`)
- **Description:** Lighthouse SEO audit flags "Document does not have a meta description." Currently no `<meta name="description">` is set in any page's `<head>`. This lowers the SEO score to 83. While this is an internal B2B app, login page and any public-facing paths are indexed by search engines.
- **Fix:** Add a `description` field to the `metadata` export in `apps/web/src/app/layout.tsx` and override per page where appropriate (login, 403). Example: `export const metadata = { title: "BeFine", description: "Sistema de gestión para salones de belleza" }`.

---

### M-50 — `robots.txt` has 2 validation errors

- **Severity:** Medium
- **Status:** Open
- **Affected:** `apps/web/public/robots.txt`
- **Description:** Lighthouse reports "robots.txt is not valid — 2 errors found." Invalid `robots.txt` can cause Google Search Console to reject the file, making crawl directives unreliable.
- **Fix:** Validate `public/robots.txt` at `https://search.google.com/search-console/robots-testing-tool`. Fix the two errors (likely missing newlines, invalid directive syntax, or duplicate `User-agent` stanzas). For a private app, a minimal valid file is: `User-agent: *\nDisallow: /`.

---

### M-51 — Browser console errors logged (Lighthouse Best Practices: 96)

- **Severity:** Medium
- **Status:** Open
- **Affected:** Unknown — requires browser DevTools inspection
- **Description:** Lighthouse Best Practices score is 96 (not 100) due to "Browser errors were logged to the console." Likely candidates: hydration mismatch warnings, missing environment variable warnings, or uncaught promise rejections.
- **Fix:** Open Chrome DevTools Console on the production URL; filter for errors (red). Identify and fix each one. Common sources: `process.env` variables missing at runtime, React hydration mismatches from server/client rendering differences, or uncaught async rejections in event handlers.

---

### L-41 — Legacy JavaScript (est. −13 KB savings)

- **Severity:** Low
- **Status:** Open
- **Affected:** Next.js build config (`apps/web/next.config.ts`)
- **Description:** Lighthouse flags legacy JavaScript that could save ~13 KB. Next.js may be transpiling modern syntax for older browsers due to `browserslist` or `@babel/preset-env` targets.
- **Fix:** Verify `apps/web/.browserslistrc` or `package.json` `browserslist` field targets modern browsers only (e.g. `> 0.5%, last 2 versions, not dead, not IE 11`). Check if any polyfills are being included unnecessarily. Consider `next.config.ts` `experimental.browsersListQueries` if needed.

---

### L-42 — Unused JavaScript (est. −78 KB savings)

- **Severity:** Low
- **Status:** Open
- **Affected:** Analytics dashboard, large dialogs (`apps/web/src/app`)
- **Description:** Lighthouse flags ~78 KB of unused JavaScript on initial load. Primary suspect: Recharts (~120 KB gzip, loaded eagerly on analytics page). Secondary suspects: large dialog components imported at module level.
- **Fix:** Apply `next/dynamic` with `{ ssr: false }` to the Recharts area chart and bar chart components on the analytics dashboard. Evaluate other large imports (dialog content, heavy form components) for lazy-loading. Re-run Lighthouse to verify savings. Note: analytics LCP is already at 2.8 s (close to 3.0 s budget) — this fix directly protects that target.

---

### L-43 — Page prevents bfcache restoration (2 failure reasons)

- **Severity:** Low
- **Status:** Open
- **Affected:** Unknown pages
- **Description:** Lighthouse reports the page blocked back/forward cache (bfcache) for 2 reasons. Common causes: `Cache-Control: no-store` response header, `unload` event listener registered, or use of `SharedArrayBuffer`. Blocked bfcache means browser back/forward navigation does a full reload instead of instant restore.
- **Fix:** Open Chrome DevTools → Application → Back/forward cache → Test. Inspect the listed failure reasons. Remove `unload` listeners (replace with `pagehide` or `visibilitychange`). If `Cache-Control: no-store` is the cause, evaluate whether it's needed or can be scoped more narrowly via Vercel headers config.

---

### C-21 — No Content-Security-Policy headers defined anywhere

- **Severity:** Critical
- **Status:** Resolved (2026-04-24, T10R-R1)
- **Affected:** T089 (`apps/web/next.config.ts`, Vercel project settings)
- **Description:** T089 security review AC explicitly requires "XSS prevention confirmed (CSP headers set)" and the go-live checklist step 2 states "CSP: CSP headers configured in `next.config.ts` or Vercel project settings". Neither location defines any `Content-Security-Policy` header. `next.config.ts` has no `headers()` function; Vercel dashboard cannot be inspected from this repo but nothing in the codebase enforces CSP. Result: the primary defence-in-depth layer against stored-XSS (e.g. client name injected via T100 CSV import rendered in a cashier's search widget) is missing. Any XSS slip past React's auto-escaping — third-party script compromise, dangerouslySetInnerHTML, accidentally-injected inline styles — executes unmitigated.
- **Fix:** Add a `headers()` async function to `next.config.ts` emitting a production-grade CSP. Baseline: `default-src 'self'; script-src 'self' 'unsafe-inline' *.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' *.neon.tech *.upstash.io *.sentry.io *.vercel.live; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Also add `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. Verify no console CSP violations on all 4 role dashboards, login, and checkout. Add a regression test that `GET /` returns the `Content-Security-Policy` header.

---

### H-43 — T084 optimistic ticket status update not implemented

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R2)
- **Affected:** T084 (`apps/web/src/app/(protected)/tickets/`)
- **Description:** T084 AC states: "Optimistic ticket status update reverts to previous state on API error", and the "what to do" section specifies "Optimistic updates for ticket status changes (update UI immediately, revert on error)." A project-wide grep for `useOptimistic` returns zero matches. All ticket status transitions rely on server-action completion + `revalidatePath` round-trip. On a slow network the stylist or cashier sees a visible delay between tap and the badge/colour changing, exactly the UX issue T084 was meant to eliminate. The "Note" in the AC softens this to auditing completeness, but the optimistic-update behaviour itself is a concrete unmet AC and the commit that closed T084 only shipped a shared `loading.tsx`.
- **Fix:** Wrap the ticket list client view in `useOptimistic`. On mark-awaiting-payment / mark-paid transitions, optimistically flip the status badge and colour; on action error, surface the server error via toast and the optimistic state auto-reverts. Add a Playwright flake test that a deliberate server error reverts the UI. If the decision is instead to descope optimistic updates formally, update T084 AC text and log the decision — leaving the AC as-written but unmet is not acceptable.

---

### H-44 — T086 restore drill not actually performed

- **Severity:** High
- **Status:** Open (blocked — see T10R-R3, no staging branch yet)
- **Affected:** T086 (`docs/research/backup-policy.md`)
- **Description:** T086 AC requires "Restore drill performed on staging: drop a table, restore to a prior point." The runbook at `docs/research/backup-policy.md:50-52` contains the drill procedure but the result table is entirely empty placeholders (`⏳ — — — — —`). A runbook you have never executed is not a proof of recoverability. If Neon PITR fails or the promote-branch-to-production step takes longer than documented, we discover it during a real incident, not during a drill.
- **Fix:** Execute the drill on the staging Neon branch. Record the actual date, operator, target timestamp, inserted row ID, confirmation of absence after restore, and wall-clock duration in the table. Additionally capture: exact Vercel env-var update steps, any Neon console UX gotchas, and whether Connection-Pooler URLs needed to be re-issued post-restore. Only after a successful drill may this AC be ticked on the go-live checklist.

---

### H-45 — Issues-tracker Open-status is badly out of sync with resolved Phase 7R/8R/9R work

- **Severity:** High
- **Status:** Resolved (2026-04-24, T10R-R4 (this commit))
- **Affected:** `docs/issues-tracker.md`
- **Description:** The go-live checklist (section 9) gates cutover on "No open Critical or High issues in `docs/issues-tracker.md`". Today the tracker reports 10 open Critical and 16 open High items. Spot-checks prove the majority are stale: C-18 (`paidOffline` stub) is fixed in `use-queue-flush.ts:45-48` by T09R-R1; C-19 was resolved as documentation via T09R-R2; H-38 landed an explicit NetworkOnly rule (`next.config.ts:37-40`); H-39 tests exist at `apps/web/src/lib/__tests__/offline-queue.test.ts`; H-40 PNG icons exist at `public/brand/icon-{192,512}.png`. The Resolution log tops out at row M-47 dated 2026-04-21, even though the Phase 9R commits landed 16 fixes (T09R-R1…R16) and Phase 8R landed T08R-R1…R15. Without reconciliation, the gate is either (a) treated as vacuous and silently bypassed — the worst of both worlds — or (b) treated literally and blocks go-live indefinitely.
- **Fix:** Reconcile every Open-status Critical and High against `git log --grep=T0[0-9]R-R` and the code at the cited file paths. For each confirmed-fixed issue, flip status to `Resolved` and add a Resolution log row citing the task ID and commit SHA. For each genuinely-open item (minimum: C-05 banUser, C-12 recordPayout race, C-13 payouts idempotency_key, C-14/15/16/17 payroll+analytics correctness, H-28 Lighthouse contrast, H-29/30/31/32/33/34/35/36/37 Phase 7/8 gaps), confirm status with the user and either add them to Phase 10R or explicitly defer post-MVP with stakeholder sign-off. This reconciliation is itself a T089 prerequisite.

---

### M-52 — T088 training guides contain no screenshots or screen recordings

- **Severity:** Medium
- **Status:** Open
- **Affected:** T088 (`docs/training/{cashier-admin,stylist,clothier,secretary}.md`)
- **Description:** T088 AC explicitly requires "Includes screenshots or screen recordings for the 2–3 most confusing steps." Grep across `docs/training/` finds zero image references (no `.png`, `.gif`, `.mp4`, no `![...](...)` markdown). The guides are entirely prose. First-time users on a small screen hunting for the "Pagado sin conexión" button, or clothiers understanding which status chip means "pick up this piece", will benefit disproportionately from an annotated screenshot. All four guides currently ship this AC unmet.
- **Fix:** Identify the 2–3 highest-confusion steps per role (candidates: cashier checkout split-payment screen, stylist mark-awaiting-payment from ticket detail, clothier claim-piece selection, secretary appointment booking with price-change acknowledgement). Capture annotated screenshots (redacted of any real PII) and embed in each guide. Screen recordings are acceptable as alternatives for flows with non-trivial motion (e.g. drawer-to-list transitions).

---

### M-53 — T100 CSV parser splits on every comma; quoted fields with embedded commas corrupt

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T100 (`packages/db/src/import-clients.ts:59`)
- **Description:** The parser is `line.split(",").map(v => v.trim().replace(/^"|"$/g, ""))`. This fails for any real-world CSV row where a field contains a comma inside quotes — common in Colombian client data for compound surnames and free-form notes: `"De La Cruz, Juan Carlos","+57…","j@x.com","Cliente VIP, no cobrar depósito"`. The row silently over-expands into 5+ columns, the column-to-header mapping shifts, `name` ends up as `"De La Cruz` (with a leading quote intact because the regex only strips an opening quote at start), phone/email land in the wrong fields, duplicate detection by phone/email fails, and rows are either imported with corrupted data or silently skipped. Also `replace(/^"|"$/g, "")` with `g` flag strips only the first matching quote at start or end, not escaped `""` inside fields.
- **Fix:** Replace the handroll with a robust CSV parser. Options: `csv-parse` (battle-tested, streaming), or accept a minimal RFC 4180 spec and hand-write a tokenizer that walks characters and toggles an "in-quote" flag. Add unit tests covering: comma inside quoted field, embedded double-quote `""`, trailing newline at EOF, UTF-8 BOM, Windows CRLF line endings (readline already handles this via `crlfDelay`), header case variants, and unicode in names (Colombian Spanish: ñ, á, í, ó, ú).

---

### M-54 — T100 import lacks in-file duplicate detection and transactional boundary

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T100 (`packages/db/src/import-clients.ts:115-146`)
- **Description:** (1) Duplicate detection runs row-by-row against the DB only. Two rows in the same CSV sharing the same phone or email both pass the check (DB has neither yet), and both are inserted. (2) Rows without phone AND without email (`conditions.length === 0`) skip the check entirely — re-running the import will duplicate every such row. (3) The insert loop runs without a transaction, so a failure mid-import (DB timeout, schema violation) leaves a partial commit; re-running will skip already-imported rows (good) but the user sees two "error" lines for the failed row across the two runs, making the audit trail confusing. Combined, this violates the "Script is idempotent (safe to run multiple times)" spirit of T100 AC-5.
- **Fix:** Accumulate an in-memory `Set<string>` of seen phones and emails as you iterate; increment a separate `intraFileSkipped` counter when a row collides with an earlier row in the same file. For rows with no phone and no email, require an explicit `external_id` column or fall back to `name + lowercase(name)` dedup — or refuse to import them with a clear error. Wrap the insert loop in `db.transaction` so a mid-run error leaves the DB untouched; on success, print a summary with `imported / skipped (db-dup) / skipped (intra-file-dup) / errors`.

---

### M-55 — Version banner polls `/api/version` forever with no backoff or jitter

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T102 (`apps/web/src/components/version-banner.tsx:33`)
- **Description:** `setInterval(check, POLL_INTERVAL_MS)` fires exactly every 5 minutes for as long as the tab is open. There is no exponential backoff on repeated network errors, no jitter to avoid thundering-herd when many tabs wake up simultaneously after a Vercel deploy, and no pause when the document is hidden (`document.visibilityState === "hidden"`). For a 4-person salon with 4 always-open tabs this is trivial, but for the stylist mobile PWA kept open across days the wasteful polling drains battery and bandwidth. Also the `setInterval` calls `check` only _after_ the first 5 minutes — there's no immediate check at mount, so the banner lags by up to 5 minutes on the first page load after a deploy. The comment "Skip polling in dev" via the `"dev"` sentinel is correct but brittle: a staging deploy that accidentally ships without `VERCEL_GIT_COMMIT_SHA` set will never show the banner.
- **Fix:** Add an immediate check on mount (before scheduling the interval). Pause polling when `document.hidden` and resume on `visibilitychange`. Add a ±30s jitter to the 5-minute interval. On repeated fetch errors, apply exponential backoff up to 30 minutes. Replace the `=== "dev"` guard with an explicit `process.env.NODE_ENV === "development"` check so staging misconfig still surfaces the banner.

---

### L-44 — `isPublic` uses startsWith, making `/api/health-anything` publicly accessible

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T087 (`apps/web/src/lib/middleware-helpers.ts:68-70`)
- **Description:** `isPublic(pathname)` returns `PUBLIC_PATHS.some(p => pathname.startsWith(p))`. With `"/api/health"` and `"/api/version"` in the list, any route starting with those prefixes — `/api/healthz`, `/api/healthcheck`, `/api/version-beta`, `/api/versions/old` — will bypass the session check. No such route exists today, but a future developer adding `/api/health-admin` or `/api/version-internal` for legitimately-auth'd purposes could silently expose it to the public.
- **Fix:** Change these two entries to exact-match: move `/api/health` and `/api/version` into `PUBLIC_EXACT_PATHS` (which already uses `includes`). Leave `/api/auth` as a prefix match since Better Auth mounts multiple sub-routes there. Add a comment explaining the exact-match rationale.

---

### L-45 — `/api/health` and `/api/version` have no rate limiting

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T087, T102 (`apps/web/src/app/api/health/route.ts`, `apps/web/src/app/api/version/route.ts`)
- **Description:** Both endpoints are unauthenticated by design (uptime monitor, stale-tab version polling) and carry no rate limit. `/api/health` runs a DB `SELECT 1` on every hit — a script hitting it at 1 req/s for an hour costs 3 600 Neon query executions and potentially uses cold-start cycles. `/api/version` is trivial but still counts toward Vercel function invocation limits. Neither is exploitable for privileged data but both allow a very cheap DoS of Neon's free-tier quotas and Vercel's request budget.
- **Fix:** Apply a generous IP-based rate limit via `@upstash/ratelimit` — e.g. 60 req/min per IP for `/api/health`, 30 req/min for `/api/version`. Document the uptime-monitor IPs in the allowlist if they will exceed that cap. Return `429` with `Retry-After` header on exceedance.

---

### L-46 — Backup policy references non-existent `vercel env pull` subcommand flag

- **Severity:** Low
- **Status:** Open
- **Affected:** T086 (`docs/research/backup-policy.md:75-77`)
- **Description:** The monthly manual dump example uses `vercel env pull --environment=production -- DATABASE_URL`. The `vercel env pull` subcommand downloads a `.env` file; it does not emit a single variable to stdout. The `--` separator is not a documented flag for piping a specific variable value into `pg_dump`. Whoever runs this verbatim gets a `.env.local` file on disk and a failed `pg_dump` call.
- **Fix:** Replace with a verified command sequence: `vercel env pull .env.production --environment=production --yes && set -a && . .env.production && set +a && pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f "befine-backup-$(date +%Y%m%d).dump" && rm .env.production`. Or route through the Neon CLI: `neonctl connection-string main --project-id <id> | xargs pg_dump …`.

---

## Lessons learned

> This section is populated during development. Each entry documents what went wrong, the root cause, and how to prevent it in the future.

| Date       | Phase   | Issue                                                                                                    | Root cause                                                                                                                         | Prevention                                                                                                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-02 | Pre-dev | 12 issues fixable by documentation update were left open                                                 | Issues identified but fixes deferred — no process to batch-resolve documentation-only issues                                       | Schedule a documentation fix sweep after each review round; don't wait for development to start                                                                             |
| 2026-04-02 | Pre-dev | No test plans, QA strategy, or edge case scenarios existed despite 106 well-specified tasks              | Acceptance criteria were treated as sufficient for testing; no QA perspective in review cycle                                      | Include a QA review as a standard step after every major planning document is created; ACs define _what_ to verify, test plans define _how_ and _what else_ to try breaking |
| 2026-04-02 | Pre-dev | Two independent project assessments found the same gaps — confirming they are real, not reviewer opinion | Both reviews converged on: currency decision, data privacy, test plans, auth fallback, Pusher reliability, Neon storage/cold-start | When multiple reviewers agree on a gap, prioritize it immediately — convergence is a strong signal                                                                          |
| 2026-04-02 | Pre-dev | 17 stakeholder decisions were needed before development could start                                      | Decisions accumulated across 4 review rounds without a resolution session                                                          | Schedule a dedicated decision session after each review round — don't let open questions pile up                                                                            |
| 2026-04-09 | 0A      | Dev dependencies (`pino-pretty`) referenced in code but never installed; would crash on first import     | Package was assumed to be a transitive dep or was forgotten during implementation                                                  | After adding any `import` or `require` for a new package, verify it's in the relevant `package.json` before committing                                                      |
| 2026-04-09 | 0A      | Seed script non-transactional inserts could leave orphaned user rows                                     | Two related inserts (user + account) were written sequentially without a transaction wrapper                                       | Any multi-row insert that must succeed or fail together must use `db.transaction()` — especially when idempotency checks skip existing records                              |
| 2026-04-11 | 1       | Deactivating an employee only revoked sessions but didn't ban the user — they could log back in          | `revokeUserSessions` clears active sessions but doesn't prevent new ones; Better Auth's `banUser` API was not called               | When implementing "block access" features, verify both existing sessions AND future login attempts are blocked — revocation alone is never sufficient                       |
| 2026-04-11 | 1       | Two tables missing `updated_at` despite CLAUDE.md requiring it on all tables                             | Convention was followed for newer tables (business_settings) but missed on earlier ones (employees, business_days)                 | After creating a table schema, run a checklist: uuid PK, created_at, updated_at, correct naming convention, FK naming. Automate this check if possible.                     |
| 2026-04-11 | 3       | `editClient` allows editing archived clients — UI hides button but server has no guard                   | Soft-delete enforcement was only implemented on the UI layer, not the server action                                                | Soft-delete guards must be enforced server-side, not just by hiding UI controls. Any action on a soft-deleted record should check `isActive` in the WHERE clause.           |
| 2026-04-11 | 3       | Hardcoded aria-label and button text bypassed i18n                                                       | Quick implementation shortcuts — easy to miss non-visible strings like aria-labels                                                 | After implementing any component, grep for hardcoded strings (quotes around Spanish/English text). aria-labels and button text are user-facing and must go through `t()`.   |
| 2026-04-11 | 3       | T032 work bundled into T030/T031 commits instead of a dedicated commit                                   | No-show display was simple enough to implement alongside the component it lives in, leading to skipping the separate commit        | Follow the one-commit-per-task rule even for small tasks. The git history should mirror the task list. Small tasks get small commits — that's fine.                         |

---

## Resolution log

> When an issue is resolved, update its status above and add an entry here.

| Issue ID | Date resolved | Resolution                                                                                               | Commit/PR                    |
| -------- | ------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| C-01     | 2026-04-02    | Added `appointment_id (FK nullable)` to T033 schema in `phase-04a-tickets-checkout.md`                   | Senior QA review             |
| C-02     | 2026-04-02    | Added `P4B --> P7` edge to mermaid dependency graph in `project-plan.md`                                 | Senior QA review             |
| H-02     | 2026-04-02    | Updated `business.md` Sentry entry from "Phase 10" to "Phase 0"                                          | Senior QA review             |
| H-03     | 2026-04-02    | Added manual password fallback to T013 AC when Resend is unavailable                                     | Senior QA review             |
| H-06     | 2026-04-02    | Added security review checklist to T089 acceptance criteria                                              | Senior QA review             |
| H-08     | 2026-04-02    | Added shared `payment_method_enum` definition to T006 acceptance criteria                                | Senior QA review             |
| H-09     | 2026-04-02    | Resolved via C-01 fix (same `appointment_id` column)                                                     | Senior QA review             |
| H-10     | 2026-04-02    | Added `cancelled` status to large order enum in T057 and T059 with cancellation reason                   | Senior QA review             |
| H-11     | 2026-04-02    | Added rate limiting policy to T097 acceptance criteria covering all mutation endpoints                   | Senior QA review             |
| M-11     | 2026-04-02    | Added T061 to T062 dependency list in task file and progress.md                                          | Senior QA review             |
| L-10     | 2026-04-02    | Updated `postgres-providers.md` to reference only Drizzle ORM                                            | Senior QA review             |
| L-12     | 2026-04-02    | Updated T087 health endpoint AC to include DB connectivity check (`SELECT 1`)                            | Senior QA review             |
| C-03     | 2026-04-02    | Currency confirmed as COP (Colombian Pesos). T099 ACs updated.                                           | Stakeholder decision session |
| C-04     | 2026-04-02    | Created `docs/research/data-privacy-compliance.md` (Colombian Ley 1581 de 2012)                          | Stakeholder decision session |
| H-01     | 2026-04-02    | Phase 0 split into 0A (Infrastructure) and 0B (Standards & Design)                                       | Stakeholder decision session |
| H-04     | 2026-04-02    | Added "Migration Path" section to `docs/research/auth-providers.md` with Auth.js and Clerk steps         | Stakeholder decision session |
| H-05     | 2026-04-02    | Added 30-second polling fallback to T098 ACs                                                             | Stakeholder decision session |
| H-07     | 2026-04-02    | Added storage capacity estimate to `docs/research/postgres-providers.md` (~28 MB for 6 months)           | Stakeholder decision session |
| H-12     | 2026-04-02    | Added loading state to T019 "Open Day" and cold start documentation to postgres-providers.md             | Stakeholder decision session |
| H-13     | 2026-04-02    | Created `docs/testing/concurrency-test-plan.md` with 8 race condition scenarios                          | QA review action             |
| H-14     | 2026-04-02    | Business day boundary tests added to phase-04a test plan; timezone constant defined                      | QA review action             |
| H-15     | 2026-04-02    | Added T106 (UAT) to Phase 10 between T088 and T089                                                       | QA review action             |
| H-16     | 2026-04-02    | Added post-deployment smoke test AC to T095                                                              | QA review action             |
| M-01     | 2026-04-02    | Added no-show decrement logic to T032b ACs                                                               | Stakeholder decision session |
| M-03     | 2026-04-02    | Added `service_variant_id` FK to T049 appointments table                                                 | Stakeholder decision session |
| M-06     | 2026-04-02    | Added reopen day capability to T019 ACs (admin only, audit trail, most recent day only)                  | Stakeholder decision session |
| M-07     | 2026-04-02    | Added `expected_work_days` to T012 employees table; T065 updated for part-time                           | Stakeholder decision session |
| M-08     | 2026-04-02    | Added `original_computed_amount` and `adjustment_reason` to T066 payouts table                           | Stakeholder decision session |
| M-13     | 2026-04-02    | Removed `deposit_paid` column from T057; computed from payments table                                    | Stakeholder decision session |
| M-14     | 2026-04-02    | Business timezone constant `America/Bogota` added to T002 standards                                      | Stakeholder decision session |
| M-15     | 2026-04-02    | Created `docs/research/frontend-libraries.md`                                                            | Stakeholder decision session |
| M-17     | 2026-04-02    | `commission_pct` precision set to `numeric(5,2)` in T023; banker's rounding in T002                      | Stakeholder decision session |
| M-19     | 2026-04-02    | Added structured business logic logging AC to T085                                                       | QA review action             |
| M-20     | 2026-04-02    | Integration test approach documented in `docs/testing/README.md`                                         | QA review action             |
| L-15     | 2026-04-02    | Rounding policy (banker's rounding) and precision defined in T002 standards                              | Stakeholder decision session |
| M-16     | 2026-04-09    | Stale — Pusher replaced by SSE; no third-party message volume limits apply                               | Phase 0A Opus audit          |
| M-21     | 2026-04-09    | `pino-pretty` installed as dev dep in `apps/web`                                                         | T0AR-R1                      |
| M-22     | 2026-04-09    | Seed script user+account inserts wrapped in `db.transaction()`                                           | T0AR-R2                      |
| M-23     | 2026-04-09    | Middleware `roleCanAccess()` added — each role restricted to its path prefix                             | T0AR-R3                      |
| M-24     | 2026-04-09    | Sentry `beforeSend` extended to scrub exception messages, breadcrumbs, and extra data                    | T0AR-R4                      |
| L-16     | 2026-04-09    | `@deprecated` JSDoc added to `use-sse.ts`; developers directed to `useRealtimeEvent`                     | Phase 0 Opus audit           |
| H-18     | 2026-04-11    | Added `eq(clients.isActive, true)` guard to `editClient` WHERE clause                                    | T03R-R1                      |
| M-26     | 2026-04-11    | Added `clients.clearSelection` i18n key; replaced hardcoded aria-labels and "OK" button                  | T03R-R2                      |
| M-27     | 2026-04-11    | Added `clientIdSchema = z.string().uuid()` validation to editClient, archiveClient, unarchiveClient      | T03R-R3                      |
| H-17     | 2026-04-11    | Added `updated_at` migration + `.$onUpdate()` to employees and business_days tables                      | T01R-R2                      |
| M-25     | 2026-04-11    | `ROLE_HOME` moved to `@befine/types` constants; both files import from shared source                     | T01R-R3                      |
| L-18     | 2026-04-11    | Standardized all server actions to use `hasRole(session.user, role)` helper                              | T01R-R4                      |
| H-19     | 2026-04-18    | `processCheckout` idempotency rewritten with `INSERT ... ON CONFLICT DO NOTHING RETURNING` + refetch     | T04R-R3                      |
| H-20     | 2026-04-18    | `createBatch` wrapped in `db.transaction`; clothier notifications deferred to post-commit                | T04R-R4                      |
| H-21     | 2026-04-18    | `lib/rate-limit.ts` introduced; CLAUDE.md caps applied to all Phase 4 mutations                          | T04R-R5                      |
| H-22     | 2026-04-18    | Vitest unit tests added covering ticket transitions × role, checkout idempotency, optimistic locks       | T04R-R6                      |
| M-29     | 2026-04-18    | `resolveEditRequest` wrapped in `db.transaction`; SSE + notification deferred to post-commit             | T04R-R7                      |
| L-21     | 2026-04-18    | `createNotification`/`archiveOldNotifications` extracted to `lib/notifications.ts` private helper        | T04R-R2                      |
| L-22     | 2026-04-18    | Dead `transitionToReopened` action deleted                                                               | T04R-R8                      |
| L-23     | 2026-04-18    | Zod schemas added in `packages/types/src/schemas/` for edit-request, reopen, claim, mark, approve        | T04R-R9                      |
| C-06     | 2026-04-18    | `/api/realtime/[channel]` gated with session + per-channel role check; removed from SHARED_PATHS         | T04R-R1                      |
| C-07     | 2026-04-18    | `createNotification` extracted to private helper; no longer a callable server action endpoint            | T04R-R2                      |
| C-08     | 2026-04-19    | Dual-driver setup: `neon-http` for reads, `neon-serverless` Pool for interactive transactions            | T05R-R1                      |
| C-09     | 2026-04-19    | `price_change_acknowledged` default flipped to `true`; backfill migration; filter logic corrected        | T05R-R2                      |
| C-10     | 2026-04-19    | `reschedule` action implemented with overlap re-check; Reschedule button wired in UI                     | T05R-R3                      |
| H-23     | 2026-04-19    | Reopen branch catches `23P01` exclusion violation; returns friendly CONFLICT response                    | T05R-R4                      |
| H-24     | 2026-04-19    | `editVariant` price-change side effects wrapped in single transaction; notifications post-commit         | T05R-R5                      |
| M-30     | 2026-04-19    | Resolved as side effect of C-09 — fresh bookings no longer show false-positive badge                     | T05R-R2                      |
| M-31     | 2026-04-19    | `checkRateLimit(rateLimits.general)` added to `acknowledgeAppointmentPriceChange`                        | T05R-R6                      |
| L-24     | 2026-04-19    | `complete` action wires `tickets.appointment_id` when `ticketId` is provided                             | T05R-R7                      |
| L-25     | 2026-04-19    | `editVariant` protected by optimistic lock (`version` column) to prevent concurrent double-notify        | T05R-R8                      |
| C-11     | 2026-04-19    | `/large-orders` added to `SHARED_APP_PATHS`; 2 new middleware-helpers tests confirm all roles reach path | T06R-R1                      |
| H-25     | 2026-04-19    | T062 AC updated: "cashier read-only" clause removed; `cashier_admin` + `secretary` have full access      | T06R-R3                      |
| H-26     | 2026-04-19    | Overpayment guard added; order re-read inside tx; concurrent-cancel guard via status re-check            | T06R-R2                      |
| H-27     | 2026-04-19    | Cancel dialog with deposit warning + `acknowledgedDeposits` flag on server; Dialog UI with reason        | T06R-R4                      |
| M-32     | 2026-04-19    | `editLargeOrder` adds `version` to schema + WHERE clause, terminal-state guard, totalPrice≥paid check    | T06R-R5                      |
| M-33     | 2026-04-19    | 31 Vitest unit tests added: transitions, balance, overpayment, auto-paid, cancel reason, role gates      | T06R-R6                      |
| M-34     | 2026-04-19    | Both schemas use `.nullish()` for optional fields; deposit refine ensures amount↔method both-or-none     | T06R-R7                      |
| M-35     | 2026-04-19    | `createLargeOrder` re-checks `isActive` on client fetch; returns VALIDATION_ERROR if archived            | T06R-R8                      |
| L-26     | 2026-04-19    | `sql.raw` array replaced with `inArray(batchPieces.batchId, batchIds)` in batch summary query            | T06R-R9                      |
| L-27     | 2026-04-19    | "Registrado por" replaced with `t("recordedBy")`; key added to `es.json` and `en.json`                   | T06R-R10                     |
| L-28     | 2026-04-19    | `revalidatePath(\`/large-orders/\${orderId}\`)` added to edit, transition, and payment actions           | T06R-R11                     |
| L-29     | 2026-04-19    | Cancel wrapped in Dialog with deposit warning, reason input, and disabled confirm until acked            | T06R-R12                     |
| M-47     | 2026-04-21    | 25 Vitest integration tests in `cross-module-flows.test.ts` covering the four required flows; README doc | T09R-R11                     |
| M-53     | 2026-04-25    | RFC 4180 `parseCsvLine`, BOM strip, CLI guard, 11 unit tests covering Colombian compound surnames        | T10R-R6                      |
| M-54     | 2026-04-25    | In-memory phone/email Set dedup, `db.transaction` (createTxDb) wrapper, summary with intra-file skips    | T10R-R7                      |
| M-55     | 2026-04-25    | Immediate mount check, hidden-tab pause, ±30s jitter, exponential backoff to 30 min, NODE_ENV dev guard  | T10R-R8                      |
| L-44     | 2026-04-25    | `/api/health` + `/api/version` moved to `PUBLIC_EXACT_PATHS`; 2 new tests reject prefix variants         | T10R-R9                      |
| L-45     | 2026-04-25    | `checkPublicRateLimit` (IP-keyed): 60/min health, 30/min version; 429 + `retry-after` on exceedance      | T10R-R10                     |
