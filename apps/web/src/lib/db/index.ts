import { createDb, type Database } from "@befine/db";

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

export function getDb(): Database {
  if (!_db) {
    _db = createDb(getDatabaseUrl());
  }
  return _db;
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
