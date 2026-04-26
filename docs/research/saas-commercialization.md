# SaaS commercialization audit — Innovation Befine as a multi-tenant product

> Internal research draft. Audit of what it would take to sell the current Innovation Befine platform as a SaaS product to multiple companies: gaps to close, who to sell to, what to charge, and how to go to market. Not a plan of record — a starting point for that plan.
>
> Date: 2026-04-23
> Scope of audit: the codebase and planning docs as of commit `d826e67` (Phase 9 offline work largely done, Phase 10 polish + remediation pending).

---

## 1. What has actually been built

A production-grade **salon-and-workshop operations system** for one specific business (Innovation Befine, Colombia). Approximately 98 of 108 planned tasks are `done` across 10 phases.

Feature surface shipped:

- Auth + RBAC (Better Auth) with 4 roles (cashier_admin, secretary, stylist, clothier) and stylist subtypes
- Catalog (services with variants + commission %, cloth pieces with unit pay)
- Clients (saved profile + guest), with no-show tracking
- Tickets with full lifecycle (`logged → awaiting_payment → closed`, reopen, edit-approval flow)
- Cashier dashboard with live updates via native SSE
- Checkout with split payments, price override (with reason), optimistic locking, idempotency
- Appointments with double-booking prevention and confirmation states
- Cloth batches (assignment, piece completion, approval)
- Large cloth orders with payment ledger
- Payroll settlement for three pay models (commission, piece-rate, daily-rate) with audit trail
- Analytics with period-over-period comparison (Recharts)
- PWA + IndexedDB offline queue + service worker
- Sentry, Vitest + Playwright + @axe-core/playwright, i18n via next-intl (es primary, en secondary)

Stack is modern and defensible: Next.js App Router, Drizzle, Neon, Better Auth, TanStack Query, shadcn/ui + Tailwind, native SSE, Resend, Vercel, Turborepo.

Operational assumptions baked in: **COP integer pesos**, **America/Bogota** timezone (no DST), **Spanish primary**, **single location**, **one business**.

---

## 2. The wedge — what problem this actually solves

**Problem**: small and mid-sized salons, barbershops, spas, and tailor/textile workshops in LATAM run operations on WhatsApp + Excel. They lose money to untracked tickets, disputed commissions, double-booked appointments, and no visibility into who earned what across multiple pay models.

**Differentiator**: most competitors (Fresha, Booksy, Square Appointments, Treatwell) are **booking-first** tools that treat payroll as an afterthought. This product is **payroll-aware operations**: three pay models (percentage commission, piece-rate, daily-rate) computed server-side with full audit trail, plus the business-day-not-calendar-day model, plus integer-COP correctness, plus cloth-batch / large-order tracking.

**Wedge positioning**: _"Pay three different kinds of employees correctly, and prove it."_ Booking is commoditized; payroll correctness for mixed-model teams is not.

---

## 3. SaaS-readiness gaps — blocking a second customer

The product as-is cannot serve a second company. Gaps, in order of severity:

### 3.1 Multi-tenancy — the one non-negotiable

The schema has **no `organization_id`**. A grep of `packages/db/src/schema` for `tenant|organization|workspace|company_id` returns zero matches. Every table, every query, every RBAC check, and every SSE channel assumes a single business.

Work required:

- Add `organization_id uuid` to every business table (employees, tickets, business_days, catalog, clients, batches, orders, payouts, notifications, idempotency_keys, etc.)
- Postgres Row-Level Security as defense in depth
- Scope every Drizzle query by the session's organization
- Extend Better Auth session to carry `organization_id`; enforce it in middleware
- Scope SSE channels by organization (cross-org event leak is a privacy incident)
- Scope rate-limit keys by organization
- Rework seed and migration scripts
- Cross-tenant access test: authenticated user from org A gets 403/empty on any resource from org B

Realistic estimate: **4–8 focused weeks** to do it correctly. Shortcuts here become security incidents.

### 3.2 Billing and subscription

No Stripe, no plan gating, no trial logic, no dunning, no invoicing. In Colombia this also means **DIAN electronic invoicing** once you start charging Colombian businesses (consider Alegra, Siigo, or Facture integrations rather than building it).

### 3.3 Self-serve onboarding

The current admin-creates-accounts flow assumes one company exists. Needed:

- Signup → create organization
- Seed default catalog (or import from spreadsheet — T100 partially covers this)
- Invite staff by email with role assignment
- First-run checklist ("open your first business day")

### 3.4 Colombia-locked assumptions

COP-only, America/Bogota hardcoded, Spanish-primary, no currency formatter abstraction beyond COP. Fine as a beachhead — but pricing and copy need to reflect that international expansion is not day-one.

### 3.5 B2B-trust pending items

These are already in the backlog but matter more when customers are external:

- T086 backup policy and restore drill
- T087 uptime monitoring + `/api/health`
- T089 production cutover checklist
- T106 UAT
- T09R-R1 / R2 / R3 — Critical idempotency remediation (financial correctness claims)
- Status page (statuspage.io, Instatus, or a self-hosted equivalent)

### 3.6 Legal

Templates written once, reused per customer:

- Terms of Service
- Privacy Policy (Ley 1581 de 2012 in Colombia)
- Data Processing Agreement
- SLA (target 99.5% initially — don't overcommit)

---

## 4. Pricing

### 4.1 Anchoring

Reference points in the space:

- **Fresha** — free, takes a payment-processing cut. Not a model a bootstrapper can match.
- **Booksy** — ~$30/mo/seat. Per-seat breaks LATAM SMB deals.
- **Square Appointments** — freemium. No payroll.
- **Local ERPs** (Siigo, Alegra, Loggro) — $50–150/mo but not operations-specific.

**Price per location, not per seat.** LATAM SMBs reject per-seat pricing; the payroll multi-employee-type feature is the differentiator, so don't price against it.

### 4.2 Proposed plans

| Plan             | Target                          | Monthly (COP)     | Monthly (USD eq.) | Included                                                                                                     |
| ---------------- | ------------------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **Starter**      | solo/barber, ≤3 staff           | $89.000–$120.000  | ~$22–30           | 1 location, tickets, catalog, appointments, basic analytics, 1 admin                                         |
| **Professional** | 4–15 staff salons/workshops     | $249.000–$349.000 | ~$60–85           | Everything + full payroll (3 pay models), cloth batches, large orders, offline/PWA, all roles, all analytics |
| **Business**     | 16+ staff, multi-location later | $599.000+         | ~$150+            | Priority support, custom reports, CSV exports, early access to multi-location, dedicated onboarding          |

### 4.3 One-time and add-ons

- **Setup/migration fee**: $500.000–$1.500.000 COP per customer, one-time. Importing their clients/catalog/employees from spreadsheets is real work and closes the sale because it removes their single biggest objection ("I'd have to re-enter everything").
- **Per-location pricing** once multi-branch ships (post-MVP roadmap item).
- **Training workshops** for larger customers: $500.000 COP flat per 2-hour session.

### 4.4 Discounts to use strategically

- Annual billing: 2 months free (standard SaaS convention).
- Design partners (first 3 customers): 50% off for 12 months in exchange for a testimonial and weekly feedback calls.
- Accountant referral: 20% recurring commission for 12 months.

---

## 5. Ideal customer profile

Keep it tight — resist expanding until you have 10+ paying customers:

- Location: Colombia (Medellín, Bogotá, Cali first)
- Industry: salon, spa, barbershop, or tailoring workshop
- Staff: 4–20 employees with **at least two pay models in play** (this is the disqualifying/qualifying question)
- Current tooling: WhatsApp + Excel + paper
- Buyer: owner-operator (not a franchise manager — decision cycles are too long)

If they have only commission-based stylists and no piece-rate or daily-rate staff, they are a worse fit — Fresha/Booksy will likely serve them cheaper. Say no.

---

## 6. Go-to-market — channels in order of leverage

1. **Design partners via the founder's network.** Three salons at 50% off for a year in exchange for testimonial + weekly call. This is how the real ICP gets discovered, not a landing page.
2. **Spanish-language short-form content.** Instagram/TikTok, owner-operator perspective: _"cómo le pagué a mis 8 empleados sin hoja de cálculo"_. LATAM SMB owners live on short-form video.
3. **Gremios / industry associations.** Fenalco, beauty guilds, textile guilds. One sponsored workshop converts better than a month of ads at this stage.
4. **Direct outreach.** 50 walk-ins/DMs per week in one neighborhood. Demo on an iPad on-site. The cashier dashboard live-update is the "wow" moment.
5. **Accountant / gestor referrals.** The accountant who handles these businesses' legal payroll is the highest-leverage referral channel. 20% recurring commission for 12 months.

**Avoid paid ads** until the pitch is proven and there are 10+ paying customers. CAC will eat a bootstrapper at this stage.

---

## 7. Realistic phased path

| Phase                  | Duration   | What happens                                                                                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Foundation**      | Months 0–2 | Multi-tenancy, billing (Stripe + Bold/Wompi for local), onboarding flow, legal docs, close Critical T09R items. No selling.          |
| **B. Design partners** | Months 2–4 | 3 paying pilots at 50% off. Weekly feedback calls. Iterate pricing and onboarding copy.                                              |
| **C. Public launch**   | Months 4–6 | Landing page, Starter + Professional tiers published. Goal: 10 paying orgs.                                                          |
| **D. Scale features**  | Month 6+   | Multi-location (unlocks Business tier), WhatsApp reminders, DIAN electronic invoicing, currency/timezone config for MX/PE expansion. |

---

## 8. Risks and counter-arguments

- **Tenancy rewrite is underestimated.** 4–8 weeks assumes focused work with no scope creep. Realistic range is 6–12. Budget accordingly.
- **Compliance surface grows fast.** Ley 1581, DIAN invoicing, and eventually payment-processor KYC requirements. Each one is a slow legal lift, not an engineering lift.
- **Support load.** One support contact per customer per week is normal at first. At 20 customers this is a half-time job. Plan the hire.
- **Fresha as a free competitor.** Their pitch to salons is "free POS, we make money on payments." The counter is payroll-and-operations correctness, not booking features. Stay disciplined about not competing on booking depth.
- **Churn from non-ICP customers.** Customers with only commission staff will churn within 3 months because Booksy is cheaper. Qualify them out during the sales call.

---

## 9. Bottom line

The product is a strong single-tenant operations app with a defensible wedge (**payroll-aware operations for mixed-model teams**). To sell it as SaaS requires tenancy + billing + onboarding + legal — roughly **2 months of focused work** before the first external customer is safe.

Price **Professional around $249.000–$349.000 COP/month per location** with a one-time setup fee of $500.000–$1.500.000 COP. Sell to **4–20-employee Colombian salons and workshops with mixed pay models**, through **design partners, short-form Spanish content, and accountant referrals**. Lead the pitch with **payroll correctness**, never with booking.

---

## Appendix — derived from

- `docs/business-idea.md`
- `docs/project-plan.md`
- `docs/Business/progress.md` (task statuses as of commit `d826e67`)
- `docs/roadmap-post-mvp.md`
- Schema inspection of `packages/db/src/schema/` (confirmed no tenancy columns)
- `apps/web/src/app/(protected)/` route inventory (confirmed single-org assumption throughout)
