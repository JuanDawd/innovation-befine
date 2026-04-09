# CLAUDE.md — Project conventions for Claude Code

This file is automatically loaded by Claude Code at the start of every session.
It consolidates all project rules (originally in `.cursor/rules/`).

---

## Locked stack

| Purpose        | Technology                                     | Never suggest                        |
| -------------- | ---------------------------------------------- | ------------------------------------ |
| Framework      | Next.js **App Router**                         | Pages Router                         |
| ORM            | Drizzle ORM                                    | Prisma, raw SQL outside migrations   |
| Auth           | Better Auth with RBAC plugin                   | next-auth, clerk, lucia              |
| Server state   | TanStack Query                                 | SWR, Apollo, trpc-react              |
| Client state   | Zustand (ephemeral UI only)                    | Redux, Jotai, Recoil                 |
| Forms          | React Hook Form + Zod resolver                 | Formik, final-form                   |
| Realtime       | `packages/realtime` (Pusher abstraction)       | Pusher SDK directly in app code      |
| UI             | shadcn/ui + Tailwind CSS                       | Material UI, Chakra, Mantine         |
| Charts         | Recharts                                       | Chart.js, D3 directly, Nivo          |
| Icons          | Lucide Icons                                   | heroicons, react-icons, fontawesome  |
| Email          | Resend + React Email                           | nodemailer, sendgrid                 |
| Error tracking | Sentry                                         | bugsnag, logrocket                   |
| i18n           | next-intl — Spanish primary, English secondary | react-i18next, next-translate        |
| Dates          | date-fns + date-fns-tz                         | dayjs, moment, luxon                 |
| Money          | integer pesos (`bigint` column)                | float, numeric, decimal, real        |
| DB             | PostgreSQL via Neon (serverless driver)        | MySQL, SQLite, Supabase              |
| Hosting        | Vercel                                         | Netlify, AWS Amplify                 |
| Monorepo       | Turborepo                                      | Nx, Lerna                            |
| Testing        | Vitest (unit/integration) + Playwright (E2E)   | Jest, Cypress, Testing Library alone |
| Rate limiting  | @upstash/ratelimit                             | express-rate-limit                   |

## Domain terms — use exactly these, no synonyms

| Correct term            | Never use                                                |
| ----------------------- | -------------------------------------------------------- |
| `business_day`          | workday, shift, session, operating_day                   |
| `ticket`                | order, job_card, appointment_ticket, invoice             |
| `checkout`              | payment, close_ticket, charge                            |
| `batch` (cloth batch)   | order, job, production_order                             |
| `piece` (cloth piece)   | item, unit, garment                                      |
| `settlement` / `payout` | salary, paycheck, wage                                   |
| `commission`            | stylist earnings model — percentage of service price     |
| `piece_rate`            | clothier earnings model — fixed amount per piece         |
| `daily_rate`            | secretary earnings model — fixed amount per business day |
| `saved_client`          | registered_user, member, customer                        |
| `guest`                 | anonymous, walk_in, unregistered                         |
| `service_variant`       | service_option, sku                                      |
| `price_override`        | discount, adjustment                                     |
| `business_day_id`       | date, calendar_date                                      |

## Currency and timezone

- **COP (Colombian Pesos)** — no cents, 1 peso is the smallest unit. Format: `$12.500` (dot as thousands separator, no decimals, peso sign prefix).
- **Timezone: America/Bogota (UTC-5)** — fixed, no DST. Store timestamps as UTC; display in business timezone.

---

## Commit convention — one commit per task

When completing tasks from `docs/Business/progress.md`:

- Commit **immediately** after finishing each task — never batch multiple tasks into one commit.
- Format: `feat(T0XX): short description of what was done`
  - Example: `feat(T095): add GitHub Actions CI pipeline`
  - Example: `feat(T007): integrate Better Auth with RBAC plugin`
- Include in each commit: all files created or modified for that task, plus the `progress.md` status update.
- Never move on to the next task without committing the current one first.

---

## Model workflow — Sonnet for tasks, Opus for phase reviews

### During task development (Sonnet — default)

All individual task work (T001–T108) is done with the current model (Sonnet):

- Implementing features, writing migrations, building UI, writing tests
- Running the per-task QA gate (see QA section below)
- Committing per task
- When spawning subagents via the Agent tool, use `model: "haiku"` for fast/cheap subtasks

### Phase completion review (Opus)

When the **last task in a phase** is marked `done`, stop and tell the user:

> "Phase [N] is complete. Switch to Opus (`claude --model claude-opus-4-6`) and prompt: 'Phase [N] is complete. Run the phase completion review.'"

**What the Opus phase review does:**

1. Full audit — re-read every task's acceptance criteria and verify each AC is met in code
2. Cross-task integration check — verify tasks that depend on each other work end-to-end
3. Regression sweep — run `turbo test` and confirm no regressions
4. Security & edge-case scan — endpoints, permissions, input validation, error handling
5. Code quality review — dead code, inconsistent patterns, missing types, duplicated logic
6. Issue consolidation — review `docs/issues-tracker.md` and verify open issues are still valid

**After the audit, Opus creates a remediation sub-phase in `docs/Business/progress.md`:**

```
## Phase [N]R — Remediation

| ID      | Task                | Status  | Source     |
| ------- | ------------------- | ------- | ---------- |
| T0XX-R1 | Fix: [description]  | pending | Opus audit |
```

- IDs: `T0XX-R#` where `XX` is the phase number, `#` is sequential
- Severity must be noted — Critical and High are **blocking**
- Do NOT start the next phase until all Critical and High remediation tasks are `done`
- Medium and Low may be deferred to `docs/issues-tracker.md`

---

## QA gate — run after every completed task

Before marking any task done and before committing:

### 1. Acceptance criteria verification

- Re-read every AC checkbox for the task
- Verify each one is actually met in code, not just assumed
- UI tasks: check mobile AND desktop viewport
- API tasks: test with valid input, invalid input, and unauthorized role

### 2. Edge case and error path testing

- **Invalid input**: empty strings, null, too-long strings, special characters
- **Permission boundary**: call the endpoint/action as a role that should NOT have access — verify 403
- **Stale data**: what happens if the entity was modified between page load and form submit?
- **Empty state**: does the screen handle zero records gracefully?
- **Concurrent access**: for features involving shared state (tickets, payouts, business_day), consider two simultaneous users

### 3. Regression check

- Run `turbo test` to verify no existing tests broke
- Manually verify the 2–3 features most closely related to this task still work
- If the task modified a shared table (tickets, employees, clients, business_days), check downstream features

### 4. Financial accuracy (money-related tasks only)

- Verify integer peso storage — no floats, no decimals in DB
- Test with known inputs and pre-calculated expected outputs
- Test boundary cases: $0 amount, override to $0, 100% commission, 0% commission
- Verify banker's rounding (round half-even) is consistent

### 5. Log findings

If any issue is found — bug, gap, edge case, missing error handling, UX problem:

1. Log it in `docs/issues-tracker.md` under the appropriate severity section
2. Use the next available issue ID in its severity group
3. Include: severity, status (Open), affected tasks, description, fix recommendation
4. If blocking: fix now. If not blocking: track as prioritized follow-up.

### 6. Update progress

- Mark the task as `done` in `docs/Business/progress.md`
- If issues were found and fixed, note it in the issues-tracker resolution log

---

## Issue tracking — log everything found during development

When working on any task, actively look for gaps, loopholes, inconsistencies, missing error handling, security concerns, and UX problems. When found:

1. Log immediately in `docs/issues-tracker.md` under the appropriate severity section
2. Use the existing format: issue ID, severity, status, affected tasks, description, fix recommendation
3. Add a lessons-learned entry if the issue reveals a pattern to prevent in the future

**What to watch for:**

- Missing error handling or edge cases in acceptance criteria
- Security gaps (unprotected endpoints, missing input validation, PII exposure)
- Dependency mismatches between tasks
- Inconsistencies between docs and implementation
- UX gaps (missing loading states, empty states, error feedback)
- Performance concerns (missing indexes, unbounded queries, N+1 patterns)
- Financial accuracy issues (rounding, currency, double-pay, race conditions)
- Accessibility violations (missing labels, contrast, keyboard navigation)

**Severity guide:**

- **Critical**: Data loss, financial errors, security breaches, blocks delivery
- **High**: Significant rework if not caught; affects multiple tasks
- **Medium**: Important but not blocking; quality improvement
- **Low**: Minor polish, documentation, edge cases

**When resolving:** update status to "Resolved" and add to the "Resolution log" table with date and commit reference.

---

## API and server action conventions

### Server Actions vs API routes

| Pattern                | When to use                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| **Server Actions**     | All mutations triggered by user interaction (create, update, delete) |
| **API Route Handlers** | Webhooks (Pusher, Resend), health check, external callbacks          |

Prefer Server Actions for mutations — they integrate with `useActionState`/`useFormStatus` and inherit session context automatically.

### RBAC — required on every server action and API route

