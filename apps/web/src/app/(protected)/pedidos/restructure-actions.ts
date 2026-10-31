"use server";

/**
 * Admin-approved restructure — T120 (spec §3.4.17)
 *
 * Anyone who can edit a pedido drafts the change; only an admin approves it.
 * Approval runs in one transaction: units reported and not reviewed are approved
 * or rejected, approved undelivered units leave for stock or scrap (their
 * clothiers stay paid, because the reviews stay), unstarted units that no longer
 * fit are cancelled, and the total follows. Overpayment shows as saldo a favor,
 * which is always computed from the total and the payments.
 *
 * Only client pedidos: an inventory pedido's approved units are already in stock,
 * and are handled with stock adjustments.
 */

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  assignments,
  businessDays,
  employees,
  pedidoLineCells,
  pedidos,
  restructures,
  stockMovements,
  unitReviews,
} from "@befine/db/schema";
import {
  formatPedidoNumber,
  formatPesos,
  planRestructureCell,
  type RestructureCell,
  type RestructureCellPlan,
  type RestructureDecision,
} from "@befine/db";
import {
  rejectRestructureSchema,
  requestRestructureSchema,
  resolveRestructureSchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";
import { getDb, getTxDb } from "@/lib/db";
import { hasRole } from "@/lib/middleware-helpers";
import { createNotification } from "@/lib/notifications";
import { financialBreadcrumb, reportError } from "@/lib/observability";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import {
  ConflictError,
  InputError,
  requirePedidoRole,
  toFail,
  validationError,
  type Fail,
} from "./action-helpers";

export type PendingRestructure = {
  id: string;
  reason: string;
  requestedByName: string | null;
  createdAt: Date;
  cells: {
    cellId: string;
    label: string;
    garment: string;
    ordered: number;
    newQuantity: number;
    toStock: number;
    toScrap: number;
    pendingAction: "approve" | "reject" | null;
  }[];
};

export type RestructureEditorCell = {
  cellId: string;
  label: string;
  garment: string;
  ordered: number;
  approved: number;
  delivered: number;
  pending: number;
  inRework: number;
};

type CellInfo = RestructureCell & {
  garment: string;
  variantId: string;
  sizeId: string | null;
  colorId: string | null;
};

const validId = (id: string) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
const notFound: Fail = {
  success: false,
  error: { code: "NOT_FOUND", message: "Pedido no encontrado" },
};

async function loadCells(tx: Pick<ActivityTx, "execute">, pedidoId: string): Promise<CellInfo[]> {
  const res = await tx.execute(sql`
    SELECT c.id AS cell_id, c.quantity AS ordered, c.size_id, l.color_id,
      coalesce(gs.label, c.size_other) AS label,
      l.cloth_piece_variant_id AS variant_id,
      cp.name || ' — ' || v.name AS garment,
      coalesce((SELECT sum(dc.quantity) FROM delivery_cells dc WHERE dc.cell_id = c.id), 0)::int AS delivered,
      coalesce((
        SELECT json_agg(json_build_object(
          'id', a.id, 'employeeId', a.employee_id, 'quantity', a.quantity, 'movedOut', a.moved_out,
          'reported', coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0),
          'rework', coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'rework'), 0),
          'approved', coalesce((SELECT sum(x.approved) FROM unit_reviews x WHERE x.assignment_id = a.id), 0),
          'returned', coalesce((SELECT sum(x.returned) FROM unit_reviews x WHERE x.assignment_id = a.id), 0),
          'scrapped', coalesce((SELECT sum(x.scrapped) FROM unit_reviews x WHERE x.assignment_id = a.id), 0)
        ) ORDER BY a.created_at, a.id)
        FROM assignments a WHERE a.cell_id = c.id
      ), '[]'::json) AS assignments
    FROM pedido_line_cells c
    JOIN pedido_lines l ON l.id = c.line_id
    JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
    JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
    LEFT JOIN garment_sizes gs ON gs.id = c.size_id
    WHERE l.pedido_id = ${pedidoId} AND l.kind = 'garment'
    ORDER BY l.created_at, gs.sort_order NULLS LAST, c.created_at
  `);
  type Row = {
    cell_id: string;
    ordered: number;
    size_id: string | null;
    color_id: string | null;
    label: string;
    variant_id: string;
    garment: string;
    delivered: number;
    assignments: Record<string, string | number>[];
  };
  return (res.rows as Row[]).map((r) => ({
    cellId: r.cell_id,
    label: r.label,
    garment: r.garment,
    variantId: r.variant_id,
    sizeId: r.size_id,
    colorId: r.color_id,
    ordered: Number(r.ordered),
    delivered: Number(r.delivered),
    assignments: r.assignments.map((a) => ({
      id: String(a.id),
      employeeId: String(a.employeeId),
      quantity: Number(a.quantity),
      movedOut: Number(a.movedOut),
      reported: Number(a.reported),
      rework: Number(a.rework),
      approved: Number(a.approved),
      returned: Number(a.returned),
      scrapped: Number(a.scrapped),
    })),
  }));
}

function planAll(cells: CellInfo[], decisions: RestructureDecision[]) {
  const byId = new Map(cells.map((c) => [c.cellId, c]));
  return decisions.map((d) => {
    const cell = byId.get(d.cellId);
    if (!cell) throw new InputError("cells", "Una talla no pertenece a este pedido. Recarga.");
    const plan = planRestructureCell(cell, d);
    if (!plan.ok) throw new ConflictError("CONFLICT", plan.message);
    return { info: cell, plan: plan.cell };
  });
}

async function pedidoTotal(tx: Pick<ActivityTx, "execute">, id: string): Promise<number> {
  const res = await tx.execute(sql`
    SELECT coalesce(sum(CASE WHEN l.kind = 'adjustment' THEN l.amount
      ELSE l.unit_price * coalesce((SELECT sum(c.quantity) FROM pedido_line_cells c WHERE c.line_id = l.id), 0)
      END), 0)::bigint AS total
    FROM pedido_lines l WHERE l.pedido_id = ${id}
  `);
  return Number((res.rows[0] as { total: string }).total);
}

/** The cells of a pedido, in the shape the draft dialog needs. */
export async function getRestructureEditor(
  pedidoId: string,
): Promise<ActionResult<RestructureEditorCell[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!validId(pedidoId)) return notFound;
  const cells = await loadCells(getDb(), pedidoId);
  return {
    success: true,
    data: cells.map((c) => {
      const sum = (pick: (a: RestructureCell["assignments"][number]) => number) =>
        c.assignments.reduce((n, a) => n + pick(a), 0);
      return {
        cellId: c.cellId,
        label: c.label,
        garment: c.garment,
        ordered: c.ordered,
        approved: sum((a) => a.approved - a.movedOut),
        delivered: c.delivered,
        pending: sum((a) => a.reported + a.rework - a.approved - a.returned - a.scrapped),
        inRework: sum((a) => a.returned - a.rework),
      };
    }),
  };
}

