# Technical feasibility and research

## Feasibility verdict

**Yes — the product is feasible** to design and build with the proposed stack. Requirements map to common patterns: catalog with variants, POS-style tickets, commissions vs piece-rate, work orders/batches, appointments, settlements/payouts, and reporting. The main area that needs explicit architecture (not just “a feature”) is **offline usage and sync**.

---

## Stack fit

| Piece | Assessment |
|-------|----------------|
| **Next.js (monorepo)** | Strong fit: API routes or server actions, SSR/SSG where useful, shared packages in a monorepo (e.g. Turborepo). |
| **React + Base UI** | Feasible; validate Base Web (Uber) vs other “Base UI” naming in a small spike with your target Next.js version. |
| **Vercel** | Fits for web app + serverless API; long-running or heavy batch jobs may need a separate worker or cron (Vercel Cron or external). |
| **PostgreSQL** | Natural fit for relational data (orders, payments, catalog, assignments, payouts). |

---

## Research: offline-first and PWA (Next.js)

**Goal from the business:** Data can be saved locally when the internet is missing and synchronized when connectivity returns.

**Common building blocks** (aligned with current Next.js PWA guidance and community practice):

1. **Service Worker** — Network proxy, caching strategies, optional background work.  
2. **Web App Manifest** — Installability and “app-like” behavior on phones ([Next.js PWA docs](https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps)).  
3. **IndexedDB** — Durable structured storage for a **local queue** of user actions and cached reads.  
4. **Queue + replay** — When online, flush queued mutations to the API; show sync status in the UI.

**Libraries often mentioned:** Workbox, `next-pwa` (evaluate maintenance status for your Next.js major version before committing).

**Important product decision:** Not every action should be “fully offline final.” For **charging a customer**, many teams keep **server-side confirmation** as the source of truth and allow **drafts offline** or **queue with idempotent completion** to avoid double charges. Align with stakeholders.

---

## Research: idempotency and safe retries

Offline replay implies **retries**. APIs that create money movement or inventory should be **idempotent**:

- Client sends a **stable idempotency key** (e.g. UUID) per intended operation.  
- Server stores the key and **returns the same result** on duplicate delivery (Stripe-style pattern).  
- PostgreSQL can hold an **idempotency** table **in the same transaction** as business writes for consistency (see e.g. [Brandur’s idempotency keys with Postgres](https://brandur.org/idempotency-keys)).

This is **required** for trustworthy sync, not optional polish.

---

## Major technical risks and mitigations

| Risk | Mitigation |
|------|------------|
| Duplicate charges or duplicate jobs after reconnect | Idempotent mutations + clear “pending / synced” UI states. |
| Conflict when two devices edit the same entity | Define rules (e.g. server wins on price; last-write with audit; or domain-specific merge). |
| Payroll disputes | Immutable event log or append-only financial events where possible; admin audit trail. |
| Scope creep on notifications | Phase appointment **confirmation**; integrate one channel at a time. |

---

## Analytics approach

- **MVP:** SQL aggregations over indexed tables (by day/week/month, by employee).  
- **Scale later:** Materialized views, nightly rollups, or a small analytics schema if volume grows.

---

## References (external)

- Next.js — Progressive Web Apps: https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps  
- Idempotency keys pattern (Postgres): https://brandur.org/idempotency-keys  

---

## Original feasibility summary (preserved)

The following is the feasibility assessment from the initial ideation conversation, kept for traceability.

### Feasibility table

| Area | Verdict |
|------|--------|
| Roles (stylist types, clothier, secretary, cashier/admin) | Straightforward: auth + role-based access + different screens per role. |
| Job catalog + variants (e.g. haircut by length) | Standard “product / service with options” modeling in Postgres. |
| Stylists paid % of job | Store price, commission % (or fixed amount) per job/variant; compute line totals and daily rollups. |
| Clothiers paid per piece | “Piece” as catalog rows with unit pay; batches link pieces to clothiers. |
| Secretary: bookings, confirmations, cloth batches | Calendar + notifications (email/SMS/WhatsApp) are integrations; core data model is normal. |
| Cashier: charge customer, payment method, close job | One transactional flow: create bill → record payment(s) → mark job done. |
| Pay employees later + audit trail | Separate “payout” or “settlement” records (who, when, how much, period), not only “job done”. |
| Big cloth orders (deposit, balance, assignee, notes) | Classic order / line items / payments / balance due. |
| Vacations & attendance | Employee calendar + exceptions (vacation, sick, no-show) feeding scheduling and reports. |
| Analytics (day/week/month, top performers) | Postgres aggregates + indexes; pre-aggregation optional at scale. |
| Responsive (PC + phones) | React + component library + responsive layout is normal scope. |
| Offline + sync | **Doable but hardest part**; needs explicit product and engineering design. |

### Bottom line (from ideation)

The product is **designable and buildable** with Next.js, React, Postgres, and Vercel, including responsive layouts and analytics. Treat **offline sync and payment finalization** as a dedicated design slice: define which actions are offline-capable vs online-only, idempotency, and conflict rules.
