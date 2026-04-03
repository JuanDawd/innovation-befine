# Research: PostgreSQL providers

> Researched: April 2026. Options evaluated: **Neon**, **Supabase**, **AWS RDS**.

---

## Summary table

| | Neon | Supabase | AWS RDS |
|--|------|----------|---------|
| **Type** | Serverless Postgres | BaaS platform (Postgres + extras) | Managed instance-based Postgres |
| **Free tier** | Yes — 0.5 GB storage, 100 CU-h/mo | Yes — limited project | No meaningful free tier |
| **Starting paid price** | Usage-based, no minimum (pay only what you use) | ~$25/month flat | ~$50+/month (single AZ); $550+/month (Multi-AZ production) |
| **Scale to zero** | Yes — auto-suspends after inactivity | No | No |
| **DB branching** | Instant copy-on-write (sub-second, 10 free branches) | Slower (provisions new DB) | Manual |
| **Vercel integration** | Native — official Vercel Postgres integration | Works but not native | Works, extra config |
| **Bundled extras** | None (pure Postgres) | Auth, Realtime, Storage, Edge Functions | None (DB only) |
| **Vendor lock-in** | Low (standard Postgres) | Medium (extras tie you to platform) | Low (standard Postgres) |

---

## Neon

### Pros
- **Best Vercel fit**: official Vercel Postgres integration; serverless driver optimized for edge/serverless.
- **Scale to zero**: auto-suspends after 5 minutes of inactivity — no idle cost.
- **Instant branching**: copy-on-write branches in <1 second; great for CI and staging environments. Only the diff is billed.
- **Fully usage-based**: no minimum fee since December 2025; pay only what you use.
- **Pure Postgres**: no abstraction layer; migrate away any time.
- **Free tier** is generous enough to develop and test for free.

### Cons
- **No bundled extras**: no built-in auth, realtime subscriptions, storage — you assemble those separately.
- **Relatively newer** than RDS; smaller track record at very high production volume.
- **Cold start latency**: auto-suspend means the first query after inactivity takes slightly longer (typically <1 second).

### Pricing summary
- Free: 0.5 GB storage, 100 CU-h/month.
- Paid: $0.106/CU-h (Launch) or $0.222/CU-h (Scale) + $0.35/GB-month storage.

---

## Supabase

### Pros
- **Full platform**: Postgres + built-in auth, realtime subscriptions, file storage, edge functions — one product to set up.
- If we were not already choosing separate services for auth and realtime, Supabase could replace multiple vendors.
- **Dashboard and studio**: good visual UI for browsing data in development.
- **Row-level security (RLS)** built into their pattern; strong for permission-heavy apps.
- Free tier available.

### Cons
- **Platform coupling**: if you use their auth, realtime, and storage, migrating later becomes complex.
- **No scale to zero**: instances run 24/7, so idle cost is constant.
- **More expensive at the floor**: $25/month flat for the first paid plan.
- **Slower branching**: provisioning a new DB per branch is slower and costlier than Neon's copy-on-write.
- **Realtime is good but proprietary**: uses their own pub/sub layer on top of Postgres WAL; you would still need a real-time service for Vercel (SSE or managed).

### Pricing summary
- Free: limited (1 project actively, pauses after inactivity).
- Pro: ~$25/month.

---

## AWS RDS (PostgreSQL)

### Pros
- **Battle-tested**: most proven at enterprise scale and multi-region setups.
- **Full control**: instance size, storage type, I/O, multi-AZ, read replicas — all configurable.
- **No cold start**: always on; consistent latency.
- Integrates with entire AWS ecosystem.

### Cons
- **Expensive**: no meaningful free tier; $50+/month for a small single-AZ instance; $550+/month for production-grade Multi-AZ before storage and I/O charges.
- **No scale to zero**: you pay whether the DB is in use or not.
- **Operational overhead**: you manage instance sizing, patching schedules, backup windows.
- **No branching**: creating a test environment requires manual effort.
- **Worse Vercel DX**: not designed for serverless; need to manage connection pooling (PgBouncer or RDS Proxy) separately.
- **Overkill** for a single-location internal company tool at this stage.

---

## Recommendation for this project

**Neon** is the best fit:

1. **Vercel-native**: no configuration glue; works out of the box.
2. **Free during development**: build and test at zero cost.
3. **Usage-based in production**: cost scales with actual use, not a flat instance fee.
4. **Branching for CI**: a staging/test branch per PR is trivial.
5. **Pure Postgres**: no lock-in; Drizzle ORM talks to standard Postgres.

Supabase is worth revisiting only if the team later wants to consolidate realtime into one vendor. RDS is not recommended unless the product grows to enterprise scale or requires multi-region compliance.

---

## Storage capacity estimate (free tier)

> Added April 2026 (H-07 resolution). Estimates whether 6 months of production data fits within Neon's 0.5 GB free tier.

### Assumptions

- Business operates 6 days/week (~26 days/month, ~156 days in 6 months)
- ~20 employees, ~500 saved clients
- ~50 tickets/day, ~3 items per ticket
- ~30 appointments/day
- ~5 cloth batches/day, ~10 pieces per batch
- ~1 payout per employee per period (bi-weekly → ~12 payouts/employee in 6 months)

### Row estimates (6 months)

| Table | Rows | Avg row size | Estimated size |
|-------|------|-------------|---------------|
| `employees` | 20 | 200 B | ~4 KB |
| `clients` | 500 | 150 B | ~75 KB |
| `business_days` | 156 | 100 B | ~16 KB |
| `tickets` | 7,800 | 200 B | ~1.5 MB |
| `ticket_items` | 23,400 | 250 B | ~5.6 MB |
| `ticket_payments` | 7,800 | 150 B | ~1.1 MB |
| `appointments` | 4,680 | 300 B | ~1.4 MB |
| `cloth_batches` | 780 | 200 B | ~150 KB |
| `batch_pieces` | 7,800 | 200 B | ~1.5 MB |
| `large_orders` | 50 | 400 B | ~20 KB |
| `large_order_payments` | 150 | 150 B | ~22 KB |
| `payouts` | 240 | 250 B | ~60 KB |
| `payout_ticket_items` | 23,400 | 50 B | ~1.1 MB |
| `payout_batch_pieces` | 7,800 | 50 B | ~380 KB |
| `employee_absences` | 500 | 100 B | ~50 KB |
| `catalog_audit_log` | 200 | 500 B | ~100 KB |
| Auth tables (users, sessions) | 500 | 300 B | ~150 KB |
| **Indexes** (estimated) | — | — | ~15 MB |
| **Total estimated** | — | — | **~28 MB** |

### Verdict

6 months of production data is estimated at **~28 MB**, well within the **0.5 GB (512 MB)** free tier limit. The analytics seed script (T101) generating the same volume should also fit comfortably.

**Upgrade threshold:** At the current growth rate, the database would reach 0.5 GB after approximately **8–10 years** of production use. Monitor via Neon dashboard; set an alert at 400 MB.

The free tier is sufficient for the foreseeable future. Upgrading to the paid tier ($0.35/GB-month) is not needed for MVP.

---

## Cold start mitigation

> Added April 2026 (H-12 resolution). Addresses the Neon free-tier auto-suspend delay.

### The issue

Neon free tier auto-suspends the compute endpoint after **5 minutes of inactivity**. The first query after suspension takes **~0.5–2 seconds** to re-activate ("cold start"). For a POS system, this delay affects the first transaction of the business day — specifically the "Open Day" action (T019).

### Mitigation: loading state (chosen approach)

Add a clear loading state (spinner + "Connecting..." message) to the "Open Day" button in T019. The user sees immediate feedback that the operation is in progress. Once the DB responds, the UI transitions to the normal state.

This is the simplest approach and requires no additional infrastructure.

### Alternatives (not chosen for MVP)

- **Keep-alive cron:** A scheduled function (Vercel Cron or GitHub Actions) pings the DB every 4 minutes to prevent suspension. This eliminates cold starts but adds complexity and consumes compute hours from the free tier.
- **Disable auto-suspend:** Available on paid tiers only. Eliminates cold starts entirely but incurs a monthly cost.
- **Connection pooling:** Neon's connection pooler reduces connection setup time but does not eliminate the compute cold start.

### Recommendation

Use the loading state approach for MVP. If the delay is noticeable in practice (staff report frustration), evaluate the keep-alive cron as a follow-up.
