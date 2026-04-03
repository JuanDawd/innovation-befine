# Phase 4A test plan -- Checkout and ticket lifecycle

> **Scope:** T033-T042, T048, T092, T093
> **Currency:** COP (whole pesos, integer storage). No cents.
> **Commission rounding:** Banker's rounding (round half-even).
> **Prerequisite phases:** Phase 0 (infra), Phase 1 (identity, business day), Phase 2 (catalog), Phase 3 (clients).

---

## 1. Happy path -- full ticket lifecycle

### TS-4A-001: Stylist logs a service, cashier checks out

**Preconditions:** Open business day. Active stylist (hairdresser). Active service variant "Corte Dama Largo" at COP 50,000, 30% commission. Saved client "Maria Lopez".

| Step | Actor    | Action                                                        | Expected result                                               |
| ---- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Stylist  | Opens "Log service" on phone                                  | Stylist is pre-selected; service selector visible             |
| 2    | Stylist  | Selects "Corte Dama Largo", selects "Maria Lopez", submits    | Ticket created with status `logged`                           |
| 3    | System   | Real-time event fires                                         | Cashier dashboard shows new ticket card within 2 seconds      |
| 4    | Cashier  | Sees ticket on dashboard under stylist's column                | Card shows: stylist name, service, client, elapsed time       |
| 5    | Stylist  | Marks ticket as ready for payment                             | Status transitions to `awaiting_payment`; card highlights     |
| 6    | Cashier  | Clicks ticket card, opens checkout screen                     | Line items shown with COP 50,000 price                       |
| 7    | Cashier  | Selects "Cash" payment method, confirms checkout              | Destructive confirmation dialog appears                       |
| 8    | Cashier  | Confirms in dialog                                            | Ticket status -> `closed`; `closed_at` and `closed_by` set   |
| 9    | System   | Real-time event fires                                         | Ticket card fades out of dashboard (500ms)                    |
| 10   | System   | Post-checkout summary screen                                  | Shows service, client, COP 50,000, payment method, timestamp |

**Verification:**
- `tickets` row: status = `closed`, `closed_at` not null, `closed_by` = cashier ID.
- `ticket_payments` row: amount = 50000, method = `cash`.
- `ticket_items` row: `unit_price` = 50000, `commission_pct` = 30.00, `override_price` = null.

---

## 2. Error paths

### TS-4A-010: Create ticket with invalid input

| Scenario                                     | Input                                    | Expected                                          |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Missing service variant                      | No service selected, submit              | Inline validation error: "Service is required"     |
| Missing client and guest name                | Neither client nor guest name provided   | Validation error: "Client or guest name required" |
| Empty guest name (whitespace only)           | Guest name = "   "                       | Validation error: same as empty                   |
| Guest name exceeds max length (255 chars)    | 300-character string                     | Validation error: "Name too long"                 |
| Special characters in guest name             | "Maria Jose O'Brien-Gomez"               | Accepted (accented and special chars are valid)   |
| Accented Spanish name                        | "Alejandra Munoz Castaneda"              | Accepted without encoding issues                  |

### TS-4A-011: Create ticket without open business day

**Preconditions:** No business day is open (last day was closed).

| Step | Actor   | Action                       | Expected                                        |
| ---- | ------- | ---------------------------- | ----------------------------------------------- |
| 1    | Stylist | Attempts to create a ticket  | Error: "No business day is open. Contact admin." |

Server must return 400/422 (not 500). No ticket row created.

### TS-4A-012: Deactivated service variant at submit time

**Preconditions:** Stylist loads the ticket form. Admin deactivates the selected service variant before the stylist submits.

| Step | Actor   | Action                                      | Expected                                                 |
| ---- | ------- | ------------------------------------------- | -------------------------------------------------------- |
| 1    | Stylist | Loads form, selects active service variant   | Form loads normally                                      |
| 2    | Admin   | Deactivates that service variant             | --                                                       |
| 3    | Stylist | Submits the form                             | Error: "This service is no longer available. Refresh."   |

### TS-4A-013: Unauthorized role attempts ticket creation

| Role     | Action                         | Expected                    |
| -------- | ------------------------------ | --------------------------- |
| Clothier | POST /api/tickets              | 403 Forbidden               |
| Clothier | Navigate to /tickets/new       | Redirect to 403 page        |

### TS-4A-014: Stylist creates ticket for another employee

**Preconditions:** Stylist "Ana" is logged in. Stylist "Carlos" exists.

