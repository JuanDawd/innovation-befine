# Senior Software Engineer Review

> Reviewed: April 2026
> Scope: full project documentation (business-idea.md, technical-feasibility-and-research.md, project-plan.md, all 11 phase task files, all 5 research files, progress.md, business.md)
> Reviewer perspective: architecture, code quality, security, operability, delivery risk

---

## Overall assessment

The documentation is **exceptionally well-structured** for a greenfield project. The separation of business → feasibility → plan → phased tasks → research decisions is the kind of discipline most projects lack. The Senior Product Owner review already caught the most dangerous dependency and ordering issues.

That said, there are gaps an engineering lead would flag before the first sprint starts. Findings are grouped by severity.

---

## Critical findings

### F1 — No testing strategy or testing infrastructure task

**Impact: high — compounds across every phase**

There is no task for setting up the testing framework (Vitest, Playwright, or anything else) in Phase 0. A few individual tasks mention "unit-tested" (T063, T064, T065), but there is no:

- Test runner configuration task
- Integration test strategy (API routes, DB transactions)
- E2E test strategy (critical flows like checkout)
- Test coverage policy or threshold

Without this, testing will be ad-hoc or skipped entirely until Phase 10, when fixing quality issues costs 10× more than preventing them.

**Recommendation:** Add a task to Phase 0 for test infrastructure (Vitest + Playwright configuration). Add a policy that every task with business logic includes at least unit tests. Consider E2E tests for the checkout flow in Phase 4A.

---

### F2 — No CI/CD pipeline task

**Impact: high — no automated quality gate on code merges**

There is no GitHub Actions (or equivalent) workflow in the plan. Without CI:

- Lint errors, type errors, and test failures can be merged into `main`
- Preview deploys on Vercel are not gated by quality checks
- The pre-commit hook (T002) only runs on the developer's machine and can be bypassed with `--no-verify`

**Recommendation:** Add a task to Phase 0: GitHub Actions workflow that runs `turbo lint`, `turbo typecheck`, and `turbo test` on every PR. Block merges on failure.

---

### F3 — Money storage format not decided — affects every phase with financial data

**Impact: high — cross-cutting decision that touches 6+ tables**

T023 acceptance criteria say: *"customer_price is stored as integer cents (or numeric with 2 decimal places) — decide once and document."* This decision is deferred to Phase 2, but tables with money fields appear in Phase 2 (services, cloth pieces), Phase 4A (ticket items, payments), Phase 6 (large orders, order payments), and Phase 7 (payouts).

If this is decided wrong or inconsistently, every calculation (commissions, payroll, analytics) will produce rounding errors that are painful to fix retroactively.

**Recommendation:** Decide in Phase 0 and document in the codebase standards. Integer cents (`bigint` stored as cents, displayed as dollars) is the safer choice — it avoids floating-point rounding entirely and is the pattern used by Stripe, Shopify, and most financial systems.

---

### F4 — No API design conventions documented

**Impact: medium-high — inconsistency across 94 tasks**

There is no task or document defining:

- Whether to use REST API routes vs Next.js Server Actions (or a mix)
- Standard error response shape (`{ error: string, code: string }` vs thrown errors)
- Pagination pattern for list endpoints (cursor vs offset)
- How to handle validation errors (Zod errors → client-friendly format)
- Request/response typing strategy (shared types from `packages/types`?)

Without conventions, each developer (or each AI-assisted session) will choose differently, creating a codebase that is inconsistent and harder to maintain.

**Recommendation:** Add a task to Phase 0 to document API conventions. Alternatively, add it as a deliverable of T002 (code standards).

---

## High-severity findings

### F5 — Missing `docs/research/offline-policy.md`

