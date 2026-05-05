# Stabilization Roadmap

> Bug fixes, UX polish, and gap-closes after MVP launch. Every task is atomic (single PR). One task = one responsibility = one commit.

---

## Phase 1: Post-Launch Stabilization

**Started:** 2026-04-24
**Status:** Complete — all tasks done.

---

### Task 1.1: Remove hardcoded disabled on cashier action buttons

- **Description:** "Abrir día", "Cerrar día", and "Reabrir día" buttons on the cashier dashboard ship with `disabled` hardcoded regardless of actual state. Replace with derived state from RBAC and business-day status.
- **Acceptance Criteria:**
  - No `disabled` attribute is hardcoded in cashier dashboard buttons.
  - Each disable reason is computed from `useTransition`, RBAC, or business-day state.
  - `aria-disabled` + tooltip added when a button is blocked by a business rule.
- **Testing Steps:**
  - Sign in as `cashier_admin` with no open day → "Abrir día" is enabled.
  - Sign in as `secretary` → "Abrir día" is hidden or disabled with a tooltip.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.2: Remove hardcoded disabled on stylist/clothier home buttons

- **Description:** Stylist home and clothier home contain decorative buttons that never enable. Replace with state-driven gating or remove if non-functional.
- **Acceptance Criteria:**
  - No purely decorative disabled buttons remain on either screen.
- **Testing Steps:**
  - Visit stylist home → every visible button either works or is removed.
  - Visit clothier home → same check.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.3: Detect unpaid past business days in payroll

- **Description:** Add a server query `getUnpaidPastBusinessDays(employeeId)` in `packages/db/src/queries/payroll.ts` that returns closed business days with no matching payout row, excluding the currently open day.
- **Acceptance Criteria:**
  - Query returns only closed `business_days` with no matching payout row.
  - Excludes the current open day.
- **Testing Steps:**
  - Unit test with seeded data: 3 closed days, 1 paid → query returns 2.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.4: Block payout creation when prior days are unpaid

- **Description:** `recordPayout` server action must reject if the employee has any unpaid past closed days. Calls `getUnpaidPastBusinessDays` before insert; returns `CONFLICT` if non-empty and the target day is the current open day.
- **Acceptance Criteria:**
  - Cashier cannot pay today if yesterday is unpaid.
  - Error returned with `CONFLICT` code and message "Hay días anteriores sin pagar".
- **Testing Steps:**
  - E2E: seed an unpaid past day, attempt today's payout → expect rejection toast.
- **Dependencies:** Task 1.3.
- **Status:** Done

---

### Task 1.5: Default payroll form to current business day

- **Description:** The payroll record form should auto-select today's `business_day_id` instead of requiring a manual pick. Fetch the current open business day in the page server component and pass it as the form's initial state.
- **Acceptance Criteria:**
  - Opening the payroll form shows today's date pre-selected.
- **Testing Steps:**
  - Open `/admin/payroll/new` → date field equals today.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.6: Show pending payments banner on payroll dashboard

- **Description:** Add a `PendingPayoutsBanner` component at the top of the payroll dashboard listing employees with unpaid past business days, each row linking to that employee's payout flow.
- **Acceptance Criteria:**
  - Banner appears only when at least one unpaid past day exists.
  - Each row links to that employee's payout flow.
- **Testing Steps:**
  - Seed an unpaid day → banner shows.
  - All days paid → banner hidden.
- **Dependencies:** Task 1.3.
- **Status:** Done

---

### Task 1.7: Show per-day payout status grid

- **Description:** Add a `PayoutStatusGrid` component on the per-employee payroll detail page showing each day's status (paid / pending / not yet closed) for the last 14 days, color-coded via `StatusBadge`.
- **Acceptance Criteria:**
  - Grid renders for the last 14 days.
  - Each cell is color-coded by status.
- **Testing Steps:**
  - Visit employee payroll page → grid visible, all days accounted for.
- **Dependencies:** Task 1.3.
- **Status:** Done

---

### Task 1.8: Fix sidebar active state — only one route highlighted

- **Description:** The `isActive` logic in `app-shell.tsx` uses `startsWith`, so `/admin` highlights on `/admin/payroll`. Change to longest-match algorithm so exactly one nav item carries `data-active="true"` per page.
- **Acceptance Criteria:**
  - Exactly one nav item is active per page.
- **Testing Steps:**
  - Navigate to `/admin/payroll` → only "Payroll" highlighted, not "Dashboard".
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.9: Group nav into logical sections

- **Description:** Update `nav-config.ts` to support nested groups with `{ label, items: NavItem[] }` and render `SidebarGroupLabel` per section. Cashier_admin sees: Dashboard / Operaciones / Personas / Catálogo / Analítica.
- **Acceptance Criteria:**
  - Each role's sidebar has role-specific section groups with separators.
- **Testing Steps:**
  - Inspect sidebar per role → sections visible with separators.
- **Dependencies:** Task 1.8.
- **Status:** Done

---

### Task 1.10: Remove "Disponible en Fase X" placeholders

- **Description:** Several screens/items show "Disponible en Fase X" copy that is no longer meaningful post-MVP. Grep and remove or replace every occurrence.
- **Acceptance Criteria:**
  - `grep -rn "Disponible en Fase" apps/web/src` returns zero matches.
  - Each former placeholder is hidden, disabled with tooltip, or removed.
- **Testing Steps:**
  - Run the grep command → no matches.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.11: Remove "Configuración" sidebar entry until implemented

