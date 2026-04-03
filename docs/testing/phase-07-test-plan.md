# Phase 7 test plan -- Payroll settlement and audit

> **Scope:** T020, T021, T022b, T063-T070
> **Currency:** COP (whole pesos, integer storage). No cents.
> **Commission rounding:** Banker's rounding (round half-even).
> **Part-time employees:** The `expected_work_days` field on employees determines how many days per period a secretary-type employee is expected to work. If null, all business days in the range are expected.
> **Payout audit trail:** Every payout stores `original_computed_amount` and `adjustment_reason` (nullable) alongside the final `amount`.

---

## 1. Stylist earnings -- commission-based (T063)

### TS-7-001: Standard commission calculation

`computeStylistEarnings(employeeId, businessDayIds[])` must return the sum of `(override_price ?? unit_price) * commission_pct / 100` for all closed ticket items. Rounding uses banker's rounding (round half-even).

| Test case | Items                                              | Calculation                   | Expected total |
| --------- | -------------------------------------------------- | ----------------------------- | -------------- |
| Single item | 1 item: COP 50,000, 30% commission               | 50000 * 30 / 100 = 15000     | COP 15,000     |
| Two items   | COP 50,000 @ 30% + COP 30,000 @ 25%             | 15000 + 7500                  | COP 22,500     |
| Override    | Original COP 50,000, override COP 40,000, 30%    | 40000 * 30 / 100 = 12000     | COP 12,000     |
| Zero price  | COP 0 service, 30% commission                    | 0 * 30 / 100 = 0             | COP 0          |
| Zero commission | COP 50,000 service, 0% commission             | 50000 * 0 / 100 = 0          | COP 0          |
| No tickets  | Employee has no closed tickets in the range       | --                            | COP 0          |

### TS-7-002: Banker's rounding (round half-even) for stylist commissions

These test cases specifically verify correct rounding behaviour. Each must be an independent unit test.

| Service price | Commission % | Raw result    | Rounded (half-even) | Reasoning                                        |
| ------------- | ------------ | ------------- | -------------------- | ------------------------------------------------ |
| COP 10,000    | 33.33%       | 3333.0        | COP 3,333            | Exact integer, no rounding needed                |
| COP 10,000    | 12.50%       | 1250.0        | COP 1,250            | Exact integer, no rounding needed                |
| COP 10,001    | 15.55%       | 1555.1555     | COP 1,555            | Truncation at .1555 rounds down                  |
| COP 15,000    | 33.33%       | 4999.5        | COP 5,000            | Half-even: .5 rounds to nearest even (5000)      |
| COP 25,000    | 33.33%       | 8332.5        | COP 8,332            | Half-even: .5 rounds to nearest even (8332)      |
| COP 10,003    | 33.33%       | 3334.0        | COP 3,334            | Exact integer after multiplication               |
| COP 7,500     | 33.33%       | 2499.75       | COP 2,500            | .75 rounds up                                    |
| COP 100,000   | 33.33%       | 33330.0       | COP 33,330           | Exact                                            |

### TS-7-003: Excludes `needs_review` tickets

**Preconditions:** Stylist has 3 closed tickets. Ticket T3 was reopened and has `needs_review` flag.

| Tickets in range | Status of each                          | Expected earnings                       |
| ---------------- | --------------------------------------- | --------------------------------------- |
| T1 (COP 50,000 @ 30%), T2 (COP 30,000 @ 25%), T3 (COP 20,000 @ 40%) | T1 closed, T2 closed, T3 needs_review | COP 15,000 + COP 7,500 = COP 22,500 (T3 excluded) |

Verify: the breakdown response includes T3 with a note "excluded -- needs review".

### TS-7-004: Multi-day aggregation

**Preconditions:** Stylist worked 3 business days with different ticket counts.

| Day   | Tickets                                     | Day earnings  |
| ----- | ------------------------------------------- | ------------- |
| Day 1 | COP 50,000 @ 30%, COP 30,000 @ 25%         | COP 22,500    |
| Day 2 | COP 80,000 @ 20%                            | COP 16,000    |
| Day 3 | No tickets                                  | COP 0         |

**Total expected:** COP 38,500. Verify the function returns the correct aggregate and per-day breakdown.

---

## 2. Clothier earnings -- per-piece (T064)

### TS-7-010: Standard per-piece calculation