/** The draft waiting for an admin, if any. */
export async function getPendingRestructure(
  pedidoId: string,
): Promise<ActionResult<PendingRestructure | null>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!validId(pedidoId)) return notFound;
  const db = getDb();
  const res = await db.execute(sql`
    SELECT x.id, x.reason, x.summary, x.created_at, u.name AS requested_by_name
    FROM restructures x
    LEFT JOIN employees e ON e.id = x.requested_by
    LEFT JOIN users u ON u.id = e.user_id
    WHERE x.pedido_id = ${pedidoId} AND x.approved_at IS NULL AND x.rejected_at IS NULL
  `);
  const row = res.rows[0] as
    | {
        id: string;
        reason: string;
        summary: { draft: RestructureDecision[] };
        created_at: string;
        requested_by_name: string | null;
      }
    | undefined;
  if (!row) return { success: true, data: null };
  const cells = new Map((await loadCells(db, pedidoId)).map((c) => [c.cellId, c]));
  return {
    success: true,
    data: {
      id: row.id,
      reason: row.reason,
      requestedByName: row.requested_by_name,
      createdAt: new Date(row.created_at),
      cells: row.summary.draft.map((d) => ({
        cellId: d.cellId,
        label: cells.get(d.cellId)?.label ?? "—",
        garment: cells.get(d.cellId)?.garment ?? "—",
        ordered: cells.get(d.cellId)?.ordered ?? 0,
        newQuantity: d.newQuantity,
        toStock: d.toStock,
        toScrap: d.toScrap,
        pendingAction: d.pendingAction ?? null,
      })),
    },
  };
}