- **Description:** Sidebar shows "Configuración" but no functioning page exists. Remove from `nav-config.ts` for all roles.
- **Acceptance Criteria:**
  - "Configuración" no longer appears in any sidebar.
- **Testing Steps:**
  - Sign in as each role → no "Configuración" item visible.
- **Dependencies:** Task 1.9.
- **Status:** Done

---

### Task 1.12: Expand user menu with profile and logout entries

- **Description:** User menu currently has theme + settings link. Add: header with name + role badge, Profile, Theme toggle, Logout. Wire Logout to existing `handleLogout`.
- **Acceptance Criteria:**
  - Menu shows: name + role · Profile · Theme toggle · Logout.
- **Testing Steps:**
  - Click avatar → all four sections render. Logout signs out.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.13: Remove fixed-position logout button from sidebar footer

- **Description:** Logout lives in both the sidebar footer and (after Task 1.12) the user menu. Remove the footer duplicate; keep mobile pill version.
- **Acceptance Criteria:**
  - Sidebar footer shows avatar + bell only.
- **Testing Steps:**
  - Visual check — sidebar footer has two icons, no logout button.
- **Dependencies:** Task 1.12.
- **Status:** Done

---

### Task 1.14: Build Large Order ticket flow — product selector

- **Description:** Add a `ProductSelector` component reading from the `cloth_pieces` catalog, allowing search by SKU or name. Selecting a piece fills product and unit price on the large-order line item.
- **Acceptance Criteria:**
  - Selector renders all active `cloth_pieces`.
  - Selecting a piece fills product and unit price fields.
- **Testing Steps:**
  - Open new large order → search "camisa" → list filtered → click → row populated.
- **Dependencies:** T060 (link cloth batches to large orders).
- **Status:** Done

---

### Task 1.15: Large Order — quantity input with auto price

- **Description:** Add an integer-only `QuantityInput` (min 1) to large order line items. On change, recompute `total = unit_price × qty` client-side for display and persist via server action.
- **Acceptance Criteria:**
  - Changing qty updates the displayed total in real time.
  - Server stores qty + unit_price + total as integer pesos.
- **Testing Steps:**
  - Add row qty 3 of a $5.000 piece → total shows $15.000. DB shows `total = 15000`.
- **Dependencies:** Task 1.14.
- **Status:** Done

---

### Task 1.16: Large Order — manual price override with reason

- **Description:** Add an opt-in "Precio manual" checkbox per line item. When checked, unit_price becomes editable and a required "Motivo" textarea appears. Gate to `cashier_admin` only. Persist `price_override_reason`.
- **Acceptance Criteria:**
  - Reason field is required when override is on; form blocked otherwise.
  - Override checkbox is invisible to non-admin roles.
- **Testing Steps:**
  - As `secretary`: override checkbox not visible.
  - As admin: empty reason → form invalid.
- **Dependencies:** Task 1.15.
- **Status:** Done

---

### Task 1.17: Cashier dashboard — promote "Abrir día" as primary CTA

- **Description:** Restructure the dashboard top section into a hero card with a primary "Abrir día" button. Show "Reabrir día" only when the current day is `closed`.
- **Acceptance Criteria:**
  - Open state: only "Abrir día" visible.
  - Closed state: "Reabrir día" visible as secondary.
- **Testing Steps:**
  - Toggle `business_day` status in DB → UI reflects correct CTA.
- **Dependencies:** Task 1.1.
- **Status:** Done

---

### Task 1.18: Cashier dashboard — improve financial clarity

- **Description:** Replace inline revenue/payout text with `StatCard` editorial components showing: Ingresos hoy, Pagos hoy, Tickets abiertos, Tickets cerrados.
- **Acceptance Criteria:**
  - Four stat cards above the day-action area.
  - Each shows current value; optionally yesterday's delta.
- **Testing Steps:**
  - Visual: cards align 2×2 mobile / 4×1 desktop.
- **Dependencies:** Task 1.17.
- **Status:** Done

---

### Task 1.19: Cashier dashboard — empty state when day not opened

- **Description:** Before "Abrir día" is clicked, render `<EmptyState>` with icon + "Día sin abrir" + primary action instead of zeros.
- **Acceptance Criteria:**
  - Empty state replaces stat cards before the day is opened.
- **Testing Steps:**
  - Fresh day → empty state shown. After "Abrir día" → stats appear.
- **Dependencies:** Task 1.18.
- **Status:** Done

---

### Task 1.20: Analytics — add page container max-width

- **Description:** Analytics charts stretch edge-to-edge on wide monitors. Wrap the analytics page content in `<div className="px-6 py-4 max-w-7xl mx-auto">`.
- **Acceptance Criteria:**
  - Content centered with max-width 7xl on screens wider than 1280px.
- **Testing Steps:**
  - Open `/admin/analytics` on a 1920px monitor → content centered.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.21: Analytics — empty state redesign

- **Description:** When no `business_days` have been closed, analytics shows broken charts. Detect empty dataset server-side and render `EmptyState` with explanatory message and link to "Abrir día".
- **Acceptance Criteria:**
  - Zero-data state renders empty state, not blank charts.
- **Testing Steps:**
  - Fresh DB → analytics page shows empty state.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.22: Analytics — state-aware messaging per range

- **Description:** Per range (today, week, month), compute "X de Y días tienen datos". Show an informational banner when coverage is less than 50%.
- **Acceptance Criteria:**
  - Banner shown only when sparse data coverage exists.
  - Copy reads naturally in Spanish.
