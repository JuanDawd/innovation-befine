# Post-MVP Roadmap — Innovation Befine

> This document captures planned improvements after the MVP phases (0–10) ship to production.
> Items are grouped by theme, not by priority. Prioritisation happens at each planning cycle.
>
> **MVP definition:** Phases 0–10 complete and passing UAT (T106), deployed via T089.

---

## 1. UI / UX redesign

The MVP UI was built for correctness and speed of delivery. Post-MVP, a design pass brings it to production quality using the full capability of the already-installed stack (shadcn/ui, Base UI, Lucide Icons, Tailwind).

### 1.1 Icon audit and replacement

**Problem:** Several screens use no icons, wrong icons, or inconsistent icon sizes. Icon-only controls lack `aria-label`.

**Plan:**

| Screen / component                             | Current state            | Target state                                                                                               |
| ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Nav sidebar items                              | Text-only links          | Lucide icon + label; icon-only on collapsed sidebar                                                        |
| Cashier ticket cards                           | Status badge only        | Status-appropriate icon left of badge (e.g. `ClockIcon` for logged, `CreditCardIcon` for awaiting_payment) |
| Action buttons (Edit, Delete, Approve, Reject) | Text or ad-hoc icons     | Consistent Lucide icons; icon-only on mobile with `aria-label`                                             |
| Empty states                                   | Text only                | Lucide illustration icon + heading + description                                                           |
| Toast notifications                            | Text only                | Leading icon (CheckCircle2, AlertCircle, Info, XCircle)                                                    |
| Form field errors                              | Red text                 | `AlertCircleIcon` inline before message                                                                    |
| Loading spinners                               | `Loader2Icon` everywhere | Keep `Loader2Icon` but standardise size (`size-4` in buttons, `size-6` standalone)                         |
| Business day open/closed                       | Text badge               | `SunIcon` / `MoonIcon` with colour token                                                                   |

**Rules:**

- Source: Lucide Icons exclusively — never heroicons, react-icons, or fontawesome.
- Import individually: `import { IconName } from "lucide-react"` — no barrel imports.
- Icon-only interactive elements **must** have `aria-label`.
- Icon size inside buttons: `size-4`. Standalone decorative icons: `size-5` or `size-6`.

---

### 1.2 Responsive layout — page-size awareness

**Problem:** Several list and form screens do not adapt to viewport size. Specifically:

- Tables overflow horizontally on mobile instead of switching to a card layout.
- Forms use full-width inputs on desktop where a max-width constraint would read better.
- The cashier dashboard card grid has no minimum card width — cards become unusably narrow on small screens.
- Dialog widths are not capped, making them too wide on large monitors.

**Plan:**

| Context                                                  | Current                                           | Target                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Data tables (employee list, client list, ticket history) | Fixed columns regardless of viewport              | Mobile: card-per-row layout (`< 768px`); tablet+: table                                                                              |
| Forms (employee creation, catalog edit)                  | Full-width inputs                                 | Max-width container: `max-w-lg mx-auto` on desktop; full-width on mobile                                                             |
| Cashier dashboard grid                                   | `sm:grid-cols-2 lg:grid-cols-3` with no min-width | Add `min-w-[280px]` per card; collapse to single column below 480px                                                                  |
| Dialogs                                                  | Various `max-w-*` values                          | Standardise: `max-w-sm` (confirmations), `max-w-md` (forms), `max-w-lg` (complex forms), `max-w-2xl` (detail views); always `w-full` |
| Page padding                                             | `p-6` everywhere                                  | `p-4` on mobile (`< 768px`), `p-6` on tablet, `p-8` on desktop                                                                       |
| Section headings                                         | `text-2xl` regardless of viewport                 | `text-xl` on mobile, `text-2xl` on desktop                                                                                           |

**Breakpoint reference (from wireframes.md):**

```
mobile  < 768px   → single column, full-width, bottom nav (stylist/clothier)
tablet  768–1024px → two columns, sidebar collapsed
desktop > 1024px  → sidebar expanded, multi-column grids
```

---

### 1.3 Catalog variant UI — accordion with mutual exclusion

**Problem:** Service variant rows in the catalog admin screen all expand inline simultaneously, causing visual clutter and loss of context on both mobile and desktop. Creating a new variant and editing an existing one can be open at the same time, which confuses focus.

**Current behaviour:** Variants are listed in a flat table with inline edit forms that all stay open independently.

