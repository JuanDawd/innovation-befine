# Senior Designer Review

> Reviewed: April 2026
> Scope: full project documentation (business-idea.md, technical-feasibility-and-research.md, project-plan.md, all 11 phase task files, all research files, progress.md, business.md)
> Reviewer perspective: UX strategy, visual design system, interaction patterns, information architecture, responsive design, accessibility, brand identity, and role-specific workflow optimization

---

## Overall assessment

The project documentation is **strong on product logic and engineering structure**, but **lacks almost all design-layer specification**. There are 103 tasks, each with clear acceptance criteria for _what_ to build — but none define _how it should look, feel, or behave visually_. The two prior reviews (Product Owner and Software Engineer) correctly focused on scope, ordering, and architecture. This review addresses the gap between "working software" and "software people want to use all day."

For an internal tool that replaces spreadsheets and is used 8–10 hours/day by staff of varying technical ability, design quality directly affects adoption. A poorly designed internal tool leads to workarounds, errors, and resistance — exactly the problems the app is supposed to solve.

Findings are grouped by severity.

---

## Critical findings

### D1 — No design system or design tokens defined

**Impact: critical — every screen built without this will be visually inconsistent**

There is no specification for:

- **Colour palette** — primary, secondary, neutral, semantic (success, warning, error, info) colours
- **Typography scale** — font family, heading sizes (h1–h4), body text, labels, captions, monospaced (for amounts)
- **Spacing system** — base unit (4px? 8px?), margin/padding scale, gap conventions
- **Border radius** — sharp vs rounded; consistent radius values
- **Shadow/elevation** — levels for cards, modals, dropdowns
- **Component sizing** — small/medium/large variants for buttons, inputs, badges

Without design tokens, each task will produce screens with different font sizes, spacing, and colour usage. Fixing this in Phase 10 (polish) means redesigning 40+ screens.

**Recommendation:** Add a task to Phase 0 to define and document design tokens. If using shadcn/ui, configure the theme in `tailwind.config.ts` and `globals.css`. If using Base Web, configure a Styletron theme provider. Either way, the token system must exist before the first UI task (T016 — Login page).

---

### D2 — No wireframes, screen layouts, or visual references for any screen

**Impact: critical — 40+ UI tasks have no visual target**

Every task with a UI deliverable (T016, T024, T030, T036, T050, T067, T072, etc.) describes _what_ the screen should contain, but not _how it should be arranged_. Without wireframes or mockups, each screen will be laid out differently depending on the developer's instinct or AI prompt. This creates an inconsistent product that requires a full design pass in Phase 10.

Key screens that urgently need layout direction:

| Screen               | Task      | Why critical                                                                           |
| -------------------- | --------- | -------------------------------------------------------------------------------------- |
| Cashier dashboard    | T036      | Used all day; needs optimized card layout, grouping, and real-time update choreography |
| Checkout flow        | T038      | Financial transaction; must feel trustworthy and prevent errors                        |
| Admin home           | T093      | First screen after login; sets the tone for the whole app                              |
| Login page           | T016      | First impression; brand presence                                                       |
| Appointment calendar | T052      | Complex visual layout; calendar UX varies wildly by implementation                     |
| Payroll settlement   | T067      | Data-dense; breakdown + confirmation flow                                              |
| Analytics dashboard  | T072–T074 | Data visualization; charts, comparisons, drill-downs                                   |

**Recommendation:** Add a task to Phase 0 (or a new Phase 0.5 / design sprint) to create low-fidelity wireframes for the 7 key screens listed above. These don't need to be pixel-perfect — a shared Figma file with layout sketches, or even documented component layouts in Markdown, would eliminate 80% of visual inconsistency risk. At minimum, document the **layout patterns** (full-width list, card grid, sidebar+content, form page) and when to use each.

---

### D3 — No role-specific UX prioritization or workflow optimization

**Impact: critical — each role has different primary tasks and devices, but all get the same generic treatment**

The business doc defines four roles with very different daily workflows:

| Role          | Primary action                     | Frequency         | Primary device          | UX priority                               |
| ------------- | ---------------------------------- | ----------------- | ----------------------- | ----------------------------------------- |
| Cashier/admin | Checkout, review dashboard         | Every few minutes | Desktop (POS station)   | Speed, glanceability, keyboard efficiency |
| Stylist       | Log service, mark awaiting payment | Every 30–60 min   | Phone (between clients) | One-handed, fast, minimal steps           |
| Clothier      | View batch, mark piece done        | Every few minutes | Phone (at workstation)  | Tap-and-done, progress visibility         |
| Secretary     | Book appointments, create batches  | Every 15–30 min   | Desktop or phone        | Form efficiency, calendar usability       |