- **Testing Steps:**
  - Seed 2 days in last 7 → banner appears. Seed 7/7 → banner hidden.
- **Dependencies:** Task 1.21.
- **Status:** Done

---

### Task 1.23: Analytics — disable CSV export when no data

- **Description:** CSV export button is always enabled even when data is empty. Compute `hasData` server-side, pass to the client button, and disable it with tooltip "Sin datos para exportar" when empty.
- **Acceptance Criteria:**
  - Empty dataset → button disabled with tooltip.
  - Non-empty → button enabled.
- **Testing Steps:**
  - Empty: button disabled. Non-empty: enabled.
- **Dependencies:** Task 1.21.
- **Status:** Done

---

### Task 1.24: Analytics — fix layout spacing on stat blocks

- **Description:** Stat blocks sit too close to charts. Add `space-y-8` between stat row and charts; `gap-4` inside stat grid.
- **Acceptance Criteria:**
  - Visible breathing room between stat row and charts sections.
- **Testing Steps:**
  - Visual check on `/admin/analytics`.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.25: Analytics — fix month-over-month delta calculation

- **Description:** MoM delta divides by zero when the previous month is empty, returning NaN%. Return `null` when previous equals zero; render "—" in the UI.
- **Acceptance Criteria:**
  - No "NaN" appears in the analytics UI under any data state.
- **Testing Steps:**
  - Seed only current month → MoM cells show "—".
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.26: Mobile bottom nav — fix active route detection

- **Description:** Stylist/clothier mobile bottom tabs use the same buggy `startsWith` matcher as the sidebar. Apply the single-active-item rule to `BottomTabLink`.
- **Acceptance Criteria:**
  - Only one tab is active at a time on mobile.
- **Testing Steps:**
  - Navigate stylist tabs → exactly one active.
- **Dependencies:** Task 1.8.
- **Status:** Done

---

### Task 1.27: Toast notifications — wire Sentry breadcrumbs on error toast

- **Description:** Error toasts currently log nothing. In the toast helper, push a Sentry breadcrumb with code + message on every error variant.
- **Acceptance Criteria:**
  - Every error toast produces a Sentry breadcrumb.
- **Testing Steps:**
  - Trigger a validation error → check Sentry session has breadcrumb.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.28: Notification bell — keyboard navigation inside panel

- **Description:** Notification panel lacks Tab/Arrow navigation between items. Add `role="menu"` + `aria-orientation="vertical"` + arrow-key handler.
- **Acceptance Criteria:**
  - Tab into bell → Enter opens panel → ArrowDown moves through items → Escape closes.
- **Testing Steps:**
  - Keyboard-only walkthrough of the notification panel.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.29: Notification bell — mark-read on link click is racy

- **Description:** Clicking a notification link triggers `markRead` then navigates; navigation may cancel the request. Use `navigator.sendBeacon` or await `markRead` before `router.push`.
- **Acceptance Criteria:**
  - Mark-read always succeeds before navigation.
- **Testing Steps:**
  - Click notification → reload → notification is marked read.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.30: Sidebar collapse persistence

- **Description:** Sidebar collapse state resets on reload. Verify the shadcn sidebar cookie (`sidebar:state`) is correctly written on toggle and read by the server component on the next load.
- **Acceptance Criteria:**
  - Reload preserves collapsed/expanded state per user.
- **Testing Steps:**
  - Collapse sidebar → reload → still collapsed.
- **Dependencies:** None.
- **Status:** Done

---

### Task 1.31: Build /admin/roadmap internal tracking page

- **Description:** Internal page reads `docs/stabilization-phase.md` server-side, parses tasks via a shared parser, and renders all tasks with status, type, ACs, and progress percentage using shadcn primitives.
- **Acceptance Criteria:**
  - `/admin/roadmap` renders all tasks with status + counts + progress %.
- **Testing Steps:**
  - Sign in as `cashier_admin` → `/admin/roadmap` renders.
- **Dependencies:** Task 1.33.
- **Status:** Done

---

### Task 1.32: Build /roadmap public progress page

- **Description:** Client-safe progress page accessible without auth. Reuses the shared parser; maps titles via `simplifyTitle` to hide infra/financial details.
- **Acceptance Criteria:**
  - `/roadmap` accessible logged-out, shows simplified list, hides infra/financial detail.
- **Testing Steps:**
  - Open `/roadmap` in incognito → page renders.
- **Dependencies:** Task 1.33.
- **Status:** Done

---

### Task 1.33: Build stabilization markdown parser

- **Description:** Server-side utility `apps/web/src/lib/stabilization.ts` exporting `getStabilizationTasks(): Task[]` that reads and parses `docs/stabilization-phase.md` into typed tasks.
- **Acceptance Criteria:**
  - Returns array of `{ title, status, type, scope, steps, acceptance, test }`.
- **Testing Steps:**
  - Unit test: feed fixture content → assert 3 tasks parsed correctly.
- **Dependencies:** None.
- **Status:** Done

---

## Phase 2: UX Polish and Missing Gaps

**Started:** 2026-04-25
**Status:** In progress — most tasks done; two pending.

---

### Task 2.1: Responsive layout pass — page-size awareness

- **Description:** Tables overflow horizontally on mobile, forms run full-width on desktop, the cashier card grid has no minimum card width, and dialog widths are not capped. Apply consistent responsive rules across every primary list/form screen.
- **Acceptance Criteria:**
  - All screens pass `wireframes.md` breakpoints (mobile <768px, tablet 768–1024px, desktop >1024px).
  - No horizontal scroll on tables at 360px width.
  - All Dialog instances use one of four standardised widths: `max-w-sm` (confirmation), `max-w-md` (form), `max-w-lg` (complex form), `max-w-2xl` (detail).
  - Page padding: `p-4` mobile, `p-6` tablet, `p-8` desktop.