| Step | Actor     | Action                                       | Expected                                      |
| ---- | --------- | -------------------------------------------- | --------------------------------------------- |
| 1    | Ana       | Attempts to set employee_id to Carlos's ID   | 403: "Stylists can only create their own tickets" |

---

## 3. Boundary conditions

### TS-4A-020: Zero-price service (COP 0)

**Preconditions:** Service variant "Cortesia" with price COP 0, commission 30%.

| Step | Actor   | Action                                  | Expected                                          |
| ---- | ------- | --------------------------------------- | ------------------------------------------------- |
| 1    | Stylist | Creates ticket with "Cortesia"          | Ticket created; unit_price = 0                    |
| 2    | Cashier | Opens checkout                          | Subtotal = COP 0                                  |
| 3    | Cashier | Selects payment method, confirms        | Ticket closed; payment amount = 0                 |

Commission earnings = COP 0 * 30% = COP 0. Verify earnings computation returns 0 for this ticket.

### TS-4A-021: Maximum line items on a single ticket

**Preconditions:** Open business day, active client.

| Step | Actor   | Action                                 | Expected                                            |
| ---- | ------- | -------------------------------------- | --------------------------------------------------- |
| 1    | Stylist | Creates ticket with 20 service items   | All 20 items saved; checkout shows all 20 rows      |
| 2    | Cashier | Checkout with 20 items                 | Subtotal computed correctly; scrollable item list    |

Verify: no truncation, no performance degradation on checkout screen.

### TS-4A-022: Empty ticket (no items)

A ticket must have at least one item. Verify:
- API rejects ticket creation with zero items (400 error).
- UI prevents submission with no items selected.

### TS-4A-023: Idempotency key duplicate submission

| Step | Actor   | Action                                        | Expected                                                |
| ---- | ------- | --------------------------------------------- | ------------------------------------------------------- |
| 1    | Stylist | Submits ticket with Idempotency-Key: "abc123" | Ticket created; response includes ticket ID             |
| 2    | Stylist | Same request with Idempotency-Key: "abc123"   | Same ticket returned (no duplicate); 200 (not 201/409)  |

---

## 4. Financial accuracy

All amounts in COP (whole pesos). Commission rounding uses banker's rounding (round half-even).

### TS-4A-030: Standard commission calculation

| Input                                        | Calculation             | Expected earnings |
| -------------------------------------------- | ----------------------- | ----------------- |
| Service COP 50,000, commission 30%           | 50000 * 30 / 100       | COP 15,000        |
| Service COP 80,000, commission 25%           | 80000 * 25 / 100       | COP 20,000        |
| Service COP 35,000, commission 40%           | 35000 * 40 / 100       | COP 14,000        |

### TS-4A-031: Override price recalculates commission

| Original price | Override price | Commission % | Calculation         | Expected earnings |
| -------------- | -------------- | ------------ | ------------------- | ----------------- |
| COP 50,000     | COP 40,000     | 30%          | 40000 * 30 / 100   | COP 12,000        |
| COP 80,000     | COP 60,000     | 25%          | 60000 * 25 / 100   | COP 15,000        |
| COP 50,000     | COP 0          | 30%          | 0 * 30 / 100       | COP 0             |

Verify: `override_reason` is required and stored. Override reason is not visible to non-admin roles.

### TS-4A-032: Split payment verification

| Total     | Payment 1          | Payment 2           | Verification                              |
| --------- | ------------------- | ------------------- | ----------------------------------------- |
| COP 50,000| COP 30,000 cash     | COP 20,000 card     | Sum = 50,000; 2 rows in ticket_payments   |
| COP 75,000| COP 25,000 cash     | COP 25,000 card + COP 25,000 transfer | Sum = 75,000; 3 rows      |

Error case: payment amounts sum to COP 49,999 (short by 1). Submit must be blocked with: "Payment total does not match ticket total."

### TS-4A-033: Banker's rounding on commission

| Service price | Commission % | Raw calculation    | Banker's rounding result | Notes                          |
| ------------- | ------------ | ------------------ | ------------------------ | ------------------------------ |
| COP 10,000    | 33.33%       | 3333.0             | COP 3,333                | No rounding needed             |
| COP 10,000    | 15.55%       | 1555.0             | COP 1,555                | Exact                          |
| COP 10,001    | 33.33%       | 3333.6333          | COP 3,334                | Round up (digit after 5 > 0)   |
| COP 10,000    | 12.50%       | 1250.0             | COP 1,250                | Exact                          |
| COP 15,000    | 33.33%       | 4999.5             | COP 5,000                | Half-even: 5 rounds to even    |
| COP 25,000    | 33.33%       | 8332.5             | COP 8,332                | Half-even: 5 rounds to even    |

