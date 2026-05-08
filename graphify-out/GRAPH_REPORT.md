# Graph Report - docs (2026-05-08)

## Corpus Check

- 60 files · ~116,953 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 420 nodes · 622 edges · 18 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.85)
- Token cost: 84,000 input · 15,300 output

## Community Hubs (Navigation)

- [[_COMMUNITY_Concurrency & Issue Tracking|Concurrency & Issue Tracking]]
- [[_COMMUNITY_Core Business Model|Core Business Model]]
- [[_COMMUNITY_UX Design & Wireframes|UX Design & Wireframes]]
- [[_COMMUNITY_Lifecycle & Realtime Concepts|Lifecycle & Realtime Concepts]]
- [[_COMMUNITY_Phase Roadmap & Foundation|Phase Roadmap & Foundation]]
- [[_COMMUNITY_Payroll & Analytics|Payroll & Analytics]]
- [[_COMMUNITY_Auth Providers Research|Auth Providers Research]]
- [[_COMMUNITY_Appointments & Large Orders|Appointments & Large Orders]]
- [[_COMMUNITY_Backup & Data Recovery|Backup & Data Recovery]]
- [[_COMMUNITY_Brand Assets & Identity|Brand Assets & Identity]]
- [[_COMMUNITY_Performance & Testing|Performance & Testing]]
- [[_COMMUNITY_Frontend Tech Stack|Frontend Tech Stack]]
- [[_COMMUNITY_Cashier Admin Training|Cashier Admin Training]]
- [[_COMMUNITY_Business Model & SaaS|Business Model & SaaS]]
- [[_COMMUNITY_MVP Scope|MVP Scope]]
- [[_COMMUNITY_Resolved Decisions|Resolved Decisions]]
- [[_COMMUNITY_Keyboard Shortcuts|Keyboard Shortcuts]]
- [[_COMMUNITY_Security Testing|Security Testing]]

## God Nodes (most connected - your core abstractions)

1. `Issues Tracker` - 19 edges
2. `Project Progress (Master Task List)` - 15 edges
3. `Project Plan — Innovation Befine` - 13 edges
4. `Phase 4A — Tickets and Checkout` - 13 edges
5. `BeFine Tech Stack (Next.js, Drizzle, Neon, Better Auth, SSE, Resend)` - 12 edges
6. `T105 — Brand identity and asset gathering` - 12 edges
7. `Business Idea — Innovation Befine` - 11 edges
8. `RBAC Permission Matrix` - 11 edges
9. `Testing Strategy` - 11 edges
10. `Phase 7 — Payroll Settlement and Audit` - 10 edges

## Surprising Connections (you probably didn't know these)

- `T105 — Brand identity and asset gathering` --produces--> `Befine wordmark SVG — Innovation Befine typographic logo (pink #E4448E + black, serif font)` [INFERRED]
  docs/Business/tasks/phase-01-identity.md → docs/assets/befine-wordmark.svg
- `T105 — Brand identity and asset gathering` --produces--> `Befine icon SVG — 512×512 abstract 'I' letterform mark, pink #E9408E on black circle` [INFERRED]
  docs/Business/tasks/phase-01-identity.md → docs/assets/befine-icon.svg
- `T105 — Brand identity and asset gathering` --produces--> `Favicon PNG 16×16 — small Befine icon (pink I on black circle)` [INFERRED]
  docs/Business/tasks/phase-01-identity.md → docs/assets/favicon-16.png
- `T105 — Brand identity and asset gathering` --produces--> `Favicon PNG 48×48 — Befine icon (pink I on black circle)` [INFERRED]
  docs/Business/tasks/phase-01-identity.md → docs/assets/favicon-48.png
- `T105 — Brand identity and asset gathering` --produces--> `Apple touch icon PNG 180×180 — Befine icon for iOS home screen` [INFERRED]
  docs/Business/tasks/phase-01-identity.md → docs/assets/apple-touch-icon.png

## Hyperedges (group relationships)

