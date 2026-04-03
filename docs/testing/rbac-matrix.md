# RBAC permission matrix -- Innovation Befine

> **Roles:** Admin (cashier/admin), Secretary, Stylist (all subtypes), Clothier.
> **Rule:** Every "No" cell in this matrix = a negative test case that must be automated as an integration test.
> **Note:** "Admin" encompasses the cashier role. The system has one admin role that performs both administrative and cashier functions.

---

## How to read this matrix

- **Yes** = the role is permitted to perform this action.
- **Own** = the role can perform this action only on their own data.
- **No** = the role is forbidden. This cell must have a corresponding automated test that verifies a 403 response.
- **Read** = read-only access (cannot create, edit, or delete).

---

## Business day management

| Action                        | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------- | ----- | --------- | ------- | -------- | -------- |
| Open business day             | Yes   | No        | No      | No       | T019     |
| Close business day            | Yes   | No        | No      | No       | T019     |
| Reopen closed business day    | Yes   | No        | No      | No       | T019     |
| View current day status       | Yes   | Yes       | Yes     | Yes      | T019     |

---

## Employee management

| Action                          | Admin | Secretary | Stylist | Clothier | Task ref |
| ------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create employee                 | Yes   | No        | No      | No       | T013     |
| Edit employee profile           | Yes   | No        | No      | No       | T014     |
| Deactivate employee             | Yes   | No        | No      | No       | T022a    |
| Terminate with final payment    | Yes   | No        | No      | No       | T022b    |
| View employee list              | Yes   | Yes       | No      | No       | T014     |
| View own profile                | Yes   | Yes       | Own     | Own      | T014     |
| Toggle earnings visibility flag | Yes   | No        | No      | No       | T015     |
| Change own password             | Yes   | Yes       | Yes     | Yes      | T091     |

---

## Catalog management

| Action                             | Admin | Secretary | Stylist | Clothier | Task ref |
| ---------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create service type/variant        | Yes   | No        | No      | No       | T024     |
| Edit service type/variant          | Yes   | No        | No      | No       | T024     |
| Deactivate service type/variant    | Yes   | No        | No      | No       | T024     |
| View service catalog (read)        | Yes   | Yes       | Yes     | No       | T028     |
| Create cloth piece type            | Yes   | No        | No      | No       | T027     |
| Edit cloth piece type              | Yes   | No        | No      | No       | T027     |
| Deactivate cloth piece type        | Yes   | No        | No      | No       | T027     |
| View cloth piece catalog (read)    | Yes   | Yes       | No      | Yes      | T028     |
| View catalog audit log             | Yes   | No        | No      | No       | T025     |

---

## Tickets and checkout

| Action                                | Admin | Secretary | Stylist    | Clothier | Task ref |
| ------------------------------------- | ----- | --------- | ---------- | -------- | -------- |
| Create ticket (any employee)          | Yes   | Yes       | No         | No       | T035     |
| Create ticket (own only)             | Yes   | Yes       | Own        | No       | T035     |
| Mark ticket ready (awaiting_payment) | Yes   | Yes       | Own ticket | No       | T037     |
| Checkout / close ticket              | Yes   | No        | No         | No       | T038     |
| Price override at checkout           | Yes   | No        | No         | No       | T040     |
| Split payment at checkout            | Yes   | No        | No         | No       | T039     |
| Reopen closed ticket                 | Yes   | No        | No         | No       | T042     |
| Submit edit request                  | No    | Yes       | Own ticket | No       | T041     |
| Approve/reject edit request          | Yes   | No        | No         | No       | T041     |
| View cashier dashboard               | Yes   | No        | No         | No       | T036     |
| View closed ticket history           | Yes   | No        | No         | No       | T092     |
| View admin home / day-at-a-glance    | Yes   | No        | No         | No       | T093     |

---

## Appointments

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Book appointment                    | Yes   | Yes       | No      | No       | T050     |
| View appointment calendar           | Yes   | Yes       | No      | No       | T052     |
| Confirm appointment                 | Yes   | Yes       | No      | No       | T053     |
| Cancel appointment                  | Yes   | Yes       | No      | No       | T053     |
| Reschedule appointment              | Yes   | Yes       | No      | No       | T053     |
| Mark appointment as no-show         | Yes   | Yes       | No      | No       | T053     |
| Complete appointment                | Yes   | Yes       | No      | No       | T053     |
| Send confirmation email             | Yes   | Yes       | No      | No       | T056     |

---

