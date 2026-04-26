# Stabilization Phase — Source of Truth

> Single source of truth for post-MVP stabilization tasks.
> Every fix, polish, and gap-close lives here. No grouped fixes.
> One task = one responsibility = one commit.

**Phase**: Stabilization-1
**Started**: 2026-04-24
**Tracker route**: `/admin/roadmap` (internal) · `/roadmap` (public)

---

## Task: Remove hardcoded disabled on cashier action buttons

Status: done
Type: ux

Scope:

- "Abrir día", "Cerrar día", "Reabrir día" buttons on cashier dashboard ship with `disabled` regardless of state.

Steps:

1. Audit every `<Button disabled` in `apps/web/src/app/(protected)/cashier/`.
2. Replace static `disabled={true}` with derived state (permission, loading, business rule).
3. Add `aria-disabled` + tooltip when blocked by rule.

Acceptance Criteria:

- No `disabled` attribute is hardcoded in cashier dashboard buttons.
- Each disable reason is computed from `useTransition`, RBAC, or business-day state.

Test:

- Sign in as `cashier_admin`, no open day → "Abrir día" enabled.
- Sign in as `secretary` → "Abrir día" hidden or disabled with tooltip.

---

## Task: Remove hardcoded disabled on stylist/clothier home buttons

Status: done
Type: ux

Scope:

- Stylist home + clothier home contain decorative buttons that never enable.

Steps:

1. Grep `disabled={true}` in `apps/web/src/app/(protected)/stylist/` and `clothier/`.
2. Replace with state-driven gating or remove if non-functional.

Acceptance Criteria:

- No purely decorative disabled buttons remain.

Test:

- Visit stylist home — every visible button either works or is removed.

---

## Task: Detect unpaid past business days in payroll

Status: done
Type: logic

Scope:

- Payroll UI lets cashier pay current day even if prior days are unsettled.

Steps:

1. Add server query `getUnpaidPastBusinessDays(employeeId)` in `packages/db/src/queries/payroll.ts`.
2. Returns array of `{ businessDayId, date, expectedAmount }` for closed days without payout.

Acceptance Criteria:

- Query returns only closed business_days with no matching payout row.
- Excludes the current open day.

Test:

- Unit test in `packages/db/src/queries/payroll.test.ts` with seeded data: 3 closed days, 1 paid → returns 2.

---

## Task: Block payout creation when prior days unpaid

Status: done
Type: logic

Scope:

- Server action `recordPayout` must reject if employee has unpaid prior days.

Steps:

1. In `recordPayout`, call `getUnpaidPastBusinessDays` before insert.
2. If non-empty AND target day is current → return `{ code: "CONFLICT", message: "Hay días anteriores sin pagar" }`.

Acceptance Criteria:

- Cashier cannot pay today if yesterday is unpaid.
- Error returned with `CONFLICT` code.

Test:

- E2E: seed unpaid past day, attempt today's payout → expect rejection toast.

---

## Task: Default payroll form to current business day

Status: pending
Type: ux

Scope:

- Payroll record form should auto-select today's business_day_id, not require manual pick.

Steps:

1. In payroll page server component, fetch current open business_day.
2. Pass as default in form initial state.

Acceptance Criteria:

- Opening payroll form shows today's date pre-selected.

Test:

- Manual: open `/admin/payroll/new` → date field = today.

---

## Task: Show pending payments banner on payroll dashboard

Status: pending
Type: ux

Scope:

- Payroll dashboard must surface "X días sin pagar" prominently for each employee.

Steps:

1. Add `PendingPayoutsBanner` component listing employees with unpaid past days.
2. Render at top of payroll dashboard.

Acceptance Criteria:

- Banner appears only when at least one unpaid past day exists.
- Each row links to that employee's payout flow.

Test:

- Seed unpaid day → banner shows. All paid → banner hidden.

---

## Task: Show per-day payout status grid

Status: pending
Type: ux

Scope:

- Per-employee payroll detail page should render a calendar/grid showing each day's payout status.

Steps:

1. Add `PayoutStatusGrid` component: rows = days in current settlement period, columns = paid / pending / not yet closed.
2. Use `StatusBadge`.

