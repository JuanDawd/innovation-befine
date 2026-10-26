import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// H-50 — cloth sales record a payment method and are idempotent.
// T129 — they sell from stock: a "sale" movement, no overselling unless the
// admin overrides with a reason, after hours when no day is open.
// (Concurrency against a real database: cloth-sales.integration.test.ts.)

const state = vi.hoisted(() => ({
  role: "cashier",
  dayOpen: true,
  sellingPrice: 95000 as number | null,
  onHand: 10,
  // Sales already stored, keyed by idempotency key: [id, unitPrice, quantity, afterHours]
  stored: new Map<string, [string, number, number, boolean]>(),
  queries: [] as { sql: string; params: unknown[] }[],
}));

/** Column → value of a drizzle INSERT (values listed as default or $n). */
function insertValues(sql: string, params: unknown[]): Record<string, unknown> {
  const cols = [...sql.slice(0, sql.indexOf(" values ")).matchAll(/"(\w+)"/g)]
    .map((m) => m[1]!)
    .slice(1); // the table name
  const vals = sql
    .slice(sql.indexOf(" values (") + 9, sql.indexOf(")", sql.indexOf(" values (")))
    .split(", ");
  return Object.fromEntries(
    cols.map((c, i) => [
      c,
      vals[i] === "default" ? undefined : params[Number(vals[i]!.slice(1)) - 1],
    ]),
  );
}

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {} },
}));
vi.mock("@/lib/business-day", () => ({
  getCurrentBusinessDay: async () => (state.dayOpen ? { id: DAY_ID } : null),
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "emp-1" }) }));
vi.mock("@/lib/activity", () => ({ actorOf: () => ({}), logActivity: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    if (sql.startsWith('insert into "cloth_sales"')) {
      const v = insertValues(sql, params);
      const key = v.idempotency_key as string;
      const row: [string, number, number, boolean] = [
        `sale-${state.stored.size + 1}`,
        v.unit_price as number,
        v.quantity as number,
        Boolean(v.after_hours),
      ];
      state.stored.set(key, row);
      return { rows: [row.slice(0, 3)] };
    }
    if (sql.startsWith("insert")) return { rows: [] };
    if (sql.includes('from "cloth_sales"')) {
      const row = state.stored.get(params[0] as string);
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('from "cloth_piece_variants"'))
      return { rows: [[VARIANT_ID, state.sellingPrice, "piece-1", true]] };
    // db.execute() hands back the proxy's rows as-is; the Neon driver's result has .rows.
    if (sql.includes("FROM stock_movements"))
      return {
        rows: { rows: [{ n: state.onHand, garment: "Bata — Clásica", size: "M", color: null }] },
      } as never;
    if (sql.includes("pg_advisory_xact_lock")) return { rows: { rows: [] } } as never;
    return { rows: [] };
  });
  // pg-proxy has no transactions; run the callback against the same instance.
  const txDb = { transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) };
  return { getDb: () => db, getTxDb: () => txDb };
});

import { createClothSale } from "../actions/cloth-sales";

const DAY_ID = "00000000-0000-4000-8000-000000000001";
const VARIANT_ID = "00000000-0000-4000-8000-000000000002";
const SIZE_ID = "00000000-0000-4000-8000-000000000003";
const KEY_A = "00000000-0000-4000-8000-00000000000a";
const KEY_B = "00000000-0000-4000-8000-00000000000b";

const sale = (overrides: Record<string, unknown> = {}) => ({
  clothPieceVariantId: VARIANT_ID,
  sizeId: SIZE_ID,
  colorId: null,
  quantity: 2,
  paymentMethod: "cash",
  idempotencyKey: KEY_A,
  ...overrides,
});

const inserts = (table: string) =>
  state.queries
    .filter((q) => q.sql.startsWith(`insert into "${table}"`))
    .map((q) => insertValues(q.sql, q.params));

