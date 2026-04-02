# Phase 0 — Foundation

> Goal: working repo, DB connected, offline policy decided, empty role-aware shell deployed to staging. Nothing user-visible beyond a login screen.

---

## T001 — Initialize Next.js monorepo with Turborepo

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** none

### What to do
Scaffold a Turborepo monorepo with one Next.js application (`apps/web`) using the App Router. Add a `packages/` directory for shared TypeScript types and utilities.

### Acceptance criteria
- [ ] `turbo build` runs without errors
- [ ] `apps/web` starts in development mode
- [ ] `packages/types` exists and is importable from `apps/web`
- [ ] TypeScript strict mode enabled in all packages

---

## T002 — Configure code quality tooling

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do
Add ESLint (Next.js config), Prettier, and a shared config package. Add a pre-commit hook (Husky + lint-staged) that runs lint and format checks. Also document the input validation policy: all API/server action inputs must be validated with Zod schemas before reaching business logic.

### Acceptance criteria
- [ ] `turbo lint` passes on a clean repo
- [ ] `turbo format` formats all files
- [ ] Pre-commit hook blocks commits with lint errors
- [ ] `docs/standards.md` note added: Zod validation required on all server-side inputs
- [ ] `docs/standards.md` includes money storage convention: **all monetary values stored as integer cents** (`bigint`); display layer converts to decimal for the user. No `numeric` or `float` types for money.
- [ ] `docs/standards.md` includes soft-delete policy: use `is_active` for entities that appear in selectors (services, clients, employees, cloth pieces); use status fields for lifecycle entities (tickets, appointments, orders); document when hard-delete is allowed (never for financial records)
- [ ] `docs/standards.md` includes error handling pattern: server-side uses typed result objects (not thrown errors) for expected failures; financial operations wrapped in DB transactions; client-side shows toast notifications for action results and inline errors for form validation
- [ ] `docs/standards.md` includes accessibility baseline: all form inputs must have associated labels; interactive elements must be keyboard-accessible; colour contrast must meet WCAG AA (4.5:1 for normal text); focus indicators must be visible
- [ ] `docs/standards.md` includes performance targets: LCP < 2.5 s; API P95 < 500 ms; real-time event delivery < 2 s; client search < 300 ms; analytics queries < 500 ms (< 200 ms after index optimization in T075)
- [ ] `docs/standards.md` includes standard libraries: **React Hook Form + Zod resolver** for all forms (same Zod schemas used for server-side validation); **TanStack Query** for server state caching and revalidation; **Zustand** for ephemeral client-side state (offline queue, notification count); **date-fns** for all date manipulation, formatting, and comparison (no native `Date` arithmetic)

---

## T003 — Environment variable schema

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do
Create `.env.example` with all required environment variable keys (no values). Add runtime validation using `zod` or `@t3-oss/env-nextjs` so the app fails fast on missing variables.

### Acceptance criteria
- [ ] `.env.example` lists all required vars with inline comments
- [ ] App throws a clear error on startup if a required var is missing
- [ ] `.env` and `.env*.local` are in `.gitignore`

---

## T004 — Vercel project setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do
Create a Vercel project connected to the git repository. Configure the build command (`turbo build --filter=web`), output directory, and staging environment (preview deployments on every PR).

### Acceptance criteria
- [ ] Push to `main` triggers a production deploy
- [ ] Pull requests get a unique preview URL
- [ ] Environment variables added in Vercel dashboard match `.env.example`

---

## T005 — Neon Postgres setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T004

### What to do
Create a Neon project (free tier). Add the database URL to Vercel environment variables. Create a `dev` branch in Neon for local development and a `staging` branch for preview deploys.

### Acceptance criteria
- [ ] `apps/web` can connect to Neon in local dev
- [ ] Preview deploys connect to the Neon `staging` branch
- [ ] Production connects to the Neon `main` branch
- [ ] Connection uses Neon's serverless driver (`@neondatabase/serverless`)
- [ ] Connection strategy documented: which driver to use in Edge Functions vs Serverless Functions; free-tier connection limits noted; what happens when connections are exhausted (error handling, not silent failure)

---

## T006 — Drizzle ORM setup and migration workflow

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T005

### What to do
Install and configure Drizzle ORM with the Neon serverless adapter. Set up `drizzle-kit` for migrations. Add a `db:migrate` script and a `db:studio` script for the Drizzle visual editor.

### Acceptance criteria
- [ ] `npm run db:migrate` applies pending migrations to the target DB
- [ ] `npm run db:studio` opens Drizzle Studio connected to the local/dev DB
- [ ] Schema files live in `packages/db/src/schema/`
- [ ] An empty initial migration runs successfully against Neon
- [ ] Schema naming conventions documented at the top of the first schema file: table names `snake_case` plural (e.g. `employees`); column names `snake_case`; enums named `{entity}_{field}_enum`; indexes named `idx_{table}_{columns}`; all timestamps use `timestamp with time zone`

---

## T007 — Better Auth spike and integration

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T006

