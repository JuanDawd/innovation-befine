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
| T04R-R6 | Fix: add Vitest unit tests covering ticket status transitions × role, checkout idempotency, payment sum mismatch, optimistic-lock conflicts, override recompute, batch-piece self-claim race, mark-done authorisation, approve state guards | High     | done   | Opus audit |
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

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                          | Severity | Status  | Source     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ---------- |
| T05R-R1 | Fix: adopt a **dual-driver** Neon setup (see T05R-R1 detail block below). Keep `neon-http` as the default for reads, Better Auth, and simple writes. Add a separate `neon-serverless` (WebSocket `Pool`) driver used **only** by the 5 interactive-transaction call sites. Additionally, diagnose and root-fix the `JSON.parse` rejection at its real source (not a driver workaround).                                       | Critical | done    | Opus audit |
| T05R-R2 | Fix: T109 dedup inversion — flip the intent. `price_change_acknowledged` should default to `true` (no pending change) on insert; `editVariant` should reset to `false` and **always** notify when transitioning `true → false`, suppress when already `false`. Update column default in schema, add a migration to backfill existing rows to `true`, fix `editVariant` filter, and adjust the UI badge condition accordingly. | Critical | done    | Opus audit |
| T05R-R3 | Fix: implement T053 `reschedule` action — extend `transitionAppointmentSchema` (`reschedule` action with `newScheduledAt` field), add to `ALLOWED_TRANSITIONS` (booked/confirmed → rescheduled with overlap re-check via the same logic as `createAppointment`), wire a Reschedule button in `AppointmentStatusActions` with a date/time inline form. AC of T053 explicitly requires reschedule and the overlap re-check.     | Critical | done    | Opus audit |
| T05R-R4 | Fix: T032b reopen path — wrap the `no_show → booked` UPDATE in a try/catch for Postgres error code `23P01`; on exclusion violation, return `{ code: "CONFLICT", message: "El horario ya está ocupado" }` instead of letting the raw DB error bubble up.                                                                                                                                                                       | High     | done    | Opus audit |
| T05R-R5 | Fix: wrap `editVariant` price-change side effects (variant update + audit log + appointment-flag reset + N notifications) in a single `db.transaction`, deferring notification fan-out to post-commit. Currently a partial failure leaves variant updated but appointments un-flagged or only some secretaries notified.                                                                                                      | High     | pending | Opus audit |
| T05R-R6 | Fix: add `checkRateLimit(rateLimits.general)` to `acknowledgeAppointmentPriceChange` per CLAUDE.md "General mutations: 60/min per user".                                                                                                                                                                                                                                                                                      | Medium   | pending | Opus audit |
| T05R-R7 | Fix: wire `complete` action to optionally accept a `ticketId` and set `tickets.appointment_id` atomically when the secretary completes an appointment that has an associated ticket. AC of T053 says completion "optionally links to a ticket" but no plumbing exists today.                                                                                                                                                  | Low      | pending | Opus audit |
| T05R-R8 | Fix: protect `editVariant` against concurrent double-notification by adding optimistic-lock (`version` column on `service_variants`) or a SELECT FOR UPDATE on the variant row before computing `priceChanged`.                                                                                                                                                                                                               | Low      | pending | Opus audit |

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
// dead connection. 10s matches Neon's default idle timeout behaviour.
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

| ID   | Task                                                  | Status  | Dependencies |
| ---- | ----------------------------------------------------- | ------- | ------------ |
| T057 | Large orders and large_order_payments table migration | pending | T029         |
| T058 | Large order creation and edit UI (admin / secretary)  | pending | T057, T030   |
| T059 | Order status flow (admin / secretary)                 | pending | T058         |
| T060 | Link cloth batches to large orders                    | pending | T059, T044   |
| T061 | Additional payment recording on large orders          | pending | T058         |
| T062 | Large orders list view                                | pending | T059, T061   |

---

## Phase 7 — Payroll settlement and audit

> Includes absence tracking (T020, T021) and deactivation guard (T022b) — moved here because they are only consumed by payroll logic.

| ID    | Task                                                              | Status  | Dependencies           |
| ----- | ----------------------------------------------------------------- | ------- | ---------------------- |
| T020  | Absences and vacation table migration _(moved from Phase 1)_      | pending | T012                   |
| T021  | Vacation and absence management UI (admin) _(moved from Phase 1)_ | pending | T020                   |
| T022b | Deactivation guard + termination payment _(split from T022)_      | pending | T022a, T067            |
| T063  | Earnings computation: stylists (commission %)                     | pending | T038                   |
| T064  | Earnings computation: clothiers (per-piece)                       | pending | T047                   |
| T065  | Earnings computation: secretary (daily rate × days)               | pending | T021, T020             |
| T066  | Payouts table migration (with junction tables)                    | pending | T006                   |
| T067  | Payout recording UI (admin)                                       | pending | T063, T064, T065, T066 |
| T068  | Double-pay prevention                                             | pending | T067                   |
| T069  | Employee earnings view (own earnings, gated by flag)              | pending | T063, T064, T065, T015 |
| T070  | Unsettled earnings alert on admin dashboard                       | pending | T067                   |

