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
