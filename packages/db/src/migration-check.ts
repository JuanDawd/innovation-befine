/**
 * Rules for migrations, now that production builds apply them automatically.
 * Pure; check-migrations.ts feeds it the repo's files in CI.
 */

export type JournalEntry = { tag: string; when: number };

/** Dated before their predecessors, so the migrator skipped them on production (H-48). */
const KNOWN_OUT_OF_ORDER = new Set([
  "0026_craftable_selling_price",
  "0027_craftables_rename",
  "0028_fix_sold_by_constraint_name",
]);

const BREAKING =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA|VIEW)|RENAME\s+(COLUMN|TO)|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|TRUNCATE|DELETE\s+FROM)\b/i;

/** Written in the file by whoever reviewed it: "-- migration-safe: why". */
const REVIEWED = /^[ \t]*--[ \t]*migration-safe:[ \t]*\S+/im;

/** The migrator skips any migration dated before the newest one applied. */
export function outOfOrder(entries: JournalEntry[]): string[] {
  let newest = 0;
  const bad: string[] = [];
  for (const e of entries) {
    if (e.when < newest && !KNOWN_OUT_OF_ORDER.has(e.tag)) bad.push(e.tag);
    newest = Math.max(newest, e.when);
  }
  return bad;
}

/** The old code keeps running against the new schema for a moment during a deploy. */
export function breakingStatements(sql: string): string[] {
  if (REVIEWED.test(sql)) return [];
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--") && BREAKING.test(line))
    .map((line) => line.trim());
}
