import { describe, it, expect, vi, beforeEach } from "vitest";

// H-52 — unfinished pieces from earlier business days stay on the clothier board.

const state = vi.hoisted(() => ({
  businessDay: null as { id: string } | null,
  pieceRows: [] as Record<string, unknown>[],
  whereCalls: [] as unknown[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: "clothier" } }) } },
}));
vi.mock("@/lib/middleware-helpers", () => ({ hasRole: () => true }));
vi.mock("@/lib/business-day", () => ({ getCurrentBusinessDay: async () => state.businessDay }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), rateLimits: {} }));
vi.mock("@/lib/idempotency", () => ({ checkIdempotency: vi.fn(), storeIdempotency: vi.fn() }));
vi.mock("@/lib/db", () => {
  // First select() is the employee lookup, the second the pieces query.
  let call = 0;
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin"]) c[m] = () => c;
    c.where = (cond: unknown) => {
      state.whereCalls.push(cond);
      return c;
    };
    c.limit = async () => rows();
    c.orderBy = async () => rows();
    return c;
  };
  return {
    getTxDb: vi.fn(),
    getDb: () => ({
      select: () =>
        call++ % 2 === 0 ? chain(() => [{ id: "emp1" }]) : chain(() => state.pieceRows),
    }),
  };
});

import { listTodayProductPieces } from "../actions";

function row(overrides: Record<string, unknown>) {
  return {
    id: "p1",
    productId: "prod1",
    clothPieceName: "Bata",
    quantity: 2,
    color: null,
    style: null,
    size: null,
    instructions: null,
    autoApproved: false,
    assignedToEmployeeId: null,
    claimSource: null,
    status: "pending",
    version: 1,
    businessDayId: "today",
    productCreatedAt: new Date("2026-10-22T15:00:00Z"),
    ...overrides,
  };
}

describe("listTodayProductPieces", () => {
  beforeEach(() => {
    state.businessDay = { id: "today" };
    state.pieceRows = [];
    state.whereCalls = [];
  });

  it("flags pieces from an earlier business day as carried over", async () => {
    state.pieceRows = [
      row({
        id: "old",
        businessDayId: "monday",
        productCreatedAt: new Date("2026-10-20T15:00:00Z"),
      }),
      row({ id: "new", businessDayId: "today" }),
    ];
    const res = await listTodayProductPieces();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.map((p) => [p.id, p.carriedOver])).toEqual([
      ["old", true],
      ["new", false],
    ]);
    expect(res.data[0]).not.toHaveProperty("businessDayId");
  });

  it("reports the product date in Bogota time, not UTC", async () => {
    // 02:00 UTC on the 22nd is still the 21st in Bogota (UTC-5)
    state.pieceRows = [row({ productCreatedAt: new Date("2026-10-22T02:00:00Z") })];
    const res = await listTodayProductPieces();
    expect(res.success && res.data[0]?.productDate).toBe("2026-10-21");
  });

  it("still returns unfinished pieces when no business day is open", async () => {
    state.businessDay = null;
    state.pieceRows = [row({ businessDayId: "monday" })];
    const res = await listTodayProductPieces();
    expect(res.success && res.data).toHaveLength(1);
    expect(res.success && res.data[0]?.carriedOver).toBe(true);
  });
});