`computeClothierEarnings(employeeId, businessDayIds[])` sums `cloth_pieces.clothier_pay` for all `approved` batch pieces.

| Test case         | Pieces                                                    | Expected total |
| ----------------- | --------------------------------------------------------- | -------------- |
| 3 approved pieces | Piece A: COP 8,000 + Piece B: COP 12,000 + Piece C: COP 5,000 | COP 25,000 |
| Mixed statuses    | 2 approved (COP 8,000 + COP 12,000), 1 done_pending_approval (COP 5,000) | COP 20,000 (pending piece excluded) |
| No approved       | 3 pieces all `done_pending_approval`                      | COP 0          |
| No pieces         | Clothier has no batch pieces in range                     | COP 0          |

### TS-7-011: Pieces from different batches in same period

**Preconditions:** Clothier has approved pieces across 2 batches within the same business day range.

| Batch   | Approved pieces               | Subtotal   |
| ------- | ----------------------------- | ---------- |
| Batch 1 | COP 8,000 + COP 12,000       | COP 20,000 |
| Batch 2 | COP 5,000 + COP 7,000        | COP 12,000 |

**Total expected:** COP 32,000. Verify the breakdown lists pieces grouped by batch.

### TS-7-012: Pieces linked to different business days

Clothier has approved pieces in Day 1 and Day 3 (not Day 2). Payout range covers Days 1-3.

- Earnings include only approved pieces from Days 1 and 3.
- Day 2 contributes COP 0 (no pieces).

---

## 3. Secretary earnings -- daily rate (T065)

### TS-7-020: Basic daily rate calculation

`computeSecretaryEarnings(employeeId, businessDayIds[])` counts business days the employee was expected to work (minus vacation and approved_absence days) and multiplies by `employees.daily_rate`.

| Test case              | Business days | Absences         | Daily rate  | Calculation       | Expected     |
| ---------------------- | ------------- | ---------------- | ----------- | ----------------- | ------------ |
| Full week, no absences | 5 days        | 0                | COP 60,000  | 5 * 60000         | COP 300,000  |
| 1 vacation day         | 5 days        | 1 vacation       | COP 60,000  | 4 * 60000         | COP 240,000  |
| 2 absences (mixed)     | 5 days        | 1 vacation, 1 approved_absence | COP 60,000 | 3 * 60000 | COP 180,000 |
| All days absent        | 5 days        | 5 vacation       | COP 60,000  | 0 * 60000         | COP 0        |
| No business days       | 0 days        | --               | COP 60,000  | 0 * 60000         | COP 0        |

### TS-7-021: Part-time employee (expected_work_days)

**Preconditions:** Secretary with `expected_work_days = 3` (works 3 days per week). 5 business days in range. No absences.

| Scenario                              | Business days | expected_work_days | Absences | Days worked | Expected        |
| ------------------------------------- | ------------- | ------------------ | -------- | ----------- | --------------- |
| Part-time, no absences                | 5             | 3                  | 0        | 3           | 3 * COP 60,000 = COP 180,000 |
| Part-time, 1 vacation                 | 5             | 3                  | 1        | 2           | 2 * COP 60,000 = COP 120,000 |
| Part-time, absences exceed expected   | 5             | 3                  | 4        | 0           | COP 0 (cannot go negative)   |
| Full-time (null expected_work_days)   | 5             | null               | 0        | 5           | 5 * COP 60,000 = COP 300,000 |

### TS-7-022: `missed` absence type counts as worked

A `missed` day means the employee did not show up but was expected. It is NOT deducted from the count (the business decides whether to pay or not via manual adjustment at payout time).

| Business days | Absences              | Days counted as worked | Expected (COP 60,000/day) |
| ------------- | --------------------- | ---------------------- | ------------------------- |
| 5             | 1 missed              | 5                      | COP 300,000               |
| 5             | 1 vacation, 1 missed  | 4                      | COP 240,000               |

### TS-7-023: Return structure

The function must return:
- `total`: integer COP amount
- `days_worked`: integer count
- `daily_rate`: integer COP amount
- `absences`: list of absence records (date, type) that were deducted

Verify all fields are present and correct for each test case.

---

## 4. Payout recording and audit trail (T067)

### TS-7-030: Standard payout recording

**Preconditions:** Stylist "Ana" earned COP 38,500 across 3 business days. Admin opens payout screen.

