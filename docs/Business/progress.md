# Project progress

Master task list. Each task is atomic: one unit of work that can be completed, reviewed, and marked done independently. DB tables are created in the phase that needs them, not all at once.

**Statuses:** `pending` · `in-progress` · `done` · `blocked`

> Last restructured after Senior Product Owner review (April 2026). See `docs/research/senior_product_owner.md` for all findings and rationale. Net change: 89 → 94 tasks.
>
> **Updated after Senior Software Engineer review (April 2026).** See `docs/research/senior_software_engineer.md` for all findings. All 25 findings accepted. Net change: 94 → 103 tasks. T085 moved Phase 10 → Phase 0; T032 split into T032 (Phase 3) + T032b (Phase 5); new tasks: T094, T095, T097, T098, T099, T100, T101, T102. Multiple existing tasks received additional acceptance criteria (T002, T005, T006, T018, T025, T045, T049, T083).
>
> **Updated after Senior Designer review (April 2026).** See `docs/research/senior_designer.md` for all 26 findings. All accepted. Net change: 103 → 106 tasks. New tasks: T103 (design system), T104 (wireframes), T105 (brand identity). Multiple existing tasks received additional UX/design acceptance criteria (T002, T014, T021, T024, T027, T030, T035, T036, T038, T046, T048, T050, T052, T062, T069, T070, T072, T073, T074, T082, T083, T084, T088, T090, T092, T093, T099). Recharts and Lucide Icons added to tech stack.
>
> **Updated after two independent project assessments + QA review actions (April 2026).** Net change: 106 → 108 tasks. New tasks: T106 (UAT), T107 (performance testing). Phase 0 split into 0A (infrastructure) and 0B (standards & design). 17 stakeholder decisions resolved. Multiple existing tasks received additional ACs (T002, T006, T012, T019, T023, T032b, T049, T057, T065, T066, T083, T085, T089, T094, T095, T098, T099). 6 new docs created: data privacy compliance, front-end library rationale, 4 test plans + testing README + RBAC matrix + concurrency test plan. See `docs/issues-tracker.md` resolution log for full details.

---

## Resolved decisions

> All confirmed April 2026 (stakeholder decision session + design grilling session).

| Decision                       | Resolution                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency                       | **COP** (Colombian Pesos) — no cents, integer storage = whole pesos                                                                                                                      |
| Country                        | **Colombia** — Ley 1581 de 2012, timezone America/Bogota (UTC-5)                                                                                                                         |
| Phase 0 scope                  | **Split into 0A** (infrastructure) **and 0B** (standards & design)                                                                                                                       |
| Brand assets                   | **None exist** — create from scratch in T105                                                                                                                                             |
| Employee schedules             | **Part-time employees exist** — `expected_work_days` field added to T012                                                                                                                 |
| Client uniqueness              | **No unique constraint** on phone/email — staff manages duplicates                                                                                                                       |
| Business day reopen            | **Yes** — admin can reopen most recently closed day with audit trail                                                                                                                     |
| No-show decrement              | **Yes** — decrement when no-show status is reversed; `CHECK (no_show_count >= 0)` prevents negative values                                                                               |
| Guest-to-client conversion     | **Deferred** to post-MVP                                                                                                                                                                 |
| Payout audit trail             | **Yes** — `original_computed_amount` + `adjustment_reason` on payouts                                                                                                                    |
| Commission rounding            | **Banker's rounding** (round half-even) everywhere                                                                                                                                       |
| Appointment-catalog link       | **Add `service_variant_id` FK** (nullable) to appointments                                                                                                                               |
| `deposit_paid` column          | **Removed** — computed from payments table                                                                                                                                               |
| Real-time transport            | **Native SSE** (Server-Sent Events) — replaces Pusher entirely. Free, no third-party service. T009 updated to SSE spike; T098 updated to SSE abstraction                                 |
| File/image storage             | **Explicitly out of scope** for MVP                                                                                                                                                      |
| Neon cold start                | **Loading state** on "Open Day" action                                                                                                                                                   |
| Batch checkout                 | **Supported** via `checkout_sessions` table — multiple tickets for one customer can be paid in a single transaction. See T038/T039                                                       |
| Appointment date ownership     | **Calendar date + time** (not business day) — appointments are future-scheduled events. Tickets created from appointments belong to the open business day at arrival time                |
| Ticket reopen in batch         | Reopening one ticket in a batch **detaches** it from its `checkout_session`. Session stays intact for remaining tickets; flagged "partially reopened"                                    |
| Price override visibility      | **Admin-only history view** — admin sees all overrides with delta, reason, cashier, and date. Non-admin roles never see override reasons                                                 |
| Appointment price at booking   | **Current catalog price** at ticket creation time (not booking time). When price changes, secretary is notified to inform client. See T109                                               |
| Price change notifications     | Catalog price change → in-app notification to secretary + `price_change_acknowledged` flag per affected appointment. See T109                                                            |
| Stylist subtype                | **Metadata only** — no permission differences. UI prioritizes subtype-matching services. Admin toggle (`enforce_subtype_service_restriction`) can make this a hard restriction. See T108 |
| Unassigned piece claiming      | **Clothiers can self-claim** unassigned pieces (first-come-first-served with optimistic locking). Silent — no notification — but audit trail recorded on `batch_pieces`                  |
| Secretary pay computation      | **Days present only** — business days open + secretary not absent. Vacation days excluded (handled by external accountant)                                                               |
| Analytics revenue attribution  | **Business day** — all revenue attributed to the open business day, not calendar date                                                                                                    |
| Analytics comparison periods   | Daily = same weekday last week; weekly = previous calendar week (Mon–Sun); monthly = previous calendar month                                                                             |
| Deactivation with open tickets | **Blocked** until all tickets are resolved. Cashier can either **close** or **reassign** blocking tickets before deactivation proceeds                                                   |
| Offline checkout               | **Supported** — cashier marks tickets `paid_offline` when internet is down. Syncs on reconnect. Cashier's version always wins on conflict                                                |
| Secretary appointment list     | **Refresh-on-demand** — no real-time push. Only cashier dashboard and clothier view use SSE                                                                                              |
| Clothier piece visibility      | Clothiers see **own assigned pieces + unassigned claimable pieces only**. Full batch view reserved for secretary and admin                                                               |
| Large order client requirement | **Saved client required** — large orders cannot be linked to a guest. Staff creates a saved client record first                                                                          |
| Large order payments           | **Multiple partial payments** from day one — no single deposit column. `large_order_payments` is a running ledger                                                                        |
| Data migration scope           | **Clients, employees, and catalog only** — no historical tickets or payouts. Analytics baseline starts from go-live                                                                      |
| Training guide audience        | **Cashier_admin, secretary, admin** roles only — stylists and clothiers have simple enough interfaces                                                                                    |

---

> **Phase 0 completion review — Opus audit 2026-04-09**
> All 24 tasks (0A × 13, 0AR × 4, 0B × 7) pass acceptance criteria. Regression: 19 tests pass, lint and typecheck clean. No Critical or High issues found. Two Low items logged (L-16, L-17). **Phase 1 is unblocked.**

---

## Phase 0A — Foundation (Infrastructure)

| ID   | Task                                                                | Status | Dependencies |
| ---- | ------------------------------------------------------------------- | ------ | ------------ |
| T001 | Initialize Next.js monorepo with Turborepo                          | done   | —            |
| T003 | Environment variable schema and runtime validation                  | done   | T001         |
| T004 | Vercel project setup and staging deploys                            | done   | T001         |
| T005 | Neon Postgres setup with dev and staging branches                   | done   | T004         |
| T006 | Drizzle ORM setup and migration workflow                            | done   | T005         |
| T007 | Better Auth spike and integration (RBAC + rate limiting validation) | done   | T006         |
| T008 | UI library spike (shadcn/ui chosen, Base Web failed)                | done   | T001         |
| T009 | SSE (Server-Sent Events) spike for real-time events                 | done   | T001, T004   |
| T010 | RBAC role definitions (roles + stylist subtypes)                    | done   | T007         |
| T011 | Seed script for development (one user per role)                     | done   | T010         |
| T085 | Sentry error tracking setup _(moved from Phase 10)_                 | done   | T004         |
| T094 | Testing infrastructure (Vitest + Playwright) _(new)_                | done   | T001         |
| T095 | CI/CD pipeline (GitHub Actions) _(new)_                             | done   | T094, T002   |

---

## Phase 0AR — Remediation (Opus audit, 2026-04-09)

> Created by Phase 0A completion review. Critical and High items block Phase 1. Medium items should be resolved before production data flows. Low items deferred to issues tracker.

| ID      | Task                                                                | Severity | Status | Source     |
| ------- | ------------------------------------------------------------------- | -------- | ------ | ---------- |
| T0AR-R1 | Install `pino-pretty` as dev dependency in `apps/web`               | Medium   | done   | Opus audit |
| T0AR-R2 | Wrap seed script user+account inserts in a DB transaction           | Medium   | done   | Opus audit |
| T0AR-R3 | Add role-path enforcement to middleware (before Phase 1)            | Medium   | done   | Opus audit |
| T0AR-R4 | Expand Sentry PII scrubbing to cover error messages and breadcrumbs | Medium   | done   | Opus audit |

---

## Phase 0B — Foundation (Standards & Design)

