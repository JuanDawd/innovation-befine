# Post-MVP Roadmap

> Enhancements and scaling features planned after the MVP (Phases 0–10) ships to production and passes UAT. Items are atomic and testable. Prioritisation happens at each planning cycle — this file captures the design space, not a committed schedule.
>
> **Trigger:** All MVP phases complete, UAT signed off (T106), production deployment done (T089).

---

## Phase A: Communication and Notifications

---

### Task A.1: Push notifications — cashier and clothier alerts

- **Description:** Cashier receives a browser push when a new ticket is logged (even when the tab is in the background). Clothier receives a push when a piece is assigned. Requires VAPID keys, a `PushSubscription` stored per employee in the DB, and service worker background sync (building on the service worker from T081).
- **Acceptance Criteria:**
  - Cashier receives a browser push notification when a new ticket is logged from any other client.
  - Clothier receives a push when a craftable piece is assigned to them.
  - Subscriptions stored per employee in a `push_subscriptions` table (employee_id, endpoint, keys).
  - Service worker handles `push` events and displays a notification with ticket/piece summary.
  - Unsubscribing removes the DB record; stale subscriptions are pruned.
- **Testing Steps:**
  - Open cashier dashboard in one tab → log a ticket in another tab → cashier tab receives push.
  - Assign a craftable piece to a clothier → clothier receives push.
  - Unsubscribe in browser settings → push_subscriptions row deleted.
- **Dependencies:** T081 (service worker), T044/3.1 (craftables schema).

---

### Task A.2: Appointment reminders via WhatsApp / SMS

- **Description:** Send appointment reminders to clients 24 hours before their appointment. Requires an SMS/WhatsApp gateway (Twilio or Meta Cloud API) and an opt-in consent column on the clients table.
- **Acceptance Criteria:**
  - `clients.reminder_consent boolean` column added with migration.
  - Secretary can toggle `reminder_consent` per client in the client edit form.
  - A scheduled job (Vercel cron) queries appointments scheduled for tomorrow and sends reminders to consenting clients.
  - Reminder log stored per appointment (sent_at, channel, status).
  - Clients with `reminder_consent = false` never receive messages.
- **Testing Steps:**
  - Set `reminder_consent = true` for a client with a tomorrow appointment → cron fires → reminder sent and log entry created.
  - Set `reminder_consent = false` → cron fires → no message sent.
- **Dependencies:** T049 (appointments table), T089 (production go-live).

---

### Task A.3: Appointment confirmation emails

- **Description:** Build a React Email template for appointment confirmations (salon brand header, appointment date/time/service in `America/Bogota`, stylist name, and a manage-link or contact-CTA). Add a "Send confirmation email" action to each appointment, gated to `cashier_admin` and `secretary`. Record who sent the email, when, and which template version, so a re-send does not silently spam the client.
- **Acceptance Criteria:**
  - React Email template renders correctly in major email clients (tested via Resend preview).
  - "Send confirmation email" action is visible to `cashier_admin` and `secretary` on each appointment row.
  - Action is blocked for other roles (`FORBIDDEN`).
  - Sending records a `confirmation_emails` log row (appointment_id, sent_by, sent_at, template_version).
  - Re-sending within 24h shows a warning: "Ya se envió una confirmación hoy. ¿Confirmar reenvío?"
  - Email localised in Spanish; English fallback available.
- **Testing Steps:**
  - As cashier_admin: click "Send confirmation" → email delivered to client → log row created.
  - As stylist: action is not visible.
  - Re-send within 24h → warning dialog shown before sending.
- **Dependencies:** T054/T055 (Resend integration), Resend domain verification for production sender.

---

## Phase B: Client-Facing Booking App

> **Status:** Not in MVP. Decision to build this is not yet made — this section captures the design space so the MVP schema does not foreclose the option.

---

### Task B.1: Schema additions for self-booking