## Cloth batches

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create cloth batch                  | Yes   | Yes       | No      | No       | T045     |
| View batch list (all)               | Yes   | Yes       | No      | No       | T045     |
| View assigned/unassigned pieces     | No    | No        | No      | Own      | T046     |
| Mark piece as done                  | No    | No        | No      | Own      | T046     |
| Approve piece                       | Yes   | Yes       | No      | No       | T047     |
| Mark piece directly as approved     | Yes   | Yes       | No      | No       | T047     |

---

## Large orders

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create large order                  | Yes   | Yes       | No      | No       | T058     |
| Edit large order                    | Yes   | Yes       | No      | No       | T058     |
| Update order status                 | Yes   | Yes       | No      | No       | T059     |
| Cancel order                        | Yes   | Yes       | No      | No       | T059     |
| Record additional payment           | Yes   | Yes       | No      | No       | T061     |
| Link batch to order                 | Yes   | Yes       | No      | No       | T060     |
| View large orders list              | Yes   | Yes       | No      | No       | T062     |

---

## Payroll and earnings

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Compute earnings (any employee)     | Yes   | No        | No      | No       | T063-T065 |
| Record payout                       | Yes   | No        | No      | No       | T067     |
| Adjust payout amount                | Yes   | No        | No      | No       | T067     |
| View all employee earnings          | Yes   | No        | No      | No       | T067     |
| View own earnings                   | Yes   | No        | Own     | Own      | T069     |
| View payout history (all)           | Yes   | No        | No      | No       | T067     |
| View own payout history             | Yes   | No        | Own     | Own      | T069     |
| View unsettled earnings alert       | Yes   | No        | No      | No       | T070     |

---

## Absence management

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create absence record               | Yes   | No        | No      | No       | T021     |
| Edit absence record                 | Yes   | No        | No      | No       | T021     |
| Delete absence record               | Yes   | No        | No      | No       | T021     |
| View absence calendar               | Yes   | No        | No      | No       | T021     |

---

## Analytics

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| View daily revenue dashboard        | Yes   | No        | No      | No       | T072     |
| View weekly/monthly dashboards      | Yes   | No        | No      | No       | T073     |
| View per-employee performance       | Yes   | No        | No      | No       | T074     |
| Export CSV                           | Yes   | No        | No      | No       | T076     |

---

## Client management

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Create saved client                 | Yes   | Yes       | No      | No       | T030     |
| Edit saved client                   | Yes   | Yes       | No      | No       | T030     |
| Search clients                      | Yes   | Yes       | Yes     | No       | T030     |
| View client detail                  | Yes   | Yes       | No      | No       | T030     |
| Enter guest name (at ticket create) | Yes   | Yes       | Yes     | No       | T031     |

---

## System administration

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| Data migration (spreadsheet import) | Yes   | No        | No      | No       | T100     |
| View Sentry errors                  | Yes   | No        | No      | No       | T085     |
| Access Drizzle Studio               | Yes   | No        | No      | No       | T006     |

---

## Notifications (all roles)

| Action                              | Admin | Secretary | Stylist | Clothier | Task ref |
| ----------------------------------- | ----- | --------- | ------- | -------- | -------- |
| View own notifications              | Yes   | Yes       | Yes     | Yes      | T048     |
| Mark notification as read           | Yes   | Yes       | Yes     | Yes      | T048     |
| Mark all notifications as read      | Yes   | Yes       | Yes     | Yes      | T048     |

---

## Negative test count summary

| Role      | Total "No" cells | Notes                                           |
| --------- | ---------------- | ----------------------------------------------- |
| Secretary | ~25              | Blocked from all financial, analytics, payroll, admin routes |
| Stylist   | ~35              | Most restricted; only own tickets and own earnings |
| Clothier  | ~40              | Most restricted; only own pieces and own earnings  |

Total automated negative test cases: approximately 100 across all roles. These must run on every PR as part of the regression suite.

---

## Implementation notes

1. **Test file location:** `packages/db/src/__tests__/rbac/` or `apps/web/src/__tests__/rbac/`.
2. **Test helper:** create a `loginAs(role)` utility that returns an authenticated session for each role.
3. **Test pattern:** each test calls the endpoint with the forbidden role and asserts:
   - HTTP status 403.
   - Response body matches `{ success: false, error: { code: "FORBIDDEN" } }`.
   - No side effect in the database (no rows created, no state changed).
4. **"Own" constraints:** stylist self-only tests must also verify the correct employee_id is enforced server-side, not just checked client-side.
