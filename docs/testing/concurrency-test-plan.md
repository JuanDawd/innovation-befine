# Concurrency test plan -- Innovation Befine

> **Scope:** Race conditions in a multi-user POS system where admins, cashiers, stylists, and secretaries operate simultaneously.
> **Test approach:** Each scenario is tested via concurrent API requests (Vitest with parallel HTTP calls) or parallel Playwright browser instances. Database-level locking behaviour is verified, not just application-level checks.
> **Key principle:** For every race condition, exactly one operation must succeed. The losing operation must receive a clear, actionable error -- never a silent failure, data corruption, or duplicate financial record.

---

## Scenario format

Each scenario documents:

1. **Preconditions** -- system state before the race
2. **Concurrent actions** -- what two (or more) actors do at the same time
3. **Expected outcome** -- which operation wins, which loses, and what each actor sees
4. **Verification method** -- how to confirm correctness in tests
5. **Implementation mechanism** -- the DB/app-level mechanism that prevents the race

---

## RC-01: Two cashiers checking out the same ticket simultaneously

**Task refs:** T038 (checkout), T039 (split payment)

### Preconditions

- Ticket T1 in `awaiting_payment` status.
- 2 line items totalling COP 50,000.
- Cashier A and Cashier B both have the checkout screen open for T1.

### Concurrent actions

| Actor     | Action                                             |
| --------- | -------------------------------------------------- |
| Cashier A | POST /api/tickets/T1/checkout with COP 50,000 cash |
| Cashier B | POST /api/tickets/T1/checkout with COP 50,000 card |

Both requests are sent within the same 100ms window.

### Expected outcome

| Actor     | Result                                                |
| --------- | ----------------------------------------------------- |
| Cashier A | 200 OK -- ticket closed, payment recorded             |
| Cashier B | 409 Conflict -- "This ticket has already been closed" |

OR the reverse (B succeeds, A fails). Exactly one succeeds.

### Verification

- `tickets` table: T1 status = `closed`, `closed_at` not null.
- `ticket_payments` table: exactly 1 payment record for T1 (not 2).
- No financial record duplication.

### Implementation mechanism

Optimistic lock on ticket status: the checkout transaction checks `status = 'awaiting_payment'` in the WHERE clause of the UPDATE. If the status has already changed, the UPDATE affects 0 rows and the operation returns a conflict error.

```sql
UPDATE tickets
SET status = 'closed', closed_at = NOW(), closed_by = $cashier_id
WHERE id = $ticket_id AND status = 'awaiting_payment'
RETURNING id;
```

If RETURNING returns no rows, the ticket was already closed.

---

## RC-02: Ticket modified (edit request approved) while checkout is in progress

**Task refs:** T038 (checkout), T041 (edit approval)

### Preconditions

- Ticket T1 in `awaiting_payment` status.
- 2 line items: Item A (COP 30,000) and Item B (COP 20,000). Total = COP 50,000.
- Cashier has checkout screen open showing COP 50,000 total.
- Secretary has submitted an edit request to change Item A to a COP 40,000 service.

### Concurrent actions

| Actor   | Action                                                     |
| ------- | ---------------------------------------------------------- |
| Admin   | Approves edit request on Item A (price becomes COP 40,000) |
| Cashier | Submits checkout with COP 50,000 total                     |

### Expected outcome -- Option A (checkout has version check)

If the checkout form includes a version counter or last-modified timestamp:

| Actor   | Result                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Admin   | Edit approved; Item A updated to COP 40,000                                                                  |
| Cashier | 409 Conflict -- "Ticket items have been modified. Please refresh and review the updated total (COP 60,000)." |

### Expected outcome -- Option B (checkout uses current DB state)

If checkout reads line items fresh from the DB at submit time:

| Actor   | Result                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------- |
| Admin   | Edit approved; Item A updated to COP 40,000                                                       |
| Cashier | Payment recorded for COP 60,000 (current total); cashier sees the updated total before confirming |

### Verification

- If Option A: no payment recorded; cashier must refresh and re-submit.
- If Option B: payment amount matches the DB total at the moment of commit (COP 60,000).
- In neither case is COP 50,000 recorded when the actual total is COP 60,000.

### Implementation mechanism

Version column on `tickets` (incremented on any item change) checked at checkout time. Alternatively, the checkout transaction re-reads items and computes the total inside the same transaction.

---

## RC-03: Two admins submitting payouts for overlapping business day ranges

**Task refs:** T067 (payout recording), T068 (double-pay prevention)

### Preconditions

- Stylist Ana has unsettled earnings for Days 1 through 5.
- Admin A opens payout for Days 1-3.
- Admin B opens payout for Days 2-5.

### Concurrent actions

| Actor   | Action                                            |
| ------- | ------------------------------------------------- |
| Admin A | POST /api/payouts -- employee=Ana, days=[1,2,3]   |
| Admin B | POST /api/payouts -- employee=Ana, days=[2,3,4,5] |

Both requests sent within 100ms.

### Expected outcome

