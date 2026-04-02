# Project progress

Master task list. Each task is atomic: one unit of work that can be completed, reviewed, and marked done independently. DB tables are created in the phase that needs them, not all at once.

**Statuses:** `pending` · `in-progress` · `done` · `blocked`

---

## Phase 0 — Foundation

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T001 | Initialize Next.js monorepo with Turborepo | pending | — |
| T002 | Configure code quality tooling (ESLint, Prettier, Husky) | pending | T001 |
| T003 | Environment variable schema and runtime validation | pending | T001 |
| T004 | Vercel project setup and staging deploys | pending | T001 |
| T005 | Neon Postgres setup with dev and staging branches | pending | T004 |
| T006 | Drizzle ORM setup and migration workflow | pending | T005 |
| T007 | Better Auth spike and integration (RBAC validation) | pending | T006 |
| T008 | Base UI (Base Web) spike for Next.js App Router | pending | T001 |
| T009 | Pusher free tier spike for real-time events | pending | T001 |
| T010 | RBAC role definitions (roles + stylist subtypes) | pending | T007 |
| T011 | Seed script for development (one user per role) | pending | T010 |

---

## Phase 1 — Identity, employees, and business day

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T012 | Employees table migration | pending | T006 |
| T013 | Employee account creation UI (admin) | pending | T012, T010 |
| T014 | Employee list and profile view (admin) | pending | T013 |
| T015 | Employee earnings visibility flag | pending | T014 |
| T016 | Login page | pending | T007, T008 |
| T017 | Password reset flow (Resend email) | pending | T016 |
| T018 | Session middleware and route protection | pending | T010 |
| T019 | Business day open/close (table + admin action) | pending | T012 |
| T020 | Absences and vacation table migration | pending | T012 |
| T021 | Vacation and absence management UI (admin) | pending | T020 |
| T022 | Employee deactivation and termination flow | pending | T014 |

---

## Phase 2 — Catalog and pricing

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T023 | Services and variants table migration | pending | T006 |
| T024 | Service catalog CRUD UI (admin) | pending | T023 |
| T025 | Catalog audit log | pending | T024 |
| T026 | Cloth pieces table migration | pending | T006 |
| T027 | Cloth piece catalog CRUD UI (admin) | pending | T026 |
| T028 | Catalog read access for non-admin roles (API endpoints) | pending | T024, T027 |

---

## Phase 3 — Client records

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T029 | Clients table migration | pending | T006 |
| T030 | Saved client CRUD and search UI (cashier/secretary) | pending | T029 |
| T031 | Guest client flow (name only, no record) | pending | T030 |
| T032 | No-show count tracking | pending | T029 |

---

## Phase 4 — Daily operations: tickets, checkout, cloth batches

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T033 | Tickets table migration | pending | T019, T029 |
| T034 | Ticket items table migration (with price/commission snapshot) | pending | T033, T023 |
| T035 | Ticket creation (stylist / secretary / cashier) | pending | T034, T031, T028 |
| T036 | Cashier dashboard with live Pusher updates | pending | T035, T009 |
| T037 | Ticket status transitions and permissions | pending | T035 |
| T038 | Checkout flow (payment method, close ticket) | pending | T037 |
| T039 | Split payment at checkout (ticket_payments table) | pending | T038 |
| T040 | Price override at checkout (cashier only) | pending | T038 |
| T041 | Edit approval flow (secretary/stylist → cashier) | pending | T035 |
| T042 | Ticket reopen and earnings recompute flag | pending | T038 |
| T043 | Walk-in flow (no appointment required) | pending | T035 |
| T044 | Cloth batches and batch_pieces table migration | pending | T019, T026 |
| T045 | Cloth batch creation UI (secretary / admin) | pending | T044, T028 |
| T046 | Clothier batch view and piece completion | pending | T045 |
| T047 | Piece approval flow (secretary / admin) | pending | T046 |
| T048 | In-app notification system (MVP) | pending | T009 |

---