| Step | Actor | Action                                  | Verification                                              |
| ---- | ----- | --------------------------------------- | --------------------------------------------------------- |
| 1    | Admin | Selects Ana, selects Days 1-3           | Preview shows COP 38,500 with line-by-line breakdown      |
| 2    | Admin | Confirms amount COP 38,500, cash        | Payout created; `original_computed_amount` = 38500; `amount` = 38500; `adjustment_reason` = null |
| 3    | System| Covered items marked as settled          | Junction table rows created for each ticket item          |
| 4    | System| Ana's unsettled earnings for Days 1-3    | Returns COP 0 (all settled)                               |

### TS-7-031: Admin adjusts payout amount

**Preconditions:** Same as TS-7-030. Computed earnings = COP 38,500.

| Step | Actor | Action                                  | Verification                                              |
| ---- | ----- | --------------------------------------- | --------------------------------------------------------- |
| 1    | Admin | Preview shows COP 38,500                | Original computed value displayed                         |
| 2    | Admin | Changes amount to COP 35,000            | Adjustment reason field becomes required                  |
| 3    | Admin | Enters reason: "Descuento adelanto"     | --                                                        |
| 4    | Admin | Confirms                                | `original_computed_amount` = 38500; `amount` = 35000; `adjustment_reason` = "Descuento adelanto" |

### TS-7-032: Payout of COP 0

**Preconditions:** Employee has COP 0 computed earnings (no tickets/pieces in range).

| Scenario                        | Expected                                                   |
| ------------------------------- | ---------------------------------------------------------- |
| Admin selects range with 0 earnings | Preview shows COP 0. Admin can choose to confirm or skip. |
| Admin confirms COP 0 payout    | Valid payout record created with amount = 0.                |

### TS-7-033: Adjustment to COP 0

**Preconditions:** Computed earnings = COP 15,000. Admin adjusts to COP 0 with reason "Deduccion completa por dano".

- `original_computed_amount` = 15000
- `amount` = 0
- `adjustment_reason` = "Deduccion completa por dano"
- Payout is valid; items marked settled.

### TS-7-034: Multiple payment methods

Admin records payout via `cash`, `card`, or `transfer`. Verify each method is accepted and stored correctly.

---

## 5. Double-pay prevention (T068)

### TS-7-040: Full overlap -- all days already settled

**Preconditions:** Payout P1 covers Days 1-5 for stylist Ana.

| Step | Actor | Action                                  | Expected                                                 |
| ---- | ----- | --------------------------------------- | -------------------------------------------------------- |
| 1    | Admin | Selects Ana, selects Days 1-5           | Error: "All selected days are already settled"           |
| 2    | --    | --                                      | Lists: Days 1-5 covered by Payout P1                    |
| 3    | --    | --                                      | Submit button disabled                                   |

Server-side check must block even if the frontend is bypassed.

### TS-7-041: Partial overlap -- some days settled

**Preconditions:** Payout P1 covers Days 1-3. Admin selects Days 2-5.

| Step | Actor | Action                                  | Expected                                                 |
| ---- | ----- | --------------------------------------- | -------------------------------------------------------- |
| 1    | Admin | Selects Ana, selects Days 2-5           | Error: "Days 2, 3 are already settled (Payout P1)"      |
| 2    | --    | --                                      | Unsettled days (4, 5) shown separately                   |
| 3    | --    | --                                      | Submit blocked; admin must adjust range to Days 4-5 only |

### TS-7-042: No overlap -- clean payout

**Preconditions:** Payout P1 covers Days 1-3. Admin selects Days 4-5.

| Step | Actor | Action                                  | Expected                                 |
| ---- | ----- | --------------------------------------- | ---------------------------------------- |
| 1    | Admin | Selects Ana, selects Days 4-5           | Preview shows earnings for Days 4-5 only |
| 2    | Admin | Confirms payout                         | Payout created successfully              |

### TS-7-043: Concurrent payout submissions for overlapping ranges

See `docs/testing/concurrency-test-plan.md` for detailed race condition specification. Summary: two admins submit payouts for Days 1-3 and Days 2-5 simultaneously. Exactly one must succeed; the other receives a conflict error.

---

## 6. Deactivation guard (T022b)

### TS-7-050: Block deactivation with unsettled earnings