Acceptance Criteria:

- Grid renders for last 14 days.
- Each cell color-coded by status.

Test:

- Visit employee payroll page — grid visible, all days accounted for.

---

## Task: Fix sidebar active state — only one route highlighted

Status: pending
Type: bug

Scope:

- `isActive` in `app-shell.tsx` matches via `startsWith`, so `/admin` highlights when on `/admin/payroll`. Multiple items can show active.

Steps:

1. Change matching: parent route active only if pathname === item.href OR pathname is direct child AND no more specific item matches.
2. Compute the longest-matching nav item per render and mark only that one active.

Acceptance Criteria:

- Exactly one nav item carries `data-active="true"` per page.

Test:

- Navigate to `/admin/payroll` — only "Payroll" highlighted, not "Dashboard".

---

## Task: Group nav into Dashboard / Tickets / Appointments sections

Status: pending
Type: ux

Scope:

- Sidebar nav is a flat list. Group into logical sections per role.

Steps:

1. Update `nav-config.ts` to support nested groups: `{ label, items: NavItem[] }`.
2. Render `SidebarGroupLabel` per section.

Acceptance Criteria:

- Cashier_admin sees: Dashboard / Operaciones (tickets, appointments) / Personas (employees, payroll) / Catálogo / Analítica.
- Other roles get role-specific groupings.

Test:

- Inspect sidebar per role — sections visible with separators.

---

## Task: Remove "Disponible en Fase X" placeholders

Status: pending
Type: ux

Scope:

- Several screens/items show "Disponible en Fase X" copy that is no longer meaningful post-MVP.

Steps:

1. Grep `"Disponible en Fase"` and `"Próximamente"` across `apps/web/src`.
2. For each: remove the screen, hide the entry, or replace with disabled-with-tooltip.

Acceptance Criteria:

- Zero results for the literal phrase.
- Each former placeholder has a justified replacement (hidden / disabled / removed).

Test:

- `grep -rn "Disponible en Fase" apps/web/src` → no matches.

---

## Task: Remove "Configuración" sidebar entry until implemented

Status: pending
Type: ux

Scope:

- Sidebar shows "Configuración" but no functioning page exists.

Steps:

1. Remove from `nav-config.ts` for all roles.
2. Add follow-up task `Build Configuración page` to backlog.

Acceptance Criteria:

- "Configuración" no longer appears in any sidebar.

Test:

- Sign in as each role → no "Configuración" item visible.

---

## Task: Expand user menu with profile and logout entries

Status: pending
Type: ux

Scope:

- User menu currently has theme + settings link. Missing explicit profile, logout, role display.

Steps:

1. In `UserMenu` (`app-shell.tsx`), add: header with name + role badge, Profile, Theme, Logout.
2. Wire Logout to existing `handleLogout`.

Acceptance Criteria:

- Menu shows: name + role · Profile · Theme toggle · Logout.

Test:

- Click avatar → all four sections render. Logout signs out.

---

## Task: Remove fixed-position logout button from sidebar footer

Status: pending
Type: ux

Scope:

- Logout currently lives both in sidebar footer row and (after fix above) in user menu. Drop the footer copy.

Steps:

1. Remove `<button onClick={handleLogout}>` from sidebar footer in `app-shell.tsx`.
2. Keep mobile pill version for bottom-tab layouts.

Acceptance Criteria:

- Sidebar footer has avatar + bell only.

Test:

- Visual check — sidebar footer is two icons, no logout.

---

## Task: Build Large Order ticket flow — product selector

Status: pending
Type: logic

Scope:

- Large orders (DoWell garments) lack a way to select product + quantity. Only generic line items exist.

Steps:

1. Add `ProductSelector` component reading from `cloth_pieces` catalog.
2. Allow searching by SKU / name.

Acceptance Criteria:

- Selector renders all active cloth_pieces.
- Selecting fills product, unit price.

Test:

- Open new large order → search "camisa" → list filtered → click → row populated.

---

## Task: Large Order — quantity input with auto price

Status: pending
Type: logic

Scope:

- Quantity must drive total: `total = unit_price * qty`. No quantity field today.

Steps:

