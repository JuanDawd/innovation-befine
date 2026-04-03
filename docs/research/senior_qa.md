# Senior QA Review

> Reviewed: April 2026
> Scope: full project documentation (business-idea.md, technical-feasibility-and-research.md, project-plan.md, all 12 phase task files, all research files, progress.md, business.md, issues-tracker.md, all prior review documents)
> Reviewer perspective: test strategy, test coverage, quality gates, edge case identification, regression prevention, security testing, performance validation, deployment verification, data integrity, and operational readiness

---

## Overall assessment

The project documentation is **remarkably thorough for planning and architecture**, with three prior expert reviews (Product Owner, Software Engineer, Designer) that already caught ordering, structural, and UX gaps. However, the documentation has **no QA layer whatsoever**. There are 106 tasks with well-written acceptance criteria — but acceptance criteria are not test plans. ACs tell you _what_ to verify; they don't tell you _how_ to verify it, _what to try breaking_, or _how to know the system still works after the next change_.

For a financial system (POS, payroll, payment recording) used by non-technical staff on unreliable connections, the cost of a bug reaching production is not just a fix — it's lost trust in the system they were persuaded to adopt over spreadsheets. One wrong payout, one duplicate charge, or one lost ticket will send staff back to paper within a week.

This review focuses on what a Senior QA would require before signing off on each phase.

---

## Critical findings

### Q1 — No test plan or test scenario documentation exists for any task

**Impact: critical — acceptance criteria ≠ test coverage**

Every task has acceptance criteria (checkbox-style), but no task has:

- **Test scenarios** — structured given/when/then descriptions covering happy path, error path, edge cases, and boundary conditions
- **Test data requirements** — what data must exist before the test, and what state should the system be in
- **Expected vs actual results** — for financial calculations, the exact expected output for a given input
- **Regression scope** — which other features to retest when this task changes

Without test scenarios, "testing" means a developer clicks through the happy path once and checks the boxes. The edge cases where real bugs live are never exercised.

**Recommendation:** Create a `docs/testing/` directory. For each phase, create a test plan file (e.g. `docs/testing/phase-04a-test-plan.md`) with structured test scenarios for every task in that phase. At minimum, cover:

- Happy path (normal use)
- Error path (invalid input, missing required fields, permission denied)
- Boundary conditions (zero items, maximum items, empty strings, special characters)
- Concurrent access (two users doing the same thing)
- State-dependent scenarios (business day open vs closed, employee active vs deactivated)

Priority: **Phase 4A (tickets + checkout)** and **Phase 7 (payroll)** need test plans before development begins on those phases.

---

### Q2 — No end-to-end test scenarios for financial flows

**Impact: critical — the three most dangerous flows have no integration test specification**

The app handles money in three distinct flows:

1. **Ticket checkout** (T038): service logged → line items priced → payment recorded → ticket closed
2. **Payroll settlement** (T067): earnings computed → admin reviews → payout recorded → items marked settled
3. **Large order payments** (T061): deposit recorded → additional payments → balance tracked → paid in full

None of these have end-to-end test scenarios that verify the entire chain. Individual tasks test their own slice, but nobody verifies that:

- A stylist logs a service at $50 with 30% commission → the ticket shows $50 → checkout records $50 payment → earnings show $15 → payout of $15 marks it settled → analytics shows $50 revenue
- An override price of $40 at checkout → recalculates commission to $12 → reflects in earnings → reflects in analytics
- A reopened ticket correctly flags the payout and recomputes

These flows cross 5+ tasks and 4+ database tables. Without E2E verification, integration bugs will be discovered in production.

**Recommendation:** Add E2E test scenarios (Playwright) as exit criteria for Phase 4A and Phase 7. Define at least:

- Full ticket lifecycle: create → status transitions → checkout → verify payment recorded → verify earnings computed → verify payout → verify analytics
- Override price flow: full lifecycle with a price override at checkout
- Reopen flow: close ticket → reopen → verify payout flag → re-close → verify earnings recomputed
- Split payment flow: close ticket with mixed payment methods → verify all payment records exist
- Full payroll cycle: multiple employees, multiple business days → compute → pay → verify double-pay prevention

