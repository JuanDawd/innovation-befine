# Go-live checklist — BeFine

> Execute this checklist sequentially before switching staff from spreadsheets to the app.
> **All items must be ticked and signed off by the business owner before cutover.**

---

## 1. Environment and infrastructure

- [ ] All environment variables set in Vercel production project:
  - `DATABASE_URL` (Neon production branch)
  - `BETTER_AUTH_SECRET` (strong random string, ≠ staging)
  - `BETTER_AUTH_URL` (production URL, e.g. `https://befine.vercel.app`)
  - `NEXT_PUBLIC_APP_URL`
  - `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - `NEXT_PUBLIC_BUILD_ID` (set automatically via `VERCEL_GIT_COMMIT_SHA` in `next.config.ts`)
- [ ] Neon production branch migrated to latest schema (`pnpm --filter @befine/db db:migrate`)
- [ ] Neon plan upgraded to **Launch** ($19/mo) for 7-day PITR backup retention
- [ ] Neon storage alert configured: alert when storage > 80% of plan limit
- [ ] Seed script **NOT** run on production (analytics seed destroys real data)

## 2. Security verification

- [ ] CSRF: Next.js Server Actions include built-in CSRF protection (same-origin cookie)
- [ ] XSS: CSP headers configured in `next.config.ts` or Vercel project settings
- [ ] Rate limiting: verified active on all mutation endpoints (Upstash Redis connected)
- [ ] SQL injection: all queries use Drizzle parameterized statements — no raw string interpolation
- [ ] PII: Sentry `beforeSend` scrubs request data, breadcrumbs, and extra fields (T0AR-R4)
- [ ] RBAC: every server action checks session + role before executing (endpoint contract tests: 120 passing)
- [ ] Accessibility contrast issue H-28 resolved (WCAG AA — must be done before go-live)

## 3. Staff accounts

- [ ] One `cashier_admin` account created for the owner/admin
- [ ] All employees (stylists, clothiers, secretary) have accounts with initial passwords communicated securely
- [ ] Each employee has logged in at least once on staging and confirmed they can access their role's screens
- [ ] Admin has verified the `ban` / deactivate flow for a test account

## 4. Data

- [ ] Client records imported from spreadsheets:
  ```bash
  pnpm --filter @befine/db db:import:clients clients.csv --dry-run  # verify first
  pnpm --filter @befine/db db:import:clients clients.csv
  ```
- [ ] Service catalog created: all services, variants, and commissions entered
- [ ] Cloth piece catalog created: all piece types and variants entered
- [ ] Employee profiles complete: role, commission rate (stylists), piece rate (clothiers), daily rate (secretary)

## 5. Smoke test on production

Perform with real staff before announcing go-live:

- [ ] Admin opens a business day
- [ ] Stylist creates a ticket and marks it awaiting payment
- [ ] Cashier processes checkout (cash payment)
- [ ] Business day stats show correct totals
- [ ] Admin records a payout for today
- [ ] Admin closes the business day
- [ ] Sentry receives at least one test event (trigger a fake error on staging to confirm)
- [ ] Uptime monitor shows green after /api/health check

## 6. Monitoring and alerts

- [ ] Uptime monitor configured (UptimeRobot / Better Uptime free) pinging `/api/health` every 5 min
- [ ] Alert email set to `juandawdb@gmail.com`
- [ ] Sentry project active and receiving events from the production environment
- [ ] Version banner tested: deploy a change and verify the banner appears after 5 minutes

## 7. Training

- [ ] Training guides distributed: `docs/training/` — one guide per role
- [ ] Each role representative has read their guide and confirmed understanding
- [ ] UAT completed (T106): one representative per role ran a full simulated business day on staging

## 8. Rollback plan

- [ ] Rollback procedure documented and tested (see `docs/research/backup-policy.md`):
  - Vercel rollback: Vercel Console → Deployments → Redeploy previous commit (< 2 min)
  - DB rollback: Neon PITR to timestamp before go-live (< 5 min)
  - Staff fallback: revert to spreadsheets for up to 24 hours if critical bug found
- [ ] Rollback drill completed on staging: deployed a "bad" version, rolled back, confirmed recovery

## 9. Go / No-go decision

| Criteria                                                    | Status | Sign-off |
| ----------------------------------------------------------- | ------ | -------- |
| All checklist items above ticked                            |        |          |
| No open Critical or High issues in `docs/issues-tracker.md` |        |          |
| Contrast issue H-28 resolved                                |        |          |
| UAT sign-off received from all 4 role representatives       |        |          |
| Business owner approves go-live                             |        |          |

**Go-live date:** ******\_\_\_******  
**Signed off by:** ******\_\_\_******

---

> After go-live: monitor Sentry and uptime for 48 hours. Keep rollback plan accessible.
> Log any post-launch issues in `docs/issues-tracker.md` with severity "Post-launch".
