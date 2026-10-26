// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * T131 — every server action that changes data writes to the activity log
 * (spec §3.9.27).
 *
 * Static check over every "use server" file: an exported function that
 * mutates (a Drizzle insert/update/delete, raw INSERT/UPDATE/DELETE, or a
 * Better Auth admin write) — itself or through a same-file helper it calls —
 * must call logActivity, or a helper that does. Anything that legitimately
 * doesn't log is listed below with the reason.
 */

const SRC = join(__dirname, "..", "..");

/** Whole files outside the rule. */
const EXEMPT_FILES: Record<string, string> = {
  "app/(protected)/notifications/actions.ts":
    "read receipts and the user's own notifications, not business data",
};

/** Single functions outside the rule ("file#name"). */
const EXEMPT_FUNCTIONS: Record<string, string> = {
  "app/(protected)/produccion/actions.ts#remindClosings": "sends reminders only (notifications)",
};

const MUTATION = [
  /\.(insert|update|delete)\(\s*[a-zA-Z_.]+\s*\)/, // db.insert(table) / tx.update(table) / tx.delete(table)
  /\b(INSERT\s+INTO|UPDATE\s+[a-z_]+\s+(\w+\s+)?SET|DELETE\s+FROM)\b/, // raw SQL
  /auth\.api\.(createUser|setRole|banUser|unbanUser|setUserPassword|removeUser|updateUser|changePassword|revokeUserSessions)\(/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

type Fn = { name: string; exported: boolean; text: string };

function functionsOf(file: string): Fn[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const fns: Fn[] = [];
  const isExported = (n: ts.Node) =>
    ts.canHaveModifiers(n) &&
    (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of src.statements) {
    if (ts.isFunctionDeclaration(st) && st.name)
      fns.push({ name: st.name.text, exported: isExported(st), text: st.getText(src) });
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        )
          fns.push({ name: d.name.text, exported: isExported(st), text: st.getText(src) });
  }
  return fns;
}

const files = walk(SRC);
const isServerFile = (f: string) => /^\s*["']use server["']/.test(readFileSync(f, "utf8"));

/** Functions anywhere in src whose body logs — calling one counts as logging. */
const LOGGING_HELPERS = new Set(
  files
    .filter((f) => !isServerFile(f))
    .flatMap((f) => functionsOf(f))
    .filter((fn) => fn.exported && /\blogActivity\(/.test(fn.text))
    .map((fn) => fn.name),
);

function closure(fn: Fn, local: Map<string, Fn>, seen = new Set<string>()): string {
  if (seen.has(fn.name)) return "";
  seen.add(fn.name);
  let text = fn.text;
  for (const [name, other] of local)
    if (name !== fn.name && new RegExp(`\\b${name}\\(`).test(fn.text))
      text += "\n" + closure(other, local, seen);
  return text;
}

const logs = (text: string) =>
  /\blogActivity\(/.test(text) ||
  [...LOGGING_HELPERS].some((h) => new RegExp(`\\b${h}\\(`).test(text));

function violations() {
  const out: string[] = [];
  for (const file of files.filter(isServerFile)) {
    const rel = relative(SRC, file);
    if (EXEMPT_FILES[rel]) continue;
    const fns = functionsOf(file);
    const local = new Map(fns.map((f) => [f.name, f]));
    for (const fn of fns.filter((f) => f.exported)) {
      if (EXEMPT_FUNCTIONS[`${rel}#${fn.name}`]) continue;
      const text = closure(fn, local);
      if (MUTATION.some((re) => re.test(text)) && !logs(text)) out.push(`${rel}#${fn.name}`);
    }
  }
  return out.sort();
}

describe("activity log coverage (T131)", () => {
  it("finds the server action files", () => {
    expect(files.filter(isServerFile).length).toBeGreaterThan(20);
    expect(LOGGING_HELPERS.has("attachAfterHoursPayments")).toBe(true);
  });

  it("every server action that changes data writes to the activity log", () => {
    expect(violations()).toEqual([]);
  });

  it("exemptions point at real files and functions", () => {
    for (const rel of Object.keys(EXEMPT_FILES))
      expect(
        files.some((f) => relative(SRC, f) === rel),
        rel,
      ).toBe(true);
    for (const key of Object.keys(EXEMPT_FUNCTIONS)) {
      const [rel, name] = key.split("#");
      const file = files.find((f) => relative(SRC, f) === rel);
      expect(file && functionsOf(file).some((fn) => fn.name === name), key).toBe(true);
    }
  });
});