- **Financial Integrity: Money Storage + Bankers Rounding + Idempotency jointly ensure correct payroll** — standards_money_storage, standards_bankers_rounding, standards_api_idempotency, business_idea_payroll_settlement [INFERRED 0.88]
- **Ticket Lifecycle governed by Stylist, Admin, Secretary roles with distinct permissions at each status** — business_idea_ticket_lifecycle, business_idea_role_stylist, business_idea_role_admin, business_idea_role_secretary, rbac_matrix_tickets [EXTRACTED 1.00]
- **Concurrent safety across checkout, double-pay, and double-booking all use optimistic lock SQL pattern** — concurrency_optimistic_lock, concurrency_rc01, concurrency_rc03, concurrency_rc06 [EXTRACTED 0.95]
- **Core Vendor Technology Decisions (Postgres, Auth, Realtime, Email)** — postgres_neon, auth_better_auth, realtime_sse, notification_email_resend, business_free_tier_infra [INFERRED 0.88]
- **Expert Reviews (PO, SWE, Designer, QA) Collectively Shaped progress.md** — po_review, swe_review, designer_review, qa_review, progress_doc [EXTRACTED 0.97]
- **Offline Safety Chain (Policy to Idempotency to Financial Guards to Conflict Resolution)** — offline_policy, offline_idempotency_key, offline_financial_safety, offline_conflict_resolution, offline_replay_rules [INFERRED 0.87]
- **Earnings computation → payout recording → double-pay prevention pipeline** — t063_stylist_earnings, t064_clothier_earnings, t065_secretary_earnings, t067_payout_recording, t068_double_pay_prevention [EXTRACTED 0.95]
- **Offline mutation queue + idempotency keys + sync status UI form offline resilience system** — t077_offline_policy, t078_idempotency_keys, t079_indexeddb_queue, t080_sync_status_ui, t081_service_worker [EXTRACTED 0.92]
- **Brand assets (SVG icon, PNG favicons, touch icon) collectively constitute PWA/browser identity** — asset_befine_icon_svg, asset_favicon_192, asset_favicon_512, asset_apple_touch_icon, t082_pwa_manifest, t105_brand_assets [INFERRED 0.88]

## Communities

### Community 0 - "Concurrency & Issue Tracking"

Cohesion: 0.05
Nodes (63): Optimistic Lock Pattern (WHERE status = X RETURNING), RC-01: Concurrent Checkout Double-Close, RC-06: Concurrent Double-Booking Appointments, Concurrency Test Plan, C-01: Missing appointment_id on tickets, C-02: Missing P4B to P7 dependency edge, C-03: Currency decision resolved as COP, C-04: No data privacy compliance research (+55 more)

### Community 1 - "Core Business Model"

Cohesion: 0.05
Nodes (59): Business Day (open/close concept), Client Model: saved vs guest, Cloth Batches and Large Orders, Commission Pay Model (stylist), Daily-Rate Pay Model (secretary), Business Idea — Innovation Befine, Payroll Settlement Workflow, Piece-Rate Pay Model (clothier) (+51 more)

### Community 2 - "UX Design & Wireframes"

Cohesion: 0.05
Nodes (47): Designer D10: No Mobile-First Strategy for Clothier/Stylist (High), Designer D1: No Design System / Design Tokens (Critical), Designer D2: No Wireframes or Screen Layouts (Critical), Designer D3: No Role-Specific UX Prioritization (Critical), Designer D4: No Status Colour System (High), Senior Designer Review, Appointment Confirmation Channels Research, Email via Resend (MVP appointment confirmation) (+39 more)

### Community 3 - "Lifecycle & Realtime Concepts"

Cohesion: 0.07
Nodes (42): Batch piece lifecycle (pending→done_pending_approval→approved), Idempotency key pattern for financial mutations, Offline mutation queue (IndexedDB + sync on reconnect), packages/realtime SSE abstraction layer, Ticket lifecycle (logged→awaiting_payment→closed/reopened/paid_offline), Phase 2 — Catalog and pricing, Phase 4A — Tickets and checkout, Phase 4B — Cloth batches (+34 more)

### Community 4 - "Phase Roadmap & Foundation"

Cohesion: 0.1
Nodes (30): Phase 0 — Foundation, Phase 0A — Infrastructure (T001,T003-T011,T085,T094,T095), Phase 0B — Standards & Design (T002,T077,T097-T099,T103,T104), Phase 10 — Polish and rollout, T001 — Initialize Next.js monorepo with Turborepo, T002 — Configure code quality tooling, T003 — Environment variable schema, T004 — Vercel project setup (+22 more)

### Community 5 - "Payroll & Analytics"

Cohesion: 0.09
Nodes (27): Earnings computation (commission / piece_rate / daily_rate models), Shared payment_method_enum (cash|card|transfer), Phase 7 — Payroll settlement and audit, Phase 8 — Analytics, T014 — Employee list and profile view (admin), T015 — Employee earnings visibility flag, T020 — Absences and vacation table migration, T021 — Vacation and absence management UI (admin) (+19 more)

### Community 6 - "Auth Providers Research"

Cohesion: 0.09
Nodes (23): Auth.js (NextAuth v5), Better Auth (self-hosted with RBAC), Clerk (managed SaaS auth), Auth Abstraction via Middleware (T018), Auth Migration Fallback Plan (to Auth.js or Clerk), Auth Providers Research, Rationale: Better Auth chosen (RBAC, no vendor lock-in, free), Data Privacy and Compliance Research (Colombia) (+15 more)

### Community 7 - "Appointments & Large Orders"

