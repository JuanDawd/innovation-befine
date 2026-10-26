/**
 * After-hours money → the next business day — T127 (spec §3.5.20)
 *
 * Pedido payments and garment sales (T129) taken while no day was open keep
 * business_day_id null. When a day opens, this claims them. The UPDATE only
 * touches rows still without a day, so running it twice (a retry, a reopen)
 * never moves a payment: each one is attached exactly once.
 * The ledger trigger allows exactly this update and nothing else.
 */

import { sql } from "drizzle-orm";
import { formatPedidoNumber, formatPesos } from "@befine/db";
import { getTxDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { afterHoursNote } from "@/lib/pedido-payments";

export async function attachAfterHoursPayments(
  businessDayId: string,
  actor: { userId: string; role: string | null },
): Promise<number> {
  return getTxDb().transaction(async (tx) => {
    const res = await tx.execute(sql`
      UPDATE pedido_payments pp SET business_day_id = ${businessDayId}
      FROM pedidos p
      WHERE p.id = pp.pedido_id AND pp.business_day_id IS NULL AND pp.after_hours
      RETURNING pp.id, pp.pedido_id, pp.received_at, pp.amount, p.number
    `);
    const rows = res.rows as {
      id: string;
      pedido_id: string;
      received_at: string;
      amount: string;
      number: number;
    }[];
    for (const r of rows)
      await logActivity(tx, {
        actor,
        action: "pedido.payment_attach",
        entityType: "pedido",
        entityId: r.pedido_id,
        businessDayId,
        summary: `Asignó al día un pago fuera de horario del pedido ${formatPedidoNumber(Number(r.number))} · ${afterHoursNote(new Date(r.received_at))}`,
        after: {
          paymentId: r.id,
          businessDayId,
          receivedAt: r.received_at,
          amount: Number(r.amount),
        },
      });

    // Garment sales taken after hours (T129) — same rule, same one-time claim.
    const sales = await tx.execute(sql`
      UPDATE cloth_sales SET business_day_id = ${businessDayId}
      WHERE business_day_id IS NULL AND after_hours
      RETURNING id, received_at, quantity, coalesce(price_override, unit_price) * quantity AS total
    `);
    const saleRows = sales.rows as {
      id: string;
      received_at: string;
      quantity: number;
      total: string;
    }[];
    for (const r of saleRows)
      await logActivity(tx, {
        actor,
        action: "stock.sale_attach",
        entityType: "stock",
        entityId: r.id,
        businessDayId,
        summary: `Asignó al día una venta fuera de horario de ${formatPesos(Number(r.total))} · ${afterHoursNote(new Date(r.received_at))}`,
        after: { saleId: r.id, businessDayId, receivedAt: r.received_at, total: Number(r.total) },
      });
    return rows.length + saleRows.length;
  });
}
