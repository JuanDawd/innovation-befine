# Engineering standards

This document is the single source of truth for project-wide conventions. Every team member and every task must follow these standards.

---

## Input validation

All API route handlers and Server Actions must validate inputs with **Zod schemas** before reaching business logic. No raw `req.body` or untyped form data is allowed past the validation boundary.

Shared Zod schemas live in `packages/types/src/schemas/` and are used by both client (React Hook Form resolver) and server (action/route handler validation).

---

## Money storage

All monetary values are stored as **integer pesos** (`bigint` column type in Drizzle, `bigint` in Postgres). COP (Colombian Pesos) has no cents — 1 peso is the smallest unit. The display layer converts integers to formatted strings (e.g. `$12.500`).

Prohibited: `numeric`, `float`, `real`, or `decimal` column types for monetary values.

---

## Financial rounding

**Banker's rounding (round half-even)** is used for all financial calculations. This prevents systematic bias when splitting commissions or computing earnings.

- `commission_pct` column precision: `numeric(5,2)` (allows 0.00 to 100.00).
- All intermediate calculations use integer arithmetic where possible.
- When rounding is required (e.g. commission on a price), use banker's rounding and store the result as an integer.

---

## Soft-delete policy

| Entity type        | Strategy                   | Example                                    |
| ------------------ | -------------------------- | ------------------------------------------ |
| Selector entities  | `is_active` boolean column | services, clients, employees, cloth pieces |
| Lifecycle entities | Status field (enum)        | tickets, appointments, orders              |
| Financial records  | **Never hard-delete**      | payments, payouts, ticket items            |

Hard-delete is only allowed for development seed data cleanup. Production data must always be soft-deleted or status-transitioned.

---

## Error handling

### Server-side

Use **typed result objects** for expected failures — never throw errors for business logic violations:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

Financial operations (ticket close, payout recording, payment recording) must be wrapped in **database transactions**. If any step fails, the entire operation rolls back.

### Client-side

- **Toast notifications** for action results (success or failure).
- **Inline errors** under form fields for validation failures (red text, `aria-describedby`).
- Never silently swallow errors — every mutation must show feedback to the user.

---

## Accessibility baseline

All UI must meet these minimum standards:

- Every form input has an associated `<label>` (or `aria-label` for icon-only buttons).
- All interactive elements are keyboard-accessible (focusable, activatable with Enter/Space).
- Colour contrast meets **WCAG AA** (4.5:1 for normal text, 3:1 for large text).
- Focus indicators are always visible (never `outline: none` without a replacement).
- `eslint-plugin-jsx-a11y` enforces accessibility rules at lint time.

---

## Performance targets

### Hard targets — every build must meet these

| Metric                                                      | Target       | How measured                                     |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------ |
| API response (P95, all non-analytics endpoints)             | **< 500 ms** | Server-side timing log (Sentry breadcrumb)       |
| Client-side navigation (route change, already-loaded shell) | **< 1.5 s**  | Chrome DevTools — time from click to interactive |
| Client search (client search widget, catalog filter)        | **< 300 ms** | UI responsiveness, debounced at 200 ms           |
| Analytics queries (post-T075 indexes)                       | **< 200 ms** | Database query timing                            |

These are **blocking** in T107 (performance testing). Any endpoint that fails P95 < 500 ms must be fixed before go-live.

### Heavy operations — no hard time limit, but always show progress

Some operations legitimately take > 500 ms (report generation, payout batch, CSV export, analytics seed). These are **not failures** — they require a clear UI contract:

| Requirement                                                  | Implementation                                        |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| Trigger button disabled immediately on click                 | `disabled={isPending}`                                |
| Spinner visible within 100 ms of click                       | `Loader2Icon` in button                               |
| If the operation may take > 3 s: show an explanatory message | `"Esto puede tardar unos segundos…"` below the button |
| On completion: toast notification (success or error)         | Sonner `toast.success()` / `toast.error()`            |
| On error: offer a retry button                               | Inline or in the toast action                         |

