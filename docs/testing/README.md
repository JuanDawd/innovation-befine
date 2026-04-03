# Testing strategy -- Innovation Befine

> **Scope:** Internal POS/operations platform for a beauty salon in Colombia.
> **Currency:** COP (Colombian Pesos). No cents -- integer storage = whole pesos.
> **Commission rounding:** Banker's rounding (round half-even).
> **Roles:** admin (cashier/admin), secretary, stylist (subtypes: manicurist, spa_manager, hairdresser, masseuse, makeup_artist), clothier.

---

## Testing philosophy

Unit tests cover **business logic**: earnings computation, commission calculations, status transitions, permission checks, double-pay prevention, and financial data integrity. Every function in `packages/db/src/queries/` that touches money or enforces rules must have unit tests with deterministic, pre-calculated inputs and outputs.

End-to-end tests (Playwright) cover **critical user flows** where integration bugs across multiple tables and services are most likely: ticket lifecycle (create -> checkout -> earnings), payroll settlement (compute -> pay -> prevent double-pay), and appointment booking (book -> prevent double-booking). E2E tests run against a local dev server with a seeded test database.

Manual testing fills gaps automation cannot cover: real-time update latency (Pusher), print receipt rendering, PWA install prompts, screen reader behaviour, and multi-device layout verification.

---

## Regression policy

The full regression suite runs on every pull request via GitHub Actions (T095). No PR merges with a red regression suite.

### Regression scope by shared table

When a change touches a shared table, the following features must be retested:

| Shared table     | Downstream features that must pass regression                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `tickets`        | T033-T042 (ticket lifecycle), T063 (stylist earnings), T092 (ticket history), T093 (admin home), analytics    |
| `employees`      | Identity (T012-T015), payroll (T063-T070), analytics (T071-T074), RBAC boundaries                            |
| `clients`        | Tickets (T035 client selector), appointments (T050 booking), large orders (T058), client search (T030)        |
| `business_days`  | Tickets (T035 requires open day), payroll (T065 days_worked, T067 date range), analytics (T071 period queries)|
| `payouts`        | Double-pay prevention (T068), deactivation guard (T022b), earnings view (T069), unsettled alert (T070)        |
| `batch_pieces`   | Clothier earnings (T064), batch completion (T046-T047), large order progress (T060)                           |

### Regression suite composition

| Layer       | What runs                                                      | Trigger    |
| ----------- | -------------------------------------------------------------- | ---------- |
| Unit        | All Vitest tests (`turbo test`)                                | Every PR   |
| Integration | RBAC negative tests, financial computation tests               | Every PR   |
| E2E smoke   | Login -> create ticket -> checkout (Playwright)                | Every PR   |
| E2E full    | Checkout lifecycle, payroll lifecycle, appointment booking      | Nightly + pre-release |
| Security    | RBAC matrix negatives, input validation, session cookie checks | Every PR   |

---

## Test data management

### Isolation strategy

Every test runs inside a **database transaction that rolls back** after the test completes. Tests never commit data. This guarantees:

- No test pollution between test cases.
- No dependency on execution order.
- No manual cleanup scripts.

For E2E tests (Playwright), use a dedicated test database seeded before each suite run and truncated after. Each E2E scenario uses unique identifiers (e.g. timestamped client names) to avoid collisions when running in parallel.

### Scenario fixtures

Fixtures provide pre-built database states for common test scenarios. Each fixture is a function that inserts records inside the test transaction and returns the created entity IDs.

| Fixture name                  | Contents                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `checkout-happy-path`         | 1 admin, 1 stylist, 1 client, 1 open business day, 1 active service variant (COP 50,000, 30% comm)   |
| `payroll-multi-employee`      | 3 employees (stylist, clothier, secretary), 5 business days, varying ticket/piece/absence counts      |
| `edge-cases`                  | Deactivated employee, archived client, closed business day, zero-price service variant (COP 0)        |
| `split-payment`               | 1 ticket with 2 items, pre-calculated total for split across cash + card                              |
| `override-price`              | 1 ticket item with original COP 50,000 and override COP 40,000, pre-calculated commission            |
| `concurrent-checkout`         | 1 ticket in `awaiting_payment` status, 2 admin sessions                                              |
| `rbac-all-roles`              | 1 user per role (admin, secretary, stylist, clothier), authenticated sessions for each                |

