# Pedidos — unified orders, production, stock and activity log

> Decided in a design grilling session on 2026-10-18 (product owner + Claude). Replaces the Producto / Pedido grande split. Tasks: [Phase 11](tasks/phase-11-pedidos.md).

## 1. Why

Today a client order lives in two disconnected systems:

| System                                                        | Read by                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `craftables` + `craftable_pieces` ("Productos")               | Clothier board ("Mis productos"), **payroll**                |
| `order_items` + `cloth_piece_assignments` ("Pedidos grandes") | Order detail progress, "uds. sin asignar", products progress |

They drift (an order at "150/150 · 0 %"), work recorded only through assignments never reaches payroll, and a Pedido grande created with no open business day silently gets no production records. On top of that:

- The order form prices client lines with the variant's `piece_rate` (what the clothier earns) instead of `selling_price`.
- Order payments and garment sales never reach the till: not in "Ingresos hoy", the close-day summary, nor Analítica.
- Vender prenda sells any active variant in any quantity — there is no stock.
- Productos have no client although they are client orders.

All existing order, product and sale rows are test data (`Cliente Seed N`, `Test E2E`, 0 assignments, 3 cash payments). **No data migration:** the new model starts empty; catalog, employees and settings are kept.

## 2. Glossary

| Term                    | Meaning                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Pedido**              | An order for garments, for a saved client or for inventory. Replaces Producto and Pedido grande.                  |
| **Pedido grande**       | Not a separate type — a list filter: pedidos with 10+ units.                                                      |
| **Línea**               | One garment variant on a pedido, with colour, style, instructions and a size grid.                                |
| **Celda**               | One size within a line, with its own unit count. The unit of assignment, reporting, approval, delivery and stock. |
| **Asignación**          | Units of one celda given to one clothier, with the piece rate copied at creation.                                 |
| **Reporte**             | Units a clothier says are finished.                                                                               |
| **Revisión**            | Secretary/admin decision on reported units: approved, returned (rework) or scrapped.                              |
| **Cierre de jornada**   | A clothier's end-of-day confirmation of what they finished, required before their pay can be settled.             |
| **Movimiento de stock** | A signed change to the stock of one variant + size + colour.                                                      |

## 3. Decisions

### 3.1 Pedido

1. **One model, size is the only difference.** One creation form, one detail page, one production flow.
2. **Destination:** a saved client **or** "Para inventario". Client pedidos require a saved client with a **phone**; the client picker creates one inline (name + phone). Guests are not allowed. Inventory pedidos have no client.
3. **Lines:** catalog piece + variant, **colour** and **size** from admin-managed lists ("otro" allowed), free-text style and instructions, and a **size grid** (one quantity per size).
4. **Pricing:** each line defaults to variant `selling_price` × units, **copied onto the pedido**; editable per line with a reason (logged). Total = sum of lines. A whole-order adjustment is its own line with a reason. Variants without a selling price need one in the catalog or a typed price with reason.
5. **Numbering:** human-readable sequential number (`#0412`).

### 3.2 Production

6. **Work is counted in units per celda.** A celda can be split among clothiers.
7. **Getting work:**
   - Secretary/admin assign units of a celda to a clothier.
   - Clothiers **claim** unassigned units from "Disponibles", choosing how many, up to an admin-set limit (Configuración).
   - "Disponibles" is ordered by delivery date (nearest first, "Para hoy / Atrasado" flags); inventory pedidos after client pedidos.
   - A clothier may **release** units of an assignment they have not reported on; after the first report only secretary/admin can reassign.
8. **Piece rate** is copied onto the assignment at creation. The admin can change one assignment's rate with a reason (rush, embroidery). Clothiers see their own rate and expected earnings, never client prices.
9. **Reporting:** clothiers report finished units per assignment during the day.
10. **Review:** secretary/admin approve units partially. Units not approved are either:
    - **Returned** as rework to the same clothier with a reason ("costura torcida", "talla equivocada", free text) — shown first on her phone; paid **once** when approved, at the assignment rate.
    - **Scrapped** with a reason — written off and re-opened as unassigned units on the pedido. Whether scrapped units are paid is an admin setting (default: no).
11. **Cierre de jornada (clothier):** "Cerrar mi jornada" lists today's assignments with "¿Cuántas terminaste hoy?" (prefilled with the day's reports); a day with **0 units must still be confirmed**. Secretary/admin approve or correct closings with a reason. A reminder notification goes out near closing time.
12. **Pay = approved units × assignment rate.** "Liquidar" for a clothier is **blocked** until that day's closing is submitted **and** approved ("Luz no ha cerrado su jornada").
13. **Closing the business day only warns** about clothiers without a closing; their units stay pending and unpaid until they close.

### 3.3 Lifecycle

14. **Statuses are derived, not set:**