| Actor   | Result                                                      |
| ------- | ----------------------------------------------------------- |
| Admin A | 201 Created -- payout for Days 1-3 recorded                 |
| Admin B | 409 Conflict -- "Days 2, 3 are already settled (Payout P1)" |

OR the reverse. Exactly one succeeds.

### Verification

- `payouts` table: exactly 1 payout for Ana covering at most 3 days.
- `payout_ticket_items` junction table: items from the winning days are linked; no items from the losing days are linked.
- No business day is settled twice.

### Implementation mechanism

Serializable transaction or advisory lock on (employee_id, business_day_id) combinations. The double-pay check must be inside the same transaction as the payout insert:

```sql
BEGIN;
-- Check for overlapping settled days
SELECT business_day_id FROM payout_business_days
WHERE employee_id = $employee_id AND business_day_id = ANY($day_ids);
-- If any rows returned, ROLLBACK with conflict error
-- Otherwise, insert payout and junction rows
INSERT INTO payouts (...) VALUES (...);
INSERT INTO payout_business_days (...) VALUES (...);
COMMIT;
```

---

## RC-04: Business day closure while a stylist is creating a ticket

**Task refs:** T019 (business day), T035 (ticket creation)

### Preconditions

- Business day BD1 is open.
- Stylist has the ticket creation form loaded (form references BD1).

### Concurrent actions

| Actor   | Action                                       |
| ------- | -------------------------------------------- |
| Admin   | POST /api/business-day/BD1/close             |
| Stylist | POST /api/tickets with business_day_id = BD1 |

### Expected outcome

| Actor   | Result                                                     |
| ------- | ---------------------------------------------------------- |
| Admin   | Business day closed successfully                           |
| Stylist | 400/422 -- "Business day is closed. Cannot create ticket." |

The ticket creation must check for an open business day inside the insert transaction, not before it.

### Verification

- `business_days` table: BD1 has `closed_at` set.
- `tickets` table: no new ticket for BD1 after closure.

### Implementation mechanism

The ticket creation query must verify the business day is still open within the same transaction:

```sql
BEGIN;
SELECT id FROM business_days WHERE id = $bd_id AND closed_at IS NULL FOR UPDATE;
-- If no row returned, ROLLBACK with "day closed" error
INSERT INTO tickets (...) VALUES (...);
COMMIT;
```

The `FOR UPDATE` lock on the business day row prevents the day from being closed between the check and the insert.

---

## RC-05: Two admins approving the same batch piece simultaneously

**Task refs:** T047 (piece approval)

### Preconditions

- Batch piece BP1 in `done_pending_approval` status.
- Admin A and Secretary B both see BP1 in their pending approvals view.

### Concurrent actions

| Actor       | Action                             |
| ----------- | ---------------------------------- |
| Admin A     | POST /api/batch-pieces/BP1/approve |
| Secretary B | POST /api/batch-pieces/BP1/approve |

### Expected outcome

| Actor       | Result                                                 |
| ----------- | ------------------------------------------------------ |
| Admin A     | 200 OK -- piece approved, `approved_by` = Admin A      |
| Secretary B | 409 Conflict -- "This piece has already been approved" |

OR the reverse. The piece is approved exactly once.

### Verification

- `batch_pieces` table: BP1 status = `approved`, `approved_at` not null, `approved_by` = exactly one actor.
- Clothier earnings: BP1's `clothier_pay` counted exactly once.

### Implementation mechanism

Same optimistic lock pattern as RC-01:

```sql
UPDATE batch_pieces
SET status = 'approved', approved_at = NOW(), approved_by = $actor_id
WHERE id = $piece_id AND status = 'done_pending_approval'
RETURNING id;
```

---

## RC-06: Two concurrent booking attempts for the same stylist time slot

**Task refs:** T050 (appointment booking), T051 (double-booking prevention)

### Preconditions

- Stylist "Ana" has no appointments on Tuesday at 10:00 AM.
- Secretary A and Secretary B both open the booking form for Ana at Tuesday 10:00 AM.

### Concurrent actions

| Actor       | Action                                                                |
| ----------- | --------------------------------------------------------------------- |
| Secretary A | POST /api/appointments -- stylist=Ana, time=Tue 10:00, duration=60min |
| Secretary B | POST /api/appointments -- stylist=Ana, time=Tue 10:30, duration=60min |

These two appointments overlap (10:00-11:00 and 10:30-11:30).

### Expected outcome

| Actor       | Result                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| Secretary A | 201 Created -- appointment booked                                               |
| Secretary B | 409 Conflict -- "Time slot conflicts with existing appointment (10:00 - 11:00)" |

OR the reverse. Exactly one appointment is created for the overlapping time range.

### Verification

- `appointments` table: exactly 1 appointment for Ana in the 10:00-11:30 window.
- No overlapping appointments exist (verified by query).

### Implementation mechanism

Database-level exclusion constraint using Postgres range types, or a serializable transaction that checks for overlaps before inserting:

```sql
BEGIN;
SELECT id FROM appointments
WHERE stylist_employee_id = $stylist_id
  AND status NOT IN ('cancelled')
  AND tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval)
    && tstzrange($new_start, $new_end)
FOR UPDATE;
-- If any row returned, ROLLBACK with conflict
INSERT INTO appointments (...) VALUES (...);
COMMIT;
```

---

## RC-07: Employee deactivation while the employee is creating a ticket

**Task refs:** T022a (deactivation), T035 (ticket creation)

### Preconditions

- Stylist "Carlos" is active and logged in.
- Carlos has the ticket creation form open.

### Concurrent actions

| Actor  | Action                                          |
| ------ | ----------------------------------------------- |
| Admin  | POST /api/employees/Carlos/deactivate           |
| Carlos | POST /api/tickets -- creates ticket for himself |

### Expected outcome

| Actor  | Result                                                              |
| ------ | ------------------------------------------------------------------- |
| Admin  | Deactivation succeeds; Carlos's session invalidated                 |
| Carlos | 401 Unauthorized (session invalidated) OR 403 (account deactivated) |

No ticket is created by a deactivated employee.

### Verification

- `employees` table: Carlos `is_active` = false.
- `tickets` table: no new ticket created by Carlos after deactivation.
- Carlos's session is invalidated (any subsequent request returns 401).

### Implementation mechanism

1. Deactivation invalidates all active sessions for the employee.
2. The ticket creation endpoint checks `is_active` on the employee record inside the transaction.
3. Session middleware validates `is_active` on every request (or at least on mutation endpoints).

---

## RC-08: Session expiration during an active checkout form submission

**Task refs:** T018 (session middleware), T038 (checkout)

### Preconditions

- Cashier has an active session.
- Cashier opens the checkout screen and fills in payment details.
- Session expires (timeout reached) while the cashier is on the form.

### Concurrent actions

| Actor   | Action                         |
| ------- | ------------------------------ |
| System  | Session expires due to timeout |
| Cashier | POST /api/tickets/T1/checkout  |

### Expected outcome

| Actor   | Result                                       |
| ------- | -------------------------------------------- |
| System  | Session marked as expired                    |
| Cashier | 401 Unauthorized -- redirected to login page |

The checkout is NOT processed. No payment is recorded. The ticket remains in `awaiting_payment` status.

### Verification

- `tickets` table: T1 status still `awaiting_payment`.
- `ticket_payments` table: no payment recorded for this attempt.
- Cashier is redirected to login; after re-login, the ticket is still available for checkout.

### Implementation mechanism

Session middleware checks session validity before processing any mutation. Expired sessions return 401. The frontend should handle 401 responses by redirecting to login and optionally preserving the checkout URL for post-login redirect.

---

## Test execution approach

### Automated concurrent request testing (Vitest)

For API-level race conditions (RC-01, RC-03, RC-05, RC-06):

```typescript
test("RC-01: concurrent checkout", async () => {
  const ticket = await createTicketInAwaitingPayment();

  const [resultA, resultB] = await Promise.allSettled([
    checkoutTicket(ticket.id, { amount: 50000, method: "cash" }, sessionA),
    checkoutTicket(ticket.id, { amount: 50000, method: "card" }, sessionB),
  ]);

  const successes = [resultA, resultB].filter((r) => r.status === "fulfilled" && r.value.ok);
  const failures = [resultA, resultB].filter((r) => r.status === "fulfilled" && !r.value.ok);

  expect(successes).toHaveLength(1);
  expect(failures).toHaveLength(1);
  expect(failures[0].value.status).toBe(409);

  const payments = await getPaymentsForTicket(ticket.id);
  expect(payments).toHaveLength(1);
});
```

### Playwright parallel browser testing

For scenarios involving UI state (RC-02, RC-04, RC-07, RC-08):

- Open two browser contexts (not tabs -- separate sessions).
- Use `Promise.all` to trigger actions in both contexts simultaneously.
- Verify one succeeds and the other shows an error message.

### Stress testing

For critical financial races (RC-01, RC-03), run 10 concurrent requests against the same resource. Verify exactly 1 succeeds and 9 fail with 409.

---

## Priority and scheduling

| Scenario | Priority | When to implement                        |
| -------- | -------- | ---------------------------------------- |
| RC-01    | P0       | Phase 4A (T038 checkout)                 |
| RC-02    | P1       | Phase 4A (T041 edit approval)            |
| RC-03    | P0       | Phase 7 (T068 double-pay prevention)     |
| RC-04    | P1       | Phase 4A (T035 ticket creation + T019)   |
| RC-05    | P2       | Phase 4B (T047 piece approval)           |
| RC-06    | P0       | Phase 5 (T051 double-booking prevention) |
| RC-07    | P2       | Phase 1 (T022a deactivation)             |
| RC-08    | P1       | Phase 1 (T018 session middleware)        |

P0 scenarios must have automated tests before the phase is marked done. P1 scenarios should have automated tests. P2 scenarios may use manual verification initially with automation added before go-live.