**Preconditions:** Stylist "Carlos" has COP 22,500 unsettled earnings from Days 4-5.

| Step | Actor | Action                                  | Expected                                                 |
| ---- | ----- | --------------------------------------- | -------------------------------------------------------- |
| 1    | Admin | Clicks "Deactivate" on Carlos's profile | Block message: "Cannot deactivate. Unsettled earnings: COP 22,500 (Days 4-5)" |
| 2    | --    | --                                      | "Terminate with final payment" option offered            |

### TS-7-051: Termination flow

**Preconditions:** Same as TS-7-050.

| Step | Actor | Action                                   | Verification                                             |
| ---- | ----- | ---------------------------------------- | -------------------------------------------------------- |
| 1    | Admin | Clicks "Terminate with final payment"    | Final settlement screen with computed COP 22,500         |
| 2    | Admin | Enters amount COP 22,500, confirms       | Payout created; `original_computed_amount` = 22500       |
| 3    | System| Deactivation proceeds                    | `is_active` = false, `deactivated_at` = now              |
| 4    | System| Verify no unsettled earnings remain       | `computeStylistEarnings(Carlos, unsettled_days)` = COP 0 |
| 5    | System| Carlos cannot log in                      | Login attempt rejected                                   |

### TS-7-052: Deactivation with no outstanding earnings

**Preconditions:** All of Carlos's earnings have been settled.

| Step | Actor | Action                                  | Expected                          |
| ---- | ----- | --------------------------------------- | --------------------------------- |
| 1    | Admin | Clicks "Deactivate"                     | Proceeds immediately (no block)   |
| 2    | System| Carlos deactivated                       | `is_active` = false               |

---

## 7. Absence management (T020, T021)

### TS-7-060: Create absence records

| Test case                           | Expected                                              |
| ----------------------------------- | ----------------------------------------------------- |
| Admin adds vacation for Day 3       | Absence record created: type = vacation               |
| Admin adds approved_absence Day 4   | Absence record created: type = approved_absence       |
| Admin adds missed for Day 5         | Absence record created: type = missed                 |
| Duplicate (same employee, same date)| Error: "Absence already recorded for this date"       |

### TS-7-061: Calendar view

| Scenario                            | Expected                                              |
| ----------------------------------- | ----------------------------------------------------- |
| Month view with absences            | Coloured dots: blue = vacation, amber = approved, red = missed |
| Navigate to month with no absences  | Empty calendar (no dots)                              |
| Mobile view                         | List grouped by date (not grid)                       |

### TS-7-062: "Who works today" query

**Preconditions:** 5 active employees. Employee A has vacation today. Employee B has approved_absence today.

- Query returns 3 employees (C, D, E).
- Employee A and B excluded.
- Deactivated employees excluded regardless of absence records.

---

## 8. Employee earnings view (T069)

### TS-7-070: Earnings visibility gated by flag

| `show_earnings` | Action                        | Expected                    |
| --------------- | ----------------------------- | --------------------------- |
| true            | Stylist navigates to /earnings| Earnings page loads         |
| false           | Stylist navigates to /earnings| 404 or redirect to home     |

### TS-7-071: Correct role-specific computation

| Role      | Earnings shown                                              |
| --------- | ----------------------------------------------------------- |
| Stylist   | Commission-based from closed tickets                        |
| Clothier  | Per-piece from approved batch pieces                        |
| Secretary | Daily rate * days worked                                    |

### TS-7-072: Empty state

Employee with no earnings in any period sees: "No earnings recorded for this period."

---

## 9. Unsettled earnings alert (T070)

### TS-7-080: Alert shown when unsettled earnings exist

**Preconditions:** Closed business day with approved work but no payout.

| Scenario                              | Expected                                             |
| ------------------------------------- | ---------------------------------------------------- |
| 2 employees with unsettled earnings   | Alert badge shows on admin home; lists both employees|
| Click employee name in alert          | Navigates to payout screen pre-filled for that employee |
| All earnings settled                  | Alert area hidden or shows "All earnings settled"    |

---

## 10. E2E flow -- full payroll cycle

### TS-7-090: Multiple employees, multiple days, compute, pay, verify

**Preconditions:** Seeded payroll-multi-employee fixture.

