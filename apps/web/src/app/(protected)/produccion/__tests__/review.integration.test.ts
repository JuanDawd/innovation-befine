// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";

// T124 — reviewing reported units against the throwaway Postgres. Skipped
// without a test database.

vi.setConfig({ testTimeout: 30_000 });
if (
  process.env.TEST_DATABASE_URL &&
  (process.env.NEON_LOCAL_PROXY === "1" || process.env.TEST_DATABASE_NEON === "1")
)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "secretary" } }));
const settings = vi.hoisted(() => ({ payScrappedUnits: false, clothierClaimLimit: 50 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({ getBusinessSettings: async () => settings }));

import * as s from "@befine/db/schema";
import { getClothierWork, getPedidoDetail } from "@befine/db";
import { getDb } from "@/lib/db";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../../pedidos/actions";
import { assignUnits } from "../../pedidos/production-actions";
import { getProductionBoard, reviewUnits } from "../actions";

let f: PedidoFixture;

/** A pedido with `reported` of 8 assigned units reported by the clothier. */
async function reported(n = 6) {
  session.user = { id: f.admin.userId, role: "admin" };
  const p = await createPedido({
    destination: "client",
    clientId: f.clientId,
    lines: [
      {
        kind: "garment",
        clothPieceVariantId: f.variantId,
        unitPrice: 45_000,
        cells: [{ sizeId: f.S, quantity: 10 }],
      },
    ],
  });
  if (!p.success) throw new Error(p.error.message);
  const d = await getPedidoDetail(getDb(), p.data.id);
  const line = d!.lines[0]!;
  if (line.kind !== "garment") throw new Error("garment expected");
  const a = await assignUnits({
    cellId: line.cells[0]!.id,
    employeeId: f.clothier.employeeId,
    quantity: 8,
    expectedUnassigned: 10,
  });
  if (!a.success) throw new Error(a.error.message);
  await getDb().insert(s.unitReports).values({
    assignmentId: a.data.assignmentId,
    quantity: n,
    businessDayId: f.dayId,
    reportedBy: f.clothier.employeeId,
  });
  session.user = { id: f.admin.userId, role: "secretary" };
  return { pedidoId: p.data.id, assignmentId: a.data.assignmentId };
}

const review = (assignmentId: string, input: Record<string, unknown>) =>
  reviewUnits(assignmentId, {
    approved: 0,
    returned: 0,
    scrapped: 0,
    idempotencyKey: crypto.randomUUID(),
    ...input,
  });

describe.skipIf(!hasTestDb)("reviewUnits (T124)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });
  beforeEach(() => {
    session.user = { id: f.admin.userId, role: "secretary" };
    settings.payScrappedUnits = false;
  });

  it("approves, returns and scraps in one decision", async () => {
    const r = await reported(6);
    const res = await review(r.assignmentId, {
      expectedPending: 6,
      approved: 3,
      returned: 2,
      returnCode: "costura",
      returnNote: "manga izquierda",
      scrapped: 1,
      scrapCode: "tela",
    });
    expect(res.success && res.data).toEqual({ approved: 3, returned: 2, scrapped: 1 });

    const [row] = await getDb()
      .select()
      .from(s.unitReviews)
      .where(eq(s.unitReviews.assignmentId, r.assignmentId));
    expect(row).toMatchObject({
      reason: "Costura torcida o suelta: manga izquierda",
      returnCode: "costura",
      scrapCode: "tela",
      scrapReason: "Tela dañada",
      scrapPaid: false,
    });

    // Returned units come back first on her phone; the scrapped one re-opens.
    const work = await getClothierWork(getDb(), f.clothier.employeeId);
    expect(work.corrections.some((c) => c.assignmentId === r.assignmentId)).toBe(true);
    const d = await getPedidoDetail(getDb(), r.pedidoId);
    const line = d!.lines[0]!;
    if (line.kind !== "garment") throw new Error();
    expect(line.cells[0]!.progress).toMatchObject({ approved: 3, scrapped: 1, unassigned: 3 });

    const [note] = await getDb()
      .select({ message: s.notifications.message })
      .from(s.notifications)
      .where(eq(s.notifications.recipientEmployeeId, f.clothier.employeeId))
      .orderBy(sql`${s.notifications.createdAt} DESC`)
      .limit(1);
    expect(note!.message).toMatch(
      /Te aprobaron 3 unidades .* Te devolvieron 2 unidades para corregir: Costura torcida o suelta: manga izquierda\. .* No se pagan\./,
    );
  });

  it("copies the scrapped-pay setting at review time", async () => {
    settings.payScrappedUnits = true;
    const r = await reported(2);
    await review(r.assignmentId, { expectedPending: 2, scrapped: 2, scrapCode: "mancha" });
    const [row] = await getDb()
      .select({ scrapPaid: s.unitReviews.scrapPaid })
      .from(s.unitReviews)
      .where(eq(s.unitReviews.assignmentId, r.assignmentId));
    expect(row!.scrapPaid).toBe(true);
  });

  it("rejects more than pending, stale screens and missing defect codes", async () => {
    const r = await reported(4);
    const tooMany = await review(r.assignmentId, { expectedPending: 4, approved: 5 });
    expect(!tooMany.success && tooMany.error.code).toBe("VALIDATION_ERROR");
    const stale = await review(r.assignmentId, { expectedPending: 6, approved: 1 });
    expect(!stale.success && stale.error.message).toMatch(/Ahora hay 4 unidades/);
    const noCode = await review(r.assignmentId, { expectedPending: 4, returned: 1 });
    expect(!noCode.success && noCode.error.details?.[0]?.field).toBe("returnCode");
    const otherNoNote = await review(r.assignmentId, {
      expectedPending: 4,
      scrapped: 1,
      scrapCode: "otro",
    });
    expect(!otherNoNote.success && otherNoNote.error.details?.[0]?.field).toBe("scrapNote");
  });

  it("records a double tap once", async () => {
    const r = await reported(3);
    const key = crypto.randomUUID();
    const a = await review(r.assignmentId, {
      expectedPending: 3,
      approved: 3,
      idempotencyKey: key,
    });
    const b = await review(r.assignmentId, {
      expectedPending: 3,
      approved: 3,
      idempotencyKey: key,
    });
    expect(a.success && b.success).toBe(true);
    const rows = await getDb()
      .select()
      .from(s.unitReviews)
      .where(eq(s.unitReviews.assignmentId, r.assignmentId));
    expect(rows).toHaveLength(1);
  });

  it("needs an open business day", async () => {
    const r = await reported(1);
    await getDb().execute(
      sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${f.dayId}`,
    );
    try {
      const res = await review(r.assignmentId, { expectedPending: 1, approved: 1 });
      expect(!res.success && res.error.message).toMatch(/Abre el día/);
    } finally {
      await getDb().execute(
        sql`UPDATE business_days SET closed_at = NULL, closed_by = NULL WHERE id = ${f.dayId}`,
      );
    }
  });

  it("shows the queue grouped by clothier and refuses clothiers", async () => {
    const r = await reported(2);
    const board = await getProductionBoard();
    expect(board.success).toBe(true);
    const mine =
      board.success && board.data.queue.find((g) => g.employeeId === f.clothier.employeeId);
    expect(mine && mine.items.some((i) => i.assignmentId === r.assignmentId)).toBe(true);

    session.user = { id: f.clothier.userId, role: "clothier" };
    const res = await review(r.assignmentId, { expectedPending: 2, approved: 2 });
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });
});
