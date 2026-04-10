# Phase 0 — Foundation

> Goal: working repo, DB connected, offline policy decided, empty role-aware shell deployed to staging. Nothing user-visible beyond a login screen.
>
> **Split into two sub-phases** (H-01 resolution, April 2026):
>
> - **Phase 0A (Infrastructure):** T001, T003, T004, T005, T006, T007, T008, T009, T010, T011, T085, T094, T095 — core tooling, DB, auth, spikes (SSE), CI. Deliver first.
> - **Phase 0B (Standards & Design):** T002, T077, T097, T098, T099, T103, T104 — conventions, design system, wireframes. Can begin once T001 and T008 are complete.

---

## T001 — Initialize Next.js monorepo with Turborepo

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** none

### What to do

Scaffold a Turborepo monorepo with one Next.js application (`apps/web`) using the App Router. Add a `packages/` directory for shared TypeScript types and utilities.

### Acceptance criteria

- `turbo build` runs without errors
- `apps/web` starts in development mode
- `packages/types` exists and is importable from `apps/web`
- TypeScript strict mode enabled in all packages

---

## T002 — Configure code quality tooling

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Add ESLint (Next.js config), Prettier, and a shared config package. Add a pre-commit hook (Husky + lint-staged) that runs lint and format checks. Also document the input validation policy: all API/server action inputs must be validated with Zod schemas before reaching business logic.

### Acceptance criteria

- `turbo lint` passes on a clean repo
- `turbo format` formats all files
- Pre-commit hook blocks commits with lint errors
- `docs/standards.md` note added: Zod validation required on all server-side inputs
- `docs/standards.md` includes money storage convention: **all monetary values stored as integer cents** (`bigint`); display layer converts to decimal for the user. No `numeric` or `float` types for money.
- `docs/standards.md` includes soft-delete policy: use `is_active` for entities that appear in selectors (services, clients, employees, cloth pieces); use status fields for lifecycle entities (tickets, appointments, orders); document when hard-delete is allowed (never for financial records)
- `docs/standards.md` includes error handling pattern: server-side uses typed result objects (not thrown errors) for expected failures; financial operations wrapped in DB transactions; client-side shows toast notifications for action results and inline errors for form validation
- `docs/standards.md` includes accessibility baseline: all form inputs must have associated labels; interactive elements must be keyboard-accessible; colour contrast must meet WCAG AA (4.5:1 for normal text); focus indicators must be visible
- `docs/standards.md` includes performance targets: LCP < 2.5 s; API P95 < 500 ms; real-time event delivery < 2 s; client search < 300 ms; analytics queries < 500 ms (< 200 ms after index optimization in T075)
- `docs/standards.md` includes standard libraries: **React Hook Form + Zod resolver** for all forms (same Zod schemas used for server-side validation); **TanStack Query** for server state caching and revalidation; **Zustand** for ephemeral client-side state (offline queue, notification count); **date-fns** for all date manipulation, formatting, and comparison (no native `Date` arithmetic). See `docs/research/frontend-libraries.md` for full rationale.
- `docs/standards.md` includes financial rounding policy: **banker's rounding (round half-even)** for all financial calculations. `commission_pct` precision = `numeric(5,2)`. All monetary values stored as integer pesos (COP has no cents).
- `docs/standards.md` includes business timezone constant: **America/Bogota (UTC-5)**. All timestamps stored in UTC; all user-facing displays converted to business timezone regardless of device locale.
- `eslint-plugin-jsx-a11y` added to ESLint configuration for automated accessibility linting
- `docs/standards.md` includes form UX conventions: stacked labels (better for mobile and a11y); validate on blur for fields, on submit for full form; inline errors under each field (red text, aria-associated); required fields by default, mark optional with "(optional)" suffix; success feedback via toast + redirect
- `docs/standards.md` includes mobile-first policy: **clothier and stylist screens must be designed and tested mobile-first** (phone is their primary device); desktop layout is the secondary adaptation for these roles. Admin and secretary screens may be desktop-first.
- `docs/standards.md` includes loading pattern policy: all screens must implement basic loading states (skeleton or spinner) from Phase 1 onward — not deferred to Phase 10. Use the `LoadingSkeleton` component from T103.

---

## T003 — Environment variable schema

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Create `.env.example` with all required environment variable keys (no values). Add runtime validation using `zod` or `@t3-oss/env-nextjs` so the app fails fast on missing variables.

### Acceptance criteria

- `.env.example` lists all required vars with inline comments
- App throws a clear error on startup if a required var is missing
- `.env` and `.env*.local` are in `.gitignore`

