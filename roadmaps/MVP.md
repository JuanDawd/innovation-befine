# MVP Roadmap — Innovation Befine

> One task = one PR. Every task is implementation-ready with explicit acceptance criteria and testing steps.
> Phases run sequentially except where noted. Phase 0 is split into 0A (infra first) and 0B (standards & design, can begin once T001 + T008 are done).

---

## Phase 0A: Infrastructure Foundation

### Task 0A.1: Initialize Next.js monorepo with Turborepo

- **Description:** Scaffold a Turborepo monorepo with `apps/web` (Next.js App Router) and `packages/types`. Enable TypeScript strict mode in all packages.
- **Acceptance Criteria:**
  - `turbo build` passes with zero errors
  - `apps/web` starts in development mode
  - `packages/types` is importable from `apps/web`
  - TypeScript strict mode enabled across all packages
- **Testing Steps:**
  - Run `turbo build` — verify zero errors
  - Run `pnpm dev` in `apps/web` — verify dev server starts
  - Import a type from `packages/types` in a component — verify no TS error
- **Dependencies:** None
- **Status:** Done

---

### Task 0A.2: Environment variable schema with runtime validation

- **Description:** Create `.env.example` listing all required variable keys. Add runtime validation via `@t3-oss/env-nextjs` so the app fails fast on startup if any variable is missing.
- **Acceptance Criteria:**
  - `.env.example` contains all required keys with inline comments
  - App throws a descriptive error on startup when a required var is absent
  - `.env` and `.env*.local` are listed in `.gitignore`
- **Testing Steps:**
  - Remove one required var, start the app — verify descriptive error message
  - Restore the var — verify normal startup
- **Dependencies:** Task 0A.1
- **Status:** Done

---

### Task 0A.3: Vercel project setup

- **Description:** Create a Vercel project connected to the git repository. Configure `turbo build --filter=web` as the build command. Verify preview deployments fire on every PR.
- **Acceptance Criteria:**
  - Push to `main` triggers a production deploy
  - Opening a PR generates a unique preview URL
  - All required environment variables are configured in the Vercel dashboard
- **Testing Steps:**
  - Push a trivial commit to `main` — verify Vercel dashboard shows a successful deployment
  - Open a test PR — verify a preview URL appears in the PR
- **Dependencies:** Task 0A.1
- **Status:** Done

---

### Task 0A.4: Neon Postgres setup

- **Description:** Create a Neon project. Add `dev` and `staging` branches. Connect `apps/web` via the Neon serverless driver. Document the connection strategy (Edge vs. Serverless Functions, free-tier limits, exhaustion handling).
- **Acceptance Criteria:**
  - `apps/web` connects to Neon locally without error
  - Preview deploys connect to the `staging` Neon branch
  - Production connects to the `main` Neon branch
  - Connection uses `@neondatabase/serverless`
- **Testing Steps:**
  - Run a test query (`SELECT 1`) in a server component — verify no error
  - Open a preview deploy URL — verify it connects to the staging branch
- **Dependencies:** Task 0A.3
- **Status:** Done

---

### Task 0A.5: Drizzle ORM setup and migration workflow

- **Description:** Install and configure Drizzle ORM with the Neon WebSocket Pool adapter (not `neon-http` — transactions are required). Set up `drizzle-kit`. Add `db:migrate` and `db:studio` scripts. Define shared `payment_method_enum` (`cash | card | transfer`) in the schema for reuse across tables. Document naming conventions and migration rollback testing requirements.
- **Acceptance Criteria:**
  - `pnpm db:migrate` applies pending migrations to the target DB
  - `pnpm db:studio` opens Drizzle Studio connected to the local DB
  - Schema files live in `packages/db/src/schema/`
  - Empty initial migration runs successfully against Neon
  - Shared `payment_method_enum` defined and exported
  - Every migration must have a working down migration (verified in CI)
- **Testing Steps:**
  - Run `pnpm db:migrate` — verify zero errors
  - Run `pnpm db:studio` — verify UI loads
  - Apply the initial migration, run down, run up again — verify idempotency
- **Dependencies:** Task 0A.4
- **Status:** Done

---

### Task 0A.6: Better Auth integration with RBAC

- **Description:** Install Better Auth, configure the Postgres adapter pointing to Neon, enable the RBAC plugin with four roles: `cashier_admin`, `secretary`, `stylist`, `clothier`. Verify the login endpoint is rate-limited. Create the auth tables migration. Seed one test admin for local dev.
- **Acceptance Criteria:**
  - Better Auth tables created via migration (`users`, `sessions`, `accounts`)
  - RBAC plugin supports four custom roles without workarounds
  - A seeded admin login works end-to-end
  - Session is accessible in Server Components and API routes
  - Login endpoint is rate-limited (confirmed via Better Auth config)
- **Testing Steps:**
  - Log in as seeded admin — verify session cookie is set and role is readable
  - Attempt login with wrong credentials — verify error message
  - Send 10+ rapid login attempts — verify rate limit response
- **Dependencies:** Task 0A.5
- **Status:** Done

---

### Task 0A.7: UI component library spike (shadcn/ui)

- **Description:** Evaluate Base Web (primary candidate) with a 2-hour timebox. If hydration errors or >50% `"use client"` required, switch to shadcn/ui + Tailwind (fallback). Document the decision in `docs/research/ui-library-spike.md`. Initialize core components: Button, Input, Dialog, Table.
- **Acceptance Criteria:**
  - Chosen library's components render without errors in development
  - No hydration mismatch warnings in the browser console
  - `next build` completes without component-library errors
  - Decision documented in `docs/research/ui-library-spike.md`
- **Testing Steps:**
  - Render Button and Dialog in a test page — verify no console errors
  - Run `next build` — verify zero errors
  - Open the page in a browser — verify no hydration warnings
- **Dependencies:** Task 0A.1
- **Status:** Done

---

### Task 0A.8: SSE (Server-Sent Events) spike

- **Description:** Validate that native SSE works end-to-end in Next.js App Router on Vercel. Build a Route Handler streaming `text/event-stream`. Subscribe with `EventSource` in a client component. Verify reconnect behavior. Document Vercel SSE timeout behavior and reconnect strategy.
- **Acceptance Criteria:**
  - Route Handler streams SSE events without errors
  - Client component receives events via `EventSource` without page refresh
  - Automatic reconnection works when the connection drops
  - Verified on a Vercel preview deploy (not only local)
  - No third-party real-time service used
- **Testing Steps:**
  - Open the test page on the Vercel preview URL — verify events stream
  - Kill the connection (dev tools → offline) — verify automatic reconnect
- **Dependencies:** Task 0A.1, Task 0A.3
- **Status:** Done

---

### Task 0A.9: RBAC role definitions in shared types

- **Description:** Define the role enum (`cashier_admin | secretary | stylist | clothier`) and stylist subtype enum in `packages/types`. Configure Better Auth RBAC to use these roles. Add placeholder home screens per role.
- **Acceptance Criteria:**
  - Role and stylist-subtype enums exported from `packages/types`
  - Better Auth RBAC configured with all four roles
  - Middleware redirects unauthenticated users to `/login`
  - Each role has a placeholder home screen (heading only) after login
- **Testing Steps:**
  - Log in as each role — verify redirect to the correct placeholder screen
  - Access a protected route without session — verify redirect to `/login`
- **Dependencies:** Task 0A.6

- **Status:** Done

---

### Task 0A.10: Development seed script

- **Description:** Create a `db:seed` script that inserts one user per role into the dev DB. Idempotent (safe to re-run). Document seed credentials in `.env.example` comments (dev-only).
- **Acceptance Criteria:**
  - `pnpm db:seed` runs without errors
  - One admin, one secretary, one clothier, and at least one stylist per subtype are seeded
  - Running the script twice does not create duplicate users
- **Testing Steps:**
  - Run `pnpm db:seed` twice — verify no duplicate-key errors
  - Log in as each seeded role — verify successful authentication
- **Dependencies:** Task 0A.9

- **Status:** Done

---

### Task 0A.11: Sentry error tracking setup

- **Description:** Install `@sentry/nextjs`. Configure for Vercel. Upload source maps. Scrub PII from events (`beforeSend`). Add structured business logic logging (pino) for all financial operations.
- **Acceptance Criteria:**
  - Sentry DSN added to Vercel env vars
  - A deliberately thrown error appears in the Sentry dashboard with source-mapped stack trace
  - PII (client names, emails) scrubbed from Sentry events
  - Financial operations log to a separate audit trail (not only Sentry)
- **Testing Steps:**
  - Trigger a test error — verify it appears in Sentry with correct line numbers
  - Include a client name in a test event — verify it is scrubbed before reaching Sentry
- **Dependencies:** Task 0A.3

- **Status:** Done

---

### Task 0A.12: Testing infrastructure

- **Description:** Set up Vitest (unit/integration) and Playwright (E2E). Add `turbo test` and `turbo test:e2e` pipelines. Configure coverage reporting (80% threshold for `packages/db/src/queries/`). Integrate `axe-core` with Playwright for automated a11y checks. Document testing policy in `docs/standards.md`.
- **Acceptance Criteria:**
  - `turbo test` runs all Vitest tests across the monorepo
  - `turbo test:e2e` runs Playwright tests against a local dev server
  - Playwright smoke test loads the login page successfully
  - Coverage report generated; 80% threshold enforced for financial logic
- **Testing Steps:**
  - Run `turbo test` — verify test runner starts with zero errors
  - Run `turbo test:e2e` — verify the login-page smoke test passes
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 0A.13: CI/CD pipeline

- **Description:** Create `.github/workflows/ci.yml` running lint, typecheck, and unit tests on every PR. Block merges if any step fails (branch protection). Add Turborepo and `node_modules` caching.
- **Acceptance Criteria:**
  - Pipeline runs on every PR to `main`
  - Lint, typecheck, and tests all run in the pipeline
  - PR merge is blocked if any check fails
  - Pipeline completes in < 5 minutes on a clean repo
  - Post-deployment smoke test runs against the Vercel preview URL
- **Testing Steps:**
  - Open a PR with a lint error — verify CI fails and merge is blocked
  - Fix the error — verify CI passes and merge is unblocked
- **Dependencies:** Task 0A.12, Task 0A.2

- **Status:** Done

---

## Phase 0B: Standards & Design

### Task 0B.1: Code quality tooling and standards document

- **Description:** Add ESLint (Next.js + `eslint-plugin-jsx-a11y`), Prettier, Husky + lint-staged pre-commit hook. Write `docs/standards.md` covering: money storage (integer pesos), soft-delete policy, error handling, accessibility baseline, performance targets, loading patterns, form UX, mobile-first policy, testing policy, and banker's rounding.
- **Acceptance Criteria:**
  - `turbo lint` passes on a clean repo
  - Pre-commit hook blocks commits with lint errors
  - `docs/standards.md` covers all topics listed in the task description
  - `eslint-plugin-jsx-a11y` configured and enforcing rules
- **Testing Steps:**
  - Introduce a lint error and attempt a commit — verify the hook blocks it
  - Introduce an a11y violation (missing label) — verify ESLint reports it
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 0B.2: API design conventions document

