/**
 * CI: the journal stays in date order, and migrations this PR adds don't break the
 * running version. Run from packages/db: check-migrations.ts [base git ref]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { breakingStatements, outOfOrder, type JournalEntry } from "./migration-check";

const JOURNAL = "drizzle/meta/_journal.json";
const entriesOf = (json: string) => (JSON.parse(json) as { entries: JournalEntry[] }).entries;

const entries = entriesOf(readFileSync(JOURNAL, "utf8"));
const problems = outOfOrder(entries).map(
  (tag) => `${tag}: dated before an earlier migration, so it would be skipped on production`,
);

const base = process.argv[2];
if (base) {
  const before = new Set(
    entriesOf(
      execFileSync("git", ["show", `${base}:packages/db/${JOURNAL}`], { encoding: "utf8" }),
    ).map((e) => e.tag),
  );
  for (const { tag } of entries.filter((e) => !before.has(e.tag)))
    for (const statement of breakingStatements(readFileSync(`drizzle/${tag}.sql`, "utf8")))
      problems.push(
        `${tag}: breaks the running version: ${statement}\n  Split it over two releases, or add "-- migration-safe: <why>" once reviewed.`,
      );
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Migrations OK (${entries.length}).`);
