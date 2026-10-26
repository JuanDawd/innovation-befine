/**
 * T135 — wipe test data, keep the setup.
 *
 * Empties every operational table (pedidos, production, stock, tickets,
 * checkouts, payments, payouts, business days, clients, appointments,
 * absences, notifications, activity log) and restarts pedido numbering at
 * #0001; the archived previous-model tables are emptied as well. Keeps users and their logins, employees, the service and garment
 * catalog, sizes and colours, and business settings. Idempotent: running it
 * twice leaves the same empty state.
 *
 * Two guards, both required:
 *   --confirm-reset                       explicit intent
 *   RESET_CONFIRM_HOST=<database host>    you typed the host you are wiping
 *
 * Run: RESET_DATABASE_URL=… RESET_CONFIRM_HOST=ep-….neon.tech \
 *        node --import tsx/esm src/reset-test-data.ts --confirm-reset
 *
 * Never point it at production.
 */

import { sql } from "drizzle-orm";
import { createDb, type Database } from "./index";

/** Tables that survive a reset (everything else in "public" is emptied). */
export const KEEP_TABLES = new Set([
  "__drizzle_migrations",
  "users",
  "accounts",
  "sessions",
  "verifications",
  "employees",
  "services",
  "service_variants",
  "cloth_pieces",
  "cloth_piece_variants",
  "garment_sizes",
  "garment_colors",
  "business_settings",
]);

/** Pure: which tables a reset empties, given what exists. */
export function tablesToReset(existing: string[]): string[] {
  return existing.filter((t) => !KEEP_TABLES.has(t)).sort();
}

/** Pure: the guards. Returns why it refuses, or null to proceed. */
export function resetRefusal(input: {
  argv: string[];
  url: string | undefined;
  confirmHost: string | undefined;
}): string | null {
  if (!input.argv.includes("--confirm-reset"))
    return "Refusing: pass --confirm-reset (this empties every operational table).";
  if (!input.url) return "Refusing: RESET_DATABASE_URL is not set.";
  let host: string;
  try {
    host = new URL(input.url).hostname;
  } catch {
    return "Refusing: RESET_DATABASE_URL is not a valid URL.";
  }
  if (!input.confirmHost) return `Refusing: set RESET_CONFIRM_HOST to the host you mean to wipe.`;
  if (input.confirmHost !== host)
    return "Refusing: RESET_CONFIRM_HOST does not match the database host.";
  return null;
}

/**
 * Empties the operational tables of `db`; returns which ones. The "archive"
 * schema (previous model, migration 0054) is emptied too: its tables still
 * reference business days, clients and payouts, and in a test environment
 * they only hold old test data.
 */
export async function resetTestData(db: Database): Promise<string[]> {
  const res = await db.execute(
    sql`SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'archive')`,
  );
  const rows = res.rows as { schemaname: string; tablename: string }[];
  const tables = [
    ...tablesToReset(rows.filter((r) => r.schemaname === "public").map((r) => r.tablename)),
    ...rows
      .filter((r) => r.schemaname === "archive")
      .map((r) => `archive.${r.tablename}`)
      .sort(),
  ];
  // No CASCADE: if a kept table ever references a wiped one, Postgres refuses
  // instead of silently emptying the kept table too.
  if (tables.length > 0)
    await db.execute(
      sql.raw(
        `TRUNCATE ${tables
          .map((t) => (t.startsWith("archive.") ? `"archive"."${t.slice(8)}"` : `"public"."${t}"`))
          .join(", ")} RESTART IDENTITY`,
      ),
    );
  return tables;
}

async function main() {
  const url = process.env.RESET_DATABASE_URL;
  const refusal = resetRefusal({
    argv: process.argv,
    url,
    confirmHost: process.env.RESET_CONFIRM_HOST,
  });
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  const tables = await resetTestData(createDb(url!));
  console.log(`Emptied ${tables.length} tables; kept ${[...KEEP_TABLES].join(", ")}.`);
  process.exit(0);
}

if (process.argv[1]?.endsWith("reset-test-data.ts")) void main();
