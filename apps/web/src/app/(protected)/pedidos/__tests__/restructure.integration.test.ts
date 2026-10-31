// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";

// T120 — admin-approved restructure against a real Postgres (scripts/test-db.sh).
// Skipped when no test database is configured.

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
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));

import * as s from "@befine/db/schema";
import { computePedidoBalance, getPedidoDetail } from "@befine/db";
import { getDb } from "@/lib/db";
import { makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../actions";
import { approveRestructure, rejectRestructure, requestRestructure } from "../restructure-actions";

let f: PedidoFixture;

async function makePedido(quantity = 10) {
  session.user = { id: f.admin.userId, role: "admin" };
  const res = await createPedido({
    idempotencyKey: crypto.randomUUID(),
    destination: "client",
    clientId: f.clientId,
    lines: [
      {
        kind: "garment",
        clothPieceVariantId: f.variantId,
        colorId: f.rojo,
        unitPrice: 45_000,
        cells: [{ sizeId: f.S, quantity }],
      },
    ],
  });
  if (!res.success) throw new Error(res.error.message);
  const detail = (await getPedidoDetail(getDb(), res.data.id))!;
  const line = detail.lines[0]!;
  if (line.kind !== "garment") throw new Error("garment expected");
  return { id: res.data.id, cellId: line.cells[0]!.id, version: detail.version };
}

/** A clothier assigned `assigned`, who reported `reported`, of which `approved` were approved. */
async function work(cellId: string, assigned: number, reported: number, approved: number) {
  const db = getDb();
  const [a] = await db
    .insert(s.assignments)
    .values({
      cellId,
      employeeId: f.clothier.employeeId,
      quantity: assigned,
      pieceRate: 12_000,
      source: "assigned",
      createdBy: f.admin.employeeId,
    })
    .returning();
  if (reported)
    await db.insert(s.unitReports).values({
      assignmentId: a!.id,
      quantity: reported,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
  if (approved)
    await db.insert(s.unitReviews).values({
      assignmentId: a!.id,
      approved,
      businessDayId: f.dayId,
      reviewedBy: f.admin.employeeId,
    });
  return a!.id;
}

const paidFor = async (assignmentId: string) =>
  (
    await getDb().execute(
      sql`SELECT coalesce(sum(approved), 0)::int AS n FROM unit_reviews WHERE assignment_id = ${assignmentId}`,
    )
  ).rows[0] as { n: number };

describe.skipIf(!hasDb)("restructure", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "admin" };
  });

  it("moves approved units out, keeps pay, cuts the total and leaves saldo a favor", async () => {
    const p = await makePedido(10);
    const a = await work(p.cellId, 8, 8, 6);
    const db = getDb();
    await db.insert(s.pedidoPayments).values({
      pedidoId: p.id,
      amount: 450_000,
      method: "cash",
      receivedAt: new Date(),
      businessDayId: f.dayId,
      recordedBy: f.admin.employeeId,
      idempotencyKey: crypto.randomUUID(),
    });

    session.user = { id: f.admin.userId, role: "secretary" };
    const req = await requestRestructure(p.id, {
      version: p.version,
      reason: "El cliente redujo el pedido",
      cells: [
        { cellId: p.cellId, newQuantity: 4, toStock: 3, toScrap: 1, pendingAction: "reject" },
      ],
    });
    expect(req.success).toBe(true);
    if (!req.success) return;

    const denied = await approveRestructure(req.data.id, { version: p.version });
    expect(denied).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });

    session.user = { id: f.admin.userId, role: "admin" };
    const res = await approveRestructure(req.data.id, { version: p.version });
    expect(res).toMatchObject({ success: true });

    // The clothier stays paid for all six approved units.
    expect(await paidFor(a)).toEqual({ n: 6 });

    const detail = (await getPedidoDetail(db, p.id))!;
    expect(detail.progress).toMatchObject({
      ordered: 4,
      approved: 2,
      delivered: 0,
      pendingReview: 0,
    });
    expect(detail.total).toBe(180_000);
    expect(computePedidoBalance(detail.total, [{ amount: 450_000 }]).saldoAFavor).toBe(270_000);

    const [move] = await db
      .select()
      .from(s.stockMovements)
      .where(
        and(eq(s.stockMovements.refType, "restructure"), eq(s.stockMovements.refId, req.data.id)),
      );
    expect(move).toMatchObject({ quantity: 3, kind: "restructure", sizeId: f.S, colorId: f.rojo });

    const [row] = await db.select().from(s.restructures).where(eq(s.restructures.id, req.data.id));
    expect(row!.approvedBy).toBe(f.admin.employeeId);
    expect(row!.summary).toMatchObject({ totalBefore: 450_000, totalAfter: 180_000 });

    const logs = await db
      .select()
      .from(s.activityLog)
      .where(and(eq(s.activityLog.action, "pedido.restructure"), eq(s.activityLog.entityId, p.id)));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.summary).toContain("3 a inventario");
  });

  it("refuses a second draft, and a rejected one changes nothing", async () => {
    const p = await makePedido(10);
    await work(p.cellId, 5, 5, 5);
    const body = {
      version: p.version,
      reason: "Motivo de prueba",
      cells: [{ cellId: p.cellId, newQuantity: 4, toStock: 1 }],
    };
    const req = await requestRestructure(p.id, body);
    expect(req.success).toBe(true);
    if (!req.success) return;
    expect(await requestRestructure(p.id, body)).toMatchObject({ error: { code: "CONFLICT" } });

    expect(await rejectRestructure(req.data.id, { reason: "No procede" })).toMatchObject({
      success: true,
    });
    expect((await getPedidoDetail(getDb(), p.id))!.progress.ordered).toBe(10);
    expect(await approveRestructure(req.data.id, { version: p.version })).toMatchObject({
      error: { code: "CONFLICT" },
    });
  });

  it("frees the room of cancelled unstarted units", async () => {
    const p = await makePedido(10);
    const a = await work(p.cellId, 8, 2, 2);
    const req = await requestRestructure(p.id, {
      version: p.version,
      reason: "Menos unidades",
      cells: [{ cellId: p.cellId, newQuantity: 5 }],
    });
    if (!req.success) throw new Error(req.error.message);
    expect(await approveRestructure(req.data.id, { version: p.version })).toMatchObject({
      success: true,
    });
    const [row] = await getDb().select().from(s.assignments).where(eq(s.assignments.id, a));
    expect(row!.quantity).toBe(5);
    expect((await getPedidoDetail(getDb(), p.id))!.progress).toMatchObject({
      ordered: 5,
      assigned: 5,
      unassigned: 0,
    });
  });

  it("rejects approval when the draft no longer fits", async () => {
    const p = await makePedido(10);
    const a = await work(p.cellId, 8, 8, 0);
    const req = await requestRestructure(p.id, {
      version: p.version,
      reason: "Motivo",
      cells: [{ cellId: p.cellId, newQuantity: 2, pendingAction: "approve", toStock: 6 }],
    });
    if (!req.success) throw new Error(req.error.message);
    await getDb().insert(s.unitReviews).values({
      assignmentId: a,
      returned: 1,
      returnCode: "other",
      businessDayId: f.dayId,
      reviewedBy: f.admin.employeeId,
    });
    expect(await approveRestructure(req.data.id, { version: p.version })).toMatchObject({
      error: { code: "CONFLICT" },
    });
    expect((await getPedidoDetail(getDb(), p.id))!.progress.ordered).toBe(10);
  });
});
