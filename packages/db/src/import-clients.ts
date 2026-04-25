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
import { createTxDb } from "./index";
import { clients } from "./schema";
import { or, eq } from "drizzle-orm";

// ─── CSV parser ───────────────────────────────────────────────────────────────

export interface ClientRow {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  noShowCount: number;
}

/**
 * RFC 4180 CSV line parser (T10R-R6). Handles quoted fields with embedded
 * commas, doubled-quote escapes ("Andrés ""Pepe"" Gómez"), and trims only
 * unquoted whitespace. Quoted fields are returned exactly as written.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let quotedField = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"' && cur === "") {
      inQuotes = true;
      quotedField = true;
      continue;
    }

    if (ch === ",") {
      out.push(quotedField ? cur : cur.trim());
      cur = "";
      quotedField = false;
      continue;
    }

    cur += ch;
  }

  out.push(quotedField ? cur : cur.trim());
  return out;
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

    rl.on("line", (raw) => {
      lineNum++;
      const line = lineNum === 1 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const values = parseCsvLine(line);

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

  // Intra-file dedup pass (T10R-R7). A row is rejected up-front if any earlier
  // row in the same file shared a phone or email. Rows missing both phone and
  // email cannot be safely deduped against the DB, so we refuse them with a
  // clear error rather than risk duplicating on re-run.
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const candidates: ClientRow[] = [];
  let intraFileSkipped = 0;
  const preErrors: Array<{ row: ClientRow; reason: string }> = [];

  for (const row of rows) {
    if (!row.phone && !row.email) {
      preErrors.push({
        row,
        reason:
          "Row has no phone and no email — cannot be deduplicated. Add one or remove the row.",
      });
      continue;
    }
    const phoneHit = row.phone ? seenPhones.has(row.phone) : false;
    const emailHit = row.email ? seenEmails.has(row.email) : false;
    if (phoneHit || emailHit) {
      intraFileSkipped++;
      continue;
    }
    if (row.phone) seenPhones.add(row.phone);
    if (row.email) seenEmails.add(row.email);
    candidates.push(row);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes will be written.\n");
    for (const row of candidates.slice(0, 5)) console.log(" ", JSON.stringify(row));
    if (candidates.length > 5) console.log(`  … and ${candidates.length - 5} more`);
    console.log(`\nIntra-file duplicates : ${intraFileSkipped}`);
    console.log(`Rows missing phone+email: ${preErrors.length}`);
    return;
  }

  const db = createTxDb(databaseUrl);

  let imported = 0;
  let dbSkipped = 0;
  const errors: Array<{ row: ClientRow; reason: string }> = [...preErrors];

  try {
    await db.transaction(async (tx) => {
      for (const row of candidates) {
        const conditions = [];
        if (row.phone) conditions.push(eq(clients.phone, row.phone));
        if (row.email) conditions.push(eq(clients.email, row.email));

        const existing = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(or(...conditions))
          .limit(1);

        if (existing.length > 0) {
          dbSkipped++;
          continue;
        }

        await tx.insert(clients).values({
          name: row.name,
          phone: row.phone,
          email: row.email,
          notes: row.notes,
          noShowCount: row.noShowCount,
        });

        imported++;
      }
    });
  } catch (err) {
    console.error("\nImport aborted; transaction rolled back.");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`\nImport complete:`);
  console.log(`  Imported              : ${imported}`);
  console.log(`  Skipped (db duplicate): ${dbSkipped}`);
  console.log(`  Skipped (intra-file)  : ${intraFileSkipped}`);
  console.log(`  Errors                : ${errors.length}`);

  for (const { row, reason } of errors) {
    console.error(`  ERROR [${row.name}]: ${reason}`);
  }

  if (errors.length > 0) process.exit(1);
}

const isCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /import-clients\.(ts|js|mjs)$/.test(process.argv[1]);

if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