Roles: `cashier_admin` | `secretary` | `stylist` | `clothier`

**Mandatory pattern:**

1. Validate session (Better Auth)
2. Extract role from session — **never trust role from client payload**
3. Gate: check role against the required permission
4. Proceed only if authorized; return `FORBIDDEN` otherwise

```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session) return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
if (!hasRole(session.user, "cashier_admin"))
  return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
```

No server action or API route may skip the role check. Even read-only actions must verify authentication.

### Input validation

- Every server action validates input with a **Zod schema** before business logic
- Schemas live in `packages/types/src/schemas/` — shared between client and server
- Never access raw `formData` or `req.body` past the validation boundary

### Error response shape

All server functions return `ActionResult<T>`:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: ValidationError[] } };
```

Error codes: `VALIDATION_ERROR` | `UNAUTHORIZED` | `FORBIDDEN` | `NOT_FOUND` | `CONFLICT` | `STALE_DATA` | `RATE_LIMITED` | `INTERNAL_ERROR`

### Financial mutations — mandatory checklist

Every mutation that creates or modifies money movement **must**:

1. Include an `idempotency_key` (client-generated UUID) to prevent duplicate charges
2. Run inside a database transaction — all-or-nothing
3. Use optimistic locking (`version` column or `SELECT ... FOR UPDATE`) to prevent race conditions
4. Log the mutation to Sentry breadcrumbs for audit trail

**Checkout-specific:**

- Verify ticket status is `awaiting_payment` before processing
- After successful payment, transition ticket to `closed` atomically within the same transaction
- Never expose `price_override` logic to non-cashier/admin roles

**Settlement/payout-specific:**

- Check for existing payout record covering the same employee + period before creating a new one
- Return `CONFLICT` if a duplicate payout is attempted
- Settlement amounts must be recomputed server-side — never trust client-submitted totals

### Rate limiting

Apply rate limiting before business logic using `@upstash/ratelimit`:

- Ticket creation: 30/min per user
- Payout recording: 5/min per admin
- Catalog edits: 20/min per admin
- General mutations: 60/min per user

---

## Database conventions

### Drizzle ORM only

- All schema definitions use Drizzle's `pgTable` helpers — never write raw DDL outside migration files
- Use Drizzle's query builder for all application queries. Raw SQL (`sql` template tag) only for complex CTEs, window functions, or migration scripts

### Money columns

- Type: `bigint` (Drizzle: `bigint('column_name', { mode: 'number' })`)
- Represents whole Colombian Pesos — **never** use `numeric`, `decimal`, `real`, `float`, or `doublePrecision` for monetary values
- Commission percentage: `numeric(5,2)` is acceptable — it's a rate, not money
- Financial rounding: banker's rounding (round half-even) when computing commission amounts

### Idempotency

- Every mutation that creates or modifies a financial record must accept an `idempotency_key` (UUID, client-generated)
- The `idempotency_key` column has a unique constraint
- Pattern: `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, then fetch if nothing returned

### Soft-delete policy

| Entity type        | Strategy            | Examples                                   |
| ------------------ | ------------------- | ------------------------------------------ |
| Selector entities  | `is_active` boolean | services, clients, employees, cloth pieces |
| Lifecycle entities | Status enum column  | tickets, appointments, batches             |
| Financial records  | **Never delete**    | payments, payouts, ticket items            |

### Timestamps

- All tables include `created_at` and `updated_at` (`timestamp with time zone`, default `now()`)
- `updated_at` uses a Postgres trigger or Drizzle `.$onUpdate()` to auto-refresh
- Store as UTC; display layer converts to America/Bogota

### Primary keys

- Use `uuid` primary keys: `uuid('id').primaryKey().defaultRandom()`
- Never use auto-increment integers for primary keys

### Optimistic locking

- Tables involved in concurrent mutations (tickets, business_days, batches) include a `version` integer column
- Updates must include `WHERE version = $expected` and check affected rows — return `STALE_DATA` if zero rows updated

### Naming conventions

- Table names: `snake_case`, plural (e.g. `tickets`, `service_variants`, `cloth_pieces`)
- Column names: `snake_case` (e.g. `business_day_id`, `price_override`, `commission_pct`)
- Index names: `idx_{table}_{columns}`
- Foreign key names: `fk_{table}_{referenced_table}`

---

## Component conventions

### Internationalization

- All user-facing strings go through `next-intl` — never hardcode Spanish or English text in components
- `useTranslations('namespace')` in client components; `getTranslations('namespace')` in server components
- Spanish is the primary locale; English is secondary

