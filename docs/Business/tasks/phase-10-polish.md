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
- [ ] Accessibility check: all form inputs have labels; keyboard navigation works for all primary flows; colour contrast meets WCAG AA (4.5:1); focus indicators visible on interactive elements
- [ ] **Stretch — Dark mode:** If design tokens (T103) were built dark-mode-aware, implement a dark theme toggle. Test all screens in dark mode.
- [ ] **Stretch — Gesture support:** Evaluate swipe interactions for mobile-primary roles: swipe to mark done (clothier), swipe to dismiss notifications. Only add if gesture UX testing shows clear improvement over tap.
- [ ] **Stretch — Page transitions:** Add subtle transitions between list → detail → edit navigations (e.g. slide-in for detail views, fade for tab switches). Ensure breadcrumbs or back-links are present on all detail/edit views regardless.

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
- [ ] **Note:** Basic loading states (skeleton screens and button spinners) should already exist from Phase 1 onward per T002 standards. This task is for polishing and auditing completeness, not creating loading states from scratch.

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
- [ ] **Stretch — Contextual help:** Add tooltip-style help on the 5 most confusing UI elements (identified during QA pass). Tooltips link to the relevant section of the training guide. Ensure all action buttons have clear text labels (not icon-only).

---

## T102 — Stale-tab version detection

**Phase:** 10 — Polish *(new — Senior SWE review F25)*
**Status:** pending
**Dependencies:** T004

### What to do
When a new version of the app is deployed, users with stale browser tabs should see a non-blocking "A new version is available — please refresh" banner. Implement by including a build-time version identifier (e.g. git commit hash or build timestamp) in the app. Periodically check the deployed version via a lightweight API endpoint or header. If the versions differ, show the banner.

### Acceptance criteria
- [ ] Version identifier embedded at build time (e.g. `NEXT_PUBLIC_BUILD_ID`)
- [ ] Client polls `/api/version` (or reads a response header) every 5 minutes
- [ ] If deployed version differs from the client's version, a non-blocking banner appears at the top of the screen
- [ ] Banner includes a "Refresh now" button and a "Dismiss" option (banner reappears on next check)
- [ ] Banner does not interrupt an active checkout or form submission

---

## T100 — Data migration from existing spreadsheets

**Phase:** 10 — Polish *(new — Senior SWE review F10)*
**Status:** pending
**Dependencies:** T029, T030

### What to do
Create a migration script or admin UI to import existing client records from the company's current spreadsheets into the `clients` table. At minimum, import: client name, phone number, and email. This ensures the app doesn't start from zero on day one — staff can search for existing clients immediately.

### Acceptance criteria
- [ ] Import script accepts a CSV file with columns: name, phone, email
- [ ] Duplicate detection by phone or email (skip or flag duplicates)
- [ ] Import summary: X imported, Y skipped (duplicates), Z errors
- [ ] Imported clients appear in the client search (T030) immediately
- [ ] Script is idempotent (safe to run multiple times)
- [ ] Optional: import no-show counts if available in the source data

---

## T089 — Production cutover checklist

**Phase:** 10 — Polish
**Status:** pending
**Dependencies:** T083, T084, T086, T087, T088, T100, T102

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