1. Add `QuantityInput` integer-only, min 1.
2. On change recompute line total client-side (display) and persist via server action.

Acceptance Criteria:

- Changing qty updates displayed total in real time.
- Server stores qty + unit_price + total in integer pesos.

Test:

- Add row qty 3 of $5.000 piece → total $15.000. DB shows `total = 15000`.

---

## Task: Large Order — manual price override with reason

Status: pending
Type: logic

Scope:

- Cashier may need to override price. Override must be opt-in and require a reason.

Steps:

1. Add checkbox "Precio manual" per line. When checked, unit_price becomes editable + textarea "Motivo" required.
2. Persist `price_override_reason`.
3. Gate to `cashier_admin` role only.

Acceptance Criteria:

- Reason field required when override on; submit blocked otherwise.
- Override invisible to non-admin roles.

Test:

- RBAC test: secretary sees no checkbox. Admin: empty reason → form invalid.

---

## Task: Cashier dashboard — promote "Abrir día" as primary CTA

Status: pending
Type: ux

Scope:

- Today's CTA hierarchy is flat. "Abrir día" must be primary, "Reabrir día" secondary and conditional.

Steps:

1. Restructure dashboard top section: hero card with primary button.
2. Show "Reabrir día" only when current day is `closed`.

Acceptance Criteria:

- Open state: only "Abrir día" visible.
- Closed state: "Reabrir día" visible as secondary.

Test:

- Toggle business_day status in DB → UI reflects correct CTA.

---

## Task: Cashier dashboard — improve financial clarity

Status: pending
Type: ux

Scope:

- Today's revenue, payouts, balance are inline text. Need clear stat cards with comparison.

Steps:

1. Use existing `StatCard` editorial component.
2. Show: Ingresos hoy, Pagos hoy, Tickets abiertos, Tickets cerrados.

Acceptance Criteria:

- Four stat cards above the day-action area.
- Each shows current value, optionally yesterday's value as delta.

Test:

- Visual: cards align in 2x2 mobile / 4x1 desktop.

---

## Task: Cashier dashboard — empty state when day not opened

Status: pending
Type: ux

Scope:

- Before "Abrir día" is clicked, dashboard shows zeros without context.

Steps:

1. Render `<EmptyState>` with icon + "Día sin abrir" + primary action.

Acceptance Criteria:

- Empty state replaces stat cards before day open.

Test:

- Fresh day → empty state. After "Abrir día" → stats appear.

---

## Task: Analytics — add page container max-width

Status: pending
Type: ux

Scope:

- Analytics charts stretch edge-to-edge on wide monitors.

Steps:

1. Wrap analytics page in `<div className="px-6 py-4 max-w-7xl mx-auto">`.

Acceptance Criteria:

- Content centered with max-width 7xl on `> 1280px`.

Test:

- Open `/admin/analytics` on 1920px monitor → content centered.

---

## Task: Analytics — empty state redesign

Status: pending
Type: ux

Scope:

- When no business_days closed yet, analytics shows broken charts.

Steps:

1. Detect empty dataset server-side.
2. Render `EmptyState` with explanatory message and link to "Abrir día".

Acceptance Criteria:

- Zero-data state renders empty state, not blank charts.

Test:

- Fresh DB → analytics page shows empty state.

---

## Task: Analytics — state-aware messaging per range

Status: pending
Type: ux

Scope:

- Different ranges (today, week, month) need tailored messaging when data is sparse.

Steps:

1. Per range, compute "X de Y días tienen datos".
2. Show informational banner if < 50% coverage.

Acceptance Criteria:

- Banner shown only when sparse.
- Reads naturally in Spanish.

Test:

- Seed 2 days in last 7 → banner appears. Seed 7/7 → banner hidden.

---

## Task: Analytics — disable CSV export when no data

Status: pending
Type: ux

Scope:

- CSV button is always enabled, even when data is empty.

Steps:

1. Compute `hasData` server-side, pass to client export button.
2. Disable + tooltip "Sin datos para exportar".

Acceptance Criteria:

- Empty dataset → button disabled with tooltip.

Test:

- Empty: button disabled. Non-empty: enabled.

---