---

### Q3 — No regression testing strategy

**Impact: critical — compounds with every phase; by Phase 7, the regression surface is massive**

There is no document defining:

- **What to retest** when a change is made to a shared entity (e.g., modifying the `tickets` table affects T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T063, T092, T093, and analytics)
- **Automated regression suite** — which tests run on every PR to catch regressions
- **Manual regression checklist** — for features too complex for automation (real-time updates, PWA install, print receipt)
- **Regression risk matrix** — which changes are high-risk (schema migrations, auth changes, financial computation logic) and require broader retesting

By Phase 7, a change to the ticket items table could silently break checkout, earnings computation, analytics, and CSV export. Without regression coverage, each phase increases the probability of shipping a regression.

**Recommendation:** Add to T094 (testing infrastructure): define a regression test suite that runs on every PR. Include at minimum:

- Unit tests for all earnings computation functions (T063, T064, T065)
- Integration tests for ticket lifecycle (create → close → reopen)
- Integration tests for double-pay prevention (T068)
- E2E smoke test: login → create ticket → checkout (runs on every PR)
- Document the regression scope for each shared table (tickets, employees, clients, business_days, payouts)

---

### Q4 — No test data management strategy

**Impact: critical — without consistent test data, test results are unreliable**

The project has two seed scripts (T011 for dev roles, T101 for analytics data), but no strategy for:

- **Test fixture management** — how tests set up and tear down data
- **Test isolation** — do tests share a database? Can one test's data corrupt another's?
- **Environment parity** — is the test database schema identical to staging and production?
- **Seeded data for specific scenarios** — e.g., a client with exactly 3 no-shows for testing the warning badge, an employee with exactly one unsettled business day for testing the deactivation guard
- **Financial test data with known expected results** — inputs and outputs pre-calculated so computation tests are deterministic

**Recommendation:** Add to T094: define a test data strategy. Use database transactions for test isolation (rollback after each test). Create scenario-specific fixtures:

- `fixtures/checkout-happy-path.ts` — one employee, one service, one client, one open business day
- `fixtures/payroll-multi-employee.ts` — three employees (one per type), five business days, varying ticket counts
- `fixtures/edge-cases.ts` — deactivated employee, archived client, closed business day, zero-price service

---

## High-severity findings

### Q5 — Race condition scenarios not documented for financial operations

**Impact: high — POS systems are inherently concurrent; multiple cashiers/stylists act simultaneously**

The documentation mentions optimistic locking for checkout (T038) and double-booking prevention for appointments (T051), but doesn't address:

- **Two cashiers checking out the same ticket simultaneously** — only one should succeed (partially covered by T038, but no test scenario)
- **A ticket being modified while checkout is in progress** — e.g., a stylist requests an edit (T041) while the cashier is on the checkout screen
- **Two payroll submissions for overlapping periods** — T068 prevents double-pay, but what if two admins submit payouts for overlapping (not identical) business day ranges simultaneously?
- **Business day closure while tickets are being created** — a stylist creates a ticket at the exact moment the admin closes the day
- **Concurrent piece approvals** — two admins approving the same batch piece simultaneously

**Recommendation:** Create a dedicated "concurrency test plan" document. For each race condition scenario, define:

1. The preconditions (system state)
2. The concurrent actions (what two users do simultaneously)
3. The expected outcome (which operation succeeds, which fails, what error the losing user sees)
4. How to verify (Playwright parallel browser instances or API-level concurrent requests)

---

### Q6 — Business day boundary edge cases not tested

**Impact: high — the business day model is the most unusual architectural decision and needs thorough edge case coverage**

The business day spans calendar boundaries (e.g., 6 AM to 2 AM). Edge cases nobody has documented tests for:

- A ticket created at 11:59 PM and another at 12:01 AM — both should belong to the same business day
- Attempting to open a new day without closing the current one
- What happens to scheduled appointments when the business day is unexpectedly closed early (clients with 4 PM appointments when the day closes at 3 PM)
- An employee creates a ticket, the day closes, and the employee's device (offline, Phase 9) tries to sync the ticket — does it succeed or fail?
- Analytics queries spanning midnight — does "today's revenue" correctly include the 11 PM to 2 AM portion?
- The "days worked" calculation for secretary earnings (T065) — if the business day spans two calendar dates, is it counted once or twice?
- Timezone edge cases: if Neon is in UTC and the business is in Colombia (UTC-5), does "open day at 6 AM local" register correctly?

**Recommendation:** Add a dedicated section to the Phase 1 test plan for business day boundary testing. Include at least 5 edge case scenarios with specific timestamps and expected outcomes.

---

### Q7 — No UAT (User Acceptance Testing) plan

**Impact: high — the system replaces daily workflows of non-technical staff**

T088 (training guide) teaches staff how to use the app. T089 (production cutover) has a go-live checklist. But there is no task between them where **actual staff use the system in a realistic scenario and provide feedback** before go-live.

Without UAT:

- The cashier may find the checkout flow slower than their current process
- A clothier may find the phone UI confusing
- The secretary may discover a workflow gap not covered by the requirements
- The admin may realize the analytics view doesn't answer the questions they actually ask

**Recommendation:** Add a UAT task to Phase 10 (between T088 and T089): each role representative uses the staging environment for one full business day with realistic data. Capture feedback in a structured form: task completed? Time taken? Confusion points? Missing features? This feedback loop is the last chance to catch usability issues before production.

---

### Q8 — No security testing plan

**Impact: high — POS system handling PII and financial data with no security test criteria**

H-06 in the issues tracker flags the missing security audit on the go-live checklist. Beyond that, there is no security testing plan for development:

- **RBAC testing** — no negative test scenarios for permission boundaries (e.g., secretary accessing `/api/payroll`, clothier accessing admin routes)
- **Input validation testing** — Zod validation is specified, but no tests verify that malicious inputs (SQL injection strings, XSS payloads, oversized inputs) are properly rejected
- **Session security testing** — session hijacking, cookie security flags, session timeout behavior
- **API endpoint security** — no list of endpoints that must be authenticated, rate-limited, or role-restricted
- **Data exposure testing** — verify that API responses don't leak data the role shouldn't see (e.g., secretary receiving financial data in a nested object)

**Recommendation:** Create `docs/testing/security-test-plan.md` with:

1. RBAC negative test matrix: every role × every restricted endpoint
2. Input validation tests for every mutation endpoint
3. Session security checks (HttpOnly, Secure, SameSite cookie flags)
4. Data leak checks: verify response payloads are role-appropriate
5. Add security tests to T095 (CI/CD pipeline) so they run on every PR

---

### Q9 — Missing error and edge case scenarios in most acceptance criteria

**Impact: high — acceptance criteria test the happy path; bugs live in the sad path**

Reviewing all 106 tasks, most ACs only describe what should happen when everything works. Missing edge cases across tasks:

| Task | Missing edge case                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T013 | What if the email is already registered? What if Resend is down during account creation?                                             |
| T019 | What if the admin's session expires mid-day-close? What if there are open tickets when closing the day?                              |
| T035 | What if the selected service variant is deactivated between form load and submit?                                                    |
| T038 | What if the payment amount doesn't match the total (rounding)? What if the client was archived between ticket creation and checkout? |
| T039 | What if split payment amounts use decimal cents (rounding to integer cents)?                                                         |
| T050 | What if the stylist is deactivated between form load and booking submission?                                                         |
| T056 | What if the client's email address is invalid (hard bounce)? What if Resend rate limit is hit?                                       |
| T063 | What if `commission_pct` is 0? What if `override_price` is 0 (free service)?                                                         |
| T064 | What if a clothier has approved pieces in batches from different business days in the same payout range?                             |
| T067 | What if the admin adjusts the payout to $0? Is that a valid payout?                                                                  |
| T100 | What if the CSV has UTF-8 encoding issues (accented names in Spanish)? What if phone format varies (with/without country code)?      |

