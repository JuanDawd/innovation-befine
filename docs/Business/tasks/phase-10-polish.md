# Phase 10 — Polish and rollout

> Goal: all role flows tested on mobile and desktop, error tracking active, DB backed up, and staff trained.

---

## T083 — Responsive QA pass

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** all previous phases

### What to do
Test every role's primary flows on both a mobile device (or browser DevTools mobile emulation) and a desktop browser. Document any layout issues and fix them.

Flows to test per role:
- **Admin:** open/close day, catalog edit, checkout, payroll settlement, analytics.
- **Stylist:** log service, view own tickets, view earnings.
- **Clothier:** view batch, mark piece done.
- **Secretary:** book appointment, create batch, confirm appointment.

### Acceptance criteria
- [ ] No horizontal scroll on mobile for any primary flow
- [ ] All touch targets ≥ 44×44 px
- [ ] Text is legible at default mobile font size (no sub-12px text)
- [ ] Forms are fillable on a phone keyboard (no content covered by the virtual keyboard)
- [ ] All critical actions reachable within 3 taps on mobile

---

## T084 — Loading states and optimistic UI

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** all previous phases

### What to do
Audit every user action that triggers a server call. Add:
- Skeleton loaders or spinners on initial data loads.
- Button disabled state + spinner while a form is submitting.
- Optimistic updates for ticket status changes (update UI immediately, revert on error).

### Acceptance criteria
- [ ] No "blank flash" on page load for any primary screen
- [ ] Submit buttons cannot be double-clicked (disabled after first click)
- [ ] Optimistic ticket status update reverts to previous state on API error
- [ ] Error messages are user-friendly (not raw API errors)

---

## T085 — Sentry error tracking

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** T004

### What to do
Install `@sentry/nextjs` and configure it for the Vercel deployment. Set up a free-tier Sentry project. Capture unhandled errors on both client and server. Add a custom error boundary around the cashier dashboard.

### Acceptance criteria
- [ ] Sentry DSN added to Vercel environment variables
- [ ] A test error (`throw new Error("test")`) appears in the Sentry dashboard
- [ ] Source maps uploaded so stack traces show original TypeScript line numbers
- [ ] PII (client names, emails) is scrubbed from Sentry events (configure `beforeSend`)

---

## T086 — Database backup policy

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** T005

### What to do
Verify and document Neon's built-in backup behavior. Neon free tier provides point-in-time restore for 24 hours; paid plans extend this. Document the backup policy and test a restore drill on the staging branch.

### Acceptance criteria
- [ ] Backup retention window documented in `docs/research/` or a runbook
- [ ] Restore drill performed on staging: drop a table, restore to a prior point
- [ ] Admin is notified if the Neon project approaches storage limits (set up a Neon alert)

---

## T087 — Uptime monitoring

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** T004

### What to do
Set up a free uptime monitor (e.g. Better Uptime free tier, UptimeRobot, or Vercel's built-in checks) to ping the app's health endpoint every 5 minutes and alert via email if it goes down.

### Acceptance criteria
- [ ] A `/api/health` endpoint returns `{ status: "ok" }` with a 200 response
- [ ] Monitor configured to check the endpoint every 5 minutes
- [ ] Alert email sent within 5 minutes of a downtime event (tested by temporarily returning 500)

---

## T088 — Internal training guide

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** all previous phases

### What to do
Write a short guide (Markdown or PDF) for each role explaining their daily workflow in the app. Focus on the most frequent tasks; do not explain every setting.

Sections:
- **Cashier / admin:** open day, checkout flow, end-of-day payroll, close day.
- **Stylist:** log a service, mark awaiting payment, view earnings.
- **Clothier:** view batch, mark piece done.
- **Secretary:** book appointment, send confirmation, create batch.

### Acceptance criteria
- [ ] One page per role (concise — staff should be able to read their section in < 5 minutes)
- [ ] Includes screenshots or screen recordings for the 2–3 most confusing steps
- [ ] Stored in `docs/training/` and accessible to the client

---

## T089 — Production cutover checklist

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** T083, T084, T085, T086, T087, T088

### What to do
Create and execute the go-live checklist before switching staff from the old system (spreadsheets) to the app.

Checklist items:
- [ ] All environment variables set in Vercel production
- [ ] Neon production branch migrated to latest schema
- [ ] Seed script NOT run on production (or run with production-safe data only)
- [ ] All employee accounts created and passwords set
- [ ] Admin has tested open-day → checkout → close-day on production
- [ ] Sentry receiving events
- [ ] Uptime monitor active
- [ ] Training guide distributed to all staff
- [ ] Rollback plan documented (revert to spreadsheets for X days if critical bug found)

### Acceptance criteria
- [ ] Every item on the checklist above is ticked
- [ ] A "go / no-go" decision is made by the business owner before staff cutover