---

## T004 — Vercel project setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Create a Vercel project connected to the git repository. Configure the build command (`turbo build --filter=web`), output directory, and staging environment (preview deployments on every PR).

### Acceptance criteria

- Push to `main` triggers a production deploy
- Pull requests get a unique preview URL
- Environment variables added in Vercel dashboard match `.env.example`

---

## T005 — Neon Postgres setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T004

### What to do

Create a Neon project (free tier). Add the database URL to Vercel environment variables. Create a `dev` branch in Neon for local development and a `staging` branch for preview deploys.

### Acceptance criteria

- `apps/web` can connect to Neon in local dev
- Preview deploys connect to the Neon `staging` branch
- Production connects to the Neon `main` branch
- Connection uses Neon's serverless driver (`@neondatabase/serverless`)
- Connection strategy documented: which driver to use in Edge Functions vs Serverless Functions; free-tier connection limits noted; what happens when connections are exhausted (error handling, not silent failure)

---

## T006 — Drizzle ORM setup and migration workflow

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T005

### What to do

Install and configure Drizzle ORM with the Neon serverless adapter. Set up `drizzle-kit` for migrations. Add a `db:migrate` script and a `db:studio` script for the Drizzle visual editor.

### Acceptance criteria

- `npm run db:migrate` applies pending migrations to the target DB
- `npm run db:studio` opens Drizzle Studio connected to the local/dev DB
- Schema files live in `packages/db/src/schema/`
- An empty initial migration runs successfully against Neon
- Schema naming conventions documented at the top of the first schema file: table names `snake_case` plural (e.g. `employees`); column names `snake_case`; enums named `{entity}_{field}_enum`; indexes named `idx_{table}_{columns}`; all timestamps use `timestamp with time zone`
- Shared enums defined once and referenced by multiple tables: `payment_method_enum` (`cash` | `card` | `transfer`) used by `ticket_payments` (T039), `large_order_payments` (T057), and `payouts` (T066) — not redefined independently in each migration
- Migration rollback testing: every migration must be verified as reversible (down migration exists and runs without errors). CI pipeline verifies that seed records survive a migrate-up → migrate-down → migrate-up cycle.

---

## T007 — Better Auth spike and integration

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T006

### What to do

Install Better Auth and configure it with the Postgres adapter pointing to the Neon DB. Verify that the RBAC plugin works with the role model needed (cashier/admin, secretary, stylist, clothier). Verify Better Auth's built-in rate limiting protects the login endpoint against brute force. Create the auth tables migration.

### Acceptance criteria

