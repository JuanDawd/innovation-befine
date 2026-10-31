// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";

// T139 — stock counts by the details that split it, against a real Postgres.

vi.setConfig({ testTimeout: 30_000 });

const url = process.env.TEST_DATABASE_URL;
const hasDb =
  Boolean(url) && (process.env.NEON_LOCAL_PROXY === "1" || process.env.TEST_DATABASE_NEON === "1");
if (hasDb) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ user: { id: "", role: "admin" } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general", catalogEdit: "catalogEdit", ticketCreation: "t" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));

import * as s from "@befine/db/schema";
import { getStockOnHandFor, listStockItems } from "@befine/db";
import { getDb } from "@/lib/db";
import { makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import {
  addDetailValue,
  createDetail,
  saveProductDetails,
  updateDetail,
} from "../../admin/catalog/actions/details";
import { createPedido } from "../../pedidos/actions";
import { approveRestructure, requestRestructure } from "../../pedidos/restructure-actions";
import { getPedidoDetail } from "@befine/db";
import { createClothSale, listSellableStock } from "../../cashier/actions/cloth-sales";
import { reviewUnits } from "../../produccion/actions";

let f: PedidoFixture;
let variantId: string;
let tela: string;
let telaName: string;
let libre: string;
let seda: string;
let lino: string;
const tag = () => Math.random().toString(36).slice(2, 8);

/** An inventory pedido with `value`, 3 units made and waiting for review. */
async function made(details: unknown[]) {
  const res = await createPedido({
    destination: "inventory",
    lines: [
      {
        kind: "garment",
        clothPieceVariantId: variantId,
        unitPrice: 45_000,
        cells: [{ sizeId: f.S, quantity: 3 }],
        details,
      },
    ],
  });
  if (!res.success) throw new Error(res.error.message);
  const detail = (await getPedidoDetail(getDb(), res.data.id))!;
  const line = detail.lines[0]!;
  if (line.kind !== "garment") throw new Error("garment expected");
  const [a] = await getDb()
    .insert(s.assignments)
    .values({
      cellId: line.cells[0]!.id,
      employeeId: f.clothier.employeeId,
      quantity: 3,
      pieceRate: 12_000,
      source: "assigned",
      createdBy: f.admin.employeeId,
    })
    .returning();
  await getDb().insert(s.unitReports).values({
    assignmentId: a!.id,
    quantity: 3,
    businessDayId: f.dayId,
    reportedBy: f.clothier.employeeId,
  });
  return a!.id;
}

const approve = async (assignmentId: string) => {
  const res = await reviewUnits(assignmentId, {
    expectedPending: 3,
    approved: 3,
    returned: 0,
    scrapped: 0,
    idempotencyKey: crypto.randomUUID(),
  });
  if (!res.success) throw new Error(res.error.message);
};

describe.skipIf(!hasDb)("stock by details", () => {
  beforeAll(async () => {
    f = await makeFixture();
    session.user = { id: f.admin.userId, role: "admin" };
    const db = getDb();
    const [piece] = await db
      .insert(s.clothPieces)
      .values({ name: `Bata ${tag()}` })
      .returning();
    const [variant] = await db
      .insert(s.clothPieceVariants)
      .values({ clothPieceId: piece!.id, name: "Larga", pieceRate: 12_000, sellingPrice: 45_000 })
      .returning();
    variantId = variant!.id;
    telaName = `Tela ${tag()}`;
    const d = await createDetail({ name: telaName, splitsStock: true, allowFreeText: true });
    const o = await createDetail({
      name: `Nota ${tag()}`,
      splitsStock: false,
      allowFreeText: false,
    });
    if (!d.success || !o.success) throw new Error("detail");
    tela = d.data.id;
    libre = o.data.id;
    const a = await addDetailValue(tela, { label: "Seda" });
    const b = await addDetailValue(tela, { label: "Lino" });
    const c = await addDetailValue(libre, { label: "Regalo" });
    if (!a.success || !b.success || !c.success) throw new Error("value");
    seda = a.data.id;
    lino = b.data.id;
    const [talla] = await db.select().from(s.details).where(eq(s.details.builtin, "size"));
    const saved = await saveProductDetails(piece!.id, {
      details: [
        { detailId: talla!.id, required: true, allValues: true, valueIds: [] },
        { detailId: tela, required: false, allValues: true, valueIds: [] },
        { detailId: libre, required: false, allValues: true, valueIds: [] },
      ],
    });
    if (!saved.success) throw new Error(saved.error.message);
  });

  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "admin" };
  });

  const keyOf = async (label: string) => {
    const items = await listStockItems(getDb());
    return items.find((i) => i.clothPieceVariantId === variantId && i.detailsLabel.includes(label));
  };

  it("counts each value that splits stock as its own item", async () => {
    await approve(await made([{ detailId: tela, valueId: seda }]));
    await approve(await made([{ detailId: tela, valueId: lino }]));
    const a = await keyOf("Seda");
    const b = await keyOf("Lino");
    expect(a).toMatchObject({ onHand: 3, detailsLabel: `${telaName}: Seda` });
    expect(b).toMatchObject({ onHand: 3 });
    expect(a!.detailsKey).not.toBe(b!.detailsKey);
  });

  it("ignores details that don't split stock, and typed values", async () => {
    await approve(await made([{ detailId: libre, valueId: await libreValue() }]));
    await approve(await made([{ detailId: tela, valueOther: "Algodón" }]));
    const plain = await getStockOnHandFor(getDb(), {
      clothPieceVariantId: variantId,
      sizeId: f.S,
      colorId: null,
    });
    expect(plain).toBe(6);
  });

  it("sells from the exact item only", async () => {
    const seller = await listSellableStock();
    if (!seller.success) throw new Error(seller.error.message);
    const a = seller.data.items.find(
      (i) => i.clothPieceVariantId === variantId && i.detailsLabel.includes("Seda"),
    )!;
    const sale = (quantity: number) =>
      createClothSale({
        clothPieceVariantId: variantId,
        sizeId: a.sizeId,
        colorId: a.colorId,
        detailsKey: a.detailsKey,
        quantity,
        paymentMethod: "cash",
        idempotencyKey: crypto.randomUUID(),
      });
    session.user = { id: f.admin.userId, role: "cashier" };
    expect(await sale(4)).toMatchObject({ success: false });
    expect(await sale(2)).toMatchObject({ success: true });
    session.user = { id: f.admin.userId, role: "admin" };
    expect((await keyOf("Seda"))!.onHand).toBe(1);
    expect((await keyOf("Lino"))!.onHand).toBe(3);
    const [row] = await getDb()
      .select()
      .from(s.clothSales)
      .where(and(eq(s.clothSales.clothPieceVariantId, variantId)));
    expect(row!.detailsLabel).toContain("Seda");
  });

  it("sends restructured units to the item of their details", async () => {
    const res = await createPedido({
      destination: "client",
      clientId: f.clientId,
      lines: [
        {
          kind: "garment",
          clothPieceVariantId: variantId,
          unitPrice: 45_000,
          cells: [{ sizeId: f.S, quantity: 5 }],
          details: [{ detailId: tela, valueId: lino }],
        },
      ],
    });
    if (!res.success) throw new Error(res.error.message);
    const detail = (await getPedidoDetail(getDb(), res.data.id))!;
    const line = detail.lines[0]!;
    if (line.kind !== "garment") throw new Error("garment expected");
    const [a] = await getDb()
      .insert(s.assignments)
      .values({
        cellId: line.cells[0]!.id,
        employeeId: f.clothier.employeeId,
        quantity: 2,
        pieceRate: 12_000,
        source: "assigned",
        createdBy: f.admin.employeeId,
      })
      .returning();
    await getDb().insert(s.unitReports).values({
      assignmentId: a!.id,
      quantity: 2,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
    const req = await requestRestructure(res.data.id, {
      version: detail.version,
      reason: "Menos",
      cells: [{ cellId: line.cells[0]!.id, newQuantity: 1, toStock: 2, pendingAction: "approve" }],
    });
    if (!req.success) throw new Error(req.error.message);
    const done = await approveRestructure(req.data.id, { version: detail.version });
    if (!done.success) throw new Error(done.error.message);
    expect((await keyOf("Lino"))!.onHand).toBe(5);
  });

  it("won't change whether a detail in use splits stock", async () => {
    expect(
      await updateDetail(tela, { name: telaName, splitsStock: false, allowFreeText: true }),
    ).toMatchObject({ error: { code: "CONFLICT" } });
  });
});

async function libreValue() {
  const [v] = await getDb().select().from(s.detailValues).where(eq(s.detailValues.detailId, libre));
  return v!.id;
}