## Task: Analytics — fix layout spacing on stat blocks

Status: pending
Type: ux

Scope:

- Stat blocks sit too close to charts; visual hierarchy unclear.

Steps:

1. Add `space-y-8` between stat row and charts.
2. Add `gap-4` inside stat grid.

Acceptance Criteria:

- Visible breathing room between sections.

Test:

- Visual check.

---

## Task: Analytics — fix month-over-month delta calculation

Status: pending
Type: bug

Scope:

- MoM delta currently divides by zero when previous month empty → returns NaN%.

Steps:

1. In MoM helper, return `null` when previous = 0.
2. UI renders "—" instead of "NaN%".

Acceptance Criteria:

- No "NaN" in analytics UI under any data state.

Test:

- Seed only current month → MoM cells show "—".

---

## Task: Mobile bottom nav — fix active route detection

Status: pending
Type: bug

Scope:

- Stylist/clothier mobile bottom tabs use same buggy `startsWith` matcher.

Steps:

1. Apply same single-active rule to `BottomTabLink`.

Acceptance Criteria:

- Only one tab is active at a time on mobile.

Test:

- Navigate stylist tabs → exactly one active.

---

## Task: Toast notifications — wire Sentry breadcrumbs on error toast

Status: pending
Type: infra

Scope:

- Error toasts currently log nothing. Audit trail thin.

Steps:

1. In toast helper, on error variant, push Sentry breadcrumb with code + message.

Acceptance Criteria:

- Every error toast produces a Sentry breadcrumb.

Test:

- Trigger validation error → check Sentry session has breadcrumb.

---

## Task: Notification bell — keyboard navigation inside panel

Status: pending
Type: ux

Scope:

- Panel lacks Tab/Arrow navigation between items; only mouse works.

Steps:

1. Add `role="menu"` + `aria-orientation="vertical"` + arrow-key handler.

Acceptance Criteria:

- Tab into bell, Enter opens, ArrowDown moves through items, Escape closes.

Test:

- Keyboard-only walkthrough.

---

## Task: Notification bell — mark-read on link click is racy

Status: pending
Type: bug

Scope:

- Clicking a notification link triggers `markRead` then navigates; navigation may cancel the request.

Steps:

1. Use `navigator.sendBeacon` or await markRead before `router.push`.

Acceptance Criteria:

- Mark-read always succeeds before navigation.

Test:

- Click notification → reload → it is marked read.

---

## Task: Sidebar collapse persistence

Status: pending
Type: ux

Scope:

- Sidebar collapse state resets on reload.

Steps:

1. Persist `state` to cookie on toggle (already wired via shadcn sidebar) — verify cookie name + read on server.

Acceptance Criteria:

- Reload preserves collapsed/expanded state per user.

Test:

- Collapse, reload, still collapsed.

---

## Task: Build /admin/roadmap internal tracking page

Status: done
Type: infra

Scope:

- Internal page renders full task list from this file with status, type, ACs.

Steps:

1. Read `docs/stabilization-phase.md` server-side.
2. Parse tasks via shared parser.
3. Render with shadcn primitives.

Acceptance Criteria:

- `/admin/roadmap` renders all tasks with status + counts + progress %.

Test:

- Sign in as `cashier_admin` → /admin/roadmap renders.

---

## Task: Build /roadmap public progress page

Status: done
Type: infra

Scope:

- Client-safe progress page with simplified task titles.

Steps:

1. Reuse parser; map titles via `simplifyTitle`.
2. No auth.

Acceptance Criteria:

- `/roadmap` accessible logged-out, shows simplified list, hides infra/financial detail.

Test:

- Open `/roadmap` in incognito → page renders.

---

## Task: Build stabilization markdown parser

Status: done
Type: infra

Scope:

- Server-side util to parse this file into typed tasks.

Steps:

1. Module `apps/web/src/lib/stabilization.ts`.
2. Export `getStabilizationTasks(): Task[]` reading from `docs/stabilization-phase.md`.

Acceptance Criteria:

- Returns array of `{ title, status, type, scope, steps, acceptance, test }`.

Test:

- Unit: feeds fixture content, asserts 3 tasks parsed.