- **Testing Steps:**
  - Open employee list, client list, ticket history at 360px → no horizontal scroll, content reflows to cards.
  - Cashier dashboard at 480px → single column. At 768px → configured grid.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.2: Catalog variant accordion with mutual exclusion

- **Description:** Service variant rows in catalog admin all expand simultaneously. Replace the flat variant table with a controlled accordion where only one item is open at a time. Opening a dirty form prompts `ConfirmationDialog` before switching.
- **Acceptance Criteria:**
  - Only one variant row is open at a time.
  - Closing a dirty form prompts the user before discarding changes.
  - Mobile: accordion items render as full-width cards.
- **Testing Steps:**
  - Open variant A in edit mode → click variant B → A closes automatically.
  - Modify a field in variant A → click variant B → confirmation dialog appears.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.3: Standardise destructive mutations behind Dialogs

- **Description:** Employee deactivation, client archival, business-day close, service/variant deletion, payout recording, and batch-piece approval all fire inline without confirmation. Wrap each in `ConfirmationDialog`. Convert business-day close to a Dialog showing open-ticket summary. Add `warning` prop to `ConfirmationDialog` for impact messages.
- **Acceptance Criteria:**
  - All listed destructive actions open a Dialog before mutating.
  - Each Dialog includes the entity name in the prompt (e.g. "¿Desactivar a Juan Pérez?").
  - Variant/service deletion shows an impact warning when open tickets reference the entity.
- **Testing Steps:**
  - Click "Eliminar variante" on a variant referenced by an open ticket → impact warning shown.
  - Press Escape inside any new Dialog → closes without mutating.
- **Dependencies:** Task 2.1.
- **Status:** Done

---

### Task 2.4: Audit and apply EmptyState component everywhere

- **Description:** Empty states are inconsistent across employee list, client list, ticket history, catalog, closed tickets, appointment list, batch list, and notification dropdown. Replace all ad-hoc empty-message strings with the `EmptyState` component.
- **Acceptance Criteria:**
  - Every list/table view uses `EmptyState` for the zero-records case.
  - All usages include an icon and title at minimum.
  - Notification dropdown empty state uses `InboxIcon` with a localised description.
- **Testing Steps:**
  - Visit each listed screen with no data → every one renders the same `EmptyState` shape.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.5: Replace ad-hoc toasts with a single Sonner provider

- **Description:** Mutation feedback is inconsistent — some screens use custom inline toast state, some show nothing. Install Sonner, mount `<Toaster />` once in root layout, and replace all ad-hoc toast state with `toast.success()` / `toast.error()` / `toast.info()`. Duration: 4s success, 6s error.
- **Acceptance Criteria:**
  - A single Sonner provider serves the whole app — no other toast libraries or in-component toast state.
  - Every server-action result branch calls a Sonner toast.
  - Localised copy for four icon types in `es.json` and `en.json`.
- **Testing Steps:**
  - Trigger a successful checkout → green-icon success toast for 4s.
  - Trigger a failing payout → red-icon error toast for 6s.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.6: User-facing dark mode toggle

- **Description:** The CSS token system defines dark-mode variants and `useTheme` reads OS preference. Add a `ThemeToggle` button to the app shell header wired to `setTheme("light" | "dark")` and persisted in `localStorage` under the existing `befine-theme` key.
- **Acceptance Criteria:**
  - Toggle reachable from every authenticated screen.
  - Toggling switches theme without a full page reload.
  - Refreshing keeps the chosen theme; clearing localStorage falls back to OS preference.
- **Testing Steps:**
  - From light mode: click toggle → page enters dark mode immediately, no flash on next refresh.
  - Clear `befine-theme` in DevTools → theme follows OS setting.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.7: Convert full-page forms to Dialogs (intercept routes)

- **Description:** Several create/action flows navigate to a dedicated page, breaking context. Use Next.js parallel + intercepting routes (`@modal` slot + `(.)` interception) to open them as Dialogs over the parent page. Affected routes: `/cashier/checkout`, `/secretary/appointments/new`, `/admin/batches/new`, `/secretary/batches/new`, `/large-orders/new`, `/admin/employees/new`, `/profile`.
- **Acceptance Criteria:**
  - Clicking a flow-triggering link opens a Dialog over the parent — parent URL stays in the address bar.
  - Direct URL visit (browser refresh while Dialog is open) still renders the standalone page.
  - Every Dialog has a `×` button and closes on Escape without submitting.
- **Testing Steps:**
  - Navigate to `/secretary/appointments` → click "Nueva cita" → Dialog opens, URL stays `/secretary/appointments`.
  - Refresh browser while Dialog is open → standalone page renders.
  - Open any Dialog → press Escape → Dialog closes, user returns to parent page.
- **Dependencies:** Task 2.1.
- **Status:** Done

---

### Task 2.8: Service catalog variant accordion with impact warnings

- **Description:** Variant rows in the service catalog lacked mutual exclusion and had no impact warning on deactivation. Adds controlled accordion (one open at a time), dirty-form guard, `checkVariantOpenTickets` and `checkServiceOpenTickets` server actions, and an amber warning in the deactivation dialog.
- **Acceptance Criteria:**
  - Only one variant row is expanded at a time.
  - Deactivating a variant/service with open tickets shows an amber warning in the confirmation dialog.
  - No `TrashIcon` imports remain in service-catalog (replaced by `Trash2Icon`).
