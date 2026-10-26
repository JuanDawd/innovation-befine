/**
 * Caja de hoy / Cierre — T130 (spec §3.5.19–22)
 *
 * Everything the till took on one business day, split by source:
 *   Servicios — ticket payments of the day's checkout sessions (refunds negative)
 *   Pedidos   — pedido payments attached to the day (refunds negative)
 *   Prendas   — Vender prenda sales attached to the day
 * After-hours pedido payments and sales count on the day they attached to,
 * and are also reported on their own line. Service tickets are charged only
 * inside an open day, so they are never after hours.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../index";

export type IncomeSource = "services" | "pedidos" | "prendas";
export type PaymentMethodKey = "cash" | "card" | "transfer" | "unknown";

export type DayIncomeRow = {
  source: IncomeSource;
  method: PaymentMethodKey;
  afterHours: boolean;
  amount: number;
  count: number;
};

type MethodTotals = Record<PaymentMethodKey, number>;

export type DayIncome = {
  total: number;
  bySource: Record<IncomeSource, { total: number; count: number; byMethod: MethodTotals }>;
  byMethod: MethodTotals;
  /** Taken while no day was open, included in the totals above */
  afterHours: { total: number; count: number; pedidos: number; prendas: number };
};

const noMethods = (): MethodTotals => ({ cash: 0, card: 0, transfer: 0, unknown: 0 });

/** Pure: fold the grouped rows into the summary. Every peso lands in exactly one source and one method. */
export function summarizeDayIncome(rows: DayIncomeRow[]): DayIncome {
  const out: DayIncome = {
    total: 0,
    bySource: {
      services: { total: 0, count: 0, byMethod: noMethods() },
      pedidos: { total: 0, count: 0, byMethod: noMethods() },
      prendas: { total: 0, count: 0, byMethod: noMethods() },
    },
    byMethod: noMethods(),
    afterHours: { total: 0, count: 0, pedidos: 0, prendas: 0 },
  };
  for (const r of rows) {
    const src = out.bySource[r.source];
    src.total += r.amount;
    src.count += r.count;
    src.byMethod[r.method] += r.amount;
    out.byMethod[r.method] += r.amount;
    out.total += r.amount;
    if (r.afterHours && r.source !== "services") {
      out.afterHours.total += r.amount;
      out.afterHours.count += r.count;
      out.afterHours[r.source] += r.amount;
    }
  }
  return out;
}

export async function getDayIncomeRows(
  db: Database,
  businessDayId: string,
): Promise<DayIncomeRow[]> {
  const res = await db.execute(sql`
    SELECT 'services' AS source, tp.method::text AS method, false AS after_hours,
      sum(tp.amount)::bigint AS amount, count(*)::int AS n
    FROM ticket_payments tp JOIN checkout_sessions cs ON cs.id = tp.checkout_session_id
    WHERE cs.business_day_id = ${businessDayId}
    GROUP BY tp.method
    UNION ALL
    SELECT 'pedidos', pp.method::text, pp.after_hours, sum(pp.amount)::bigint, count(*)::int
    FROM pedido_payments pp
    WHERE pp.business_day_id = ${businessDayId}
    GROUP BY pp.method, pp.after_hours
    UNION ALL
    SELECT 'prendas', coalesce(cs.payment_method::text, 'unknown'), cs.after_hours,
      sum(coalesce(cs.price_override, cs.unit_price) * cs.quantity)::bigint, count(*)::int
    FROM cloth_sales cs
    WHERE cs.business_day_id = ${businessDayId}
    GROUP BY cs.payment_method, cs.after_hours
  `);
  return (
    res.rows as {
      source: IncomeSource;
      method: string;
      after_hours: boolean;
      amount: string;
      n: number;
    }[]
  ).map((r) => ({
    source: r.source,
    method: (["cash", "card", "transfer"].includes(r.method)
      ? r.method
      : "unknown") as PaymentMethodKey,
    afterHours: Boolean(r.after_hours),
    amount: Number(r.amount),
    count: Number(r.n),
  }));
}

export async function getDayIncome(db: Database, businessDayId: string): Promise<DayIncome> {
  return summarizeDayIncome(await getDayIncomeRows(db, businessDayId));
}
