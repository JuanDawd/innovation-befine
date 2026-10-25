import { it, expect } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "../../schema";
import { getStockOnHand, getStockOnHandFor } from "../stock";
import { describeDb, makeClothVariant, makeEmployee, withCleanDb } from "./helpers/test-db";

// T113 — stock on hand is the sum of the movement ledger, per variant + size + colour.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

async function fixtures(db: Db) {
  const admin = await makeEmployee(db, { role: "admin" });
  const bikini = await makeClothVariant(db, { sellingPrice: 45_000 });
  const [m] = await db.insert(s.garmentSizes).values({ label: "M" }).returning();
  const [l] = await db.insert(s.garmentSizes).values({ label: "L" }).returning();
  const [rojo] = await db.insert(s.garmentColors).values({ label: "Rojo" }).returning();
  const move = (
    quantity: number,
    kind: "production" | "adjustment" | "sale" | "scrap",
    sizeId: string | null,
    colorId: string | null = rojo!.id,
  ) =>
    db.insert(s.stockMovements).values({
      clothPieceVariantId: bikini.variantId,
      sizeId,
      colorId,
      quantity,
      kind,
      reason: kind === "adjustment" || kind === "scrap" ? "conteo inicial" : null,
      createdBy: admin.id,
    });
  return { variantId: bikini.variantId, m: m!.id, l: l!.id, rojo: rojo!.id, move };
}

describeDb("getStockOnHand", () => {
  it("sums production, adjustments, sales and scrap per size and colour", () =>
    withCleanDb(async (db) => {
      const f = await fixtures(db);
      await f.move(10, "production", f.m);
      await f.move(3, "adjustment", f.m);
      await f.move(-4, "sale", f.m);
      await f.move(-1, "scrap", f.m);
      await f.move(5, "production", f.l);
      await f.move(2, "adjustment", null, null);

      expect(
        await getStockOnHandFor(db, {
          clothPieceVariantId: f.variantId,
          sizeId: f.m,
          colorId: f.rojo,
        }),
      ).toBe(8);
      expect(
        await getStockOnHandFor(db, {
          clothPieceVariantId: f.variantId,
          sizeId: f.l,
          colorId: f.rojo,
        }),
      ).toBe(5);
      expect(
        await getStockOnHandFor(db, {
          clothPieceVariantId: f.variantId,
          sizeId: null,
          colorId: null,
        }),
      ).toBe(2);
      expect(
        await getStockOnHandFor(db, {
          clothPieceVariantId: f.variantId,
          sizeId: f.l,
          colorId: null,
        }),
      ).toBe(0);

      const rows = await getStockOnHand(db, { clothPieceVariantId: f.variantId });
      expect(rows).toHaveLength(3);
      expect(rows.reduce((t, r) => t + r.onHand, 0)).toBe(15);
    }));

  it("hides sold-out items unless asked", () =>
    withCleanDb(async (db) => {
      const f = await fixtures(db);
      await f.move(2, "production", f.m);
      await f.move(-2, "sale", f.m);
      expect(await getStockOnHand(db)).toEqual([]);
      expect(await getStockOnHand(db, { includeZero: true })).toEqual([
        { clothPieceVariantId: f.variantId, sizeId: f.m, colorId: f.rojo, onHand: 0 },
      ]);
    }));

  it("is append-only: movements cannot be edited or deleted", () =>
    withCleanDb(async (db) => {
      const f = await fixtures(db);
      await f.move(2, "production", f.m);
      await expect(db.execute(sql`UPDATE stock_movements SET quantity = 99`)).rejects.toThrow();
    }));

  it("is append-only: movements cannot be deleted", () =>
    withCleanDb(async (db) => {
      const f = await fixtures(db);
      await f.move(2, "production", f.m);
      await expect(db.execute(sql`DELETE FROM stock_movements`)).rejects.toThrow();
    }));
});