- **Testing Steps:**
  - Open variant A → click variant B → A collapses.
  - Deactivate a variant referenced by an open ticket → amber warning shown.
- **Dependencies:** Task 2.2, Task 2.3.
- **Status:** Done

---

### Task 2.9: Destructive mutations behind ConfirmationDialog (batch-piece, payout, employee)

- **Description:** Batch-piece approval, payout recording, and employee deactivation fired immediately without confirmation. Wraps each in `ConfirmationDialog`. Extends the component with an optional `warning` prop (amber alert line with `AlertTriangleIcon`). Adds i18n keys.
- **Acceptance Criteria:**
  - Approving a piece, recording a payout, and deactivating an employee all require a confirmation click.
  - `ConfirmationDialog` renders the `warning` prop with `AlertTriangleIcon` in amber.
- **Testing Steps:**
  - Attempt to approve a piece → confirmation dialog shown.
  - Attempt to deactivate an employee → confirmation dialog shown.
- **Dependencies:** Task 2.3.
- **Status:** Done

---

### Task 2.10: Sidebar quick-action buttons (Cobrar / Registrar servicio)

- **Description:** "Registrar servicio" and "Cobrar" were missing from the admin/secretary sidebar. Add `SidebarMenuButton` entries in `SidebarFooter` for both actions. Mount modals outside `<Sidebar>` at `SidebarProvider` level to avoid clipping. Lazy-mount form content. Remove duplicate action buttons from the cashier page header.
- **Acceptance Criteria:**
  - Both buttons visible in expanded sidebar; icon-only with tooltip in collapsed mode.
  - Clicking either opens the correct dialog; form loads data only after opening.
  - Cashier page header no longer shows duplicate action buttons.
- **Testing Steps:**
  - Expand sidebar → both buttons visible. Collapse → icon-only + tooltip.
  - Click each button → correct dialog opens.
- **Dependencies:** Task 2.7.
- **Status:** Done

---

### Task 2.11: Icon and layout polish pass

- **Description:** Minor inconsistencies: `TrashIcon` used instead of `Trash2Icon`, submit button alignment, redundant card wrapper, trailing whitespace. Replace `TrashIcon` with `Trash2Icon` in absence-calendar, cloth-piece-catalog, create-batch-form. Fix submit button alignment. Remove redundant card wrapper from create-employee-form-page. Bump SW cache version.
- **Acceptance Criteria:**
  - No `TrashIcon` imports remain in any component (only `Trash2Icon`).
  - Submit buttons consistently aligned across forms.
- **Testing Steps:**
  - `grep -r "TrashIcon" apps/` → zero matches outside migration/archive files.
- **Dependencies:** None.
- **Status:** Done

---

### Task 2.12: Icon audit and replacement across screens

- **Description:** Several screens use no icons, wrong icons, or inconsistent sizes. Icon-only controls lack `aria-label`. Audit every surface and replace text-only or ad-hoc icons with Lucide icons. Standardise sizes: `size-4` inside buttons, `size-5` or `size-6` standalone. Add `aria-label` to every icon-only interactive element.
- **Acceptance Criteria:**
  - Every screen in the audit table uses a Lucide icon matching the target column.
  - No icon-only button/link is missing `aria-label`.
  - Imports are individual (`import { IconName } from "lucide-react"`), no barrel imports.
- **Testing Steps:**
  - Visual pass on cashier dashboard, ticket detail, secretary calendar, admin catalog, empty employee list → every interactive icon has a label or visible text.
- **Dependencies:** Task 2.11.
- **Status:** Pending

---

### Task 2.13: Annotate hardest steps in role training guides

- **Description:** Each of the four training guides (cashier_admin, secretary, stylist, clothier) lacks screenshots on its 2–3 hardest steps. Trainees cannot follow text-only instructions for non-obvious flows. Capture annotated screenshots (red outline + numbered callout) and embed them under the matching step section in each guide's markdown file.
- **Acceptance Criteria:**
  - Each role guide has at least 2 annotated screenshots on its hardest steps.
  - Screenshots use a consistent annotation style (red outline + numbered callout).
  - Image paths are relative under `docs/training/` so guides remain portable.
- **Testing Steps:**
  - Hand a guide to a staff member who has not used the system → they complete the highlighted step without asking for clarification.
- **Dependencies:** None.
- **Status:** Pending

---

## Phase 3: Craftables Migration and Enhancements

**Started:** 2026-05-04
**Status:** In progress — tasks 3.1–3.4 done; remaining tasks pending.

---

### Task 3.1: Rename batches → craftables at the database level

- **Description:** Rename `cloth_batches` → `craftables`, `batch_pieces` → `craftable_pieces`, `batch_piece_status` enum → `craftable_piece_status`, `craftable_pieces.batch_id` → `craftable_pieces.craftable_id`. Rename all FKs and indexes using the project naming convention. This task covers only the data layer — no application code changes.
- **Acceptance Criteria:**
  - Migration applies without errors on a clean database and on a database with the old tables already present.
  - Drizzle schema exports `craftables` and `craftablePieces` — no `clothBatches` or `batchPieces` exports remain.
  - All FKs and indexes use the new names (verified via `\d craftables` and `\d craftable_pieces`).
  - `turbo typecheck` passes with zero errors after the schema rename.
- **Testing Steps:**
  - Apply migration to a local Neon branch with the old schema → `\dt` shows `craftables` and `craftable_pieces`.
  - Roll back (down) → old tables restored.