- Stylist "Ana": 3 closed tickets across Days 1-5 (COP 50,000 @ 30%, COP 30,000 @ 25%, COP 80,000 @ 20%)
- Clothier "Pedro": 5 approved pieces across Days 1-5 (COP 8,000 + COP 12,000 + COP 5,000 + COP 7,000 + COP 10,000)
- Secretary "Laura": daily_rate COP 60,000, expected_work_days = null, 5 business days, 1 vacation (Day 3)

**Expected earnings:**

| Employee | Calculation                                                      | Expected         |
| -------- | ---------------------------------------------------------------- | ---------------- |
| Ana      | 15,000 + 7,500 + 16,000                                         | COP 38,500       |
| Pedro    | 8,000 + 12,000 + 5,000 + 7,000 + 10,000                        | COP 42,000       |
| Laura    | (5 - 1 vacation) * 60,000                                       | COP 240,000      |

**E2E Steps:**

| Step | Action                                              | Verification                                          |
| ---- | --------------------------------------------------- | ----------------------------------------------------- |
| 1    | Admin computes earnings for Ana, Days 1-5           | Preview: COP 38,500 with 3-ticket breakdown           |
| 2    | Admin confirms payout for Ana, cash                 | Payout created; items settled                         |
| 3    | Admin computes earnings for Pedro, Days 1-5         | Preview: COP 42,000 with 5-piece breakdown            |
| 4    | Admin confirms payout for Pedro, transfer           | Payout created; pieces settled                        |
| 5    | Admin computes earnings for Laura, Days 1-5         | Preview: COP 240,000, 4 days worked, 1 vacation       |
| 6    | Admin confirms payout for Laura, cash               | Payout created                                        |
| 7    | Admin attempts payout for Ana, Days 1-5 again       | Blocked: "All selected days already settled"           |
| 8    | Admin attempts payout for Ana, Days 3-7             | Blocked: partial overlap on Days 3-5                   |
| 9    | Admin checks unsettled earnings alert               | No employees with unsettled earnings for Days 1-5     |
| 10   | Admin views analytics                               | Revenue and payout totals reflect all three payouts   |

### TS-7-091: Payout with adjustment and audit trail

Extend TS-7-090: admin adjusts Ana's payout from COP 38,500 to COP 35,000 with reason "Adelanto descontado".

Verify:
- `payouts.original_computed_amount` = 38500
- `payouts.amount` = 35000
- `payouts.adjustment_reason` = "Adelanto descontado"
- Earnings view for Ana shows the payout of COP 35,000 (not the original computed amount).

---

## 11. Banker's rounding comprehensive test suite

These tests must be implemented as unit tests in `packages/db/src/queries/earnings.test.ts` (or equivalent). Each row is an independent test case.

| # | Price (COP) | Commission % | Raw result      | Expected (half-even) | Test assertion             |
| - | ----------- | ------------ | --------------- | -------------------- | -------------------------- |
| 1 | 10,000      | 33.33        | 3333.0          | 3,333                | Exact, no rounding         |
| 2 | 10,000      | 12.50        | 1250.0          | 1,250                | Exact, no rounding         |
| 3 | 10,001      | 15.55        | 1555.1555       | 1,555                | Round down (.1555)         |
| 4 | 15,000      | 33.33        | 4999.5          | 5,000                | Half to even (5000 is even)|
| 5 | 25,000      | 33.33        | 8332.5          | 8,332                | Half to even (8332 is even)|
| 6 | 10,000      | 50.00        | 5000.0          | 5,000                | Exact                      |
| 7 | 10,000      | 100.00       | 10000.0         | 10,000               | Full commission            |
| 8 | 10,000      | 0.00         | 0.0             | 0                    | Zero commission            |
| 9 | 1           | 33.33        | 0.3333          | 0                    | Sub-peso rounds to 0      |
| 10| 3           | 33.33        | 0.9999          | 1                    | Rounds up to 1            |
| 11| 100,000     | 33.33        | 33330.0         | 33,330               | Large amount, exact        |
| 12| 7,500       | 33.33        | 2499.75         | 2,500                | .75 rounds up              |
| 13| 5,000       | 33.33        | 1666.5          | 1,666                | Half to even (1666 is even)|
| 14| 35,000      | 33.33        | 11665.5         | 11,666               | Half to even (11666 is even)|

Implementation note: use a utility function `roundHalfEven(value: number): number` that is unit-tested independently before being used in earnings computation.
