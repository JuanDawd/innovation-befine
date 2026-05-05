"use server";

/**
 * Large order server actions — T058, T059, T061
 *
 * createLargeOrder:          cashier_admin, secretary
 * editLargeOrder:            cashier_admin, secretary
 * transitionLargeOrder:      cashier_admin, secretary (cancel requires reason)
 * recordLargeOrderPayment:   cashier_admin, secretary
 * listLargeOrders:           cashier_admin, secretary
 * getLargeOrder:             cashier_admin, secretary
 */

import { headers } from "next/headers";
import { eq, desc, sum, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  largeOrders,
  largeOrderPayments,
  clients,
  employees,
  users,
  craftables,
  craftablePieces,
} from "@befine/db/schema";
import { getCurrentBusinessDay } from "@/lib/business-day";
import {
  createLargeOrderSchema,
  editLargeOrderSchema,
  recordLargeOrderPaymentSchema,
  transitionLargeOrderSchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LargeOrderPaymentRow = {
  id: string;
  amount: number;
  method: "cash" | "card" | "transfer";
  paidAt: Date;
  recordedBy: string;
};

export type LargeOrderRow = {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  totalPrice: number;
  totalPaid: number;
  balanceDue: number;
  status: "pending" | "in_production" | "ready" | "delivered" | "paid_in_full" | "cancelled";
  estimatedDeliveryAt: Date | null;
  notes: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
  payments: LargeOrderPaymentRow[];
};

export type LargeOrderListRow = Omit<LargeOrderRow, "payments">;

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireOrderRole() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null, session: null };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null, session: null };
  return { ok: true as const, code: null, userId: session.user.id, session };
}

// ─── Allowed transitions ──────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  pending: { start_production: "in_production", cancel: "cancelled" },
  in_production: { mark_ready: "ready", cancel: "cancelled" },
  ready: { mark_delivered: "delivered", cancel: "cancelled" },
  delivered: { mark_paid: "paid_in_full", cancel: "cancelled" },
  // paid_in_full and cancelled are terminal
};

// ─── Create large order (T058) ───────────────────────────────────────────────

export async function createLargeOrder(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = createLargeOrderSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const db = getDb();
  const [creatorEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, guard.userId!))
    .limit(1);
  if (!creatorEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // Verify client exists and is active (saved clients only — no guests, no archived)
  const [client] = await db
    .select({ id: clients.id, isActive: clients.isActive })
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!client)
    return { success: false, error: { code: "NOT_FOUND", message: "Cliente no encontrado" } };
  if (!client.isActive)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "El cliente está archivado" },
    };

  const autoApproved = hasRole(guard.session!.user, "cashier_admin");

  // Only create a craftable if pieces were provided AND a business day is open
  const businessDay = parsed.data.pieces?.length ? await getCurrentBusinessDay() : null;

  const txDb = getTxDb();
  const orderId = await txDb.transaction(async (tx) => {
    const [order] = await tx
      .insert(largeOrders)
      .values({
        clientId: parsed.data.clientId,
        description: parsed.data.description,
        totalPrice: parsed.data.totalPrice,
        estimatedDeliveryAt: parsed.data.estimatedDeliveryAt
          ? new Date(parsed.data.estimatedDeliveryAt)
          : null,
        notes: parsed.data.notes ?? null,
        createdBy: creatorEmp.id,
      })
      .returning({ id: largeOrders.id });

    // Record initial deposit if provided
    if (
      parsed.data.initialDepositAmount &&
      parsed.data.initialDepositAmount > 0 &&
      parsed.data.initialDepositMethod
    ) {
      await tx.insert(largeOrderPayments).values({
        orderId: order.id,
        amount: parsed.data.initialDepositAmount,
        method: parsed.data.initialDepositMethod,
        recordedBy: creatorEmp.id,
      });
    }

    // Auto-create craftable when pieces are provided and a business day is open
    if (parsed.data.pieces?.length && businessDay) {
      const [craftable] = await tx
        .insert(craftables)
        .values({
          businessDayId: businessDay.id,
          createdBy: creatorEmp.id,
          largeOrderId: order.id,
          source: "large_order",
          autoApproved,
        })
        .returning({ id: craftables.id });

      await tx.insert(craftablePieces).values(
        parsed.data.pieces.map((p) => ({
          craftableId: craftable.id,
          clothPieceId: p.clothPieceId,
          clothPieceVariantId: p.clothPieceVariantId,
          quantity: p.quantity,
          assignedToEmployeeId: p.assignedToEmployeeId ?? null,
          claimSource: p.assignedToEmployeeId ? ("assigned" as const) : null,
          claimedAt: p.assignedToEmployeeId ? new Date() : null,
        })),
      );
    }

    return order.id;
  });

  revalidatePath("/large-orders");
  return { success: true, data: { id: orderId } };
}

