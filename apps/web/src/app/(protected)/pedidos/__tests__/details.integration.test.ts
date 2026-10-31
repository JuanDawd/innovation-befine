// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

// T138 — pedidos follow each product's details, against a real Postgres.

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
  rateLimits: { general: "general", catalogEdit: "catalogEdit" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));

import * as s from "@befine/db/schema";
import { getPedidoDetail } from "@befine/db";
import { getDb } from "@/lib/db";
import { makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import {
  addDetailValue,
  createDetail,
  saveProductDetails,
} from "../../admin/catalog/actions/details";
import { createPedido, getPedidoFormData, getPedidoForEdit, updatePedido } from "../actions";

let f: PedidoFixture;
let variantId: string;
let tela: string;
let seda: string;
let lino: string;
let talla: string;
const tag = () => Math.random().toString(36).slice(2, 8);

const line = (over: Record<string, unknown> = {}) => ({
  kind: "garment",
  clothPieceVariantId: variantId,
  unitPrice: 45_000,
  cells: [{ sizeId: f.S, quantity: 5 }],
  details: [{ detailId: tela, valueId: seda }],
  ...over,
});
const create = (l: unknown) =>
  createPedido({ destination: "client", clientId: f.clientId, lines: [l] });

describe.skipIf(!hasDb)("pedido details", () => {
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
    const d = await createDetail({
      name: `Tela ${tag()}`,
      splitsStock: false,
      allowFreeText: false,
    });
    if (!d.success) throw new Error(d.error.message);
    tela = d.data.id;
    const a = await addDetailValue(tela, { label: "Seda" });
    const b = await addDetailValue(tela, { label: "Lino" });
    if (!a.success || !b.success) throw new Error("value");
    seda = a.data.id;
    lino = b.data.id;
    const [t] = await db.select().from(s.details).where(eq(s.details.builtin, "size"));
    talla = t!.id;
    const saved = await saveProductDetails(piece!.id, {
      details: [
        { detailId: talla, required: true, allValues: false, valueIds: [f.S] },
        { detailId: tela, required: true, allValues: false, valueIds: [seda] },
      ],
    });
    if (!saved.success) throw new Error(saved.error.message);
  });

  it("gives the form each product's rules", async () => {
    const data = await getPedidoFormData();
    if (!data.success) throw new Error(data.error.message);
    const variant = data.data.variants.find((v) => v.id === variantId)!;
    expect(data.data.rules[variant.pieceId]!.map((r) => r.detailId)).toEqual([talla, tela]);
  });

  it("saves a line that fits and shows its details", async () => {
    const res = await create(line());
    if (!res.success) throw new Error(res.error.message);
    const detail = (await getPedidoDetail(getDb(), res.data.id))!;
    const l = detail.lines[0]!;
    expect(l.kind === "garment" && l.style).toContain("Seda");
  });

  it("refuses what the product doesn't allow", async () => {
    const cases = [
      line({ cells: [{ sizeId: f.M, quantity: 1 }] }),
      line({ cells: [{ sizeOther: "XXL", quantity: 1 }] }),
      line({ details: [{ detailId: tela, valueId: lino }] }),
      line({ details: [{ detailId: tela, valueOther: "Algodón" }] }),
      line({ details: [] }),
      line({ colorId: f.rojo }),
      line({ style: "Clásico" }),
    ];
    for (const c of cases) expect(await create(c)).toMatchObject({ success: false });
  });

  it("keeps an existing pedido editable after the product changes, and saves added lines", async () => {
    const res = await create(line());
    if (!res.success) throw new Error(res.error.message);
    const [variant] = await getDb()
      .select()
      .from(s.clothPieceVariants)
      .where(eq(s.clothPieceVariants.id, variantId));
    await saveProductDetails(variant!.clothPieceId, {
      details: [
        { detailId: talla, required: true, allValues: false, valueIds: [f.M] },
        { detailId: tela, required: true, allValues: false, valueIds: [lino] },
      ],
    });
    const edit = await getPedidoForEdit(res.data.id);
    if (!edit.success) throw new Error(edit.error.message);
    const again = await updatePedido(res.data.id, {
      destination: "client",
      clientId: f.clientId,
      version: edit.data.version,
      lines: [
        edit.data.lines[0],
        line({
          cells: [{ sizeId: f.M, quantity: 2 }],
          details: [{ detailId: tela, valueId: lino }],
        }),
      ],
    });
    expect(again).toMatchObject({ success: true });
    const rows = await getDb().select().from(s.pedidoLineDetails);
    expect(rows.filter((r) => r.valueId === lino).length).toBeGreaterThan(0);

    await saveProductDetails(variant!.clothPieceId, {
      details: [
        { detailId: talla, required: true, allValues: false, valueIds: [f.S] },
        { detailId: tela, required: true, allValues: false, valueIds: [seda] },
      ],
    });
  });

  it("freezes custom details once a line is in production", async () => {
    const res = await create(line());
    if (!res.success) throw new Error(res.error.message);
    const detail = (await getPedidoDetail(getDb(), res.data.id))!;
    const l = detail.lines[0]!;
    if (l.kind !== "garment") throw new Error("garment expected");
    await getDb().insert(s.assignments).values({
      cellId: l.cells[0]!.id,
      employeeId: f.clothier.employeeId,
      quantity: 1,
      pieceRate: 12_000,
      source: "assigned",
      createdBy: f.admin.employeeId,
    });
    const edit = await getPedidoForEdit(res.data.id);
    if (!edit.success) throw new Error(edit.error.message);
    const first = edit.data.lines[0]!;
    if (first.kind !== "garment") throw new Error("garment expected");
    const changed = await updatePedido(res.data.id, {
      destination: "client",
      clientId: f.clientId,
      version: edit.data.version,
      lines: [{ ...first, details: [] }],
    });
    expect(changed).toMatchObject({ success: false });
  });

  it("every product keeps Talla", async () => {
    const res = await saveProductDetails(f.variantId, { details: [] });
    expect(res).toMatchObject({ success: false });
  });
});
