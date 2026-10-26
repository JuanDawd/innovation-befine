import { describe, it, expect, vi, beforeEach } from "vitest";

// T133 — the pedido, production and stock figures are admin only; the
// secretary never sees them (spec §3.8). Figures: packages/db
// analytics-pedidos.integration.test.ts.

const state = vi.hoisted(() => ({ role: "admin" as string | null, loaded: 0 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@befine/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@befine/db")>();
  const none = mod.summarizeDayIncome([]);
  return {
    ...mod,
    getBusinessDayIdsByPeriod: async () => {
      state.loaded++;
      return { current: [], prior: [] };
    },
    getIncomeRows: async () => [],
    pedidoFiguresNow: async () => ({
      receivables: [],
      receivablesTotal: 0,
      saldoAFavorTotal: 0,
      saldoAFavorCount: 0,
      overdue: [],
    }),
    pedidoFiguresForPeriod: async () => ({
      created: 0,
      units: 0,
      completed: 0,
      onTime: 0,
      withPromise: 0,
      avgLeadDays: null,
    }),
    productionFigures: async () => ({
      byClothier: [],
      byGarment: [],
      avgAssignToApprovalHours: null,
    }),
    inventoryFiguresNow: async () => ({ unitsOnHand: 0, valueAtPrice: 0, slowMovers: [] }),
    inventoryFiguresForPeriod: async () => ({ unitsSold: 0, writeOffs: [], writeOffUnits: 0 }),
    none,
  };
});

import { getPedidoAnalytics, getPedidoAnalyticsCsv } from "../actions";

describe("pedido analytics access", () => {
  beforeEach(() => {
    state.role = "admin";
    state.loaded = 0;
  });

  it("serves the admin", async () => {
    const res = await getPedidoAnalytics("week");
    expect(res.success).toBe(true);
    const csv = await getPedidoAnalyticsCsv("week");
    expect(csv.success && csv.data.csv.split("\n")[0]).toBe("seccion,elemento,metrica,valor");
  });

  it.each(["secretary", "cashier", "stylist", "clothier"])("refuses %s", async (role) => {
    state.role = role;
    const res = await getPedidoAnalytics("week");
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    const csv = await getPedidoAnalyticsCsv("week");
    expect(csv.success).toBe(false);
    expect(state.loaded).toBe(0);
  });

  it("rejects an unknown period", async () => {
    const res = await getPedidoAnalytics("year");
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });
});
