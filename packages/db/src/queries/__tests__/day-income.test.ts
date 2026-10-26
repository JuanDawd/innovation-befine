import { describe, it, expect } from "vitest";
import { summarizeDayIncome, type DayIncomeRow } from "../day-income";

// T130 — every peso of the day lands in exactly one source and one method.

const row = (over: Partial<DayIncomeRow>): DayIncomeRow => ({
  source: "services",
  method: "cash",
  afterHours: false,
  amount: 0,
  count: 1,
  ...over,
});

describe("summarizeDayIncome", () => {
  it("splits by source and method, and the parts add up to the total", () => {
    const s = summarizeDayIncome([
      row({ source: "services", method: "cash", amount: 70_000, count: 2 }),
      row({ source: "services", method: "card", amount: 45_000 }),
      row({ source: "pedidos", method: "transfer", amount: 800_000 }),
      row({ source: "prendas", method: "cash", amount: 110_000, count: 2 }),
    ]);
    expect(s.total).toBe(1_025_000);
    expect(s.bySource.services).toMatchObject({ total: 115_000, count: 3 });
    expect(s.bySource.pedidos.byMethod.transfer).toBe(800_000);
    expect(s.byMethod).toEqual({ cash: 180_000, card: 45_000, transfer: 800_000, unknown: 0 });
    const sources = Object.values(s.bySource).reduce((n, x) => n + x.total, 0);
    const methods = Object.values(s.byMethod).reduce((n, x) => n + x, 0);
    expect(sources).toBe(s.total);
    expect(methods).toBe(s.total);
  });

  it("nets refunds against the source they came from", () => {
    const s = summarizeDayIncome([
      row({ source: "pedidos", method: "cash", amount: 50_000 }),
      row({ source: "pedidos", method: "cash", amount: -50_000 }),
      row({ source: "services", method: "card", amount: -10_000 }),
    ]);
    expect(s.bySource.pedidos.total).toBe(0);
    expect(s.bySource.services.total).toBe(-10_000);
    expect(s.total).toBe(-10_000);
  });

  it("reports after-hours money separately, included in the totals", () => {
    const s = summarizeDayIncome([
      row({ source: "pedidos", method: "cash", afterHours: true, amount: 100_000 }),
      row({ source: "prendas", method: "card", afterHours: true, amount: 55_000 }),
      row({ source: "pedidos", method: "cash", amount: 20_000 }),
    ]);
    expect(s.afterHours).toEqual({ total: 155_000, count: 2, pedidos: 100_000, prendas: 55_000 });
    expect(s.total).toBe(175_000);
  });

  it("keeps sales recorded before payment methods existed under 'unknown'", () => {
    const s = summarizeDayIncome([row({ source: "prendas", method: "unknown", amount: 30_000 })]);
    expect(s.byMethod.unknown).toBe(30_000);
    expect(s.total).toBe(30_000);
  });

  it("is all zeros for an empty day", () => {
    const s = summarizeDayIncome([]);
    expect(s.total).toBe(0);
    expect(s.afterHours.count).toBe(0);
  });
});
