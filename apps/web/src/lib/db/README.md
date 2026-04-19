# Database connection — Neon Postgres

> Task: T005. See also `docs/research/postgres-providers.md` for provider rationale.

## Branch mapping

| Environment       | Neon branch | Endpoint                                                 |
| ----------------- | ----------- | -------------------------------------------------------- |
| Production        | `main`      | `ep-wild-hill-angoy5u6.c-6.us-east-1.aws.neon.tech`      |
| Preview (Vercel)  | `staging`   | `ep-long-dawn-anr649ox.c-6.us-east-1.aws.neon.tech`      |
| Local development | `dev`       | `ep-wandering-boat-anl4xtql.c-6.us-east-1.aws.neon.tech` |

## Dual-driver policy

This app uses **two Neon drivers**, each for a specific purpose. Do not swap them.

### `getDb()` — HTTP driver (default)

```typescript
import { getDb } from "@/lib/db";
const db = getDb();
```

**Use for:** reads, simple inserts/updates, Better Auth queries, SSE/realtime reads,
and any one-shot query that does not need a multi-statement interactive transaction.

**Why:** `neon-http` (`drizzle-orm/neon-http` + `neon()`) is stateless. It never opens
a persistent socket, so there is no stale-connection risk when Neon compute wakes from
sleep. Neon's own documentation recommends this driver for all non-transactional use.

**Never** call `.transaction()` on this driver — `drizzle-orm/neon-http` throws a
hardcoded `"No transactions support in neon-http driver"` error.

### `getTxDb()` — WebSocket Pool driver (transactions only)

```typescript
import { getTxDb } from "@/lib/db";
const txDb = getTxDb();
const result = await txDb.transaction(async (tx) => { … });
```

**Use for:** interactive `db.transaction(async (tx) => { … })` call sites that branch
conditionally on intermediate query results (e.g. `if (inserted.length === 0) refetch`).

**Current call sites** (the only 5 that use `getTxDb`):

- `cashier/checkout/actions.ts` — `processCheckout`
- `tickets/actions/index.ts` — `createTicket`
- `tickets/edit-requests/actions.ts` — `resolveEditRequest`
- `appointments/actions.ts` — `transitionAppointment`
- `batches/actions.ts` — `createBatch`

**Why Pool and not HTTP:** `neon-http`'s `sql.transaction([...])` only accepts a static
pre-built array of queries — no `BEGIN`/`COMMIT`, no conditional branching between
statements. `Pool` (WebSocket) supports full interactive transactions.

**Pool config:**

- `idleTimeoutMillis: 10_000` — evicts idle sockets before Neon compute can sleep them,
  preventing stale-socket errors on wake.
- `max: 5` — caps per-instance connections; Neon free tier allows 100 connections shared
  across all Vercel function instances.

**Do not** use `getTxDb()` for reads or simple writes — keep those on `getDb()`.
**Do not** share a transaction across both drivers — they own separate connections.

## Free tier limits

| Resource               | Limit             |
| ---------------------- | ----------------- |
| Storage                | 0.5 GB            |
| Compute hours          | 191.9 hours/month |
| Branches               | 10                |
| Concurrent connections | 100 (pooled)      |
| Databases per branch   | 500               |

Estimated production usage: ~28 MB for 6 months (see `docs/research/postgres-providers.md`).

## Error handling

- **Missing `DATABASE_URL`**: throws immediately with a clear message.
- **Cold start**: first query after inactivity takes 0.5–3s. The app shows a loading state during "Open Day" (T019). No special handling needed.
- **Network errors**: both drivers throw standard `Error` objects. Callers catch and surface via toast/error boundary.
- **Connection exhaustion**: not possible with `getDb()` (HTTP is stateless). `getTxDb()` is capped at `max: 5` per instance.

## Usage

```typescript
import { getDb, getTxDb, healthCheck } from "@/lib/db";

// Simple read or write — HTTP driver
const db = getDb();
const rows = await db.select().from(employees).where(eq(employees.isActive, true));

// Interactive transaction — WebSocket Pool driver
const txDb = getTxDb();
await txDb.transaction(async (tx) => {
  const [existing] = await tx.select().from(tickets).where(eq(tickets.id, id));
  if (existing.status !== "awaiting_payment") throw new Error("NOT_READY");
  await tx.update(tickets).set({ status: "closed" }).where(eq(tickets.id, id));
});

// Health check (for /api/health — T087)
const { ok, latencyMs } = await healthCheck();
```
