// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * T135 — the previous order/product model is gone from the code. Its tables
 * live on only in the "archive" schema (migration 0054); nothing in the app or
 * the db package may read or write them again. Runs in CI with the suite.
 */

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const SOURCES = [join(ROOT, "apps/web/src"), join(ROOT, "packages/db/src")];

/** Table names (SQL) and their Drizzle exports. */
const RETIRED = [
  "craftables",
  "craftable_pieces",
  "cloth_piece_assignments",
  "production_logs",
  "large_orders",
  "order_items",
  "large_order_payments",
  "catalog_audit_log",
  "payout_craftable_pieces",
  "productPieces",
  "largeOrders",
  "orderItems",
  "largeOrderPayments",
  "clothPieceAssignments",
  "productionLogs",
  "catalogAuditLog",
  "payoutProductPieces",
];

const SELF = "no-old-model.test.ts";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && name !== SELF ? [p] : [];
  });
}

describe("previous model retired (T135)", () => {
  it("no source file references a retired table or schema export", () => {
    const hits: string[] = [];
    for (const file of SOURCES.flatMap(walk)) {
      const text = readFileSync(file, "utf8");
      for (const name of RETIRED)
        if (new RegExp(`\\b${name}\\b`).test(text)) hits.push(`${relative(ROOT, file)}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it("the old screens are gone", () => {
    const appDir = join(ROOT, "apps/web/src/app/(protected)");
    for (const dir of [
      "large-orders",
      "products",
      "admin/products",
      "secretary/products",
      "clothier/productos",
    ])
      expect(() => statSync(join(appDir, dir)), dir).toThrow();
  });
});
