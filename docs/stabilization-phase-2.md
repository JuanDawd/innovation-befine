# Stabilization Phase 2 — Source of Truth

> Second stabilization wave. Same time frame as Stabilization-1 but tracked as
> a separate phase. One task = one responsibility = one commit.

**Phase**: Stabilization-2
**Started**: 2026-04-25
**Tracker route**: `/admin/roadmap` (internal) · `/roadmap` (public)

---

## Task: Annotate hardest steps in role training guides

Status: pending
Type: ux

Scope:

- Each of the four training guides (cashier_admin, secretary, stylist, clothier) lacks screenshots on its 2–3 hardest steps. Trainees cannot follow text-only instructions for non-obvious flows.

Steps:

1. Identify the 2–3 hardest steps in each role's guide where staff have asked questions during dry-runs.
2. Capture annotated screenshots (callouts on the relevant button or field).
3. Embed under the matching step section in each guide markdown file.

Acceptance Criteria:

- Each role guide has at least 2 annotated screenshots on its hardest steps.
- Screenshots use a consistent annotation style (red outline + numbered callout).
- Image paths are relative under `docs/training/` so the guides remain portable.

Test:

- Hand a guide to a staff member who has not used the system; they complete the highlighted step without asking for clarification.

---

## Task: Icon audit and replacement across screens

Status: pending
Type: ux

Scope:

- Several screens use no icons, wrong icons, or inconsistent sizes. Icon-only controls lack `aria-label`. Affects nav sidebar, cashier ticket cards, action buttons, empty states, toast notifications, form field errors, loading spinners, and the business-day open/closed badge.

Steps:

1. Audit each surface against the screen / target table from `docs/roadmap-post-mvp.md` (1.1).
2. Replace text-only or ad-hoc icons with Lucide icons (no heroicons, react-icons, or fontawesome).
3. Standardise sizes: `size-4` inside buttons, `size-5` or `size-6` standalone.
4. Add `aria-label` to every icon-only interactive element.

Acceptance Criteria:

- Every screen in the audit table uses a Lucide icon matching the target column.
- No icon-only button/link is missing `aria-label`.
- Imports are individual (`import { IconName } from "lucide-react"`), no barrel imports.

Test:

- Visual pass on cashier dashboard, ticket detail, secretary calendar, admin catalog, empty employee list — every interactive icon has a label or visible text.

---

## Task: Responsive layout pass — page-size awareness

Status: pending
Type: ux

Scope:

- Tables overflow horizontally on mobile, forms run full-width on desktop, the cashier card grid has no minimum card width, and dialog widths are not capped. Affects every primary list / form screen.

Steps:

1. For data tables (employee list, client list, ticket history): switch to a card-per-row layout below `768px`.
2. For forms (employee creation, catalog edit): wrap in `max-w-lg mx-auto` on desktop, full-width on mobile.
3. Cashier dashboard grid: add `min-w-[280px]` per card; collapse to single column below `480px`.
4. Standardise Dialog widths: `max-w-sm` (confirmation), `max-w-md` (form), `max-w-lg` (complex form), `max-w-2xl` (detail); always `w-full`.
5. Page padding scale: `p-4` mobile, `p-6` tablet, `p-8` desktop.
6. Section headings: `text-xl` mobile, `text-2xl` desktop.

Acceptance Criteria:

- All screens in the audit pass `wireframes.md` breakpoints (mobile <768, tablet 768–1024, desktop >1024).
- No horizontal scroll on tables at 360px width.
- All Dialog instances use one of the four standardised widths.

Test:

- Open employee list, client list, ticket history at 360px width — no horizontal scroll, content reflows to cards.
- Cashier dashboard at 480px shows single column; at 768px shows the configured grid.

---

## Task: Catalog variant accordion with mutual exclusion

Status: pending
Type: ux

Scope:

- Service variant rows in catalog admin all expand inline simultaneously, causing visual clutter and loss of focus context. Editing variant A and variant B can be open at the same time.

Steps:

1. Replace the flat variant table with a controlled accordion (Base UI `Collapsible` or a state-driven variant).
2. State shape: `{ type: "none" } | { type: "edit"; variantId } | { type: "add" }`.
3. Opening one item closes any other open item.
4. Pin "Add variant" as a special accordion item at the bottom of the list.
5. If the open form is dirty, opening another item triggers `ConfirmationDialog` first.
6. Animate with `transition-all duration-200 overflow-hidden`.

Acceptance Criteria:

- Only one variant row is open at a time across the entire catalog admin screen.
- Closing a dirty form prompts the user before discarding changes.
- Mobile layout: accordion items render as full-width cards.