No task addresses these differences. The navigation shell (T090) mentions "role-aware nav items" but not role-optimized layouts. A clothier marking pieces done on a phone needs a fundamentally different screen than an admin reviewing payroll on a desktop.

**Recommendation:** Add role-specific UX notes to each role's primary-action tasks. At minimum:

- **Clothier home (T046):** Large tap targets, checklist-style UI, progress bar for the batch. Optimize for one-handed phone use.
- **Stylist ticket creation (T035):** Minimal-step flow; pre-select the logged-in stylist; big "Log service" CTA. Optimize for speed between clients.
- **Cashier dashboard (T036):** Information density optimized for desktop; keyboard shortcuts for common actions. Status columns or Kanban-style board.
- **Secretary booking (T050):** Calendar-first view; drag-to-book or click-time-slot pattern.

---

## High-severity findings

### D4 — No status colour system defined

**Impact: high — 15+ status values across 5 entities need consistent visual language**

The app has status-driven entities:

| Entity       | Statuses                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| Tickets      | `logged`, `awaiting_payment`, `closed`, `reopened`                        |
| Appointments | `booked`, `confirmed`, `completed`, `cancelled`, `rescheduled`, `no_show` |
| Batch pieces | `pending`, `done_pending_approval`, `approved`                            |
| Large orders | `pending`, `in_production`, `ready`, `delivered`, `paid_in_full`          |
| Business day | open, closed                                                              |

Without a unified colour-coding system, each screen will use arbitrary colours for statuses. Users won't develop intuition for "green = done, yellow = needs attention, red = problem."

**Recommendation:** Define a status colour palette as part of the design token system (D1). Map semantic colours to status categories:

- **Neutral/grey:** initial states (logged, pending, booked)
- **Blue/info:** in-progress states (awaiting_payment, in_production, confirmed)
- **Amber/warning:** needs attention (reopened, done_pending_approval, rescheduled)
- **Green/success:** completed states (closed, approved, delivered, paid_in_full, completed)
- **Red/destructive:** negative states (cancelled, no_show)

Document this mapping in the design system and reference it in every status-related task.

---

### D5 — No empty state design for any screen

**Impact: high — first-time use and daily start will look broken**

When the business day hasn't been opened yet, there are zero tickets, zero clients, zero batches. Every list screen and dashboard will show an empty table or blank space. Without designed empty states, the app will look broken on day one and every morning before work starts.

Screens that need empty states:

- Cashier dashboard (no tickets yet today)
- Clothier home (no batches assigned)
- Appointment calendar (no appointments today)
- Client search (no clients created yet — especially important post-launch)
- Ticket history (no closed tickets today)
- Analytics (no data for the period)
- Unsettled earnings alert (no outstanding earnings)
- Notification bell (no notifications)

**Recommendation:** Add an acceptance criterion to every list/dashboard task: "Empty state shows a helpful message and, where applicable, a CTA to create the first item." Alternatively, create a reusable `EmptyState` component pattern in the design system (D1) with icon, message, and optional action button.

---

### D6 — No receipt or transaction confirmation design

**Impact: high — financial transaction with no confirmation artifact**

When a cashier closes a ticket (T038), the payment is recorded but there's no:

- **Transaction receipt** (printable or digital) to give the customer
- **Visual confirmation screen** showing what was just paid, by which method, and the total
- **Print capability** for end-of-day summaries or individual transactions

For a POS system replacing a manual cash register flow, the absence of a receipt is a significant gap. Customers may ask "can I get a receipt?" and there's no answer.

**Recommendation:** Add a task or acceptance criteria for:

1. A **post-checkout confirmation screen** showing the transaction summary (service, amount, payment method, time)
2. A **"Print receipt"** button that opens the browser print dialog with a receipt-formatted view (or generates a PDF)
3. Optionally, an **email receipt** action if the client has an email on file

At minimum, add a confirmation screen to T038 acceptance criteria.

---

### D7 — No data visualization strategy for analytics

**Impact: high — Phase 8 builds analytics dashboards with no chart/graph specification**