## Phase 5 — Appointments

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T049 | Appointments table migration | pending | T029, T012 |
| T050 | Appointment booking UI (secretary / cashier) | pending | T049, T030 |
| T051 | Double-booking prevention (DB-level) | pending | T050 |
| T052 | Appointment list and calendar view | pending | T050 |
| T053 | Appointment status management (confirm, cancel, no-show, etc.) | pending | T050 |
| T054 | Resend email integration | pending | T003 |
| T055 | Appointment confirmation email template (React Email) | pending | T054 |
| T056 | "Send confirmation email" action on appointment | pending | T055, T053 |

---

## Phase 6 — Large cloth orders

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T057 | Large orders and large_order_payments table migration | pending | T029 |
| T058 | Large order creation and edit UI (admin / secretary) | pending | T057, T030 |
| T059 | Order status flow (admin / secretary) | pending | T058 |
| T060 | Link cloth batches to large orders | pending | T059, T044 |
| T061 | Additional payment recording on large orders | pending | T058 |
| T062 | Large orders list view | pending | T059 |

---

## Phase 7 — Payroll settlement and audit

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T063 | Earnings computation: stylists (commission %) | pending | T038 |
| T064 | Earnings computation: clothiers (per-piece) | pending | T047 |
| T065 | Earnings computation: secretary (daily rate × days) | pending | T021 |
| T066 | Payouts table migration (with junction tables) | pending | T006 |
| T067 | Payout recording UI (admin) | pending | T063, T064, T065, T066 |
| T068 | Double-pay prevention | pending | T067 |
| T069 | Employee earnings view (own earnings, gated by flag) | pending | T063, T064, T065, T015 |
| T070 | Unsettled earnings alert on admin dashboard | pending | T067 |

---

## Phase 8 — Analytics

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T071 | Analytics data queries (revenue, jobs, earnings) | pending | T038, T066 |
| T072 | Daily revenue dashboard | pending | T071 |
| T073 | Weekly and monthly revenue dashboards with comparison | pending | T071 |
| T074 | Per-employee performance views and drill-down | pending | T071 |
| T075 | Analytics database indexes and query optimization | pending | T071 |
| T076 | CSV export for accountant (stretch) | pending | T071 |

---

## Phase 9 — Offline / sync hardening

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T077 | Offline policy document | pending | — |
| T078 | Idempotency keys on mutating API routes | pending | T033, T044 |
| T079 | IndexedDB local mutation queue | pending | T078 |
| T080 | Sync status UI (online/offline/syncing indicator) | pending | T079 |
| T081 | Service worker with Workbox (caching strategies) | pending | T001 |
| T082 | Web App Manifest and PWA install prompt | pending | T081 |

---

## Phase 10 — Polish and rollout

| ID | Task | Status | Dependencies |
|----|------|--------|-------------|
| T083 | Responsive QA pass (mobile + desktop, all roles) | pending | all phases |
| T084 | Loading states and optimistic UI | pending | all phases |
| T085 | Sentry error tracking setup | pending | T004 |
| T086 | Database backup policy and restore drill | pending | T005 |
| T087 | Uptime monitoring (`/api/health` endpoint + monitor) | pending | T004 |
| T088 | Internal training guide (one page per role) | pending | all phases |
| T089 | Production cutover checklist and go-live | pending | T083–T088 |

---

## Totals

| Phase | Tasks | Done | In progress |
|-------|-------|------|-------------|
| 0 — Foundation | 11 | 0 | 0 |
| 1 — Identity | 11 | 0 | 0 |
| 2 — Catalog | 6 | 0 | 0 |
| 3 — Clients | 4 | 0 | 0 |
| 4 — Daily operations | 16 | 0 | 0 |
| 5 — Appointments | 8 | 0 | 0 |
| 6 — Large orders | 6 | 0 | 0 |
| 7 — Payroll | 8 | 0 | 0 |
| 8 — Analytics | 6 | 0 | 0 |
| 9 — Offline | 6 | 0 | 0 |
| 10 — Polish | 7 | 0 | 0 |
| **Total** | **89** | **0** | **0** |
