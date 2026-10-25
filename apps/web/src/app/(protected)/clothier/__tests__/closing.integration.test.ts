// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";

// T125 — Cerrar mi jornada and its approval, against the throwaway Postgres.
// Skipped without a test database.

vi.setConfig({ testTimeout: 30_000 });
if (process.env.TEST_DATABASE_URL && process.env.NEON_LOCAL_PROXY === "1")
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "clothier" } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({
  getBusinessSettings: async () => ({ clothierClaimLimit: 100, payScrappedUnits: false }),
}));

import * as s from "@befine/db/schema";
import { getDb } from "@/lib/db";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../../pedidos/actions";
import { assignUnits } from "../../pedidos/production-actions";
import {
  approveClosing,
  listClothiersWithoutClosing,
  remindClosings,
  reviewUnits,
} from "../../produccion/actions";
import { getMyClosing, reportUnits, submitMyClosing } from "../work-actions";

let f: PedidoFixture;

/** A fresh clothier (so each test owns her closing) with `units` assigned. */
async function clothierWithWork(units = 8) {
  const db = getDb();
  const id = `u-c-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(s.users).values({
    id,
    name: `Clo ${id.slice(-4)}`,
    email: `${id}@test.local`,
    role: "clothier",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [emp] = await db.insert(s.employees).values({ userId: id, role: "clothier" }).returning();
  session.user = { id: f.admin.userId, role: "admin" };
  const p = await createPedido({
    destination: "inventory",
    lines: [
      {
        kind: "garment",
        clothPieceVariantId: f.variantId,
        unitPrice: 45_000,
        cells: [{ sizeId: f.S, quantity: units }],
      },
    ],
  });
  if (!p.success) throw new Error(p.error.message);
  const [cell] = await db
    .select({ id: s.pedidoLineCells.id })
    .from(s.pedidoLineCells)
    .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
    .where(eq(s.pedidoLines.pedidoId, p.data.id));
  const a = await assignUnits({
    cellId: cell!.id,
    employeeId: emp!.id,
    quantity: units,
    expectedUnassigned: units,
  });
  if (!a.success) throw new Error(a.error.message);
  session.user = { id, role: "clothier" };
  return { userId: id, employeeId: emp!.id, assignmentId: a.data.assignmentId };
}

const todayReports = async (assignmentId: string) =>
  Number(
    (
      await getDb().execute(
        sql`SELECT coalesce(sum(quantity), 0)::int AS n FROM unit_reports WHERE assignment_id = ${assignmentId} AND business_day_id = ${f.dayId}`,
      )
    ).rows[0]!.n,
  );

const submit = (lines: { assignmentId: string; finished: number }[], confirmZero?: boolean) =>
  submitMyClosing({ lines, confirmZero, idempotencyKey: crypto.randomUUID() });

describe.skipIf(!hasTestDb)("Cerrar mi jornada (T125)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });
  beforeEach(async () => {
    await getDb().execute(
      sql`UPDATE business_days SET closed_at = NULL, closed_by = NULL WHERE id = ${f.dayId}`,
    );
  });

  it("prefills from today's reports and brings reports to the declared count", async () => {
    const c = await clothierWithWork(8);
    await reportUnits({
      assignmentId: c.assignmentId,
      quantity: 3,
      idempotencyKey: crypto.randomUUID(),
    });
    const mine = await getMyClosing();
    expect(mine.success && mine.data.lines).toEqual([
      expect.objectContaining({ assignmentId: c.assignmentId, reportedToday: 3, toDo: 5 }),
    ]);

    const up = await submit([{ assignmentId: c.assignmentId, finished: 5 }]);
    expect(up.success && up.data.units).toBe(5);
    expect(await todayReports(c.assignmentId)).toBe(5);

    // Resubmitting before approval updates the same closing.
    const down = await submit([{ assignmentId: c.assignmentId, finished: 4 }]);
    expect(down.success && up.success && down.data.closingId).toBe(
      up.success ? up.data.closingId : "",
    );
    expect(await todayReports(c.assignmentId)).toBe(4);
    const rows = await getDb()
      .select()
      .from(s.clothierDayClosings)
      .where(eq(s.clothierDayClosings.employeeId, c.employeeId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ submittedUnits: 4, version: 2 });
  });

  it("needs an explicit confirmation for a 0-unit day", async () => {
    const c = await clothierWithWork(2);
    const res = await submit([{ assignmentId: c.assignmentId, finished: 0 }]);
    expect(!res.success && res.error.message).toMatch(/Confirma que hoy no terminaste/);
    const ok = await submit([{ assignmentId: c.assignmentId, finished: 0 }], true);
    expect(ok.success).toBe(true);
  });

  it("cannot go below units already reviewed, nor above what is left", async () => {
    const c = await clothierWithWork(6);
    await reportUnits({
      assignmentId: c.assignmentId,
      quantity: 4,
      idempotencyKey: crypto.randomUUID(),
    });
    session.user = { id: f.admin.userId, role: "secretary" };
    await reviewUnits(c.assignmentId, {
      expectedPending: 4,
      approved: 3,
      returned: 0,
      scrapped: 0,
      idempotencyKey: crypto.randomUUID(),
    });
    session.user = { id: c.userId, role: "clothier" };
    const below = await submit([{ assignmentId: c.assignmentId, finished: 2 }]);
    expect(!below.success && below.error.message).toMatch(/no puede bajar de 3/);
    const above = await submit([{ assignmentId: c.assignmentId, finished: 7 }]);
    expect(!above.success && above.error.message).toMatch(/quedan 2 unidades/);
  });

  it("is approved or corrected by staff, with a reason, and then locked", async () => {
    const c = await clothierWithWork(8);
    const sub = await submit([{ assignmentId: c.assignmentId, finished: 6 }]);
    const closingId = sub.success ? sub.data.closingId : "";
    session.user = { id: f.admin.userId, role: "secretary" };

    const noReason = await approveClosing(closingId, {
      version: 1,
      corrections: [{ assignmentId: c.assignmentId, finished: 5 }],
    });
    expect(!noReason.success && noReason.error.details?.[0]?.field).toBe("reason");

    const ok = await approveClosing(closingId, {
      version: 1,
      corrections: [{ assignmentId: c.assignmentId, finished: 5 }],
      reason: "una estaba sin terminar",
    });
    expect(ok.success && ok.data.corrected).toBe(1);
    expect(await todayReports(c.assignmentId)).toBe(5);
    const [row] = await getDb()
      .select()
      .from(s.clothierDayClosings)
      .where(eq(s.clothierDayClosings.id, closingId));
    expect(row!.correctionReason).toBe("una estaba sin terminar");
    expect(row!.approvedAt).toBeInstanceOf(Date);
    expect(row!.lines).toEqual([
      expect.objectContaining({ assignmentId: c.assignmentId, submitted: 6, corrected: 5 }),
    ]);
    const [note] = await getDb()
      .select({ message: s.notifications.message })
      .from(s.notifications)
      .where(eq(s.notifications.recipientEmployeeId, c.employeeId))
      .orderBy(sql`${s.notifications.createdAt} DESC`)
      .limit(1);
    expect(note!.message).toMatch(
      /Corrigieron tu cierre de jornada: .* 6 → 5\. Motivo: una estaba sin terminar/,
    );

    session.user = { id: c.userId, role: "clothier" };
    const again = await submit([{ assignmentId: c.assignmentId, finished: 6 }]);
    expect(!again.success && again.error.message).toMatch(/ya fue aprobado/);
    const mine = await getMyClosing();
    expect(mine.success && mine.data.closing?.lines[0]?.corrected).toBe(5);
  });

  it("lists and reminds clothiers who have not closed", async () => {
    const c = await clothierWithWork(1);
    session.user = { id: f.admin.userId, role: "cashier" };
    const missing = await listClothiersWithoutClosing();
    expect(missing.success && missing.data.some((n) => n.startsWith("Clo "))).toBe(true);
    session.user = { id: f.admin.userId, role: "secretary" };
    const forbidden = await listClothiersWithoutClosing();
    expect(!forbidden.success && forbidden.error.code).toBe("FORBIDDEN");
    const reminded = await remindClosings();
    expect(reminded.success && reminded.data.reminded).toBeGreaterThan(0);
    const notes = await getDb()
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.recipientEmployeeId, c.employeeId)));
    expect(notes.some((n) => /Recuerda cerrar tu jornada/.test(n.message))).toBe(true);
  });

  it("needs an open business day to close", async () => {
    const c = await clothierWithWork(1);
    await getDb().execute(
      sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${f.dayId}`,
    );
    const res = await submit([{ assignmentId: c.assignmentId, finished: 0 }], true);
    expect(!res.success && res.error.message).toMatch(/El día no está abierto/);
    const mine = await getMyClosing();
    expect(mine.success && mine.data.dayOpen).toBe(false);
  });
});
