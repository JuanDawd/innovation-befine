// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

// T137 — details and product rules against a real Postgres (scripts/test-db.sh).

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

import * as s from "@befine/db/schema";
import { getDb } from "@/lib/db";
import { makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createClothPiece } from "../actions/cloth-pieces";
import {
  addDetailValue,
  createDetail,
  getProductDetails,
  listDetails,
  saveProductDetails,
  updateDetail,
} from "../actions/details";

let f: PedidoFixture;
const tag = () => Math.random().toString(36).slice(2, 8);

describe.skipIf(!hasDb)("details", () => {
  beforeAll(async () => {
    f = await makeFixture();
    session.user = { id: f.admin.userId, role: "admin" };
  });

  it("starts with Talla, Color and Estilo, and a new product uses them", async () => {
    const list = await listDetails();
    if (!list.success) throw new Error(list.error.message);
    expect(list.data.filter((d) => d.builtin).map((d) => d.name)).toEqual([
      "Talla",
      "Color",
      "Estilo",
    ]);

    const piece = await createClothPiece({ name: `Pieza ${tag()}` });
    if (!piece.success) throw new Error(piece.error.message);
    const rows = await getProductDetails(piece.data.id);
    if (!rows.success) throw new Error(rows.error.message);
    expect(rows.data.filter((r) => r.used).map((r) => r.builtin)).toEqual([
      "size",
      "color",
      "style",
    ]);
  });

  it("saves which values a product comes in, and whether it is required", async () => {
    const detail = await createDetail({
      name: `Tela ${tag()}`,
      splitsStock: true,
      allowFreeText: false,
    });
    if (!detail.success) throw new Error(detail.error.message);
    const seda = await addDetailValue(detail.data.id, { label: "Seda" });
    const lino = await addDetailValue(detail.data.id, { label: "Lino" });
    if (!seda.success || !lino.success) throw new Error("value");
    const piece = await createClothPiece({ name: `Pieza ${tag()}` });
    if (!piece.success) throw new Error(piece.error.message);

    const saved = await saveProductDetails(piece.data.id, {
      details: [
        { detailId: detail.data.id, required: true, allValues: false, valueIds: [seda.data.id] },
      ],
    });
    expect(saved).toMatchObject({ success: true });

    const rows = await getProductDetails(piece.data.id);
    if (!rows.success) throw new Error(rows.error.message);
    expect(rows.data.find((r) => r.detailId === detail.data.id)).toMatchObject({
      used: true,
      required: true,
      allValues: false,
      valueIds: [seda.data.id],
    });
    expect(rows.data.filter((r) => r.used)).toHaveLength(1);
  });

  it("requires a value when a product doesn't take them all", async () => {
    const list = await listDetails();
    if (!list.success) throw new Error(list.error.message);
    const res = await saveProductDetails(f.variantId, {
      details: [{ detailId: list.data[0]!.id, required: false, allValues: false, valueIds: [] }],
    });
    expect(res).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("refuses a duplicate name and non-admins", async () => {
    const name = `Largo ${tag()}`;
    await createDetail({ name, splitsStock: false, allowFreeText: true });
    expect(
      await createDetail({ name: name.toUpperCase(), splitsStock: false, allowFreeText: true }),
    ).toMatchObject({ error: { code: "CONFLICT" } });

    session.user = { id: f.admin.userId, role: "secretary" };
    expect(
      await createDetail({ name: `Otro ${tag()}`, splitsStock: false, allowFreeText: false }),
    ).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    session.user = { id: f.admin.userId, role: "admin" };
  });

  it("keeps a built-in detail's rules, whatever is sent", async () => {
    const [talla] = await getDb().select().from(s.details).where(eq(s.details.builtin, "size"));
    await updateDetail(talla!.id, { name: "Talla", splitsStock: false, allowFreeText: false });
    const [after] = await getDb().select().from(s.details).where(eq(s.details.builtin, "size"));
    expect(after).toMatchObject({ splitsStock: true, allowFreeText: true });
    expect(await addDetailValue(talla!.id, { label: "XXS" })).toMatchObject({
      error: { code: "CONFLICT" },
    });
  });
});
