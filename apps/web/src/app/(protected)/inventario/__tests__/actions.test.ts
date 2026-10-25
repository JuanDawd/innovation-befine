import { describe, it, expect, vi, beforeEach } from "vitest";

// T128 — who may see and adjust stock (unit; the ledger itself is in
// stock.integration.test.ts against a real database).

const state = vi.hoisted(() => ({ role: "admin" as string | null, txCalls: 0 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "e1" }) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({}),
  getTxDb: () => ({
    transaction: async () => {
      state.txCalls++;
      throw new Error("stop: reached the database");
    },
  }),
}));

import { adjustStock, getStockHistory } from "../actions";

const input = {
  clothPieceVariantId: "00000000-0000-4000-8000-0000000000a1",
  sizeId: null,
  colorId: null,
  quantity: 5,
  reasonCode: "conteo",
  idempotencyKey: "00000000-0000-4000-8000-0000000000aa",
};

describe("inventario access", () => {
  beforeEach(() => {
    state.role = "admin";
    state.txCalls = 0;
  });

  it("lets only admin adjust stock", async () => {
    await expect(adjustStock(input)).rejects.toThrow(/reached the database/);
    for (const role of ["cashier", "secretary", "stylist", "clothier"]) {
      state.role = role;
      const res = await adjustStock(input);
      expect(!res.success && res.error.code).toBe("FORBIDDEN");
    }
    expect(state.txCalls).toBe(1);
  });

  it("lets the cashier see history but not the secretary", async () => {
    state.role = "secretary";
    const sec = await getStockHistory({
      clothPieceVariantId: input.clothPieceVariantId,
      sizeId: null,
      colorId: null,
    });
    expect(!sec.success && sec.error.code).toBe("FORBIDDEN");
    state.role = "cashier";
    const bad = await getStockHistory({ clothPieceVariantId: "x", sizeId: null, colorId: null });
    expect(!bad.success && bad.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates before touching the database", async () => {
    const zero = await adjustStock({ ...input, quantity: 0 });
    expect(!zero.success && zero.error.code).toBe("VALIDATION_ERROR");
    const other = await adjustStock({ ...input, reasonCode: "otro" });
    expect(!other.success && other.error.details?.[0]?.field).toBe("note");
    expect(state.txCalls).toBe(0);
  });
});
