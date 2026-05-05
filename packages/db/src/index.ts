import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Required for neon-serverless WebSocket driver in Node.js runtime
neonConfig.webSocketConstructor = ws;

/**
 * HTTP driver — use for all reads, simple writes, Better Auth, and any
 * one-shot query that does not need a multi-statement interactive transaction.
 * Stateless: no sockets, no stale-connection risk on Neon compute wake.
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzleHttp({ client: sql, schema });
}

/**
 * WebSocket Pool driver — use ONLY for db.transaction(async (tx) => { … })
 * call sites that branch conditionally on intermediate query results.
 * neon-http throws "No transactions support" for these; Pool supports full
 * interactive BEGIN/COMMIT with conditional logic.
 *
 * Pool config rationale:
 * - idleTimeoutMillis: 10_000 — evicts sockets before Neon's compute can
 *   sleep them, preventing the stale-socket JSON parse error on wake.
 * - max: 5 — caps per-instance connections; Neon free tier has a 100-conn
 *   ceiling shared across all Vercel function instances.
 */
export function createTxDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    idleTimeoutMillis: 10_000,
    max: 5,
  });
  return drizzleWs({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;
export type TxDatabase = ReturnType<typeof createTxDb>;

export { schema };
export * from "./queries/analytics";
export * from "./queries/payroll";
export * from "./queries/craftables";