- **Description:** Add the minimum schema changes required to support client self-booking without breaking existing staff flows. No UI is built in this task — schema only.
- **Acceptance Criteria:**
  - `clients.auth_user_id text UNIQUE` added (nullable for existing clients).
  - `business_settings.booking_cancellation_cutoff_hours integer DEFAULT 2` added.
  - `stylist_availability` table created: `(id uuid PK, employee_id uuid FK, day_of_week smallint, start_time time, end_time time, is_active boolean DEFAULT true)`.
  - All migrations apply cleanly without breaking existing seed data.
  - `turbo typecheck` passes.
- **Testing Steps:**
  - Apply migrations → verify existing clients are unaffected (auth_user_id = null for all).
  - Insert a stylist_availability row → succeeds.
- **Dependencies:** T049 (appointments), T089 (production go-live), minimum 2 months of production usage data.

---

### Task B.2: Client auth flow — magic link login

- **Description:** Add a separate client auth flow using Better Auth's magic link (email OTP) plugin, creating a new `client` user role that does not conflict with the existing staff auth flow.
- **Acceptance Criteria:**
  - Client can request a magic link email using their address.
  - Clicking the link logs them in and sets their session role to `client`.
  - `client` role cannot access any staff routes — middleware blocks with 403.
  - `clients.auth_user_id` is populated after the first successful login.
- **Testing Steps:**
  - Request magic link for a client email → receive email → click link → logged in as `client`.
  - Attempt to access `/admin` as `client` → 403.
- **Dependencies:** Task B.1.

---

### Task B.3: Public service and stylist browsing

- **Description:** A lightweight public route group (`/book`) where a logged-in client can browse available services and stylists. Reads from the existing `services` and `employees` tables. No staff-only data exposed.
- **Acceptance Criteria:**
  - `/book` accessible to `client` role only (unauthenticated → redirect to login).
  - Lists active services with name, description, and price range.
  - Lists active stylists (name only — no financial or internal data).
  - No staff-side data (payroll, tickets, batches) is accessible.
- **Testing Steps:**
  - As `client`: navigate to `/book` → service list renders.
  - As unauthenticated: redirect to client login.
  - As `secretary`: redirect to staff dashboard (not `/book`).
- **Dependencies:** Task B.2.

---

### Task B.4: Real-time slot availability and appointment booking

- **Description:** Show real-time available appointment slots per stylist. Client selects service → stylist → date → available time slot → confirms booking. The booking lands in the secretary's appointment list as `booked` status. Prevent double-booking via the DB-level unique constraint from T051.
- **Acceptance Criteria:**
  - Available slots derived from `stylist_availability` minus existing appointments in the selected date.
  - Double-booking is prevented at the DB level (T051 unique constraint on employee_id + datetime).
  - Newly created appointment appears in the secretary's appointment list with `status = 'booked'`.
  - SSE notifies the secretary view in real time when a new self-booked appointment arrives.
- **Testing Steps:**
  - Client books slot at 10:00 → second client attempts same slot → receives "Slot unavailable" error.
  - Appointment appears in secretary's list within seconds of booking.
- **Dependencies:** Task B.3, T051 (double-booking prevention).

---

### Task B.5: Client appointment management — cancel and reschedule

- **Description:** Client can cancel or reschedule an existing appointment up to N hours before it (configurable via `business_settings.booking_cancellation_cutoff_hours`). Past the cutoff, the action is blocked.
- **Acceptance Criteria:**
  - Client can cancel or reschedule appointments via the `/book/appointments` screen.
  - Cancellation/reschedule blocked within `booking_cancellation_cutoff_hours` hours of the appointment.
  - Cancellation sends an email notification to the salon (Resend).
  - Action log row created on cancel/reschedule.
- **Testing Steps:**
  - Client cancels appointment 3 hours before (cutoff = 2) → succeeds.
  - Client attempts to cancel 1 hour before → blocked with error "El plazo para cancelar ha pasado".
