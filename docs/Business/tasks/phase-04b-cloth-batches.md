# Phase 4B — Cloth batches

> Goal: secretary can create and assign cloth batches; clothiers can mark pieces done; secretary/admin approves.
>
> Can begin in parallel with Phase 5 (Appointments) once Phase 4A is complete.

---

## T044 — Cloth batches table migration

**Phase:** 4B — Cloth batches
**Status:** pending
**Dependencies:** T019, T026

### What to do
Create:
- `cloth_batches`: `id`, `business_day_id` (FK), `created_by`, `notes` (nullable), `large_order_id` (FK nullable — linked in Phase 6), `created_at`
- `batch_pieces`: `id`, `batch_id` (FK), `cloth_piece_id` (FK), `assigned_to_employee_id` (FK nullable), `status` (`pending` | `done_pending_approval` | `approved`), `completed_at` (nullable), `approved_at` (nullable), `approved_by` (nullable)

### Acceptance criteria
- [ ] Both migrations run without errors
- [ ] `status` uses Drizzle `pgEnum`
- [ ] `large_order_id` is nullable (standalone batches are allowed)

---

## T045 — Cloth batch creation UI (secretary / admin)

**Phase:** 4B — Cloth batches
**Status:** pending
**Dependencies:** T044, T028

### What to do
Build the batch creation form: add pieces by selecting piece type and assigning a clothier employee (or leaving unassigned for the whole batch). Show the batch as a table of rows. Submit creates the batch and piece records.

### Acceptance criteria
- [ ] Secretary and admin can create batches
- [ ] Pieces can be assigned to different clothiers per row
- [ ] Unassigned pieces are visible to all clothiers on their home screen
- [ ] Batch is linked to the current open business day
- [ ] In-app notification (T048) sent to each clothier who receives an assignment

---

## T046 — Clothier batch view and piece completion

**Phase:** 4B — Cloth batches
**Status:** pending
**Dependencies:** T045

### What to do
Build the clothier's home screen: list of batch pieces assigned to them (or unassigned) for the current business day. Clothier can mark a piece as done.

### Acceptance criteria
- [ ] Clothier sees only pieces assigned to them (or unassigned)
- [ ] "Mark as done" button transitions piece to `done_pending_approval`
- [ ] In-app notification (T048) sent to secretary/admin when a piece is marked done
- [ ] Screen is responsive — primary use is on a phone

---

## T047 — Piece approval flow (secretary / admin)

**Phase:** 4B — Cloth batches
**Status:** pending
**Dependencies:** T046

### What to do
Build the secretary/admin view of pending piece approvals. They can approve (status → `approved`, timestamps set) or directly mark pieces done without waiting for the clothier.

### Acceptance criteria
- [ ] Pending approvals visible in a dedicated section or badge
- [ ] Approve action updates status, `approved_at`, and `approved_by`
- [ ] Admin can mark a piece directly as `approved` without clothier interaction
- [ ] Approved piece count feeds into clothier earnings computation (Phase 7, T064)
