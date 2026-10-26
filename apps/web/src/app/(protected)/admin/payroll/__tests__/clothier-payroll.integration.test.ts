// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";

// T126 — clothier pay on approved pedido units, gated by the approved day
// closing, against the throwaway Postgres. Skipped without a test database.

vi.setConfig({ testTimeout: 60_000 });
if (
  process.env.TEST_DATABASE_URL &&
  (process.env.NEON_LOCAL_PROXY === "1" || process.env.TEST_DATABASE_NEON === "1")
)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "admin" } }));
const settings = vi.hoisted(() => ({ payScrappedUnits: true, clothierClaimLimit: 100 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general", payoutRecording: "payoutRecording" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({ getBusinessSettings: async () => settings }));

import * as s from "@befine/db/schema";
import { getDb } from "@/lib/db";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { createPedido } from "../../../pedidos/actions";
import { assignUnits } from "../../../pedidos/production-actions";
import { approveClosing, reviewUnits } from "../../../produccion/actions";
import { reportUnits, submitMyClosing } from "../../../clothier/work-actions";
import { getMyEarnings, previewEarnings, recordPayout } from "../actions";

let f: PedidoFixture;

describe.skipIf(!hasTestDb)("clothier payroll on approved units (T126)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });

  it("pays approved units × rate (+ paid scraps), only after the closing is approved", async () => {
    const db = getDb();
    // A clothier of her own, with earnings visible to her.
    const id = `u-pay-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(s.users).values({
      id,
      name: "Luz Pagos",
      email: `${id}@test.local`,
      role: "clothier",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [emp] = await db
      .insert(s.employees)
      .values({ userId: id, role: "clothier", showEarnings: true })
      .returning();

    session.user = { id: f.admin.userId, role: "admin" };
    const p = await createPedido({
      destination: "inventory",
      lines: [
        {
          kind: "garment",
          clothPieceVariantId: f.variantId,
          unitPrice: 45_000,
          cells: [{ sizeId: f.S, quantity: 6 }],
        },
      ],
    });
    if (!p.success) throw new Error(p.error.message);
    const [cell] = await db
      .select({ id: s.pedidoLineCells.id })
      .from(s.pedidoLineCells)
      .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
      .where(eq(s.pedidoLines.pedidoId, p.data.id));
    // Special rate on this assignment.
    const a = await assignUnits({
      cellId: cell!.id,
      employeeId: emp!.id,
      quantity: 6,
      expectedUnassigned: 6,
      pieceRate: 15_000,
      rateReason: "entrega urgente",
    });
    if (!a.success) throw new Error(a.error.message);

    session.user = { id, role: "clothier" };
    await reportUnits({
      assignmentId: a.data.assignmentId,
      quantity: 6,
      idempotencyKey: crypto.randomUUID(),
    });

    session.user = { id: f.admin.userId, role: "secretary" };
    const r = await reviewUnits(a.data.assignmentId, {
      expectedPending: 6,
      approved: 4,
      returned: 1,
      returnCode: "costura",
      scrapped: 1,
      scrapCode: "tela",
      idempotencyKey: crypto.randomUUID(),
    });
    if (!r.success) throw new Error(r.error.message);

    // 4 approved + 1 scrapped (paid by setting) at $15.000; the returned one is not paid.
    session.user = { id: f.admin.userId, role: "admin" };
    const preview = await previewEarnings(emp!.id, [f.dayId]);
    expect(preview.success).toBe(true);
    if (!preview.success) return;
    expect(preview.data.computedAmount).toBe(5 * 15_000);
    expect(preview.data.breakdown.type).toBe("clothier");
    if (preview.data.breakdown.type !== "clothier") return;
    expect(
      preview.data.breakdown.lines.map((l) => [
        l.kind,
        l.quantity,
        l.pieceRate,
        l.sizeLabel,
        l.rateReason,
      ]),
    ).toEqual([
      ["approved", 4, 15_000, expect.any(String), "entrega urgente"],
      ["scrapped", 1, 15_000, expect.any(String), "entrega urgente"],
    ]);
    expect(preview.data.closingBlock).toMatch(/Luz Pagos no ha cerrado su jornada del/);

    const pay = (key = crypto.randomUUID()) =>
      recordPayout({
        idempotencyKey: key,
        employeeId: emp!.id,
        businessDayIds: [f.dayId],
        amount: 75_000,
        originalComputedAmount: 75_000,
        method: "cash",
      });
    const blocked = await pay();
    expect(!blocked.success && blocked.error.message).toMatch(/no ha cerrado su jornada/);

    // She closes (her 6 reports are today's), staff approves → now it can be settled.
    session.user = { id, role: "clothier" };
    const closing = await submitMyClosing({
      lines: [{ assignmentId: a.data.assignmentId, finished: 6 }],
      idempotencyKey: crypto.randomUUID(),
    });
    if (!closing.success) throw new Error(closing.error.message);
    session.user = { id: f.admin.userId, role: "admin" };
    const pending = await previewEarnings(emp!.id, [f.dayId]);
    expect(pending.success && pending.data.closingBlock).toMatch(/sin aprobar/);
    await approveClosing(closing.data.closingId, { version: 1 });

    // Mis ganancias shows the same figure the cashier settles.
    session.user = { id, role: "clothier" };
    const mine = await getMyEarnings();
    expect(mine.success && mine.data.today).toBe(75_000);

    session.user = { id: f.admin.userId, role: "admin" };
    const ok = await pay();
    expect(ok.success).toBe(true);
    const linked = await db
      .select()
      .from(s.payoutUnitReviews)
      .where(eq(s.payoutUnitReviews.payoutId, ok.success ? ok.data.id : ""));
    expect(linked).toHaveLength(1);

    // The same day again is a double pay.
    const again = await pay();
    expect(!again.success && again.error.code).toBe("CONFLICT");
    const [{ n }] = (
      await db.execute(sql`SELECT count(*)::int AS n FROM payouts WHERE employee_id = ${emp!.id}`)
    ).rows as { n: number }[];
    expect(n).toBe(1);
  });
});