### Icons

- Use **Lucide Icons** exclusively — never import from heroicons, react-icons, or fontawesome
- Import: `import { IconName } from 'lucide-react'`
- Icon-only buttons **must** have `aria-label`

### Loading states

- Every page that fetches data must show a loading skeleton (`LoadingSkeleton` from design system)
- Buttons triggering async operations must show a spinner and be disabled during the operation
- Use `React.Suspense` with skeleton fallbacks for server component boundaries

### Empty states

- Every list/table view must handle zero records with a descriptive empty state
- Pattern: `<EmptyState icon={IconName} title="..." description="..." action={<Button>...</Button>} />`

### Error feedback

- **Toast notifications** for mutation results (success or failure) — never silently swallow errors
- **Inline errors** below form fields for validation failures: red text, associated via `aria-describedby`
- Destructive actions require a `ConfirmationDialog` before executing

### Accessibility baseline

- Every `<input>` has an associated `<label>` (or `aria-label` for icon-only controls)
- All interactive elements are keyboard-accessible
- Colour contrast: WCAG AA minimum (4.5:1 normal text, 3:1 large text)
- Focus indicators always visible — never `outline: none` without a replacement
- `eslint-plugin-jsx-a11y` enforces rules at lint time

### Mobile-first policy

- Stylist and clothier screens: mobile-first (phone is primary device)
- Admin and secretary screens: desktop-first but must remain usable on mobile
- Breakpoints: mobile (`< 768px`), tablet (`768–1024px`), desktop (`> 1024px`)

### Design system usage

- Use design tokens from `globals.css` via Tailwind classes (e.g. `bg-primary`, `text-muted-foreground`)
- Status badges: `StatusBadge` component with colour mapping from `docs/design-system.md`
- Monetary amounts: `font-mono tabular-nums` for alignment
- Typography: H1 `text-4xl font-bold`, H2 `text-2xl font-semibold`, H3 `text-lg font-semibold`, Body `text-sm`
- Font: Geist (`--font-sans`)

### Form UX

- Stacked labels (label above input) for mobile friendliness
- Validate on blur for individual fields; validate on submit for the full form
- Required by default — mark optional fields with "(optional)" suffix
- Success: toast notification + redirect to relevant list/dashboard

### Zustand — client state only

- Zustand is for ephemeral UI state only (sidebar open, offline queue count, notification badge)
- **Never** put server-derived data in Zustand — use TanStack Query for that

---

## Testing conventions

### Frameworks

- **Vitest** for unit and integration tests — never use Jest
- **Playwright** for E2E tests — never use Cypress
- **@axe-core/playwright** for automated accessibility checks in E2E tests

### What requires tests

| Code area                                                 | Required test type     |
| --------------------------------------------------------- | ---------------------- |
| Earnings computation (commission, piece_rate, daily_rate) | Unit tests (mandatory) |
| Commission calculations and rounding                      | Unit tests (mandatory) |
| Status transitions (ticket, appointment, batch)           | Unit tests (mandatory) |
| Permission / role checks                                  | Unit tests (mandatory) |
| Double-pay / duplicate prevention                         | Unit tests (mandatory) |
| Financial data integrity                                  | Unit tests (mandatory) |
| Checkout lifecycle                                        | E2E (from Phase 4A)    |
| Payroll settlement                                        | E2E (from Phase 7)     |
| Appointment booking                                       | E2E (from Phase 5)     |

### Coverage

- **80% threshold** enforced for `packages/db/src/queries/` (financial logic)
- All financial calculation functions must have 100% branch coverage

### Test isolation

- Unit/integration tests run inside a database transaction that rolls back after each test
- E2E tests use a dedicated seeded database — never share state between test runs
- Each test file is independent — no reliance on execution order

### Financial test conventions

- Always test with known inputs and pre-calculated expected outputs
- Test boundary cases: $0 amount, override to $0, 100% commission, 0% commission
- Verify banker's rounding (round half-even) behavior
- Verify integer peso storage — no floating point artifacts
- Test idempotency: submitting the same `idempotency_key` twice must return the same result without side effects

### Naming convention

- Test files: `{module}.test.ts` colocated with source, or `e2e/{feature}.spec.ts`
- Describe blocks: noun (the module/function under test)
- Test names: describe behavior, not implementation (e.g. `"returns FORBIDDEN when stylist attempts payout"`)

### Running tests

- `turbo test` runs the full suite
- CI (GitHub Actions) runs lint + typecheck + test on every PR
- No PR merges with a red test suite