Cohesion: 0.12
Nodes (22): Appointment lifecycle (booked→confirmed→completed|cancelled|rescheduled|no_show), Large order lifecycle (pending→in_production→ready→delivered→paid_in_full|cancelled), Phase 3 — Client records, Phase 5 — Appointments, Phase 6 — Large cloth orders, T029 — Clients table migration, T030 — Saved client CRUD and search, T032 — No-show count display (+14 more)

### Community 8 - "Backup & Data Recovery"

Cohesion: 0.1
Nodes (21): Restore Drill Blocked (no staging branch, T10R-R3), Neon PITR (Point-in-Time Restore), Database Backup Policy, DB Restore Procedure (Neon Console, under 5 min), Secondary Backup via pg_dump (monthly), Go-Live Checklist, Go-Live: Go/No-Go Decision Criteria, Go-Live: Environment and Infrastructure Checks (+13 more)

### Community 9 - "Brand Assets & Identity"

Cohesion: 0.15
Nodes (21): Apple touch icon PNG 180×180 — Befine icon for iOS home screen, Befine icon SVG — 512×512 abstract 'I' letterform mark, pink #E9408E on black circle, Befine wordmark SVG — Innovation Befine typographic logo (pink #E4448E + black, serif font), Favicon PNG 16×16 — small Befine icon (pink I on black circle), PWA icon PNG 192×192 — Befine icon for Android home screen, Favicon PNG 32×32 — Befine icon (pink I on black circle), Favicon PNG 48×48 — Befine icon (pink I on black circle), PWA icon PNG 512×512 — Befine icon large splash/store asset (+13 more)

### Community 10 - "Performance & Testing"

Cohesion: 0.11
Nodes (20): Analytics Query Latency Results, T107 Performance Results, DB Indexes Applied (T075 and T107), Lighthouse Desktop Results, SSE Event Delivery Latency Results, Accessibility Baseline (WCAG AA), COP Currency Format ($12.500), Engineering Standards (+12 more)

### Community 11 - "Frontend Tech Stack"

Cohesion: 0.23
Nodes (15): BeFine Tech Stack (Next.js, Drizzle, Neon, Better Auth, SSE, Resend), Designer D7: No Data Visualization Strategy (High) Recharts chosen, date-fns (date manipulation, Spanish locale), Front-End Libraries Rationale, Lucide Icons (consistent iconography), Recharts (analytics charts), React Hook Form + Zod Resolver, TanStack Query (server state caching) (+7 more)

### Community 12 - "Cashier Admin Training"

Cohesion: 0.15
Nodes (14): Checkout Workflow (cashier), Close Business Day Workflow, Cashier/Admin Training Guide, Offline Payment Mode, Open Business Day Workflow, Payroll Settlement Workflow (cashier), Register Service (Ticket) Workflow, Offline Action Classification (online-only vs offline-capable) (+6 more)

### Community 13 - "Business Model & SaaS"

Cohesion: 0.17
Nodes (12): Innovation Befine Business Document, BeFine Feature Summary (services, catalog, clients, appointments, payroll, analytics, offline), MVP Infrastructure Free-Tier Costs, SaaS Commercialization Audit, SaaS Gap: Billing and Subscription (Stripe, DIAN), SaaS Gap: Multi-tenancy (organization_id missing), SaaS Gap: Self-Serve Onboarding, Go-to-Market Strategy (design partners, short-form content, accountant referrals) (+4 more)

### Community 14 - "MVP Scope"

Cohesion: 1.0
Nodes (1): MVP Vertical Slice

### Community 15 - "Resolved Decisions"

Cohesion: 1.0
Nodes (1): Resolved Decisions

### Community 16 - "Keyboard Shortcuts"

Cohesion: 1.0
Nodes (1): Keyboard Shortcuts (Desktop)

### Community 17 - "Security Testing"

Cohesion: 1.0
Nodes (1): CSP Header Tests

## Knowledge Gaps

- **136 isolated node(s):** `MVP Vertical Slice`, `Resolved Decisions`, `Server Actions Pattern`, `Cursor-Based Pagination`, `Zod Input Validation` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `MVP Scope`** (1 nodes): `MVP Vertical Slice`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resolved Decisions`** (1 nodes): `Resolved Decisions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Keyboard Shortcuts`** (1 nodes): `Keyboard Shortcuts (Desktop)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Security Testing`** (1 nodes): `CSP Header Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Project Progress (Master Task List)` connect `UX Design & Wireframes` to `Backup & Data Recovery`, `Business Model & SaaS`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `T006 — Drizzle ORM setup and migration workflow` connect `Lifecycle & Realtime Concepts` to `Brand Assets & Identity`, `Phase Roadmap & Foundation`, `Payroll & Analytics`, `Appointments & Large Orders`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `Research Index README` connect `UX Design & Wireframes` to `Auth Providers Research`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `MVP Vertical Slice`, `Resolved Decisions`, `Server Actions Pattern` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Concurrency & Issue Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core Business Model` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `UX Design & Wireframes` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