T072–T074 describe revenue dashboards, period comparisons, and per-employee performance views. But there is no specification for:

- **Chart types** — bar charts for period comparison? Line charts for trends? Sparklines for inline trends?
- **Chart library** — Recharts, Chart.js, Nivo, Tremor, or native SVG?
- **Data density** — how much data on one screen? Tabs, scrolling sections, or drill-down?
- **Comparison visualizations** — how to show "+12% vs last week"? Colour-coded delta? Arrow icons?
- **Mobile analytics** — do charts work on phone screens? Should mobile get a simplified view?

Without this, the analytics phase will produce functional but poorly designed dashboards that don't actually help management answer their questions faster than a spreadsheet.

**Recommendation:** Add a chart/visualization library to the tech stack decision (suggest **Recharts** for React ecosystem fit, or **Tremor** for pre-built dashboard components). Add visualization type guidance to T072–T074 acceptance criteria. At minimum:

- T072 (daily): large number display + delta indicator ("+X% vs yesterday")
- T073 (weekly/monthly): bar chart comparing current vs prior period
- T074 (per-employee): sortable table with inline sparklines or bar indicators

---

### D8 — No notification UX design beyond "bell icon"

**Impact: high — notifications drive critical workflows for clothiers and stylists**

T048 defines the notification system as: "bell icon in nav, unread count badge, dropdown list." But notifications are a primary interaction channel for:

- Clothiers receiving batch assignments
- Secretary seeing piece completions
- Stylists receiving appointment assignments
- Cashier seeing edit approval requests

The current specification lacks:

- **Notification grouping** — are 10 piece completions shown as 10 items or one grouped notification?
- **Notification actions** — can a user act on a notification without navigating away? (e.g., approve a piece directly from the notification)
- **Notification sound or vibration** — for phone users who aren't looking at the screen
- **Notification persistence** — how long do notifications stay? Is there a "mark all read" action?
- **Push notifications** — the service worker (T081) could enable browser push notifications for critical events. Not mentioned.

**Recommendation:** Expand T048 acceptance criteria to include: grouping strategy, action buttons on notifications, "mark all read" action, and persistence policy (e.g., auto-archive after 7 days). Add push notification support as a stretch goal for Phase 9 (alongside the service worker).

---

### D9 — No confirmation dialog or destructive action pattern

**Impact: high — irreversible actions have no safety net**

Several actions in the app are destructive or high-consequence:

- Close the business day (affects all records for the day)
- Deactivate an employee
- Approve a payout (financial)
- Close a ticket (financial)
- Mark an appointment as no-show (affects client record permanently)
- Cancel an appointment

No task defines a confirmation dialog pattern. Without one, developers will either skip confirmation entirely (risky) or build inconsistent confirmation UIs per screen.

**Recommendation:** Define a standard confirmation dialog pattern in the design system. Two variants:

1. **Standard confirmation:** "Are you sure you want to [action]?" with Cancel + Confirm buttons. Used for: close day, deactivate employee.
2. **Destructive confirmation:** Red-highlighted dialog with the action name typed to confirm (or a more prominent "This cannot be undone" warning). Used for: financial operations (payout), permanent status changes (no-show).

Add this pattern as a deliverable of the design system task (D1).

---

### D10 — No mobile-first design strategy for phone-primary roles

**Impact: high — clothiers and stylists primarily use phones, but no mobile-first approach is defined**

T083 (responsive QA) is in Phase 10 — the last phase. This means mobile responsiveness is treated as a retrofit, not a design-first decision. For roles that primarily use phones:

- **Clothier:** marks pieces done on a phone at their workstation. Their entire daily workflow is phone-based.
- **Stylist:** logs services between clients on a phone. Speed is critical.

Building desktop-first and then squeezing into mobile in Phase 10 will produce suboptimal mobile UX for the two roles that need it most.

**Recommendation:** Add mobile-first acceptance criteria to T046 (clothier batch view) and T035 (ticket creation). Specifically: "Primary development and testing done in mobile viewport first. Desktop layout is the secondary adaptation." This doesn't require a new task — it's a mindset change documented in T002 standards and enforced per-task.

---

## Medium-severity findings

### D11 — No search and filter UX pattern

**Impact: medium — search appears in 6+ screens with no consistent design**

Search functionality appears in:

- Client search (T030) — by name, phone, email
- Ticket history (T092) — by client name
- Employee list (T014) — filter by role, status
- Appointment list (T052) — filter by stylist, date
- Large orders (T062) — filter by status
- Analytics (T071–T074) — filter by period, employee