**Recommendation:** For every task with business logic or user interaction, add an "Error cases and edge cases" section to the test plan. At minimum, cover: invalid input, stale data (entity changed between load and submit), service unavailability (Resend, Pusher, Neon), and boundary values (0, empty, max length).

---

### Q10 — No smoke test suite for deployment verification

**Impact: high — every Vercel deployment could break core functionality with no automated check**

T095 (CI/CD) runs lint, typecheck, and unit tests on every PR. But after deployment to staging or production, there is no automated verification that the deployed app actually works:

- Can a user log in?
- Does the database connection work?
- Is the real-time transport (Pusher) connected?
- Does the API return correct data?
- Can a ticket be created?

A successful CI check does not guarantee a successful deployment (env vars misconfigured, DB migration not applied, Pusher keys expired, etc.).

**Recommendation:** Add a post-deployment smoke test to T095. After Vercel deploys the preview or production, run a minimal Playwright suite against the deployed URL:

1. Load login page (app shell works)
2. Log in as admin (auth works)
3. Hit `/api/health` with DB ping (database works)
4. Create and close a ticket (core flow works)

This catches deployment issues within minutes, not after staff report problems.

---

### Q11 — No performance testing plan beyond inline targets

**Impact: high — performance targets exist (LCP < 2.5s, API P95 < 500ms) but no plan to measure them**

T002 defines performance targets. T075 optimizes analytics queries. But there is no:

