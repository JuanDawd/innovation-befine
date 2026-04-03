# Issues tracker — Innovation Befine

> **Purpose:** Living document that captures gaps, loopholes, inconsistencies, and risks discovered during project audits and development. Every issue found during development **must** be logged here with a severity, status, and resolution.
>
> **Last audit:** April 2026 (pre-development comprehensive audit)

---

## Severity definitions


| Severity     | Meaning                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Critical** | Blocks delivery or could cause data loss, financial errors, or security breaches            |
| **High**     | Significant gap that will cause rework if not addressed before or during the affected phase |
| **Medium**   | Important improvement that should be addressed but won't block progress                     |
| **Low**      | Minor polish, documentation cleanup, or edge case worth noting                              |


## Status definitions


| Status          | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| **Open**        | Issue identified, not yet resolved                     |
| **In progress** | Actively being addressed                               |
| **Resolved**    | Fix applied; reference the commit or task              |
| **Won't fix**   | Consciously decided not to address; document rationale |


---

## Critical issues

### C-01 — Missing `appointment_id` column on tickets table

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** T033 (tickets migration), T053 (appointment status), T035 (ticket creation)
- **Description:** T053 says "completing an appointment optionally links to a ticket" and T035 says "linking to an appointment is optional and set automatically in Phase 5." However, the `tickets` table schema in T033 has no `appointment_id` column. Without this FK, there is no mechanism to connect tickets to appointments.
- **Fix:** Add `appointment_id (FK nullable)` to the T033 schema definition.

### C-02 — Dependency graph missing P4B → P7 edge

- **Severity:** Critical
- **Status:** Resolved
- **Affected:** `project-plan.md` dependency graph, Phase 7 (payroll)
- **Description:** Phase 7 computes clothier earnings from approved batch pieces (T064 depends on T047, which is in Phase 4B). The mermaid dependency graph only shows `P4A --> P7`, not `P4B --> P7`. Phase 7 could theoretically start before cloth batch approvals exist, making clothier payroll untestable.
- **Fix:** Add `P4B --> P7` edge to the dependency graph in `project-plan.md`.

### C-03 — Currency decision still unresolved

- **Severity:** Critical
- **Status:** Open
- **Affected:** T099 (i18n), every UI that displays money, earnings computations
- **Description:** The open question "Confirm the currency used by the business (COP, USD, or other)" blocks T099 and every money-display task. COP has no cents (integer storage = whole pesos), while USD uses cents. This affects `formatMoney()`, decimal separators, and all price display logic.
- **Fix:** Get a definitive answer from the client before Phase 0 begins. Document in `project-plan.md` resolved decisions.

### C-04 — No data privacy/compliance research

- **Severity:** Critical
- **Status:** Open
- **Affected:** Entire project
- **Description:** The app stores PII (client names, phone, email, appointment history) and financial data (employee pay, payments). Latin American countries have data protection laws (Colombia: Ley 1581 de 2012, Brazil: LGPD, Mexico: LFPDPPP). No research document addresses compliance, data retention policies, or right-to-deletion requirements. The soft-delete pattern (preserving history) may conflict with deletion requests.
- **Fix:** Create `docs/research/data-privacy-compliance.md` and consult the specific legal requirements for the business's country.

---

## High-priority issues

### H-01 — Phase 0 scope inflation

- **Severity:** High
- **Status:** Open
- **Affected:** Phase 0 timeline and deliverability
- **Description:** Phase 0 started with ~8 work packages. After three senior reviews, it now has 20 tasks including: monorepo, linting, env vars, Vercel, Neon, Drizzle, auth spike, UI library spike, Pusher spike, RBAC, seed script, offline policy, Sentry, testing infra, CI/CD, API conventions, real-time abstraction, i18n, design system + tokens, and wireframes. No analysis estimates whether this is achievable as a single phase.
- **Fix:** Consider splitting Phase 0 into 0A (infrastructure: T001–T011, T085, T094, T095) and 0B (standards and design: T002 standards docs, T077, T097, T098, T099, T103, T104).

### H-02 — Sentry timing stale in `business.md`

- **Severity:** High
- **Status:** Resolved
- **Affected:** `docs/Business/business.md` line 65
- **Description:** `business.md` says "Error tracking | Sentry (free tier) | Phase 10" but the SWE review moved T085 to Phase 0. The client-facing document is inaccurate.
- **Fix:** Update `business.md` to reflect Sentry in Phase 0.