No shared search/filter pattern is defined:

- Is search a top-of-page bar, a sidebar filter panel, or inline filters?
- Does search use autocomplete with live results?
- What happens during search (debounced? instant? button-triggered)?
- How are active filters shown (chips? tags? inline text)?

**Recommendation:** Define a search/filter component pattern in the design system. Suggest:

- **Search bar:** top of list screens, debounced (300ms), with clear button
- **Filters:** horizontal filter chips below the search bar (role, status, date range)
- **Active filter indicator:** chip with remove button; "Clear all" link
- **Zero-results state:** message with suggestion to broaden search

---

### D12 — No form UX patterns for the most form-heavy app category

**Impact: medium — the app has 20+ distinct forms with no unified design**

This is a form-heavy application: employee creation, catalog CRUD, ticket creation, checkout, appointment booking, batch creation, payout recording, large order creation. Yet no task defines:

- **Form layout pattern** — single column? Two columns on desktop? Inline labels vs stacked labels?
- **Validation timing** — validate on blur? On submit? On keystroke?
- **Error display** — inline under the field? Toast? Top-of-form summary?
- **Required field indication** — asterisk? "(required)" label? All fields required by default with "(optional)" on exceptions?
- **Multi-step forms** — is the checkout flow one page or multiple steps? How is progress shown?
- **Success feedback** — after successful submit, what happens? Toast + redirect? Inline success message?

**Recommendation:** Document form UX conventions in the design system or standards:

- Stacked labels (better for mobile and accessibility)
- Validate on blur for individual fields; validate on submit for the full form
- Inline errors under each field (red text, associated with the input for screen readers)
- Required by default; mark optional fields with "(optional)" suffix
- Success: toast notification + redirect to the relevant list/detail view
- Checkout (T038): consider a stepped flow (1. Review items → 2. Payment method → 3. Confirm)

---

### D13 — No calendar/scheduling UX design

**Impact: medium — two calendar views with no design guidance**

Two tasks require calendar UX:

- T052 — Appointment calendar view (secretary sees daily appointments by stylist)
- T021 — Absence/vacation calendar (admin sees monthly absence overview)

Calendar UIs are notoriously complex. Without design guidance:

- Is it a full-page calendar (like Google Calendar) or a compact date picker with a list view below?
- How are overlapping events shown?
- How does a user navigate between days/weeks/months?
- What does the mobile calendar look like? (Full calendars are unusable on phones)

**Recommendation:** For T052 (appointments): use a **day view** as the default (time slots in rows, stylists in columns on desktop; stacked list on mobile). Include day navigation arrows and a date picker for jumping to a specific date. For T021 (absences): use a **month grid** with coloured dots per absence type. Mobile: simplify to a list grouped by date.

---

### D14 — No dark mode consideration

**Impact: medium — operational tool used in varying lighting conditions**

Beauty salons may have different lighting environments. Staff working late shifts (business day can span past midnight per the spec) may benefit from a dark mode. Additionally, phone screens in bright salon lighting may need high contrast.

**Recommendation:** Not critical for MVP, but the design token system (D1) should be built with dark mode awareness. If using Tailwind/shadcn, this is nearly free (CSS variables + `dark:` variant). Add dark mode as a stretch goal for Phase 10 or post-MVP. At minimum, ensure the light theme has sufficient contrast for bright environments.

---

### D15 — No iconography system defined

**Impact: medium — nav items, status indicators, and actions need consistent icons**

The app navigation (T090), notification bell (T048), status badges, and action buttons all need icons. No icon set is specified. Common choices:

- **Lucide** (default with shadcn/ui)
- **Heroicons** (popular with Tailwind)
- **Phosphor Icons** (wide variety, consistent style)
- **Tabler Icons** (open source, large set)

Using different icon sets or mixing icon styles creates visual inconsistency.

