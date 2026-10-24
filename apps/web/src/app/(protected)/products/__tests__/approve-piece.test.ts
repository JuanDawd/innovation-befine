import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// H-57 — approving a piece records the business day its pay belongs to.

const state = vi.hoisted(() => ({
  openDay: { id: "00000000-0000-4000-8000-0000000000d1" } as { id: string } | null,
  updated: true,
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {} },
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "emp-staff" }) }));
vi.mock("@/lib/business-day", () => ({ getCurrentBusinessDay: async () => state.openDay }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: "secretary" } }) } },
}));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    drizzle(async (sql, params) => {
      state.queries.push({ sql, params });
      return { rows: state.updated ? [[PIECE_ID]] : [] };
    }),
}));

import { approveProductPiece } from "../approval-actions";

const PIECE_ID = "00000000-0000-4000-8000-0000000000aa";

describe("approveProductPiece", () => {
  beforeEach(() => {
    state.openDay = { id: "00000000-0000-4000-8000-0000000000d1" };
    state.updated = true;
    state.queries = [];
  });

  it("stamps the open business day as the day the piece is paid on", async () => {
    const res = await approveProductPiece(PIECE_ID, 2);
    expect(res.success).toBe(true);
    const update = state.queries.find((q) => q.sql.startsWith("update"))!;
    expect(update.sql).toMatch(/"approved_business_day_id" = \$\d+/);
    expect(update.params).toContain("00000000-0000-4000-8000-0000000000d1");
  });

  it("refuses with no open business day, without writing", async () => {
    state.openDay = null;
    const res = await approveProductPiece(PIECE_ID, 2);
    expect(!res.success && res.error.code).toBe("CONFLICT");
    expect(state.queries.some((q) => q.sql.startsWith("update"))).toBe(false);
  });

  it("returns STALE_DATA when the piece changed in between", async () => {
    state.updated = false;
    const res = await approveProductPiece(PIECE_ID, 2);
    expect(!res.success && res.error.code).toBe("STALE_DATA");
  });
});