### H-03 — T013 circular dependency with T054 (Resend)

- **Severity:** High
- **Status:** Resolved
- **Affected:** T013 (employee account creation), T054 (Resend email integration)
- **Description:** T013 says the new employee "receives a password reset email (via Resend)" but doesn't list T054 as a formal dependency. If T054 isn't done, the email send silently fails and the new employee can't log in.
- **Fix:** Either add T054 as a formal dependency of T013, or specify that the admin can set an initial password manually when email isn't available yet.

### H-04 — Better Auth fallback plan is too shallow

- **Severity:** High
- **Status:** Open
- **Affected:** T007 (auth spike), entire auth layer
- **Description:** Better Auth is the newest and least battle-tested option (2024-2025). The mitigation is a 1-2 hour spike, which only tests initial setup, not production edge cases (session handling under load, RBAC with nested permissions). If critical issues emerge in Phase 3+, switching requires rewriting all auth code, middleware, and RBAC checks.
- **Fix:** Document a more robust fallback plan: "If critical issues emerge after Phase 0, the auth layer is abstracted behind middleware (T018), enabling a 2-day migration to Clerk or Auth.js."

### H-05 — Pusher reliability for financial operations

- **Severity:** High
- **Status:** Open
- **Affected:** T036 (cashier dashboard), T098 (real-time abstraction)
- **Description:** Pusher's free tier has no message delivery guarantee (fire-and-forget). For the cashier dashboard driving checkout decisions, a missed event means the cashier doesn't see a ticket awaiting payment. No fallback mechanism is documented.
- **Fix:** Add periodic polling as a fallback to the real-time abstraction (T098). The dashboard should poll every 30 seconds as a safety net, not rely solely on push events.

### H-06 — No security audit on go-live checklist

- **Severity:** High
- **Status:** Resolved
- **Affected:** T089 (production cutover)
- **Description:** The go-live checklist (T089) includes Sentry, uptime monitoring, and backups, but no security review. For a POS system handling payment data and PII, a basic OWASP top-10 review should be required before production.
- **Fix:** Add a "security review" acceptance criterion to T089 covering: CSRF protection, XSS prevention, CSP headers, rate limiting on non-auth endpoints, SQL injection prevention verification.

### H-07 — No Neon free-tier storage capacity estimate

- **Severity:** High
- **Status:** Open
- **Affected:** T005 (Neon setup), T101 (analytics seed script)
- **Description:** Neon free tier provides 0.5 GB storage. No estimate calculates expected data volume. The analytics seed script (T101) generates 6 months of data — nobody has verified this fits within 0.5 GB. Hitting the limit during staging would block development.
- **Fix:** Add a data volume estimate to `docs/research/postgres-providers.md` or `docs/technical-feasibility-and-research.md`.

### H-08 — Shared payment method enum defined three times

- **Severity:** High
- **Status:** Resolved
- **Affected:** T039 (ticket_payments), T057 (large_order_payments), T066 (payouts)
- **Description:** The `payment_method` enum (`cash | card | transfer`) is defined independently in three different table migrations. This creates maintenance risk — adding a new method requires updating three enums.
- **Fix:** Define a single shared `payment_method_enum` in the schema and reference it from all three tables.

### H-09 — No `appointment_id` column creates orphaned link

- **Severity:** High
- **Status:** Resolved
- **Affected:** Same as C-01 (duplicate tracking, different angle)
- **Description:** See C-01. Additionally, without this FK, analytics queries cannot determine revenue generated from appointments vs walk-ins.
- **Fix:** Same as C-01.

### H-10 — Large orders missing `cancelled` status

- **Severity:** High
- **Status:** Resolved
- **Affected:** T059 (order status flow)
- **Description:** The order status flow is `pending → in_production → ready → delivered → paid_in_full` with no `cancelled` status. If a client cancels a large order, the record is stuck in its current status indefinitely.
- **Fix:** Add `cancelled` to the status enum. Define whether deposits on cancelled orders are refundable (business decision).

### H-11 — No rate limiting beyond login endpoint