| ID   | Task                                                                 | Status | Dependencies |
| ---- | -------------------------------------------------------------------- | ------ | ------------ |
| T002 | Configure code quality tooling (ESLint, Prettier, Husky, Zod policy) | done   | T001         |
| T077 | Offline policy document _(moved from Phase 9)_                       | done   | —            |
| T097 | API design conventions document _(new)_                              | done   | T001         |
| T098 | Real-time abstraction layer _(new)_                                  | done   | T009         |
| T099 | Internationalization (i18n) setup _(new)_                            | done   | T001         |
| T103 | Design system, design tokens, and component patterns _(new)_         | done   | T008         |
| T104 | Key screen wireframes and layout specification _(new)_               | done   | T103         |

---

## Phase 1 — Identity, employees, and business day

| ID    | Task                                                 | Status | Dependencies |
| ----- | ---------------------------------------------------- | ------ | ------------ |
| T012  | Employees table migration                            | done   | T006         |
| T013  | Employee account creation UI (admin)                 | done   | T012, T010   |
| T014  | Employee list and profile view (admin)               | done   | T013         |
| T015  | Employee earnings visibility flag                    | done   | T014         |
| T016  | Login page                                           | done   | T007, T008   |
| T017  | Password reset flow                                  | done   | T016, T054   |
| T018  | Session middleware and route protection              | done   | T010         |
| T019  | Business day open/close (table + admin action)       | done   | T012         |
| T022a | Basic employee deactivation _(split from T022)_      | done   | T014         |
| T054  | Resend email integration _(moved from Phase 5)_      | done   | T003         |
| T090  | App navigation / layout shell _(new)_                | done   | T010         |
| T091  | Employee self-service password change _(new)_        | done   | T016         |
| T105  | Brand identity and asset gathering _(new)_           | done   | T103         |
| T108  | Business settings table migration _(new — grilling)_ | done   | T006         |

---

> **Phase 1 completion review — Opus audit 2026-04-11**
> All 14 tasks pass acceptance criteria with one Critical exception (C-05: deactivated employees can still log in — sessions revoked but user not banned). One High issue found (H-17: missing `updated_at` column on employees and business_days tables). Regression: 45 tests pass, lint and typecheck clean. Two Medium items (M-25) and two Low items (L-18, L-19) logged. **Phase 2 completed independently; Phase 3 blocked until T01R-R1 (Critical) and T01R-R2 (High) are resolved.**

---

## Phase 1R — Remediation (Opus audit, 2026-04-11)

> Created by Phase 1 completion review. Critical and High items block Phase 3. Medium and Low items deferred to issues tracker.

| ID      | Task                                                                            | Severity | Status | Source     |
| ------- | ------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T01R-R1 | Fix: Ban deactivated employees in Better Auth to block login                    | Critical | done   | Opus audit |
| T01R-R2 | Fix: Add `updated_at` column to `employees` and `business_days` tables          | High     | done   | Opus audit |
| T01R-R3 | Fix: Deduplicate `ROLE_HOME` constant between middleware-helpers and login-form | Medium   | done   | Opus audit |
| T01R-R4 | Fix: Standardize role-check pattern with shared `hasRole` helper                | Low      | done   | Opus audit |

---

## Phase 2 — Catalog and pricing

| ID   | Task                                                    | Status | Dependencies |
| ---- | ------------------------------------------------------- | ------ | ------------ |
| T023 | Services and variants table migration                   | done   | T006         |
| T024 | Service catalog CRUD UI (admin)                         | done   | T023         |
| T025 | Catalog audit log                                       | done   | T024         |
| T026 | Cloth pieces table migration                            | done   | T006         |
| T027 | Cloth piece catalog CRUD UI (admin)                     | done   | T026         |
| T028 | Catalog read access for non-admin roles (API endpoints) | done   | T024, T027   |

---

> **Phase 2 completion review — Opus audit 2026-04-11**
> All 6 tasks pass acceptance criteria. Regression: 45 tests pass, lint and typecheck clean. Three findings logged (H-18, M-26, M-27). **Phase 3 is unblocked pending Phase 2R remediation.**

---

## Phase 2R — Remediation (Opus audit, 2026-04-11)

> Created by Phase 2 completion review. High items block Phase 3. Medium items should be resolved before Phase 3 ships.

| ID      | Task                                                                                         | Severity | Status | Source     |
| ------- | -------------------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T02R-R1 | Fix: Add audit log display UI to catalog admin screens                                       | High     | done   | Opus audit |
| T02R-R2 | Fix: Add `restoreVariant` server action for variant restoration                              | Medium   | done   | Opus audit |
| T02R-R3 | Fix: Clarify cloth piece schema — spec requires `sale_price`; implement or document decision | Medium   | done   | Opus audit |

---

## Phase 3 — Client records

| ID   | Task                                                | Status | Dependencies |
| ---- | --------------------------------------------------- | ------ | ------------ |
| T029 | Clients table migration                             | done   | T006         |
| T030 | Saved client CRUD and search UI (cashier/secretary) | done   | T029         |
| T031 | Guest client flow (name only, no record)            | done   | T030         |
| T032 | No-show count display                               | done   | T029         |

---

> **Phase 3 completion review — Opus audit 2026-04-11**
> All 4 tasks pass acceptance criteria. Regression: 45 tests pass, lint and typecheck clean. One High issue (H-18: `editClient` allows editing archived clients). Two Medium issues (M-26: hardcoded i18n strings, M-27: `clientId` not validated as UUID). One Low item (L-20: T032 bundled into T030/T031 commits). **Phase 4A unblocked pending T03R-R1 (High) resolution.**

---

## Phase 3R — Remediation (Opus audit, 2026-04-11)

> Created by Phase 3 completion review. High items block Phase 4A. Medium items should be resolved before Phase 4A ships.

| ID      | Task                                                                        | Severity | Status | Source     |
| ------- | --------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T03R-R1 | Fix: Guard `editClient` against archived clients                            | High     | done   | Opus audit |
| T03R-R2 | Fix: Replace hardcoded strings in `client-search-widget.tsx` with i18n keys | Medium   | done   | Opus audit |
| T03R-R3 | Fix: Validate `clientId` as UUID in client server actions                   | Medium   | done   | Opus audit |

---

## Phase 4A — Tickets and checkout

| ID   | Task                                                                 | Status | Dependencies     |
| ---- | -------------------------------------------------------------------- | ------ | ---------------- |
| T033 | Tickets table migration (incl. idempotency_key column)               | done   | T019, T029       |
| T034 | Ticket items table migration (with price/commission snapshot)        | done   | T033, T023       |
| T035 | Ticket creation — stylist / secretary / cashier (incl. walk-in flow) | done   | T034, T031, T028 |
| T036 | Cashier dashboard with live updates                                  | done   | T035, T098       |
| T037 | Ticket status transitions and permissions                            | done   | T035             |
| T038 | Checkout flow (optimistic lock, payment method, close ticket)        | done   | T037             |
| T039 | Split payment at checkout (ticket_payments table)                    | done   | T038             |
| T040 | Price override at checkout (cashier only)                            | done   | T038             |
| T041 | Edit approval flow (secretary/stylist → cashier)                     | done   | T035, T048       |
| T042 | Ticket reopen and earnings recompute flag                            | done   | T038             |
| T048 | In-app notification system (MVP)                                     | done   | T098             |
| T092 | Closed ticket history view (admin / cashier) _(new)_                 | done   | T038             |
| T093 | Admin home / day-at-a-glance screen _(new)_                          | done   | T036, T038       |

> T043 (walk-in flow) retired — merged into T035 acceptance criteria.

---

> **Phase 4A + 4B completion review — Opus audit 2026-04-18**
> All 17 tasks (4A × 13, 4B × 4) meet their core structural and functional acceptance criteria: schemas, role gates, optimistic locking, status enums, real-time events, and UI flows are in place. Regression: 46 tests pass (same count as after Phase 3 — no new tests added), typecheck clean, lint has 2 pre-existing warnings in Phase 1 files (not regressions). Nine findings logged spanning both phases: **two Critical** (C-06 public SSE channel, C-07 client-callable `createNotification`), **four High** (H-19 checkout idempotency pattern, H-20 non-atomic `createBatch`, H-21 missing rate limiting across all mutations, H-22 missing unit tests for financial/status/permission logic), **two Medium** (M-28 T042 payout stub, M-29 non-atomic `resolveEditRequest`), **three Low** (L-21 exposed `archiveOldNotifications`, L-22 dead `transitionToReopened`, L-23 Zod-validation gaps). **Phase 5 and Phase 7 are blocked until T04R-R1, T04R-R2, T04R-R3, T04R-R4, T04R-R5, and T04R-R6 (all Critical/High) are resolved.**

---

## Phase 4R — Remediation (Opus audit, 2026-04-18)

> Created by Phase 4A/4B completion review. Critical and High items block Phase 5 and Phase 7. Medium and Low items should be resolved before Phase 7 ships.