- **Performance test suite** — automated tests that measure response times against targets
- **Load testing plan** — what happens with 10 concurrent users? 20? (realistic for a busy salon)
- **Neon free tier stress test** — at what data volume do queries exceed targets? (H-07 flags the storage concern, but performance degradation is a separate issue)
- **Real-time performance testing** — latency of Pusher events under realistic message volume
- **Mobile performance testing** — LCP on a mid-range Android phone on 4G (the clothier's likely device)

**Recommendation:** Add a performance testing task to Phase 8 (after analytics data exists): use the analytics seed data (T101) to run performance benchmarks. Measure API response times, page load times on simulated mobile, and Pusher event latency. Document the results and compare against T002 targets.

---

## Medium-severity findings

### Q12 — No negative test cases for RBAC permission boundaries

**Impact: medium — secretary financial restriction (F9) and other role boundaries need systematic verification**

T018 mentions secretary financial restriction with "at least one integration test." But the full RBAC matrix has dozens of permission boundaries:

| Action                       | Admin | Cashier | Secretary | Stylist  | Clothier |
| ---------------------------- | ----- | ------- | --------- | -------- | -------- |
| Open/close day               | Yes   | —       | No        | No       | No       |
| Create employee              | Yes   | —       | No        | No       | No       |
| Create ticket (any employee) | Yes   | Yes     | Yes       | Own only | No       |
| Checkout                     | Yes   | Yes     | No        | No       | No       |
| View earnings (others)       | Yes   | —       | No        | No       | No       |
| Access analytics             | Yes   | —       | No        | No       | No       |
| Record payout                | Yes   | —       | No        | No       | No       |
| Approve batch pieces         | Yes   | —       | Yes       | No       | No       |
| Book appointments            | —     | Yes     | Yes       | No       | No       |

Each "No" in this matrix should have a test verifying that the role receives a 403 or is redirected, not silently allowed. The matrix above has 20+ negative test cases that should be automated.

**Recommendation:** Create the full RBAC permission matrix and add it to `docs/testing/rbac-matrix.md`. Convert each "No" cell into an automated integration test in T018. Run these tests on every PR as part of the regression suite.

---

### Q13 — No data integrity verification after schema migrations

**Impact: medium — migrations run in sequence across phases; a bad migration can corrupt existing data**

Phase 1 through Phase 9 each add new tables and modify existing ones. No task specifies:

- **Migration rollback testing** — can each migration be reversed without data loss?
- **Data preservation verification** — after running a new migration, do existing records remain intact?
- **Foreign key constraint validation** — are FK relationships valid after migration? (e.g., adding `appointment_id` to tickets — existing tickets have NULL, which is fine, but is the FK validated?)
- **Enum migration testing** — adding values to a Postgres enum (e.g., adding `cancelled` to large order statuses per H-10) without breaking existing rows

**Recommendation:** Add to T006 (Drizzle setup): every migration must include a rollback script or be verified as reversible. Add to CI: after running migrations, verify that a set of known seed records are still queryable and correct.

---

### Q14 — No cross-browser or cross-device testing matrix

**Impact: medium — "responsive" is mentioned but no specific browsers or devices are targeted**

T083 tests responsive layout but doesn't specify:

- **Browser matrix**: Chrome, Firefox, Safari, Edge? Which versions?
- **Device matrix**: iPhone (which model?), Android (which model?), tablet?
- **PWA testing**: iOS Safari has known PWA limitations (M-10 flags this) — are these tested?
- **Screen reader testing**: For the accessibility baseline (T002), which screen reader? (VoiceOver on iOS, NVDA on Windows, ChromeVox?)

**Recommendation:** Define a minimum test matrix in T083:

- Browsers: Chrome 120+, Firefox 120+, Safari 17+ (iOS and macOS), Edge 120+
- Devices: iPhone 13+ (or equivalent screen size), Android phone with Chrome (mid-range), desktop 1920×1080, desktop 1366×768
- Screen reader: VoiceOver on iOS (for clothier/stylist flows), keyboard navigation on desktop (for cashier/admin flows)

---

### Q15 — Financial calculation precision testing gaps

**Impact: medium — rounding errors in commission calculations can compound to significant discrepancies over time**

The money storage decision (integer cents) is correct, but the computation rules need precise test cases:

- `commission_pct` is `numeric(0–100)` but precision is unspecified (M-17). What happens with 33.33% commission on a $100 service? Is it $33.33 (3333 cents) or $33.34?
- How is rounding handled? Round half-up, round half-even (banker's rounding), truncate?
- When split payments don't divide evenly (e.g., $15 split equally into 2 payments — $7.50 and $7.50, but stored as cents: 750 + 750 = 1500 ✓. But $15 split three ways: 500 + 500 + 500 = 1500 ✓. What about $10 split three ways: 333 + 333 + 334 = 1000? Who gets the extra cent?)
- Earnings computation aggregates many small calculations — does rounding error compound?

**Recommendation:** Define the rounding policy in T002 standards (recommend: round half-up for customer-facing amounts, truncate for commission calculations — always in favor of the business). Create deterministic test fixtures with pre-calculated expected results for at least 10 financial scenarios.

---

### Q16 — No monitoring or alerting for business logic failures

**Impact: medium — Sentry captures errors, but silent business logic failures are more dangerous**

Sentry (T085) captures thrown errors. But the most dangerous failures are silent:

- A payout is created but the junction table insert silently fails — payout appears paid but items aren't marked settled
- A real-time event fails to publish — the cashier dashboard doesn't update but no error is thrown
- An idempotency key check succeeds but returns stale data — no error, but the client sees outdated information
- A commission calculation uses a stale `commission_pct` (from before a catalog update) — technically correct (snapshotted), but the admin might not realize the old rate was used

**Recommendation:** Add structured logging (pino or similar) with business-context log entries for every financial operation. Log: operation type, actor, amount, affected entities, and timestamps. These logs should be separate from error tracking — they're the audit trail for "things that worked but might be wrong." Add to T002 standards or T085.

---

### Q17 — Incomplete dependency chain testing between phases

**Impact: medium — features built in Phase N depend on Phase N-1 deliverables that may have untested integrations**

The task dependencies are well-documented, but the integration points between phases are untested:

- Phase 4A depends on Phase 3 (clients) — but no test verifies that a client created in Phase 3 can be correctly linked to a ticket in Phase 4A
- Phase 5 depends on Phase 4A — but no test verifies that an appointment can optionally link to a ticket
- Phase 7 depends on Phase 4A (tickets) and Phase 4B (batches) — but no test verifies that earnings computation correctly handles tickets AND batch pieces for the same employee in the same period
- Phase 8 depends on Phase 7 — but no test verifies that analytics queries correctly aggregate data from payouts AND raw tickets

**Recommendation:** Define integration test scenarios at each phase boundary. When starting Phase N, the first task should include an integration test that verifies Phase N-1 deliverables work correctly with Phase N's new code. Add these as explicit dependencies.

---

## Low-severity findings

### Q18 — No email deliverability testing plan

**Impact: low — email is a secondary feature, but failed emails cause operational confusion**

T054 (Resend) and T056 (send confirmation) handle emails, but no testing plan addresses:

- Resend sandbox/test mode vs production mode
- What happens when the daily email limit (100) is reached?
- How to test email rendering on different clients (Gmail, Outlook, Apple Mail)?
- SPF/DKIM/DMARC configuration verification
- Bounce handling (invalid email address)

**Recommendation:** Add email testing notes to T054: use Resend's test mode in CI, verify email rendering with React Email's preview, and document the daily limit monitoring approach.

---

### Q19 — No accessibility testing tools or methodology specified

**Impact: low — a11y baseline is in T002, but no tools or methodology for verification**

T083 includes accessibility checks, but doesn't specify tools:

- **Automated**: axe-core (can be integrated with Playwright), Lighthouse a11y audit
- **Manual**: keyboard navigation walkthrough, screen reader testing
- **Continuous**: eslint-plugin-jsx-a11y for catching issues at dev time

**Recommendation:** Add axe-core to Playwright tests (T094) for automated a11y checking. Include eslint-plugin-jsx-a11y in T002 (code quality). Define a manual accessibility testing checklist for T083.

---

### Q20 — No rollback testing for production deployments

**Impact: low — T089 mentions a rollback plan but doesn't define how to test it**

T089 says "rollback plan documented (revert to spreadsheets for X days if critical bug found)." But:

- How quickly can a Vercel deployment be rolled back? (Vercel supports instant rollback, but has this been tested?)
- If a bad migration has been applied, can the DB be restored without data loss?
- Is there a communication plan for notifying staff that the app is temporarily unavailable?

**Recommendation:** Include a rollback drill in T089: deploy a test "bad" version, verify rollback works within 5 minutes, and confirm the database restore process from T086.

---

### Q21 — No test coverage visibility or threshold enforcement

**Impact: low — T094 sets up testing infrastructure but doesn't require coverage tracking**

Without coverage tracking:

- There's no way to know which code paths are untested
- New features could be merged with 0% test coverage
- The "unit tests required for business logic" policy (T094) is unenforceable without a coverage tool

**Recommendation:** Add code coverage reporting to T094 (Vitest has built-in coverage via c8/istanbul). Set a minimum threshold for `packages/db/src/queries/` (financial logic) at 80%. Don't enforce global thresholds — they incentivize low-quality tests. Instead, require coverage for specific critical directories.

---

## Summary of recommended changes

| #   | Severity | Recommendation                                                                    | Affects                |
| --- | -------- | --------------------------------------------------------------------------------- | ---------------------- |
| Q1  | Critical | Create test plan documents for each phase with structured test scenarios          | All phases             |
| Q2  | Critical | Define E2E test scenarios for financial flows (checkout, payroll, payments)       | Phase 4A, 7            |
| Q3  | Critical | Define regression testing strategy and automated regression suite                 | T094, T095             |
| Q4  | Critical | Define test data management strategy (fixtures, isolation, environment parity)    | T094                   |
| Q5  | High     | Document race condition scenarios and concurrent access tests                     | T038, T051, T067, T068 |
| Q6  | High     | Define business day boundary edge case test scenarios                             | T019, Phase 1          |
| Q7  | High     | Add UAT task — real staff use staging for one full business day before go-live    | Phase 10               |
| Q8  | High     | Create security testing plan (RBAC negatives, input validation, session security) | T018, T095             |
| Q9  | High     | Add error/edge case scenarios to all tasks with business logic                    | All tasks              |
| Q10 | High     | Add post-deployment smoke test to CI/CD pipeline                                  | T095                   |
| Q11 | High     | Add performance testing plan with load and mobile benchmarks                      | Phase 8                |
| Q12 | Medium   | Create full RBAC permission matrix with automated negative tests                  | T018                   |
| Q13 | Medium   | Add migration rollback testing and data integrity verification                    | T006                   |
| Q14 | Medium   | Define cross-browser and cross-device testing matrix                              | T083                   |
| Q15 | Medium   | Define financial calculation rounding policy with deterministic test cases        | T002, T063–T065        |
| Q16 | Medium   | Add structured business logic logging beyond error tracking                       | T085, T002             |
| Q17 | Medium   | Define integration test scenarios at phase boundaries                             | All phases             |
| Q18 | Low      | Add email deliverability testing notes                                            | T054                   |
| Q19 | Low      | Specify a11y testing tools (axe-core, eslint-plugin-jsx-a11y)                     | T094, T002             |
| Q20 | Low      | Include rollback drill in production cutover                                      | T089                   |
| Q21 | Low      | Add code coverage reporting and threshold for financial logic                     | T094                   |

---

## What is already done well

1. **Acceptance criteria on every task** — most projects have vague task descriptions. These ACs are specific and verifiable, forming a solid baseline for test case derivation.
2. **Idempotency designed from Phase 0** — the biggest sync-related bug class (duplicate charges) is addressed architecturally, not as an afterthought.
3. **Optimistic locking on checkout** — concurrent checkout is handled at the design level, which is rare for an MVP.
4. **Double-pay prevention** — T068 explicitly prevents the most common payroll bug. The fact that it's a separate task (not buried in T067) shows intentional quality thinking.
5. **Price and commission snapshotting** — T034 snapshots values at ticket creation time. This prevents the most insidious financial data integrity issue (historical records changing when catalog changes).
6. **Split from T032 to T032b** — the SWE review correctly identified that T032 couldn't be tested until Phase 5. This kind of testability-aware task design is excellent.
7. **Three prior expert reviews** — the fact that a Product Owner, Software Engineer, and Designer each reviewed the full documentation before development started is exceptional quality practice. Most projects don't get even one.
8. **Issues tracker as a living document** — the `issues-tracker.md` with severity, status, and resolution log is a proper defect management system, not just a TODO list.
9. **Offline-first idempotency key design** — T033 adds the idempotency key column to tickets from the start, and T077 (offline policy) is a Phase 0 exit criterion. This prevents the expensive retrofit that most projects face.
10. **Explicit scope exclusions** — documenting what is out of scope (tips, promotions, multi-branch) prevents scope creep and sets clear testing boundaries.

---

## QA recommendations for project execution

### Phase gate quality checks

Before marking any phase as "done," verify:

1. **All ACs checked** — every acceptance criterion has been manually verified
2. **Test scenarios passed** — structured test scenarios (from Q1) have been executed
3. **Regression suite green** — all automated tests from previous phases still pass
4. **No open critical/high issues** — issues-tracker has no unresolved critical or high issues for this phase
5. **Security check** — RBAC negative tests pass for all new endpoints
6. **Performance check** — new endpoints meet P95 < 500ms target

### Continuous quality practices

- Run the full test suite on every PR (T095 already covers this)
- Add post-deployment smoke tests (Q10)
- Track test coverage for financial logic directories
- Update the issues tracker whenever a bug is found during testing
- Conduct a 15-minute "bug bash" at the end of each phase where the team tries to break the new features

### Test priority matrix

| Priority        | What to test                                                   | When                  |
| --------------- | -------------------------------------------------------------- | --------------------- |
| P0 — Always     | Financial calculations, RBAC boundaries, data integrity        | Every PR              |
| P1 — Per phase  | Feature-specific test scenarios, integration with prior phases | Phase completion      |
| P2 — Milestones | E2E financial flows, performance benchmarks, security scan     | After Phase 4A, 7, 10 |
| P3 — Pre-launch | UAT, cross-browser, accessibility audit, load testing          | Phase 10              |
