import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { Database } from "../../index";
import { revenueByPeriod } from "../analytics";

// H-50 — direct cloth sales count as product-sales revenue.
// pg-proxy builds the real SQL; the callback answers per source table.

function fakeDb(rows: { tickets: unknown[]; pieces: unknown[]; clothSales: unknown[] }) {
  const queries: string[] = [];
  const db = drizzle(async (sql) => {
    queries.push(sql);
    if (sql.includes('from "cloth_sales"')) return { rows: [rows.clothSales] };
    if (sql.includes('from "craftable_pieces"')) return { rows: [rows.pieces] };
    return { rows: [rows.tickets] };
  }) as unknown as Database;
  return { db, queries };
}

describe("revenueByPeriod", () => {
  it("adds cloth sales to sold crafted pieces as product-sales revenue", async () => {
    const { db, queries } = fakeDb({
      tickets: ["250000", 4],
      pieces: ["60000"],
      clothSales: ["190000"],
    });
    const res = await revenueByPeriod(db, ["day-1"]);
    expect(res).toEqual({
      totalRevenue: 500000,
      serviceRevenue: 250000,
      productSalesRevenue: 250000,
      totalJobs: 4,
    });
    const cloth = queries.find((q) => q.includes('from "cloth_sales"'))!;
    expect(cloth).toMatch(/coalesce\("price_override", "unit_price"\) \* "quantity"/i);
  });

  it("returns zeros without querying for an empty period", async () => {
    const { db, queries } = fakeDb({ tickets: [], pieces: [], clothSales: [] });
    const res = await revenueByPeriod(db, []);
    expect(res.totalRevenue).toBe(0);
    expect(queries).toHaveLength(0);
  });
});
