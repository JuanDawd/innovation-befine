// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";

// T127 — pedido payments, refunds and after-hours attach against the
// throwaway Postgres. Skipped without a test database.

vi.setConfig({ testTimeout: 60_000 });
if (process.env.TEST_DATABASE_URL && process.env.NEON_LOCAL_PROXY === "1")
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "cashier" } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-settings", () => ({
  getBusinessSettings: async () => ({ secretaryCanRecordPedidoPayments: false }),
}));

import * as s from "@befine/db/schema";
import { getPedidoDetail } from "@befine/db";
import { getDb } from "@/lib/db";
import { attachAfterHoursPayments } from "@/lib/after-hours";
import { hasTestDb, makeFixture, type PedidoFixture } from "@/test/pedido-db-fixture";
import { cancelPedido, createPedido, updatePedido, getPedidoForEdit } from "../actions";
import { recordPedidoPayment } from "../payment-actions";

let f: PedidoFixture;

async function pedido() {
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
  session.user = { id: f.admin.userId, role: "cashier" };
  return p.data.id;
}

const pay = (id: string, amount: number, kind: "payment" | "refund" = "payment", note?: string) =>
  recordPedidoPayment(id, {
    kind,
    amount,
    method: "cash",
    note,
    idempotencyKey: crypto.randomUUID(),
  });

describe.skipIf(!hasTestDb)("pedido payments (T127)", () => {
  beforeAll(async () => {
    f = await makeFixture();
  });

  it("records partial payments up to the balance, idempotently", async () => {
    const id = await pedido(); // $450.000
    const first = await pay(id, 200_000);
    expect(first.success && first.data).toMatchObject({ afterHours: false, balance: 250_000 });
    const over = await pay(id, 250_001);
    expect(!over.success && over.error.message).toMatch(/El saldo es \$250\.000/);

    const key = crypto.randomUUID();
    const a = await recordPedidoPayment(id, {
      kind: "payment",
      amount: 250_000,
      method: "card",
      idempotencyKey: key,
    });
    const b = await recordPedidoPayment(id, {
      kind: "payment",
      amount: 250_000,
      method: "card",
      idempotencyKey: key,
    });
    expect(a.success && b.success && a.data.id === b.data.id).toBe(true);
    const d = await getPedidoDetail(getDb(), id);
    expect(d).toMatchObject({ paid: 450_000, balance: 0 });

    const [log] = (
      await getDb().execute(
        sql`SELECT summary, business_day_id FROM activity_log WHERE entity_id = ${id} AND action = 'pedido.payment' ORDER BY created_at LIMIT 1`,
      )
    ).rows as { summary: string; business_day_id: string }[];
    expect(log!.summary).toMatch(/Registró un pago de \$200\.000 \(cash\) en el pedido #\d{4}/);
    expect(log!.business_day_id).toBe(f.dayId);
  });

  it("refunds saldo a favor after a price cut, with a reason", async () => {
    const id = await pedido();
    await pay(id, 450_000);
    session.user = { id: f.admin.userId, role: "admin" };
    const edit = await getPedidoForEdit(id);
    if (!edit.success) throw new Error();
    await updatePedido(id, {
      destination: "client",
      clientId: f.clientId,
      version: edit.data.version,
      lines: [
        {
          kind: "garment",
          id: edit.data.lines[0]!.id,
          clothPieceVariantId: f.variantId,
          unitPrice: 40_000,
          priceReason: "descuento",
          cells: [{ sizeId: f.S, quantity: 10 }],
        },
      ],
    });
    session.user = { id: f.admin.userId, role: "cashier" };
    const noNote = await pay(id, 50_000, "refund");
    expect(!noNote.success && noNote.error.message).toMatch(/motivo/);
    const tooMuch = await pay(id, 50_001, "refund", "descuento");
    expect(!tooMuch.success && tooMuch.error.message).toMatch(/\$50\.000/);
    const ok = await pay(id, 50_000, "refund", "descuento aplicado");
    expect(ok.success).toBe(true);
    const d = await getPedidoDetail(getDb(), id);
    expect(d).toMatchObject({ paid: 400_000, balance: 0, saldoAFavor: 0 });
    expect(d!.payments.at(-1)).toMatchObject({ amount: -50_000, note: "descuento aplicado" });
  });

  it("takes payments after hours and attaches them exactly once to the next day", async () => {
    const id = await pedido();
    const db = getDb();
    await db.execute(
      sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${f.dayId}`,
    );
    try {
      const res = await pay(id, 100_000);
      expect(res.success && res.data.afterHours).toBe(true);
      const [row] = await db
        .select()
        .from(s.pedidoPayments)
        .where(eq(s.pedidoPayments.pedidoId, id));
      expect(row).toMatchObject({ afterHours: true, businessDayId: null });

      const [next] = await db
        .insert(s.businessDays)
        .values({ openedBy: f.admin.userId })
        .returning();
      const actor = { userId: f.admin.userId, role: "cashier" };
      expect(await attachAfterHoursPayments(next!.id, actor)).toBeGreaterThanOrEqual(1);
      expect(await attachAfterHoursPayments(next!.id, actor)).toBe(0);
      const [attached] = await db
        .select()
        .from(s.pedidoPayments)
        .where(eq(s.pedidoPayments.pedidoId, id));
      expect(attached).toMatchObject({ afterHours: true, businessDayId: next!.id });
      const logs = (
        await db.execute(
          sql`SELECT summary FROM activity_log WHERE entity_id = ${id} AND action = 'pedido.payment_attach'`,
        )
      ).rows as { summary: string }[];
      expect(logs).toHaveLength(1);
      expect(logs[0]!.summary).toMatch(/Pagado fuera de horario el/);
      await db.execute(
        sql`UPDATE business_days SET closed_at = now(), closed_by = opened_by WHERE id = ${next!.id}`,
      );
    } finally {
      await db.execute(
        sql`UPDATE business_days SET closed_at = NULL, closed_by = NULL WHERE id = ${f.dayId}`,
      );
    }
  });

  it("refunds a cancelled pedido's payments but takes no new ones", async () => {
    const id = await pedido();
    await pay(id, 100_000);
    session.user = { id: f.admin.userId, role: "admin" };
    const edit = await getPedidoForEdit(id);
    await cancelPedido(id, {
      version: edit.success ? edit.data.version : 1,
      reason: "desistió",
      acknowledgePayments: true,
    });
    session.user = { id: f.admin.userId, role: "cashier" };
    const more = await pay(id, 10_000);
    expect(!more.success && more.error.message).toMatch(/cancelado/);
    const back = await pay(id, 100_000, "refund", "pedido cancelado");
    expect(back.success).toBe(true);
  });
});