### TS-4A-034: Multi-item ticket total

**Preconditions:** Ticket with 3 items.

| Item | Price      | Commission % | Earnings    |
| ---- | ---------- | ------------ | ----------- |
| 1    | COP 50,000 | 30%          | COP 15,000  |
| 2    | COP 30,000 | 25%          | COP 7,500   |
| 3    | COP 20,000 | 40%          | COP 8,000   |

- **Ticket total:** COP 100,000
- **Total earnings:** COP 30,500
- Verify subtotal shown at checkout = COP 100,000.
- Verify earnings computation sums all items = COP 30,500.

---

## 5. Concurrent access

See also `docs/testing/concurrency-test-plan.md` for detailed race condition specifications.

### TS-4A-040: Two cashiers check out the same ticket

**Preconditions:** Ticket T1 in `awaiting_payment` status.

| Step | Cashier A                    | Cashier B                    | Expected                                       |
| ---- | ---------------------------- | ---------------------------- | ---------------------------------------------- |
| 1    | Opens checkout for T1        | Opens checkout for T1        | Both see the checkout screen                   |
| 2    | Submits payment (COP 50,000) | --                           | A succeeds; T1 status -> closed                |
| 3    | --                           | Submits payment (COP 50,000) | B receives conflict error: "Ticket already closed" |

Verify: exactly 1 `ticket_payments` row exists. No double charge.

### TS-4A-041: Ticket modified during checkout

**Preconditions:** Ticket T1 with 2 items. Cashier has checkout screen open.

| Step | Cashier                     | Secretary                          | Expected                                        |
| ---- | --------------------------- | ---------------------------------- | ----------------------------------------------- |
| 1    | Opens checkout for T1       | --                                 | Checkout shows 2 items, subtotal COP 80,000     |
| 2    | --                          | Submits edit request on item 1     | Edit request created (pending)                  |
| 3    | Submits payment             | --                                 | Checkout succeeds with original items (edit request is pending, not applied) |

If the edit request was already approved before checkout submission, the cashier should see a stale-data error prompting a refresh.

### TS-4A-042: Business day closes during ticket creation

**Preconditions:** Business day open. Stylist has ticket form loaded.

| Step | Stylist                      | Admin                         | Expected                                           |
| ---- | ---------------------------- | ----------------------------- | -------------------------------------------------- |
| 1    | Loads ticket creation form   | --                            | Form loads with service selector                   |
| 2    | --                           | Closes business day           | --                                                 |
| 3    | Submits ticket               | --                            | Error: "Business day is closed. Cannot create ticket." |

---

## 6. E2E flow -- full lifecycle

### TS-4A-050: Create ticket through to earnings verification

**Preconditions:** Seeded checkout-happy-path fixture. Open business day. Stylist "Ana", service "Corte Dama Largo" COP 50,000, 30% commission. Client "Maria Lopez".

| Step | Action                                                | Verification                                                  |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Ana creates ticket for Maria                          | DB: ticket status = `logged`, business_day_id = current       |
| 2    | Cashier dashboard updates                             | UI: ticket card visible under Ana's column                    |
| 3    | Ana marks ticket ready                                | DB: status = `awaiting_payment`; UI: card highlights          |
| 4    | Cashier opens checkout                                | UI: 1 line item, COP 50,000, subtotal COP 50,000             |
| 5    | Cashier selects cash, confirms                        | DB: status = `closed`, ticket_payments row (50000, cash)      |
| 6    | Post-checkout summary                                 | UI: service, client, amount, method, time                     |
| 7    | Query stylist earnings for today                      | Returns COP 15,000 (50000 * 30%)                              |
| 8    | Admin home shows revenue                              | Revenue figure includes COP 50,000                             |
| 9    | Closed ticket history                                 | Ticket visible with full details                               |

### TS-4A-051: Override price E2E

Same as TS-4A-050 but at step 4, cashier overrides price to COP 40,000 with reason "Descuento cliente frecuente".

| Step | Verification                                                              |
| ---- | ------------------------------------------------------------------------- |
| 4b   | Override price field set to 40,000; reason entered                        |
| 5    | ticket_payments amount = 40,000                                            |
| 7    | Earnings = COP 12,000 (40000 * 30%)                                       |
| 8    | Revenue = COP 40,000 (override price, not original)                       |

### TS-4A-052: Split payment E2E

At step 5, cashier splits: COP 30,000 cash + COP 20,000 card.

