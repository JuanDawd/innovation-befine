# Endpoint Inventory — Server Actions + API Routes

> Scope: every mutating and read server action + every Next.js API route in
> `apps/web/src/app`. Produced for T09R-R10 (M-46). Used by the endpoint contract
> test suite under `apps/web/src/app/__tests__/endpoints/` to verify per-role
> behaviour: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, success shape.
>
> Roles: `cashier_admin`, `secretary`, `stylist`, `clothier`. "—" = none.
>
> "Mut?" = mutation. "RateLim?" = has `@upstash/ratelimit` gate. "Validates?" = Zod
> schema at entry.

## API Routes

| Route                     | File                              | Method | Purpose                 | Auth? | Roles | Mut? |
| ------------------------- | --------------------------------- | ------ | ----------------------- | ----- | ----- | ---- |
| `/api/auth/[...all]`      | `api/auth/[...all]/route.ts`      | ANY    | Better Auth passthrough | Mixed | —     | —    |
| `/api/realtime/[channel]` | `api/realtime/[channel]/route.ts` | GET    | SSE subscription        | Yes   | any   | no   |
| `/api/sse/test`           | `api/sse/test/route.ts`           | GET    | SSE sanity check (dev)  | Yes   | any   | no   |

## Server actions

### notifications/actions.ts

| Action              | Auth | Roles allowed | Mut | Validates | Notes                           |
| ------------------- | ---- | ------------- | --- | --------- | ------------------------------- |
| `listNotifications` | yes  | any           | no  | no        | Filters to caller's employee.id |
| `markRead`          | yes  | any           | yes | uuid arg  | Must own notification           |
| `markAllRead`       | yes  | any           | yes | no        | Caller-scoped                   |

### batches/actions.ts

| Action                | Auth | Roles allowed            | Mut | Validates | Notes |
| --------------------- | ---- | ------------------------ | --- | --------- | ----- |
| `listActiveClothiers` | yes  | cashier_admin, secretary | no  | no        |       |
| `createBatch`         | yes  | cashier_admin, secretary | yes | Zod       |       |

### batches/approval-actions.ts

| Action                 | Auth | Roles allowed            | Mut | Validates | Notes          |
| ---------------------- | ---- | ------------------------ | --- | --------- | -------------- |
| `listPendingApprovals` | yes  | cashier_admin, secretary | no  | no        |                |
| `approvePiece`         | yes  | cashier_admin, secretary | yes | Zod       |                |
| `adminMarkApproved`    | yes  | cashier_admin            | yes | Zod       | Admin override |

### appointments/actions.ts

| Action                              | Auth | Roles allowed                     | Mut | Validates |
| ----------------------------------- | ---- | --------------------------------- | --- | --------- |
| `createAppointment`                 | yes  | cashier_admin, secretary          | yes | Zod       |
| `listAppointmentsForDate`           | yes  | cashier_admin, secretary          | no  | no        |
| `listBookingStylists`               | yes  | cashier_admin, secretary          | no  | no        |
| `transitionAppointment`             | yes  | cashier_admin, secretary, stylist | yes | Zod       |
| `acknowledgeAppointmentPriceChange` | yes  | cashier_admin, secretary          | yes | uuid      |

### clothier/actions.ts

| Action                 | Auth | Roles allowed | Mut | Validates         |
| ---------------------- | ---- | ------------- | --- | ----------------- |
| `listTodayBatchPieces` | yes  | clothier      | no  | no                |
| `claimPiece`           | yes  | clothier      | yes | uuid              |
| `markPieceDone`        | yes  | clothier      | yes | Zod + idempotency |

### large-orders/actions.ts

| Action                      | Auth | Roles allowed            | Mut | Validates         |
| --------------------------- | ---- | ------------------------ | --- | ----------------- |
| `createLargeOrder`          | yes  | cashier_admin, secretary | yes | Zod               |
| `editLargeOrder`            | yes  | cashier_admin, secretary | yes | Zod               |
| `transitionLargeOrder`      | yes  | cashier_admin, secretary | yes | Zod               |
| `recordLargeOrderPayment`   | yes  | cashier_admin            | yes | Zod + idempotency |
| `listLargeOrders`           | yes  | cashier_admin, secretary | no  | no                |
| `getLargeOrder`             | yes  | cashier_admin, secretary | no  | uuid              |
| `listClientsForOrder`       | yes  | cashier_admin, secretary | no  | no                |
| `getLargeOrderBatchSummary` | yes  | cashier_admin, secretary | no  | uuid              |

### admin/absences/actions.ts

