# Database connection — Neon Postgres

> Task: T005. See also `docs/research/postgres-providers.md` for provider rationale.

## Branch mapping

| Environment       | Neon branch | Endpoint                                                 |
| ----------------- | ----------- | -------------------------------------------------------- |
| Production        | `main`      | `ep-wild-hill-angoy5u6.c-6.us-east-1.aws.neon.tech`      |
| Preview (Vercel)  | `staging`   | `ep-long-dawn-anr649ox.c-6.us-east-1.aws.neon.tech`      |
| Local development | `dev`       | `ep-wandering-boat-anl4xtql.c-6.us-east-1.aws.neon.tech` |

## Driver choice

**`@neondatabase/serverless`** with the `neon()` HTTP query function.

| Runtime              | Driver          | Why                                               |
| -------------------- | --------------- | ------------------------------------------------- |
| Edge Functions       | `neon()` (HTTP) | No TCP sockets available; HTTP works natively     |
| Serverless Functions | `neon()` (HTTP) | Avoids connection pooling complexity on free tier |
| Server Components    | `neon()` (HTTP) | Same as above; single-shot queries fit HTTP model |

We do **not** use `Pool` or `Client` from `@neondatabase/serverless` because:

- The HTTP-based `neon()` function has no connection limits to exhaust.
- Neon handles server-side connection pooling transparently.
- `Pool`/`Client` would require WebSocket shims in Edge and add complexity.

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
- **Cold start**: first query after inactivity takes 0.5–3s. The app shows a loading state during "Open Day" (T019). No special handling needed — `neon()` waits for compute to wake.
- **Network errors**: `neon()` throws standard `Error` objects. Callers should catch and surface via toast/error boundary.
- **Connection exhaustion**: not possible with HTTP-based `neon()`. The HTTP endpoint is stateless.

## Usage

```typescript
import { getDb, healthCheck } from "@/lib/db";

// Run a query
const sql = getDb();
const rows = await sql`SELECT * FROM employees WHERE is_active = true`;

// Health check (for /api/health — T087)
const { ok, latencyMs } = await healthCheck();
```
