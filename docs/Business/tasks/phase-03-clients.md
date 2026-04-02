# Phase 3 — Client records

> Goal: the app can store saved clients (with history) or process walk-in guests (name only, no record).

---

## T029 — Clients table migration

**Phase:** 3 — Clients
**Status:** pending
**Dependencies:** T006

### What to do
Create the `clients` table: `id`, `name`, `phone` (nullable), `email` (nullable), `notes` (nullable), `no_show_count` (default 0), `is_active`, `created_at`, `updated_at`.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] `no_show_count` defaults to 0 and is non-negative (check constraint)
- [ ] `is_active` for soft-deletion (client "archive" rather than hard delete)

---

## T030 — Saved client CRUD and search (cashier/secretary)

**Phase:** 3 — Clients
**Status:** pending
**Dependencies:** T029

### What to do
Build the client management screen: list, search by name or phone/email, create, edit, and archive clients. Both cashier and secretary can access this. Also build a compact search widget (used inside ticket and appointment creation in Phase 4 and 5).

### Acceptance criteria
- [ ] Cashier and secretary can search clients by name, phone, or email
- [ ] Search returns results within 300 ms on realistic dataset
- [ ] Can create a new saved client from the search widget (inline, no separate page navigation required)
- [ ] Can edit contact info, notes on the client profile
- [ ] Archiving a client hides them from search but preserves all history
- [ ] Admins can unarchive a client

---

## T031 — Guest client flow

**Phase:** 3 — Clients
**Status:** pending
**Dependencies:** T030

### What to do
When creating a ticket or appointment, allow the user to skip client lookup and enter only a guest name (free text). Guest entries are stored directly on the ticket/appointment record as `guest_name`; no client record is created.

### Acceptance criteria
- [ ] "Walk-in / Guest" option visible in the client selector
- [ ] Guest name (free text) is saved on the ticket or appointment
- [ ] Guest tickets do not appear in the client history view
- [ ] No no-show tracking for guests

---

## T032 — No-show count display

**Phase:** 3 — Clients
**Status:** pending
**Dependencies:** T029

### What to do
Display the `no_show_count` (already part of the `clients` table from T029) on the client profile card and in the client search results. The actual increment logic is implemented in T032b (Phase 5) when the appointment system exists.

### Acceptance criteria
- [ ] Count visible on the client profile card
- [ ] Shown as a warning badge in the client search widget if count ≥ 3 (threshold configurable in code)
- [ ] No-show count is read-only in this phase — increment logic added in T032b (Phase 5)
