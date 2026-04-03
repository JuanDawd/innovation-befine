# Phase 5 — Appointments

> Goal: secretary can book, confirm, and manage appointments; double-booking is prevented; no-show count is tracked; confirmation email is sent via Resend (already configured in Phase 1 / T054).
>
> Can run in parallel with Phase 4B (cloth batches) once Phase 4A is complete.

---

## T032b — No-show count increment logic

**Phase:** 5 — Appointments *(split from T032 — Senior SWE review F8)*
**Status:** pending
**Dependencies:** T032, T053

### What to do
Implement the atomic increment of `clients.no_show_count` when an appointment is marked "no-show" (T053). This logic was split from T032 (Phase 3) because the appointment system that triggers no-shows doesn't exist until Phase 5.

### Acceptance criteria
- [ ] `no_show_count` increments atomically when a no-show is recorded via T053
- [ ] Only saved clients are affected (guests have no client record)
- [ ] Increment is idempotent — marking the same appointment as no-show twice does not double-count
- [ ] Warning badge in client search (from T032) updates to reflect new count
- [ ] When a no-show status is **reversed** (e.g. changed back to completed or confirmed), `no_show_count` is **decremented** atomically. Decrement does not go below zero.

---

## T049 — Appointments table migration

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T029, T012

### What to do
Create the `appointments` table: `id`, `client_id` (FK nullable), `guest_name` (nullable), `stylist_employee_id` (FK), `service_variant_id` (FK nullable — links to catalog for automatic ticket pre-population; when null, falls back to `service_summary`), `service_summary` (text — free description, used when no catalog link exists), `scheduled_at` (timestamp with timezone), `duration_minutes` (default 60), `status` (`booked` | `confirmed` | `completed` | `cancelled` | `rescheduled` | `no_show`), `cancelled_at` (nullable), `cancellation_reason` (nullable), `confirmation_sent_at` (nullable timestamp — used by T056 to record when the confirmation email was sent), `created_by`, `created_at`, `updated_at`.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] `status` uses Drizzle `pgEnum`
- [ ] Either `client_id` or `guest_name` must be present
- [ ] `confirmation_sent_at` column exists (nullable timestamp) — used by T056
- [ ] `service_variant_id` column exists (FK nullable, references `service_variants.id`) — when present, ticket creation from this appointment auto-populates the service. When null, `service_summary` text is used as a fallback.

---

## T050 — Appointment booking UI (secretary / cashier)

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T049, T030

### What to do
Build the appointment booking form: client (saved or guest), service summary, stylist selector, date, time, and duration. On submit, validate there is no overlapping appointment for the same stylist, then create the record.

### Acceptance criteria
- [ ] Date and time pickers are usable on mobile
- [ ] Stylist selector shows only active stylists
- [ ] Overlap validation runs before insert (checks `scheduled_at` to `scheduled_at + duration_minutes`)
- [ ] Conflict → clear error message with the conflicting appointment time shown
- [ ] New appointment triggers in-app notification to the assigned stylist (via T048)
- [ ] **Secretary UX:** Calendar-first booking approach — secretary selects a time slot on the calendar (T052), then fills in client and service details. Form efficiency optimized for frequent use throughout the day.

---

## T051 — Double-booking prevention

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T050

### What to do
Add a database-level constraint (or a serializable transaction check) to guarantee no two appointments for the same stylist overlap, even under concurrent writes.

### Acceptance criteria
- [ ] Two concurrent booking attempts for the same slot result in exactly one success and one error
- [ ] Error message on conflict is user-friendly (not a raw DB error)
- [ ] Existing overlapping data (if any) is blocked on insert, not silently accepted

---

## T052 — Appointment list and calendar view

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T050

### What to do
Build the appointments screen for secretary and cashier: a daily calendar or list grouped by stylist, showing all appointments with their status. Navigation to previous/next day.

### Acceptance criteria
- [ ] View defaults to today's appointments
- [ ] Navigate to any date
- [ ] Filter by stylist
- [ ] Appointment cards show client name, service summary, time, and status
- [ ] Responsive — works as a stacked list on mobile
- [ ] **Calendar UX:** Desktop uses a day view with time slots in rows and stylists in columns. Mobile uses a stacked list grouped by time. Day navigation arrows + date picker for jumping to a specific date. Status badges use the unified status colour system (T103).
- [ ] Empty state shown when no appointments exist for the selected day (message: "No appointments for this day" + "Book appointment" CTA)

---

## T053 — Appointment status management

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T050

### What to do
Add actions on each appointment card: confirm, cancel (with reason), reschedule (changes `scheduled_at` with overlap check), complete, or mark no-show. Each action is available to secretary and cashier. Completing an appointment optionally links to a ticket.

### Acceptance criteria
- [ ] All six status transitions are reachable from the UI
- [ ] Reschedule re-runs the overlap check
- [ ] Cancellation reason stored
- [ ] "No-show" transition increments `clients.no_show_count` for saved clients (via T032b)
- [ ] Guest no-shows update only the appointment record, not any client profile

---

## T055 — Appointment confirmation email template

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T054 *(Resend already configured in Phase 1)*

### What to do
Build a React Email template for appointment confirmations. Template includes: client name, stylist name, service summary, date and time, and a note to contact the salon to reschedule or cancel.

### Acceptance criteria
- [ ] Template renders correctly in React Email preview
- [ ] Displays clearly on mobile email clients (test with at least one mobile preview)
- [ ] Template is in `apps/web/src/emails/AppointmentConfirmation.tsx`

---

## T056 — "Send confirmation email" action

**Phase:** 5 — Appointments
**Status:** pending
**Dependencies:** T055, T053

### What to do
Add a "Send confirmation email" button on appointment cards (visible when status is `booked` or `confirmed` and client has an email). Clicking calls the send utility and records `confirmation_sent_at` on the appointment record.

### Acceptance criteria
- [ ] Button visible only when client email is available
- [ ] Email delivered within 30 seconds in staging
- [ ] `confirmation_sent_at` recorded after successful send
- [ ] Button disabled after first send (re-send requires a second explicit click with a confirmation prompt)
