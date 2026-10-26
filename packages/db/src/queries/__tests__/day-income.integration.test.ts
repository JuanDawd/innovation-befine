import { it, expect } from "vitest";
import { sql } from "drizzle-orm";
import * as s from "../../schema";
import { getDayIncome } from "../day-income";
import {
  describeDb,
  makeClothSale,
  makeClothVariant,
  makeDay,
  makeEmployee,
  withCleanDb,
} from "./helpers/test-db";

// T130 — the till reconciles with the day's ticket payments, pedido payments
// and garment sales; another day's money never leaks in.

type Db = Parameters<Parameters<typeof withCleanDb>[0]>[0];

async function pedidoWithPayments(
  db: Db,
  createdBy: string,
  payments: {
    dayId: string | null;
    amount: number;
    method: "cash" | "card" | "transfer";
    afterHours?: boolean;
  }[],
) {
  const [client] = await db
    .insert(s.clients)
    .values({ name: "Ana", phone: "3000000000" })
    .returning();
  const [p] = await db
    .insert(s.pedidos)
    .values({ destination: "client", clientId: client!.id, createdBy })
    .returning();
  for (const pay of payments)
    await db.insert(s.pedidoPayments).values({
      pedidoId: p!.id,
      amount: pay.amount,
      method: pay.method,
      businessDayId: pay.dayId,
      afterHours: pay.afterHours ?? false,
      recordedBy: createdBy,
      note: pay.amount < 0 ? "devolución" : null,
      idempotencyKey: crypto.randomUUID(),
    });
}

async function checkout(
  db: Db,
  dayId: string,
  cashierId: string,
  payments: ["cash" | "card" | "transfer", number][],
) {
  const [cs] = await db
    .insert(s.checkoutSessions)
    .values({
      businessDayId: dayId,
      cashierId,
      totalAmount: payments.reduce((n, [, a]) => n + a, 0),
    })
    .returning();
  await db
    .insert(s.ticketPayments)
    .values(payments.map(([method, amount]) => ({ checkoutSessionId: cs!.id, method, amount })));
}

describeDb("getDayIncome", () => {
  it("reconciles with the sum of ticket payments, pedido payments and sales", () =>
    withCleanDb(async (db) => {
      const cashier = await makeEmployee(db, { role: "cashier" });
      const yesterday = await makeDay(db, "2026-10-24T13:00:00Z", { openedBy: cashier.userId });
      const today = await makeDay(db, "2026-10-25T13:00:00Z", {
        open: true,
        openedBy: cashier.userId,
      });

      await checkout(db, today, cashier.id, [
        ["cash", 45_000],
        ["card", 25_000],
      ]);
      await checkout(db, today, cashier.id, [["cash", -5_000]]); // reopened ticket, refund
      await checkout(db, yesterday, cashier.id, [["cash", 999_000]]);
      await pedidoWithPayments(db, cashier.id, [
        { dayId: today, amount: 300_000, method: "transfer" },
        { dayId: today, amount: 100_000, method: "cash", afterHours: true },
        { dayId: today, amount: -20_000, method: "cash" },
        { dayId: yesterday, amount: 777_000, method: "card" },
        { dayId: null, amount: 50_000, method: "cash", afterHours: true }, // not attached yet
      ]);
      const cloth = await makeClothVariant(db, { sellingPrice: 55_000 });
      await makeClothSale(db, {
        dayId: today,
        soldBy: cashier.id,
        cloth,
        unitPrice: 55_000,
        quantity: 2,
      });
      await makeClothSale(db, {
        dayId: today,
        soldBy: cashier.id,
        cloth,
        unitPrice: 55_000,
        priceOverride: 40_000,
      });
      await makeClothSale(db, { dayId: yesterday, soldBy: cashier.id, cloth, unitPrice: 55_000 });

      const income = await getDayIncome(db, today);
      expect(income.bySource.services.total).toBe(65_000);
      expect(income.bySource.pedidos.total).toBe(380_000);
      expect(income.bySource.prendas.total).toBe(150_000);
      expect(income.total).toBe(595_000);
      expect(income.byMethod).toEqual({
        cash: 270_000,
        card: 25_000,
        transfer: 300_000,
        unknown: 0,
      });
      expect(income.afterHours).toEqual({ total: 100_000, count: 1, pedidos: 100_000, prendas: 0 });

      // Independent recomputation straight from the tables.
      const [{ expected }] = (
        await db.execute(sql`SELECT (
          (SELECT coalesce(sum(tp.amount), 0) FROM ticket_payments tp JOIN checkout_sessions cs ON cs.id = tp.checkout_session_id WHERE cs.business_day_id = ${today})
          + (SELECT coalesce(sum(amount), 0) FROM pedido_payments WHERE business_day_id = ${today})
          + (SELECT coalesce(sum(coalesce(price_override, unit_price) * quantity), 0) FROM cloth_sales WHERE business_day_id = ${today})
        )::bigint AS expected`)
      ).rows as { expected: string }[];
      expect(income.total).toBe(Number(expected));
    }));

  it("shows after-hours money on the day it attached to", () =>
    withCleanDb(async (db) => {
      const cashier = await makeEmployee(db, { role: "cashier" });
      const closed = await makeDay(db, "2026-10-24T13:00:00Z", { openedBy: cashier.userId });
      const next = await makeDay(db, "2026-10-25T13:00:00Z", {
        open: true,
        openedBy: cashier.userId,
      });
      await pedidoWithPayments(db, cashier.id, [
        { dayId: null, amount: 80_000, method: "cash", afterHours: true },
      ]);
      expect((await getDayIncome(db, next)).afterHours.total).toBe(0);

      // What opening the next day does (attachAfterHoursPayments).
      await db.execute(
        sql`UPDATE pedido_payments SET business_day_id = ${next} WHERE business_day_id IS NULL AND after_hours`,
      );
      const income = await getDayIncome(db, next);
      expect(income.afterHours).toMatchObject({ total: 80_000, count: 1, pedidos: 80_000 });
      expect(income.total).toBe(80_000);
      expect((await getDayIncome(db, closed)).total).toBe(0);
    }));
});