// ─── Edit large order (T058) ─────────────────────────────────────────────────

export async function editLargeOrder(
  orderId: string,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = editLargeOrderSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const db = getDb();

  // Verify the order exists, is not terminal, and new totalPrice >= totalPaid
  const [existingOrder] = await db
    .select({ status: largeOrders.status, totalPaid: sum(largeOrderPayments.amount) })
    .from(largeOrders)
    .leftJoin(largeOrderPayments, eq(largeOrderPayments.orderId, largeOrders.id))
    .where(eq(largeOrders.id, orderId))
    .groupBy(largeOrders.id, largeOrders.status)
    .limit(1);

  if (!existingOrder)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  if (existingOrder.status === "paid_in_full" || existingOrder.status === "cancelled")
    return {
      success: false,
      error: { code: "CONFLICT", message: "No se puede editar un pedido en estado terminal" },
    };

  const totalPaid = Number(existingOrder.totalPaid ?? 0);
  if (parsed.data.totalPrice < totalPaid)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `El precio total no puede ser menor a lo ya pagado ($${totalPaid.toLocaleString("es-CO")})`,
      },
    };

  const result = await db
    .update(largeOrders)
    .set({
      description: parsed.data.description,
      totalPrice: parsed.data.totalPrice,
      estimatedDeliveryAt: parsed.data.estimatedDeliveryAt
        ? new Date(parsed.data.estimatedDeliveryAt)
        : null,
      notes: parsed.data.notes ?? null,
      version: sql`${largeOrders.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${largeOrders.id} = ${orderId} AND ${largeOrders.version} = ${parsed.data.version} AND ${largeOrders.status} NOT IN ('paid_in_full', 'cancelled')`,
    )
    .returning({ id: largeOrders.id });

  if (!result.length)
    return {
      success: false,
      error: {
        code: "STALE_DATA",
        message: "El pedido fue modificado simultáneamente. Recarga e intenta de nuevo.",
      },
    };

  revalidatePath("/large-orders");
  revalidatePath(`/large-orders/${orderId}`);
  return { success: true, data: null };
}

// ─── Transition order status (T059) ──────────────────────────────────────────

export async function transitionLargeOrder(
  rawInput: unknown,
): Promise<ActionResult<{ status: string }>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = transitionLargeOrderSchema.safeParse(rawInput);
  if (!parsed.success)
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos" } };

  const { orderId, action, cancellationReason, acknowledgedDeposits, version } = parsed.data;

  if (action === "cancel" && !cancellationReason?.trim())
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Se requiere motivo de cancelación" },
    };

  const db = getDb();
  const [order] = await db
    .select({ id: largeOrders.id, status: largeOrders.status, version: largeOrders.version })
    .from(largeOrders)
    .where(eq(largeOrders.id, orderId))
    .limit(1);

  if (!order)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  // If cancelling an order with recorded payments, require explicit acknowledgment
  if (action === "cancel") {
    const [paymentSum] = await db
      .select({ total: sum(largeOrderPayments.amount) })
      .from(largeOrderPayments)
      .where(eq(largeOrderPayments.orderId, orderId));
    const totalPaid = Number(paymentSum?.total ?? 0);
    if (totalPaid > 0 && !acknowledgedDeposits)
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: `Este pedido tiene pagos registrados por $${totalPaid.toLocaleString("es-CO")}. Confirma que has revisado la política de reembolso antes de cancelar.`,
        },
      };
  }

  const transitions = ALLOWED_TRANSITIONS[order.status];
  if (!transitions)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `El pedido en estado "${order.status}" no permite transiciones`,
      },
    };

  const newStatus = transitions[action];
  if (!newStatus)
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `Acción "${action}" no permitida desde el estado "${order.status}"`,
      },
    };

  const now = new Date();
  const updated = await db
    .update(largeOrders)
    .set({
      status: newStatus as typeof order.status,
      cancellationReason: action === "cancel" ? (cancellationReason ?? null) : null,
      cancelledAt: action === "cancel" ? now : null,
      version: sql`${largeOrders.version} + 1`,
      updatedAt: now,
    })
    .where(sql`${largeOrders.id} = ${orderId} AND ${largeOrders.version} = ${version}`)
    .returning({ id: largeOrders.id });

  if (!updated.length)
    return {
      success: false,
      error: {
        code: "STALE_DATA",
        message: "El pedido fue modificado simultáneamente. Recarga e intenta de nuevo.",
      },
    };

  revalidatePath("/large-orders");
  revalidatePath(`/large-orders/${orderId}`);
  return { success: true, data: { status: newStatus } };
}