- **Severity:** High
- **Status:** Resolved
- **Affected:** T017 (password reset), T056 (email send), general API
- **Description:** T007 mentions rate limiting on login via Better Auth, but other sensitive endpoints (password reset requests, email sends, ticket creation) have no documented rate limits. An internal user could accidentally or maliciously trigger excessive operations.
- **Fix:** Document rate limiting policy in `docs/standards-api.md` (T097). Apply rate limiting to all mutation endpoints.

### H-12 — Neon cold start impact on POS workflow

- **Severity:** High
- **Status:** Open
- **Affected:** T005 (Neon setup), T019 (business day open)
- **Description:** Neon's free tier auto-suspends after inactivity, causing the first query to take slightly longer. For a POS system, the first transaction of the business day (opening the day) could experience a noticeable delay with no user feedback.
- **Fix:** Either disable auto-suspend on the production branch (paid tier), or implement a health-check cron that keeps the DB warm, or add a clear loading state on the "Open day" action.

---

## Medium-priority issues

### M-01 — No-show count never decrements

- **Severity:** Medium
- **Status:** Open
- **Affected:** T032b (no-show increment), T053 (appointment status)
- **Description:** If an appointment is incorrectly marked as no-show and the status is corrected, the `no_show_count` on the client record is never decremented. The count only goes up.
- **Fix:** Add decrement logic when a no-show status is reversed, or document this as a conscious limitation.

### M-02 — No guest-to-saved-client conversion

- **Severity:** Medium
- **Status:** Open
- **Affected:** T031 (guest flow), T030 (saved clients)
- **Description:** There is no mechanism to convert a guest entry into a saved client. If a walk-in customer becomes a regular, previous guest visits cannot be linked to their new profile.
- **Fix:** Add a "Create saved client from guest" action, or document as a post-MVP enhancement.

### M-03 — `service_summary` on appointments is disconnected from catalog

- **Severity:** Medium
- **Status:** Open
- **Affected:** T049 (appointments migration), T035 (ticket creation)
- **Description:** The `service_summary` field on appointments is free text, not linked to the catalog. When a ticket is created from an appointment, there's no automatic service pre-selection, creating potential inconsistencies between what was booked and what was billed.
- **Fix:** Consider adding a `service_variant_id` FK (nullable) to appointments, with `service_summary` as a fallback for non-catalog descriptions.

### M-04 — T028 missing cashier and clothier read access

- **Severity:** Medium
- **Status:** Open
- **Affected:** T028 (catalog read access)
- **Description:** T028 lists stylists and secretary as having read access but doesn't mention cashiers (who need service data for checkout) or clothiers (who need piece data for batch views).
- **Fix:** Add cashier and clothier to the read-access list for their respective catalog domains.

### M-05 — Client table has no unique constraint on phone or email

- **Severity:** Medium
- **Status:** Open
- **Affected:** T029 (clients migration), T100 (data migration)
- **Description:** The `clients` table allows duplicate phone numbers and emails, making duplicate detection during data migration (T100) difficult. Whether duplicates are intentional is undocumented.
- **Fix:** Decide: unique constraint on phone, email, or a composite? Or document that duplicates are allowed and the data migration script must handle deduplication.

### M-06 — T019 — No mechanism to reopen a prematurely closed business day

- **Severity:** Medium
- **Status:** Open
- **Affected:** T019 (business day), operational workflow
- **Description:** Once a business day is closed, there is no path to reopen it. If the admin closes the day prematurely, tickets cannot be created for that day. The decision to disallow reopening is not explicitly documented.
- **Fix:** Either add a "reopen day" capability (admin only, with audit trail) or document the restriction as intentional with the workaround (open a new business day).

### M-07 — T065 — "Days expected to work" assumes full-time for all employees

- **Severity:** Medium
- **Status:** Open
- **Affected:** T065 (secretary earnings), T020/T021 (absences)
- **Description:** Secretary earnings are calculated as `daily_rate × days_worked`. The system assumes every active employee is expected to work every business day. Part-time employees or employees with specific schedules are not supported.
- **Fix:** Confirm with the client that all employees work every day. If not, add a "work schedule" concept or per-employee expected days.

### M-08 — T067 — Payout amount adjustment has no audit trail

- **Severity:** Medium
- **Status:** Open
- **Affected:** T067 (payout recording)
- **Description:** The admin can adjust the payout amount before confirming, but there's no requirement to store the reason for adjustment or the original computed value. For a financial system, this is a significant audit gap.
- **Fix:** Add `original_computed_amount` and `adjustment_reason` columns to the payouts table.

