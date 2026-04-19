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
import { eq, desc, sum, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  largeOrders,
  largeOrderPayments,
  clients,
  employees,
  users,
  clothBatches,
  batchPieces,
} from "@befine/db/schema";
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
  if (!session) return { ok: false as const, code: "UNAUTHORIZED" as const, userId: null };
  if (!hasRole(session.user, "cashier_admin", "secretary"))
    return { ok: false as const, code: "FORBIDDEN" as const, userId: null };
  return { ok: true as const, code: null, userId: session.user.id };
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

  // Verify client exists (saved clients only — no guests on large orders)
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!client)
    return { success: false, error: { code: "NOT_FOUND", message: "Cliente no encontrado" } };

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
  const result = await db
    .update(largeOrders)
    .set({
      description: parsed.data.description,
      totalPrice: parsed.data.totalPrice,
      estimatedDeliveryAt: parsed.data.estimatedDeliveryAt
        ? new Date(parsed.data.estimatedDeliveryAt)
        : null,
      notes: parsed.data.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(largeOrders.id, orderId))
    .returning({ id: largeOrders.id });

  if (!result.length)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  revalidatePath("/large-orders");
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

  const { orderId, action, cancellationReason, version } = parsed.data;

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

  const [order] = await db
    .select({
      id: largeOrders.id,
      totalPrice: largeOrders.totalPrice,
      status: largeOrders.status,
      version: largeOrders.version,
    })
    .from(largeOrders)
    .where(eq(largeOrders.id, parsed.data.orderId))
    .limit(1);
  if (!order)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  if (order.status === "cancelled")
    return {
      success: false,
      error: { code: "CONFLICT", message: "No se puede registrar pago en un pedido cancelado" },
    };

  const txDb = getTxDb();
  const balanceDue = await txDb.transaction(async (tx) => {
    await tx.insert(largeOrderPayments).values({
      orderId: parsed.data.orderId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      recordedBy: creatorEmp.id,
    });

    const [totals] = await tx
      .select({ totalPaid: sum(largeOrderPayments.amount) })
      .from(largeOrderPayments)
      .where(eq(largeOrderPayments.orderId, parsed.data.orderId));

    const totalPaid = Number(totals?.totalPaid ?? 0);
    const balance = order.totalPrice - totalPaid;

    // Auto-transition to paid_in_full when balance reaches zero
    if (balance <= 0 && order.status !== "paid_in_full") {
      await tx
        .update(largeOrders)
        .set({
          status: "paid_in_full",
          version: sql`${largeOrders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(largeOrders.id, parsed.data.orderId));
    }

    return Math.max(0, balance);
  });

  revalidatePath("/large-orders");
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

// ─── Get single large order with payments + batch summary (T060, T062) ───────

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

// ─── Get batch summary for an order (T060) ───────────────────────────────────

export type OrderBatchSummary = {
  batchId: string;
  totalPieces: number;
  approvedPieces: number;
};

export async function getLargeOrderBatchSummary(
  orderId: string,
): Promise<ActionResult<OrderBatchSummary[]>> {
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
  const batches = await db
    .select({ id: clothBatches.id })
    .from(clothBatches)
    .where(eq(clothBatches.largeOrderId, orderId));

  if (!batches.length) return { success: true, data: [] };

  const batchIds = batches.map((b) => b.id);
  const pieces = await db
    .select({ batchId: batchPieces.batchId, status: batchPieces.status })
    .from(batchPieces)
    .where(
      sql`${batchPieces.batchId} = ANY(${sql.raw(`ARRAY['${batchIds.join("','")}']::uuid[]`)})`,
    );

  return {
    success: true,
    data: batches.map((b) => {
      const bp = pieces.filter((p) => p.batchId === b.id);
      return {
        batchId: b.id,
        totalPieces: bp.length,
        approvedPieces: bp.filter((p) => p.status === "approved").length,
      };
    }),
  };
}
