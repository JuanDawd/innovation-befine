import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// T115 — new pedido settings: admin-only, validated, each change logged.

type Query = { sql: string; params: unknown[] };

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  queries: [] as Query[],
  current: [] as unknown[],
  updated: [] as unknown[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    if (sql.startsWith("select") && sql.includes("for update")) return { rows: [state.current] };
    if (sql.startsWith('update "business_settings"')) return { rows: [state.updated] };
    return { rows: [] };
  });
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: (fn: (tx: typeof db) => unknown) => fn(db) }),
  };
});

import { updateBusinessSettings } from "../actions";

const BASE = {
  enforceSubtypeServiceRestriction: false,
  employeeAuthRequiresEmail: true,
  cashierCanAccessAdmin: false,
  secretaryCanRecordPedidoPayments: false,
  clothierClaimLimit: 50,
  payScrappedUnits: false,
};
const row = (s: typeof BASE) => [
  s.enforceSubtypeServiceRestriction,
  s.employeeAuthRequiresEmail,
  s.cashierCanAccessAdmin,
  s.secretaryCanRecordPedidoPayments,
  s.clothierClaimLimit,
  s.payScrappedUnits,
];
const logs = () => state.queries.filter((q) => q.sql.startsWith('insert into "activity_log"'));

describe("updateBusinessSettings", () => {
  beforeEach(() => {
    state.role = "admin";
    state.queries = [];
    state.current = row(BASE);
    state.updated = row(BASE);
  });

  it.each(["cashier", "secretary", "stylist", "clothier"])(
    "returns FORBIDDEN when %s edits settings",
    async (role) => {
      state.role = role;
      const res = await updateBusinessSettings({ ...BASE, payScrappedUnits: true });
      expect(!res.success && res.error.code).toBe("FORBIDDEN");
      expect(state.queries).toHaveLength(0);
    },
  );

  it("returns UNAUTHORIZED without a session", async () => {
    state.role = null;
    const res = await updateBusinessSettings(BASE);
    expect(!res.success && res.error.code).toBe("UNAUTHORIZED");
  });

  it.each([0, -5, 10_001, 2.5, "50", null])("rejects a claim limit of %s", async (limit) => {
    const res = await updateBusinessSettings({ ...BASE, clothierClaimLimit: limit });
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries).toHaveLength(0);
  });

  it("rejects input missing the new settings", async () => {
    const { payScrappedUnits, ...old } = BASE;
    void payScrappedUnits;
    const res = await updateBusinessSettings(old);
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs one Spanish entry per changed setting", async () => {
    const next = {
      ...BASE,
      secretaryCanRecordPedidoPayments: true,
      clothierClaimLimit: 80,
    };
    state.updated = row(next);
    const res = await updateBusinessSettings(next);
    expect(res).toEqual({ success: true, data: next });
    expect(logs()).toHaveLength(2);
    const params = logs().flatMap((q) => q.params);
    expect(params).toContain("settings.update");
    expect(params).toContain(
      "Cambió la configuración: secretaria puede registrar pagos de pedidos (desactivado → activado)",
    );
    expect(params).toContain(
      "Cambió la configuración: límite de unidades por confeccionista (50 → 80)",
    );
  });

  it("writes no log when nothing changed", async () => {
    const res = await updateBusinessSettings(BASE);
    expect(res.success).toBe(true);
    expect(logs()).toHaveLength(0);
  });
});