- **Description:** Write `docs/standards-api.md` covering: Server Actions vs API routes, standard `ActionResult<T>` error shape, cursor-based pagination pattern, Zod error formatting, TanStack Query cache policy, React Hook Form pattern, Zustand scope, and rate limiting policy (`@upstash/ratelimit`).
- **Acceptance Criteria:**
  - Document exists at `docs/standards-api.md`
  - `ActionResult<T>` shape defined with all error codes
  - Rate limiting policy documented for all mutation categories
- **Testing Steps:**
  - Peer review the document for completeness against the CLAUDE.md API conventions
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 0B.3: Offline policy document

- **Description:** Write `docs/research/offline-policy.md` classifying every user action as offline-capable or online-only. Obtain business stakeholder sign-off (record date and name). Must be reviewed before Phase 4A APIs are built.
- **Acceptance Criteria:**
  - Document exists at `docs/research/offline-policy.md`
  - Every user-initiated action classified with its offline handling
  - Stakeholder sign-off date and name recorded in the document
- **Testing Steps:**
  - Walk through every action in the app with the stakeholder — verify all are listed
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 0B.4: Real-time abstraction layer (SSE)

- **Description:** Create `packages/realtime/` with `publishEvent(channel, event, data)` (server) and `useRealtimeEvent(channel, event, callback)` (client). Include a 30-second polling fallback that activates automatically if the SSE connection fails. Channel and event names must be typed. No third-party real-time service.
- **Acceptance Criteria:**
  - Server and client exports work end-to-end
  - All Phase 4A+ tasks use the abstraction, never `EventSource` directly
  - Switching the underlying transport requires changes only in `packages/realtime/`
  - 30-second polling fallback activates automatically on SSE failure
- **Testing Steps:**
  - Publish an event server-side and verify it is received by a subscribed client component
  - Kill the SSE connection — verify polling fallback activates within 30 seconds
- **Dependencies:** Task 0A.8

- **Status:** Done

---

### Task 0B.5: Internationalization (i18n) setup

- **Description:** Install and configure `next-intl` for Spanish (primary) and English (secondary). Create `messages/es.json` and `messages/en.json`. Add utility functions: `formatMoney(pesos)` (COP, no decimals, e.g. `$12.500`), `formatDate`, `formatPercent`, `formatCount`, relative time.
- **Acceptance Criteria:**
  - `next-intl` configured with App Router
  - Translation files at `messages/es.json` and `messages/en.json`
  - `formatMoney(12500)` returns `"$12.500"` (Colombian locale)
  - All utilities produce correct locale-aware output
- **Testing Steps:**
  - Call `formatMoney(12500)` — verify output is `"$12.500"`
  - Switch locale to English — verify number formatting changes to English conventions
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 0B.6: Design system, tokens, and component patterns

- **Description:** Define design tokens (colours, typography, spacing, shadows, border radius) in `tailwind.config.ts` and `globals.css`. Implement reusable components: `EmptyState`, `ConfirmationDialog`, `LoadingSkeleton`, `StatusBadge`, `DataTable`, `NumericBadge`. Document status colour mapping. Install and configure Lucide Icons as the single icon source. Add dark mode readiness via CSS variables.
- **Acceptance Criteria:**
  - All design tokens defined and usable via Tailwind classes
  - Status colour mapping documented: grey (initial), blue (in-progress), amber (needs attention), green (completed), red (negative)
  - All six component patterns implemented and usable by other tasks
  - Dark mode tokens present (`:dark` selectors) even if toggle is added later
- **Testing Steps:**
  - Render each component in isolation — verify it matches the documented pattern
  - Switch to dark mode in DevTools — verify no hardcoded hex colours break
- **Dependencies:** Task 0A.7

- **Status:** Done

---

### Task 0B.7: Key screen wireframes and layout specification

- **Description:** Create low-fidelity wireframes for: login, cashier dashboard, checkout flow, admin home, appointment calendar, payroll settlement, analytics dashboard. Document layout patterns and responsive breakpoints (mobile < 768, tablet 768–1024, desktop > 1024).
- **Acceptance Criteria:**
  - Wireframes exist for all 7 screens (Figma, Excalidraw, or documented Markdown)
  - Layout patterns documented: full-width list, card grid, sidebar+content, full-page form
  - Responsive breakpoints defined and referenced from `docs/wireframes.md`
- **Testing Steps:**
  - Walk through each wireframe with the designer or stakeholder — verify agreement on layout
- **Dependencies:** Task 0B.6

- **Status:** Done

---

## Phase 1: Identity, Employees, and Business Day

### Task 1.1: Employees table migration

- **Description:** Create the `employees` table: `id (uuid)`, `user_id (FK unique)`, `role`, `stylist_subtype (nullable)`, `daily_rate (nullable)`, `expected_work_days (int default 6, check 1–7)`, `show_earnings (bool)`, `is_active`, `hired_at`, `deactivated_at (nullable)`, `created_at`. Use `version` column for optimistic locking.
- **Acceptance Criteria:**
  - Migration runs without errors on Neon dev branch
  - All columns present with correct types and constraints
  - `user_id` has a unique constraint
  - `expected_work_days` check constraint enforces 1–7
- **Testing Steps:**
  - Run the migration — verify zero errors
  - Attempt to insert an employee with `expected_work_days = 8` — verify DB rejects it
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 1.2: Employee account creation (admin only)

- **Description:** Build the admin UI to create a new employee: name, email (login), role, stylist subtype (conditional), daily rate (conditional for secretary). On submit, create a Better Auth user and linked employee record. New employee receives a password reset email via Resend (falls back to admin-set temporary password if email unavailable).
- **Acceptance Criteria:**
  - Admin can create users of any role
  - Conditional fields (subtype, daily_rate) show/hide based on role selection
  - Employee record linked to auth user
  - Non-admin roles return 403
- **Testing Steps:**
  - Create a stylist — verify subtype field appears; create record; verify DB row
  - As secretary, attempt to access the screen — verify 403
- **Dependencies:** Task 1.1, Task 0A.9, Task 1.9 (Resend)

- **Status:** Done

---

### Task 1.3: Employee list and profile view (admin)

- **Description:** Build a list screen showing all employees (name, role, subtype, status, hire date). Clicking an employee opens a detail/edit view. Admin can edit name, role, subtype, and daily rate. Include active/inactive filter.
- **Acceptance Criteria:**
  - All employees listed with correct fields
  - Filter by role and active/inactive works
  - Admin can save edits; changes reflected immediately
  - Empty state shown when no employees exist
- **Testing Steps:**
  - Create two employees, filter by role — verify only matching employees shown
  - Edit an employee's name — verify the change persists after page reload
- **Dependencies:** Task 1.2

- **Status:** Done

---

### Task 1.4: Employee earnings visibility flag

- **Description:** Add an admin toggle on the employee detail view for `show_earnings`. Implement `canSeeOwnEarnings(employeeId)` helper. Phase 7 earnings screens will gate on this flag.
- **Acceptance Criteria:**
  - Admin can toggle `show_earnings` per employee
  - Helper returns the correct boolean from the DB
  - Flag persisted immediately
- **Testing Steps:**
  - Toggle flag on; reload page — verify toggle state persists
  - Call `canSeeOwnEarnings` — verify it returns the correct value
- **Dependencies:** Task 1.3

- **Status:** Done

---

### Task 1.5: Login page

- **Description:** Build the login page with Better Auth `sign-in`. After login, redirect each role to their respective placeholder home screen. Mobile and desktop responsive.
- **Acceptance Criteria:**
  - Email + password login works for all seeded roles
  - Wrong credentials show a clear error message
  - Successful login redirects to the role-appropriate screen
  - Page is responsive at all breakpoints
- **Testing Steps:**
  - Log in as each role — verify correct redirect
  - Submit wrong credentials — verify error message appears
  - Open on a mobile viewport — verify form usable without horizontal scroll
- **Dependencies:** Task 0A.6, Task 0A.7

- **Status:** Done

---

### Task 1.6: Password reset flow

- **Description:** Implement "forgot password" and "set new password" flows using Better Auth's built-in email verification. Use the Resend client from Task 1.9 to deliver the reset email.
- **Acceptance Criteria:**
  - "Forgot password" link on the login page
  - Reset email delivered via Resend within 30 seconds
  - Reset link expires after 1 hour
  - New password accepted; user can log in immediately
- **Testing Steps:**
  - Request a reset for a seeded email — verify email arrives
  - Use the link after 1 hour — verify it is expired
- **Dependencies:** Task 1.5, Task 1.9

- **Status:** Done

---

### Task 1.7: Session middleware and route protection

- **Description:** Add Next.js middleware checking Better Auth session on every request. Redirect unauthenticated users to `/login`. Redirect authenticated users accessing unauthorized routes to a 403 page. Block secretary role from all financial routes (revenue, payout, analytics) via a centralized config.
- **Acceptance Criteria:**
  - Unauthenticated request to any protected route → redirected to `/login`
  - Authenticated user accessing an unauthorized route → 403 page
  - Public routes (`/login`, `/reset-password`) accessible without session
  - Secretary financial route restriction enforced via centralized config
- **Testing Steps:**
  - Navigate to `/admin` without a session — verify redirect to `/login`
  - Log in as secretary, navigate to `/admin/analytics` — verify 403
- **Dependencies:** Task 0A.9

- **Status:** Done

---

### Task 1.8: Business day open/close

- **Description:** Create the `business_days` table: `id`, `opened_at`, `closed_at (nullable)`, `opened_by`, `closed_by (nullable)`. Add "Open day" and "Close day" buttons on the admin screen. Enforce only one open day at a time with a DB partial unique index. Add reopen capability for the most recently closed day (requires confirmation dialog + reason). Add loading state for the open-day action.
- **Acceptance Criteria:**
  - Migration runs without errors
  - Only one business day open at a time — enforced at DB level (partial unique index)
  - Open/close timestamps recorded with the acting user's ID
  - Admin can reopen only the most recently closed day (with reason + audit log)
  - Loading state visible during the open/close action
- **Testing Steps:**
  - Open a day; attempt to open a second — verify DB constraint blocks it
  - Close a day; reopen it — verify audit log entry created
  - Simulate a slow network during open — verify loading state shows
- **Dependencies:** Task 1.1

- **Status:** Done

---

### Task 1.9: Resend email integration