- **Dependencies:** T044 (cloth_batches migration must be applied first).
- **Status:** Done

---

### Task 3.2: Add `quantity` column to `craftable_pieces`

- **Description:** Add `craftable_pieces.quantity` as `integer`, NOT NULL, default `1`, with check constraint `quantity >= 1`. Backfill existing rows to `quantity = 1` in the same migration.
- **Acceptance Criteria:**
  - Migration adds the column and backfill runs without errors.
  - Drizzle schema type for `craftablePieces` includes `quantity: number`.
  - Check constraint `quantity >= 1` enforced at the DB level.
  - `turbo typecheck` passes.
- **Testing Steps:**
  - Insert a `craftable_piece` row with `quantity = 0` → DB rejects with constraint error.
  - Insert with `quantity = 5` → row saved; query returns `quantity: 5`.
- **Dependencies:** Task 3.1.
- **Status:** Done

---

### Task 3.3: Add per-piece note columns to `craftable_pieces`

- **Description:** Add four nullable columns to `craftable_pieces`: `color varchar(80)`, `style varchar(80)`, `size varchar(40)`, `instructions text`. The top-level `craftables.notes` column remains for general batch-level notes. No backfill needed — all fields nullable.
- **Acceptance Criteria:**
  - Migration adds all four columns without errors.
  - Drizzle schema type includes `color`, `style`, `size`, `instructions` as `string | null`.
  - Existing rows unaffected (all four fields default to null).
  - `turbo typecheck` passes.
- **Testing Steps:**
  - Insert a row with `color = "rojo"`, `style = "slim"`, `size = "M"`, `instructions = "doblez exterior"` → query returns all four values.
  - Insert without any of the four fields → row saved with nulls.
- **Dependencies:** Task 3.1, Task 3.2.
- **Status:** Done

---

### Task 3.4: Add `auto_approved` flag and `source` enum to `craftables`

- **Description:** Add `source pgEnum('craftable_source', ['manual', 'large_order'])` (NOT NULL, default `'manual'`) and `auto_approved boolean` (NOT NULL, default `false`) to `craftables`. Add `large_order_id` FK to `large_orders.id` (nullable) only if it does not already exist from T060.
- **Acceptance Criteria:**
  - Migration applies cleanly; existing rows get `source = 'manual'`, `auto_approved = false`.
  - `source` uses a Drizzle `pgEnum`.
  - `large_order_id` is nullable with FK constraint to `large_orders`.
  - `turbo typecheck` passes.
- **Testing Steps:**
  - Query all existing craftables → `source = 'manual'`, `auto_approved = false` for all rows.
  - Insert a row with `source = 'large_order'`, `auto_approved = true` → succeeds.
- **Dependencies:** Task 3.1.
- **Status:** Done

---

### Task 3.5: Rename all server actions and queries from "batch" to "craftable"

- **Description:** Mechanical rename of all server actions, query functions, type definitions, and Zod schema names that reference "batch" / "batches" (cloth-batch domain only). `createBatch` → `createCraftable`, `getBatch` → `getCraftable`, `approveBatchPiece` → `approveCraftablePiece`, `BatchStatus` → `CraftableStatus`, etc. Update all import sites.
- **Acceptance Criteria:**
  - `grep -r "Batch\|batch_piece\|batchPiece\|cloth_batch" apps/ packages/ --include="*.ts" --include="*.tsx"` returns zero matches (excluding migration files).
  - `turbo typecheck` passes with zero errors.
  - `turbo test` passes — no broken test references.
- **Testing Steps:**
  - Run the grep command → zero matches.
  - `turbo typecheck` → zero errors.
  - `turbo test` → all existing tests pass.
- **Dependencies:** Task 3.1.
- **Status:** Done

---

### Task 3.6: Admin-bypass approval logic in `approveCraftablePiece`

- **Description:** When the creator of a craftable is `cashier_admin`, set `auto_approved = true` at creation time. In `markCraftablePieceDone`, check the parent craftable's `auto_approved` flag: if true, transition the piece directly to `approved`; if false, transition to `done_pending_approval` as before. Direct `approveCraftablePiece` action remains unchanged for manual approval flows.
- **Acceptance Criteria:**
  - Craftable created by `cashier_admin` → `auto_approved = true`.
  - Craftable created by `secretary` → `auto_approved = false`.
  - Clothier marks piece done on auto-approved craftable → piece status is `approved` immediately.
  - Clothier marks piece done on non-auto-approved craftable → piece status is `done_pending_approval`.
  - `stylist` calling `approveCraftablePiece` directly → returns `FORBIDDEN`.
  - Unit tests cover all four branches.
- **Testing Steps:**
  - Unit: create craftable as admin → mark piece done as clothier → assert `status = 'approved'`.
  - Unit: create craftable as secretary → mark piece done as clothier → assert `status = 'done_pending_approval'`.
  - Unit: call `approveCraftablePiece` as stylist → assert `FORBIDDEN`.
- **Dependencies:** Task 3.4, Task 3.5.
- **Status:** Pending

---

### Task 3.7: Auto-create craftables when a large order is created