- Better Auth creates its required tables via migration (users, sessions, accounts)
- RBAC plugin supports custom roles without workarounds
- A test login (admin user seeded) works end-to-end
- Session is accessible in Next.js Server Components and API routes
- Login endpoint is rate-limited (confirm Better Auth's default limits or configure explicitly)

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

- Chosen library's components render without errors in development
- No hydration mismatch warnings in the browser console
- Production build (`next build`) completes without component-library-related errors
- Document any workarounds needed (e.g. `"use client"` boundaries) in `docs/research/ui-library-spike.md`
- If Base Web requires `"use client"` on more than 50% of usage sites, switch to shadcn/ui fallback
- Decision documented: which library was chosen and why. All subsequent tasks use this library.

---

## T009 — SSE (Server-Sent Events) spike

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001, T004

### What to do

Validate that native SSE works end-to-end in Next.js App Router on Vercel. Create a Route Handler that streams `text/event-stream` responses. Subscribe in a React component using the browser's native `EventSource` API. Confirm reconnection behavior when the connection drops. **Pusher is not used** — SSE is the chosen real-time transport (free, no third-party service, sufficient for one-way server→client push).

### Acceptance criteria

- Route Handler streams SSE events (`text/event-stream`) from the server
- React component receives events via `EventSource` without page refresh
- Automatic reconnection works when the connection drops (browser `EventSource` built-in)
- Works on a Vercel preview deploy (not just local) — requires T004 to be complete
- Vercel SSE timeout behavior documented: Vercel Functions have a max duration; strategy for long-lived connections documented (e.g. client reconnects every N minutes)
- No environment variables needed (no third-party service)

---

## T010 — RBAC role definitions

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T007

### What to do

Define the role enum and subtype enum in the shared `packages/types` package and in the Better Auth configuration. Roles: `admin`, `secretary`, `stylist`, `clothier`. Stylist subtypes: `manicurist`, `spa_manager`, `hairdresser`, `masseuse`, `makeup_artist`.

### Acceptance criteria

- Role and stylist-subtype enums exported from `packages/types`
- Better Auth RBAC configured to use these roles
- Middleware redirects unauthenticated users to login
- Each role gets a placeholder home screen (empty, just a heading) after login

---

## T011 — Seed script for development

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T010

### What to do

Create a `db:seed` script that inserts one user per role into the dev DB so developers can log in as any role without manual setup.

### Acceptance criteria

- `npm run db:seed` runs without errors and is idempotent (safe to run multiple times)
- One admin, one secretary, one clothier, and one stylist (each subtype) are seeded
- Seed passwords documented in `.env.example` comments (dev-only)

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

- Document at `docs/research/offline-policy.md`
- Every user-initiated action in the app is listed with its offline classification
- Business stakeholder has signed off (record the date and name in the document)
- Document reviewed before Phase 4A task planning begins

---

## T085 — Sentry error tracking setup

**Phase:** 0 — Foundation _(moved from Phase 10)_
**Status:** pending
**Dependencies:** T004

### What to do

Install `@sentry/nextjs` and configure it for the Vercel deployment. Set up a free-tier Sentry project. Capture unhandled errors on both client and server. Add a custom error boundary around the main app shell. Moving this to Phase 0 ensures observability from the first deployed feature, saving debugging time across all subsequent phases.

### Acceptance criteria

- Sentry DSN added to Vercel environment variables
- A test error (`throw new Error("test")`) appears in the Sentry dashboard
- Source maps uploaded so stack traces show original TypeScript line numbers
- PII (client names, emails) is scrubbed from Sentry events (configure `beforeSend`)
- Structured business logic logging configured (pino or similar): every financial operation (ticket close, payout recording, payment recording) logs operation type, actor, amount in COP, affected entities, and timestamp. These logs are separate from error tracking — they serve as an audit trail for "things that worked but might be wrong."

---

## T094 — Testing infrastructure

**Phase:** 0 — Foundation _(new — Senior SWE review F1)_
**Status:** pending
**Dependencies:** T001

### What to do

Set up the testing stack: **Vitest** for unit and integration tests, **Playwright** for E2E tests. Add `turbo test` and `turbo test:e2e` pipelines. Document the testing policy: every task that implements business logic (earnings computation, status transitions, permissions) must include unit tests. E2E tests are required for critical flows starting in Phase 4A (checkout).

### Acceptance criteria

- `vitest` configured with TypeScript support and path aliases matching `tsconfig`
- `playwright` configured with at least one smoke test (loads the login page)
- `turbo test` runs all Vitest tests across the monorepo
- `turbo test:e2e` runs Playwright tests against a local dev server
- `docs/standards.md` includes testing policy: unit tests required for business logic; E2E tests required for checkout and payroll flows
- Regression testing strategy defined: regression suite runs on every PR; regression scope documented per shared table (see `docs/testing/README.md`)
- Test data management strategy defined: transaction-based isolation (rollback after each test); scenario-specific fixtures with pre-calculated expected results in COP (see `docs/testing/README.md`)
- Code coverage reporting enabled via Vitest (c8/istanbul): 80% threshold enforced for `packages/db/src/queries/` (financial logic); no global coverage threshold
- `axe-core` integrated with Playwright for automated accessibility checks on all E2E tests
- `eslint-plugin-jsx-a11y` configured in the shared ESLint config (catches a11y issues at dev time)

---

## T095 — CI/CD pipeline

**Phase:** 0 — Foundation _(new — Senior SWE review F2)_
**Status:** pending
**Dependencies:** T094, T002

### What to do

Create a GitHub Actions workflow that runs on every pull request: `turbo lint`, `turbo typecheck`, `turbo test`. Block PR merges if any step fails (require status checks in branch protection rules). Optionally run Playwright E2E tests against the Vercel preview deploy.

### Acceptance criteria

- `.github/workflows/ci.yml` exists and runs on every PR to `main`
- Pipeline runs lint, typecheck, and unit tests
- PR merge is blocked if any check fails (branch protection configured)
- Pipeline completes in < 5 minutes on a clean repo
- Workflow uses caching for `node_modules` and Turborepo cache
- Post-deployment smoke test: after Vercel deploys a preview or production build, a Playwright suite runs against the deployed URL — loads login page (app shell works), logs in as admin (auth works), hits `/api/health` (DB works). Once Phase 4A is complete, extends to: create and close a ticket (core flow works).
- Security tests (RBAC negative tests from `docs/testing/rbac-matrix.md`) included in the PR check pipeline

---

## T097 — API design conventions document

**Phase:** 0 — Foundation _(new — Senior SWE review F4)_
**Status:** pending
**Dependencies:** T001

### What to do

Write `docs/standards-api.md` defining the API conventions used throughout the project. Cover: Server Actions vs REST API routes (when to use each), standard error response shape, pagination pattern (cursor-based or offset), Zod validation error formatting for the client, and request/response typing strategy using shared packages.

### Acceptance criteria

- Document at `docs/standards-api.md`
- Decision: Server Actions for mutations, API routes for real-time and external integrations (or alternative — documented)
- Standard error shape defined (e.g. `{ success: false, error: { code: string, message: string } }`)
- Pagination pattern defined with an example
- Zod validation errors formatted as `{ field: string, message: string }[]`
- Server state caching pattern documented: use **TanStack Query** for GET-derived data; invalidate queries after mutations; define stale times for common data (catalog: 5 min, tickets: 0 / real-time)
- Form pattern documented: use **React Hook Form** + `zodResolver`; share Zod schemas between client and server via `packages/types`
- Client state pattern documented: use **Zustand** for ephemeral UI state (e.g. offline queue count, sidebar open/close); do not use Zustand for server-derived data
- Rate limiting policy documented: apply rate limiting to all mutation endpoints (not just login). Policy: login = Better Auth default; password reset = 5 requests/hour per email; email sends = 10/minute per user; ticket creation = 30/minute per user; payout recording = 5/minute per admin. Use a rate-limiting middleware or library (e.g. `@upstash/ratelimit` or custom token bucket)

---

## T098 — Real-time abstraction layer (SSE)

**Phase:** 0 — Foundation _(new — Senior SWE review F6)_
**Status:** pending
**Dependencies:** T009

### What to do

Create a thin abstraction layer around the SSE transport so that switching to a different mechanism later does not require touching every consuming file. The abstraction lives in `packages/realtime/`.

**Scope:** Only two screens use real-time push — the cashier dashboard (ticket status changes) and the clothier view (batch/piece assignments). All other screens (secretary appointment list, admin analytics) are refresh-on-demand.

### Acceptance criteria

- Server export: `publishEvent(channel: string, event: string, data: unknown)` — writes to a server-side event emitter or Postgres NOTIFY
- Client export: `useRealtimeEvent(channel: string, event: string, callback: (data) => void)` — subscribes via `EventSource` internally
- All Phase 4A+ tasks use the abstraction, never `EventSource` directly
- Switching the underlying transport requires changes only in `packages/realtime/`, not in consuming code
- Types for channel names and event names are centralized (string literal union or enum)
- Abstraction includes a **30-second polling fallback** that activates automatically if the SSE connection fails. The cashier dashboard never relies solely on push events — stale data is detected and refreshed via polling
- No Pusher SDK, no Pusher environment variables

---

## T099 — Internationalization (i18n) setup

**Phase:** 0 — Foundation _(new — Senior SWE review F11)_
**Status:** pending
**Dependencies:** T001

### What to do

Set up `next-intl` (or equivalent) for bilingual support (Spanish + English). Spanish is the primary locale; English is secondary. Create the translation file structure and a helper for currency formatting using the project's currency (define which currency — e.g. COP, USD). All user-facing strings from Phase 1 onward must use the translation system, not hardcoded text.

### Acceptance criteria

- `next-intl` installed and configured with Next.js App Router
- Translation files at `messages/es.json` and `messages/en.json` with a few sample keys
- Locale switcher component exists (can be hidden for MVP if only Spanish is active)
- Currency constant defined: **COP (Colombian Pesos)**. No cents — integer storage = whole pesos.
- Currency formatting utility: `formatMoney(pesos: number)` → localized display string using Colombian locale (e.g. `$12.500`). No decimal places.
- Date formatting utility using the i18n locale (DD/MM/YYYY for Spanish)
- Percentage formatting utility: `formatPercent(value: number)` → localized string (e.g. "15 %" or "+15 %↑" for deltas)
- Count formatting utility: locale-aware number separators (e.g. "1.500" for Spanish, "1,500" for English)
- Relative time formatting utility: "hace 2 horas" / "2 hours ago" using date-fns + locale

---

## T103 — Design system, design tokens, and component patterns

**Phase:** 0 — Foundation _(new — Senior Designer review D1, D4, D9, D11, D15, D18, D20, D24, D26)_
**Status:** pending
**Dependencies:** T008

### What to do

Define and implement the project's design system. This covers design tokens (colours, typography, spacing, shadows), semantic status colours, and reusable component patterns. The design system must be configured before the first UI task (T016 — Login page) so all screens share a consistent visual language.

If shadcn/ui is chosen (T008 fallback), configure tokens in `tailwind.config.ts` and `app/globals.css`. If Base Web is chosen, configure a Styletron theme provider with equivalent tokens.

### Acceptance criteria

**Design tokens:**

- Colour palette defined: primary, secondary, neutral scale (50–950), and semantic colours (success, warning, error, info)
- Status colour mapping documented: grey = initial states (logged, pending, booked); blue = in-progress (awaiting_payment, in_production, confirmed); amber = needs attention (reopened, done_pending_approval, rescheduled); green = completed (closed, approved, delivered, paid_in_full, completed); red = negative (cancelled, no_show)
- Typography scale defined: font family, heading sizes (h1–h4), body, small, caption, monospaced (for monetary amounts)
- Spacing scale defined: base unit (4px or 8px), consistent margin/padding values
- Border radius scale: small (inputs), medium (cards), large (modals), full (avatars/badges)
- Shadow/elevation levels: none, sm, md, lg (for cards, dropdowns, modals)
- Dark mode readiness: all colours defined via CSS variables so a dark theme can be added later without refactoring

**Icon library:**

- **Lucide Icons** installed and configured as the single icon source
- Commonly used icons documented: add, edit, delete, search, filter, close, check, alert, chevron, calendar, bell, user, settings, logout

**Component patterns (documented or implemented as reusable components):**

- `EmptyState` — icon, message, optional CTA button. Used on all list/dashboard screens when no data exists.
- `ConfirmationDialog` — standard variant (Cancel + Confirm) for reversible actions; destructive variant (red-highlighted, prominent warning) for financial/permanent actions (payout, deactivation, close day)
- `SearchFilter` — search bar (debounced 300ms, clear button) + horizontal filter chips + active filter indicators + zero-results state
- `LoadingSkeleton` — page-level skeleton matching common layouts; component-level spinner; button spinner with disabled state
- `StatusBadge` — pill-shaped badge using the status colour mapping; supports all entity statuses
- `DataTable` — fixed header, vertical scroll, numbers right-aligned, text left-aligned, row hover, mobile card transformation for 4+ columns
- `NumericBadge` — red circle with count (for notification bell, unsettled alerts); dot variant (small coloured dot); inline alert pill (coloured pill with text)
- Real-time update animation pattern documented: new item = fade-in with 2s highlight; status change = 300ms colour transition; item removal = 500ms fade-out; bulk updates = 100ms stagger

---

## T104 — Key screen wireframes and layout specification

**Phase:** 0 — Foundation _(new — Senior Designer review D2, D13)_
**Status:** pending
**Dependencies:** T103

### What to do

Create low-fidelity wireframes (Figma, Excalidraw, or documented Markdown layouts) for the 7 most critical screens. These don't need to be pixel-perfect — they define layout structure, component placement, and information hierarchy so developers have a shared visual target. Also define layout patterns (when to use full-width list, card grid, sidebar+content, or form page) and the calendar UX approach for appointments and absences.

### Acceptance criteria

**Wireframes for 7 key screens:**

- **Login page** (T016) — brand presence, centred form, responsive
- **Cashier dashboard** (T036) — ticket cards grouped by employee, status columns or Kanban board, real-time update areas. Optimized for desktop information density; keyboard navigation annotated
- **Checkout flow** (T038) — line items, payment section, split payment UI, confirmation step, receipt/summary. Consider stepped flow: 1. Review items → 2. Payment → 3. Confirm
- **Admin home** (T093) — business day status, KPI cards, quick-action grid, unsettled alert area
- **Appointment calendar** (T052) — day view (time slots × stylists on desktop; stacked list on mobile), day navigation, date picker jump
- **Payroll settlement** (T067) — employee selector, date range, earnings breakdown, adjustment field, confirm
- **Analytics dashboard** (T072–T074) — large number displays with delta indicators, bar chart areas, period tabs, per-employee table

**Layout patterns documented:**

- When to use: full-width list (employee list, ticket history), card grid (dashboard, batches), sidebar+content (detail views), full-page form (creation/edit)
- Responsive breakpoints defined: mobile (< 768px), tablet (768–1024px), desktop (> 1024px)

**Calendar UX guidance:**

- Appointment calendar (T052): day view as default; time slots in rows, stylists in columns (desktop); stacked list (mobile). Day navigation arrows + date picker for jumping.
- Absence calendar (T021): month grid with coloured dots per absence type. Mobile: list grouped by date.
