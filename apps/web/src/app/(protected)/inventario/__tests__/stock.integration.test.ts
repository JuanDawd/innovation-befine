// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";

// T128 — approved inventory units enter stock; adjustments never go below 0
// without the logged override. Against the throwaway Postgres; skipped
// without a test database.

vi.setConfig({ testTimeout: 60_000 });
if (process.env.TEST_DATABASE_URL && process.env.NEON_LOCAL_PROXY === "1")
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "admin" } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({
  getBusinessSettings: async () => ({ payScrappedUnits: false, clothierClaimLimit: 100 }),
}));

import * as s from "@befine/db/schema";
import { getStockOnHandFor } from "@befine/db";
import { getDb } from "@/lib/db";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../../pedidos/actions";
import { assignUnits } from "../../pedidos/production-actions";
import { reviewUnits } from "../../produccion/actions";
import { adjustStock, getInventory, getStockHistory } from "../actions";

let f: PedidoFixture;

describe.skipIf(!hasTestDb)("stock ledger (T128)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });

  it("adds approved units of inventory pedidos to stock, linked to the review", async () => {
    session.user = { id: f.admin.userId, role: "admin" };
    const before = await getStockOnHandFor(getDb(), {
      clothPieceVariantId: f.variantId,
      sizeId: f.S,
      colorId: f.rojo,
    });
    const p = await createPedido({
      destination: "inventory",
      lines: [
        {
          kind: "garment",
          clothPieceVariantId: f.variantId,
          colorId: f.rojo,
          unitPrice: 45_000,
          cells: [{ sizeId: f.S, quantity: 5 }],
        },
      ],
    });
    if (!p.success) throw new Error(p.error.message);
    const [cell] = await getDb()
      .select({ id: s.pedidoLineCells.id })
      .from(s.pedidoLineCells)
      .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
      .where(eq(s.pedidoLines.pedidoId, p.data.id));
    const a = await assignUnits({
      cellId: cell!.id,
      employeeId: f.clothier.employeeId,
      quantity: 5,
      expectedUnassigned: 5,
    });
    if (!a.success) throw new Error(a.error.message);
    await getDb().insert(s.unitReports).values({
      assignmentId: a.data.assignmentId,
      quantity: 5,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
    const r = await reviewUnits(a.data.assignmentId, {
      expectedPending: 5,
      approved: 4,
      returned: 0,
      scrapped: 1,
      scrapCode: "tela",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(r.success).toBe(true);

    const after = await getStockOnHandFor(getDb(), {
      clothPieceVariantId: f.variantId,
      sizeId: f.S,
      colorId: f.rojo,
    });
    expect(after - before).toBe(4);
    const history = await getStockHistory({
      clothPieceVariantId: f.variantId,
      sizeId: f.S,
      colorId: f.rojo,
    });
    expect(history.success && history.data[0]).toMatchObject({
      kind: "production",
      quantity: 4,
      refType: "unit_review",
      source: expect.stringMatching(/^Pedido #\d{4}$/),
    });
  });

  it("never goes below 0 without the override, which is logged", async () => {
    session.user = { id: f.admin.userId, role: "admin" };
    const item = { clothPieceVariantId: f.variantId, sizeId: f.M, colorId: f.azul };
    const add = await adjustStock({
      ...item,
      quantity: 3,
      reasonCode: "conteo",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(add.success && add.data.onHand).toBe(3);

    const tooMany = await adjustStock({
      ...item,
      quantity: -4,
      reasonCode: "danada",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(!tooMany.success && tooMany.error.message).toMatch(/Solo hay 3 en inventario/);

    const override = await adjustStock({
      ...item,
      quantity: -4,
      reasonCode: "otro",
      note: "venta sin registrar",
      allowNegative: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(override.success && override.data.onHand).toBe(-1);
    const [log] = (
      await getDb().execute(
        sql`SELECT summary, reason FROM activity_log WHERE action = 'stock.adjust' ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows as { summary: string; reason: string }[];
    expect(log!.summary).toMatch(/\(3 → -1\) · autorizó quedar por debajo de 0/);
    expect(log!.reason).toBe("Otro: venta sin registrar");
  });

  it("records a retried adjustment once", async () => {
    session.user = { id: f.admin.userId, role: "admin" };
    const item = { clothPieceVariantId: f.variantId, sizeId: null, colorId: null };
    const key = crypto.randomUUID();
    await adjustStock({ ...item, quantity: 2, reasonCode: "conteo", idempotencyKey: key });
    const again = await adjustStock({
      ...item,
      quantity: 2,
      reasonCode: "conteo",
      idempotencyKey: key,
    });
    expect(again.success && again.data.onHand).toBe(2);
  });

  it("lets the cashier view but not adjust", async () => {
    session.user = { id: f.admin.userId, role: "cashier" };
    const inv = await getInventory();
    expect(inv.success && inv.data.canAdjust).toBe(false);
    expect(inv.success && inv.data.items.length).toBeGreaterThan(0);
  });
});