export async function requestRestructure(
  pedidoId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!validId(pedidoId)) return notFound;
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = requestRestructureSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  try {
    const { id, number } = await getTxDb().transaction(async (tx) => {
      const [pedido] = await tx
        .select({
          number: pedidos.number,
          version: pedidos.version,
          cancelledAt: pedidos.cancelledAt,
          destination: pedidos.destination,
        })
        .from(pedidos)
        .where(eq(pedidos.id, pedidoId))
        .for("update");
      if (!pedido) throw new ConflictError("NOT_FOUND", "Pedido no encontrado");
      if (pedido.version !== input.version)
        throw new ConflictError(
          "STALE_DATA",
          "Alguien más cambió este pedido. Recarga para ver la última versión.",
        );
      if (pedido.cancelledAt) throw new ConflictError("CONFLICT", "El pedido está cancelado.");
      if (pedido.destination === "inventory")
        throw new ConflictError(
          "CONFLICT",
          "Los pedidos para inventario no se reestructuran: sus unidades ya están en inventario.",
        );
      const [open] = await tx
        .select({ id: restructures.id })
        .from(restructures)
        .where(
          and(
            eq(restructures.pedidoId, pedidoId),
            isNull(restructures.approvedAt),
            isNull(restructures.rejectedAt),
          ),
        );
      if (open)
        throw new ConflictError("CONFLICT", "Este pedido ya tiene una reestructuración pendiente.");

      planAll(await loadCells(tx as unknown as ActivityTx, pedidoId), input.cells);

      const [row] = await tx
        .insert(restructures)
        .values({
          pedidoId,
          requestedBy: guard.employeeId,
          reason: input.reason,
          summary: { draft: input.cells },
        })
        .returning({ id: restructures.id });
      const number = formatPedidoNumber(pedido.number);
      await logActivity(tx as unknown as ActivityTx, {
        actor: actorOf(guard.user),
        action: "pedido.restructure_request",
        entityType: "pedido",
        entityId: pedidoId,
        data: { number },
        after: { draft: input.cells },
        reason: input.reason,
      });
      return { id: row!.id, number };
    });

    // Admins learn there is something to decide; a failed notice never undoes it.
    const admins = await getDb()
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.role, "admin"), eq(employees.isActive, true)));
    for (const admin of admins.filter((a) => a.id !== guard.employeeId))
      await createNotification({
        recipientEmployeeId: admin.id,
        type: "pedido_changed",
        message: `Reestructuración del pedido ${number} pendiente de tu aprobación.`,
        link: `/pedidos/${pedidoId}`,
      }).catch((err) => reportError(err, "createNotification"));

    revalidatePath(`/pedidos/${pedidoId}`);
    return { success: true, data: { id } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

export async function rejectRestructure(
  restructureId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!hasRole(guard.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  if (!validId(restructureId)) return notFound;
  const parsed = rejectRestructureSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const pedidoId = await getTxDb().transaction(async (tx) => {
      const [row] = await tx
        .update(restructures)
        .set({
          rejectedBy: guard.employeeId,
          rejectedAt: new Date(),
          rejectionReason: parsed.data.reason,
        })
        .where(
          and(
            eq(restructures.id, restructureId),
            isNull(restructures.approvedAt),
            isNull(restructures.rejectedAt),
          ),
        )
        .returning({ pedidoId: restructures.pedidoId });
      if (!row) throw new ConflictError("CONFLICT", "Esta reestructuración ya se resolvió.");
      const [pedido] = await tx
        .select({ number: pedidos.number })
        .from(pedidos)
        .where(eq(pedidos.id, row.pedidoId));
      await logActivity(tx as unknown as ActivityTx, {
        actor: actorOf(guard.user),
        action: "pedido.restructure_reject",
        entityType: "pedido",
        entityId: row.pedidoId,
        data: { number: formatPedidoNumber(pedido!.number) },
        reason: parsed.data.reason,
      });
      return row.pedidoId;
    });
    revalidatePath(`/pedidos/${pedidoId}`);
    return { success: true, data: { id: restructureId } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

export async function approveRestructure(
  restructureId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!hasRole(guard.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  if (!validId(restructureId)) return notFound;
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = resolveRestructureSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const actor = actorOf(guard.user);
  try {
    const result = await getTxDb().transaction(async (tx) => {
      const db = tx as unknown as ActivityTx;
      const [draft] = await tx
        .select()
        .from(restructures)
        .where(eq(restructures.id, restructureId))
        .for("update");
      if (!draft) throw new ConflictError("NOT_FOUND", "Reestructuración no encontrada");
      if (draft.approvedAt || draft.rejectedAt)
        throw new ConflictError("CONFLICT", "Esta reestructuración ya se resolvió.");
      const [pedido] = await tx
        .select({
          number: pedidos.number,
          version: pedidos.version,
          cancelledAt: pedidos.cancelledAt,
        })
        .from(pedidos)
        .where(eq(pedidos.id, draft.pedidoId))
        .for("update");
      if (!pedido) throw new ConflictError("NOT_FOUND", "Pedido no encontrado");
      if (pedido.version !== parsed.data.version)
        throw new ConflictError(
          "STALE_DATA",
          "Alguien más cambió este pedido. Recarga para ver la última versión.",
        );
      if (pedido.cancelledAt) throw new ConflictError("CONFLICT", "El pedido está cancelado.");

      const decisions = (draft.summary as { draft: RestructureDecision[] }).draft;
      const cellIds = decisions.map((d) => d.cellId);
      // Same lock order as the unit guards: assignments, then the cell.
      await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(inArray(assignments.cellId, cellIds))
        .orderBy(assignments.id)
        .for("update");
      await tx
        .select({ id: pedidoLineCells.id })
        .from(pedidoLineCells)
        .where(inArray(pedidoLineCells.id, cellIds))
        .orderBy(pedidoLineCells.id)
        .for("update");

      const planned = planAll(await loadCells(db, draft.pedidoId), decisions);

      const needsReview = planned.some((p) => p.plan.reviews.length > 0);
      let businessDayId: string | null = null;
      if (needsReview) {
        const [day] = await tx
          .select({ id: businessDays.id })
          .from(businessDays)
          .where(isNull(businessDays.closedAt));
        if (!day)
          throw new ConflictError(
            "CONFLICT",
            "Abre el día: hay unidades sin revisar que se resuelven en esta reestructuración.",
          );
        businessDayId = day.id;
      }

      const totalBefore = await pedidoTotal(db, draft.pedidoId);

      for (const { info, plan } of planned) {
        for (const r of plan.reviews)
          await tx.insert(unitReviews).values({
            assignmentId: r.assignmentId,
            approved: r.approved,
            scrapped: r.rejected,
            // Rejected by the restructure: unpaid, whatever the scrap setting says.
            scrapCode: r.rejected > 0 ? "restructure" : null,
            scrapReason: r.rejected > 0 ? draft.reason : null,
            scrapPaid: false,
            businessDayId: businessDayId!,
            reviewedBy: guard.employeeId,
          });
        for (const m of plan.moves)
          await tx
            .update(assignments)
            .set({
              movedOut: sql`${assignments.movedOut} + ${m.quantity}`,
              version: sql`${assignments.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(assignments.id, m.assignmentId));
        for (const r of plan.releases)
          await tx
            .update(assignments)
            .set({
              quantity: sql`${assignments.quantity} - ${r.quantity}`,
              version: sql`${assignments.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(assignments.id, r.assignmentId));
        await tx
          .update(pedidoLineCells)
          .set({ quantity: plan.newQuantity, updatedAt: new Date() })
          .where(eq(pedidoLineCells.id, plan.cellId));
        if (plan.toStock > 0)
          await tx.insert(stockMovements).values({
            clothPieceVariantId: info.variantId,
            sizeId: info.sizeId,
            colorId: info.colorId,
            quantity: plan.toStock,
            kind: "restructure",
            refType: "restructure",
            refId: restructureId,
            reason: draft.reason,
            createdBy: guard.employeeId,
          });
      }

      const totalAfter = await pedidoTotal(db, draft.pedidoId);
      const plans: RestructureCellPlan[] = planned.map((p) => p.plan);
      const number = formatPedidoNumber(pedido.number);
      const summary = { cells: plans, totalBefore, totalAfter };

      await tx
        .update(restructures)
        .set({ approvedBy: guard.employeeId, approvedAt: new Date(), summary })
        .where(eq(restructures.id, restructureId));
      await tx
        .update(pedidos)
        .set({ version: sql`${pedidos.version} + 1`, updatedAt: new Date() })
        .where(eq(pedidos.id, draft.pedidoId));

      const units = (pick: (p: RestructureCellPlan) => number) =>
        plans.reduce((n, p) => n + pick(p), 0);
      await logActivity(db, {
        actor,
        action: "pedido.restructure",
        entityType: "pedido",
        entityId: draft.pedidoId,
        summary: `Aprobó la reestructuración del pedido ${number}: ${units((p) => p.toStock)} a inventario, ${units((p) => p.toScrap)} descartadas, ${units((p) => p.pendingRejected)} rechazadas · total ${formatPesos(totalBefore)} → ${formatPesos(totalAfter)}`,
        before: { totalBefore, requestedBy: draft.requestedBy },
        after: { ...summary, approvedBy: guard.employeeId },
        reason: draft.reason,
      });

      const affected = new Set(plans.flatMap((p) => p.releases.map((r) => r.employeeId)));
      for (const { info, plan } of planned)
        for (const r of plan.reviews)
          if (r.rejected > 0) {
            const a = info.assignments.find((x) => x.id === r.assignmentId);
            if (a) affected.add(a.employeeId);
          }
      return { pedidoId: draft.pedidoId, number, employeeIds: [...affected] };
    });

    for (const employeeId of result.employeeIds)
      await createNotification({
        recipientEmployeeId: employeeId,
        type: "pedido_changed",
        message: `Se reestructuró el pedido ${result.number}. Revisa tu trabajo.`,
        link: "/clothier",
      }).catch((err) => reportError(err, "createNotification"));

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${result.pedidoId}`);
    financialBreadcrumb("approveRestructure", { pedidoId: result.pedidoId });
    return { success: true, data: { id: restructureId } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}
