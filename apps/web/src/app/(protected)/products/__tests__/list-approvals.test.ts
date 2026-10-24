import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// H-56 — finished pieces wait for approval whatever day their product was created.

const state = vi.hoisted(() => ({
  role: "secretary",
  queries: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {} },
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "emp-staff" }) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    drizzle(async (sql) => {
      state.queries.push(sql);
      return { rows: [] };
    }),
}));

import { listPendingProductPieceApprovals } from "../approval-actions";

describe("listPendingProductPieceApprovals", () => {
  beforeEach(() => {
    state.role = "secretary";
    state.queries = [];
  });

  it("lists every finished piece, not only today's products", async () => {
    const res = await listPendingProductPieceApprovals();
    expect(res.success).toBe(true);
    const query = state.queries[0]!;
    expect(query).toMatch(/"status" = \$\d+/);
    expect(query).not.toMatch(/"business_day_id" =/);
  });

  it("brings the order and quantity the approver needs to see", async () => {
    await listPendingProductPieceApprovals();
    const query = state.queries[0]!;
    expect(query).toMatch(/"quantity"/);
    expect(query).toMatch(/left join "large_orders"/);
    expect(query).toMatch(/left join "clients"/);
  });

  it.each(["stylist", "clothier"])("refuses %s", async (role) => {
    state.role = role;
    const res = await listPendingProductPieceApprovals();
    expect(!res.success && res.error.code).toBe("UNAUTHORIZED");
    expect(state.queries).toHaveLength(0);
  });
});
