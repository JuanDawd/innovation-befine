import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// M-56 — createAssignment locks the order item before the capacity check.

const state = vi.hoisted(() => ({
  itemQuantity: 10,
  assigned: 0,
  queries: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn() }));
vi.mock("@befine/db", () => ({ getOrderItemsWithProgress: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {}, catalogEdit: {} },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: "secretary" } }) } },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql) => {
    state.queries.push(sql);
    if (sql.startsWith("insert")) return { rows: [["asgn-1"]] };
    if (sql.includes('from "order_items"')) return { rows: [[state.itemQuantity]] };
    if (sql.includes("sum(")) return { rows: [[state.assigned]] };
    return { rows: [[ASSIGNEE_ID, true]] }; // assignee lookup
  });
  // pg-proxy has no transactions; run the callback against the same instance.
  const txDb = { transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) };
  return { getDb: () => db, getTxDb: () => txDb };
});

import { createAssignment } from "../assignment-actions";

const ASSIGNEE_ID = "00000000-0000-4000-8000-000000000003";
const input = (assignedQuantity: number) => ({
  orderItemId: "00000000-0000-4000-8000-000000000001",
  productPieceId: "00000000-0000-4000-8000-000000000002",
  assigneeId: ASSIGNEE_ID,
  assignedQuantity,
});

describe("createAssignment", () => {
  beforeEach(() => {
    state.itemQuantity = 10;
    state.assigned = 0;
    state.queries = [];
  });

  it("locks the order item row before summing existing assignments", async () => {
    const res = await createAssignment(input(4));
    expect(res).toEqual({ success: true, data: { id: "asgn-1", unassignedQuantity: 6 } });
    const lockIdx = state.queries.findIndex((q) => /from "order_items".* for update$/.test(q));
    const sumIdx = state.queries.findIndex((q) => q.includes("sum("));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(sumIdx);
  });

  it("assigns exactly the remaining quantity", async () => {
    state.assigned = 7;
    const res = await createAssignment(input(3));
    expect(res.success && res.data.unassignedQuantity).toBe(0);
  });

  it("returns CONFLICT when the assignment would exceed the item quantity", async () => {
    state.assigned = 7;
    const res = await createAssignment(input(4));
    expect(!res.success && res.error.code).toBe("CONFLICT");
    expect(state.queries.some((q) => q.startsWith("insert"))).toBe(false);
  });
});
