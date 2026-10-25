"use server";

/**
 * Pedido payments — T127 (spec §3.5.19–21, §3.8)
 *
 * recordPedidoPayment: a payment (≤ balance) or a refund (≤ what is owed
 * back, note required) on a client pedido. Admin and cashier; the secretary
 * only when "La secretaria puede registrar pagos de pedidos" is on.
 *   - Inside an open business day it belongs to that day.
 *   - With no day open it is recorded after hours: business_day_id stays
 *     null, received_at keeps the real time, and the next day to open
 *     claims it (lib/after-hours.ts) with "Pagado fuera de horario el …".
 *   - Idempotent per submit; total and paid are recomputed here, never sent.
 * Pagado / balance are derived (T118), so they update with the next read.
 */

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getTxDb } from "@/lib/db";
import { pedidoPayments } from "@befine/db/schema";
import { computePedidoBalance, formatPedidoNumber, formatPesos } from "@befine/db";
import { recordPedidoPaymentSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getBusinessSettings } from "@/lib/business-settings";
import { actorOf, logActivity } from "@/lib/activity";
import { afterHoursNote, checkPedidoPayment } from "@/lib/pedido-payments";
import {
  ConflictError,
  fieldError,
  requirePedidoRole,
  toFail,
  validationError,
} from "./action-helpers";

export async function recordPedidoPayment(
  pedidoId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string; afterHours: boolean; balance: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!hasRole(guard.user, "admin", "cashier")) {
    const { secretaryCanRecordPedidoPayments } = await getBusinessSettings();
    if (!secretaryCanRecordPedidoPayments)
      return {
        success: false,
        error: { code: "FORBIDDEN", message: "Solo administración o caja pueden registrar pagos." },
      };
  }
  if (typeof pedidoId !== "string" || !/^[0-9a-f-]{36}$/i.test(pedidoId))
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = recordPedidoPaymentSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  try {
    const result = await getTxDb().transaction(async (tx) => {
      // Retried submit: the same payment, not a second one.
      const [existing] = await tx
        .select({
          id: pedidoPayments.id,
          afterHours: pedidoPayments.afterHours,
          pedidoId: pedidoPayments.pedidoId,
        })
        .from(pedidoPayments)
        .where(eq(pedidoPayments.idempotencyKey, input.idempotencyKey));
      if (existing) {
        if (existing.pedidoId !== pedidoId)
          throw new ConflictError("CONFLICT", "Este pago ya se registró en otro pedido.");
        return { id: existing.id, afterHours: existing.afterHours, balance: -1 };
      }

      const res = await tx.execute(sql`
        SELECT p.number, p.destination, p.cancelled_at,
          coalesce((SELECT sum(CASE WHEN l.kind = 'adjustment' THEN l.amount
            ELSE l.unit_price * (SELECT coalesce(sum(c.quantity), 0) FROM pedido_line_cells c WHERE c.line_id = l.id) END)
            FROM pedido_lines l WHERE l.pedido_id = p.id), 0)::bigint AS total,
          coalesce((SELECT sum(amount) FROM pedido_payments pp WHERE pp.pedido_id = p.id), 0)::bigint AS paid
        FROM pedidos p WHERE p.id = ${pedidoId}
        FOR UPDATE OF p
      `);
      const p = res.rows[0] as
        | {
            number: number;
            destination: "client" | "inventory";
            cancelled_at: string | null;
            total: string;
            paid: string;
          }
        | undefined;
      if (!p) throw new ConflictError("NOT_FOUND", "Pedido no encontrado");
      const money = computePedidoBalance(Number(p.total), [{ amount: Number(p.paid) }]);
      const problem = checkPedidoPayment({
        kind: input.kind,
        amount: input.amount,
        destination: p.destination,
        cancelled: p.cancelled_at !== null,
        paid: money.paid,
        balance: money.balance,
        saldoAFavor: money.saldoAFavor,
        note: input.note,
      });
      if (problem) throw new FieldProblem(problem);

      const day = await tx.execute(
        sql`SELECT id FROM business_days WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`,
      );
      const dayId = (day.rows[0] as { id: string } | undefined)?.id ?? null;
      const receivedAt = new Date();
      const signed = input.kind === "refund" ? -input.amount : input.amount;
      const [row] = await tx
        .insert(pedidoPayments)
        .values({
          pedidoId,
          amount: signed,
          method: input.method,
          businessDayId: dayId,
          afterHours: dayId === null,
          receivedAt,
          recordedBy: guard.employeeId,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: pedidoPayments.id });

      const number = formatPedidoNumber(p.number);
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: input.kind === "refund" ? "pedido.refund" : "pedido.payment",
        entityType: "pedido",
        entityId: pedidoId,
        businessDayId: dayId,
        data: { amount: formatPesos(input.amount), number },
        summary:
          `${input.kind === "refund" ? "Registró una devolución" : "Registró un pago"} de ${formatPesos(input.amount)} (${input.method}) en el pedido ${number}` +
          (dayId === null ? ` · ${afterHoursNote(receivedAt)}` : ""),
        after: {
          paymentId: row.id,
          amount: signed,
          method: input.method,
          receivedAt: receivedAt.toISOString(),
          businessDayId: dayId,
          afterHours: dayId === null,
        },
        reason: input.note ?? null,
      });
      const after = computePedidoBalance(Number(p.total), [{ amount: money.paid + signed }]);
      return { id: row.id, afterHours: dayId === null, balance: after.balance };
    });

    revalidatePath(`/pedidos/${pedidoId}`);
    revalidatePath("/pedidos");
    return { success: true, data: result };
  } catch (err) {
    if (err instanceof FieldProblem) return fieldError("amount", err.message);
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

class FieldProblem extends Error {}