---

## Phase 8 — Analytics

| ID   | Task                                                  | Status  | Dependencies |
| ---- | ----------------------------------------------------- | ------- | ------------ |
| T071 | Analytics data queries (revenue, jobs, earnings)      | pending | T038, T066   |
| T072 | Daily revenue dashboard                               | pending | T071         |
| T073 | Weekly and monthly revenue dashboards with comparison | pending | T071         |
| T074 | Per-employee performance views and drill-down         | pending | T071         |
| T075 | Analytics database indexes and query optimization     | pending | T071         |
| T101 | Analytics seed script (6 months of data) _(new)_      | pending | T071         |
| T107 | Performance testing _(new — QA review Q11)_           | pending | T101         |
| T076 | CSV export for accountant (stretch)                   | pending | T071         |

---

## Phase 9 — Offline / sync hardening

> T077 (offline policy) moved to Phase 0. The `idempotency_key` column is added to tickets in T033 (Phase 4A).

| ID   | Task                                              | Status  | Dependencies |
| ---- | ------------------------------------------------- | ------- | ------------ |
| T078 | Idempotency keys on remaining mutating API routes | pending | T033, T044   |
| T079 | IndexedDB local mutation queue                    | pending | T078         |
| T080 | Sync status UI (online/offline/syncing indicator) | pending | T079         |
| T081 | Service worker with Workbox (caching strategies)  | pending | T001         |
| T082 | Web App Manifest and PWA install prompt           | pending | T081         |

---

## Phase 10 — Polish and rollout

| ID   | Task                                                 | Status  | Dependencies                                   |
| ---- | ---------------------------------------------------- | ------- | ---------------------------------------------- |
| T083 | Responsive QA pass (mobile + desktop, all roles)     | pending | all phases                                     |
| T084 | Loading states and optimistic UI                     | pending | all phases                                     |
| T086 | Database backup policy and restore drill             | pending | T005                                           |
| T087 | Uptime monitoring (`/api/health` endpoint + monitor) | pending | T004                                           |
| T088 | Internal training guide (one page per role)          | pending | all phases                                     |
| T102 | Stale-tab version detection _(new)_                  | pending | T004                                           |
| T100 | Data migration from existing spreadsheets _(new)_    | pending | T029, T030                                     |
| T106 | User acceptance testing (UAT) _(new — QA review Q7)_ | pending | T088                                           |
| T089 | Production cutover checklist and go-live             | pending | T083, T084, T086, T087, T088, T100, T102, T106 |

---

## POST-MVP — Future enhancements

> Deferred to post-MVP. Secretary uses WhatsApp manually for the first two months.

| ID   | Task                                                             | Status  | Dependencies |
| ---- | ---------------------------------------------------------------- | ------- | ------------ |
| T055 | Appointment confirmation email template (React Email)            | pending | T054         |
| T056 | "Send confirmation email" action on appointment _(low priority)_ | pending | T055, T053   |

---

## Totals

| Phase                     | Tasks   | Done   | In progress |
| ------------------------- | ------- | ------ | ----------- |
| 0A — Foundation (Infra)   | 13      | 13     | 0           |
| 0AR — Remediation         | 4       | 4      | 0           |
| 0B — Foundation (Std/Dsg) | 7       | 7      | 0           |
| 1 — Identity              | 14      | 14     | 0           |
| 1R — Remediation          | 4       | 4      | 0           |
| 2 — Catalog               | 6       | 6      | 0           |
| 2R — Remediation          | 3       | 3      | 0           |
| 3 — Clients               | 4       | 4      | 0           |
| 3R — Remediation          | 3       | 3      | 0           |
| 4A — Tickets and checkout | 13      | 13     | 0           |
| 4B — Cloth batches        | 4       | 4      | 0           |
| 4R — Remediation          | 9       | 0      | 0           |
| 5 — Appointments          | 7       | 7      | 0           |
| 6 — Large orders          | 6       | 0      | 0           |
| 7 — Payroll               | 11      | 0      | 0           |
| 8 — Analytics             | 8       | 0      | 0           |
| 9 — Offline               | 5       | 0      | 0           |
| 10 — Polish               | 9       | 0      | 0           |
| POST-MVP                  | 2       | 0      | 0           |
| **Total**                 | **130** | **71** | **0**       |

---

## Retired task IDs (do not reuse)

| ID   | Reason                                              |
| ---- | --------------------------------------------------- |
| T043 | Walk-in flow — merged into T035 acceptance criteria |
| T022 | Split into T022a (Phase 1) and T022b (Phase 7)      |
