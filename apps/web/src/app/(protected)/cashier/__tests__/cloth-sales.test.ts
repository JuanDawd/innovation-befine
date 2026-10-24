import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// H-50 — cloth sales record a payment method and are idempotent.

const state = vi.hoisted(() => ({
  role: "cashier",
  sellingPrice: 95000 as number | null,
  // Rows already stored, keyed by idempotency key: [id, unitPrice, quantity]
  stored: new Map<string, [string, number, number]>(),
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {} },
}));
vi.mock("@/lib/business-day", () => ({ getCurrentBusinessDay: async () => ({ id: DAY_ID }) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    if (sql.startsWith("insert")) {
      const key = params.find((p) => p === KEY_A || p === KEY_B) as string;
      if (state.stored.has(key)) return { rows: [] }; // ON CONFLICT DO NOTHING
      const row: [string, number, number] = [`sale-${state.stored.size + 1}`, 0, 0];
      // Insert params in table order: business_day_id, ticket_id, cloth_piece_id,
      // cloth_piece_variant_id, quantity, unit_price, … (id uses DEFAULT)
      row[1] = params[5] as number;
      row[2] = params[4] as number;
      state.stored.set(key, row);
      return { rows: [row] };
    }
    if (sql.includes('from "cloth_sales"')) {
      const row = state.stored.get(params[0] as string);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('from "cloth_piece_variants"'))
      return { rows: [[VARIANT_ID, state.sellingPrice, "piece-1", true]] };
    if (sql.includes('from "employees"')) return { rows: [["emp-1"]] };
    return { rows: [] };
  });
  // pg-proxy has no transactions; run the callback against the same instance.
  const txDb = { transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) };
  return { getDb: () => db, getTxDb: () => txDb };
});

import { createClothSale } from "../actions/cloth-sales";

const DAY_ID = "00000000-0000-4000-8000-000000000001";
const VARIANT_ID = "00000000-0000-4000-8000-000000000002";
const KEY_A = "00000000-0000-4000-8000-00000000000a";
const KEY_B = "00000000-0000-4000-8000-00000000000b";

const sale = (overrides: Record<string, unknown> = {}) => ({
  clothPieceVariantId: VARIANT_ID,
  quantity: 2,
  paymentMethod: "cash",
  idempotencyKey: KEY_A,
  ...overrides,
});

describe("createClothSale", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.sellingPrice = 95000;
    state.stored = new Map();
    state.queries = [];
  });

  it("records the sale with its payment method and returns the total", async () => {
    const res = await createClothSale(sale());
    expect(res).toEqual({ success: true, data: { id: "sale-1", effectiveTotal: 190000 } });
    const insert = state.queries.find((q) => q.sql.startsWith("insert"))!;
    expect(insert.sql).toMatch(/on conflict \("idempotency_key"\) do nothing/);
    expect(insert.params).toEqual(expect.arrayContaining(["cash", KEY_A]));
  });

  it("returns the original sale when the same idempotency key is submitted twice", async () => {
    const first = await createClothSale(sale());
    const second = await createClothSale(sale());
    expect(second).toEqual(first);
    expect(state.stored.size).toBe(1);
  });

  it("creates a separate sale for a new idempotency key", async () => {
    await createClothSale(sale());
    const res = await createClothSale(sale({ idempotencyKey: KEY_B }));
    expect(res.success && res.data.id).toBe("sale-2");
  });

  it("uses the price override for the total, including an override to $0", async () => {
    const res = await createClothSale(sale({ priceOverride: 0, quantity: 3 }));
    expect(res.success && res.data.effectiveTotal).toBe(0);
  });

  it("rejects a variant with no selling price and no override", async () => {
    state.sellingPrice = null;
    const res = await createClothSale(sale());
    expect(!res.success && res.error.code).toBe("CONFLICT");
  });

  it.each([
    ["missing payment method", { paymentMethod: undefined }],
    ["unknown payment method", { paymentMethod: "bitcoin" }],
    ["missing idempotency key", { idempotencyKey: undefined }],
    ["zero quantity", { quantity: 0 }],
    ["negative override", { priceOverride: -1 }],
    ["fractional override", { priceOverride: 1000.5 }],
  ])("returns VALIDATION_ERROR for %s", async (_label, bad) => {
    const res = await createClothSale(sale(bad));
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries.some((q) => q.sql.startsWith("insert"))).toBe(false);
  });

  it.each(["stylist", "clothier"])("denies %s", async (role) => {
    state.role = role;
    const res = await createClothSale(sale());
    expect(res.success).toBe(false);
    expect(state.queries).toHaveLength(0);
  });
});
