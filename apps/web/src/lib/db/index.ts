import { createDb, createTxDb, type Database, type TxDatabase } from "@befine/db";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Check your .env.local file or Vercel environment variables.",
    );
  }
  return url;
}

let _db: Database | undefined;
let _txDb: TxDatabase | undefined;

/**
 * HTTP driver singleton — use for reads, simple writes, Better Auth, and
 * any query that does not need a multi-statement interactive transaction.
 */
export function getDb(): Database {
  if (!_db) {
    _db = createDb(getDatabaseUrl());
  }
  return _db;
}

/**
 * WebSocket Pool singleton — use ONLY inside db.transaction(async (tx) => { … })
 * call sites that branch on intermediate results. See packages/db/README.md.
 */
export function getTxDb(): TxDatabase {
  if (!_txDb) {
    _txDb = createTxDb(getDatabaseUrl());
  }
  return _txDb;
}

export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  try {
    const db = getDb();
    await db.execute("SELECT 1");
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}
