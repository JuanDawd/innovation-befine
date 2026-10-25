// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";

// T129 — Vender prenda sells from stock: concurrent sales of the last unit,
// after-hours sales attached to the next day. Against the throwaway Postgres;
// skipped without a test database.

vi.setConfig({ testTimeout: 60_000 });
if (process.env.TEST_DATABASE_URL && process.env.NEON_LOCAL_PROXY === "1")
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "cashier" } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
// React's cache() would pin the open day across tests.
vi.mock("@/lib/business-day", async () => {
  const { getDb } = await import("@/lib/db");
  const s = await import("@befine/db/schema");
  const { isNull } = await import("drizzle-orm");
  return {
    getCurrentBusinessDay: async () =>
      (
        await getDb().select().from(s.businessDays).where(isNull(s.businessDays.closedAt)).limit(1)
      )[0] ?? null,
  };
});

import * as s from "@befine/db/schema";
import { getStockOnHandFor } from "@befine/db";
import { getDb } from "@/lib/db";
import { attachAfterHoursPayments } from "@/lib/after-hours";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createClothSale, listSellableStock } from "../actions/cloth-sales";

let f: PedidoFixture;

const sale = (item: { sizeId: string | null; colorId: string | null }, quantity = 1) =>
  createClothSale({
    clothPieceVariantId: f.variantId,
    ...item,
    quantity,
    priceOverride: 60_000,
    paymentMethod: "cash",
    idempotencyKey: crypto.randomUUID(),
  });

async function stock(item: { sizeId: string | null; colorId: string | null }, quantity: number) {
  await getDb()
    .insert(s.stockMovements)
    .values({
      clothPieceVariantId: f.variantId,
      ...item,
      quantity,
      kind: "adjustment",
      reason: "test",
      createdBy: f.admin.employeeId,
    });
}

describe.skipIf(!hasTestDb)("Vender prenda from stock (T129)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });

  it("sells the last unit once when two sales race", async () => {
    session.user = { id: f.admin.userId, role: "cashier" };
    const item = { sizeId: f.S, colorId: null };
    const before = await getStockOnHandFor(getDb(), { clothPieceVariantId: f.variantId, ...item });
    if (before !== 1) await stock(item, 1 - before);

    const results = await Promise.all([sale(item), sale(item)]);
    const ok = results.filter((r) => r.success);
    const blocked = results.filter((r) => !r.success);
    expect(ok).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(!blocked[0]!.success && blocked[0]!.error.message).toMatch(/No hay existencias/);
    expect(await getStockOnHandFor(getDb(), { clothPieceVariantId: f.variantId, ...item })).toBe(0);

    const list = await listSellableStock();
    expect(
      list.success &&
        list.data.items.some(
          (i) => i.sizeId === f.S && i.colorId === null && i.clothPieceVariantId === f.variantId,
        ),
    ).toBe(false);
  });

  it("takes a sale after hours and attaches it once to the next day", async () => {
    session.user = { id: f.admin.userId, role: "cashier" };
    const item = { sizeId: f.M, colorId: null };
    await stock(item, 2);
    const db = getDb();
    await db.execute(
      sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${f.dayId}`,
    );
    try {
      const res = await sale(item);
      expect(res.success && res.data.afterHours).toBe(true);
      const id = res.success ? res.data.id : "";
      const [row] = await db.select().from(s.clothSales).where(eq(s.clothSales.id, id));
      expect(row).toMatchObject({ afterHours: true, businessDayId: null });

      const [next] = await db
        .insert(s.businessDays)
        .values({ openedBy: f.admin.userId })
        .returning();
      const actor = { userId: f.admin.userId, role: "cashier" };
      expect(await attachAfterHoursPayments(next!.id, actor)).toBeGreaterThanOrEqual(1);
      expect(await attachAfterHoursPayments(next!.id, actor)).toBe(0);
      const [attached] = await db.select().from(s.clothSales).where(eq(s.clothSales.id, id));
      expect(attached!.businessDayId).toBe(next!.id);
      await db.execute(
        sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${next!.id}`,
      );
    } finally {
      await db.execute(
        sql`UPDATE business_days SET closed_at = NULL, closed_by = NULL WHERE id = ${f.dayId}`,
      );
    }
  });

  it("lets the admin oversell with a reason; stock goes below 0", async () => {
    session.user = { id: f.admin.userId, role: "admin" };
    const item = { sizeId: f.M, colorId: f.rojo };
    const before = await getStockOnHandFor(getDb(), { clothPieceVariantId: f.variantId, ...item });
    const res = await createClothSale({
      clothPieceVariantId: f.variantId,
      ...item,
      quantity: Math.max(before, 0) + 1,
      priceOverride: 60_000,
      paymentMethod: "card",
      oversell: true,
      oversellReason: "conteo pendiente",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(res.success).toBe(true);
    expect(
      await getStockOnHandFor(getDb(), { clothPieceVariantId: f.variantId, ...item }),
    ).toBeLessThan(0);
  });
});