- **Dependencies:** Task B.4, Task A.3.

---

## Phase C: Analytics and Exports

---

### Task C.1: PDF export of payout summaries

- **Description:** Add PDF export for per-employee payout summaries (per period). The PDF includes the employee name, settlement period, daily breakdown of services/pieces, and total payout. Generated server-side and returned as a downloadable file.
- **Acceptance Criteria:**
  - Admin can download a PDF payout summary for any employee + period.
  - PDF includes: employee name, period dates, daily breakdown, total payout amount.
  - Amount displayed in COP format (`$12.500`).
  - Download action gated to `cashier_admin`.
- **Testing Steps:**
  - As cashier_admin: download PDF for an employee with a completed payout → file downloaded, amounts correct.
  - As `secretary`: download action not available.
- **Dependencies:** T076 (CSV export), T089 (production go-live).

---

### Task C.2: DIAN-compatible format for VAT reporting

- **Description:** Add a DIAN-compatible export format for Colombian VAT reporting. The export covers a configurable date range and includes: ticket totals, service categories, and applicable IVA rates.
- **Acceptance Criteria:**
  - Admin can export a DIAN-format file for a selected date range.
  - File format matches DIAN electronic invoicing spec (XML or CSV as required).
  - Export gated to `cashier_admin`.
- **Testing Steps:**
  - Export for a known date range → file generated with correct totals matching the analytics dashboard.
- **Dependencies:** Task C.1.

---

### Task C.3: Scheduled monthly report email to accountant

- **Description:** A Vercel cron job runs on the first of each month, generates the CSV export from T076 for the previous month, and emails it to a configurable accountant address using Resend.
- **Acceptance Criteria:**
  - Cron fires on the 1st of each month.
  - CSV attached to the email matches the manually downloadable export for the same period.
  - Accountant email address configurable in `business_settings` (no redeploy required).
  - Email send logged (sent_at, period, recipient) for auditing.
- **Testing Steps:**
  - Trigger cron manually for a test period → email received with attached CSV.
  - Change recipient email in business_settings → next cron uses updated address.
- **Dependencies:** T076, Task A.3 (Resend integration).

---

## Phase D: Client Administration

---

### Task D.1: Client deduplication tool

- **Description:** Admin can view potential duplicate clients (same phone number or similar name) and merge two records into one canonical record. All tickets from the duplicate are redirected to the canonical. No automatic merging — always requires admin confirmation.
- **Acceptance Criteria:**
  - Deduplication screen lists candidate pairs grouped by phone match or fuzzy name similarity.
  - Admin selects canonical record → all duplicate's tickets, appointments, and history reassigned to canonical.
  - Duplicate record is soft-deleted (`is_active = false`) after merge.
  - Merge is irreversible — confirmation dialog includes warning and lists affected record counts.
  - Gated to `cashier_admin`.
- **Testing Steps:**
  - Seed two clients with the same phone → deduplication screen shows the pair.
  - Merge → duplicate's tickets appear under the canonical client. Duplicate client is inactive.
  - As `secretary`: deduplication screen not accessible.
- **Dependencies:** T089 (production go-live).

---

## Phase E: Performance and Reliability

---

### Task E.1: SSE → Postgres LISTEN/NOTIFY in production

- **Description:** The current SSE transport uses an in-process EventEmitter. On Vercel, each serverless function instance is isolated, so SSE events published from a Server Action may not reach SSE subscribers in a different instance (the 30-second polling fallback handles this, but it is slow). Replace the EventEmitter bus in `packages/realtime/src/server.ts` with Postgres `LISTEN/NOTIFY` using a persistent WebSocket connection (`@neondatabase/serverless` in WS mode). Changes are isolated to that one file.
- **Acceptance Criteria:**
  - SSE events published from any serverless function instance are received by all subscribers, even when instances are different.
  - The 30-second polling fallback is retained as a safety net but should not be the primary delivery path.
  - No changes to any consumer of `packages/realtime` — the interface is unchanged.
  - Load test: simulate 2 concurrent instances publishing events; all subscribers receive every event.