| Step | Verification                                                       |
| ---- | ------------------------------------------------------------------ |
| 5    | 2 ticket_payments rows: (30000, cash) and (20000, card)            |
| 5b   | Sum = 50,000 = ticket total                                        |
| 8    | Revenue = COP 50,000 (full amount regardless of payment split)     |

---

## 7. Reopen flow

### TS-4A-060: Close, reopen, re-close

**Preconditions:** Ticket T1 closed with COP 50,000 payment. Payout P1 exists covering T1's earnings.

| Step | Actor   | Action                  | Verification                                              |
| ---- | ------- | ----------------------- | --------------------------------------------------------- |
| 1    | Cashier | Reopens ticket T1       | Status -> `reopened`; P1 flagged `needs_review`           |
| 2    | Cashier | Opens checkout for T1   | Line items shown; payment section available               |
| 3    | Cashier | Adjusts items or keeps  | Subtotal recalculated if items changed                    |
| 4    | Cashier | Confirms checkout       | Status -> `closed` again; new `closed_at`                 |
| 5    | System  | Earnings recomputed     | Earnings reflect any item changes from step 3             |

**Negative case:** Non-cashier attempts reopen -> 403.

### TS-4A-061: Reopen without existing payout

**Preconditions:** Ticket T1 closed. No payout has been recorded yet.

| Step | Actor   | Action                  | Verification                                             |
| ---- | ------- | ----------------------- | -------------------------------------------------------- |
| 1    | Cashier | Reopens ticket T1       | Status -> `reopened`; no payout to flag (no error)       |
| 2    | Cashier | Re-closes ticket        | Status -> `closed`; earnings computed normally           |

---

## 8. Cashier dashboard specific tests

### TS-4A-070: Empty state

**Preconditions:** Open business day, no tickets created.

- Dashboard shows empty state: "No open tickets -- services will appear here as they're logged."
- No broken layout or missing elements.

### TS-4A-071: Real-time update animations

| Event                    | Expected animation                          |
| ------------------------ | ------------------------------------------- |
| New ticket created       | Card fades in with 2-second highlight       |
| Status change            | Badge colour transitions in 300ms           |
| Ticket closed            | Card fades out with 500ms delay             |
| Multiple tickets at once | Staggered appearance (100ms between cards)  |

### TS-4A-072: Keyboard navigation (stretch)

- Arrow keys navigate between ticket cards.
- Enter opens the selected ticket's checkout.
- Ctrl/Cmd+K opens quick search.
- Escape closes modals.

---

## 9. Notification tests (T048)

### TS-4A-080: Edit request notification

| Step | Actor     | Action                                        | Verification                                  |
| ---- | --------- | --------------------------------------------- | --------------------------------------------- |
| 1    | Secretary | Submits edit request on a ticket item          | Notification created for cashier              |
| 2    | Cashier   | Bell icon shows unread count +1                | Badge updates in real-time                    |
| 3    | Cashier   | Opens notification dropdown                    | Edit request notification visible             |
| 4    | Cashier   | Clicks notification                            | Marked read; navigates to edit request view   |
| 5    | Cashier   | Approves edit request                          | Notification sent to secretary: "Edit approved"|

### TS-4A-081: Notification grouping

3 edit requests from the same secretary within 5 minutes -> grouped as "3 new edit requests" (single notification item).

### TS-4A-082: Mark all read

Cashier with 5 unread notifications clicks "Mark all as read" -> all marked read; badge disappears.

---

## 10. History view tests (T092)

### TS-4A-090: Closed ticket history

| Scenario                            | Expected                                           |
| ----------------------------------- | -------------------------------------------------- |
| View today's closed tickets         | All closed tickets for current business day shown  |
| Navigate to previous day            | Tickets for that day shown                         |
| Search by client name "Maria"       | Filters to matching tickets                        |
| Click ticket detail                 | Line items, payment breakdown, override notes shown|
| No closed tickets for selected day  | Empty state: "No closed tickets for this day"      |

---

## 11. Admin home tests (T093)

### TS-4A-095: Day-at-a-glance

| Scenario                         | Expected                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| No business day open             | Empty state + "Open day" CTA                                |
| Day open, no activity            | Day status "Open", 0 tickets, COP 0 revenue                |
| Day open, 3 tickets (1 closed)   | 2 open tickets count, COP X revenue from 1 closed ticket   |
| Revenue updates on checkout      | Revenue figure increments in real-time after ticket close   |
| Unsettled earnings stub          | Badge area visible (wired in T070, Phase 7)                 |
