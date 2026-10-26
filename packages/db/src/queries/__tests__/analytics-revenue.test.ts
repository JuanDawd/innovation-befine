import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { Database } from "../../index";
import { revenueByPeriod } from "../analytics";

// H-50 — garment sales (Vender prenda) count as product-sales revenue. The
// previous model's crafted pieces were retired in T135.
// pg-proxy builds the real SQL; the callback answers per source table.

function fakeDb(rows: { tickets: unknown[]; clothSales: unknown[] }) {
  const queries: string[] = [];
  const db = drizzle(async (sql) => {
    queries.push(sql);
    if (sql.includes('from "cloth_sales"')) return { rows: [rows.clothSales] };
    return { rows: [rows.tickets] };
  }) as unknown as Database;
  return { db, queries };
}

describe("revenueByPeriod", () => {
  it("counts garment sales as product-sales revenue", async () => {
    const { db, queries } = fakeDb({
      tickets: ["250000", 4],
      clothSales: ["190000"],
    });
    const res = await revenueByPeriod(db, ["day-1"]);
    expect(res).toEqual({
      totalRevenue: 440000,
      serviceRevenue: 250000,
      productSalesRevenue: 190000,
      totalJobs: 4,
    });
    const cloth = queries.find((q) => q.includes('from "cloth_sales"'))!;
    expect(cloth).toMatch(/coalesce\("price_override", "unit_price"\) \* "quantity"/i);
  });

  it("returns zeros without querying for an empty period", async () => {
    const { db, queries } = fakeDb({ tickets: [], clothSales: [] });
    const res = await revenueByPeriod(db, []);
    expect(res.totalRevenue).toBe(0);
    expect(queries).toHaveLength(0);
  });
});