describe("createClothSale", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.dayOpen = true;
    state.sellingPrice = 95000;
    state.onHand = 10;
    state.stored = new Map();
    state.queries = [];
  });

  it("records the sale with its payment method and takes it out of stock", async () => {
    const res = await createClothSale(sale());
    expect(res).toEqual({
      success: true,
      data: { id: "sale-1", effectiveTotal: 190000, afterHours: false },
    });
    expect(inserts("cloth_sales")[0]).toMatchObject({
      business_day_id: DAY_ID,
      size_id: SIZE_ID,
      payment_method: "cash",
      idempotency_key: KEY_A,
    });
    expect(inserts("stock_movements")[0]).toMatchObject({
      quantity: -2,
      kind: "sale",
      ref_type: "cloth_sale",
      ref_id: "sale-1",
      size_id: SIZE_ID,
    });
    expect(state.queries.some((q) => q.sql.includes("pg_advisory_xact_lock"))).toBe(true);
  });

  it("returns the original sale when the same idempotency key is submitted twice", async () => {
    const first = await createClothSale(sale());
    const second = await createClothSale(sale());
    expect(second).toEqual(first);
    expect(state.stored.size).toBe(1);
    expect(inserts("stock_movements")).toHaveLength(1);
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

  it("blocks selling more than is on hand", async () => {
    state.onHand = 1;
    const res = await createClothSale(sale());
    expect(!res.success && res.error).toMatchObject({
      code: "CONFLICT",
      message: "Solo queda 1 disponible. Alguien pudo vender mientras tanto.",
    });
    expect(inserts("cloth_sales")).toHaveLength(0);
    expect(inserts("stock_movements")).toHaveLength(0);
  });

  it("does not let the cashier oversell even when asking to", async () => {
    state.onHand = 0;
    const res = await createClothSale(sale({ oversell: true, oversellReason: "x" }));
    expect(!res.success && res.error.message).toMatch(/administrador/);
  });

  it("lets the admin oversell with a reason, recorded on the movement", async () => {
    state.role = "admin";
    state.onHand = 1;
    const noReason = await createClothSale(sale({ oversell: true }));
    expect(!noReason.success && noReason.error.message).toMatch(/motivo/);
    const res = await createClothSale(
      sale({ oversell: true, oversellReason: "conteo pendiente", idempotencyKey: KEY_B }),
    );
    expect(res.success).toBe(true);
    expect(inserts("stock_movements")[0]).toMatchObject({
      quantity: -2,
      reason: "Venta sin existencias autorizada (1 → -1): conteo pendiente",
    });
  });

  it("records the sale after hours when no business day is open", async () => {
    state.dayOpen = false;
    const res = await createClothSale(sale());
    expect(res.success && res.data.afterHours).toBe(true);
    expect(inserts("cloth_sales")[0]).toMatchObject({
      business_day_id: null,
      after_hours: true,
    });
  });

  it("won't join a ticket after hours", async () => {
    state.dayOpen = false;
    const res = await createClothSale(sale({ ticketId: "00000000-0000-4000-8000-0000000000cc" }));
    expect(!res.success && res.error.code).toBe("CONFLICT");
  });

  it.each([
    ["missing payment method", { paymentMethod: undefined }],
    ["unknown payment method", { paymentMethod: "bitcoin" }],
    ["missing idempotency key", { idempotencyKey: undefined }],
    ["zero quantity", { quantity: 0 }],
    ["negative override", { priceOverride: -1 }],
    ["fractional override", { priceOverride: 1000.5 }],
    ["missing size", { sizeId: undefined }],
  ])("returns VALIDATION_ERROR for %s", async (_label, bad) => {
    const res = await createClothSale(sale(bad));
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries.some((q) => q.sql.startsWith("insert"))).toBe(false);
  });

  it.each(["secretary", "stylist", "clothier"])("returns FORBIDDEN for %s", async (role) => {
    state.role = role;
    const res = await createClothSale(sale());
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });
});