### M-09 — T100 — No data validation or rollback for spreadsheet import

- **Severity:** Medium
- **Status:** Open
- **Affected:** T100 (data migration from spreadsheets)
- **Description:** The import script handles duplicate detection but specifies no validation rules for imported data (phone format, email format, name length). Also, no rollback mechanism if bad data is introduced.
- **Fix:** Add input validation to the import script. Create a backup point before import or tag imported records for easy identification.

### M-10 — T082 — iOS PWA limitations not addressed

- **Severity:** Medium
- **Status:** Open
- **Affected:** T082 (PWA install prompt), T081 (service worker)
- **Description:** The PWA spec mentions "Install prompt appears on Android Chrome" but doesn't address iOS Safari limitations (no install prompt, limited service worker scope). Staff likely use iPhones.
- **Fix:** Document iOS PWA behaviour and add "Add to Home Screen" instructions for iOS users to the training guide (T088).

### M-11 — No T062 dependency on T061 (payments)

- **Severity:** Medium
- **Status:** Resolved
- **Affected:** T062 (large orders list view)
- **Description:** T062 shows "balance due" which is computed from payments (T061), but T062 only depends on T059. It should depend on T061 as well.
- **Fix:** Add T061 to T062's dependency list.

### M-12 — Resend free tier may not cover daily email volume

- **Severity:** Medium
- **Status:** Open
- **Affected:** T054 (Resend integration), T056 (confirmation emails)
- **Description:** Resend free tier allows 100 emails/day. If 80+ appointments generate confirmation + potential rescheduling emails daily, the limit could be tight. No volume estimate exists.
- **Fix:** Estimate daily email volume and document in `docs/research/notification-channels.md`. Plan for the $20/mo Pro tier if needed.

### M-13 — T057 — `deposit_paid` column is redundant with payments table

- **Severity:** Medium
- **Status:** Open
- **Affected:** T057 (large orders migration)
- **Description:** The schema has both `deposit_paid` (column) and the initial deposit recorded in `large_order_payments`. This creates a dual source of truth that can diverge.
- **Fix:** Remove `deposit_paid` and compute from the payments table, or clarify it as a denormalized convenience column with an update trigger.

### M-14 — Timezone handling for appointments

- **Severity:** Medium
- **Status:** Open
- **Affected:** T049 (appointments), T052 (calendar view)
- **Description:** Appointments use `timestamp with time zone` but no specification locks the display timezone to the business location. On devices with different timezone settings, appointments could display at wrong times.
- **Fix:** Define the business timezone as a configuration constant. Display all times in that timezone regardless of the device's local setting.

### M-15 — No state management or form library research document

- **Severity:** Medium
- **Status:** Open
- **Affected:** Tech stack consistency
- **Description:** TanStack Query, Zustand, React Hook Form + Zod, date-fns, Recharts, and Lucide were accepted into the tech stack from inline review recommendations, but unlike Neon, Better Auth, Pusher, and Resend, they have no dedicated research document with pros/cons/alternatives.
- **Fix:** Either create a combined `docs/research/frontend-libraries.md` or add the rationale to `docs/technical-feasibility-and-research.md`.

### M-16 — Pusher free-tier message volume not estimated

- **Severity:** Medium
- **Status:** Open
- **Affected:** T009 (Pusher spike), T098 (real-time abstraction)
- **Description:** Pusher free tier allows 200K messages/day. No estimate calculates expected daily message volume based on tickets, status changes, notifications, and connected clients. Without this, the team doesn't know when to plan migration.
- **Fix:** Add a message volume estimate to `docs/research/realtime-transport.md`.

### M-17 — `commission_pct` precision not specified

- **Severity:** Medium
- **Status:** Open
- **Affected:** T023 (services migration), T063 (earnings computation)
- **Description:** `commission_pct` is stored as `numeric(0–100)` but the exact precision (e.g., `numeric(5,2)` for values like `15.50%`) is not defined. This affects earnings computation accuracy.
- **Fix:** Specify the exact `numeric` precision in T023 acceptance criteria.

### M-18 — Real-time migration from Pusher has no task

