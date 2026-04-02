# Innovation Befine — Business document

## Brief description

Innovation Befine is an internal operations platform for a beauty and fashion company of the same name. It replaces manual spreadsheets and verbal coordination by centralizing **daily service tracking, point-of-sale checkout, employee payroll, cloth production batches, client appointments, and management analytics** in a single web application.

The app is used exclusively by company staff on desktop PCs and mobile phones; it is not a public-facing product.

---

## Target client

**Single client:** Innovation Befine (the company itself).

| Who uses it | How |
|-------------|-----|
| Cashier / admin | Checkout, catalog management, payroll settlement, analytics, business day open/close |
| Stylists | Log completed services; view own earnings |
| Clothiers | View assigned batches; mark pieces done |
| Secretary | Book and confirm appointments; create cloth batches |

---

## Problem it solves

The company currently tracks daily services, employee pay, and cloth production manually (spreadsheets, verbal reports, paper notes). This causes:

- **Lost revenue:** services not captured before a customer leaves.
- **Payroll errors:** no single source of truth for what each employee did or was paid.
- **No visibility:** management cannot quickly answer "how much did we make today?" or "who earned what this week?".
- **Production confusion:** clothiers do not have a clear list of what to make each day or what is linked to a large client order.
- **Appointment chaos:** no central record of who is coming, at what time, and with which stylist — leading to double-bookings and missed confirmations.

---

## What the app does (feature summary)

| Area | Key features |
|------|-------------|
| **Services & checkout** | Stylist logs a service → cashier dashboard updates live → cashier charges customer (cash/card/transfer) → ticket closed |
| **Catalog** | Admin defines service types, variants (e.g. haircut by hair length), prices, commission %, cloth piece types and clothier pay |
| **Client records** | Saved clients (name, contact, history, no-show count) or one-time guests |
| **Appointments** | Timed bookings per stylist, double-booking prevention, confirmation email, no-show tracking |
| **Cloth batches** | Secretary assigns pieces to clothiers; clothiers mark done; admin/secretary approves |
| **Large cloth orders** | Client order with deposit, balance owed, status flow, linked to batches for ETA tracking |
| **Payroll** | Earnings computed per model (commission %, per-piece, fixed daily); payout recorded with amount, date, and method |
| **Business day** | Admin opens and closes the day (can span midnight); all records belong to the open business day |
| **Analytics** | Revenue and employee earnings by day / week / month with period-over-period comparison |
| **Offline** | Local queue for service logs; safe replay on reconnect; no duplicate charges |

---

## Tech stack

| Layer | Technology | Decision basis |
|-------|-----------|----------------|
| Framework | Next.js (App Router) + Turborepo monorepo | SSR, API routes, server actions; monorepo for shared types |
| UI | React + Base UI (Base Web by Uber) | Requested by client; validate App Router compatibility in Phase 0 spike |
| Hosting | Vercel | Seamless Next.js deploy; free tier sufficient for MVP |
| Database | PostgreSQL via **Neon** | Serverless, Vercel-native integration, usage-based pricing, free in development |
| ORM | Drizzle ORM | TypeScript-native, lightweight, works well with Neon's serverless driver |
| Auth | **Better Auth** | Self-hosted, free, built-in RBAC + 2FA; no vendor lock-in; data stays in own DB |
| Real-time | **Pusher** (free tier) → native SSE + Postgres LISTEN/NOTIFY later | Live cashier dashboard; Pusher free tier covers MVP; migrate when ready |
| Email | **Resend** (free tier) | Appointment confirmation emails; React Email templates; 100 emails/day free |
| Error tracking | Sentry (free tier) | Phase 10 |
| PWA / offline | Workbox + IndexedDB | Phase 9 — service worker caching + local mutation queue |

> Full research and rationale for each decision: see `docs/research/`.

---

## Infrastructure costs (MVP — free tiers)

All services listed below are used on their **free tier** during MVP. Paid plans will be reviewed after 1–2 months of production use.

| Service | Free tier limits | First paid plan |
|---------|-----------------|----------------|
| **Vercel** | Unlimited personal projects, 100 GB bandwidth/mo | $20/mo (Pro) |
| **Neon** | 0.5 GB storage, 100 CU-h/mo, 10 branches | Usage-based, no minimum |
| **Better Auth** | Free — self-hosted, no usage cap | Free forever |
| **Pusher** | 200 concurrent connections, 200K messages/day | $49/mo (Startup) |
| **Resend** | 100 emails/day, 1 domain | $20/mo (Pro) |
| **Sentry** | 5K errors/mo, 10K transactions | $26/mo (Team) |

**MVP infrastructure cost: $0/month.**

All free tiers are sufficient for an internal single-location tool during initial rollout. If usage grows, the first services likely to need upgrading are Resend (if appointment volume exceeds 100/day) and Vercel (if bandwidth or build minutes are exceeded — unlikely for internal tools).