| Action                          | Auth | Roles allowed | Mut | Validates |
| ------------------------------- | ---- | ------------- | --- | --------- |
| `logAbsence`                    | yes  | cashier_admin | yes | Zod       |
| `deleteAbsence`                 | yes  | cashier_admin | yes | uuid      |
| `listAbsencesForMonth`          | yes  | cashier_admin | no  | Zod       |
| `listActiveEmployeesForAbsence` | yes  | cashier_admin | no  | no        |

### admin/analytics/actions.ts

| Action                   | Auth | Roles allowed | Mut | Validates |
| ------------------------ | ---- | ------------- | --- | --------- |
| `getAnalyticsSummary`    | yes  | cashier_admin | no  | Zod       |
| `getEmployeePerformance` | yes  | cashier_admin | no  | Zod       |
| `getAnalyticsCsvData`    | yes  | cashier_admin | no  | Zod       |
| `getEmployeeDrillDown`   | yes  | cashier_admin | no  | Zod       |

### admin/catalog/actions/services.ts

| Action               | Auth | Roles allowed | Mut | Validates |
| -------------------- | ---- | ------------- | --- | --------- |
| `listActiveServices` | yes  | any           | no  | no        |
| `listAllServices`    | yes  | cashier_admin | no  | no        |
| `createService`      | yes  | cashier_admin | yes | Zod       |
| `editService`        | yes  | cashier_admin | yes | Zod       |
| `deactivateService`  | yes  | cashier_admin | yes | uuid      |
| `restoreService`     | yes  | cashier_admin | yes | uuid      |
| `addVariant`         | yes  | cashier_admin | yes | Zod       |
| `editVariant`        | yes  | cashier_admin | yes | Zod       |
| `deactivateVariant`  | yes  | cashier_admin | yes | uuid      |
| `restoreVariant`     | yes  | cashier_admin | yes | uuid      |

### admin/catalog/actions/cloth-pieces.ts

| Action                        | Auth | Roles allowed            | Mut | Validates |
| ----------------------------- | ---- | ------------------------ | --- | --------- |
| `listActiveClothPieces`       | yes  | cashier_admin, secretary | no  | no        |
| `listAllClothPieces`          | yes  | cashier_admin            | no  | no        |
| `createClothPiece`            | yes  | cashier_admin            | yes | Zod       |
| `editClothPiece`              | yes  | cashier_admin            | yes | Zod       |
| `deactivateClothPiece`        | yes  | cashier_admin            | yes | uuid      |
| `restoreClothPiece`           | yes  | cashier_admin            | yes | uuid      |
| `createClothPieceVariant`     | yes  | cashier_admin            | yes | Zod       |
| `editClothPieceVariant`       | yes  | cashier_admin            | yes | Zod       |
| `deactivateClothPieceVariant` | yes  | cashier_admin            | yes | uuid      |
| `restoreClothPieceVariant`    | yes  | cashier_admin            | yes | uuid      |

### admin/catalog/actions/audit-log.ts

| Action              | Auth | Roles allowed | Mut | Validates |
| ------------------- | ---- | ------------- | --- | --------- |
| `getEntityAuditLog` | yes  | cashier_admin | no  | uuid      |

### admin/employees/actions/

| Action                           | File               | Roles allowed | Mut | Validates |
| -------------------------------- | ------------------ | ------------- | --- | --------- |
| `createEmployee`                 | create-employee.ts | cashier_admin | yes | Zod       |
| `listEmployees`                  | list-employees.ts  | cashier_admin | no  | no        |
| `editEmployee`                   | update-employee.ts | cashier_admin | yes | Zod       |
| `setShowEarnings`                | update-employee.ts | cashier_admin | yes | Zod       |
| `deactivateEmployee`             | update-employee.ts | cashier_admin | yes | Zod       |
| `getUnsettledPeriodsForEmployee` | update-employee.ts | cashier_admin | no  | uuid      |
| `terminateEmployee`              | update-employee.ts | cashier_admin | yes | Zod       |

### admin/payroll/actions.ts

| Action                   | Auth | Roles allowed                | Mut | Validates         |
| ------------------------ | ---- | ---------------------------- | --- | ----------------- |
| `listClosedBusinessDays` | yes  | cashier_admin                | no  | uuid              |
| `previewEarnings`        | yes  | cashier_admin                | no  | Zod               |
| `recordPayout`           | yes  | cashier_admin                | yes | Zod + idempotency |
| `listPayouts`            | yes  | cashier_admin                | no  | uuid?             |
| `getUnsettledEmployees`  | yes  | cashier_admin                | no  | no                |
| `getMyEarnings`          | yes  | stylist, clothier, secretary | no  | no                |