| ID      | Task                                                                                                                                                                                                                                        | Severity | Status | Source     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T04R-R1 | Fix: gate `/api/realtime/[channel]` with session + per-channel role check; scope `notifications` stream to the caller's employee_id; remove `/api/realtime` from middleware `SHARED_PATHS`                                                  | Critical | done   | Opus audit |
| T04R-R2 | Fix: extract `createNotification` and `archiveOldNotifications` out of the `"use server"` module into a private `lib/notifications.ts` helper imported by server actions only                                                               | Critical | done   | Opus audit |
| T04R-R3 | Fix: rewrite `processCheckout` idempotency to use `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING` + refetch path; add concurrent-request test                                                                                            | High     | done   | Opus audit |
| T04R-R4 | Fix: wrap `createBatch` (cloth_batches + batch_pieces inserts) in `db.transaction`; defer clothier notifications to post-commit                                                                                                             | High     | done   | Opus audit |
| T04R-R5 | Fix: introduce `lib/rate-limit.ts` and apply CLAUDE.md caps to all Phase 4 mutations (createTicket, processCheckout, setOverridePrice, requestEdit, resolveEditRequest, reopenTicket, createBatch, claimPiece, markPieceDone, approvePiece) | High     | done   | Opus audit |
| T04R-R6 | Fix: add Vitest unit tests covering ticket status transitions × role, checkout idempotency, payment sum mismatch, optimistic-lock conflicts, override recompute, batch-piece self-claim race, mark-done authorization, approve state guards | High     | done   | Opus audit |
| T04R-R7 | Fix: wrap `resolveEditRequest` (ticket_items update + edit_requests update) in `db.transaction`; fire SSE + notification post-commit                                                                                                        | Medium   | done   | Opus audit |
| T04R-R8 | Fix: delete dead `transitionToReopened` action in `apps/web/src/app/(protected)/tickets/actions/index.ts`                                                                                                                                   | Low      | done   | Opus audit |
| T04R-R9 | Fix: add Zod schemas in `packages/types/src/schemas/` for edit-request, reopen, claim-piece, mark-piece-done, approve-piece, mark-read inputs                                                                                               | Low      | done   | Opus audit |

> M-28 (T042 payout `needs_review` stub) is deferred into T066's AC rather than added here — tracked as a doc-only update under `docs/Business/tasks/phase-07-payroll.md` when Phase 7 is drafted.

---

## Phase 4B — Cloth batches

> Can run in parallel with Phase 5 once Phase 4A is complete.

| ID   | Task                                           | Status | Dependencies |
| ---- | ---------------------------------------------- | ------ | ------------ |
| T044 | Cloth batches and batch_pieces table migration | done   | T019, T026   |
| T045 | Cloth batch creation UI (secretary / admin)    | done   | T044, T028   |
| T046 | Clothier batch view and piece completion       | done   | T045         |
| T047 | Piece approval flow (secretary / admin)        | done   | T046         |

---

## Phase 5 — Appointments

> Can run in parallel with Phase 4B once Phase 4A is complete.

| ID    | Task                                                           | Status | Dependencies     |
| ----- | -------------------------------------------------------------- | ------ | ---------------- |
| T032b | No-show count increment logic _(split from T032)_              | done   | T032, T053       |
| T049  | Appointments table migration                                   | done   | T029, T012       |
| T050  | Appointment booking UI (secretary / cashier)                   | done   | T049, T030       |
| T051  | Double-booking prevention (DB-level)                           | done   | T050             |
| T052  | Appointment list and calendar view                             | done   | T050             |
| T053  | Appointment status management (confirm, cancel, no-show, etc.) | done   | T050             |
| T109  | Price change notification to secretary _(new — grilling)_      | done   | T025, T049, T048 |

---

> **Phase 5 completion review — Opus audit 2026-04-19**
> All 7 tasks meet their structural acceptance criteria (schema, role gates, status enum, double-booking constraint, day view, no-show transaction, price-change hook). Regression: 148 tests pass (52 in appointments + 96 elsewhere), typecheck clean, lint has 2 pre-existing warnings (Phase 1 forms — not regressions). However, the audit surfaces **one Critical regression introduced outside Phase 5 work** (C-08 — `neon-http` driver swap broke all `db.transaction()` calls), **two Critical Phase 5 issues** (C-09 T109 dedup logic inverts intent so first price change never notifies; C-10 T053 `reschedule` action missing from UI/schema/handler — AC explicitly required), **two High issues** (H-23 T032b `reopen` not guarded against `appointments_no_overlap` exclusion constraint; H-24 T109 multi-step writes not transactional → partial-failure state), **two Medium** (M-30 T109 default `false` causes false-positive UI badge on every fresh booking; M-31 `acknowledgeAppointmentPriceChange` lacks rate limit), **two Low** (L-24 T053 `complete` action does not populate `tickets.appointment_id`; L-25 concurrent `editVariant` calls can double-fire notifications). **Phase 6 is blocked until C-08, C-09, C-10, H-23, and H-24 are resolved.**

---

## Phase 5R — Remediation (Opus audit, 2026-04-19)

> Created by Phase 5 completion review. Critical and High items block Phase 6. Medium and Low items should be resolved before Phase 7 ships.

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                          | Severity | Status | Source     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T05R-R1 | Fix: adopt a **dual-driver** Neon setup (see T05R-R1 detail block below). Keep `neon-http` as the default for reads, Better Auth, and simple writes. Add a separate `neon-serverless` (WebSocket `Pool`) driver used **only** by the 5 interactive-transaction call sites. Additionally, diagnose and root-fix the `JSON.parse` rejection at its real source (not a driver workaround).                                       | Critical | done   | Opus audit |
| T05R-R2 | Fix: T109 dedup inversion — flip the intent. `price_change_acknowledged` should default to `true` (no pending change) on insert; `editVariant` should reset to `false` and **always** notify when transitioning `true → false`, suppress when already `false`. Update column default in schema, add a migration to backfill existing rows to `true`, fix `editVariant` filter, and adjust the UI badge condition accordingly. | Critical | done   | Opus audit |
| T05R-R3 | Fix: implement T053 `reschedule` action — extend `transitionAppointmentSchema` (`reschedule` action with `newScheduledAt` field), add to `ALLOWED_TRANSITIONS` (booked/confirmed → rescheduled with overlap re-check via the same logic as `createAppointment`), wire a Reschedule button in `AppointmentStatusActions` with a date/time inline form. AC of T053 explicitly requires reschedule and the overlap re-check.     | Critical | done   | Opus audit |
| T05R-R4 | Fix: T032b reopen path — wrap the `no_show → booked` UPDATE in a try/catch for Postgres error code `23P01`; on exclusion violation, return `{ code: "CONFLICT", message: "El horario ya está ocupado" }` instead of letting the raw DB error bubble up.                                                                                                                                                                       | High     | done   | Opus audit |
| T05R-R5 | Fix: wrap `editVariant` price-change side effects (variant update + audit log + appointment-flag reset + N notifications) in a single `db.transaction`, deferring notification fan-out to post-commit. Currently a partial failure leaves variant updated but appointments un-flagged or only some secretaries notified.                                                                                                      | High     | done   | Opus audit |
| T05R-R6 | Fix: add `checkRateLimit(rateLimits.general)` to `acknowledgeAppointmentPriceChange` per CLAUDE.md "General mutations: 60/min per user".                                                                                                                                                                                                                                                                                      | Medium   | done   | Opus audit |
| T05R-R7 | Fix: wire `complete` action to optionally accept a `ticketId` and set `tickets.appointment_id` atomically when the secretary completes an appointment that has an associated ticket. AC of T053 says completion "optionally links to a ticket" but no plumbing exists today.                                                                                                                                                  | Low      | done   | Opus audit |
| T05R-R8 | Fix: protect `editVariant` against concurrent double-notification by adding optimistic-lock (`version` column on `service_variants`) or a SELECT FOR UPDATE on the variant row before computing `priceChanged`.                                                                                                                                                                                                               | Low      | done   | Opus audit |

### T05R-R1 detail — Neon driver architecture + JSON.parse root fix

**Context — why the current state is broken**

1. `packages/db/src/index.ts` was swapped from `drizzle-orm/neon-serverless` (WebSocket `Pool`) to `drizzle-orm/neon-http` in commit `fb29e55`, with the claim _"Transactions still work via neon-http batch mode."_ That claim is wrong. `drizzle-orm/neon-http/session.js` throws a hardcoded `"No transactions support in neon-http driver"` from both `NeonHttpSession.transaction()` and `NeonTransaction.transaction()`. Any call to `db.transaction(async (tx) => …)` crashes at runtime.
2. The `neon-http` driver only exposes `sql.transaction([...])` — a **non-interactive, pre-built array of queries** sent to Neon's Data API in a single HTTP round-trip. There is no `BEGIN`/`COMMIT`/conditional branching. Our 5 call sites all branch on intermediate results (e.g. checkout's `if (inserted.length === 0) refetch else insert+close`), so this mode cannot replace them.
3. The swap was made to fix an `"Unexpected non-whitespace character after JSON at position 134"` error originally blamed on Pool. **The same error still fires on neon-http**, proving it was never a driver-layer issue. The driver swap was a red herring.

**Affected interactive transaction call sites (must keep working)**

- `apps/web/src/app/(protected)/cashier/checkout/actions.ts:184` — `processCheckout` (idempotent insert, conditional replay vs new-session, optimistic lock on ticket.version, multi-row updates)
- `apps/web/src/app/(protected)/tickets/actions/index.ts:183` — ticket creation/update
- `apps/web/src/app/(protected)/tickets/edit-requests/actions.ts:364` — `resolveEditRequest`
- `apps/web/src/app/(protected)/appointments/actions.ts:388` — appointment status transitions (no-show increment/decrement path)
- `apps/web/src/app/(protected)/batches/actions.ts:113` — `createBatch` (parent + N children atomic)