- **Testing Steps:**
  - Deploy to Vercel with 2 forced instances → publish an SSE event from instance A → subscriber on instance B receives it within 1 second.
- **Dependencies:** T089 (production go-live).

---

### Task E.2: Edge middleware session verification

- **Description:** Current middleware calls `betterFetch` to `/api/auth/get-session`, adding a network round-trip. Move session cookie verification directly into middleware using the Better Auth `jwt` plugin or by verifying the signed cookie with `BETTER_AUTH_SECRET` in the Edge runtime.
- **Acceptance Criteria:**
  - Middleware verifies the session without an HTTP round-trip.
  - TTFB for authenticated pages reduced by at least 50ms on average (measured via Vercel analytics).
  - All RBAC checks continue to function correctly after the change.
- **Testing Steps:**
  - Before/after: measure TTFB for `/admin/dashboard` at p50 and p95.
  - Log in as each role → navigate to role-specific pages → all render correctly.
  - Attempt to access `/admin` as `clothier` → 403 as before.
- **Dependencies:** T089 (production go-live).

---

### Task E.3: Query optimisation pass

- **Description:** Add composite indexes identified during analytics query profiling (T075). Review N+1 patterns in `listOpenTickets`, `listPendingEditRequests`, and settlement queries. Document `EXPLAIN ANALYZE` output for the 5 most expensive queries in `docs/research/`.
- **Acceptance Criteria:**
  - At least 3 composite indexes added that reduce query time by >30% (verified with `EXPLAIN ANALYZE`).
  - `listOpenTickets` executes in under 50ms on a database with 10,000 ticket rows.
  - `EXPLAIN ANALYZE` output for the 5 most expensive queries saved in `docs/research/query-profiles.md`.
- **Testing Steps:**
  - Run `EXPLAIN ANALYZE` on `listOpenTickets` before and after → confirm improvement.
  - Seed 10,000 ticket rows → `listOpenTickets` executes in under 50ms.
- **Dependencies:** T089 (production go-live), T075 (analytics queries).

---

## Phase F: Developer Experience

---

### Task F.1: Component Storybook

- **Description:** Document all design system components (`Button`, `Dialog`, `EmptyState`, `StatusBadge`, `StatCard`, `CraftableStatusBadge`, `CraftableProgressBar`, etc.) with Storybook stories. Enables visual regression detection before production and designer hand-off without running the full app.
- **Acceptance Criteria:**
  - Storybook renders all listed components with all documented prop combinations.
  - Stories include: default, disabled, loading, error, empty, and edge-case variants.
  - Visual regression CI check runs on every PR (Chromatic or Percy).
- **Testing Steps:**
  - Run `storybook` → all stories render without errors.
  - Introduce a visual regression intentionally → CI catches it.
- **Dependencies:** None.

---

### Task F.2: End-to-end test expansion

- **Description:** Phase 4A E2E tests cover the checkout lifecycle. Add E2E tests for: appointment booking flow (secretary → confirm → no-show), payout recording with adjustment, offline checkout → reconnect sync, and (when Phase B ships) client self-booking.
- **Acceptance Criteria:**
  - Appointment booking E2E: secretary creates appointment → status transitions to confirmed → simulated no-show → status transitions to no_show.
  - Payout recording E2E: cashier records payout with price override → payout row in DB with correct amounts.
  - Offline checkout E2E: simulate network loss → complete checkout → reconnect → verify ticket closed and payment recorded.
  - All tests pass in CI against the seeded staging database.
- **Testing Steps:**
  - Run `turbo test:e2e` → all three new specs pass.
- **Dependencies:** T089 (production go-live), T049, T076.

---

### Task F.3: Error boundary per route segment