| Status          | When                                 |
| --------------- | ------------------------------------ |
| Pendiente       | Created; nothing assigned or claimed |
| En producción   | First unit assigned or claimed       |
| Listo           | Approved units = ordered units       |
| Entrega parcial | Some, not all, units delivered       |
| Entregado       | All units delivered                  |
| Pagado          | Delivered **and** balance = $0       |
| Cancelado       | Manual, with reason (see 3.4)        |

Inventory pedidos end at **Listo** (units enter stock). The detail page explains the status ("128 de 150 aprobadas"); there are no transition buttons that can contradict the numbers.

15. **Deliveries** are recorded in units per celda ("Registrar entrega"), only from approved, undelivered units, with date and who delivered. Small pedidos: one click, prefilled.

### 3.4 Changes after production starts

16. **Normal edits** (any role that can edit):
    - Increase a quantity: always; extra units start unassigned.
    - Decrease: only down to assigned units; reduce or release assignments first (clothier notified). Approved/delivered units are never removed.
    - Spec changes on assigned units: with reason; assigned clothiers notified and see the change; finished units keep the old specs on record.
    - Remove a line: only if nothing on it is assigned.
    - Price changes: with reason; if the total falls below what was paid, the difference becomes **saldo a favor** (never a silent negative).
17. **Admin-approved restructure:** with admin approval anything can change, below what was made. In one logged event:
    - Approved, undelivered units leave the pedido → **stock** or **scrap** (admin chooses per batch). Their clothiers stay paid.
    - Reported-but-unapproved units: approve-and-move (paid) or reject (unpaid, reason).
    - Unstarted assigned units are cancelled; clothiers notified.
    - Total recalculates; overpayment → saldo a favor (refund or apply). No automatic fee — an adjustment line with reason if the admin wants one.
18. **Cancellation:** manual with reason; blocked while any units are approved; recorded payments must be acknowledged (refund policy).

### 3.5 Money

19. **All money goes through the till.** Pedido payments and Vender prenda sales belong to a business day, with method, amount, who recorded it and the real received time.
20. **After-hours:** pedido payments and Vender prenda sales taken while no day is open are allowed. They keep the real received time, attach to the **next business day** when it opens, carry the note "Pagado fuera de horario el {fecha} a las {hora}", and appear as their own line in that day's close summary. **Service tickets are only charged inside an open business day.**
21. **Balance** = total − payments, always computed. Saldo a favor is tracked until refunded or applied.
22. **Caja de hoy and the close summary** split income into **Servicios · Pedidos · Prendas**, plus totals per payment method and the after-hours line.

### 3.6 Stock

23. **Ledger per variant + size + colour.** Available = sum of movements:
    - `+` approved units of inventory pedidos (automatic, at approval)
    - `+/−` admin adjustments with reason ("conteo inicial", "dañada", "devolución")
    - `−` Vender prenda sales
    - `+/−` restructure moves and scrap write-offs
24. **Vender prenda** shows availability per size/colour and **blocks overselling**; an admin-only override records a negative adjustment with reason.
25. Client pedido garments never enter general stock.

### 3.7 Business day dependency

| Needs an open business day                                   | Works any time                                    |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Clothier reports and closings; unit approvals; settling pay  | Creating and editing pedidos, prices, specs       |
| Service ticket checkout                                      | Assigning, claiming, releasing                    |
| _(Pedido payments and garment sales: after-hours rule, 3.5)_ | Deliveries; stock adjustments; viewing; Analítica |

When an action needs the day and it is closed, the UI says so ("Abre el día para…") and offers the open-day action to whoever may use it. **Nothing is ever skipped silently.**

### 3.8 Roles

| Action                                                    | Admin | Cajero | Secretaria            | Confeccionista |
| --------------------------------------------------------- | ----- | ------ | --------------------- | -------------- |
| Create / edit pedidos                                     | ✓     | ✓      | ✓                     | —              |
| See a pedido's total and balance                          | ✓     | ✓      | ✓                     | —              |
| Record pedido payments                                    | ✓     | ✓      | Setting (default off) | —              |
| Edit line prices                                          | ✓     | ✓      | —                     | —              |
| Assign, review units, approve closings, record deliveries | ✓     | ✓      | ✓                     | —              |
| Approve restructures                                      | ✓     | —      | —                     | —              |
| Adjust stock / oversell override                          | ✓     | —      | —                     | —              |
| Vender prenda                                             | ✓     | ✓      | —                     | —              |
| Claim, release, report units, close own day               | —     | —      | —                     | ✓              |
| Actividad, Analítica                                      | ✓     | —      | —                     | —              |

New settings (Configuración): **secretary can record payments** (off), **clothier claim limit** (units), **pay for scrapped units** (off).

### 3.9 Activity log