### admin/tickets/history/actions.ts

| Action                  | Auth | Roles allowed | Mut | Validates |
| ----------------------- | ---- | ------------- | --- | --------- |
| `listBusinessDays`      | yes  | cashier_admin | no  | no        |
| `listClosedTickets`     | yes  | cashier_admin | no  | Zod       |
| `getClosedTicketDetail` | yes  | cashier_admin | no  | uuid      |
| `reopenTicket`          | yes  | cashier_admin | yes | uuid      |

### cashier/actions/

| Action              | File            | Roles allowed | Mut | Validates |
| ------------------- | --------------- | ------------- | --- | --------- |
| `openBusinessDay`   | business-day.ts | cashier_admin | yes | no        |
| `closeBusinessDay`  | business-day.ts | cashier_admin | yes | uuid      |
| `reopenBusinessDay` | business-day.ts | cashier_admin | yes | Zod       |
| `getDayStats`       | day-stats.ts    | cashier_admin | no  | no        |

### cashier/checkout/actions.ts

| Action                       | Auth | Roles allowed | Mut | Validates         |
| ---------------------------- | ---- | ------------- | --- | ----------------- |
| `getAwaitingPaymentTickets`  | yes  | cashier_admin | no  | no                |
| `processCheckout`            | yes  | cashier_admin | yes | Zod + idempotency |
| `processPaidOfflineCheckout` | yes  | cashier_admin | yes | Zod + idempotency |
| `setOverridePrice`           | yes  | cashier_admin | yes | Zod               |
| `listPriceOverrides`         | yes  | cashier_admin | no  | no                |

### clients/actions/index.ts

| Action            | Auth | Roles allowed            | Mut | Validates |
| ----------------- | ---- | ------------------------ | --- | --------- |
| `searchClients`   | yes  | cashier_admin, secretary | no  | Zod       |
| `listClients`     | yes  | cashier_admin, secretary | no  | no        |
| `createClient`    | yes  | cashier_admin, secretary | yes | Zod       |
| `editClient`      | yes  | cashier_admin, secretary | yes | Zod       |
| `archiveClient`   | yes  | cashier_admin, secretary | yes | uuid      |
| `unarchiveClient` | yes  | cashier_admin, secretary | yes | uuid      |

### profile/actions/change-password.ts

| Action           | Auth | Roles allowed | Mut | Validates |
| ---------------- | ---- | ------------- | --- | --------- |
| `changePassword` | yes  | any           | yes | Zod       |

### tickets/actions/index.ts

| Action                                | Auth | Roles allowed                            | Mut | Validates         |
| ------------------------------------- | ---- | ---------------------------------------- | --- | ----------------- |
| `getCurrentEmployeeId`                | yes  | any                                      | no  | no                |
| `listActiveStylists`                  | yes  | cashier_admin, secretary                 | no  | no                |
| `createTicket`                        | yes  | cashier_admin, secretary, stylist        | yes | Zod + idempotency |
| `listOpenTickets`                     | yes  | cashier_admin, secretary                 | no  | no                |
| `transitionToAwaitingPayment`         | yes  | cashier_admin, secretary, stylist (self) | yes | Zod               |
| `transitionReopenedToAwaitingPayment` | yes  | cashier_admin                            | yes | Zod               |

### tickets/edit-requests/actions.ts

| Action                      | Auth | Roles allowed        | Mut | Validates |
| --------------------------- | ---- | -------------------- | --- | --------- |
| `requestEdit`               | yes  | stylist (owner only) | yes | Zod       |
| `listPendingEditRequests`   | yes  | cashier_admin        | no  | no        |
| `resolveEditRequest`        | yes  | cashier_admin        | yes | Zod       |
| `listActiveServiceVariants` | yes  | any                  | no  | no        |
| `listMyOpenTicketItems`     | yes  | stylist              | no  | no        |
| `listMyEditRequests`        | yes  | stylist              | no  | no        |

---

## Contract test coverage status — T09R-R10

- ✅ Endpoint inventory (this file) — 23 files, 3 API routes, ~80 distinct
  actions.
- ✅ Contract shape fixture — `apps/web/src/app/__tests__/endpoints/_helpers.ts`.
- ✅ High-risk mutation coverage — financial + destructive mutations across the
  four roles. See `apps/web/src/app/__tests__/endpoints/mutations.contract.test.ts`.
- ⏳ Read-only action coverage — deferred. Read actions do not touch money and
  share the same role-gate helper, so their shape risk is limited. Tracked as
  follow-up M-46b in `docs/issues-tracker.md`; to be resolved before go-live
  (T089).