- **Description:** Extend `createLargeOrder` to accept an array of `pieces` (cloth_piece_id, quantity, assigned_to_employee_id, color, style, size, instructions). After inserting the `large_orders` row, inside the same DB transaction, insert one `craftables` row and one `craftable_pieces` row per piece element. Set `source = 'large_order'`, `auto_approved` based on creator role. Guard against empty pieces array and no open business day.
- **Acceptance Criteria:**
  - Creating a large order with N pieces creates exactly N `craftables` and N `craftable_pieces` rows in one transaction.
  - All created craftables have `source = 'large_order'` and `large_order_id` set.
  - `auto_approved` reflects creator's role.
  - Transaction failure on any insert rolls back everything (zero rows persisted).
  - Empty `pieces` array → `VALIDATION_ERROR`.
  - No open business day → `NOT_FOUND` with message "No hay una jornada abierta".
- **Testing Steps:**
  - Unit: submit order with 3 pieces → assert 1 large_order + 3 craftables + 3 craftable_pieces.
  - Unit: inject failure on 2nd craftable insert → assert 0 rows persisted.
  - Unit: submit with `pieces = []` → assert `VALIDATION_ERROR`.
- **Dependencies:** Task 3.4, Task 3.3, Task 3.2.
- **Status:** Pending

---

### Task 3.8: `getCraftablesDashboard` query — today's and WIP craftables

- **Description:** Add `getCraftablesDashboard(filters?)` to `packages/db/src/queries/craftables.ts`. Returns today's craftables (current open business day) union WIP craftables (past days with at least one non-approved piece). Each row includes aggregated piece counts, `progress_pct`, `assigned_employee_names`, and `large_order_client_name`. Sort: WIP first (oldest first), then today's (newest first).
- **Acceptance Criteria:**
  - Query returns today's craftables when there are no WIP ones.
  - Returns WIP craftables from past days with non-approved pieces.
  - A fully-approved craftable from a past day does NOT appear in WIP.
  - `progress_pct` is 0 when `total_pieces = 0` (no division by zero).
  - Unit tests cover: today only, WIP only, mixed, fully approved excluded, empty.
- **Testing Steps:**
  - Unit: craftable from yesterday with 1 pending piece → appears in WIP.
  - Unit: craftable from yesterday with all pieces approved → does NOT appear in WIP.
  - Unit: craftable from today → appears in today's list.
  - Unit: empty seed → returns empty array without error.
- **Dependencies:** Task 3.1, Task 3.2.
- **Status:** Pending

---

### Task 3.9: Rename all UI components and routes from "batch" to "craftable"

- **Description:** Rename component files (`BatchList` → `CraftableList`, `BatchCard` → `CraftableCard`, etc.), route segments (`/admin/batches` → `/admin/craftables`, etc.), `<Link href>` and `router.push()` call sites, sidebar navigation labels, and all `useTranslations` keys / `es.json` / `en.json` entries (`"lote"` → `"confeccionable"`, etc.).
- **Acceptance Criteria:**
  - `grep -r "batch\|Batch\|lote\|Lote" apps/ --include="*.tsx" --include="*.ts"` returns zero matches in non-migration files.
  - All renamed routes respond with HTTP 200.
  - Old routes (`/admin/batches`, etc.) return 404 or redirect.
  - `turbo typecheck` and `turbo lint` pass.
- **Testing Steps:**
  - Visit `/admin/craftables`, `/secretary/craftables`, `/clothier/craftables` → each renders without errors.
  - Visit `/admin/batches` → 404 or redirect.
  - Check sidebar nav in all three roles → labels show "Confeccionables".
- **Dependencies:** Task 3.5.
- **Status:** Pending

---

### Task 3.10: Add `quantity` field to craftable piece form rows

- **Description:** In `CreateCraftableForm`, add a `quantity` number input (default 1, Zod: `z.number().int().min(1)`) to each piece row. Pass quantity per piece to `createCraftable`. In `CraftableDetail` and `CraftablePieceRow`, display quantity as a badge. In list/dashboard view, show total quantity as the sum of all piece quantities.
- **Acceptance Criteria:**
  - Quantity input appears on every piece row in the creation form.
  - Submitting with `quantity = 0` or non-integer is blocked with an error message.
  - Quantity persisted and displayed correctly in the detail view.
  - Total quantity in list/dashboard matches the sum of piece quantities.
  - Keyboard tab order: piece selector → quantity → assignee → notes.
- **Testing Steps:**
  - Leave quantity blank → validation error "Mínimo 1".
  - Create craftable with piece qty=3 → detail view shows "3" next to the piece name.
  - Add two pieces (qty=2 and qty=5) → list row shows total "7".
- **Dependencies:** Task 3.2, Task 3.9.
- **Status:** Pending

---

### Task 3.11: Per-piece note fields in large order and craftable forms

- **Description:** In the large order creation form, add a repeatable piece section with per-piece fields: piece-type selector, quantity, optional assignee, color (max 80), style (max 80), size (max 40), and instructions (textarea). Add "Agregar pieza" button and "Eliminar pieza" per row (blocked if only one row). Minimum 1 piece row enforced on submit. In `CraftablePieceRow`, display color/style/size/instructions as collapsible sub-row if any field is non-null.
- **Acceptance Criteria:**
  - Each piece row has all four per-piece fields.
  - Submitting with zero piece rows is blocked with an inline error.
  - All four per-piece fields are individually optional — any combination of nulls accepted.
  - Data persisted and rendered in craftable detail view.
  - "Eliminar pieza" not allowed when it is the only row.
  - Mobile layout: piece row stacks fields vertically at <768px.
- **Testing Steps:**
  - Add 2 piece rows with full per-piece data → submit → craftable detail shows all four fields per piece.
  - Remove the only piece row → submit → validation error.
  - At 360px: all four fields are visible without horizontal scroll.