26. One general `activity_log` replaces `catalog_audit_log`. Each entry: actor (user + role), time, business day, action type, entity type + id, Spanish summary, before/after JSON, reason. **Written in the same transaction as the action; immutable** (no edit/delete for anyone).
27. **Coverage:** money (checkouts, payments, price edits, ticket reopens, saldo a favor/refunds, settlements); production (assignments, claims, releases, reports, reviews, closings, rate changes, restructures); stock (adjustments, sales, write-offs); pedidos (create, edit, deliver, cancel); business day (open, close, reopen); employees, settings, catalog; **auth** (sign-in, sign-out, failed attempts, device).
28. **Actividad** (admin): timeline filtered by person, action type, date range, pedido/client. **Historial** tab on each pedido, ticket, client and employee (cashier/secretary see the history of the record they are working on).

### 3.10 Screens

| Screen                   | Who                             | Content                                                                                                                                                  |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pedidos**              | Admin, Cajero, Secretaria       | List (destino, estado, grandes 10+, atrasados). Detail: lines × sizes with assigned · approved · delivered, payments and balance, deliveries, Historial. |
| **Producción**           | Admin, Secretaria (Cajero opt.) | Review queue grouped by clothier (approve / return / scrap), closings to approve, assignment board by clothier.                                          |
| **Inventario**           | Admin (manage), Cajero (view)   | Stock per garment × size × colour, movement history, adjustments.                                                                                        |
| **Vender prenda**        | Admin, Cajero                   | Sells from stock only; in the till.                                                                                                                      |
| **Mi trabajo** (phone)   | Confeccionista                  | Corrections first, assigned work by delivery date, Disponibles, report units, **Cerrar mi jornada**.                                                     |
| **Actividad**            | Admin                           | Activity log timeline.                                                                                                                                   |
| **Caja de hoy / Cierre** | Admin, Cajero                   | Income by source and method, after-hours line, clothiers-without-closing warning.                                                                        |
| **Analítica** (extended) | Admin                           | See 3.11.                                                                                                                                                |

"Productos" and "Pedidos grandes" leave the navigation.

### 3.11 Analítica additions

Same day/week/month periods with previous-period comparison and CSV export, admin-only:

1. **Ingresos por fuente:** Servicios · Pedidos · Prendas; by payment method.
2. **Pedidos:** count and units; **cuentas por cobrar** (outstanding balances, oldest first); on-time delivery %; overdue; average order-to-delivery time; saldo a favor owed.
3. **Producción:** approved units per clothier; return rate per clothier and garment type; average assignment-to-approval time; **labour cost vs. price per garment type** (rough margin).
4. **Inventario:** units on hand and value at selling price; units sold; slow movers (60+ days untouched); write-offs with reasons.

## 4. Data model (sketch)

Names follow the domain-terms table in `CLAUDE.md`; money is `bigint` pesos.

```text
garment_sizes            id, label, sort_order, is_active
garment_colors           id, label, hex (nullable), is_active

pedidos                  id, number (seq), client_id (nullable), destination ('client'|'inventory'),
                         estimated_delivery_at, notes, cancellation_reason, cancelled_at,
                         created_by, version, created_at, updated_at
pedido_lines             id, pedido_id, kind ('garment'|'adjustment'), cloth_piece_variant_id (nullable),
                         color_id (nullable), color_other, style, instructions,
                         unit_price (snapshot), price_reason (nullable), amount (adjustment lines)
pedido_line_cells        id, line_id, size_id (nullable), size_other, quantity

assignments              id, cell_id, employee_id, quantity, piece_rate (snapshot), rate_reason,
                         source ('assigned'|'claimed'), created_by, version
unit_reports             id, assignment_id, quantity, business_day_id, kind ('report'|'rework'), reported_by
unit_reviews             id, assignment_id, approved, returned, scrapped, reason, business_day_id, reviewed_by
clothier_day_closings    id, employee_id, business_day_id, submitted_at, approved_by, approved_at, correction_reason
deliveries               id, pedido_id, delivered_at, delivered_by, note
delivery_cells           id, delivery_id, cell_id, quantity

pedido_payments          id, pedido_id, amount (signed: refunds negative), method, business_day_id (nullable until attached),
                         received_at, after_hours, recorded_by, note
cloth_sales (+)          business_day_id, received_at, after_hours, size_id, color_id
stock_movements          id, cloth_piece_variant_id, size_id, color_id, quantity (signed),
                         kind ('production'|'adjustment'|'sale'|'scrap'|'restructure'), ref_type, ref_id, reason, created_by, created_at
restructures             id, pedido_id, requested_by, approved_by, summary (jsonb), created_at

activity_log             id, actor_user_id, actor_role, business_day_id, action, entity_type, entity_id,
                         summary, before (jsonb), after (jsonb), reason, ip, user_agent, created_at
```

Derived, never stored: pedido status, balance, saldo a favor, per-cell assigned/approved/delivered, stock on hand.

Dropped after the new model is live: `craftables`, `craftable_pieces`, `cloth_piece_assignments`, `production_logs`, `large_orders`, `order_items`, `large_order_payments`, `catalog_audit_log` (folded into `activity_log`).

## 5. Out of scope (for now)

- Notifying clients by WhatsApp/SMS when a pedido is Listo (the status exists; the channel comes later).
- Fabric / raw-material inventory.
- Client-facing order tracking page.