**Recommendation:** Choose a single icon library and document it in the design system. If shadcn/ui is chosen (T008), use **Lucide** (it's the default). If Base Web is chosen, use its built-in icons. Document commonly used icons for actions (add, edit, delete, search, filter, close, check, alert) so developers choose consistently.

---

### D16 — No keyboard shortcut design for the cashier workflow

**Impact: medium — cashier uses the system all day on a desktop; keyboard efficiency matters**

The cashier is the power user of this system. On a busy day, they may close 50+ tickets. Every unnecessary click adds friction. No task mentions keyboard shortcuts:

- Open checkout on the selected ticket
- Navigate between tickets on the dashboard
- Confirm payment (Enter key)
- Open/close the business day

**Recommendation:** Add keyboard shortcut support as a stretch acceptance criterion on T036 (dashboard) and T038 (checkout). At minimum: Enter to confirm the active dialog, Escape to cancel/close modals, and tab navigation through form fields. A full shortcut palette (Cmd/Ctrl+K command bar) could be a Phase 10 stretch goal.

---

### D17 — No brand identity or visual direction

**Impact: medium — "Innovation Befine" has no visual identity in the app**

No task mentions:

- **Logo** — does "Innovation Befine" have a logo? Where does it appear in the app?
- **Brand colours** — do the company's existing brand colours inform the app's colour palette?
- **Splash / loading screen** — when the PWA opens, what does the user see?
- **Favicon** — browser tab icon

T082 mentions "icons (at least 192×192 and 512×512)" for the PWA manifest but there is no task to design or source these icons.

**Recommendation:** Add a task to Phase 1 (alongside T090 — app shell) to gather or create brand assets: logo (if it exists), brand colour extraction, favicon generation, and PWA icons. If no logo exists, use a typographic logo (app name in the chosen font). This ensures all screens built from Phase 1 onward use consistent branding.

---

### D18 — No loading / skeleton pattern defined

**Impact: medium — T084 (loading states) is Phase 10 but every phase builds screens that load data**

T084 mentions "skeleton loaders or spinners on initial data loads" but is placed in Phase 10. Between Phase 1 and Phase 9, every screen will either show a blank flash, a generic spinner, or nothing while data loads.

**Recommendation:** Define a loading pattern in Phase 0 as part of the design system:

- **Page-level loading:** skeleton screen matching the page layout (content-shaped grey blocks)
- **Component-level loading:** spinner inside the component area (table rows, card content)
- **Button loading:** spinner replaces button text; button is disabled
- **Inline loading:** subtle spinner next to the action (e.g., "Saving..." next to a toggle)

Developers should implement basic loading states from Phase 1, not retrofit them in Phase 10.

---

### D19 — No print design for daily reports or transaction summaries

**Impact: medium — admin may need to print daily summaries for accounting**

The business currently uses spreadsheets, which are printable. The new app has:

- Daily revenue totals
- Per-employee earnings breakdowns
- Payout records
- Closed ticket lists

No task addresses printability. If the admin needs to hand a printed summary to the accountant (T076 mentions CSV export, but not print), there's no print stylesheet or PDF generation.

**Recommendation:** Add a print stylesheet as a stretch goal for T092 (ticket history) and T072 (daily revenue). At minimum, ensure `@media print` hides navigation and sidebar, and formats content for A4/Letter paper. CSS-only solution — no library needed.

---

### D20 — No real-time update animation / choreography defined

**Impact: medium — live updates are a core feature but no visual transition is designed**

The cashier dashboard (T036) receives live updates via real-time events. But how do these updates appear visually?

- Does a new ticket slide in from the top? Fade in? Just appear?
- Does a status change animate the card (colour transition, pulse, highlight)?
- Is there a sound or haptic feedback on new items?
- If 5 tickets update at once (e.g., when a stylist marks 5 tickets at once), do they all animate simultaneously?

Without choreography, live updates will feel jarring or go unnoticed.

**Recommendation:** Define a real-time update pattern:

- **New item:** fade-in with a brief highlight (e.g., 2-second yellow/blue background flash, then normal)
- **Status change:** smooth colour transition (300ms CSS transition on the status badge colour)
- **Item removal (ticket closed):** fade-out with a 500ms delay (gives the user time to notice)
- **Bulk updates:** stagger animations by 100ms each

Add these as acceptance criteria on T036 (cashier dashboard).

---

## Low-severity findings

### D21 — No numerical formatting conventions beyond currency

**Impact: low — inconsistent number display across screens**

The app displays many numerical values:

- Percentages (commission %, period comparison deltas)
- Counts (tickets, pieces, days)
- Durations (time elapsed on open tickets, appointment duration)
- Dates (multiple formats needed: full date, short date, relative "2 hours ago")

T099 handles currency and date formatting. But:

- How are percentages shown? "15%" or "15.0%"? With delta arrow ("↑15%")?
- How is time elapsed shown? "2h 15m" or "2:15:00" or "2 hours ago"?
- Are large numbers formatted with separators? "1,500" or "1.500" (locale-dependent)?

**Recommendation:** Add number formatting utilities alongside the currency formatter in T099. Include: percentage formatter, count formatter (with locale-aware separators), and relative time formatter ("hace 2 horas" in Spanish).

---

### D22 — No swipe / gesture interactions for mobile users

**Impact: low — mobile-first roles could benefit from gesture-based workflows**

Mobile gestures can significantly speed up repetitive workflows:

- **Clothier (T046):** swipe right on a piece to mark done
- **Cashier (T036):** swipe on a ticket card to open checkout
- **Notifications (T048):** swipe to dismiss/mark read

These are stretch features, not critical, but should be considered during mobile UX design.

**Recommendation:** Add gesture support as a Phase 10 stretch goal. For MVP, ensure all actions are accessible via buttons (tappable elements).

---

### D23 — No contextual help or onboarding flow

**Impact: low — staff need guidance during the first week of using the app**

T088 (training guide) provides offline documentation. But within the app:

- No tooltips explain unfamiliar UI elements
- No first-time-use guided tour (e.g., "This is where you log a service")
- No contextual help buttons linking to the training guide

**Recommendation:** Add minimal onboarding as a Phase 10 stretch goal. For MVP, ensure all action buttons have clear labels (not icon-only) and form fields have placeholder text or helper text explaining what's expected.

---

### D24 — Table design for data-dense admin screens

**Impact: low — admin views heavy tabular data with no table UX defined**

The admin uses tables for: employee list, ticket history, payroll breakdown, analytics per-employee, large order list, audit log. No table design pattern is defined:

- Fixed vs scrollable headers
- Row hover highlight
- Row selection (for batch actions?)
- Column alignment (numbers right-aligned, text left-aligned)
- Responsive table behavior on mobile (horizontal scroll? Card transformation?)
- Pagination vs infinite scroll

**Recommendation:** Define a table component pattern in the design system. Suggest:

- Fixed header, vertical scroll for long lists
- Numbers right-aligned, text left-aligned
- Row hover with subtle background change
- Mobile: transform to card layout for tables with 4+ columns
- Pagination for datasets > 25 rows (cursor-based per T097)

---

### D25 — No transition design between related screens

**Impact: low — navigation between list → detail → edit feels disjointed without transitions**

Many workflows involve: list view → click item → detail view → click edit → edit form → save → back to detail. Without any page transition, each navigation feels like a fresh page load, breaking the user's mental model of drilling into and out of data.

**Recommendation:** Add subtle page transitions as a Phase 10 stretch goal. For MVP, ensure breadcrumbs or back-links are present on all detail/edit views so users can navigate back to the list without using the browser back button.

---

### D26 — No badge/indicator design for the admin dashboard alerts

**Impact: low — T070 and T093 mention badges and alerts with no visual specification**

T070 (unsettled earnings alert) and T093 (admin home) mention "badge" and "alert" elements. Without a defined badge system:

- What colour is the unsettled earnings badge?
- How does it differ from the notification bell badge?
- Are badges numeric ("3") or dot-only?
- Where are badges positioned relative to nav items and cards?

**Recommendation:** Define badge variants in the design system: numeric badge (red circle with count), dot badge (small coloured dot), and inline alert badge (coloured pill with text). Use consistently across nav items, cards, and list rows.

---

## Summary of recommended changes

| #   | Severity | Recommendation                                                                  | Affects                | Status                                                                                                   |
| --- | -------- | ------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| D1  | Critical | Add design system / design tokens task to Phase 0                               | Phase 0                | **Requested** — T103 added                                                                               |
| D2  | Critical | Add wireframe / layout specification task (Phase 0)                             | Phase 0                | **Requested** — T104 added                                                                               |
| D3  | Critical | Add role-specific UX notes to primary-action tasks                              | T035, T036, T046, T050 | **Requested** — UX notes added to each task                                                              |
| D4  | High     | Define status colour system as part of design tokens                            | D1 task                | **Requested** — included in T103                                                                         |
| D5  | High     | Add empty state AC to all list/dashboard tasks                                  | Multiple tasks         | **Requested** — AC added to T014, T024, T027, T030, T036, T046, T052, T062, T069, T070, T072, T092, T093 |
| D6  | High     | Add receipt / transaction confirmation to checkout flow                         | T038                   | **Requested** — AC added to T038                                                                         |
| D7  | High     | Add data visualization library to tech stack; chart guidance to analytics tasks | T072–T074, tech stack  | **Requested** — Recharts added to stack; chart guidance added to T072–T074                               |
| D8  | High     | Expand notification UX in T048 (grouping, actions, persistence, push)           | T048                   | **Requested** — expanded ACs added to T048                                                               |
| D9  | High     | Define confirmation dialog pattern for destructive actions                      | Design system          | **Requested** — included in T103                                                                         |
| D10 | High     | Add mobile-first criteria for phone-primary roles (clothier, stylist)           | T035, T046, T002       | **Requested** — mobile-first ACs added to T035, T046; policy added to T002                               |
| D11 | Medium   | Define search/filter UX pattern                                                 | Design system          | **Requested** — included in T103                                                                         |
| D12 | Medium   | Define form UX conventions (layout, validation, feedback)                       | T002 or design system  | **Requested** — form conventions added to T002                                                           |
| D13 | Medium   | Define calendar/scheduling UX for appointments and absences                     | T052, T021             | **Requested** — calendar UX guidance added to T052, T021; included in T104                               |
| D14 | Medium   | Consider dark mode readiness in design tokens                                   | D1 task                | **Requested** — dark mode readiness in T103; stretch goal in T083                                        |
| D15 | Medium   | Choose and document icon library                                                | Design system          | **Requested** — Lucide Icons chosen; included in T103                                                    |
| D16 | Medium   | Add keyboard shortcuts for cashier workflow                                     | T036, T038             | **Requested** — keyboard shortcut stretch ACs added to T036, T038                                        |
| D17 | Medium   | Add brand identity / asset gathering task                                       | Phase 1                | **Requested** — T105 added to Phase 1                                                                    |
| D18 | Medium   | Define loading/skeleton pattern in Phase 0, not Phase 10                        | T084 concern, D1 task  | **Requested** — loading patterns in T103; early application policy in T002                               |
| D19 | Medium   | Add print stylesheet as stretch goal                                            | T092, T072             | **Requested** — print stretch ACs added to T092, T072                                                    |
| D20 | Medium   | Define real-time update animation choreography                                  | T036                   | **Requested** — animation patterns in T103; ACs added to T036                                            |
| D21 | Low      | Add numerical formatting utilities to T099                                      | T099                   | **Requested** — utilities added to T099 ACs                                                              |
| D22 | Low      | Consider swipe/gesture interactions for mobile                                  | Phase 10 stretch       | **Requested** — stretch goal added to T083                                                               |
| D23 | Low      | Add contextual help / onboarding as stretch goal                                | Phase 10 stretch       | **Requested** — stretch goal added to T088                                                               |
| D24 | Low      | Define table component pattern for data-dense screens                           | Design system          | **Requested** — included in T103                                                                         |
| D25 | Low      | Add page transition design as stretch goal                                      | Phase 10 stretch       | **Requested** — stretch goal added to T083                                                               |
| D26 | Low      | Define badge/indicator design variants                                          | Design system          | **Requested** — included in T103                                                                         |

**All 26 findings accepted.** Task count: 103 → 106 (+T103, +T104, +T105). Multiple existing tasks received additional acceptance criteria (T002, T014, T021, T024, T027, T030, T035, T036, T038, T046, T048, T050, T052, T062, T069, T070, T072, T073, T074, T082, T083, T084, T088, T090, T092, T093, T099).

---

## What is already done well

1. **Responsive is mentioned in key tasks** — T036, T046, T052, T062, T069 all include "responsive" in their acceptance criteria. The awareness is there, even if the strategy is not.
2. **Accessibility baseline exists** — The SWE review added WCAG AA requirements to T002 and T083. This is more than most projects have.
3. **Role-aware navigation** — T090 specifies role-specific nav items, which is the right starting point for role-specific UX.
4. **Mobile layout in nav shell** — T090 specifies "bottom bar or collapsible drawer" for mobile, avoiding the desktop sidebar mistake.
5. **Touch target size** — T083 includes "touch targets ≥ 44×44 px" which is the correct minimum.
6. **i18n from day one** — T099 sets up bilingual support before any UI is built. This prevents the common mistake of hardcoding strings.
7. **Currency formatting utility** — T099 includes `formatMoney(cents)` which ensures consistent money display.
