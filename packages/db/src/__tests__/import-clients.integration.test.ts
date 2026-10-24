import { it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inArray } from "drizzle-orm";
import { createDb } from "../index";
import { clients } from "../schema";
import { describeDb } from "../queries/__tests__/helpers/test-db";

// M-09 — the CLI end to end against the throwaway database: validation,
// the ids file, and --undo. Commits rows (unique per run) in that database.

const dir = mkdtempSync(join(tmpdir(), "befine-import-"));
const script = resolve(__dirname, "../import-clients.ts");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", ["--import", "tsx/esm", script, ...args], {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describeDb("import-clients CLI", () => {
  it("imports valid rows only, writes their ids, and --undo deactivates them", () => {
    const tag = Date.now().toString().slice(-7);
    const csv = join(dir, "clients.csv");
    writeFileSync(
      csv,
      [
        "name,phone,email,notes",
        `Ana ${tag},300${tag},,`,
        `Bea ${tag},,bea${tag}@example.com,VIP`,
        `Mala ${tag},300-ABC,,`, // invalid phone
        `Correo ${tag},,no-es-email,`, // invalid email
      ].join("\n"),
    );

    const result = run([csv]);
    expect(result.code).toBe(1); // invalid rows are reported as errors
    expect(result.out).toMatch(/Imported\s+: 2/);
    expect(result.out).toMatch(/ERROR \[Mala .*invalid characters/);
    expect(result.out).toMatch(/ERROR \[Correo .*not valid/);

    const idsFile = readdirSync(dir).find((f) => f.includes(".import-"));
    expect(idsFile).toBeDefined();
    const ids = readFileSync(join(dir, idsFile!), "utf8").trim().split("\n");
    expect(ids).toHaveLength(2);

    const undo = run(["--undo", join(dir, idsFile!)]);
    expect(undo.code).toBe(0);
    expect(undo.out).toContain("Deactivated 2 of 2");

    return createDb(process.env.TEST_DATABASE_URL!)
      .select({ isActive: clients.isActive })
      .from(clients)
      .where(inArray(clients.id, ids))
      .then((rows) => expect(rows.map((r) => r.isActive)).toEqual([false, false]));
  });
});