### Financial test data requirements

All financial test fixtures must include:

1. **Input values** in whole COP pesos (integers, no decimals).
2. **Pre-calculated expected outputs** computed by hand, not by the system under test.
3. **Rounding verification** using banker's rounding (round half-even) for commission calculations.
4. **Edge values**: COP 0, COP 1, maximum realistic amount (COP 10,000,000).

Example fixture data:

| Scenario                          | Input                                 | Expected output                  |
| --------------------------------- | ------------------------------------- | -------------------------------- |
| Standard commission               | COP 50,000 service, 30% commission    | COP 15,000 earnings              |
| Override price                    | Override to COP 40,000, 30% commission| COP 12,000 earnings              |
| Fractional commission (half-even) | COP 10,000 service, 33.33% commission | COP 3,333 earnings (round down)  |
| Half-even rounding up             | COP 10,000 service, 12.50% commission | COP 1,250 earnings (exact)       |
| Zero-price service                | COP 0 service, 30% commission         | COP 0 earnings                   |
| Split payment                     | COP 50,000 total: 30,000 cash + 20,000 card | Both recorded, sum = total |

---

## Coverage requirements

| Directory / scope                    | Minimum coverage | Rationale                                                |
| ------------------------------------ | ---------------- | -------------------------------------------------------- |
| `packages/db/src/queries/` (financial logic) | 80%       | Commission calculations, earnings aggregation, double-pay checks -- errors here cause real money discrepancies |
| Global                               | No threshold     | Enforcing global coverage incentivizes low-value tests; quality over quantity |

Coverage is reported by Vitest (c8/istanbul) and tracked in CI. Coverage drops below 80% on financial logic directories block the PR.

---

## Phase gate quality checks

Before any phase is marked "done," all of the following must pass:

### 1. Acceptance criteria verification

- Every AC checkbox for every task in the phase has been manually verified.
- For UI tasks: tested on mobile viewport (375px) AND desktop (1920px).
- For API tasks: tested with valid input, invalid input, and an unauthorized role.

### 2. Test scenario execution

- All structured test scenarios from the phase's test plan have been executed.
- Results logged with pass/fail and any deviations noted.

### 3. Regression suite green

- `turbo test` passes with zero failures.
- E2E smoke test passes against the deployed preview URL.

### 4. No open critical/high issues

- `docs/issues-tracker.md` has no unresolved critical or high issues for this phase.
- Any new issues discovered during testing are logged before the phase is closed.

### 5. Security check

- All RBAC negative tests pass for new endpoints introduced in this phase.
- No new endpoints are accessible without authentication.
- Input validation rejects all standard injection patterns.

### 6. Performance check

- New API endpoints meet P95 < 500ms (measured with at least 50 requests).
- Page load LCP < 2.5s on desktop; < 3.5s on simulated 4G mobile.

---

## Test plan index

| Document                                            | Scope                                      |
| --------------------------------------------------- | ------------------------------------------ |
| `docs/testing/phase-04a-test-plan.md`               | Checkout and ticket lifecycle              |
| `docs/testing/phase-07-test-plan.md`                | Payroll settlement and earnings            |
| `docs/testing/security-test-plan.md`                | RBAC, input validation, session, data leak |
| `docs/testing/rbac-matrix.md`                       | Full permission matrix (all roles x actions)|
| `docs/testing/concurrency-test-plan.md`             | Race conditions and concurrent access      |

Additional phase test plans should be created as development reaches each phase. At minimum, Phase 4B (cloth batches) and Phase 5 (appointments) need test plans before their development begins.

---

## Related documents

- `docs/Business/progress.md` -- master task list and phase structure
- `docs/issues-tracker.md` -- defect tracking and resolution log
- `docs/research/senior_qa.md` -- QA review findings that informed this strategy
- `docs/Business/tasks/phase-00-foundation.md` -- T094 (testing infrastructure), T095 (CI/CD pipeline)
