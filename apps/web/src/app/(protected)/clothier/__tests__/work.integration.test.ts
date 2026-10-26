// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";

// T123 — Mi trabajo actions against the throwaway Postgres: claim limit,
// release rules, reporting (rework first, open day, idempotent). Skipped
// without a test database.

vi.setConfig({ testTimeout: 30_000 });
if (
  process.env.TEST_DATABASE_URL &&
  (process.env.NEON_LOCAL_PROXY === "1" || process.env.TEST_DATABASE_NEON === "1")
)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "clothier" } }));
const settings = vi.hoisted(() => ({ clothierClaimLimit: 10 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({ getBusinessSettings: async () => settings }));
// React cache() would keep the first answer for the whole file.
vi.mock("@/lib/business-day", async () => {
  const { getDb } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  return {
    getCurrentBusinessDay: async () =>
      (await getDb().execute(sql`SELECT id FROM business_days WHERE closed_at IS NULL LIMIT 1`))
        .rows[0] ?? null,
  };
});

import * as s from "@befine/db/schema";
import { getDb, getTxDb } from "@/lib/db";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../../pedidos/actions";
import { assignUnits } from "../../pedidos/production-actions";
import { claimUnits, getMyWork, releaseMyUnits, reportUnits } from "../work-actions";

let f: PedidoFixture;

async function newPedido(sQty = 10) {
  session.user = { id: f.admin.userId, role: "admin" };
  const res = await createPedido({
    destination: "client",
    clientId: f.clientId,
    lines: [
      {
        kind: "garment",
        clothPieceVariantId: f.variantId,
        unitPrice: 45_000,
        cells: [{ sizeId: f.S, quantity: sQty }],
      },
    ],
  });
  if (!res.success) throw new Error(res.error.message);
  const [cell] = await getDb()
    .select({ id: s.pedidoLineCells.id })
    .from(s.pedidoLineCells)
    .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
    .where(eq(s.pedidoLines.pedidoId, res.data.id));
  session.user = { id: f.clothier.userId, role: "clothier" };
  return { pedidoId: res.data.id, number: res.data.number, cellId: cell!.id };
}

async function myItem(number: number) {
  const w = await getMyWork();
  if (!w.success) throw new Error(w.error.message);
  return [...w.data.corrections, ...w.data.work].find((i) => i.pedidoNumber === number)!;
}

describe.skipIf(!hasTestDb)("Mi trabajo actions (T123)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });
  beforeEach(async () => {
    session.user = { id: f.clothier.userId, role: "clothier" };
    settings.clothierClaimLimit = 10;
    // Start every test with nothing held, so the claim limit is predictable.
    await getDb().execute(sql`
      UPDATE assignments a SET quantity = coalesce((SELECT sum(r.quantity) FROM unit_reports r
        WHERE r.assignment_id = a.id AND r.kind = 'report'), 0)
      WHERE a.employee_id = ${f.clothier.employeeId}
    `);
  });

  it("claims units at the variant rate and enforces the claim limit", async () => {
    const p = await newPedido(20);
    const ok = await claimUnits({ cellId: p.cellId, quantity: 6, expectedUnassigned: 20 });
    expect(ok.success).toBe(true);
    const item = await myItem(p.number);
    expect(item).toMatchObject({ source: "claimed", pieceRate: 12_000, toDo: 6 });

    const over = await claimUnits({ cellId: p.cellId, quantity: 5, expectedUnassigned: 14 });
    expect(!over.success && over.error.message).toMatch(/hasta 4 unidades más \(límite 10\)/);
    const stale = await claimUnits({ cellId: p.cellId, quantity: 1, expectedUnassigned: 20 });
    expect(!stale.success && stale.error.code).toBe("STALE_DATA");

    const w = await getMyWork();
    expect(w.success && w.data.held).toBe(6);
    expect(w.success && w.data.claimLimit).toBe(10);
    expect(JSON.stringify(w)).not.toContain("45000");
  });

  it("sees units another clothier claimed while it waited for the lock", async () => {
    const p = await newPedido(4);
    // Another clothier takes all 4 units and holds the cell's lock a moment.
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    const other = getTxDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM pedido_line_cells WHERE id = ${p.cellId} FOR UPDATE`);
      await tx.insert(s.assignments).values({
        cellId: p.cellId,
        employeeId: f.clothier2.employeeId,
        quantity: 4,
        pieceRate: 12_000,
        source: "claimed",
        createdBy: f.clothier2.employeeId,
      });
      locked();
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await lockHeld;

    // Her screen still shows 4 free; the claim waits for the lock, then must
    // count the other claim instead of tripping the database guard.
    const res = await claimUnits({ cellId: p.cellId, quantity: 4, expectedUnassigned: 4 });
    await other;
    expect(!res.success && res.error.code).toBe("STALE_DATA");
    expect(!res.success && res.error.message).toMatch(/Otra persona ya tomó/);
  });

  it("releases only while nothing was reported", async () => {
    const p = await newPedido();
    await claimUnits({ cellId: p.cellId, quantity: 4, expectedUnassigned: 10 });
    let item = await myItem(p.number);
    expect(item.canRelease).toBe(true);
    const part = await releaseMyUnits(item.assignmentId, { version: item.version, quantity: 1 });
    expect(part.success && part.data.quantity).toBe(3);

    item = await myItem(p.number);
    await reportUnits({
      assignmentId: item.assignmentId,
      quantity: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    item = await myItem(p.number);
    expect(item.canRelease).toBe(false);
    const blocked = await releaseMyUnits(item.assignmentId, { version: item.version, quantity: 1 });
    expect(!blocked.success && blocked.error.message).toMatch(/pide a la secretaria/);
  });

  it("reports rework first, is idempotent, and caps at what is left", async () => {
    const p = await newPedido();
    session.user = { id: f.admin.userId, role: "secretary" };
    await assignUnits({
      cellId: p.cellId,
      employeeId: f.clothier.employeeId,
      quantity: 5,
      expectedUnassigned: 10,
    });
    session.user = { id: f.clothier.userId, role: "clothier" };
    let item = await myItem(p.number);

    const key = crypto.randomUUID();
    const first = await reportUnits({
      assignmentId: item.assignmentId,
      quantity: 5,
      idempotencyKey: key,
    });
    expect(first.success && first.data).toEqual({ reported: 5, rework: 0 });
    const replay = await reportUnits({
      assignmentId: item.assignmentId,
      quantity: 5,
      idempotencyKey: key,
    });
    expect(replay.success && replay.data).toEqual({ reported: 5, rework: 0 });

    // Reviewer returns 2 for rework.
    await getDb().insert(s.unitReviews).values({
      assignmentId: item.assignmentId,
      approved: 3,
      returned: 2,
      reason: "costura torcida",
      businessDayId: f.dayId,
      reviewedBy: f.admin.employeeId,
    });
    item = await myItem(p.number);
    expect(item).toMatchObject({ toDo: 2, returnReason: "costura torcida" });
    const w = await getMyWork();
    expect(w.success && w.data.corrections.some((c) => c.assignmentId === item.assignmentId)).toBe(
      true,
    );

    const tooMany = await reportUnits({
      assignmentId: item.assignmentId,
      quantity: 3,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(!tooMany.success && tooMany.error.message).toMatch(/quedan 2 unidades/);
    const rework = await reportUnits({
      assignmentId: item.assignmentId,
      quantity: 2,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(rework.success && rework.data).toEqual({ reported: 0, rework: 2 });
  });

  it("needs an open business day to report", async () => {
    const p = await newPedido();
    await claimUnits({ cellId: p.cellId, quantity: 1, expectedUnassigned: 10 });
    const item = await myItem(p.number);
    await getDb().execute(
      sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE closed_at IS NULL`,
    );
    try {
      const res = await reportUnits({
        assignmentId: item.assignmentId,
        quantity: 1,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(!res.success && res.error.message).toMatch(/El día no está abierto/);
      const w = await getMyWork();
      expect(w.success && w.data.dayOpen).toBe(false);
    } finally {
      await getDb().execute(
        sql`UPDATE business_days SET closed_at = NULL, closed_by = NULL WHERE id = ${f.dayId}`,
      );
    }
  });

  it("never touches another clothier's work, and refuses other roles", async () => {
    const p = await newPedido();
    session.user = { id: f.admin.userId, role: "secretary" };
    const other = await assignUnits({
      cellId: p.cellId,
      employeeId: f.clothier.employeeId,
      quantity: 2,
      expectedUnassigned: 10,
    });
    const assignmentId = other.success ? other.data.assignmentId : "";
    // Same assignment, but she is logged in as a different clothier.
    const [stranger] = await getDb()
      .insert(s.users)
      .values({
        id: `u-x-${Date.now()}`,
        name: "Otra",
        email: `x-${Date.now()}@test.local`,
        role: "clothier",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    await getDb().insert(s.employees).values({ userId: stranger!.id, role: "clothier" });
    session.user = { id: stranger!.id, role: "clothier" };
    const res = await reportUnits({
      assignmentId,
      quantity: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(!res.success && res.error.code).toBe("NOT_FOUND");

    session.user = { id: f.admin.userId, role: "secretary" };
    const sec = await claimUnits({ cellId: p.cellId, quantity: 1, expectedUnassigned: 8 });
    expect(!sec.success && sec.error.code).toBe("FORBIDDEN");
  });
});