**Target behaviour:**

- Variants are displayed as an **Accordion** (one open at a time).
- Opening an edit form for variant A automatically closes the form for variant B.
- The "Add variant" form is a special accordion item pinned at the bottom, also mutually exclusive with any edit form.
- On mobile the accordion items are full-width cards; on desktop they remain inside the service card layout.

**Implementation notes:**

- Use **Base UI `Collapsible`** (already installed, consistent with the rest of the component system) or build a simple controlled accordion with `useState<string | null>(openId)`.
- Do NOT use a library accordion — keep it consistent with the project's Base UI / shadcn/ui components.
- The controlled state lives in the parent `ServiceCard` component.
- Closing an open item discards unsaved changes (show a `ConfirmationDialog` if the form is dirty).
- Animation: `transition-all duration-200 overflow-hidden` on the collapsible content panel.

**Schema of the controlled state:**

```ts
type AccordionState = { type: "none" } | { type: "edit"; variantId: string } | { type: "add" };

const [open, setOpen] = useState<AccordionState>({ type: "none" });

function requestOpen(next: AccordionState, isDirty: boolean) {
  if (isDirty) {
    // show ConfirmationDialog; on confirm → setOpen(next)
  } else {
    setOpen(next);
  }
}
```

---

### 1.4 Wider use of Dialogs for mutations

**Problem:** Several destructive or multi-step actions navigate to a new page or perform inline mutations without a confirmation step. This creates context loss and accidental actions.

**Target:** Use `Dialog` (from `@/components/ui/dialog`, backed by Base UI) for:

| Action                      | Current                       | Target                                                                            |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Employee deactivation       | Inline button → direct action | `ConfirmationDialog` with employee name in the prompt                             |
| Client archival             | Inline button → direct action | `ConfirmationDialog`                                                              |
| Business day close          | Full form in page             | `Dialog` with summary of open tickets (if any)                                    |
| Service / variant deletion  | Inline button                 | `ConfirmationDialog` with impact warning (e.g. "2 open tickets use this variant") |
| Payout recording            | Separate page                 | `Dialog` with stepped form (select period → review amounts → confirm)             |
| Ticket price override       | Inline in checkout            | Already a dialog — keep; standardise width to `max-w-sm`                          |
| Batch piece approval (T047) | TBD                           | `Dialog` with piece detail and approve / reject buttons                           |

**Rules:**

- Destructive actions (delete, deactivate, archive, close day) always require `ConfirmationDialog`.
- Complex mutations with 3+ fields use a `Dialog` with a form inside.
- Simple single-field edits (rename, toggle) can stay inline.
- Dialogs always have a visible close button and respond to Escape key (Base UI provides this).

---

### 1.5 Consistent empty states

**Problem:** Empty states are inconsistent — some screens show a plain text string, others show nothing.

**Target:** Every list/table view uses the existing `EmptyState` component:

```tsx
<EmptyState
  icon={UsersIcon}
  title="No hay empleados activos"
  description="Crea el primer empleado desde el botón de arriba."
  action={<Button>Crear empleado</Button>} // optional
/>
```

Screens to audit: employee list, client list, ticket history, catalog (no services, no variants), closed tickets, appointment list, batch list, notification dropdown.

---

### 1.6 Toast notifications — standardise

**Problem:** Mutation feedback is inconsistent — some use a custom inline `toast` state, others use nothing, a few use different patterns.

**Target:**