// ─── Record payment (T061) ───────────────────────────────────────────────────

export async function recordLargeOrderPayment(
  rawInput: unknown,
): Promise<ActionResult<{ balanceDue: number }>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const rl = await checkRateLimit(rateLimits.general, guard.userId!);
  if (!rl.allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo." },
    };

  const parsed = recordLargeOrderPaymentSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const db = getDb();
  const [creatorEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, guard.userId!))
    .limit(1);
  if (!creatorEmp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };

  // Pre-check outside tx for a fast early-exit; status + totals re-verified inside tx
  const [orderPre] = await db
    .select({ id: largeOrders.id, status: largeOrders.status, totalPrice: largeOrders.totalPrice })
    .from(largeOrders)
    .where(eq(largeOrders.id, parsed.data.orderId))
    .limit(1);
  if (!orderPre)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  if (orderPre.status === "cancelled" || orderPre.status === "paid_in_full")
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message:
          orderPre.status === "cancelled"
            ? "No se puede registrar pago en un pedido cancelado"
            : "El pedido ya está pagado en su totalidad",
      },
    };

  const txDb = getTxDb();
  let balanceDue: number;
  try {
    balanceDue = await txDb.transaction(async (tx) => {
      // Re-read inside tx to prevent race with concurrent payment/cancel
      const [order] = await tx
        .select({
          id: largeOrders.id,
          totalPrice: largeOrders.totalPrice,
          status: largeOrders.status,
          version: largeOrders.version,
        })
        .from(largeOrders)
        .where(eq(largeOrders.id, parsed.data.orderId))
        .limit(1);

      if (!order || order.status === "cancelled" || order.status === "paid_in_full")
        throw new Error("ORDER_NOT_PAYABLE");

      // Compute current total paid inside the transaction for accuracy
      const [totals] = await tx
        .select({ totalPaid: sum(largeOrderPayments.amount) })
        .from(largeOrderPayments)
        .where(eq(largeOrderPayments.orderId, parsed.data.orderId));

      const totalPaidBefore = Number(totals?.totalPaid ?? 0);
      const remainingBalance = order.totalPrice - totalPaidBefore;

      if (parsed.data.amount > remainingBalance) throw new Error(`OVERPAYMENT:${remainingBalance}`);

      await tx.insert(largeOrderPayments).values({
        orderId: parsed.data.orderId,
        amount: parsed.data.amount,
        method: parsed.data.method,
        paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
        recordedBy: creatorEmp.id,
      });

      const newBalance = remainingBalance - parsed.data.amount;

      if (newBalance <= 0) {
        await tx
          .update(largeOrders)
          .set({
            status: "paid_in_full",
            version: sql`${largeOrders.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            sql`${largeOrders.id} = ${parsed.data.orderId} AND ${largeOrders.version} = ${order.version} AND ${largeOrders.status} != ${"cancelled"}`,
          );
      }

      return Math.max(0, newBalance);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "ORDER_NOT_PAYABLE")
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "El pedido no puede recibir pagos en su estado actual",
        },
      };
    if (msg.startsWith("OVERPAYMENT:")) {
      const remaining = msg.split(":")[1];
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `El monto excede el saldo pendiente ($${Number(remaining).toLocaleString("es-CO")})`,
        },
      };
    }
    throw err;
  }

  revalidatePath("/large-orders");
  revalidatePath(`/large-orders/${parsed.data.orderId}`);
  return { success: true, data: { balanceDue } };
}

// ─── List large orders (T062) ────────────────────────────────────────────────

export async function listLargeOrders(
  statusFilter?: string,
): Promise<ActionResult<LargeOrderListRow[]>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();

  const rows = await db
    .select({
      id: largeOrders.id,
      clientId: largeOrders.clientId,
      clientName: clients.name,
      description: largeOrders.description,
      totalPrice: largeOrders.totalPrice,
      status: largeOrders.status,
      estimatedDeliveryAt: largeOrders.estimatedDeliveryAt,
      notes: largeOrders.notes,
      cancellationReason: largeOrders.cancellationReason,
      cancelledAt: largeOrders.cancelledAt,
      version: largeOrders.version,
      createdAt: largeOrders.createdAt,
    })
    .from(largeOrders)
    .innerJoin(clients, eq(largeOrders.clientId, clients.id))
    .orderBy(desc(largeOrders.createdAt));

  // Compute totalPaid + balanceDue per order
  const paymentTotals = await db
    .select({
      orderId: largeOrderPayments.orderId,
      totalPaid: sum(largeOrderPayments.amount),
    })
    .from(largeOrderPayments)
    .groupBy(largeOrderPayments.orderId);

  const paidMap = new Map(paymentTotals.map((p) => [p.orderId, Number(p.totalPaid ?? 0)]));

  const filtered = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;

  return {
    success: true,
    data: filtered.map((r) => {
      const totalPaid = paidMap.get(r.id) ?? 0;
      return {
        ...r,
        totalPaid,
        balanceDue: Math.max(0, r.totalPrice - totalPaid),
      };
    }),
  };
}

// ─── Get single large order with payments + craftable summary (T060, T062) ───

export async function getLargeOrder(orderId: string): Promise<ActionResult<LargeOrderRow>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const [order] = await db
    .select({
      id: largeOrders.id,
      clientId: largeOrders.clientId,
      clientName: clients.name,
      description: largeOrders.description,
      totalPrice: largeOrders.totalPrice,
      status: largeOrders.status,
      estimatedDeliveryAt: largeOrders.estimatedDeliveryAt,
      notes: largeOrders.notes,
      cancellationReason: largeOrders.cancellationReason,
      cancelledAt: largeOrders.cancelledAt,
      version: largeOrders.version,
      createdAt: largeOrders.createdAt,
    })
    .from(largeOrders)
    .innerJoin(clients, eq(largeOrders.clientId, clients.id))
    .where(eq(largeOrders.id, orderId))
    .limit(1);

  if (!order)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  const payments = await db
    .select({
      id: largeOrderPayments.id,
      amount: largeOrderPayments.amount,
      method: largeOrderPayments.method,
      paidAt: largeOrderPayments.paidAt,
      recordedByName: users.name,
    })
    .from(largeOrderPayments)
    .innerJoin(employees, eq(largeOrderPayments.recordedBy, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(largeOrderPayments.orderId, orderId))
    .orderBy(largeOrderPayments.paidAt);

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return {
    success: true,
    data: {
      ...order,
      totalPaid,
      balanceDue: Math.max(0, order.totalPrice - totalPaid),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt,
        recordedBy: p.recordedByName,
      })),
    },
  };
}

// ─── List clients for order selector ─────────────────────────────────────────

export type ClientOption = { id: string; name: string; phone: string | null };

export async function listClientsForOrder(): Promise<ActionResult<ClientOption[]>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const rows = await db
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(eq(clients.isActive, true))
    .orderBy(clients.name);

  return { success: true, data: rows };
}

// ─── Get craftable summary for an order (T060) ───────────────────────────────

export type OrderCraftableSummary = {
  craftableId: string;
  totalPieces: number;
  approvedPieces: number;
};

export async function getLargeOrderCraftableSummary(
  orderId: string,
): Promise<ActionResult<OrderCraftableSummary[]>> {
  const guard = await requireOrderRole();
  if (!guard.ok)
    return {
      success: false,
      error: {
        code: guard.code,
        message: guard.code === "UNAUTHORIZED" ? "No autenticado" : "Sin permisos",
      },
    };

  const db = getDb();
  const craftableRows = await db
    .select({ id: craftables.id })
    .from(craftables)
    .where(eq(craftables.largeOrderId, orderId));

  if (!craftableRows.length) return { success: true, data: [] };

  const craftableIds = craftableRows.map((c) => c.id);
  const pieces = await db
    .select({ craftableId: craftablePieces.craftableId, status: craftablePieces.status })
    .from(craftablePieces)
    .where(inArray(craftablePieces.craftableId, craftableIds));

  return {
    success: true,
    data: craftableRows.map((c) => {
      const cp = pieces.filter((p) => p.craftableId === c.id);
      return {
        craftableId: c.id,
        totalPieces: cp.length,
        approvedPieces: cp.filter((p) => p.status === "approved").length,
      };
    }),
  };
}