- **Severity:** Medium
- **Status:** Open
- **Affected:** `docs/research/realtime-transport.md`, project plan
- **Description:** The research file says "Build this in Phase 9" but Phase 9 is specifically about offline/PWA. No actual task covers migrating from Pusher to SSE + Postgres LISTEN/NOTIFY.
- **Fix:** Either add a placeholder task for the migration, or document it as a post-MVP activity.

---

## Low-priority issues

### L-01 — T016 — No account lockout UX after rate limiting

- **Severity:** Low
- **Status:** Open
- **Affected:** T016 (login page)
- **Description:** Better Auth rate limits the login endpoint, but the login UI doesn't specify what message to show after too many failed attempts (e.g., "Too many attempts, try again in X minutes").
- **Fix:** Add rate-limit feedback message to T016 acceptance criteria.

### L-02 — T091 — No password complexity rules beyond minimum length

- **Severity:** Low
- **Status:** Open
- **Affected:** T091 (self-service password change)
- **Description:** Only specifies "< 8 characters" rejection. No requirement for mixed case, numbers, or special characters. Acceptable if intentional, but should be documented.
- **Fix:** Document as a conscious decision or add complexity rules.

### L-03 — T025 — No pagination on audit log

- **Severity:** Low
- **Status:** Open
- **Affected:** T025 (catalog audit log)
- **Description:** On a frequently-edited catalog, the audit log could grow large. No pagination or date filtering is specified for the audit log display.
- **Fix:** Add pagination to T025 acceptance criteria.

### L-04 — T023 — No maximum variant count per service

- **Severity:** Low
- **Status:** Open
- **Affected:** T023 (services migration), T024 (service catalog UI)
- **Description:** A service can have unlimited variants. Could lead to an unwieldy UI. Consider a soft limit or a warning.
- **Fix:** Add a UI warning if more than 10 variants are added (configurable threshold).

### L-05 — WhatsApp pricing data is outdated

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`
- **Description:** WhatsApp pricing section contains 2025 data in a document dated April 2026. Meta's pricing model changes frequently.
- **Fix:** Note as "pricing approximate, verify before implementation."

### L-06 — SMS pricing uses US rates for Latin American business

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`
- **Description:** SMS pricing references US Twilio rates ($0.0079/SMS) when the business is in Latin America.
- **Fix:** Update with the specific country's rates when known.

### L-07 — T032 displays a no-show count that's always 0 until Phase 5

- **Severity:** Low
- **Status:** Open
- **Affected:** T032 (no-show display, Phase 3), T032b (increment logic, Phase 5)
- **Description:** The no-show count display exists in Phase 3 but the increment mechanism doesn't arrive until Phase 5. Phase 3 deliverable can only verify "it displays 0."
- **Fix:** Acceptable as-is (design exists early), but note this in testing — meaningful verification requires Phase 5 to be complete.

### L-08 — T102 — Polling every 5 minutes may be aggressive

- **Severity:** Low
- **Status:** Open
- **Affected:** T102 (stale-tab detection)
- **Description:** Each tab polls `/api/version` every 5 minutes. With many staff members and tabs, this adds unnecessary API load.
- **Fix:** Consider using the service worker (T081) for the check, or increase interval to 15 minutes.

### L-09 — No file/image storage research

- **Severity:** Low
- **Status:** Open
- **Affected:** General project scope
- **Description:** Large cloth orders may benefit from reference photos; employee profiles might need photos. No file storage solution is researched (Vercel Blob, S3, Cloudinary). File upload is implicitly out of scope but never explicitly stated.
- **Fix:** Document that file/image upload is out of scope for MVP, or add a research item.

### L-10 — `business.md` ORM reference mentions Prisma/Kysely

- **Severity:** Low
- **Status:** Resolved
- **Affected:** `docs/research/postgres-providers.md`
- **Description:** Line mentions "the ORM (Prisma/Drizzle/Kysely)" listing three options, but the project decided on Drizzle ORM. Creates confusion for new readers.
- **Fix:** Update to reference only Drizzle ORM.

### L-11 — T089 — No soft-launch / canary rollout strategy

- **Severity:** Low
- **Status:** Open
- **Affected:** T089 (production cutover)
- **Description:** The cutover checklist is all-or-nothing. A phased rollout (admin uses the app for 1 week before stylists onboard) would reduce risk.
- **Fix:** Add a phased rollout recommendation to T089.