- Install and configure a single toast provider (e.g. **Sonner**, which is shadcn/ui's default).
- Replace all ad-hoc `toast` state variables with `toast.success()` / `toast.error()`.
- Add a leading icon to every toast (CheckCircle2 for success, XCircle for error, Info for info).
- Keep duration: 4s for success, 6s for error (gives time to read).

---

## 2. Feature additions

### 2.1 Push notifications (browser)

> Stretch goal from T048. Requires the service worker from T081.

- Cashier receives a browser push when a new ticket is logged (even when tab is in background).
- Clothier receives a push when a piece is assigned.
- Requires: VAPID keys, `PushSubscription` stored per employee in DB, service worker background sync.

### 2.2 Client deduplication tool (admin)

> Guest-to-client conversion was deferred post-MVP (stakeholder decision, April 2026).

- Admin can view potential duplicate clients (same phone or similar name).
- Merge tool: pick a canonical record, redirect all tickets from the duplicate to the canonical.
- No automatic merging — always requires admin confirmation.

### 2.3 Appointment reminders via WhatsApp / SMS

- Triggered 24h before appointment.
- Requires an SMS/WhatsApp gateway (Twilio, Meta Cloud API).
- Opt-in per client (adds `reminder_consent` boolean to clients table).

### 2.4 Multi-location support

- A single Innovation Befine account may eventually manage multiple salon locations.
- Requires: `locations` table, employee ↔ location assignment, per-location business days, role scoping per location.
- **Not in MVP scope** — noted here to avoid schema decisions that would make it impossible to add later. Key constraint: keep `business_day_id` as the primary partitioning key (already done).

### 2.5 Accountant export improvements

> T076 (CSV export) is already in Phase 8.

Post-MVP additions:

- PDF export of payout summaries (per employee, per period).
- DIAN-compatible format for VAT reporting (Colombian tax authority).
- Scheduled monthly email to accountant with the CSV attached (Resend + cron).

### 2.6 Dark mode support

- Tailwind and the CSS token system already define dark mode variants (`:dark` selectors in `globals.css`).
- Missing: a user-facing toggle (currently only follows `prefers-color-scheme`).
- Add a `ThemeToggle` button to the app shell header.
- Persist preference in `localStorage`.

---

## 3. Performance and reliability

### 3.1 SSE → Postgres LISTEN/NOTIFY in production

The current SSE transport uses an in-process EventEmitter. On Vercel, each serverless function instance is isolated, so SSE events published from a Server Action may not reach SSE subscribers in a different instance. The 30-second polling fallback handles this — it's reliable, not fast.

**Target:** Replace the EventEmitter bus in `packages/realtime/src/server.ts` with Postgres `LISTEN/NOTIFY` using a persistent WebSocket connection (`@neondatabase/serverless` in WS mode). Changes are isolated to that one file.

### 3.2 Edge middleware session verification

Currently middleware uses `betterFetch` to call itself (`/api/auth/get-session`), which adds a network round-trip even with `cookieCache` enabled (the cookie is verified inside the handler, which still runs as a serverless function).

**Target:** Move session cookie verification directly into middleware using the Better Auth `jwt` plugin or by verifying the signed cookie with the `BETTER_AUTH_SECRET` directly in the Edge runtime — zero extra round-trips.

### 3.3 Query optimisation pass

- Add composite indexes identified during analytics query profiling (T075).
- Review N+1 patterns in `listOpenTickets`, `listPendingEditRequests`, and settlement queries.
- Add `EXPLAIN ANALYZE` output to `docs/research/` for the 5 most expensive queries.

---

## 4. Developer experience

### 4.1 Component Storybook

- Document all design system components (`Button`, `Dialog`, `EmptyState`, `StatusBadge`, etc.) with Storybook stories.
- Catches visual regressions before they reach production.
- Enables designer hand-off without needing to run the full app.

### 4.2 End-to-end test expansion

Phase 4A+ E2E tests cover the checkout lifecycle. Post-MVP:

- Appointment booking flow (secretary → confirm → no-show).
- Payout recording with adjustment.
- Offline checkout → reconnect sync.
- Multi-location (when added).

### 4.3 Error boundary per route segment

- Add `error.tsx` files per route group so a crash in one section doesn't break the whole app.
- Include a "Reload" button and a Sentry error ID the user can report.

---

## 5. Known issues to track post-MVP

These items are logged in `docs/issues-tracker.md` but are deferred to post-MVP:

| Issue | Severity | Note                                                                                 |
| ----- | -------- | ------------------------------------------------------------------------------------ |
| L-17  | Low      | Seed script does not create sample tickets/batches — analytics baseline starts empty |
| L-18  | Low      | Employee profile page does not show role badge                                       |
| L-19  | Low      | Password change form does not confirm "new password" field                           |

---

## Appendix — things explicitly out of scope (ever)

These were decided during the April 2026 stakeholder and grilling sessions and should not be re-opened without a formal decision:

| Feature                                             | Decision                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| File / image storage (profile photos, batch photos) | Out of scope for MVP and post-MVP — complexity vs. value not justified |
| Guest-to-client automatic conversion                | Deferred; staff creates client records manually                        |
| Float/decimal monetary values                       | Never — integer COP pesos only                                         |
| Third-party realtime services (Pusher, Ably)        | Replaced by SSE; not to be reintroduced                                |
| Multiple payment processors                         | Not needed; salon accepts cash/card offline                            |