### What to do
Install Better Auth and configure it with the Postgres adapter pointing to the Neon DB. Verify that the RBAC plugin works with the role model needed (cashier/admin, secretary, stylist, clothier). Verify Better Auth's built-in rate limiting protects the login endpoint against brute force. Create the auth tables migration.

### Acceptance criteria
- [ ] Better Auth creates its required tables via migration (users, sessions, accounts)
- [ ] RBAC plugin supports custom roles without workarounds
- [ ] A test login (admin user seeded) works end-to-end
- [ ] Session is accessible in Next.js Server Components and API routes
- [ ] Login endpoint is rate-limited (confirm Better Auth's default limits or configure explicitly)

---

## T008 — UI component library spike

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do
Evaluate the UI component library. **Primary candidate:** Base Web (`baseui`) + Styletron. **Fallback:** shadcn/ui + Tailwind CSS (if Base Web fails the spike).

**Step 1 — Base Web spike (timebox: 2 hours):** Install Base Web and its peer dependency (`styletron-react`). Render one representative component (e.g. a Button and a Table) inside the Next.js App Router. Confirm there are no SSR hydration mismatches or build errors. Check how many components require `"use client"` wrappers — if most do, RSC benefits are lost.

**Step 2 — Decision gate:** If Base Web passes all criteria below, use it. If it fails any criterion (hydration errors, excessive `"use client"` wrappers, build failures, Styletron incompatibilities), switch to the fallback.

**Step 3 — Fallback (if needed):** Install Tailwind CSS + shadcn/ui CLI. Initialize a few core components (Button, Input, Table, Dialog). Confirm they render correctly in the App Router.

### Acceptance criteria
- [ ] Chosen library's components render without errors in development
- [ ] No hydration mismatch warnings in the browser console
- [ ] Production build (`next build`) completes without component-library-related errors
- [ ] Document any workarounds needed (e.g. `"use client"` boundaries) in `docs/research/ui-library-spike.md`
- [ ] If Base Web requires `"use client"` on more than 50% of usage sites, switch to shadcn/ui fallback
- [ ] Decision documented: which library was chosen and why. All subsequent tasks use this library.

---

## T009 — Pusher free tier spike

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001, T004

### What to do
Create a Pusher account (free tier). Install `pusher` (server SDK) and `pusher-js` (client). Trigger a test event from a Next.js API route and receive it in a React component. Confirm it works on a Vercel preview deploy.

### Acceptance criteria
- [ ] Server can publish an event via Pusher in a Route Handler
- [ ] Client receives the event in real time without page refresh
- [ ] Works on a Vercel preview deploy (not just local) — requires T004 to be complete
- [ ] Pusher keys stored in environment variables (not hardcoded)

---

## T010 — RBAC role definitions

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T007

### What to do
Define the role enum and subtype enum in the shared `packages/types` package and in the Better Auth configuration. Roles: `admin`, `secretary`, `stylist`, `clothier`. Stylist subtypes: `manicurist`, `spa_manager`, `hairdresser`, `masseuse`, `makeup_artist`.

### Acceptance criteria
- [ ] Role and stylist-subtype enums exported from `packages/types`
- [ ] Better Auth RBAC configured to use these roles
- [ ] Middleware redirects unauthenticated users to login
- [ ] Each role gets a placeholder home screen (empty, just a heading) after login

---

## T011 — Seed script for development

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T010

### What to do
Create a `db:seed` script that inserts one user per role into the dev DB so developers can log in as any role without manual setup.

### Acceptance criteria
- [ ] `npm run db:seed` runs without errors and is idempotent (safe to run multiple times)
- [ ] One admin, one secretary, one clothier, and one stylist (each subtype) are seeded
- [ ] Seed passwords documented in `.env.example` comments (dev-only)

---

## T077 — Offline policy document

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** none

### What to do
Write `docs/research/offline-policy.md` defining which actions are offline-capable and which are online-only. This must be agreed before Phase 4A APIs are built so idempotency is designed in, not retrofitted.

Canonical decisions (confirm with business stakeholder):
- **Offline-capable:** ticket creation (`logged` status), piece mark-done.
- **Online-only:** checkout/payment, payout recording, catalog edits, business day open/close.

Include: what happens to queued actions if the business day closes while the device is offline.

### Acceptance criteria
- [ ] Document at `docs/research/offline-policy.md`
- [ ] Every user-initiated action in the app is listed with its offline classification
- [ ] Business stakeholder has signed off (record the date and name in the document)
- [ ] Document reviewed before Phase 4A task planning begins

---

## T085 — Sentry error tracking setup

**Phase:** 0 — Foundation *(moved from Phase 10)*
**Status:** pending
**Dependencies:** T004

### What to do
Install `@sentry/nextjs` and configure it for the Vercel deployment. Set up a free-tier Sentry project. Capture unhandled errors on both client and server. Add a custom error boundary around the main app shell. Moving this to Phase 0 ensures observability from the first deployed feature, saving debugging time across all subsequent phases.

### Acceptance criteria
- [ ] Sentry DSN added to Vercel environment variables
- [ ] A test error (`throw new Error("test")`) appears in the Sentry dashboard
- [ ] Source maps uploaded so stack traces show original TypeScript line numbers
- [ ] PII (client names, emails) is scrubbed from Sentry events (configure `beforeSend`)

---

## T094 — Testing infrastructure

**Phase:** 0 — Foundation *(new — Senior SWE review F1)*
**Status:** pending
**Dependencies:** T001

### What to do
Set up the testing stack: **Vitest** for unit and integration tests, **Playwright** for E2E tests. Add `turbo test` and `turbo test:e2e` pipelines. Document the testing policy: every task that implements business logic (earnings computation, status transitions, permissions) must include unit tests. E2E tests are required for critical flows starting in Phase 4A (checkout).

### Acceptance criteria
- [ ] `vitest` configured with TypeScript support and path aliases matching `tsconfig`
- [ ] `playwright` configured with at least one smoke test (loads the login page)
- [ ] `turbo test` runs all Vitest tests across the monorepo
- [ ] `turbo test:e2e` runs Playwright tests against a local dev server
- [ ] `docs/standards.md` includes testing policy: unit tests required for business logic; E2E tests required for checkout and payroll flows

---

## T095 — CI/CD pipeline

**Phase:** 0 — Foundation *(new — Senior SWE review F2)*
**Status:** pending
**Dependencies:** T094, T002

### What to do
Create a GitHub Actions workflow that runs on every pull request: `turbo lint`, `turbo typecheck`, `turbo test`. Block PR merges if any step fails (require status checks in branch protection rules). Optionally run Playwright E2E tests against the Vercel preview deploy.

### Acceptance criteria
- [ ] `.github/workflows/ci.yml` exists and runs on every PR to `main`
- [ ] Pipeline runs lint, typecheck, and unit tests
- [ ] PR merge is blocked if any check fails (branch protection configured)
- [ ] Pipeline completes in < 5 minutes on a clean repo
- [ ] Workflow uses caching for `node_modules` and Turborepo cache

---

## T097 — API design conventions document

**Phase:** 0 — Foundation *(new — Senior SWE review F4)*
**Status:** pending
**Dependencies:** T001

### What to do
Write `docs/standards-api.md` defining the API conventions used throughout the project. Cover: Server Actions vs REST API routes (when to use each), standard error response shape, pagination pattern (cursor-based or offset), Zod validation error formatting for the client, and request/response typing strategy using shared packages.

### Acceptance criteria
- [ ] Document at `docs/standards-api.md`
- [ ] Decision: Server Actions for mutations, API routes for real-time and external integrations (or alternative — documented)
- [ ] Standard error shape defined (e.g. `{ success: false, error: { code: string, message: string } }`)
- [ ] Pagination pattern defined with an example
- [ ] Zod validation errors formatted as `{ field: string, message: string }[]`
- [ ] Server state caching pattern documented: use **TanStack Query** for GET-derived data; invalidate queries after mutations; define stale times for common data (catalog: 5 min, tickets: 0 / real-time)
- [ ] Form pattern documented: use **React Hook Form** + `zodResolver`; share Zod schemas between client and server via `packages/types`
- [ ] Client state pattern documented: use **Zustand** for ephemeral UI state (e.g. offline queue count, sidebar open/close); do not use Zustand for server-derived data

---

## T098 — Real-time abstraction layer

**Phase:** 0 — Foundation *(new — Senior SWE review F6)*
**Status:** pending
**Dependencies:** T009

### What to do
Create a thin abstraction layer around the real-time transport (Pusher) so that migrating to native SSE + Postgres LISTEN/NOTIFY later does not require touching every file that uses real-time events. The abstraction lives in `packages/realtime/`.

### Acceptance criteria
- [ ] Server export: `publishEvent(channel: string, event: string, data: unknown)` — calls Pusher internally
- [ ] Client export: `useRealtimeEvent(channel: string, event: string, callback: (data) => void)` — subscribes via Pusher internally
- [ ] All Phase 4A+ tasks use the abstraction, never Pusher SDK directly
- [ ] Switching the underlying transport requires changes only in `packages/realtime/`, not in consuming code
- [ ] Types for channel names and event names are centralized (string literal union or enum)

---

## T099 — Internationalization (i18n) setup

**Phase:** 0 — Foundation *(new — Senior SWE review F11)*
**Status:** pending
**Dependencies:** T001

### What to do
Set up `next-intl` (or equivalent) for bilingual support (Spanish + English). Spanish is the primary locale; English is secondary. Create the translation file structure and a helper for currency formatting using the project's currency (define which currency — e.g. COP, USD). All user-facing strings from Phase 1 onward must use the translation system, not hardcoded text.

### Acceptance criteria
- [ ] `next-intl` installed and configured with Next.js App Router
- [ ] Translation files at `messages/es.json` and `messages/en.json` with a few sample keys
- [ ] Locale switcher component exists (can be hidden for MVP if only Spanish is active)
- [ ] Currency constant defined (confirm with stakeholder: COP, USD, or other)
- [ ] Currency formatting utility: `formatMoney(cents: number)` → localized display string (e.g. "$12.500" for COP or "$125.00" for USD)
- [ ] Date formatting utility using the i18n locale (DD/MM/YYYY for Spanish)
