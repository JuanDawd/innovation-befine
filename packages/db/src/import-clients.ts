#!/usr/bin/env tsx
/**
 * T100 — Client data migration from CSV
 *
 * Imports existing client records from a CSV file into the `clients` table.
 * Idempotent: safe to run multiple times. Duplicate detection by phone or email.
 *
 * CSV format (header row required):
 *   name,phone,email,notes,no_show_count
 *
 * Only `name` is required. Other columns are optional.
 *
 * Usage:
 *   DATABASE_URL=postgres://... tsx packages/db/src/import-clients.ts clients.csv
 *   DATABASE_URL=postgres://... tsx packages/db/src/import-clients.ts clients.csv --dry-run
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createDb } from "./index";
import { clients } from "./schema";
import { or, eq } from "drizzle-orm";

// ─── CSV parser ───────────────────────────────────────────────────────────────

interface ClientRow {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  noShowCount: number;
}

function parseRow(headers: string[], values: string[]): ClientRow | null {
  const get = (key: string) => values[headers.indexOf(key)]?.trim() ?? "";

  const name = get("name");
  if (!name) return null;

  const phone = get("phone") || null;
  const email = get("email") || null;
  const notes = get("notes") || null;
  const noShowRaw = parseInt(get("no_show_count") || "0", 10);
  const noShowCount = isNaN(noShowRaw) || noShowRaw < 0 ? 0 : noShowRaw;

  return { name, phone, email, notes, noShowCount };
}

async function readCsv(filePath: string): Promise<ClientRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ClientRow[] = [];
    let headers: string[] = [];
    let lineNum = 0;

    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

    rl.on("line", (line) => {
      lineNum++;
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));

      if (lineNum === 1) {
        headers = values.map((h) => h.toLowerCase());
        if (!headers.includes("name")) {
          rl.close();
          reject(new Error('CSV must have a "name" column in the header row'));
        }
        return;
      }

      if (!line.trim()) return;
      const row = parseRow(headers, values);
      if (row) rows.push(row);
    });

    rl.on("close", () => resolve(rows));
    rl.on("error", reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!filePath) {
    console.error("Usage: tsx import-clients.ts <file.csv> [--dry-run]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log(`Reading ${filePath}…`);
  const rows = await readCsv(filePath);
  console.log(`Parsed ${rows.length} client row(s)`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes will be written.\n");
    for (const row of rows.slice(0, 5)) console.log(" ", JSON.stringify(row));
    if (rows.length > 5) console.log(`  … and ${rows.length - 5} more`);
    return;
  }

  const db = createDb(databaseUrl);

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: ClientRow; reason: string }> = [];

  for (const row of rows) {
    try {
      const conditions = [];
      if (row.phone) conditions.push(eq(clients.phone, row.phone));
      if (row.email) conditions.push(eq(clients.email, row.email));

      if (conditions.length > 0) {
        const existing = await db
          .select({ id: clients.id })
          .from(clients)
          .where(or(...conditions))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }
      }

      await db.insert(clients).values({
        name: row.name,
        phone: row.phone,
        email: row.email,
        notes: row.notes,
        noShowCount: row.noShowCount,
      });

      imported++;
    } catch (err) {
      errors.push({ row, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped} (duplicates by phone or email)`);
  console.log(`  Errors   : ${errors.length}`);

  for (const { row, reason } of errors) {
    console.error(`  ERROR [${row.name}]: ${reason}`);
  }

  if (errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