- **Description:** Add `error.tsx` files per route group so a crash in one section does not break the whole app. Each error boundary includes a "Reload" button and a Sentry error ID the user can report.
- **Acceptance Criteria:**
  - Every top-level route group has an `error.tsx` file.
  - A simulated error in `/admin/payroll` shows the error boundary without affecting `/admin/analytics`.
  - Error boundary displays a Sentry event ID.
  - "Reload" button retries the segment.
- **Testing Steps:**
  - Introduce a thrown error in a page → the route group's error boundary renders.
  - Other route groups remain functional.
- **Dependencies:** None.

---

## Phase G: Quality and QA

---

### Task G.1: Responsive QA pass — browser and device testing with real staff

- **Description:** Structured pass across browser engines and physical devices that staff actually use. Walk every primary screen (cashier dashboard, ticket detail, secretary appointment list, stylist home, clothier batch view, admin reports) on: latest Chrome desktop, latest Safari desktop, Android Chrome on a mid-range phone, iOS Safari on the secretary's iPhone.
- **Acceptance Criteria:**
  - All breakpoints from `wireframes.md` trigger the correct layouts on all four tested environments.
  - Every defect captured in `docs/issues-tracker.md` with screenshot, device + browser, repro steps, and severity.
  - All Critical and High defects fixed before the pass is declared green.
  - Stakeholder sign-off on each deferred defect.
- **Testing Steps:**
  - Walk each primary screen on each environment → log every defect.
  - Re-test defect fixes on the original device.
- **Dependencies:** T089 (production go-live).

---

### Task G.2: User acceptance testing — one full simulated business day per role

- **Description:** Each role plays a full day of realistic operations on the staging environment. Cashier_admin: open day, log mixed guest/client tickets, checkout with overrides, payout, close day. Secretary: bookings, rescheduling, no-shows. Stylist: see queue, complete services, verify commission accrual. Clothier: see pieces, mark progress, complete batch. Roles file defects; UAT signed off by stakeholder.
- **Acceptance Criteria:**
  - Each role completes a full simulated business day without blocking errors.
  - All defects logged in `docs/issues-tracker.md`.
  - UAT sign-off document signed by the designated stakeholder.
- **Testing Steps:**
  - Run the full simulation on staging → collect defect list.
  - Fix all Critical and High defects → re-run affected flows → stakeholder signs off.
- **Dependencies:** T089 (production go-live), Task G.1.

---

## Phase H: Multi-Location Support

> Not in MVP scope. Noted here to avoid schema decisions that would make it impossible to add later. Key constraint: keep `business_day_id` as the primary partitioning key (already done).

---

### Task H.1: Locations table and employee assignment

- **Description:** Add a `locations` table and an `employee_locations` join table. Every `business_day`, `ticket`, `appointment`, and `payout` row gains a nullable `location_id` FK. Staff are assigned to one or more locations; their sessions resolve the active location.
- **Acceptance Criteria:**
  - `locations` table: id, name, address, is_active, created_at.
  - `employee_locations` join table: employee_id, location_id, is_primary boolean.
  - All existing rows get `location_id = null` (single-location mode remains the default).
  - Admin can assign employees to locations in the admin UI.
- **Testing Steps:**
  - Create a second location → assign an employee → employee can log in and see only their location's data.
- **Dependencies:** T089 (production go-live), minimum 6 months of single-location production data.

---

### Task H.2: Per-location business days and data isolation

- **Description:** `business_days` are scoped per location. Each location's cashier_admin opens and closes their own day independently. Analytics are filterable by location.
- **Acceptance Criteria:**
  - Opening a business day at Location A does not affect Location B's state.
  - Analytics dashboard has a location filter dropdown.
  - Tickets, appointments, and payouts only appear in their respective location's views.
- **Testing Steps:**
  - Open day at Location A → Location B still shows "no open day".
  - Log a ticket at Location A → it does not appear in Location B's ticket list.
- **Dependencies:** Task H.1.