- **Dependencies:** Task 3.3, Task 3.7.
- **Status:** Pending

---

### Task 3.12: Craftables dashboard — today's and WIP table view

- **Description:** Build `/admin/craftables/page.tsx` (and secretary equivalent) rendering two sections — "Hoy" (today's craftables) and "En progreso" (WIP from previous days). Each section is a `<Table>` with columns: status badge, assigned employees, quantity, linked large order, progress (`X/Y` + progress bar), and "Ver detalle" action link. Status badge color mapping: not_started → gray, in_progress → blue, pending_approval → amber, all_approved → green.
- **Acceptance Criteria:**
  - `/admin/craftables` renders both sections without errors.
  - Fully-approved craftable appears in "Hoy" but NOT in "En progreso".
  - Past-day craftable with non-approved pieces appears in "En progreso".
  - Each row's progress bar accurately reflects `approved / total`.
  - "Ver detalle" navigates to craftable detail page.
  - `EmptyState` shown per section when no matching craftables.
  - Skeleton rendered during data fetch.
  - `stylist` or `clothier` visiting `/admin/craftables` → 403 or redirect.
  - Columns collapse gracefully at <768px.
- **Testing Steps:**
  - Seed craftable for today with 1 approved + 1 pending piece → "Hoy" section, progress "1/2", `in_progress` badge.
  - Seed craftable from yesterday with all pieces approved → NOT in "En progreso".
  - Seed craftable from two days ago with 1 pending piece → in "En progreso".
  - Visit as `stylist` → 403 or redirect.
  - At 360px: table usable without horizontal scroll.
- **Dependencies:** Task 3.8, Task 3.9.
- **Status:** Pending

---

### Task 3.13: Craftable detail — display per-piece notes and quantity

- **Description:** Update `CraftableDetail` and `CraftablePieceRow` to display: quantity as `×N` badge (font-mono), and a collapsible per-piece notes section (hidden if all four fields are null). Add an "Edit piece" inline action (pencil icon) visible to `cashier_admin` and `secretary` that opens a Dialog with quantity, color, style, size, and instructions fields; submits to `updateCraftablePiece`. Clothier view is read-only.
- **Acceptance Criteria:**
  - Quantity displayed on every piece row.
  - Per-piece notes section visible and collapsible; hidden when all fields are null.
  - Admin/secretary can edit quantity and per-piece notes post-creation.
  - Clothier sees notes but cannot edit.
  - Edit action is keyboard-accessible.
  - `updateCraftablePiece` validates role (`cashier_admin` or `secretary` only).
- **Testing Steps:**
  - As admin: edit piece → change quantity to 5 and color to "azul" → row updates to `×5` and "azul".
  - As clothier: no edit icon visible on the same craftable.
  - Piece with all four fields null → per-piece notes section not shown.
  - Piece with `instructions = "doblez"` → notes section visible and expandable.
- **Dependencies:** Task 3.3, Task 3.2, Task 3.9.
- **Status:** Pending

---

### Task 3.14: Craftable status badge and progress bar design tokens

- **Description:** Add craftable status color mapping to `docs/design-system.md`. Implement `CraftableStatusBadge` component using `StatusBadge` with the defined mapping. Implement `CraftableProgressBar` (shadcn `Progress` primitive) colored by completion: <30% → red, 30–79% → amber, ≥80% → green. Apply both components everywhere in the dashboard, detail view, and clothier home screen.
- **Acceptance Criteria:**
  - `CraftableStatusBadge` renders the correct color for all four status values.
  - `CraftableProgressBar` changes color at the defined thresholds.
  - Both components used consistently across dashboard, craftable detail, and clothier home.
  - Color tokens match `docs/design-system.md` (no hardcoded hex values).
  - Both components pass `turbo lint` — `role="progressbar"` with `aria-valuenow` present.
- **Testing Steps:**
  - Render `CraftableStatusBadge` for each of the four statuses → verify colors.
  - Render `CraftableProgressBar` at 0%, 29%, 30%, 79%, 80%, 100% → verify color transitions.
  - Run axe on the dashboard page → no violations on progress bars.
- **Dependencies:** Task 3.12, Task 3.13.
- **Status:** Pending

---

### Task 3.15: Clothier home screen — replace batch list with craftables list

- **Description:** Update `/clothier` route to use renamed query and component names. Each piece row now displays: piece name, quantity (`×N` badge), and per-piece notes (one-line summary expandable on tap if any field non-null). On auto-approved craftables: after marking a piece done, show `all_approved` badge immediately (no `done_pending_approval` intermediate state). Non-auto-approved: retain existing pending-approval visual. Mobile-first at 360px.
- **Acceptance Criteria:**
  - Clothier screen shows "confeccionables" in all labels and headings.
  - Quantity shown on each piece row.
  - Per-piece notes visible when non-null, collapsed when all-null.
  - Auto-approved craftable: marking piece done → immediate green "Aprobado" badge (no amber intermediate).
  - Non-auto-approved craftable: marking piece done → amber "Pendiente aprobación" state.
  - At 360px: "Ver notas" expansion works with one tap; no horizontal overflow.
- **Testing Steps:**
  - As clothier on auto-approved craftable: mark piece done → piece badge immediately shows green "Aprobado".
  - As clothier on non-auto-approved craftable: mark piece done → amber "Pendiente aprobación" until secretary approves.
  - At 360px: piece with all four per-piece fields → tap "Ver notas" → fields expand inline.
- **Dependencies:** Task 3.9, Task 3.6, Task 3.3.
- **Status:** Pending