### L-12 — T087 — Health endpoint doesn't check DB connectivity

- **Severity:** Low
- **Status:** Resolved
- **Affected:** T087 (uptime monitoring)
- **Description:** The `/api/health` endpoint returns `{ status: "ok" }` but doesn't verify DB connectivity. If Neon is down, the health check still passes.
- **Fix:** Add a lightweight DB ping (`SELECT 1`) to the health endpoint.

### L-13 — T055 — No brand logo in email template

- **Severity:** Low
- **Status:** Open
- **Affected:** T055 (appointment confirmation email)
- **Description:** The email template AC specifies content but doesn't require brand logo/colours from T105.
- **Fix:** Add brand assets to the email template requirements.

### L-14 — Confirmation email endpoint security for non-users

- **Severity:** Low
- **Status:** Open
- **Affected:** `docs/research/notification-channels.md`, T056
- **Description:** The research mentions a "confirm/cancel link" in the email, implying a public endpoint. But the app is internal-only. How a non-user (the client) interacts with this link, including authentication and security, is undefined.
- **Fix:** Define the endpoint: is it a tokenized public link, or does confirmation happen manually by the secretary?

### L-15 — `commission_pct` precision not specified

- **Severity:** Low
- **Status:** Open
- **Affected:** T023, T063 (earnings computation)
- **Description:** Moved from M-17 scope — `commission_pct` is stored as `numeric(0–100)` but rounding policy for fractional commissions (e.g. 33.33% of $100 = $33.33 or $33.34?) is not defined. This affects every stylist payout and compounds over time.
- **Fix:** Define rounding policy in T002 standards: recommend round half-up for customer-facing amounts, truncate for commission calculations. Specify `numeric(5,2)` precision for `commission_pct`.

---

## Lessons learned

> This section is populated during development. Each entry documents what went wrong, the root cause, and how to prevent it in the future.


| Date | Phase | Issue | Root cause | Prevention |
| ---- | ----- | ----- | ---------- | ---------- |
| 2026-04-02 | Pre-dev | 12 issues fixable by documentation update were left open | Issues identified but fixes deferred — no process to batch-resolve documentation-only issues | Schedule a documentation fix sweep after each review round; don't wait for development to start |
| 2026-04-02 | Pre-dev | No test plans, QA strategy, or edge case scenarios existed despite 106 well-specified tasks | Acceptance criteria were treated as sufficient for testing; no QA perspective in review cycle | Include a QA review as a standard step after every major planning document is created; ACs define _what_ to verify, test plans define _how_ and _what else_ to try breaking |


---

## Resolution log

> When an issue is resolved, update its status above and add an entry here.


| Issue ID | Date resolved | Resolution | Commit/PR |
| -------- | ------------- | ---------- | --------- |
| C-01     | 2026-04-02    | Added `appointment_id (FK nullable)` to T033 schema in `phase-04a-tickets-checkout.md` | Senior QA review |
| C-02     | 2026-04-02    | Added `P4B --> P7` edge to mermaid dependency graph in `project-plan.md` | Senior QA review |
| H-02     | 2026-04-02    | Updated `business.md` Sentry entry from "Phase 10" to "Phase 0" | Senior QA review |
| H-03     | 2026-04-02    | Added manual password fallback to T013 AC when Resend is unavailable | Senior QA review |
| H-06     | 2026-04-02    | Added security review checklist to T089 acceptance criteria | Senior QA review |
| H-08     | 2026-04-02    | Added shared `payment_method_enum` definition to T006 acceptance criteria | Senior QA review |
| H-09     | 2026-04-02    | Resolved via C-01 fix (same `appointment_id` column) | Senior QA review |
| H-10     | 2026-04-02    | Added `cancelled` status to large order enum in T057 and T059 with cancellation reason | Senior QA review |
| H-11     | 2026-04-02    | Added rate limiting policy to T097 acceptance criteria covering all mutation endpoints | Senior QA review |
| M-11     | 2026-04-02    | Added T061 to T062 dependency list in task file and progress.md | Senior QA review |
| L-10     | 2026-04-02    | Updated `postgres-providers.md` to reference only Drizzle ORM | Senior QA review |
| L-12     | 2026-04-02    | Updated T087 health endpoint AC to include DB connectivity check (`SELECT 1`) | Senior QA review |


