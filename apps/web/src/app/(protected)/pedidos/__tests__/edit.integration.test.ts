// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";

// T119 — edit rules after production starts and cancellation, against a real
// Postgres (scripts/test-db.sh). Skipped when no test database is configured.
// Every test builds its own pedido; the database is throwaway.

// Real round trips to the throwaway database: allow more than the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

const url = process.env.TEST_DATABASE_URL;
const hasDb = Boolean(url) && process.env.NEON_LOCAL_PROXY === "1";
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
import { getDb } from "@/lib/db";
import { getPedidoDetail } from "@befine/db";
import { makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import {
  cancelPedido,
  createPedido,
  getPedidoForEdit,
  recordDelivery,
  updatePedido,
} from "../actions";
import {
  assignUnits,
  changeAssignmentRate,
  listClothiers,
  releaseAssignment,
} from "../production-actions";

let f: PedidoFixture;

const garment = (over: Record<string, unknown> = {}) => ({
  kind: "garment",
  clothPieceVariantId: f.variantId,
  colorId: f.rojo,
  style: "tiro alto",
  unitPrice: 45_000,
  cells: [
    { sizeId: f.S, quantity: 10 },
    { sizeId: f.M, quantity: 5 },
  ],
  ...over,
});

async function newPedido() {
  const res = await createPedido({
    destination: "client",
    clientId: f.clientId,
    lines: [garment()],
  });
  if (!res.success) throw new Error(res.error.message);
  const edit = await getPedidoForEdit(res.data.id);
  if (!edit.success) throw new Error(edit.error.message);
  return edit.data;
}

/** Assign `units` of the S cell to the clothier, optionally reporting and approving some. */
async function work(pedidoId: string, units: number, reported = 0, approved = 0) {
  const db = getDb();
  const [cell] = await db
    .select({ id: s.pedidoLineCells.id })
    .from(s.pedidoLineCells)
    .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
    .where(and(eq(s.pedidoLines.pedidoId, pedidoId), eq(s.pedidoLineCells.sizeId, f.S)));
  const [a] = await db
    .insert(s.assignments)
    .values({
      cellId: cell!.id,
      employeeId: f.clothier.employeeId,
      quantity: units,
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

const edit = (p: Awaited<ReturnType<typeof newPedido>>, lines: unknown[]) =>
  updatePedido(p.id, {
    destination: "client",
    clientId: f.clientId,
    version: p.version,
    lines: lines.map((l, i) => ({ id: p.lines[i]?.id, ...(l as object) })),
  });

const logCount = async (pedidoId: string) =>
  Number(
    (
      await getDb().execute(
        sql`SELECT count(*)::int AS n FROM activity_log WHERE entity_id = ${pedidoId}`,
      )
    ).rows[0]!.n,
  );

describe.skipIf(!hasDb)("pedido edits after production starts (T119)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "admin" };
  });

  it("allows increases and decreases down to assigned units", async () => {
    const p = await newPedido();
    await work(p.id, 6);
    const up = await edit(p, [
      garment({
        cells: [
          { sizeId: f.S, quantity: 12 },
          { sizeId: f.M, quantity: 5 },
        ],
      }),
    ]);
    expect(up.success).toBe(true);
    const p2 = (await getPedidoForEdit(p.id)) as { success: true; data: typeof p };
    expect(p2.data.started).toBe(true);
    expect(p2.data.limits[p.lines[0]!.id!]!.cells[f.S]).toEqual({ min: 6, locked: true });
    const down = await edit(p2.data, [
      garment({
        cells: [
          { sizeId: f.S, quantity: 6 },
          { sizeId: f.M, quantity: 5 },
        ],
      }),
    ]);
    expect(down.success).toBe(true);
  });

  it("rejects a decrease below assigned units with a Spanish message and logs nothing", async () => {
    const p = await newPedido();
    await work(p.id, 6);
    const before = await logCount(p.id);
    const res = await edit(p, [
      garment({
        cells: [
          { sizeId: f.S, quantity: 4 },
          { sizeId: f.M, quantity: 5 },
        ],
      }),
    ]);
    expect(!res.success && res.error.message).toMatch(/no puede bajar de 6 \(6 ya asignadas\)/);
    expect(await logCount(p.id)).toBe(before);
  });

  it("rejects removing a worked size or line, allows removing an untouched size", async () => {
    const p = await newPedido();
    await work(p.id, 3);
    const dropS = await edit(p, [garment({ cells: [{ sizeId: f.M, quantity: 5 }] })]);
    expect(!dropS.success && dropS.error.message).toMatch(/ya tiene unidades trabajadas/);
    const dropM = await edit(p, [garment({ cells: [{ sizeId: f.S, quantity: 10 }] })]);
    expect(dropM.success).toBe(true);
    const p2 = (await getPedidoForEdit(p.id)) as { success: true; data: typeof p };
    const dropLine = await updatePedido(p.id, {
      destination: "client",
      clientId: f.clientId,
      version: p2.data.version,
      lines: [garment({ cells: [{ sizeId: f.M, quantity: 1 }] })],
    });
    expect(!dropLine.success && dropLine.error.message).toMatch(/No se puede quitar una prenda/);
  });

  it("requires a reason for spec changes, records them and notifies the clothier", async () => {
    const p = await newPedido();
    await work(p.id, 4);
    const noReason = await edit(p, [garment({ colorId: f.azul })]);
    expect(!noReason.success && noReason.error.details?.[0]?.field).toBe("lines.0.changeReason");

    const ok = await edit(p, [garment({ colorId: f.azul, changeReason: "la clienta lo pidió" })]);
    expect(ok.success).toBe(true);
    const [line] = await getDb()
      .select({ specChange: s.pedidoLines.specChange, at: s.pedidoLines.specChangedAt })
      .from(s.pedidoLines)
      .where(eq(s.pedidoLines.id, p.lines[0]!.id!));
    expect(line!.specChange).toMatchObject({ reason: "la clienta lo pidió" });
    expect((line!.specChange as { summary: string }).summary).toMatch(/^color Rojo \w+ → Azul/);
    expect(line!.at).toBeInstanceOf(Date);

    const notes = await getDb()
      .select({ message: s.notifications.message, type: s.notifications.type })
      .from(s.notifications)
      .where(eq(s.notifications.recipientEmployeeId, f.clothier.employeeId));
    expect(
      notes.some(
        (n) => n.type === "pedido_changed" && /Motivo: la clienta lo pidió/.test(n.message),
      ),
    ).toBe(true);
  });

  it("blocks changing the garment or the destination once started", async () => {
    const p = await newPedido();
    await work(p.id, 2);
    const [other] = await getDb()
      .insert(s.clothPieceVariants)
      .values({
        clothPieceId: (
          await getDb()
            .select({ id: s.clothPieceVariants.clothPieceId })
            .from(s.clothPieceVariants)
            .where(eq(s.clothPieceVariants.id, f.variantId))
        )[0]!.id,
        name: "Entera",
        pieceRate: 15_000,
        sellingPrice: 45_000,
      })
      .returning();
    const variant = await edit(p, [garment({ clothPieceVariantId: other!.id })]);
    expect(!variant.success && variant.error.details?.[0]?.field).toBe(
      "lines.0.clothPieceVariantId",
    );
    const dest = await updatePedido(p.id, {
      destination: "inventory",
      version: p.version,
      lines: [{ id: p.lines[0]!.id, ...garment() }],
    });
    expect(!dest.success && dest.error.details?.[0]?.field).toBe("destination");
  });

  it("turns overpayment into saldo a favor after a price cut", async () => {
    const p = await newPedido(); // 15 × $45.000 = $675.000
    await getDb().insert(s.pedidoPayments).values({
      pedidoId: p.id,
      amount: 675_000,
      method: "cash",
      businessDayId: f.dayId,
      recordedBy: f.admin.employeeId,
      idempotencyKey: crypto.randomUUID(),
    });
    const res = await edit(p, [garment({ unitPrice: 40_000, priceReason: "descuento acordado" })]);
    expect(res.success && res.data.saldoAFavor).toBe(75_000);
    const [entry] = (
      await getDb().execute(
        sql`SELECT summary, reason FROM activity_log WHERE entity_id = ${p.id} AND action = 'pedido.update' ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows as { summary: string; reason: string }[];
    expect(entry!.summary).toMatch(/total \$675\.000 → \$600\.000/);
    expect(entry!.summary).toMatch(/saldo a favor \$75\.000/);
    expect(entry!.reason).toMatch(/descuento acordado/);
  });

  it("returns STALE_DATA for a stale version", async () => {
    const p = await newPedido();
    await edit(p, [garment()]);
    const stale = await edit(p, [garment()]);
    expect(!stale.success && stale.error.code).toBe("STALE_DATA");
  });
});

describe.skipIf(!hasDb)("cancelPedido (spec §3.4.18)", () => {
  beforeAll(async () => {
    f ??= await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "admin" };
  });

  it("is blocked while any unit is approved", async () => {
    const p = await newPedido();
    await work(p.id, 4, 2, 1);
    const res = await cancelPedido(p.id, { version: p.version, reason: "desistió" });
    expect(!res.success && res.error.message).toMatch(/hay unidades aprobadas/);
  });

  it("is blocked while reported units wait for review", async () => {
    const p = await newPedido();
    await work(p.id, 4, 2);
    const res = await cancelPedido(p.id, { version: p.version, reason: "desistió" });
    expect(!res.success && res.error.message).toMatch(/reportadas sin revisar/);
  });

  it("requires acknowledging recorded payments", async () => {
    const p = await newPedido();
    await getDb().insert(s.pedidoPayments).values({
      pedidoId: p.id,
      amount: 100_000,
      method: "cash",
      businessDayId: f.dayId,
      recordedBy: f.admin.employeeId,
      idempotencyKey: crypto.randomUUID(),
    });
    const res = await cancelPedido(p.id, { version: p.version, reason: "desistió" });
    expect(!res.success && res.error.details?.[0]?.field).toBe("acknowledgePayments");
    const ok = await cancelPedido(p.id, {
      version: p.version,
      reason: "desistió",
      acknowledgePayments: true,
    });
    expect(ok.success).toBe(true);
  });

  it("cancels, releases unstarted units and logs the reason", async () => {
    const p = await newPedido();
    const assignmentId = await work(p.id, 5);
    const res = await cancelPedido(p.id, { version: p.version, reason: "La clienta desistió" });
    expect(res.success).toBe(true);
    const [a] = await getDb()
      .select({ quantity: s.assignments.quantity })
      .from(s.assignments)
      .where(eq(s.assignments.id, assignmentId));
    expect(a!.quantity).toBe(0);
    const [pedido] = await getDb()
      .select({ reason: s.pedidos.cancellationReason })
      .from(s.pedidos)
      .where(eq(s.pedidos.id, p.id));
    expect(pedido!.reason).toBe("La clienta desistió");
    const again = await cancelPedido(p.id, { version: p.version + 1, reason: "otra vez" });
    expect(!again.success && again.error.code).toBe("CONFLICT");
    const editCancelled = await edit({ ...p, version: p.version + 1 }, [garment()]);
    expect(!editCancelled.success && editCancelled.error.code).toBe("CONFLICT");
  });

  it("returns FORBIDDEN for a clothier", async () => {
    session.user = { id: f.clothier.userId, role: "clothier" };
    const res = await cancelPedido("00000000-0000-4000-8000-000000000001", {
      version: 1,
      reason: "x".repeat(5),
    });
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });
});

describe.skipIf(!hasDb)("recordDelivery (T121)", () => {
  beforeAll(async () => {
    f ??= await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "secretary" };
  });

  async function sCell(pedidoId: string) {
    const d = await getPedidoDetail(getDb(), pedidoId);
    const line = d!.lines[0]!;
    if (line.kind !== "garment") throw new Error("expected garment");
    return {
      detail: d!,
      s: line.cells.find((c) => c.sizeId === f.S)!,
      m: line.cells.find((c) => c.sizeId === f.M)!,
    };
  }

  it("delivers only approved undelivered units and moves the status", async () => {
    session.user = { id: f.admin.userId, role: "admin" };
    const p = await newPedido(); // S 10, M 5
    await work(p.id, 10, 10, 6);
    const { s: cell } = await sCell(p.id);

    const tooMany = await recordDelivery(p.id, {
      idempotencyKey: crypto.randomUUID(),
      cells: [{ cellId: cell.id, quantity: 7 }],
    });
    expect(!tooMany.success && tooMany.error.message).toMatch(/solo tiene 6 unidades listas/);

    const key = crypto.randomUUID();
    const first = await recordDelivery(p.id, {
      idempotencyKey: key,
      note: "la recogió la hermana",
      cells: [{ cellId: cell.id, quantity: 4 }],
    });
    expect(first.success && first.data.units).toBe(4);
    // Same key again: no second delivery.
    const retry = await recordDelivery(p.id, {
      idempotencyKey: key,
      cells: [{ cellId: cell.id, quantity: 4 }],
    });
    expect(retry.success && retry.success && first.success && retry.data.deliveryId).toBe(
      first.success ? first.data.deliveryId : "",
    );
    const after = await sCell(p.id);
    expect(after.s.progress.delivered).toBe(4);
    expect(after.detail.status).toBe("partially_delivered");

    const [log] = (
      await getDb().execute(
        sql`SELECT summary FROM activity_log WHERE entity_id = ${p.id} AND action = 'pedido.deliver'`,
      )
    ).rows as { summary: string }[];
    expect(log!.summary).toMatch(/^Entregó 4 unidades del pedido #\d{4}$/);
  });

  it("reaches Entregado when every unit is delivered", async () => {
    const p = await newPedido();
    // Approve everything on both sizes.
    await work(p.id, 10, 10, 10);
    const { m } = await sCell(p.id);
    const [am] = await getDb()
      .insert(s.assignments)
      .values({
        cellId: m.id,
        employeeId: f.clothier.employeeId,
        quantity: 5,
        pieceRate: 12_000,
        source: "assigned",
        createdBy: f.admin.employeeId,
      })
      .returning();
    await getDb().insert(s.unitReports).values({
      assignmentId: am!.id,
      quantity: 5,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
    await getDb().insert(s.unitReviews).values({
      assignmentId: am!.id,
      approved: 5,
      businessDayId: f.dayId,
      reviewedBy: f.admin.employeeId,
    });
    const cells = await sCell(p.id);
    const res = await recordDelivery(p.id, {
      idempotencyKey: crypto.randomUUID(),
      deliveredOn: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
        new Date(),
      ),
      cells: [
        { cellId: cells.s.id, quantity: 10 },
        { cellId: cells.m.id, quantity: 5 },
      ],
    });
    expect(res.success).toBe(true);
    expect((await sCell(p.id)).detail.status).toBe("delivered");
  });

  it("rejects future dates, inventory pedidos and empty deliveries", async () => {
    const p = await newPedido();
    const { s: cell } = await sCell(p.id);
    const future = await recordDelivery(p.id, {
      idempotencyKey: crypto.randomUUID(),
      deliveredOn: "2999-01-01",
      cells: [{ cellId: cell.id, quantity: 1 }],
    });
    expect(!future.success && future.error.details?.[0]?.field).toBe("deliveredOn");
    const empty = await recordDelivery(p.id, {
      idempotencyKey: crypto.randomUUID(),
      cells: [{ cellId: cell.id, quantity: 0 }],
    });
    expect(!empty.success && empty.error.code).toBe("VALIDATION_ERROR");

    const inv = await createPedido({ destination: "inventory", lines: [garment()] });
    const invRes = await recordDelivery(inv.success ? inv.data.id : "", {
      idempotencyKey: crypto.randomUUID(),
      cells: [{ cellId: cell.id, quantity: 1 }],
    });
    expect(!invRes.success && invRes.error.message).toMatch(/inventario/);
  });

  it("returns FORBIDDEN for a stylist", async () => {
    session.user = { id: f.admin.userId, role: "stylist" };
    const res = await recordDelivery("00000000-0000-4000-8000-000000000001", {
      idempotencyKey: crypto.randomUUID(),
      cells: [{ cellId: "00000000-0000-4000-8000-000000000002", quantity: 1 }],
    });
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });
});

describe.skipIf(!hasDb)("assigning work (T122)", () => {
  beforeAll(async () => {
    f ??= await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "secretary" };
  });

  async function cellOf(pedidoId: string, sizeId: string) {
    const d = await getPedidoDetail(getDb(), pedidoId);
    const line = d!.lines[0]!;
    if (line.kind !== "garment") throw new Error("expected garment");
    return { line, cell: line.cells.find((c) => c.sizeId === sizeId)! };
  }

  it("assigns units, copies the variant rate and notifies the clothier", async () => {
    const p = await newPedido(); // S 10
    const { cell } = await cellOf(p.id, f.S);
    const res = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 6,
      expectedUnassigned: 10,
    });
    expect(res.success && res.data.unassigned).toBe(4);
    const { line } = await cellOf(p.id, f.S);
    expect(line.assignments).toEqual([
      expect.objectContaining({ employeeName: "Luz", pieceRate: 12_000, rateReason: null }),
    ]);
    const notes = await getDb()
      .select({ message: s.notifications.message })
      .from(s.notifications)
      .where(eq(s.notifications.recipientEmployeeId, f.clothier.employeeId));
    expect(
      notes.some((n) =>
        /Te asignaron 6 unidades: .* talla S-\w+ .* \$12\.000 c\/u \(\$72\.000\)/.test(n.message),
      ),
    ).toBe(true);
    // No client price in what the clothier receives.
    expect(notes.every((n) => !n.message.includes("45.000"))).toBe(true);
  });

  it("refuses stale screens and over-assignment", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 6,
      expectedUnassigned: 10,
    });
    const stale = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 2,
      expectedUnassigned: 10,
    });
    expect(!stale.success && stale.error.code).toBe("STALE_DATA");
    expect(!stale.success && stale.error.message).toMatch(/ahora son 4/);
    const over = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 5,
      expectedUnassigned: 4,
    });
    expect(!over.success && over.error.message).toMatch(/Solo quedan 4 unidades sin asignar/);
  });

  it("merges a second assignment to the same clothier at the same rate", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 3,
      expectedUnassigned: 10,
    });
    await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 4,
      expectedUnassigned: 7,
    });
    const { line } = await cellOf(p.id, f.S);
    expect(line.assignments).toHaveLength(1);
    expect(line.assignments[0]!.progress.live).toBe(7);
  });

  it("only assigns to active clothiers", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    const res = await assignUnits({
      cellId: cell.id,
      employeeId: f.admin.employeeId,
      quantity: 1,
      expectedUnassigned: 10,
    });
    expect(!res.success && res.error.details?.[0]?.field).toBe("employeeId");
    const list = await listClothiers();
    expect(list.success && list.data.some((c) => c.id === f.clothier.employeeId)).toBe(true);
    expect(list.success && list.data.some((c) => c.id === f.admin.employeeId)).toBe(false);
  });

  it("lets only admin set a special rate, with a reason, and logs it", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    const sec = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 2,
      expectedUnassigned: 10,
      pieceRate: 20_000,
      rateReason: "urgente",
    });
    expect(!sec.success && sec.error.code).toBe("FORBIDDEN");

    session.user = { id: f.admin.userId, role: "admin" };
    const noReason = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 2,
      expectedUnassigned: 10,
      pieceRate: 20_000,
    });
    expect(!noReason.success && noReason.error.details?.[0]?.field).toBe("rateReason");
    const ok = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 2,
      expectedUnassigned: 10,
      pieceRate: 20_000,
      rateReason: "bordado a mano",
    });
    expect(ok.success).toBe(true);
    const [entry] = (
      await getDb().execute(
        sql`SELECT summary, reason FROM activity_log WHERE entity_id = ${p.id} AND action = 'production.assign' ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows as { summary: string; reason: string }[];
    expect(entry!.summary).toMatch(/tarifa especial \$20\.000/);
    expect(entry!.reason).toBe("bordado a mano");
  });

  it("changes a rate only before work starts, admin only", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    const a = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 5,
      expectedUnassigned: 10,
    });
    const id = a.success ? a.data.assignmentId : "";
    const sec = await changeAssignmentRate(id, {
      version: 1,
      pieceRate: 15_000,
      reason: "urgente",
    });
    expect(!sec.success && sec.error.code).toBe("FORBIDDEN");

    session.user = { id: f.admin.userId, role: "admin" };
    const ok = await changeAssignmentRate(id, {
      version: 1,
      pieceRate: 15_000,
      reason: "entrega urgente",
    });
    expect(ok.success).toBe(true);
    const stale = await changeAssignmentRate(id, {
      version: 1,
      pieceRate: 16_000,
      reason: "otra vez",
    });
    expect(!stale.success && stale.error.code).toBe("STALE_DATA");

    await getDb().insert(s.unitReports).values({
      assignmentId: id,
      quantity: 1,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
    const late = await changeAssignmentRate(id, {
      version: 2,
      pieceRate: 16_000,
      reason: "otra vez",
    });
    expect(!late.success && late.error.message).toMatch(/ya reportó/);
  });

  it("releases only unreported units", async () => {
    const p = await newPedido();
    const { cell } = await cellOf(p.id, f.S);
    const a = await assignUnits({
      cellId: cell.id,
      employeeId: f.clothier.employeeId,
      quantity: 5,
      expectedUnassigned: 10,
    });
    const id = a.success ? a.data.assignmentId : "";
    await getDb().insert(s.unitReports).values({
      assignmentId: id,
      quantity: 2,
      businessDayId: f.dayId,
      reportedBy: f.clothier.employeeId,
    });
    const tooMany = await releaseAssignment(id, { version: 1, quantity: 4 });
    expect(!tooMany.success && tooMany.error.message).toMatch(/Solo se pueden liberar 3 unidades/);
    const ok = await releaseAssignment(id, { version: 1, quantity: 3 });
    expect(ok.success && ok.data.quantity).toBe(2);
    const { cell: after } = await cellOf(p.id, f.S);
    expect(after.progress.unassigned).toBe(8);
  });

  it("returns FORBIDDEN for clothiers and stylists", async () => {
    for (const role of ["clothier", "stylist"]) {
      session.user = { id: f.clothier.userId, role };
      const res = await assignUnits({
        cellId: "00000000-0000-4000-8000-000000000001",
        employeeId: f.clothier.employeeId,
        quantity: 1,
        expectedUnassigned: 1,
      });
      expect(!res.success && res.error.code).toBe("FORBIDDEN");
    }
  });
});
