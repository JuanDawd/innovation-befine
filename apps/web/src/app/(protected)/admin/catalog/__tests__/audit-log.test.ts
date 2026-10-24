import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// L-03 — catalog audit log is paged (20 per page, keyset cursor).

const state = vi.hoisted(() => ({
  role: "admin",
  total: 0,
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    drizzle(async (sql, params) => {
      state.queries.push({ sql, params });
      const limit = Number(params[params.length - 1]);
      const n = Math.min(state.total, limit);
      return {
        rows: Array.from({ length: n }, (_, i) => [
          `e${i}`,
          "update",
          "Admin",
          "2026-10-23 15:00:00+00",
          null,
          null,
        ]),
      };
    }),
}));

import { getEntityAuditLog } from "../actions/audit-log";

const ENTITY = "00000000-0000-4000-8000-000000000001";
const CURSOR = "00000000-0000-4000-8000-000000000002";

describe("getEntityAuditLog", () => {
  beforeEach(() => {
    state.role = "admin";
    state.total = 0;
    state.queries = [];
  });

  it("returns the first 20 entries and flags that more exist", async () => {
    state.total = 35;
    const res = await getEntityAuditLog({ entityId: ENTITY });
    expect(res.success && res.data.entries).toHaveLength(20);
    expect(res.success && res.data.hasMore).toBe(true);
    expect(state.queries[0]!.sql).not.toMatch(/catalog_audit_log WHERE id =/);
  });

  it("reports no more pages when the last page is short", async () => {
    state.total = 7;
    const res = await getEntityAuditLog({ entityId: ENTITY, beforeId: CURSOR });
    expect(res.success && res.data).toEqual(expect.objectContaining({ hasMore: false }));
    const q = state.queries[0]!;
    expect(q.sql).toMatch(/\("catalog_audit_log"\."created_at", "catalog_audit_log"\."id"\) < \(/);
    expect(q.sql).toMatch(
      /order by "catalog_audit_log"\."created_at" desc, "catalog_audit_log"\."id" desc/,
    );
    expect(q.params).toContain(CURSOR);
  });

  it("rejects a non-uuid entity or cursor", async () => {
    for (const bad of [{ entityId: "x" }, { entityId: ENTITY, beforeId: "1; drop table" }, "raw"]) {
      const res = await getEntityAuditLog(bad);
      expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    }
    expect(state.queries).toHaveLength(0);
  });

  it.each(["cashier", "secretary", "stylist"])("returns FORBIDDEN for %s", async (role) => {
    state.role = role;
    const res = await getEntityAuditLog({ entityId: ENTITY });
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });
});