Operations in this category: payout recording, CSV export, day-close with open-ticket check, analytics dashboard first load, data migration (T100).

### Page load (initial navigation, cold start)

| Page                | LCP target | Notes                                                           |
| ------------------- | ---------- | --------------------------------------------------------------- |
| Login               | < 1.5 s    | Static, no auth                                                 |
| Cashier dashboard   | < 2.5 s    | SSR + DB fetch; cookieCache eliminates extra session round-trip |
| Checkout flow       | < 2.0 s    | Relatively small data set                                       |
| Analytics dashboard | < 3.0 s    | Acceptable — data-heavy; show skeleton immediately              |

Measured with Chrome DevTools, 4G throttle (20 Mbps / 5 ms RTT), mid-range mobile preset. Documented in `docs/testing/performance-results.md` (created in T107).

---

## Standard libraries

| Purpose      | Library                             | Scope                                                                                                           |
| ------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Forms        | **React Hook Form** + `zodResolver` | All forms. Zod schemas shared with server validation.                                                           |
| Server state | **TanStack Query** (React Query)    | Caching, revalidation, server state.                                                                            |
| Client state | **Zustand**                         | Ephemeral UI state only (offline queue count, sidebar open, notification count). Never for server-derived data. |
| Dates        | **date-fns**                        | All date manipulation, formatting, comparisons. No native `Date` arithmetic.                                    |
| Charts       | **Recharts**                        | Analytics dashboards (Phase 8).                                                                                 |
| Icons        | **Lucide Icons**                    | All icons across the app.                                                                                       |

See `docs/research/frontend-libraries.md` for full rationale.

---

## Business timezone

**America/Bogota (UTC-5)** — fixed, does not observe daylight saving time.

- All timestamps stored in the database as **UTC** (`timestamp with time zone`).
- All user-facing displays convert to the business timezone regardless of the user's device locale.
- Use `date-fns-tz` for timezone conversions.

---

## Form UX conventions

- **Stacked labels** (label above input) — better for mobile and screen readers.
- **Validate on blur** for individual fields; **validate on submit** for the full form.
- **Inline errors** below each field: red text, associated via `aria-describedby`.
- **Required by default** — mark optional fields with "(optional)" suffix.
- **Success feedback**: toast notification + redirect to the relevant list/dashboard.
- **Destructive actions**: require a `ConfirmationDialog` (from T103 design system).

---

## Mobile-first policy

- **Clothier and stylist screens** must be designed and tested mobile-first (phone is their primary device). Desktop is the secondary adaptation.
- **Admin and secretary screens** may be desktop-first but must still be usable on mobile.
- Breakpoints: mobile (< 768px), tablet (768–1024px), desktop (> 1024px).

---

## Loading pattern policy

All screens must implement basic **loading states** (skeleton or spinner) from Phase 1 onward — not deferred to Phase 10.

- Use the `LoadingSkeleton` component from T103 design system.
- Every page that fetches data must show a loading state while the data is loading.
- Buttons that trigger async operations must show a spinner and be disabled during the operation.

---

## Currency

**COP (Colombian Pesos)**. No cents — the smallest unit is 1 peso. Integer storage = whole pesos.

Format: `$12.500` (dot as thousands separator, no decimal places, peso sign prefix). Use the `formatMoney()` utility from T099 i18n setup.

---

## Testing policy

- **Unit tests required** for all business logic: earnings computation, commission calculations, status transitions, permission checks, double-pay prevention, and financial data integrity.
- **E2E tests required** for critical flows starting in Phase 4A: checkout lifecycle, payroll settlement, appointment booking.
- **Regression suite** runs on every PR via `turbo test`. No PR merges with a red suite.
- **Code coverage**: 80% threshold enforced for `packages/db/src/queries/` (financial logic). No global coverage threshold — quality over quantity.
- **Accessibility checks**: `@axe-core/playwright` runs on all E2E tests for automated a11y verification.
- **Test data isolation**: every unit/integration test runs inside a DB transaction that rolls back. E2E tests use a dedicated seeded database.

See `docs/testing/README.md` for the full testing strategy.