**Canonical driver policy (from Neon's own documentation)**

| Use case                                                               | Driver                                   | Why                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| One-shot SELECT, simple INSERT/UPDATE, Better Auth, SSE/realtime reads | **`neon-http`** (`neon()` + `neon-http`) | Stateless, no socket, no stale-connection class of bug, low latency |
| Interactive transactions with conditional logic (our 5 sites)          | **`neon-serverless`** (`Pool` + `ws`)    | Only driver that supports `BEGIN`/`COMMIT` with conditional queries |
| Long-lived LISTEN/NOTIFY, session-scoped state                         | **`neon-serverless` Client** (future)    | Not needed for MVP                                                  |

Neon's docs explicitly direct interactive transactions → `Pool`/`Client`; HTTP driver → one-shot queries only. Source: `https://neon.com/docs/serverless/serverless-driver` §"Choose a driver".

**Required implementation — step by step**

**Step 1 — Root-cause the `JSON.parse` error before touching drivers.**

The rejection has no usable stack (only `JSON.parse (<anonymous>)`) because it originates in a bundled/minified dependency frame. The swap happened without ever identifying the real source, so it must be identified now. Fire-and-forget timing (rejection prints _after_ the `200` response, near SSE channel compile) suggests a background async task.

1. Add a temporary diagnostic handler to `apps/web/src/instrumentation.ts` that runs only when `NODE_ENV !== "production"`:

   ```ts
   if (process.env.NEXT_RUNTIME === "nodejs") {
     process.on("unhandledRejection", (reason) => {
       console.error("[unhandledRejection]", reason);
       if (reason instanceof Error) {
         console.error("stack:", reason.stack);
         let cause: unknown = (reason as { cause?: unknown }).cause;
         while (cause) {
           console.error("caused by:", cause);
           cause = (cause as { cause?: unknown })?.cause;
         }
       }
     });
   }
   ```

2. Reproduce the error once (`/cashier/appointments` POST seems to trigger it reliably). Capture the full stack.
3. Identify the real originating module. Most likely candidates, ranked by probability:
   - **Sentry OpenTelemetry fetch instrumentation** patching `fetch` and buffering response bodies incorrectly → fixed by excluding Neon's Data API host from Sentry HTTP instrumentation (`Sentry.init({ integrations: [...], tracing: { ignoreIncomingRequestsHosts: [...], ignoreOutgoingRequestsHosts: ["api.neon.tech"] } })`) or by pinning `@sentry/nextjs` to a version without the regression.
   - **A fire-and-forget async** in a server action (e.g. `publishEvent`/`createNotification`) that calls fetch and parses a non-JSON body without a catch.
   - **Neon Data API** returning an error envelope with trailing whitespace/chunked framing bug. Fix: wrap `createDb`'s HTTP driver in a `fetchOptions` override that reads `.text()` first, then `JSON.parse`s inside a `try/catch` with the raw body attached to the thrown error.
4. Fix at the root (never `swallow.catch(() => {})`). The diagnostic handler comes out once the real cause is fixed.

**Step 2 — Refactor `packages/db/src/index.ts` to expose both drivers.**

Replace the single `createDb` with two exports, both memoized per-URL:

```ts
// packages/db/src/index.ts
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Required for neon-serverless in Node runtime
neonConfig.webSocketConstructor = ws;

// Recycle sockets aggressively so Neon compute sleep/wake can't hand us a
// dead connection. 10s matches Neon's default idle timeout behavior.
neonConfig.poolQueryViaFetch = false;

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzleHttp({ client: sql, schema });
}

export function createTxDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    // Evict idle sockets before Neon's compute can sleep them out from under us.
    idleTimeoutMillis: 10_000,
    // Cap per-instance connections — Neon free tier has a 100-conn ceiling
    // shared across all Vercel function instances.
    max: 5,
  });
  return drizzleWs({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;
export type TxDatabase = ReturnType<typeof createTxDb>;

export { schema };
```

**Step 3 — Update `apps/web/src/lib/db/index.ts` to memoize both singletons.**

```ts
import { createDb, createTxDb, type Database, type TxDatabase } from "@befine/db";

let _db: Database | undefined;
let _txDb: TxDatabase | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

export function getDb(): Database {
  if (!_db) _db = createDb(getDatabaseUrl());
  return _db;
}

export function getTxDb(): TxDatabase {
  if (!_txDb) _txDb = createTxDb(getDatabaseUrl());
  return _txDb;
}
```

**Step 4 — Migrate the 5 interactive call sites from `getDb()` to `getTxDb()`.**

Only the `.transaction(...)` call sites switch. All reads stay on `getDb()`. Pattern:

```ts
// before
const db = getDb();
const result = await db.transaction(async (tx) => { … });

// after
const txDb = getTxDb();
const result = await txDb.transaction(async (tx) => { … });
```

Do **not** share a transaction between the two drivers (they own separate connections).

**Step 5 — Prove the Pool driver does not re-introduce the original error.**

1. Warm the dev server, idle long enough for Neon compute to sleep (≥5 min on free tier), then hit one of the transactional endpoints. Verify no `JSON.parse` rejection.
2. Run `turbo test` and hit each of the 5 endpoints manually (create ticket, create batch, checkout, resolve edit request, appointment no-show + reopen). All must succeed.
3. If the rejection reappears, **do not re-swap drivers**. Step 1's diagnostic handler will have the real stack. Fix that source.

**Step 6 — Document the policy.**

Update `apps/web/src/lib/db/README.md` with a short "When to use `getDb()` vs `getTxDb()`" section so future contributors do not roll back the split.

**Acceptance criteria**

- [ ] Diagnostic handler landed, error reproduced, real source identified and fixed at root
- [ ] `packages/db/src/index.ts` exposes both `createDb` and `createTxDb`
- [ ] `apps/web/src/lib/db/index.ts` exposes both `getDb()` and `getTxDb()`
- [ ] All 5 interactive-transaction call sites use `getTxDb()`; everything else stays on `getDb()`
- [ ] Manual repro of all 5 flows passes after a cold Neon wake-up (no JSON parse rejection, no `"No transactions support"` error)
- [ ] `turbo test` is green
- [ ] `apps/web/src/lib/db/README.md` documents the dual-driver policy
- [ ] Diagnostic `unhandledRejection` handler removed once root cause is fixed
- [ ] Commit message: `fix(T05R-R1): dual-driver Neon setup (http for reads, ws Pool for interactive tx) + root-fix JSON.parse rejection`

---

## Phase 6 — Large cloth orders

| ID   | Task                                                  | Status | Dependencies |
| ---- | ----------------------------------------------------- | ------ | ------------ |
| T057 | Large orders and large_order_payments table migration | done   | T029         |
| T058 | Large order creation and edit UI (admin / secretary)  | done   | T057, T030   |
| T059 | Order status flow (admin / secretary)                 | done   | T058         |
| T060 | Link cloth batches to large orders                    | done   | T059, T044   |
| T061 | Additional payment recording on large orders          | done   | T058         |
| T062 | Large orders list view                                | done   | T059, T061   |

---

> **Phase 6 completion review — Opus audit 2026-04-19**
> All 6 tasks (T057–T062) meet their core structural acceptance criteria: schema + migration land cleanly, role gates and Zod schemas are in place, `balance_due` is computed (not stored), cancellation requires a reason, batch → order linkage works end-to-end from `createBatch`. Regression: 148 tests pass (same as post-Phase 5 — zero Phase 6 tests added), typecheck clean, lint has 2 pre-existing Phase 1 warnings (not regressions). However the audit found **one Critical routing defect that makes the entire Phase 6 UI unreachable** (C-11 — `/large-orders` is not covered by any role prefix in `roleCanAccess`, so middleware 403s every authenticated request including the nav links), **three High issues** (H-25 T062 cashier read-only AC unimplemented and inconsistent with 4-role model; H-26 T061 no overpayment guard + unsafe auto-transition + silent clamp; H-27 T059 cancellation-with-deposits confirmation AC missing), **four Medium** (M-32 `editLargeOrder` missing optimistic lock + terminal-state guard + can drop totalPrice below totalPaid; M-33 zero Phase 6 unit tests — CLAUDE.md violation; M-34 create vs edit schema null/undefined inconsistency; M-35 active-client TOCTOU between dropdown and submit), **four Low** (L-26 unsafe `sql.raw` array interpolation in `getLargeOrderBatchSummary`; L-27 hardcoded Spanish "Registrado por" bypasses i18n; L-28 missing `revalidatePath('/large-orders/[id]')` on cross-tab updates; L-29 cancel button doesn't confirm destructive action). **Phase 7 is blocked until T06R-R1, T06R-R2, T06R-R3, and T06R-R4 (all Critical/High) are resolved.**

---

## Phase 6R — Remediation (Opus audit, 2026-04-19)

> Created by Phase 6 completion review. Critical and High items block Phase 7. Medium and Low items should be resolved before Phase 7 ships.

| ID       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Severity | Status | Source     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| T06R-R1  | Fix: make `/large-orders/*` reachable. Either add `/large-orders` to `SHARED_APP_PATHS` in `middleware-helpers.ts` (with a per-role allow-list enforced in the pages/actions) **or** move the route under `/admin/large-orders` + `/secretary/large-orders` so the existing prefix check covers it. Update nav, all internal links, and `revalidatePath` calls accordingly. Add middleware-helpers unit tests asserting each role's access.                    | Critical | done   | Opus audit |
| T06R-R2  | Fix: `recordLargeOrderPayment` — reject payments where `amount > max(0, totalPrice - totalPaid)` returning `VALIDATION_ERROR` (allow user to confirm or split). Recompute `totalPaid` inside the transaction against `FOR UPDATE` on the order row (or rely on the already-present `version` column), and re-check `order.status` before the auto-transition to `paid_in_full` so a concurrent cancel doesn't flip to paid. Surface a success toast on record. | High     | done   | Opus audit |
| T06R-R3  | Fix: T062 AC disambiguation + cashier read-only. Clarify in the task file that the app has only `cashier_admin`/`secretary`/`stylist`/`clothier` roles — strike the "cashier read-only" line OR add a `cashier_admin`-only read path (pick one). If keeping the read-only concept, split `requireOrderRole` into `requireOrderWrite` vs `requireOrderRead`.                                                                                                    | High     | done   | Opus audit |
| T06R-R4  | Fix: T059 cancellation-with-deposits confirmation. Before calling `transitionLargeOrder({ action: "cancel" })`, the UI must show a modal that (a) lists recorded payments with total, (b) displays the refund-policy copy from business settings, and (c) requires explicit confirmation plus a non-empty reason. Server-side, add `sumPayments > 0` check to the cancel branch and require the caller to pass a boolean `acknowledgedDeposits` flag.          | High     | done   | Opus audit |
| T06R-R5  | Fix: `editLargeOrder` — add optimistic lock (pass `version` from client, `WHERE version = $version`, bump on update), block edits when `status IN ('paid_in_full','cancelled')`, and reject `totalPrice < totalPaid` with a descriptive error.                                                                                                                                                                                                                 | Medium   | done   | Opus audit |
| T06R-R6  | Fix: add Vitest unit tests for Phase 6. Minimum coverage: balance computation (including the "over-paid clamp" case), auto-transition to `paid_in_full` gating, cancellation reason required, `ALLOWED_TRANSITIONS` × role matrix, `createLargeOrder` archived-client rejection, idempotency on create via deposit.                                                                                                                                            | Medium   | done   | Opus audit |
| T06R-R7  | Fix: align `createLargeOrderSchema` and `editLargeOrderSchema` — both should treat `estimatedDeliveryAt` and `notes` the same way (`.nullish()`). Also tighten `initialDepositAmount` to require `initialDepositMethod` when > 0 (or both or neither) using `z.object(...).refine(...)`.                                                                                                                                                                       | Medium   | done   | Opus audit |
| T06R-R8  | Fix: active-client TOCTOU. In `createLargeOrder`, re-check `clients.isActive = true` when fetching the client row; return `VALIDATION_ERROR` ("El cliente está archivado") if archived.                                                                                                                                                                                                                                                                        | Medium   | done   | Opus audit |
| T06R-R9  | Fix: replace `sql.raw(\`ARRAY['${batchIds.join("','")}']::uuid[]\`)`with`inArray(batchPieces.batchId, batchIds)`in`getLargeOrderBatchSummary`.                                                                                                                                                                                                                                                                                                                 | Low      | done   | Opus audit |
| T06R-R10 | Fix: replace hardcoded "Registrado por" in `large-order-detail.tsx` with an i18n key (`largeOrders.recordedBy`) in both `es.json` and `en.json`.                                                                                                                                                                                                                                                                                                               | Low      | done   | Opus audit |
| T06R-R11 | Fix: add `revalidatePath(\`/large-orders/\${orderId}\`)`to`editLargeOrder`, `transitionLargeOrder`, and `recordLargeOrderPayment` so cross-tab viewers see updates on navigation.                                                                                                                                                                                                                                                                              | Low      | done   | Opus audit |
| T06R-R12 | Fix: wrap the cancel action in a `ConfirmationDialog` (destructive) — current inline input is not a real confirmation and violates the CLAUDE.md "destructive actions require a ConfirmationDialog" convention.                                                                                                                                                                                                                                                | Low      | done   | Opus audit |

---

## Phase 7 — Payroll settlement and audit

> Includes absence tracking (T020, T021) and deactivation guard (T022b) — moved here because they are only consumed by payroll logic.

| ID    | Task                                                              | Status | Dependencies           |
| ----- | ----------------------------------------------------------------- | ------ | ---------------------- |
| T020  | Absences and vacation table migration _(moved from Phase 1)_      | done   | T012                   |
| T021  | Vacation and absence management UI (admin) _(moved from Phase 1)_ | done   | T020                   |
| T022b | Deactivation guard + termination payment _(split from T022)_      | done   | T022a, T067            |
| T063  | Earnings computation: stylists (commission %)                     | done   | T038                   |
| T064  | Earnings computation: clothiers (per-piece)                       | done   | T047                   |
| T065  | Earnings computation: secretary (daily rate × days)               | done   | T021, T020             |
| T066  | Payouts table migration (with junction tables)                    | done   | T006                   |
| T067  | Payout recording UI (admin)                                       | done   | T063, T064, T065, T066 |
| T068  | Double-pay prevention                                             | done   | T067                   |
| T069  | Employee earnings view (own earnings, gated by flag)              | done   | T063, T064, T065, T015 |
| T070  | Unsettled earnings alert on admin dashboard                       | done   | T067                   |

---

> **Phase 7 completion review — Opus audit 2026-04-19**
> All 11 tasks (T020, T021, T022b, T063–T070) meet their structural acceptance criteria: schemas + migrations land cleanly, role gates and rate limits are in place on the admin payroll/absence actions, the absence calendar renders mobile + desktop, the payout flow has preview → adjust → confirm with adjustment-reason enforcement, T022b's `terminateEmployee` is wrapped in a transaction. Regression: 204 tests pass, typecheck clean, lint has 2 pre-existing Phase 1 warnings (not regressions). However the audit found multiple gaps in financial integrity, AC coverage, and discoverability: **four Critical** (C-12 double-pay race outside transaction, C-13 missing idempotency_key on payouts table, C-14 deactivation guard counts every closed day as unsettled for every employee, C-15 secretary unsettled detection ignores absences), **six High** (H-28 recordPayout skips Zod validation, H-29 my-earnings double-shows already-paid amounts, H-30 mismatched week boundaries between admin preview and employee view, H-31 T022b termination has no UI flow, H-32 Phase 7 financial logic has zero real unit tests, H-33 earnings views unreachable from nav), **four Medium** (M-36 history table not scoped to selected employee, M-37 settled-day filter flattened across all employees, M-38 hardcoded Spanish day labels in absence calendar, M-39 editEmployee lacks optimistic lock), **three Low** (L-30 my-earnings empty state only on empty history, L-31 mobile add-absence defaults to today silently, L-32 array column for period_business_day_ids prevents indexed unsettled queries). **Phase 8 is blocked until T07R-R1, T07R-R2, T07R-R3, T07R-R4 (Critical), and T07R-R5 through T07R-R10 (High) are resolved.**

---

## Phase 7R — Remediation (Opus audit, 2026-04-19)

> Created by Phase 7 completion review. Critical and High items block Phase 8. Medium and Low items should be resolved before Phase 8 ships.

| ID       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                 | Severity | Status | Source     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------- |
| T07R-R1  | Fix: move T068 double-pay check inside `recordPayout`'s `txDb.transaction(...)` and lock with `SELECT … FOR UPDATE` on the employee's payout rows. Preferred: introduce a `payout_period_days(payout_id, business_day_id, employee_id)` junction table with `UNIQUE(employee_id, business_day_id)` and replace the `period_business_day_ids` array — the unique index physically prevents double-pay even under concurrency.         | Critical | done   | Opus audit |
| T07R-R2  | Fix: add `idempotency_key uuid NOT NULL UNIQUE` to `payouts` (migration). Generate UUID client-side on payroll-screen mount, pass through `recordPayout`, and use `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING` + refetch (mirror T04R-R3 pattern). Add a concurrent-request unit test.                                                                                                                              | Critical | done   | Opus audit |
| T07R-R3  | Fix: rewrite `getUnsettledPeriodsForEmployee` to be role-aware — stylist → distinct `tickets.business_day_id` for closed tickets owned not yet covered; clothier → distinct `cloth_batches.business_day_id` for approved pieces assigned not yet covered; secretary → closed business days minus vacation/approved_absence not yet covered. Extract a shared helper used by both `getUnsettledEmployees` and the deactivation guard. | Critical | done   | Opus audit |
| T07R-R4  | Fix: secretary branch of `getUnsettledEmployees` must filter out vacation + approved_absence dates (mirror T065's exclusion) before reporting unsettled days. Same fix to flow through the shared helper from T07R-R3.                                                                                                                                                                                                               | Critical | done   | Opus audit |
| T07R-R5  | Fix: create `packages/types/src/schemas/payout.ts` with `recordPayoutSchema` + `terminateEmployeeSchema` (uuid IDs, `int().nonnegative()` money, max-length text, enum method, idempotency_key). Replace typed parameters with `unknown` + `safeParse` in both server actions, return `VALIDATION_ERROR` with field-level details.                                                                                                   | High     | done   | Opus audit |
| T07R-R6  | Fix: in `getMyEarnings`, exclude business_day_ids already covered by any payout for the viewing employee from the today/week/month summaries. Add a unit test that the dashboard amounts drop after `recordPayout` is called.                                                                                                                                                                                                        | High     | done   | Opus audit |
| T07R-R7  | Fix: extract week-boundary + "today in Bogota" helpers into `lib/dates.ts` (ISO week, America/Bogota anchored). Use the same helpers from `getMyEarnings` and `computeSecretaryEarnings`. Verify the dashboard "today" reflects the open business day, not UTC midnight.                                                                                                                                                             | High     | done   | Opus audit |
| T07R-R8  | Fix: add T022b termination UI in `employee-list.tsx`. When `deactivateEmployee` returns `CONFLICT`, open a Termination Dialog with unsettled day count, computed amount (call `previewEarnings`), editable amount, method, required reason, and destructive Confirm calling `terminateEmployee`. Reuse `ConfirmationDialog` from Phase 6R.                                                                                           | High     | done   | Opus audit |
| T07R-R9  | Fix: replace inline-reimplementation tests in `earnings.test.ts` with imports from the real `compute*Earnings` modules, exercised against an in-memory pglite fixture. Cover stylist needs_review exclusion, clothier approved-only filter, secretary vacation exclusion + part-time cap, recordPayout double-pay rejection, recordPayout adjustment-reason requirement, and role-gate FORBIDDEN paths.                              | High     | done   | Opus audit |
| T07R-R10 | Fix: add nav entries for `/stylist/earnings`, `/clothier/earnings`, `/secretary/earnings` in `nav-config.ts`, conditional on `employees.show_earnings`. On mobile (stylist + clothier) add as second tab in the bottom bar.                                                                                                                                                                                                          | High     | done   | Opus audit |
| T07R-R11 | Fix: scope payout history table to selected employee — read `searchParams.employeeId` in `payroll/page.tsx` and pass to `listPayouts(employeeId)`. Optionally surface an employee filter dropdown above the table.                                                                                                                                                                                                                   | Medium   | done   | Opus audit |
| T07R-R12 | Fix: scope `listClosedBusinessDays`'s `isSettled` flag to the selected employee (currently aggregates across all employees, hiding days for everyone). Move the call into `payroll-screen.tsx` after employee selection or thread `employeeId` from `searchParams`.                                                                                                                                                                  | Medium   | done   | Opus audit |
| T07R-R13 | Fix: replace hardcoded `["Dom", "Lun", …]` in `absence-calendar.tsx` with `Intl.DateTimeFormat(locale, { weekday: "short" })` driven by `useLocale()`, or add explicit i18n keys.                                                                                                                                                                                                                                                    | Medium   | done   | Opus audit |
| T07R-R14 | Fix: add `version` column + optimistic-lock pattern to `editEmployee`; sequence employees-update → users-name-update → `auth.api.setRole` with rollback semantics on auth failure (capture prior role, restore if needed).                                                                                                                                                                                                           | Medium   | done   | Opus audit |
| T07R-R15 | Fix: render the "Sin movimientos en este período" empty-state line in `MyEarningsView` whenever today + week + month are all 0, regardless of payout history length.                                                                                                                                                                                                                                                                 | Low      | done   | Opus audit |
| T07R-R16 | Fix: mobile add-absence flow — replace the today-default with a sheet/drawer containing an explicit `<input type="date">` defaulting to "today in Bogota" but freely editable. Desktop click-on-cell unchanged.                                                                                                                                                                                                                      | Low      | done   | Opus audit |
| T07R-R17 | Fix: when implementing T07R-R1, prefer the junction-table approach so the `period_business_day_ids` array on `payouts` can be dropped — removes the O(payouts × closedDays) scan in `listClosedBusinessDays`, `getUnsettledEmployees`, and the deactivation guard.                                                                                                                                                                   | Low      | done   | Opus audit |

---

## Phase 8 — Analytics

| ID   | Task                                                  | Status | Dependencies |
| ---- | ----------------------------------------------------- | ------ | ------------ |
| T071 | Analytics data queries (revenue, jobs, earnings)      | done   | T038, T066   |
| T072 | Daily revenue dashboard                               | done   | T071         |
| T073 | Weekly and monthly revenue dashboards with comparison | done   | T071         |
| T074 | Per-employee performance views and drill-down         | done   | T071         |
| T075 | Analytics database indexes and query optimization     | done   | T071         |
| T101 | Analytics seed script (6 months of data) _(new)_      | done   | T071         |
| T107 | Performance testing _(new — QA review Q11)_           | done   | T101         |
| T076 | CSV export for accountant (stretch)                   | done   | T071         |

---

> **Phase 8 completion review — Opus audit 2026-04-20**
> All 8 tasks (T071, T072, T073, T074, T075, T076, T101, T107) land their structural skeleton: analytics queries module, admin dashboard with day/week/month tabs, Recharts visualisations, per-employee table with drill-down, database indexes, 6-month seed script, performance-results document, and CSV export. Regression: 213 tests pass (204 post-Phase 7 + 9 new), typecheck clean, lint has 2 pre-existing Phase 1 warnings (not regressions). However the audit surfaces financial-integrity, AC-coverage, and resolved-decision-violation gaps that block go-live: **two Critical** (C-16 analytics revenue silently excludes the current open business day for every period — "day" always reports 0 until day-close; C-17 `earningsByEmployee` deliberately returns 0 for secretaries so the analytics `earnings` total understates actual payroll and secretary never appears in the per-employee table), **four High** (H-34 T072 "near-real-time updates" AC unimplemented — no SSE subscription on dashboard; H-35 T074 active-employee filter + include-inactive toggle missing; H-36 `getAnalyticsSummary/CsvData/EmployeeDrillDown/EmployeePerformance` skip Zod validation and trust `period` param; H-37 zero analytics unit tests — CLAUDE.md mandate on financial correctness + role gates), **five Medium** (M-40 analytics queries ignore `employees.isActive` in both per-employee earnings and drill-down; M-41 `employeeDayBreakdown` secretary branch ignores `expected_work_days` part-time cap, diverging from `computeSecretaryEarnings`; M-42 `getBusinessDayIdsByPeriod` "week" uses Monday–Sunday but resolved-decisions locks weekly comparisons to "previous calendar week (Mon–Sun)" — current implementation pins _current_ week end to today, not to Sunday, so Wed current vs Mon–Sun prior is apples-to-oranges; M-43 no rate limiting on analytics actions — CSV export is enumerable; M-44 `seed-analytics.ts` clears `clients`, `large_orders`, `large_order_payments`, `employeeAbsences` despite not being analytics-scoped — destroys real data on any existing DB), **four Low** (L-33 CSV per-employee rows missing business-day granularity — AC requires "business day date, revenue, jobs count, per-employee earnings"; L-34 drill-down sort limited to `name` + `earnings`, `jobs` column not sortable despite AC; L-35 `dailyRevenueBreakdown.date` slices `openedAt.toISOString()` in UTC instead of Bogota — fine for 08:00 open times but brittle for late-opening days; L-36 T107 manual measurements (LCP, SSE latency, client-nav) marked ⏳ "pending" — results doc is incomplete, violates T107 AC "Results documented"). **Phase 9 is blocked until C-16, C-17, H-34, H-35, H-36, and H-37 are resolved.**

---

## Phase 8R — Remediation (Opus audit, 2026-04-20)

> Created by Phase 8 completion review. Critical and High items block Phase 9. Medium and Low items should be resolved before go-live (T089).

| ID       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Severity | Status                                                                                                                                                                                                                                                                             | Source     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- | ---------- |
| T08R-R1  | Fix: C-16 — open business day included in current analytics window; prior window closed-only; unit test added                                                                                                                                                                                                                                                                                                                                           | Critical | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R2  | Fix: C-17 — `earningsByEmployee` and `employeeDayBreakdown` must include secretary earnings. Either compute `daysWorked × dailyRate` per-day in SQL (joining `business_days` minus `employee_absences.type IN ('vacation','approved_absence')`) or call `computeSecretaryEarnings` in application code and merge. Apply the ISO-week `expected_work_days` cap consistent with T065. The analytics `earnings` total must match the payout total exactly. | Critical | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R3  | Fix: H-34 — wire `useRealtimeEvent` (or equivalent from `packages/realtime`) into `AnalyticsDashboard` to subscribe to `ticket.closed` events on the cashier channel and call `switchPeriod(period)` (or a dedicated refetch) on receipt. T072 AC: "Updates in near-real-time (real-time event on ticket close can trigger a refresh)". Throttle to 1 refresh / 5s to avoid thrashing during batch checkouts.                                           | High     | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R4  | Fix: H-35 — T074 AC "inactive employees excluded by default; toggle to include" unimplemented. Filter `earningsByEmployee` / `jobsCountByEmployee` / `employeeDayBreakdown` on `employees.isActive = true` by default; add an `includeInactive?: boolean` param threaded through `getEmployeePerformance` and `getAnalyticsSummary`; surface a checkbox in `EmployeeTable`. Drill-down respects the same flag.                                          | High     | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R5  | Fix: H-36 — add Zod schemas in `packages/types/src/schemas/analytics.ts` for `period` (enum `"day"                                                                                                                                                                                                                                                                                                                                                      | "week"   | "month"`), `employeeId`(uuid),`includeInactive`(boolean). Replace typed parameters with`unknown`+`safeParse`in`getAnalyticsSummary`, `getEmployeePerformance`, `getAnalyticsCsvData`, `getEmployeeDrillDown`. Return `VALIDATION_ERROR` with field-level details on invalid input. | High       | done | Opus audit |
| T08R-R6  | Fix: H-37 — add Vitest unit tests for Phase 8. Minimum coverage: `revenueByPeriod` on closed + open day; `earningsByEmployee` across all three roles (stylist commission, clothier piece_rate, secretary daily_rate + absences); `employeeDayBreakdown` per role; `getBusinessDayIdsByPeriod` boundary cases (week Mon boundary, month 1st, DST-free Bogota); role gate FORBIDDEN for non-admin roles; CSV content matches the aggregate totals.        | High     | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R7  | Fix: M-40 — pass `employees.isActive` through all per-employee analytics queries so inactive employees do not appear by default, consistent with T074 AC. Piggybacks on T08R-R4's parameter plumbing.                                                                                                                                                                                                                                                   | Medium   | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R8  | Fix: M-41 — `employeeDayBreakdown` secretary branch must apply the same ISO-week `expected_work_days` cap as `computeSecretaryEarnings`. Extract the capping logic into a shared helper used by both. Without this, the admin drill-down shows a higher total than the employee's payout preview for part-time secretaries.                                                                                                                             | Medium   | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R9  | Fix: M-42 — the "week" comparison must align with the resolved decision: "weekly = previous calendar week (Mon–Sun)". Today the current window ends at `bogotaToday`, not Sunday, while the prior window is a full Mon–Sun. Either (a) end current at the upcoming Sunday (future-dated closed days are empty anyway) so comparisons are like-for-like, or (b) truncate the prior window to the same weekday-to-date range.                             | Medium   | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R10 | Fix: M-43 — apply `checkRateLimit(rateLimits.general)` (60/min per user per CLAUDE.md) to `getAnalyticsSummary`, `getEmployeePerformance`, `getEmployeeDrillDown`, and a tighter cap (20/min) to `getAnalyticsCsvData` — CSV export is heavier and must not be easily enumerated.                                                                                                                                                                       | Medium   | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R11 | Fix: M-44 — `seed-analytics.ts` deletes `clients`, `large_orders`, `large_order_payments`, `employee_absences` on every run. These tables contain real production data. Either (a) tag seeded rows with a `seeded_at_namespace` and only delete that namespace, or (b) add an additional `--confirm-destructive` flag and loud banner. Document behavior in the script header.                                                                          | Medium   | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R12 | Fix: L-33 — T076 AC requires "business day date, revenue, jobs count, per-employee earnings". Today's CSV has two disjoint sections (daily revenue, then employee totals). Reshape into one row per business day × employee with columns `date,employeeName,role,jobs,earnings,dailyRevenue,dailyJobs` so accountants can pivot on a single table.                                                                                                      | Low      | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R13 | Fix: L-34 — `EmployeeTable` allows sorting on `name` and `earnings` only. T074 AC says "Sortable by name, jobs count, earnings". Either fetch `jobCount` per employee and add it as a sortable column, or drop the "jobs count" claim from the AC.                                                                                                                                                                                                      | Low      | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R14 | Fix: L-35 — `dailyRevenueBreakdown` formats `date` with `new Date(openedAt).toISOString().slice(0, 10)` — returns the UTC date, not the Bogota date. For a day opened 00:30 Bogota (05:30 UTC same day) this works; for any opened_at ≥ 19:00 Bogota (00:00 UTC next day) it drifts +1. Use `bogotaDateStr` helper from `seed-analytics.ts` or `toLocaleDateString("en-CA", { timeZone: "America/Bogota" })`.                                           | Low      | done                                                                                                                                                                                                                                                                               | Opus audit |
| T08R-R15 | Fix: L-36 — complete the ⏳ manual measurements in `docs/testing/performance-results.md` (LCP mobile 4G, client-side navigation timing, SSE delivery latency). T107 AC requires documented results and blocking-flag entries if any target is missed. This can land after T08R-R3 (SSE) because real-time refresh affects measurement methodology.                                                                                                      | Low      | done                                                                                                                                                                                                                                                                               | Opus audit |

---

## Phase 9 — Offline / sync hardening

> T077 (offline policy) moved to Phase 0. The `idempotency_key` column is added to tickets in T033 (Phase 4A).

| ID   | Task                                              | Status | Dependencies |
| ---- | ------------------------------------------------- | ------ | ------------ |
| T078 | Idempotency keys on remaining mutating API routes | done   | T033, T044   |
| T079 | IndexedDB local mutation queue                    | done   | T078         |
| T080 | Sync status UI (online/offline/syncing indicator) | done   | T079         |
| T081 | Service worker with Workbox (caching strategies)  | done   | T001         |
| T082 | Web App Manifest and PWA install prompt           | done   | T081         |

---

> **Phase 9 completion review — Opus audit 2026-04-21**
> All 5 tasks land structural skeletons: `idempotency_keys` table + helper, IndexedDB queue + flush hook, SyncStatus UI, Workbox SW via `@ducanh2912/next-pwa`, PWA manifest. Regression: 235 tests pass (213 → 235, +22 from Phase 8R analytics), typecheck clean, lint clean. However the audit surfaces significant gaps in the offline contract and violations of resolved-decisions: **three Critical** (C-18 `paidOffline` mutation type declared but no dispatcher or server action — entire offline-checkout flow is a stub despite T079 AC + resolved decision; C-19 `createTicket` is not wired to `checkIdempotency`/`storeIdempotency` so T078 AC "covered routes: ticket creation, piece mark-done" is half-done; C-20 T078 accepts idempotency as a function parameter, not as `Idempotency-Key` header per AC — external clients cannot use it), **five High** (H-38 T081 has no explicit NetworkOnly rule for mutating requests — relies on Workbox default; H-39 zero unit/integration tests for T078/T079/T080 — CLAUDE.md mandates tests for financial idempotency; H-40 T082 PWA icons are SVG — Lighthouse PWA ≥ 80 unverified and typical PNG-192/PNG-512 expectation unmet; H-41 `checkIdempotency` lazy-expiry race — two concurrent expired-key reads both re-execute the mutation; H-42 failed-item count is hidden while offline — violates T080 AC "Failed items show a count"), **four Medium** (M-45 user add-on: payroll UI has no "Pay for today" / per-day shortcut — admin must manually tick a day from the list even when settling just one closed business day; M-46 user add-on: no endpoint-level response contract test suite — every server action's success/error shape and role-gate behavior must be verified; M-47 user add-on: no integration tests — cross-module flows like appointment-to-ticket-to-checkout-to-payout are untested end-to-end; M-48 `storeIdempotency` uses `onConflictDoNothing` after the mutation completes, so a concurrent identical request that arrives first but commits second can overwrite-skip and cause divergent responses), **four Low** (L-37 `useQueueFlush` calls `flush()` on mount even without a prior offline event — unnecessary eager drain; L-38 SyncStatus `role` prop is typed as `string` instead of `AppRole`; L-39 manifest.ts missing `scope` and `lang` fields; L-40 no service-worker version bump / update prompt UI — users running an old SW bundle won't learn about releases). **Phase 10 is blocked until C-18, C-19, C-20, H-38, H-39, H-40, H-41, H-42, M-45, M-46, and M-47 are resolved — the three Medium user add-ons are treated as blocking per explicit stakeholder request.**

---

## Phase 9R — Remediation (Opus audit, 2026-04-21)

> Created by Phase 9 completion review. Critical, High, and the three stakeholder-flagged Medium items block Phase 10. Remaining Medium and Low items should be resolved before go-live (T089).

| ID       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Severity | Status | Source                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------ |
| T09R-R1  | Fix: C-18 — implement the `paidOffline` flow end-to-end. (a) Add `processPaidOfflineCheckout(input)` server action accepting `{ ticketIds, paymentMethod, amount, idempotencyKey }`; transitions all tickets to `paid_offline`, then on reconnect sync path creates the `checkout_session` and closes them atomically (cashier-wins on conflict). (b) Wire `"paidOffline"` branch in `dispatchMutation`. (c) Add resolved-decision AC coverage tests. | Critical | done   | Opus audit               |
| T09R-R2  | Fix: C-19 — wire `createTicket` to `checkIdempotency`/`storeIdempotency` using the same pattern as `markPieceDone`, OR delete the shared helper and document that `tickets.idempotency_key` column is authoritative. Pick one; don't keep both half-wired. Add an integration test that a duplicate createTicket with the same key is a no-op.                                                                                                        | Critical | done   | Opus audit               |
| T09R-R3  | Fix: C-20 — accept `Idempotency-Key` as an HTTP header on API-route-style endpoints and as a form/JSON field on server actions. Extract via `headers().get("idempotency-key")` alongside the current parameter path for backwards compatibility. Document in `docs/api-conventions.md`.                                                                                                                                                               | Critical | done   | Opus audit               |
| T09R-R4  | Fix: H-38 — add explicit `method: "POST"` / `"PUT"` / `"DELETE"` matchers with `NetworkOnly` handler in `workboxOptions.runtimeCaching` so mutating requests are never cached. Default-reliance is brittle as Workbox updates change behavior.                                                                                                                                                                                                        | High     | done   | Opus audit               |
| T09R-R5  | Fix: H-39 — add Vitest tests for (a) `checkIdempotency` miss/hit/expired paths; (b) `enqueue`/`listQueued`/`dequeue`/`markAttempted` on fake-indexeddb; (c) `dispatchMutation` success/failure for each supported mutation type; (d) `useQueueFlush` state transitions. Target 80%+ branch coverage.                                                                                                                                                  | High     | done   | Opus audit               |
| T09R-R6  | Fix: H-40 — replace SVG icons with 192×192 PNG + 512×512 PNG (keep SVG wordmark for non-icon usage). Add an explicit `"any maskable"` 512 entry. Run Lighthouse PWA audit on production and record score in `docs/testing/performance-results.md`; flag as blocking if < 80.                                                                                                                                                                          | High     | done   | Opus audit               |
| T09R-R7  | Fix: H-41 — `checkIdempotency` lazy-expiry race. Wrap the "read expired → delete → return null" flow inside a single `DELETE … RETURNING` in a transaction so only one concurrent caller succeeds; the second call sees the post-delete state and falls through to re-execution (acceptable). Alternatively, keep the row but mark `expires_at > now()` as valid on read, and sweep expired rows in a scheduled job.                                  | High     | done   | Opus audit               |
| T09R-R8  | Fix: H-42 — when offline, render failed-item count in the offline banner (not only in the online-with-failures toast). Also show a disabled-with-tooltip "Retry when online" affordance so users understand the state.                                                                                                                                                                                                                                | High     | done   | Opus audit               |
| T09R-R9  | Fix: M-45 (user add-on) — add a "Pay today's day" shortcut button to `payroll-screen.tsx` that, when an employee is selected, auto-ticks today's closed business day (if any) and jumps straight to preview. Add a role-aware descriptor above the day picker so stylists/clothiers see "Pagar por día trabajado" framing, not only "daysWorked" (which reads as secretary-specific). Retain the multi-day selection for back-settlement use cases.   | Medium   | done   | Opus audit (user add-on) |
| T09R-R10 | Fix: M-46 (user add-on) — add an endpoint-level contract test suite under `apps/web/src/app/__tests__/endpoints/` that exercises every server action + API route once per role against an in-memory pglite fixture, asserting (a) 200-class success shape for authorized callers, (b) `FORBIDDEN` for disallowed roles, (c) `UNAUTHORIZED` for unauthenticated, (d) `VALIDATION_ERROR` for malformed inputs. Build an endpoint inventory table.       | Medium   | done   | Opus audit (user add-on) |
| T09R-R11 | Fix: M-47 (user add-on) — add integration tests for cross-module flows: (a) book appointment → create ticket from appointment → checkout → payout includes the ticket; (b) create batch → mark pieces done → approve → payout includes the pieces; (c) large-order → link batches → record payments → auto-transition to paid_in_full; (d) offline queue flush after reconnect dedupes correctly. Document patterns in `docs/testing/README.md`.      | Medium   | done   | Opus audit (user add-on) |
| T09R-R12 | Fix: M-48 — `storeIdempotency` must run inside the same transaction as the mutation so that a concurrent duplicate either (a) sees the committed response on retry or (b) blocks on the unique constraint. Today it runs after the mutation returns, leaving a window where the second call re-executes.                                                                                                                                              | Medium   | done   | Opus audit               |
| T09R-R13 | Fix: L-37 — don't call `flush()` on mount when `navigator.onLine` was always true and no prior offline event occurred. Track a ref that flips on `offline` then back to `online` and only flush on that edge.                                                                                                                                                                                                                                         | Low      | done   | Opus audit               |
| T09R-R14 | Fix: L-38 — type `SyncStatus`'s `role` prop as `AppRole`, not `string`. Eliminates the stringly-typed `role === "cashier_admin"` branch.                                                                                                                                                                                                                                                                                                              | Low      | done   | Opus audit               |
| T09R-R15 | Fix: L-39 — add `scope: "/"` and `lang: "es"` to `manifest.ts`. Improves iOS handling and lighthouse score.                                                                                                                                                                                                                                                                                                                                           | Low      | done   | Opus audit               |
| T09R-R16 | Fix: L-40 — show a "Actualización disponible, recargar" toast when the Workbox SW activates with a new version. `clientsClaim: true` already claims pages, but users mid-session don't get a prompt.                                                                                                                                                                                                                                                  | Low      | done   | Opus audit               |

---

## Phase 10 — Polish and rollout

| ID   | Task                                                 | Status | Dependencies                                   |
| ---- | ---------------------------------------------------- | ------ | ---------------------------------------------- |
| T083 | Responsive QA pass (mobile + desktop, all roles)     | done   | all phases                                     |
| T084 | Loading states and optimistic UI                     | done   | all phases                                     |
| T086 | Database backup policy and restore drill             | done   | T005                                           |
| T087 | Uptime monitoring (`/api/health` endpoint + monitor) | done   | T004                                           |
| T088 | Internal training guide (one page per role)          | done   | all phases                                     |
| T102 | Stale-tab version detection _(new)_                  | done   | T004                                           |
| T100 | Data migration from existing spreadsheets _(new)_    | done   | T029, T030                                     |
| T106 | User acceptance testing (UAT) _(new — QA review Q7)_ | done   | T088                                           |
| T089 | Production cutover checklist and go-live             | done   | T083, T084, T086, T087, T088, T100, T102, T106 |

---

## Phase 10R — Remediation (Opus audit, 2026-04-24)

> Created by Phase 10 completion review. Phase 10 shipped `/api/health`, `/api/version`, a shared `loading.tsx`, the version banner, the backup-policy runbook, the CSV client import, four role training guides, and the go-live checklist. Regression: 396 tests pass, typecheck clean, lint clean, full `turbo` cache replay. However the audit surfaces one **Critical** (C-21 no CSP headers despite T089 AC + go-live checklist claiming otherwise), three **High** (H-43 T084 optimistic ticket status update is unimplemented — zero `useOptimistic` usage in the repo; H-44 T086 restore drill has never been executed — runbook table is empty placeholders; H-45 issues-tracker Open-status is badly out of sync with Phase 7R/8R/9R work, so the go-live "no open Critical or High" gate cannot be evaluated meaningfully), four **Medium** (M-52 T088 training guides contain zero screenshots despite explicit AC; M-53 T100 CSV parser breaks on quoted fields with embedded commas — common in Colombian compound surnames; M-54 T100 lacks in-file duplicate detection and transactional boundary; M-55 version banner polls forever with no visibility/backoff/jitter), and three **Low** (L-44 `/api/health`+`/api/version` use `startsWith` public-path matching; L-45 no rate limits on the two new public endpoints; L-46 backup runbook cites an incorrect `vercel env pull` flag). **T089 (go-live cutover) is blocked until C-21, H-43, H-44, and H-45 are resolved — the four stakeholder-critical items that gate the go-live decision. Medium and Low items should be resolved before cutover but may be deferred to a post-launch batch with explicit stakeholder sign-off.**

| ID       | Task                                                                                                  | Status  | Severity | Source     |
| -------- | ----------------------------------------------------------------------------------------------------- | ------- | -------- | ---------- |
| T10R-R1  | Fix: add CSP + security headers via `next.config.ts headers()` (C-21)                                 | done    | Critical | Opus audit |
| T10R-R2  | Fix: implement `useOptimistic` for ticket status transitions; add revert-on-error test (H-43)         | done    | High     | Opus audit |
| T10R-R3  | Fix: execute Neon PITR restore drill on staging; fill result table in `backup-policy.md` (H-44)       | blocked | High     | Opus audit |
| T10R-R4  | Fix: reconcile `docs/issues-tracker.md` Open-status against Phase 7R/8R/9R code; update log (H-45)    | done    | High     | Opus audit |
| T10R-R5  | Fix: add annotated screenshots to the 2–3 hardest steps in each training guide (M-52)                 | pending | Medium   | Opus audit |
| T10R-R6  | Fix: replace handroll CSV parser with RFC 4180 parser + Colombian-name unit tests (M-53)              | pending | Medium   | Opus audit |
| T10R-R7  | Fix: in-file dedup + transactional import + summary with intra-file skip count (M-54)                 | pending | Medium   | Opus audit |
| T10R-R8  | Fix: version banner — immediate check on mount, visibility pause, backoff, jitter (M-55)              | pending | Medium   | Opus audit |
| T10R-R9  | Fix: move `/api/health` and `/api/version` into `PUBLIC_EXACT_PATHS` (L-44)                           | pending | Low      | Opus audit |
| T10R-R10 | Fix: apply IP-based `@upstash/ratelimit` to both public API endpoints (L-45)                          | pending | Low      | Opus audit |
| T10R-R11 | Fix: replace `vercel env pull --environment=production -- DATABASE_URL` with verified sequence (L-46) | pending | Low      | Opus audit |

---

## POST-MVP — Future enhancements

> Deferred to post-MVP. Secretary uses WhatsApp manually for the first two months.

| ID   | Task                                                                           | Status  | Dependencies |
| ---- | ------------------------------------------------------------------------------ | ------- | ------------ |
| T055 | Appointment confirmation email template (React Email)                          | pending | T054         |
| T056 | "Send confirmation email" action on appointment _(low priority)_               | pending | T055, T053   |
| T083 | Responsive QA pass — browser/device testing with real staff _(moved from P10)_ | pending | all phases   |
| T106 | UAT — one full simulated business day per role on staging _(moved from P10)_   | pending | T088         |

---

## Totals

| Phase                     | Tasks   | Done    | In progress |
| ------------------------- | ------- | ------- | ----------- |
| 0A — Foundation (Infra)   | 13      | 13      | 0           |
| 0AR — Remediation         | 4       | 4       | 0           |
| 0B — Foundation (Std/Dsg) | 7       | 7       | 0           |
| 1 — Identity              | 14      | 14      | 0           |
| 1R — Remediation          | 4       | 4       | 0           |
| 2 — Catalog               | 6       | 6       | 0           |
| 2R — Remediation          | 3       | 3       | 0           |
| 3 — Clients               | 4       | 4       | 0           |
| 3R — Remediation          | 3       | 3       | 0           |
| 4A — Tickets and checkout | 13      | 13      | 0           |
| 4B — Cloth batches        | 4       | 4       | 0           |
| 4R — Remediation          | 9       | 9       | 0           |
| 5 — Appointments          | 7       | 7       | 0           |
| 5R — Remediation          | 8       | 8       | 0           |
| 6 — Large orders          | 6       | 6       | 0           |
| 6R — Remediation          | 12      | 12      | 0           |
| 7 — Payroll               | 11      | 11      | 0           |
| 7R — Remediation          | 17      | 17      | 0           |
| 8 — Analytics             | 8       | 8       | 0           |
| 8R — Remediation          | 15      | 14      | 0           |
| 9 — Offline               | 5       | 5       | 0           |
| 9R — Remediation          | 16      | 15      | 0           |
| 10 — Polish               | 9       | 0       | 0           |
| POST-MVP                  | 2       | 0       | 0           |
| **Total**                 | **203** | **161** | **0**       |

---

## Retired task IDs (do not reuse)

| ID   | Reason                                              |
| ---- | --------------------------------------------------- |
| T043 | Walk-in flow — merged into T035 acceptance criteria |
| T022 | Split into T022a (Phase 1) and T022b (Phase 7)      |