- **Description:** Install `resend` and `@react-email/components`. Create `sendEmail(to, subject, reactComponent)` utility. Store `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in env. Failed sends log but do not crash the app.
- **Acceptance Criteria:**
  - Resend API key stored securely in env (not committed)
  - Test email sent successfully in staging
  - Failed send logs an error; app does not throw
- **Testing Steps:**
  - Call `sendEmail` to a test address in staging — verify delivery
  - Mock a Resend failure — verify the error is logged and the app continues
- **Dependencies:** Task 0A.2

- **Status:** Done

---

### Task 1.10: App navigation and layout shell

- **Description:** Build the persistent app shell: header (app name, user avatar, logout), role-aware sidebar navigation with grouped sections, and mobile bottom navigation. Active route highlighted (longest-match rule — exactly one item active). Logout clears session and redirects to `/login`.
- **Acceptance Criteria:**
  - Shell renders for all four roles with correct nav items grouped by section
  - Exactly one nav item active per page (longest-match rule)
  - Mobile layout uses a bottom bar or collapsible drawer
  - Logout action clears the session and redirects to `/login`
  - All nav icons use Lucide Icons
- **Testing Steps:**
  - Navigate between sections — verify exactly one item is highlighted at all times
  - Test on a 360px mobile viewport — verify nav is usable
  - Click logout — verify session is cleared and redirect to `/login` occurs
- **Dependencies:** Task 0A.9, Task 0B.6

- **Status:** Done

---

### Task 1.11: Brand identity and asset gathering

- **Description:** Source or create the Innovation Befine logo/wordmark. Extract brand colours and apply them to design tokens. Generate favicon (16, 32 px) and PWA icons (192, 512 px). Store in `public/brand/`.
- **Acceptance Criteria:**
  - Logo or wordmark visible in the app header
  - Brand colours mapped to design token primary/secondary slots
  - Favicon at `app/favicon.ico` (or `app/icon.tsx`)
  - PWA icons (192×192 and 512×512) generated and stored
- **Testing Steps:**
  - Open the app — verify the logo appears in the header
  - Add to home screen on Android — verify the correct icon appears
- **Dependencies:** Task 0B.6

- **Status:** Done

---

### Task 1.12: Employee self-service password change

- **Description:** Add a "Change password" option in the user profile. Current password verified server-side. Weak passwords (< 8 chars) rejected. Session remains active after change.
- **Acceptance Criteria:**
  - Any authenticated user can access the change-password form
  - Current password verified before accepting the new one
  - Passwords < 8 characters rejected with a clear message
  - Session remains active after a successful change
- **Testing Steps:**
  - Submit a password change with the wrong current password — verify rejection
  - Submit a password < 8 chars — verify error message
  - Complete a successful change — verify the new password works at next login
- **Dependencies:** Task 1.5

- **Status:** Done

---

### Task 1.13: Business settings table migration

- **Description:** Create a `business_settings` table (single-row pattern). Start with `enforce_subtype_service_restriction (bool default false)`. Add `getBusinessSettings()` server utility (cached per request). Add admin toggle for the setting.
- **Acceptance Criteria:**
  - Migration creates `business_settings` with a check constraint ensuring at most one row
  - Seed row inserted automatically on first migration
  - `getBusinessSettings()` returns the settings object
  - Admin toggle visible on the settings screen
- **Testing Steps:**
  - Query `business_settings` after migration — verify exactly one row
  - Toggle the setting via admin UI — verify the DB value changes
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 1.14: Basic employee deactivation (Phase 1)

- **Description:** Add a "Deactivate employee" action on the employee detail view. Sets `is_active = false`, `deactivated_at = now()`, bans the user in Better Auth (`auth.api.banUser`), and revokes all sessions. All historic records remain intact.
- **Acceptance Criteria:**
  - Admin can deactivate any employee
  - Deactivated employee's session is invalidated and login is blocked (Better Auth ban)
  - Deactivated employees hidden from active lists; visible under "Show inactive" filter
  - All historic records (tickets, payouts) remain intact
- **Testing Steps:**
  - Deactivate a seeded employee — verify they cannot log in
  - Check the employee list — verify they are hidden by default; visible with filter
- **Dependencies:** Task 1.3

- **Status:** Done

---

## Phase 2: Catalog and Pricing

### Task 2.1: Services and variants table migration

- **Description:** Create `services` and `service_variants` tables. `commission_pct` is `numeric(5,2)` with a 0–100 check constraint and banker's rounding policy. `customer_price` is `bigint` (integer COP pesos). Both tables have `is_active` for soft-deletion.
- **Acceptance Criteria:**
  - Both migrations run without errors
  - `commission_pct` is `numeric(5,2)` with check constraint 0–100
  - `customer_price` is `bigint`
  - Both tables have `is_active`
- **Testing Steps:**
  - Insert a variant with `commission_pct = 101` — verify DB rejects it
  - Insert with `customer_price = 12500` (integer) — verify stored correctly
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 2.2: Service catalog CRUD UI (admin)

- **Description:** Build the admin service catalog screen: list all services and variants, create/edit/soft-delete services and variants. Inactive items hidden from non-admin views. Non-admin roles return 403 on write endpoints.
- **Acceptance Criteria:**
  - Admin sees all services and variants in one view
  - Can create a service with at least one variant
  - Can add, edit, and soft-delete variants
  - Inactive items hidden from non-admin views
  - Empty state shown when no services exist
- **Testing Steps:**
  - Create a service with two variants — verify both appear in the list
  - Soft-delete a variant — verify it disappears from the stylist service selector
  - As secretary, attempt to call the write endpoint — verify 403
- **Dependencies:** Task 2.1

- **Status:** Done

---

### Task 2.3: Catalog audit log

- **Description:** Create a generic `catalog_audit_log` table (`entity_type`, `entity_id`, `changed_by`, `changed_at`, `old_value jsonb`, `new_value jsonb`). On every create/edit of a service, variant, or cloth piece, insert a record. Display the audit log per entity (admin only). Cloth pieces (Task 2.5) reuse this table.
- **Acceptance Criteria:**
  - Every price or commission change creates an audit record
  - Audit log visible on each entity's admin detail view
  - Audit log is append-only (no deletes from the UI)
  - `entity_type` supports `service`, `service_variant`, and `cloth_piece`
- **Testing Steps:**
  - Change a variant price — verify an audit record is created with old and new values
  - Attempt to delete an audit record via the UI — verify no delete action exists
- **Dependencies:** Task 2.2

- **Status:** Done

---

### Task 2.4: Cloth pieces table migration

- **Description:** Create the `cloth_pieces` table: `id`, `name`, `description (nullable)`, `piece_rate (bigint ≥ 0)`, `is_active`, `created_at`, `updated_at`. Cloth pieces are internal production units — no customer-facing sale price at the piece level.
- **Acceptance Criteria:**
  - Migration runs without errors
  - `piece_rate` is `bigint` with check constraint `>= 0`
  - `is_active` column present
- **Testing Steps:**
  - Insert a cloth piece with `piece_rate = -1` — verify DB rejects it
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 2.5: Cloth piece catalog CRUD UI (admin)

- **Description:** Build the admin cloth piece catalog screen: list all piece types, create/edit/soft-delete entries. Price changes recorded in the catalog audit log from Task 2.3.
- **Acceptance Criteria:**
  - Admin can create a new cloth piece type
  - Admin can edit name, description, and piece rate
  - Soft-delete hides the piece from new craftable creation (existing assignments unaffected)
  - Audit log records price changes
  - Empty state shown when no cloth pieces exist
- **Testing Steps:**
  - Create a cloth piece, change its `piece_rate` — verify audit log entry created
  - Soft-delete a cloth piece — verify it no longer appears in the craftable creation form
- **Dependencies:** Task 2.4, Task 2.3

- **Status:** Done

---

### Task 2.6: Catalog read access for non-admin roles

- **Description:** Expose read-only server actions / API endpoints for active services/variants and active cloth pieces. Cashier, stylist, secretary, and clothier can read (for their respective domains). Write endpoints return 403 for non-admin roles.
- **Acceptance Criteria:**
  - Stylists and secretary can fetch active services and variants
  - Secretary and clothier can fetch active cloth piece types
  - Cashier can access service data for checkout
  - Write endpoints return 403 for non-admin roles
- **Testing Steps:**
  - As stylist, call the services read endpoint — verify 200
  - As stylist, call the services write endpoint — verify 403
- **Dependencies:** Task 2.2, Task 2.5

- **Status:** Done

---

## Phase 3: Client Records

### Task 3.1: Clients table migration

- **Description:** Create the `clients` table: `id (uuid)`, `name`, `phone (nullable)`, `email (nullable)`, `notes (nullable)`, `no_show_count (default 0, check >= 0)`, `is_active`, `created_at`, `updated_at`.
- **Acceptance Criteria:**
  - Migration runs without errors
  - `no_show_count` defaults to 0 with a non-negative check constraint
  - `is_active` present for soft-deletion
- **Testing Steps:**
  - Insert a client with `no_show_count = -1` — verify DB rejects it
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 3.2: Saved client CRUD and search (cashier / secretary)

- **Description:** Build the client management screen: list, search by name/phone/email (returns results < 300 ms), create, edit, and archive clients. Include a compact search widget for use inside ticket and appointment creation flows. Admin can unarchive clients.
- **Acceptance Criteria:**
  - Search returns results within 300 ms on a realistic dataset
  - Can create a new saved client inline from the search widget (no separate page)
  - Can edit contact info and notes on the client profile
  - Archiving hides the client from search but preserves history
  - Admin can unarchive a client
  - `editClient` server action checks `isActive = true` before allowing edits (returns NOT_FOUND for archived clients)
  - Empty state shown when no saved clients exist
- **Testing Steps:**
  - Search for a client — verify results appear within 300 ms
  - Archive a client — verify they disappear from search
  - As admin, unarchive the client — verify they reappear
  - Call `editClient` for an archived client — verify NOT_FOUND
- **Dependencies:** Task 3.1

- **Status:** Done

---

### Task 3.3: Guest client flow

- **Description:** When creating a ticket or appointment, allow the user to skip client lookup and enter only a guest name (free text). Store `guest_name` on the ticket/appointment record directly. No `clients` record created for guests.
- **Acceptance Criteria:**
  - "Walk-in / Guest" option visible in the client selector
  - Guest name (free text) saved on the ticket or appointment
  - Guest tickets do not appear in the client history view
  - No no-show tracking for guests
- **Testing Steps:**
  - Create a ticket with a guest name — verify `client_id` is null and `guest_name` is set
  - Open the client detail view — verify the guest ticket is not listed there
- **Dependencies:** Task 3.2

- **Status:** Done

---

### Task 3.4: No-show count display

- **Description:** Display `no_show_count` on the client profile card and in search results. Show a warning badge if count ≥ 3. The increment logic is added in Phase 5 (Task 5.6) when the appointment system exists.
- **Acceptance Criteria:**
  - Count visible on the client profile card
  - Warning badge shown in search widget if count ≥ 3
  - No-show count is read-only in this phase
- **Testing Steps:**
  - Manually set `no_show_count = 3` in the DB — verify warning badge appears in search
  - Set `no_show_count = 2` — verify no badge
- **Dependencies:** Task 3.1

- **Status:** Done

---

## Phase 4A: Tickets and Checkout

### Task 4A.1: Tickets and checkout_sessions table migration

- **Description:** Create `tickets` table: `id`, `business_day_id (FK)`, `employee_id (FK)`, `client_id (FK nullable)`, `guest_name (nullable)`, `appointment_id (FK nullable)`, `checkout_session_id (FK nullable)`, `status (pgEnum: logged | awaiting_payment | closed | reopened | paid_offline)`, `idempotency_key (unique nullable)`, `closed_at`, `closed_by`, `created_at`, `created_by`. Create `checkout_sessions` table: `id`, `business_day_id (FK)`, `cashier_id (FK)`, `client_id (FK nullable)`, `total_amount (bigint)`, `is_partially_reopened (bool default false)`, `created_at`.
- **Acceptance Criteria:**
  - Both migrations run without errors
  - Either `client_id` or `guest_name` present on tickets (DB check or app-level)
  - `status` uses Drizzle `pgEnum` including `paid_offline`
  - `idempotency_key` column exists with a unique index
  - `appointment_id` and `checkout_session_id` columns exist as nullable FKs
- **Testing Steps:**
  - Insert a ticket with neither `client_id` nor `guest_name` — verify it is rejected
  - Insert two tickets with the same `idempotency_key` — verify unique constraint fires
- **Dependencies:** Task 1.8, Task 3.1

- **Status:** Done

---

### Task 4A.2: Ticket items table migration

- **Description:** Create `ticket_items`: `id`, `ticket_id (FK)`, `service_variant_id (FK)`, `quantity (default 1)`, `unit_price (bigint — snapshot)`, `commission_pct (snapshot)`, `override_price (nullable)`, `override_reason (nullable)`, `created_at`. Snapshotting price and commission at log time is mandatory.
- **Acceptance Criteria:**
  - Migration runs without errors
  - `unit_price` and `commission_pct` are copied from the service variant at insert time
  - `override_price` can only be set by cashier (enforced at API level)
- **Testing Steps:**
  - Change a service variant price after logging a ticket — verify `ticket_items.unit_price` is unchanged
- **Dependencies:** Task 4A.1, Task 2.1

- **Status:** Done

---

### Task 4A.3: Ticket creation (stylist / secretary / cashier)

- **Description:** Build the "Log service" flow: select employee (pre-selected if logged-in user is a stylist), select service/variant, select or create client or enter guest name. Creates a `logged`-status ticket. Accepts an `idempotency_key`. Cannot create a ticket when no business day is open. Ticket appears on the cashier dashboard via real-time event immediately.
- **Acceptance Criteria:**
  - Stylist can create a ticket for themselves only
  - Secretary and cashier can create for any employee
  - Service/variant selector shows only active catalog items
  - Walk-in ticket works without linking to an appointment
  - Cannot create a ticket with no open business day (clear error)
  - Duplicate submission with the same `idempotency_key` returns the first response (no duplicate)
  - Stylist flow: mobile-first, pre-selected employee, minimal steps
- **Testing Steps:**
  - As stylist, attempt to log a service for a different employee — verify 403
  - Submit the same request twice with identical `idempotency_key` — verify only one ticket created
  - Close the business day; attempt to create a ticket — verify clear error
- **Dependencies:** Task 4A.2, Task 3.3, Task 2.6

- **Status:** Done

---

### Task 4A.4: Cashier dashboard with live updates

- **Description:** Build the main cashier screen: a board showing all open tickets grouped by employee. Each card shows employee name, service, client name, status, and time elapsed. Real-time updates via `packages/realtime`. Keyboard navigation between cards. New tickets fade in with a 2-second highlight; status changes animate in 300 ms; closed tickets fade out after 500 ms.
- **Acceptance Criteria:**
  - Board shows all `logged` and `awaiting_payment` tickets for the current business day
  - Tickets grouped by employee
  - New ticket appears on the board within 2 seconds of creation
  - Status change to `awaiting_payment` visually highlights the card
  - Empty state shown when no open tickets exist
  - Usable on desktop, tablet, and phone
- **Testing Steps:**
  - Create a ticket in a second browser tab — verify it appears on the board within 2 seconds
  - Transition a ticket to `awaiting_payment` — verify the card highlights
- **Dependencies:** Task 4A.3, Task 0B.4

- **Status:** Done

---

### Task 4A.5: Ticket status transitions and RBAC

- **Description:** Implement allowed status transitions with server-side RBAC enforcement: `logged → awaiting_payment` (stylist own, secretary, cashier), `awaiting_payment → closed` (cashier only via checkout), `closed → reopened` (cashier only), `reopened → awaiting_payment` (cashier only). Publish real-time event on every transition.
- **Acceptance Criteria:**
  - Each transition has a server action that checks the caller's role
  - Unauthorized transition attempts return 403
  - Real-time event published on every status change
- **Testing Steps:**
  - As stylist, attempt to close a ticket — verify 403
  - As cashier, transition a ticket through all valid states — verify each succeeds
- **Dependencies:** Task 4A.3

- **Status:** Done

---

### Task 4A.6: Checkout flow with batch checkout

- **Description:** Build the cashier checkout screen. Cashier selects one or more `awaiting_payment` tickets and checks them out together. Creates a `checkout_session` and records payments atomically in a single DB transaction. Concurrent checkout on the same ticket returns a conflict error. Includes a confirmation dialog (destructive pattern), post-checkout summary screen, and "Print receipt" button.
- **Acceptance Criteria:**
  - Cashier can select multiple tickets for batch checkout
  - Single-ticket checkout works as a degenerate case
  - Line items shown per ticket with snapshotted prices
  - Batch total computed correctly including overrides
  - `checkout_session` created atomically with all ticket closures
  - Concurrent checkout on the same ticket → one succeeds, one gets a conflict error
  - All ticket statuses → `closed` on success; `closed_at`, `closed_by`, `checkout_session_id` set
  - Real-time event fires; board removes closed tickets
  - Confirmation dialog uses the destructive pattern
- **Testing Steps:**
  - Simultaneously submit checkout for the same ticket from two browser sessions — verify exactly one succeeds
  - Complete a batch checkout for two tickets — verify both are closed and linked to the same `checkout_session`
- **Dependencies:** Task 4A.5

- **Status:** Done

---

### Task 4A.7: Split payment at checkout

- **Description:** Create `ticket_payments` table: `id`, `checkout_session_id (FK)`, `method (payment_method_enum)`, `amount (bigint)`, `created_at`. Allow cashier to add multiple payment rows before confirming. Sum of amounts must equal the session total. Reuses the shared `payment_method_enum` from Task 0A.5.
- **Acceptance Criteria:**
  - `ticket_payments` migration runs without errors with `checkout_session_id` FK
  - Cashier can add multiple payment rows
  - Submit blocked if amounts do not sum to the session total
  - Single-method payment works as a special case
- **Testing Steps:**
  - Add two payment rows (cash + card) that don't sum to the total — verify submit is blocked
  - Add rows summing exactly to the total — verify checkout completes
- **Dependencies:** Task 4A.6

- **Status:** Done

---

### Task 4A.8: Price override at checkout (cashier)

- **Description:** Allow cashier to override the price of any line item at checkout. A reason text is required and stored in `ticket_items.override_reason`. Override triggers commission recalculation. Admin can view an override history report.
- **Acceptance Criteria:**
  - Override price field visible to cashier on each line item
  - Reason text stored in DB
  - Override reason not rendered in any non-admin view
  - Commission recalculated using the override price
  - Admin override history view: paginated list of all price overrides with columns: ticket ID, service, original price, override price, delta, reason, cashier, date
- **Testing Steps:**
  - As cashier, override a line item price with a reason — verify commission recalculated correctly
  - As stylist, verify the override reason column is not visible
  - As admin, view the override history — verify the overridden item appears
- **Dependencies:** Task 4A.6

- **Status:** Done

---

### Task 4A.9: Edit approval flow (secretary / stylist → cashier)

- **Description:** Create `ticket_edit_requests` table. Secretary/stylist submits an edit request instead of editing directly. Cashier sees a badge for pending requests and can approve or reject. Approval updates the ticket item; rejection leaves it unchanged. Notification sent to requester on decision. Resolve action is wrapped in a DB transaction.
- **Acceptance Criteria:**
  - `ticket_edit_requests` table created with correct schema
  - Secretary/stylist sees "Request edit" (not direct edit)
  - Cashier sees a badge/count for pending requests
  - Approval updates the ticket item in a transaction with the request status update
  - In-app notification sent to the requester on decision
- **Testing Steps:**
  - As stylist, submit an edit request — verify the cashier sees a badge
  - As cashier, approve the request — verify ticket item is updated and notification sent
  - Kill the process mid-transaction — verify both the ticket item and request status are rolled back
- **Dependencies:** Task 4A.3, Task 4A.10

- **Status:** Done

---

### Task 4A.10: In-app notification system (MVP)

- **Description:** Create `notifications` table (`id`, `recipient_employee_id`, `message`, `link (nullable)`, `is_read`, `created_at`). Bell icon in the nav shell shows unread count. Clicking the bell opens a dropdown list. Real-time delivery via `packages/realtime`. Notifications auto-archive after 7 days. Grouped if same type within 5 minutes.
- **Acceptance Criteria:**
  - Notification created when cashier approves/rejects an edit request
  - Bell icon shows unread count badge
  - Clicking a notification marks it read and navigates to the linked screen
  - "Mark all as read" action in the dropdown header
  - Notifications auto-archive after 7 days
  - Empty state shown in the dropdown when no notifications exist
- **Testing Steps:**
  - Approve an edit request — verify a notification appears in the recipient's bell within 2 seconds
  - Click "Mark all as read" — verify all notifications show as read
- **Dependencies:** Task 0B.4

- **Status:** Done

---

### Task 4A.11: Ticket reopen and earnings recompute flag (cashier)

- **Description:** Cashier can reopen a closed ticket. On reopen: status → `reopened`; any payout that included this ticket's earnings is flagged `needs_review`. Cashier must go through checkout again to re-close.
- **Acceptance Criteria:**
  - "Reopen" button visible on closed tickets in the history view (cashier only)
  - Status transitions correctly; real-time event fires
  - Payout records including this ticket are flagged `needs_review`
- **Testing Steps:**
  - Reopen a closed ticket — verify status is `reopened` and payout is flagged
  - As secretary, attempt to reopen — verify 403
- **Dependencies:** Task 4A.6

- **Status:** Done

---

### Task 4A.12: Closed ticket history view (admin / cashier)

- **Description:** Build the operational history screen: all closed tickets for any business day. Search by client name. Each ticket shows employee, client, service, total, payment method, and who closed it. Clicking a ticket shows its full detail.
- **Acceptance Criteria:**
  - Defaults to today's closed tickets; can navigate to any previous business day
  - Search by client name (saved or guest)
  - Full detail view on ticket click (line items, payment breakdown, override notes)
  - Responsive
  - Empty state shown when no closed tickets exist for the selected day
- **Testing Steps:**
  - Close a ticket; open the history view — verify it appears
  - Search by the client name — verify the ticket is found
- **Dependencies:** Task 4A.6

- **Status:** Done

---

### Task 4A.13: Admin home / day-at-a-glance screen

- **Description:** Build the admin landing page: business day status, live count of open tickets (via real-time events), revenue collected today, and quick-action buttons. Unsettled earnings alert stub (wired in Phase 7). Empty state when no business day is open.
- **Acceptance Criteria:**
  - Shows current day status (open/closed)
  - Live open ticket count updates via real-time events
  - Revenue = sum of closed ticket totals for today
  - Quick-action links to key admin screens
  - Empty state shown when no business day is open or when open but no activity
- **Testing Steps:**
  - Open a business day and log a ticket — verify the open ticket count increments in real-time
  - Close the business day — verify status badge updates
- **Dependencies:** Task 4A.4, Task 4A.6

- **Status:** Done

---

## Phase 4B: Craftables (Cloth Production)

### Task 4B.1: Craftables and craftable_pieces table migration

- **Description:** Create `craftables`: `id`, `business_day_id (FK)`, `created_by`, `notes (nullable)`, `large_order_id (FK nullable)`, `source (pgEnum: manual | large_order)`, `auto_approved (bool default false)`, `created_at`. Create `craftable_pieces`: `id`, `craftable_id (FK)`, `cloth_piece_id (FK)`, `quantity (int ≥ 1 default 1)`, `assigned_to_employee_id (FK nullable)`, `claim_source (pgEnum: assigned | self_claimed nullable)`, `claimed_at (nullable)`, `status (pgEnum: pending | done_pending_approval | approved)`, `completed_at (nullable)`, `approved_at (nullable)`, `approved_by (nullable)`, `color (varchar 80 nullable)`, `style (varchar 80 nullable)`, `size (varchar 40 nullable)`, `instructions (text nullable)`, `version (int)`.
- **Acceptance Criteria:**
  - Both migrations run without errors
  - `status` and `source` use Drizzle `pgEnum`
  - `large_order_id` is nullable FK
  - `quantity` check constraint `>= 1`
  - `version` column present for optimistic locking
- **Testing Steps:**
  - Insert a `craftable_piece` with `quantity = 0` — verify DB rejects it
- **Dependencies:** Task 1.8, Task 0A.5

- **Status:** Done

---

### Task 4B.2: Craftable creation UI (secretary / admin)

- **Description:** Build the craftable creation form: add pieces by selecting piece type, quantity, assignee (or leave unassigned), and per-piece notes (color, style, size, instructions). Each craftable is linked to the current open business day. If creator is `cashier_admin`, set `auto_approved = true`. In-app notification sent to each assigned clothier.
- **Acceptance Criteria:**
  - Secretary and admin can create craftables
  - Pieces can be assigned to different clothiers per row
  - Unassigned pieces visible to all clothiers on their home screen
  - Craftable linked to the current open business day
  - `auto_approved` set based on creator's role
  - In-app notification sent to each clothier who receives an assignment
  - Per-piece fields (quantity, color, style, size, instructions) present and saved
- **Testing Steps:**
  - As admin, create a craftable — verify `auto_approved = true` in the DB
  - As secretary, create a craftable — verify `auto_approved = false`
  - Assign a piece to a clothier — verify they receive an in-app notification
- **Dependencies:** Task 4B.1, Task 2.6, Task 4A.10

- **Status:** Done

---

### Task 4B.3: Clothier home screen — craftable view and piece completion

- **Description:** Build the clothier home screen: list of craftable pieces assigned to them (or unassigned) for the current business day. Clothier can claim unassigned pieces (optimistic locking, conflict message if lost race) and mark pieces as done. Display quantity and per-piece notes (collapsible). Auto-approved craftables skip the intermediate `done_pending_approval` state. Mobile-first; large tap targets; progress bar showing batch completion.
- **Acceptance Criteria:**
  - Clothier sees only pieces assigned to them AND unassigned pieces
  - Unassigned pieces have a "Claim" button; successful claim sets `assigned_to_employee_id`, `claim_source = self_claimed`, `claimed_at`
  - Two simultaneous claims → one wins, one gets "already claimed" message (optimistic locking)
  - "Mark as done" on `auto_approved` craftable → piece immediately transitions to `approved`
  - "Mark as done" on non-`auto_approved` craftable → piece transitions to `done_pending_approval`
  - Quantity and per-piece notes visible (notes collapsible)
  - Progress bar (e.g. "4/10 approved") visible per craftable
  - Empty state when no pieces assigned or available
- **Testing Steps:**
  - Simultaneously click "Claim" for the same piece from two sessions — verify one wins, one gets conflict error
  - Mark a piece done on an `auto_approved` craftable — verify status jumps directly to `approved`
- **Dependencies:** Task 4B.2

- **Status:** Done

---

### Task 4B.4: Piece approval flow (secretary / admin)

- **Description:** Build the secretary/admin view of pending piece approvals. They can approve (status → `approved`, timestamps set) or directly mark pieces approved without waiting for the clothier. Confirmation dialog required before approving.
- **Acceptance Criteria:**
  - Pending approvals visible in a dedicated section or badge
  - Approve action updates `status`, `approved_at`, `approved_by`
  - Admin can approve directly without clothier interaction
  - Confirmation dialog required before approving
- **Testing Steps:**
  - Mark a piece as done (as clothier); as admin, approve it — verify status, timestamps set correctly
  - As clothier, attempt to approve a piece — verify 403
- **Dependencies:** Task 4B.3

- **Status:** Done

---

## Phase 5: Appointments

### Task 5.1: Appointments table migration

- **Description:** Create `appointments`: `id`, `client_id (FK nullable)`, `guest_name (nullable)`, `stylist_employee_id (FK)`, `service_variant_id (FK nullable)`, `service_summary (text)`, `scheduled_at (timestamp tz)`, `duration_minutes (default 60)`, `status (pgEnum: booked | confirmed | completed | cancelled | rescheduled | no_show)`, `cancelled_at (nullable)`, `cancellation_reason (nullable)`, `confirmation_sent_at (nullable)`, `price_change_acknowledged (bool default true)`, `created_by`, `created_at`, `updated_at`.
- **Acceptance Criteria:**
  - Migration runs without errors
  - `status` uses Drizzle `pgEnum`
  - Either `client_id` or `guest_name` must be present
  - `price_change_acknowledged` defaults to `true` (not `false`) — fresh bookings have no pending price change
  - `service_variant_id` nullable FK exists
- **Testing Steps:**
  - Insert an appointment with neither `client_id` nor `guest_name` — verify it is rejected
  - Query a freshly inserted appointment — verify `price_change_acknowledged = true`
- **Dependencies:** Task 3.1, Task 1.1

- **Status:** Done

---

### Task 5.2: Appointment booking UI (secretary / cashier)

- **Description:** Build the appointment booking form: client (saved or guest), service summary, optional `service_variant_id`, stylist selector, date, time, duration. Validate no overlap before inserting. Overlap → clear error showing the conflicting appointment time. In-app notification sent to the assigned stylist.
- **Acceptance Criteria:**
  - Date and time pickers usable on mobile
  - Stylist selector shows only active stylists
  - Overlap validation runs before insert
  - Conflict → clear error with the conflicting appointment time
  - Notification sent to the assigned stylist
- **Testing Steps:**
  - Book two appointments for the same stylist at the same time — verify the second fails with a clear error
  - Book an appointment — verify the stylist receives an in-app notification
- **Dependencies:** Task 5.1, Task 3.2, Task 4A.10

- **Status:** Done

---

### Task 5.3: Double-booking prevention at the database level

- **Description:** Add a DB-level constraint (serializable transaction or exclusion constraint on `(stylist_employee_id, scheduled_at, duration_minutes)`) to guarantee no two appointments overlap, even under concurrent writes.
- **Acceptance Criteria:**
  - Two concurrent booking attempts for the same slot → exactly one succeeds, one receives a user-friendly error
  - Existing overlapping data is blocked on insert (not silently accepted)
- **Testing Steps:**
  - Send two concurrent booking requests for the same slot — verify exactly one record created
- **Dependencies:** Task 5.2

- **Status:** Done

---

### Task 5.4: Appointment list and calendar view (secretary / cashier)

- **Description:** Build the appointments screen: a daily calendar showing appointments grouped by stylist. Navigate to any date. Filter by stylist. Desktop: day view (time slots × stylists). Mobile: stacked list. Status badges from the design system.
- **Acceptance Criteria:**
  - Defaults to today's appointments
  - Can navigate to any date
  - Filter by stylist works
  - Appointment cards show client name, service summary, time, status
  - Responsive (desktop day view, mobile stacked list)
  - Appointments with `price_change_acknowledged = false` shown with amber highlight/badge
  - Empty state shown when no appointments exist for the selected day
- **Testing Steps:**
  - Open the calendar for a day with no appointments — verify empty state
  - Book an appointment — verify it appears on the calendar at the correct time slot
- **Dependencies:** Task 5.2

- **Status:** Done

---

### Task 5.5: Appointment status management

- **Description:** Add all six status transition actions on each appointment card: confirm, cancel (with reason), reschedule (re-runs overlap check, uses new `scheduled_at`), complete, mark no-show, reopen. All available to secretary and cashier.
- **Acceptance Criteria:**
  - All six status transitions reachable from the UI
  - Reschedule re-runs the overlap check with the new slot
  - Cancellation reason stored
  - No-show increments `clients.no_show_count` for saved clients (Task 5.6)
  - Guest no-shows update only the appointment record
- **Testing Steps:**
  - Reschedule an appointment to an already-booked slot — verify overlap error
  - Mark a no-show for a saved client — verify `no_show_count` incremented
- **Dependencies:** Task 5.2

- **Status:** Done

---

### Task 5.6: No-show count increment and decrement logic

- **Description:** Implement atomic `no_show_count` increment in `clients` when an appointment is marked no-show. If the no-show status is later reversed, decrement atomically (no-go below zero). Only saved clients are affected.
- **Acceptance Criteria:**
  - `no_show_count` increments atomically on no-show
  - Marking the same appointment no-show twice does not double-count (idempotent)
  - Reversing no-show status decrements the count (min 0)
  - Only saved clients affected
- **Testing Steps:**
  - Mark no-show twice for the same appointment — verify count incremented only once
  - Reverse the no-show — verify count decremented
- **Dependencies:** Task 3.4, Task 5.5

- **Status:** Done

---

### Task 5.7: Appointment confirmation email template

- **Description:** Build a React Email template for appointment confirmations: client name, stylist name, service summary, date/time (in `America/Bogota`), and a note to contact the salon to reschedule or cancel. Stored at `apps/web/src/emails/AppointmentConfirmation.tsx`.
- **Acceptance Criteria:**
  - Template renders correctly in React Email preview
  - Displays clearly on mobile email clients (tested in at least one mobile preview)
  - File at the correct path
- **Testing Steps:**
  - Open the React Email preview — verify the template renders correctly with sample data
  - Send a test email to a real mobile device — verify layout is readable
- **Dependencies:** Task 1.9, Task 5.5

- **Status:** Done

---

### Task 5.8: Send confirmation email action (low priority)

- **Description:** Add a "Send confirmation email" button on appointment cards (visible only when status is `booked` or `confirmed` and client has an email). Records `confirmation_sent_at` after successful send. Button disabled after first send; re-send requires a second explicit click with a confirmation prompt.
- **Acceptance Criteria:**
  - Button visible only when client email is available
  - Email delivered within 30 seconds in staging
  - `confirmation_sent_at` recorded after successful send
  - Button disabled after first send (re-send requires confirmation)
- **Testing Steps:**
  - Send confirmation — verify email arrives and `confirmation_sent_at` is set
  - Try to send again without confirmation — verify button is disabled
- **Dependencies:** Task 5.7, Task 5.5

- **Status:** Done

---

### Task 5.9: Price change notification to secretary

- **Description:** When a `service_variant` price or commission changes (recorded in the catalog audit log), find all future `booked` or `confirmed` appointments with that `service_variant_id`. Send an in-app notification to the secretary for each. Reset `price_change_acknowledged = false` on affected appointments. Deduplicate: multiple price changes before acknowledgement send only one notification.
- **Acceptance Criteria:**
  - Price change in the catalog triggers in-app notifications to secretary for all affected future appointments
  - `price_change_acknowledged` reset to `false` on affected appointments
  - Amber highlight shown in calendar for unacknowledged appointments
  - Secretary can click "Acknowledge" to set `price_change_acknowledged = true`
  - Deduplication: only one notification per appointment before acknowledgement
- **Testing Steps:**
  - Change a service variant price — verify secretary receives notifications for all affected future appointments
  - Change the same variant price again before acknowledgement — verify no duplicate notification
- **Dependencies:** Task 2.3, Task 5.1, Task 4A.10

- **Status:** Done

---

## Phase 6: Large Orders

### Task 6.1: Large orders and payments table migration

- **Description:** Create `large_orders`: `id`, `client_id (FK — saved clients only)`, `description (text)`, `total_price (bigint)`, `status (pgEnum: pending | in_production | ready | delivered | paid_in_full | cancelled)`, `estimated_delivery_at (nullable)`, `notes (nullable)`, `cancellation_reason (nullable)`, `cancelled_at (nullable)`, `created_by`, `created_at`, `updated_at`. Create `large_order_payments`: `id`, `order_id (FK)`, `amount (bigint)`, `method (payment_method_enum)`, `paid_at`, `recorded_by`.
- **Acceptance Criteria:**
  - Both migrations run without errors
  - `status` uses Drizzle `pgEnum` including `cancelled`
  - `balance_due` computed in queries (not stored)
  - Shared `payment_method_enum` reused
- **Testing Steps:**
  - Run migrations — verify zero errors
  - Insert an order; insert two payments; compute `balance_due` — verify the calculation is correct
- **Dependencies:** Task 3.1

- **Status:** Done

---

### Task 6.2: Large order creation with auto-created craftables

- **Description:** Build the large order creation form: select saved client, per-piece section (repeatable rows: piece type, quantity, assignee, color, style, size, instructions), total price, estimated delivery, notes. On submit, inside a single DB transaction: insert the `large_orders` row AND one `craftables` + one `craftable_pieces` row per piece. `auto_approved` set based on creator role. Minimum 1 piece required. Requires an open business day.
- **Acceptance Criteria:**
  - Only saved clients (not guests) can be linked to a large order
  - Each piece row has: piece type, quantity (int ≥ 1), assignee (optional), color, style, size, instructions
  - Minimum 1 piece row enforced (validation error if empty)
  - N pieces → N `craftables` + N `craftable_pieces` rows created in one transaction
  - `auto_approved` reflects creator role
  - Partial failure → zero rows persisted (rollback)
  - Requires an open business day (clear error if none)
- **Testing Steps:**
  - Create a large order with 3 pieces — verify 1 large_order + 3 craftables + 3 craftable_pieces in the DB
  - Submit with 0 pieces — verify validation error
  - Inject a DB failure mid-transaction — verify zero rows persisted
- **Dependencies:** Task 6.1, Task 4B.1

- **Status:** Done

---

### Task 6.3: Order status flow (admin / secretary)

- **Description:** Add status transition buttons to the order detail view: `pending → in_production → ready → delivered → paid_in_full`. Add a `cancelled` action available from any status except `paid_in_full`. Cancellation requires a reason. Each transition records `updated_by` and `updated_at`.
- **Acceptance Criteria:**
  - Status moves only forward (no backward transitions without a DB override)
  - `cancelled` reachable from any status except `paid_in_full`; requires a reason
  - Cancellation of an order with deposits prompts a confirmation noting deposit refundability
  - Each transition is timestamped
  - Status badge on the order card updates immediately
- **Testing Steps:**
  - Advance a status forward — verify it succeeds
  - Attempt to move backward — verify it is blocked
  - Cancel an order with a deposit — verify confirmation prompt mentions deposit
- **Dependencies:** Task 6.2

- **Status:** Done

---

### Task 6.4: Additional payment recording

- **Description:** Allow admin/secretary to record additional payments against a large order. Each payment creates a `large_order_payments` record. Balance due updates after each payment. Status automatically transitions to `paid_in_full` when balance reaches zero.
- **Acceptance Criteria:**
  - "Record payment" button on order detail view
  - Payment amount, method, and date recorded
  - Balance due updates after each payment
  - Auto-transition to `paid_in_full` when balance = 0
  - Payment history visible on order detail
- **Testing Steps:**
  - Record a payment that brings balance to zero — verify status transitions to `paid_in_full`
  - Record a partial payment — verify balance updates correctly
- **Dependencies:** Task 6.2

- **Status:** Done

---

### Task 6.5: Large orders list view (admin / secretary)

- **Description:** Build the large orders list screen: all orders with client name, status, total price, balance due, and ETA. Filter by status. Balance due highlighted in warning color if order is `delivered` but not `paid_in_full`. Sort by ETA and creation date.
- **Acceptance Criteria:**
  - List sortable by ETA and creation date
  - Filter by status works
  - Balance due highlighted if `delivered` but not `paid_in_full`
  - Responsive (works on mobile)
  - Empty state shown when no large orders exist
- **Testing Steps:**
  - Create orders with different statuses — verify filter works for each
  - Create a `delivered` order with outstanding balance — verify the warning highlight
- **Dependencies:** Task 6.3, Task 6.4

- **Status:** Done

---

## Phase 7: Payroll Settlement

### Task 7.1: Absences and vacation table migration

- **Description:** Create `employee_absences`: `id`, `employee_id (FK)`, `type (pgEnum: vacation | approved_absence | missed)`, `date (date)`, `note (nullable)`, `created_by`, `created_at`. Unique constraint on `(employee_id, date)`.
- **Acceptance Criteria:**
  - Migration runs without errors
  - `type` uses Drizzle `pgEnum`
  - Unique constraint on `employee_id + date`
- **Testing Steps:**
  - Insert two absence records for the same employee on the same date — verify unique constraint fires
- **Dependencies:** Task 1.1

- **Status:** Done

---

### Task 7.2: Vacation and absence management UI (admin)

- **Description:** Build the absence management screen: admin can log vacation, approved absence, or missed day per employee. Month-grid calendar view with colour-coded dots per absence type. Mobile: list grouped by date.
- **Acceptance Criteria:**
  - Admin can log each absence type for any employee
  - Calendar shows coloured dots per absence type (vacation = blue, approved = amber, missed = red)
  - "Who works today" query returns active employees without an absence on the current business day's date
  - Mobile: simplified list grouped by date
- **Testing Steps:**
  - Log a vacation for an employee — verify the blue dot appears on the calendar for that date
  - Query "who works today" with a vacation entry — verify the employee is excluded
- **Dependencies:** Task 7.1

- **Status:** Done

---

### Task 7.3: Deactivation guard and termination payment (Phase 7)

- **Description:** Extend basic deactivation (Task 1.14) with: block deactivation if the employee has unsettled earnings. Add a termination path (all in one transaction): admin enters a final settlement amount → creates a payout record → deactivates immediately. Show a Termination Dialog with system-computed amount (editable), method selector, and required reason when `deactivateEmployee` returns `CONFLICT`.
- **Acceptance Criteria:**
  - Deactivating an employee with unsettled earnings shows a block message listing unpaid periods
  - Termination Dialog shows computed amount, editable amount, method, required reason
  - Termination payout creation + deactivation happen in one transaction
  - After termination payout, no unsettled earnings remain
  - Deactivation with no outstanding earnings proceeds immediately
- **Testing Steps:**
  - Attempt to deactivate an employee with unsettled earnings — verify Termination Dialog appears
  - Complete the termination flow — verify payout and deactivation committed together
- **Dependencies:** Task 1.14, Task 7.8

- **Status:** Done

---

### Task 7.4: Earnings computation: stylists

- **Description:** Implement `computeStylistEarnings(employeeId, businessDayIds[])`. Sums `(override_price ?? unit_price) * commission_pct / 100` for all closed ticket items in the given business days. Excludes `needs_review` tickets. Unit-tested with at least 3 scenarios.
- **Acceptance Criteria:**
  - Returns total earnings and a line-by-line breakdown
  - Uses snapshotted prices (not live catalog)
  - Excludes `needs_review` tickets with a note in the breakdown
  - Handles zero tickets (returns 0)
  - Unit tests: normal, override price, no tickets
- **Testing Steps:**
  - Unit test: stylist with 3 tickets, one with override price — verify total uses override
  - Unit test: `needs_review` ticket excluded — verify it doesn't appear in breakdown
- **Dependencies:** Task 4A.6

- **Status:** Done

---

### Task 7.5: Earnings computation: clothiers

- **Description:** Implement `computeClothierEarnings(employeeId, businessDayIds[])`. Sums `cloth_pieces.piece_rate` for all `approved` craftable pieces assigned to the employee. Only `approved` pieces count. Unit-tested with at least 2 scenarios.
- **Acceptance Criteria:**
  - Only `approved` pieces count (not `done_pending_approval`)
  - Returns total and a line-by-line breakdown (craftable, piece type, quantity, amount)
  - Unit tests cover at least 2 scenarios
- **Testing Steps:**
  - Unit test: clothier with 3 approved pieces and 1 `done_pending_approval` — verify only 3 count
- **Dependencies:** Task 4B.4

- **Status:** Done

---

### Task 7.6: Earnings computation: secretary

- **Description:** Implement `computeSecretaryEarnings(employeeId, businessDayIds[])`. Counts business days worked (respecting `expected_work_days` per ISO week, excluding vacation and approved_absence absences). Multiplies by `employees.daily_rate`. Unit-tested with scenarios: full-time, part-time, vacation deduction, missed day. Uses ISO-week (Monday-baseline) and `America/Bogota` timezone consistently.
- **Acceptance Criteria:**
  - Vacation and `approved_absence` excluded from the worked-day count
  - Part-time support: days capped at `expected_work_days` per ISO week (Monday-baseline)
  - Returns total, day count, daily rate, and expected_work_days
  - All date/time calculations use `America/Bogota` timezone (not UTC)
  - Unit tests: full-time (6 days), part-time (3 days), vacation, missed day
- **Testing Steps:**
  - Unit test: 3-day/week secretary works 4 days in one ISO week — verify capped at 3
  - Unit test: secretary with vacation on a business day — verify that day excluded
- **Dependencies:** Task 7.2, Task 7.1

- **Status:** Done

---

### Task 7.7: Payouts table migration

- **Description:** Create `payouts`: `id`, `employee_id (FK)`, `amount (bigint)`, `original_computed_amount (bigint)`, `adjustment_reason (text nullable — required when amount ≠ original)`, `method (payment_method_enum)`, `idempotency_key (uuid unique not null)`, `paid_at`, `period_business_day_ids (int[])`, `recorded_by`, `notes (nullable)`, `created_at`. Create junction tables: `payout_ticket_items (payout_id, ticket_item_id)` and `payout_craftable_pieces (payout_id, craftable_piece_id)`.
- **Acceptance Criteria:**
  - Migrations run without errors
  - `idempotency_key` exists with a unique constraint
  - `original_computed_amount` and `adjustment_reason` columns exist
  - Junction tables exist
- **Testing Steps:**
  - Insert two payouts with the same `idempotency_key` — verify unique constraint fires
- **Dependencies:** Task 0A.5

- **Status:** Done

---

### Task 7.8: Payout recording UI (admin)

- **Description:** Build the admin payroll screen: select employee, select date range (business days), preview computed earnings with line-by-line breakdown, confirm amount (editable — `adjustment_reason` required when changed), select payment method, submit. Uses Zod schema (`recordPayoutSchema`) for input validation. Double-pay check runs inside the DB transaction (not before it). A client-generated `idempotency_key` UUID is generated when the user opens the preview screen.
- **Acceptance Criteria:**
  - Admin can select any employee and any range of business days
  - Preview shows role-specific breakdown before committing
  - Admin can adjust the amount; `adjustment_reason` required when amount ≠ computed
  - Payout record created with junction tables linked on submit
  - Settled items no longer appear in the unpaid list
  - "Pagar día de hoy" button: auto-selects today's unsettled business day for quick daily settlement
  - `recordPayout` validates all inputs with a Zod schema before business logic
  - Double-pay check runs inside the DB transaction with `SELECT … FOR UPDATE`
- **Testing Steps:**
  - Submit a payout with an adjusted amount but no reason — verify validation error
  - Submit two simultaneous payout requests for the same employee/days — verify exactly one succeeds
- **Dependencies:** Task 7.4, Task 7.5, Task 7.6, Task 7.7

- **Status:** Done

---

### Task 7.9: Double-pay prevention

- **Description:** Before creating a payout, check inside the DB transaction (with `SELECT … FOR UPDATE` on payouts for the employee) that none of the selected business days have already been covered. Block submit with a clear error listing conflicting days.
- **Acceptance Criteria:**
  - Server-side check (not only frontend) prevents duplicate settlement
  - Check runs inside the same transaction as the insert
  - Error message lists conflicting days and the prior payout ID
  - Partial overlap communicated clearly
- **Testing Steps:**
  - Create a payout; try to create a second payout for the same employee + overlapping days — verify rejection
- **Dependencies:** Task 7.8

- **Status:** Done

---

### Task 7.10: Employee earnings view (own earnings)

- **Description:** Build the "My earnings" screen for stylists, clothiers, and secretaries. Shows today, this week, this month — breakdown by job/piece — and payout history. All calculations exclude business_day_ids already covered by a payout (show what is still owed, not lifetime totals). Gated by `show_earnings` flag. All date/time calculations use `America/Bogota` and ISO-week (Monday-baseline).
- **Acceptance Criteria:**
  - Screen accessible only when `show_earnings = true`
  - Computes earnings correctly for the viewing employee's role
  - Today/week/month summaries show owed amounts (not already-paid amounts)
  - Payout history shows past payouts with date and amount
  - Responsive (primary use case is a phone)
  - Empty state shown when no earnings exist for the period
  - Nav entry for each role pointing to `/{role}/earnings` (conditional on `show_earnings`)
- **Testing Steps:**
  - Record a payout for a stylist; check their earnings screen — verify the paid days are excluded from "this week"
  - Toggle `show_earnings = false` — verify the earnings route returns 404
- **Dependencies:** Task 7.4, Task 7.5, Task 7.6, Task 1.4

- **Status:** Done

---

### Task 7.11: Unsettled earnings alert

- **Description:** On the admin dashboard, show a banner listing employees with unsettled earnings (closed business days with approved work and no payout). Uses role-aware detection (stylist: closed tickets; clothier: approved craftable pieces; secretary: closed business days minus absences). Links to each employee's payout screen.
- **Acceptance Criteria:**
  - Any closed business day with approved work and no payout triggers the alert for that employee
  - Alert disappears once a payout covers the period
  - Alert visible on admin home screen
  - Empty state when all earnings are settled
- **Testing Steps:**
  - Close a business day with a stylist ticket; check admin home — verify alert appears for that stylist
  - Record a payout for that stylist — verify the alert disappears
- **Dependencies:** Task 7.8

- **Status:** Done

---

## Phase 8: Analytics

### Task 8.1: Analytics data queries

- **Description:** Write core Drizzle queries in `packages/db/src/queries/analytics.ts`: `revenueByPeriod(start, end)`, `jobsCountByEmployee(start, end)`, `earningsByEmployee(start, end)`. Include open business day in the current window (do not filter `closedAt IS NOT NULL` for the current period). Secretary earnings fully included (not returning 0). All queries accept date ranges as business day IDs.
- **Acceptance Criteria:**
  - Queries return correct results on a dataset with ≥ 30 days of seeded data
  - All queries complete in < 500 ms
  - Current open business day included in current-period revenue
  - Secretary earnings included in `earningsByEmployee` (matches `computeSecretaryEarnings` output for the same window)
  - Queries in `packages/db/src/queries/analytics.ts`
- **Testing Steps:**
  - Seed 30 days of data; run all three queries — verify correct totals
  - Run queries with an open business day — verify its tickets are included
  - Unit test: `earningsByEmployee` for a secretary matches `computeSecretaryEarnings` for the same window
- **Dependencies:** Task 4A.6, Task 7.7

- **Status:** Done

---

### Task 8.2: Daily revenue dashboard

- **Description:** Build the analytics home screen for admin: daily revenue, total jobs, earnings paid out (current day or most recent closed day), comparison to the prior business day (delta and percentage). Updates in near-real-time via `packages/realtime` on ticket close. Uses Recharts for any chart elements.
- **Acceptance Criteria:**
  - Shows current day totals prominently
  - Comparison row shows delta vs yesterday
  - Near-real-time updates on ticket close (throttled to 1 refresh/5s during batch closes)
  - Empty state when no data for the current period
  - Responsive
- **Testing Steps:**
  - Close a ticket — verify the dashboard revenue updates within 5 seconds
  - Visit analytics with no data — verify empty state
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.3: Weekly and monthly revenue dashboards

- **Description:** Extend the analytics screen with weekly (ISO week, Monday-baseline) and monthly (calendar month) tabs. Each tab shows revenue, jobs count, earnings paid vs prior period. Bar charts (Recharts) compare current vs prior period. Prior-period window truncated to the same weekday offset for week comparisons (apples-to-apples). Loading state while queries run.
- **Acceptance Criteria:**
  - Tabs for day / week / month
  - Prior period comparison visible in all three tabs
  - Week/month calculations use business days
  - Week comparison uses same-weekday-offset prior window (not full 7-day vs partial current week)
  - Loading skeleton while queries run
- **Testing Steps:**
  - On a Wednesday, check the weekly tab — verify prior period is also Mon–Wed (not Mon–Sun)
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.4: Per-employee performance views

- **Description:** Add a "By employee" section: table showing each active employee, job count, and earnings for the selected period. Sortable by any column. Inactive employees excluded by default; toggle to include. Clicking an employee opens a drill-down with day-by-day breakdown. Secretary drill-down respects `expected_work_days` cap per ISO week.
- **Acceptance Criteria:**
  - Table shows active employees (inactive excluded by default; toggle to include)
  - Sortable by name, jobs count, earnings
  - Drill-down shows per-business-day breakdown
  - `includeInactive` query parameter threads through to all queries
  - Secretary drill-down respects the ISO-week cap from Task 7.6
- **Testing Steps:**
  - Deactivate an employee; check the analytics table — verify they are hidden by default
  - Toggle "Include inactive" — verify they appear
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.5: Analytics database indexes

- **Description:** Analyze analytics queries (Task 8.1) with `EXPLAIN ANALYZE` on Neon. Add composite indexes: `tickets(business_day_id, status)`, `ticket_items(ticket_id)`, `craftable_pieces(business_day_id, status, assigned_to_employee_id)`. Target: all analytics queries < 200 ms.
- **Acceptance Criteria:**
  - All analytics queries complete in < 200 ms on 6 months of seeded data
  - No sequential scans on large tables
  - Indexes documented in schema file comments
- **Testing Steps:**
  - Run `EXPLAIN ANALYZE` on each analytics query before and after adding indexes — verify improvement
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.6: Analytics seed script

- **Description:** Create `db:seed:analytics` generating ~180 business days (6 months) of realistic data. Script tags seeded rows (e.g. using a naming prefix) so `clearAnalyticsData` deletes only seeded rows, never real production data. Requires `--confirm-destructive` flag.
- **Acceptance Criteria:**
  - Script generates ~180 days of data with variation (weekdays vs weekends, different employee loads)
  - All analytics queries return meaningful non-zero results after seeding
  - Script is idempotent (re-running does not create unbounded duplicates)
  - Only seeded rows are deleted by the clear command — never real data
  - Requires `--confirm-destructive` flag with a loud banner listing tables to be cleared
- **Testing Steps:**
  - Run the seed twice — verify no unbounded data growth
  - Run without `--confirm-destructive` — verify it is blocked with a warning
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.7: CSV export

- **Description:** Add a "Download CSV" button to the analytics screen. Exports the selected period's data (date, revenue, jobs count, per-employee earnings). File name includes the period. Download works on mobile.
- **Acceptance Criteria:**
  - CSV includes: business day date, revenue, jobs count, per-employee earnings
  - File name includes the period (e.g. `innovation-befine-2026-03.csv`)
  - Download works on mobile (opens as a file)
  - Button disabled when no data for the selected period
- **Testing Steps:**
  - Export CSV for a seeded period — verify the file downloads and contains correct data
  - Export with no data — verify button is disabled
- **Dependencies:** Task 8.1

- **Status:** Done

---

### Task 8.8: Performance testing

- **Description:** Run performance benchmarks against `docs/standards.md` targets using seeded data from Task 8.6. Measure API response times, client-side navigation times, and SSE delivery latency. Document results in `docs/testing/performance-results.md`. Flag any miss as a blocking issue.
- **Acceptance Criteria:**
  - All analytics queries < 200 ms post-indexes
  - All non-analytics API endpoints < 500 ms (P95)
  - Client-side navigation (dashboard → checkout) < 1.5 s
  - LCP on mid-range mobile (4G throttle): login < 1.5 s, cashier dashboard < 2.5 s
  - SSE event delivery latency < 2 s
  - Results documented in `docs/testing/performance-results.md`
  - Any miss flagged as blocking in the issues tracker
- **Testing Steps:**
  - Run each analytics query 10 times and record P95 — verify all < 200 ms
  - Measure LCP using Chrome DevTools (mobile emulation, 4G throttle) for each listed page
- **Dependencies:** Task 8.6

- **Status:** Done

---

## Phase 9: Offline / Sync Hardening

### Task 9.1: Idempotency keys on mutating API routes

- **Description:** Create `idempotency_keys` table: `key (text PK)`, `route`, `response_body (jsonb)`, `created_at`, `expires_at`. Wrap `checkIdempotency` + mutation + `storeIdempotency` in a single DB transaction (using `ON CONFLICT … DO UPDATE … RETURNING` to atomically fetch-or-insert). Keys expire after 24 hours. Cover: ticket creation, craftable piece mark-done.
- **Acceptance Criteria:**
  - `idempotency_keys` migration runs without errors
  - Ticket creation with the same key twice → second call returns the first response (no duplicate)
  - Keys expire after 24 hours (lazy cleanup on lookup)
  - Both `checkIdempotency` and `storeIdempotency` run inside the same DB transaction as the mutation
- **Testing Steps:**
  - Submit ticket creation twice with the same key — verify only one ticket created
  - Set a key's `expires_at` to the past; submit a new request with that key — verify it is treated as a miss (not a hit)
- **Dependencies:** Task 4A.1, Task 4B.1

- **Status:** Done

---

### Task 9.2: IndexedDB local mutation queue

- **Description:** Using `idb`, create a mutation queue persisted in IndexedDB. Offline ticket creation and craftable piece mark-done write to the queue with a client-generated UUID as the idempotency key. Offline cashier checkout: tickets marked `paid_offline` with payment method. Background flush sends queued actions in order on reconnect (cashier version always wins on conflict).
- **Acceptance Criteria:**
  - Ticket creation while offline queues the action in IndexedDB
  - `paid_offline` checkout while offline queues: ticket IDs, payment method, amount, cashier ID, idempotency key
  - On reconnect, queued actions sent in order with their idempotency keys
  - `paid_offline` sync: server creates `checkout_session` and closes tickets atomically; cashier wins on conflict
  - Duplicate retry with the same key does not create a duplicate record
  - Queue persists across page reloads and browser restarts
- **Testing Steps:**
  - Go offline; create a ticket; go online — verify the ticket appears on the server
  - Submit the same offline action twice — verify no duplicate created
- **Dependencies:** Task 9.1

- **Status:** Done

---

### Task 9.3: Sync status UI

- **Description:** Add a persistent sync indicator in the app header: online+synced (neutral), online+syncing (spinner + "Syncing…"), offline (warning banner with offline-checkout note), sync failed (error icon + count + "Retry" button). `paid_offline` tickets show a distinct count badge. Failed count visible in the offline banner.
- **Acceptance Criteria:**
  - Indicator updates within 1 second of connectivity change
  - Failed items show a count (not just an icon), including in the offline state
  - "Retry" manually triggers the flush
  - Banner is non-blocking
  - `paid_offline` pending sync count displayed as a distinct badge
- **Testing Steps:**
  - Go offline — verify the warning banner appears within 1 second
  - Trigger a sync failure — verify the count increments in the banner
- **Dependencies:** Task 9.2

- **Status:** Done

---

### Task 9.4: Service worker with Workbox

- **Description:** Add a service worker using Workbox (use `@ducanh2912/next-pwa` or a custom Workbox config — verify Next.js version compatibility). Cache strategy: App shell → Cache First; API GETs (catalog, clients) → Stale While Revalidate; POST/PUT/DELETE/PATCH → explicit `NetworkOnly` rule (not relying on Workbox defaults).
- **Acceptance Criteria:**
  - Service worker registered on production build
  - App shell loads offline
  - Catalog data served from cache when offline
  - Explicit `NetworkOnly` rule for POST, PUT, DELETE, PATCH methods
  - No console errors during normal online use
- **Testing Steps:**
  - Turn off the network in DevTools — verify the app shell loads and the catalog is accessible
  - Inspect `sw.js` — verify an explicit `NetworkOnly` rule exists for mutating HTTP methods
- **Dependencies:** Task 0A.1

- **Status:** Done

---

### Task 9.5: Web App Manifest and PWA

- **Description:** Create `app/manifest.ts` with app name, icons (192×192 and 512×512 in PNG — not SVG only), theme color, background color, `display: "standalone"`. At least one 512-px entry must have `purpose: "any maskable"`. Add install prompt for mobile users. Achieve Lighthouse PWA score ≥ 80.
- **Acceptance Criteria:**
  - Lighthouse PWA score ≥ 80 on production (recorded in `docs/testing/performance-results.md`)
  - Install prompt appears on Android Chrome after first visit
  - App name and icon appear correctly when installed to home screen
  - Manifest passes Next.js build validation
  - PNG icons (192×192 and 512×512) used; at least one 512-px entry with `purpose: "any maskable"`
- **Testing Steps:**
  - Run Lighthouse PWA audit on the production build — verify score ≥ 80
  - Install the app on an Android device — verify icon and name are correct
- **Dependencies:** Task 9.4, Task 1.11

- **Status:** Done

---

## Phase 10: Polish and Rollout

### Task 10.1: Responsive QA pass

- **Description:** Test every role's primary flows on mobile (360px) and desktop (1920px). Verify: no horizontal scroll on mobile, all touch targets ≥ 44×44 px, legible text, forms fillable with phone keyboard, all critical actions ≤ 3 taps. Cross-browser matrix: Chrome 120+, Firefox 120+, Safari 17+ (iOS + macOS), Edge 120+. Capture defects in the issues tracker.
- **Acceptance Criteria:**
  - No horizontal scroll on mobile for any primary flow
  - All touch targets ≥ 44×44 px
  - Text ≥ 12 px at mobile font size
  - Forms fillable without content covered by the virtual keyboard
  - Critical actions reachable within 3 taps on mobile
  - All four browser/engine combinations tested
- **Testing Steps:**
  - Walk every role's primary flow at 360px — record any horizontal scroll or tap-target issue
  - Test each primary flow in Safari on iOS — record any rendering differences
- **Dependencies:** All previous phases

- **Status:** Done

---

### Task 10.2: Loading states and optimistic UI audit

- **Description:** Audit every server-triggered action. Add skeletons or spinners on initial data loads. Disable + spinner on submit buttons while submitting. Optimistic updates for ticket status changes (revert on error). Ensure no blank flash on any primary screen.
- **Acceptance Criteria:**
  - No "blank flash" on any primary screen page load
  - Submit buttons disabled after first click; re-enabled on error
  - Optimistic ticket status update reverts to previous state on API error
  - Error messages user-friendly (not raw API errors)
- **Testing Steps:**
  - Navigate to the cashier dashboard with slow network (DevTools throttle) — verify skeleton renders
  - Optimistically update a ticket status; mock a server error — verify the UI reverts
- **Dependencies:** All previous phases

- **Status:** Done

---

### Task 10.3: Database backup policy documentation and drill

- **Description:** Document Neon's built-in backup behavior and retention window. Perform a restore drill on the staging branch: drop a table, restore to a prior point. Set up a Neon alert for storage limits.
- **Acceptance Criteria:**
  - Backup retention window documented in `docs/research/backup-policy.md`
  - Restore drill performed and documented (drop table → restore → verify data)
  - Admin receives a Neon storage alert before hitting limits
- **Testing Steps:**
  - On the staging Neon branch: drop a table, restore to a point before the drop — verify data is present
- **Dependencies:** Task 0A.4

- **Status:** Done

---

### Task 10.4: Uptime monitoring setup

- **Description:** Set up an uptime monitor to ping `/api/health` every 5 minutes. `/api/health` returns `{ status: "ok", db: "ok" }` (200) or `{ status: "degraded", db: "unreachable" }` (503) based on a lightweight `SELECT 1` check. Alert email sent within 5 minutes of downtime.
- **Acceptance Criteria:**
  - `/api/health` endpoint returns correct status and DB check result
  - Monitor configured to check every 5 minutes
  - Alert email sent within 5 minutes of a downtime event (tested by returning 500)
- **Testing Steps:**
  - Return 500 from `/api/health` temporarily — verify alert email arrives within 5 minutes
- **Dependencies:** Task 0A.3

- **Status:** Done

---

### Task 10.5: Internal training guides per role

- **Description:** Write a Markdown training guide per role (cashier/admin, stylist, clothier, secretary). Each covers the daily workflow concisely (< 5 minutes to read). Include screenshots or recordings for the 2–3 most confusing steps. Document iOS PWA "Add to Home Screen" instructions. Store in `docs/training/`.
- **Acceptance Criteria:**
  - One guide per role, readable in < 5 minutes
  - 2–3 annotated screenshots on the hardest steps per guide
  - Screenshots use a consistent annotation style (red outline + numbered callout)
  - iOS PWA instructions included
  - Stored in `docs/training/`
- **Testing Steps:**
  - Hand each guide to a new staff member — verify they complete their highlighted flow without clarification
- **Dependencies:** All previous phases

- **Status:** Done

---

### Task 10.6: Stale-tab version detection

- **Description:** Embed a build-time version ID (`NEXT_PUBLIC_BUILD_ID` from git commit hash or timestamp). Client polls `/api/version` every 5 minutes. If deployed version differs from the client's version, show a non-blocking "A new version is available — please refresh" banner with "Refresh now" and "Dismiss". Banner does not interrupt active checkout or form submission.
- **Acceptance Criteria:**
  - Version identifier embedded at build time
  - Client polls `/api/version` every 5 minutes
  - Banner appears when versions differ; includes "Refresh now" and "Dismiss"
  - Banner does not interrupt an active checkout or form submission
  - Reappears on next check after dismiss
- **Testing Steps:**
  - Open the app; deploy a new version; wait 5 minutes — verify the banner appears
  - Click "Dismiss" — verify the banner disappears; verify it reappears on the next check
- **Dependencies:** Task 0A.3

- **Status:** Done

---

### Task 10.7: Data migration from existing spreadsheets

- **Description:** Create a migration script or admin UI to import existing client records from CSV (columns: name, phone, email). Detect duplicates by phone or email (skip or flag). Report: X imported, Y skipped, Z errors. Idempotent. Optional: import no-show counts.
- **Acceptance Criteria:**
  - Script accepts a CSV with name, phone, email columns
  - Duplicate detection by phone or email (skip duplicates with a warning)
  - Import summary logged: imported, skipped, errors
  - Imported clients appear in client search immediately
  - Script is idempotent (safe to run multiple times)
- **Testing Steps:**
  - Import a CSV with one duplicate phone — verify one record created, one skipped with a warning
  - Run the same import twice — verify no duplicate records created
- **Dependencies:** Task 3.1, Task 3.2

- **Status:** Done

---

### Task 10.8: User acceptance testing (UAT)

- **Description:** Each role representative completes one full simulated business day on staging with realistic data. Structured feedback collected per participant. All critical feedback addressed before go-live. UAT sign-off recorded with participant name, date, and verdict.
- **Acceptance Criteria:**
  - Staging populated with realistic data (clients, services, employees, historical tickets)
  - One representative per role completes their full daily workflow
  - Structured feedback collected: task completed (yes/no), time taken, confusion points, gaps
  - Critical feedback items addressed before Task 10.9 (go-live)
  - UAT sign-off recorded: name, date, verdict (ready / not ready)
- **Testing Steps:**
  - Schedule UAT session with each role representative — capture all feedback
  - Address every "not ready" feedback item — re-verify with the participant
- **Dependencies:** Task 10.5

- **Status:** Done

---

### Task 10.9: Production cutover checklist

- **Description:** Execute the go-live checklist before switching staff from spreadsheets to the app. Includes security review (CSRF, XSS/CSP headers, rate limiting, SQL injection prevention, no PII in error responses) and rollback drill (deploy bad version to staging, verify Vercel rollback < 5 minutes, confirm DB restore process). Business owner "go / no-go" decision required before staff cutover.
- **Acceptance Criteria:**
  - All environment variables set in Vercel production
  - Neon production branch migrated to latest schema
  - All employee accounts created and passwords set
  - Admin tested open-day → checkout → close-day on production
  - Sentry receiving events; uptime monitor active
  - Training guide distributed to all staff
  - Security review completed: CSRF, XSS/CSP, rate limiting, SQL injection, no PII in errors
  - Rollback drill completed: < 5 minutes via Vercel
  - Business owner "go / no-go" sign-off recorded
- **Testing Steps:**
  - Walk the complete checklist — verify every item ticked and documented
  - Perform the rollback drill on staging — verify system is back in < 5 minutes
- **Dependencies:** Task 10.1, Task 10.2, Task 10.3, Task 10.4, Task 10.5, Task 10.7, Task 10.8

- **Status:** Done
