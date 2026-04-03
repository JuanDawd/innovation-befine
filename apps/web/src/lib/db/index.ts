import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless driver connection.
 *
 * Uses the HTTP-based `neon()` query function — works in Edge Functions,
 * Serverless Functions, and Server Components without connection pooling.
 *
 * Connection strategy (T005):
 * - Edge Functions: use `neon()` (HTTP, no persistent connection)
 * - Serverless Functions: use `neon()` (HTTP) — no need for `Pool`
 *   on free tier since Neon handles connection pooling server-side
 * - Free tier limits: 100 concurrent connections (pooled), 500 hours
 *   of compute per month, 0.5 GB storage
 * - Connection exhaustion: `neon()` uses HTTP so it cannot exhaust
 *   connections. If the compute endpoint is suspended (cold start),
 *   the first query takes 0.5-3s extra to wake it up.
 */

neonConfig.fetchConnectionCache = true;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Check your .env.local file or Vercel environment variables.",
    );
  }
  return url;
}

let _sql: NeonQueryFunction<false, false> | undefined;

export function getDb(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(getDatabaseUrl());
  }
  return _sql;
}

export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}