Test:

- Open variant A in edit mode, click variant B — A closes automatically.
- Modify a field in variant A, click variant B — confirmation dialog blocks the close.

---

## Task: Standardise destructive mutations behind Dialogs

Status: pending
Type: ux

Scope:

- Several destructive or multi-step actions today fire inline without confirmation: employee deactivation, client archival, business-day close, service/variant deletion, payout recording, batch-piece approval. This creates accidental destructive actions and context loss.

Steps:

1. Wrap each destructive mutation in `ConfirmationDialog` (from `@/components/ui/dialog`).
2. Convert business-day close into a Dialog showing a summary of any open tickets.
3. Convert payout recording into a stepped Dialog (select period → review amounts → confirm).
4. Convert batch-piece approval (T047) into a Dialog with the piece detail and approve / reject buttons.
5. Standardise: every Dialog has a visible close button and responds to Escape.
6. Width tokens: confirmations `max-w-sm`, forms `max-w-md`, complex forms `max-w-lg`, detail views `max-w-2xl`.

Acceptance Criteria:

- Employee deactivate, client archive, service delete, variant delete, business-day close, and batch-piece approve all open a Dialog before mutating.
- Each Dialog includes the entity name in the prompt copy (e.g. "Deactivate employee Juan Pérez?").
- Variant / service deletion shows an impact warning when open tickets reference the entity.

Test:

- Click "Eliminar variante" on a variant referenced by an open ticket — see the impact warning.
- Press Escape inside any of the new dialogs — it closes without mutating.

---

## Task: Audit and apply EmptyState component everywhere

Status: pending
Type: ux

Scope:

- Empty states are inconsistent — some screens show plain text, others show nothing. Affects employee list, client list, ticket history, catalog (no services, no variants), closed tickets, appointment list, batch list, notification dropdown.

Steps:

1. Grep every list / table component for the zero-records branch.
2. Replace ad-hoc empty-message strings with the existing `EmptyState` component.
3. Provide an icon, a title, an optional description, and an optional `action` button.

Acceptance Criteria:

- Every list / table view uses `EmptyState` for the zero-records case.
- All `EmptyState` usages include an icon and title at minimum.
- The notification dropdown empty state uses `InboxIcon` (already in use) with a localised description.

Test:

- Visit each listed screen with no data — every one renders the same `EmptyState` shape.

---

## Task: Replace ad-hoc toasts with a single Sonner provider

Status: pending
Type: ux

Scope:

- Mutation feedback is inconsistent — some screens use a custom inline `toast` state, some show nothing, others use ad-hoc patterns. Users miss success/error confirmation across roles.

Steps:

1. Install Sonner (shadcn/ui's default toast provider).
2. Mount `<Toaster />` once in the root layout.
3. Replace every ad-hoc toast state variable with `toast.success()` / `toast.error()` / `toast.info()`.
4. Add a leading icon to every toast: `CheckCircle2` (success), `XCircle` (error), `Info` (info), `AlertCircle` (warning).
5. Duration: 4s for success, 6s for error.

Acceptance Criteria:

- A single Sonner provider serves the whole app — no other toast libraries or in-component toast state.
- Every server-action result branch (success and error) calls a Sonner toast.
- Localised copy for the four icon types in `es.json` and `en.json`.

Test:

- Trigger a successful checkout — see a green-icon success toast for 4s.
- Trigger a failing payout (e.g. duplicate idempotency key) — see a red-icon error toast for 6s.

---

## Task: User-facing dark mode toggle

Status: pending
Type: ux

Scope:

- The CSS token system already defines dark-mode variants (`:dark` selectors in `globals.css`), and `useTheme` reads the OS preference. Missing: a user-facing toggle and persistence across sessions.

Steps:

1. Add a `ThemeToggle` button to the app shell header (or user menu) with a sun / moon icon.
2. Wire it to the existing `useTheme` hook (`setTheme("light" | "dark")`).
3. Persist the choice in `localStorage` under the existing `befine-theme` key.
4. The no-flash inline script in `app/layout.tsx` already reads that key — verify it picks up the user choice on the next page load.

Acceptance Criteria:

- The toggle is reachable from every authenticated screen.
- Toggling switches the theme without a full page reload.
- Refreshing the page keeps the chosen theme; clearing localStorage falls back to OS preference.

Test:

- From light mode, click the toggle — page enters dark mode immediately, no flash on next refresh.
- Clear `befine-theme` in DevTools and refresh — theme follows OS setting.