The project plan references this file as a Phase 0 exit criterion (T077). It does not exist in the repository yet. This is expected (Phase 0 hasn't started), but it's worth flagging: **no Phase 4A task should begin before this document is written and signed off**. The current AC in T077 is well-defined; this is a reminder, not a new finding.

---

### F6 — No real-time abstraction layer — Pusher is a migration risk

The plan states: *"Start with Pusher; migrate to native SSE + Postgres LISTEN/NOTIFY later."* But there is no task to create an abstraction layer between the app and Pusher. If Pusher is used directly (importing `pusher-js` in components, calling `pusher.trigger()` in API routes), migrating later means touching every file that uses real-time features.

**Recommendation:** In T009 (Pusher spike) or as a separate task, create a thin wrapper:

- Server: `publishEvent(channel, event, data)` — calls Pusher now, SSE later
- Client: `useRealtimeEvent(channel, event, callback)` — subscribes via Pusher now, EventSource later

This is a 1–2 hour investment that saves days during migration.

---

### F7 — No logging or observability until Phase 10

Sentry (T085) is placed in Phase 10 — the last phase. Structured logging is not mentioned anywhere. During Phases 1–9, if something breaks in staging or production, the only debugging tool is `console.log` in Vercel's function logs (unstructured, hard to search, no correlation IDs).

**Recommendation:** Move Sentry setup to Phase 0 or Phase 1 (it takes 15 minutes to configure `@sentry/nextjs`). Add structured logging (e.g. `pino`) as part of T002 (code standards). This saves hours of debugging time across 9 phases.

---

### F8 — T032 (no-show count) is in Phase 3 but can't be tested until Phase 5

T032 says: *"When an appointment is marked 'no-show' (Phase 5), increment clients.no_show_count."* But T032 is in Phase 3, and the appointment system that triggers no-shows doesn't exist until Phase 5 (T053).

The no-show count column and display on the client profile can be built in Phase 3, but the increment trigger cannot be tested without appointments. This creates a task that looks "done" but is actually incomplete.

**Recommendation:** Split T032:
- Phase 3: add `no_show_count` column and display on client profile (already in T029)
- Phase 5: add the increment logic and the warning badge, as part of T053's acceptance criteria

Or move T032 entirely to Phase 5 and add the column display to T030.

---

### F9 — Secretary financial restriction is undefined at the implementation level

The business doc states: *"No access to financial data: cannot see revenue, employee pay, settlement records, or analytics."* But no task defines which routes, server actions, or UI sections must enforce this restriction. Individual tasks (T067, T069, T071–T076) implicitly assume admin-only access, but there's no explicit check.

**Recommendation:** Add secretary financial restriction as a cross-cutting acceptance criterion in T018 (session middleware). Define a list of route patterns that are admin-only and verify them in a single test.

---

### F10 — No data migration plan from existing spreadsheets

The business doc says the app replaces "manual spreadsheets and verbal coordination." There is no task for importing historical data (existing clients, past services, past payouts) into the new system. Starting from zero means:

- The client database has no history on day one
- No-show counts reset
- Analytics can't show any "vs prior period" comparisons for weeks

**Recommendation:** Add a task in Phase 10 (or Phase 3, specifically for client records) to import historical client data from existing spreadsheets. Even a partial import of the client list with phone/email would reduce friction on day one.

---

## Medium-severity findings

### F11 — No internationalization (i18n) consideration

The business is in Latin America. The UI language is never discussed. Questions:

- Should the UI be in Spanish? English? User-selectable?
- Should number formatting use commas or dots for decimals?
- Should dates be DD/MM/YYYY or MM/DD/YYYY?
- What currency is used? (Not specified anywhere — COP, USD, EUR?)

If the UI is built in English and needs to be Spanish later, it's a full-codebase refactor.

**Recommendation:** Decide the primary UI language and currency in Phase 0. If Spanish, set up `next-intl` or a similar i18n library as part of T001. At minimum, use a currency constant and date format utility from the start.

---

### F12 — Accessibility (a11y) not mentioned anywhere

No task mentions WCAG compliance, keyboard navigation, screen reader support, or colour contrast ratios. For an internal tool used by staff of varying technical ability, accessibility matters — especially for form-heavy screens used all day.

**Recommendation:** Add a11y as a standard in T002 (code standards): all form inputs must have labels, interactive elements must be keyboard-accessible, colour contrast must meet WCAG AA. Add a11y checks to the responsive QA pass in T083.

---

### F13 — Dependency graph has a phantom dependency (Phase 5 → Phase 6)

The mermaid dependency graph in `project-plan.md` shows `P5 → P6`. But looking at Phase 6's actual task dependencies:

- T057 depends on T029 (clients, Phase 3)
- T060 depends on T044 (batches, Phase 4B)
- No Phase 6 task depends on any Phase 5 task

The arrow from Phase 5 to Phase 6 is incorrect. Phase 6 can start as soon as Phase 4B is complete, regardless of Phase 5.

**Recommendation:** Remove the `P5 --> P6` edge from the mermaid diagram, or clarify which specific dependency justifies it.

---

### F14 — Missing `confirmation_sent_at` column in T049

T056 references recording `confirmation_sent_at` on the appointment record when a confirmation email is sent. But T049 (appointments table migration) does not include this field. The migration would need to be altered later.

**Recommendation:** Add `confirmation_sent_at` (nullable timestamp) to T049's table definition.

---

### F15 — Business day enforcement is "DB constraint or app-level guard" — should be DB constraint

T019 acceptance criteria say: *"Only one business day can be open at a time (DB constraint or app-level guard)."* For data integrity on a financial system, this must be a database constraint. App-level guards can be bypassed by bugs, race conditions, or direct DB access.

**Pattern:** A partial unique index on `business_days` where `closed_at IS NULL` — Postgres allows at most one row to match.

**Recommendation:** Change the AC from "DB constraint or app-level guard" to "DB constraint (partial unique index)."

---

### F16 — No task for database connection health or pooling documentation

Neon's serverless driver handles connection pooling, but Vercel Edge Functions and Serverless Functions have different connection behaviors. There's no documentation on:

- Which Neon driver to use in which context (`@neondatabase/serverless` vs `pg`)
- Connection limits on the free tier
- What happens when connections are exhausted

**Recommendation:** Document connection strategy in T005 acceptance criteria.

---

### F17 — Batch piece reassignment not handled

The business doc says: *"Cannot partially complete a piece or reassign it mid-batch."* But if a clothier is absent, their assigned pieces can't be completed. There's no "reassign piece" action for the admin/secretary.

**Recommendation:** Add a note that reassignment could be achieved by creating a new batch with the unfinished pieces. Or add a "reassign" action to T045/T047 if the business needs it.

---

## Low-severity findings

### F18 — `.gitignore` missing Turborepo cache

The `.gitignore` doesn't include `.turbo/` — Turborepo's local cache directory. This will be generated as soon as Phase 0 scaffolding begins.

**Recommendation:** Add `.turbo/` to `.gitignore` in T001.

---

### F19 — No task for Drizzle schema conventions

No task documents naming conventions for the database schema:

- Table names: `snake_case` plural (`employees`, `tickets`) — implied but not documented
- Column names: `snake_case` — implied but not documented
- Enum naming pattern
- Index naming pattern (e.g. `idx_tickets_business_day_id`)
- Timestamp convention (with or without timezone)

**Recommendation:** Add to T006 acceptance criteria: document schema naming conventions in a comment at the top of the first schema file.

---

### F20 — Soft-delete strategy is inconsistent

Some entities use `is_active` for soft-delete (services, clients, cloth pieces, employees). Others have no soft-delete mechanism (tickets, business days, batches, appointments). The strategy for when to use soft-delete vs hard-delete vs status-based archival is not documented.

**Recommendation:** Document the soft-delete policy in T002 (code standards). General guidance: use `is_active` for entities that appear in selectors and need to be "hidden" without losing references; use status fields for lifecycle entities (tickets, appointments, orders).

---

### F21 — Cloth piece catalog audit log is indirect

T027 acceptance criteria say: *"Audit log (T025 pattern) records price changes."* But T025 creates the `catalog_audit_log` table for services only. T027 would need to extend this table to also cover cloth pieces, or create a separate log. The dependency and shared table design should be explicit.

**Recommendation:** Clarify in T025 that the audit log table is generic (covers services AND cloth pieces), or add a separate migration note to T027.

---

### F22 — No performance budget or SLA targets

Apart from T030 (client search < 300ms) and T075 (analytics < 200ms), there are no performance targets. Missing:

- Page load time targets (e.g. LCP < 2.5s)
- API response time targets (e.g. P95 < 500ms)
- Real-time event delivery target (currently "within 2 seconds" for T036 only)
- Uptime SLA (99.5%? 99.9%?)

For an internal tool replacing spreadsheets, the bar is: "faster and more reliable than the spreadsheet." But documenting targets makes QA measurable.

**Recommendation:** Add performance targets to Phase 0 standards or the technical feasibility document.

---

### F23 — No explicit error handling pattern

There is no task or convention for how to handle errors:

- Server-side: throw vs return error objects
- Client-side: toast notifications vs inline errors vs error boundaries
- Financial operations: what happens on partial failure (e.g. payout record created but junction table insert fails)
- Network errors: retry policy for non-idempotent operations

**Recommendation:** Document the error handling pattern in T002 (code standards). For financial operations, wrap in database transactions (Drizzle supports this natively).

---

### F24 — Seed script (T011) should include realistic data for analytics testing

T011 creates one user per role. This is enough for development but not for testing analytics (T071–T076), which need weeks of data. T075 mentions "6 months of realistic seeded data" but doesn't say who creates this seed.

**Recommendation:** Add a separate `db:seed:analytics` script as a deliverable of T071 or T075 that generates 6 months of random but realistic business data.

---

### F25 — No task for version management or deployment notifications

The Senior PO review's risk register mentions: *"New app version deployed while cashier has an old tab open."* The Phase 10 mitigation ("version header + please refresh banner") is not captured as a numbered task. It should be.

**Recommendation:** Add a task to Phase 10 (or assign to an existing task like T084) for version detection and stale-tab notification.

---

## Summary of recommended changes

| # | Severity | Recommendation | Affects | Status |
|---|----------|---------------|---------|--------|
| F1 | Critical | Add testing infrastructure task to Phase 0 | Phase 0, all phases | **Requested** — T094 added |
| F2 | Critical | Add CI/CD pipeline task to Phase 0 | Phase 0 | **Requested** — T095 added |
| F3 | Critical | Decide money storage format in Phase 0 | Phase 0, T002 | **Requested** — integer cents; added to T002 |
| F4 | Critical | Document API design conventions in Phase 0 | Phase 0 | **Requested** — T097 added (separate task) |
| F5 | High | Reminder only — offline policy is already a Phase 0 exit criterion | — | Noted |
| F6 | High | Add real-time abstraction layer to T009 or new task | Phase 0 | **Requested** — T098 added (separate task) |
| F7 | High | Move Sentry to Phase 0/1; add structured logging | Phase 0, T085 | **Requested** — T085 moved to Phase 0 |
| F8 | High | Move T032 to Phase 5 or split it | Phase 3, Phase 5 | **Requested** — split: column in Phase 3, logic as T032b in Phase 5 |
| F9 | High | Define secretary financial restrictions in T018 | Phase 1, T018 | **Requested** — AC added to T018 |
| F10 | High | Add data migration task for existing client records | Phase 10 | **Requested** — T100 added to Phase 10 |
| F11 | Medium | Decide UI language and currency in Phase 0 | Phase 0 | **Requested** — bilingual (i18n); T099 added to Phase 0 |
| F12 | Medium | Add a11y to code standards (T002) and QA (T083) | Phase 0, Phase 10 | **Requested** — a11y baseline added to T002 and T083 |
| F13 | Medium | Fix dependency graph — remove P5 → P6 edge | project-plan.md | **Requested** — graph fixed |
| F14 | Medium | Add `confirmation_sent_at` to T049 | Phase 5 | **Requested** — column added to T049 |
| F15 | Medium | Change T019 AC to require DB constraint, not optional | Phase 1 | **Requested** — AC updated |
| F16 | Medium | Document connection pooling strategy in T005 | Phase 0 | **Requested** — AC added to T005 |
| F17 | Medium | Clarify batch piece reassignment policy | Phase 4B | **Requested** — reassignment note added to T045 |
| F18 | Low | Add `.turbo/` to `.gitignore` | .gitignore | **Requested** — added to .gitignore |
| F19 | Low | Document schema naming conventions in T006 | Phase 0 | **Requested** — AC added to T006 |
| F20 | Low | Document soft-delete policy in T002 | Phase 0 | **Requested** — AC added to T002 |
| F21 | Low | Clarify audit log scope in T025 | Phase 2 | **Requested** — T025 clarified as generic table |
| F22 | Low | Add performance targets to standards | Phase 0 | **Requested** — AC added to T002 |
| F23 | Low | Document error handling pattern in T002 | Phase 0 | **Requested** — AC added to T002 |
| F24 | Low | Add analytics seed script to T071/T075 | Phase 8 | **Requested** — T101 added |
| F25 | Low | Add stale-tab version detection task to Phase 10 | Phase 10 | **Requested** — T102 added |

**All 25 findings accepted.** Task count: 94 → 103 (+T094, +T095, +T097, +T098, +T099, +T032b, +T100, +T101, +T102; T085 moved Phase 10 → Phase 0). Multiple existing tasks received additional acceptance criteria.

---

---

## Tech stack review (second pass — April 2026)

### Base UI (Base Web) — high risk, consider alternatives

Base Web (`baseui`) by Uber has been in **maintenance mode** with declining npm activity and community engagement. Known issues:

- **Styletron dependency** — the CSS-in-JS engine Base Web uses (`styletron-react`) has compatibility concerns with React Server Components and the Next.js App Router. Most CSS-in-JS solutions require `"use client"` boundaries, which limits RSC usage.
- **No active development** — no major releases in 2025–2026; the Uber team has not indicated a roadmap.
- **Small community** — fewer resources, plugins, and third-party integrations compared to alternatives.

The T008 spike will surface these issues, but there should be a **documented fallback** if the spike fails.

**Recommended alternative: shadcn/ui + Tailwind CSS**

| | Base Web | shadcn/ui |
|--|----------|-----------|
| **Architecture** | npm package (vendor-owned) | Copy-paste components (you own the code) |
| **Styling** | Styletron (CSS-in-JS) | Tailwind CSS (utility classes) |
| **RSC compatibility** | Uncertain (CSS-in-JS conflicts) | Excellent (no runtime CSS) |
| **Accessibility** | Good (Uber's a11y team) | Excellent (built on Radix UI primitives) |
| **Customization** | Theme overrides | Full source code ownership |
| **App Router support** | Needs validation | Native — designed for App Router |
| **Community** | Declining | Fastest-growing React component system |
| **Lock-in** | Medium (npm dependency) | None (you own the components) |

**Action:** If the T008 spike reveals issues (hydration mismatches, build errors, excessive `"use client"` wrappers), switch to shadcn/ui + Tailwind CSS. Add this as the documented fallback in T008's acceptance criteria.

---

### Missing from stack: client-side state management

No state management library is mentioned. React Server Components + Server Actions handle most data fetching, but the following need client-side state:

- **Real-time dashboard** (T036) — tickets update live, need local state synchronization
- **Offline mutation queue** (T079) — IndexedDB queue state must be accessible from React
- **Notification bell** (T048) — unread count must update without page reload
- **Form state** — multi-step forms (checkout, payout) need ephemeral state

**Recommendation:** Standardize on **TanStack Query (React Query)** for server state caching and revalidation, plus **Zustand** for ephemeral UI state (offline queue, notification count). Both are lightweight and work well with Server Components. Document in T097 (API conventions).

---

### Missing from stack: form handling library

The app is heavily form-based (employee creation, catalog CRUD, checkout, payout, appointments). No form library is specified. Without one, each form will have different validation timing, error display, and state management patterns.

**Recommendation:** Standardize on **React Hook Form + Zod resolver**. Zod is already chosen for API validation (T002); using the same schemas for client-side form validation creates a single source of truth for validation rules. Document in T097.

---

### Missing from stack: date/time library

The app has extensive date handling:
- Business days spanning midnight
- Appointment scheduling with time slots and duration
- Payroll periods by business day ranges
- Analytics by week/month with period comparison
- Absence calendar by date

No date library is specified. JavaScript's native `Date` object is error-prone for timezone-aware operations, date arithmetic, and formatting.

**Recommendation:** Standardize on **date-fns** — tree-shakeable, immutable, works with native Date objects (no wrapper class). Alternatively, **Luxon** if timezone manipulation is heavy (business day open at 6 AM, close at 2 AM next day). Document in T002 or T097.

---

### `next-pwa` maintenance concern

The plan mentions `next-pwa` for Phase 9 (offline/PWA). This package has had **maintenance gaps** — the community fork `@ducanh2912/next-pwa` is more actively maintained for Next.js 14+. Alternatively, a custom Workbox configuration without `next-pwa` gives full control.

**Recommendation:** In T081, evaluate `@ducanh2912/next-pwa` or a custom Workbox setup. Do not commit to the original `next-pwa` without verifying it supports the Next.js version in use.

---

### Summary of tech stack recommendations

| Area | Current | Recommendation | Priority | Status |
|------|---------|---------------|----------|--------|
| UI components | Base Web (baseui) | Document shadcn/ui as T008 fallback | High | **Applied** — T008 updated with spike + fallback gate |
| Server state | Not specified | TanStack Query | Medium | **Applied** — added to T002 standards + T097 |
| UI state | Not specified | Zustand | Medium | **Applied** — added to T002 standards + T097 |
| Forms | Not specified | React Hook Form + Zod | Medium | **Applied** — added to T002 standards + T097 |
| Dates | Not specified | date-fns | Medium | **Applied** — added to T002 standards |
| PWA wrapper | next-pwa | Evaluate @ducanh2912/next-pwa or custom Workbox | Low (Phase 9) | **Applied** — T081 updated |

---

## Consistency fixes applied (second review pass)

The following issues were introduced during the first review's edits and corrected in this pass:

1. **T023 AC** — still said "decide once and document" for money format; updated to reference the integer cents decision from T002
2. **T032 title in progress.md** — said "No-show count tracking" but was renamed to "No-show count display" in the task file; synced
3. **T053 AC** — referenced "via T032" for no-show increment; corrected to "via T032b" (the split task)
4. **Pusher references in Phase 4A+** — T035, T036, T037, T038, T042, T048, T093 all referenced "Pusher" directly; updated to "real-time event (T098 abstraction)" to align with the abstraction layer
5. **T036 and T048 dependencies** — listed T009 (Pusher spike) directly; corrected to T098 (real-time abstraction layer, which depends on T009)
6. **Phase 5 description in project-plan.md** — said "Manual confirmed toggle; external channel deferred" but T055/T056 implement email confirmation; corrected
7. **Resolved decision "Real-time dashboard"** — said "Live (WebSocket or SSE)"; corrected to the actual decision (Pusher via abstraction layer)

---

## What is already done well

For completeness, these are the things the project has handled better than most:

1. **Docs-first approach** — business requirements are written before code. This is rare and valuable.
2. **Phased delivery with clear exit criteria** — each phase has testable conditions for "done."
3. **Dependency tracking per task** — explicit task-level dependencies prevent hidden blockers.
4. **Senior PO review already performed** — the 11 findings caught the worst ordering and scoping issues.
5. **Research docs with clear recommendations** — vendor choices are documented with pros, cons, and a decision rationale.
6. **Idempotency designed in from Phase 0** — most projects retrofit this in production. This plan gets it right.
7. **Price and commission snapshotting** — T034 snapshots catalog values at ticket creation time. This prevents historical data corruption when prices change.
8. **Business day abstraction** — decoupling business days from calendar dates is the right call for a business that operates past midnight.
9. **Split payment support** — designed into the schema from the start, not bolted on later.
10. **Free-tier-first strategy** — all infrastructure costs $0/month for MVP. No premature spending.
