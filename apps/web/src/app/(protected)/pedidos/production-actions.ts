"use server";

/**
 * Assigning work — T122 (spec §3.2.6–8)
 *
 * assignUnits:          admin, cashier, secretary — units of one size to one clothier.
 *                       Piece rate copied from the variant; only admin may set another
 *                       rate, with a reason. Refused when the size's unassigned units
 *                       changed since the screen was loaded (optimistic check) or
 *                       would go negative (DB trigger as backstop).
 * changeAssignmentRate: admin — only before any unit of it is reported.
 * releaseAssignment:    admin, cashier, secretary — give back unreported units.
 *
 * The clothier is notified with her rate and expected earnings; client prices
 * never appear in what she receives. Every write is logged on the pedido.
 */

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, getTxDb } from "@/lib/db";
import {
  assignments,
  clothPieces,
  clothPieceVariants,
  employees,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidos,
  users,
} from "@befine/db/schema";
import { formatPedidoNumber, formatPesos } from "@befine/db";
import {
  assignUnitsSchema,
  changeAssignmentRateSchema,
  releaseAssignmentSchema,
} from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";
import {
  ConflictError,
  InputError,
  requirePedidoRole,
  toFail,
  validationError,
} from "./action-helpers";

export type ClothierOption = { id: string; name: string };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type Notice = { employeeId: string; message: string };

async function sendNotices(notices: Notice[]) {
  // Post-commit side effect: a failed notification never undoes the write.
  for (const n of notices)
    await createNotification({
      recipientEmployeeId: n.employeeId,
      type: "piece_assigned",
      message: n.message,
      link: "/clothier",
    }).catch(() => {});
}

async function rateLimited(userId: string) {
  const { allowed } = await checkRateLimit(rateLimits.general, userId);
  return allowed
    ? null
    : ({
        success: false,
        error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
      } as const);
}

/** Cell with what it belongs to, locked for the rest of the transaction. */
async function lockCell(tx: ActivityTx, cellId: string) {
  const [cell] = await tx
    .select({
      id: pedidoLineCells.id,
      quantity: pedidoLineCells.quantity,
      sizeLabel: sql<string>`coalesce(${garmentSizes.label}, ${pedidoLineCells.sizeOther})`,
      pedidoId: pedidos.id,
      number: pedidos.number,
      cancelledAt: pedidos.cancelledAt,
      variantPieceRate: clothPieceVariants.pieceRate,
      garment: sql<string>`${clothPieces.name} || ' — ' || ${clothPieceVariants.name}`,
    })
    .from(pedidoLineCells)
    .innerJoin(pedidoLines, eq(pedidoLineCells.lineId, pedidoLines.id))
    .innerJoin(pedidos, eq(pedidoLines.pedidoId, pedidos.id))
    .innerJoin(clothPieceVariants, eq(pedidoLines.clothPieceVariantId, clothPieceVariants.id))
    .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
    .leftJoin(garmentSizes, eq(pedidoLineCells.sizeId, garmentSizes.id))
    .where(eq(pedidoLineCells.id, cellId))
    .for("update", { of: pedidoLineCells });
  return cell ?? null;
}

/** Units of a cell nobody holds (quantity − Σ live assignment units). */
async function unassignedUnits(tx: ActivityTx, cellId: string, quantity: number) {
  const [row] = await tx
    .execute(
      sql`
    SELECT (coalesce(sum(a.quantity), 0)
      - coalesce((SELECT sum(r.scrapped) FROM unit_reviews r JOIN assignments a2 ON a2.id = r.assignment_id WHERE a2.cell_id = ${cellId}), 0))::int AS live
    FROM assignments a WHERE a.cell_id = ${cellId}
  `,
    )
    .then((r) => r.rows as { live: number }[]);
  return quantity - Number(row?.live ?? 0);
}

// ─── Clothier list ───────────────────────────────────────────────────────────

export async function listClothiers(): Promise<ActionResult<ClothierOption[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const rows = await getDb()
    .select({ id: employees.id, name: users.name })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id))
    .where(and(eq(employees.role, "clothier"), eq(employees.isActive, true)))
    .orderBy(asc(users.name));
  return { success: true, data: rows };
}

// ─── Assign ──────────────────────────────────────────────────────────────────

export async function assignUnits(
  rawInput: unknown,
): Promise<ActionResult<{ assignmentId: string; unassigned: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const limited = await rateLimited(guard.user.id);
  if (limited) return limited;
  const parsed = assignUnitsSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const isAdmin = hasRole(guard.user, "admin");
  if (input.pieceRate !== undefined && !isAdmin)
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Solo administración puede cambiar la tarifa." },
    };
  const actor = actorOf(guard.user);
  const notices: Notice[] = [];

  try {
    const result = await getTxDb().transaction(async (tx) => {
      const cell = await lockCell(tx, input.cellId);
      if (!cell) throw new ConflictError("NOT_FOUND", "Talla no encontrada");
      if (cell.cancelledAt) throw new ConflictError("CONFLICT", "El pedido está cancelado.");

      const unassigned = await unassignedUnits(tx, cell.id, cell.quantity);
      if (unassigned !== input.expectedUnassigned)
        throw new ConflictError(
          "STALE_DATA",
          `Las unidades sin asignar cambiaron: ahora son ${unassigned}. Revisa y vuelve a intentar.`,
        );
      if (input.quantity > unassigned)
        throw new InputError(
          "quantity",
          `Solo quedan ${unassigned} ${unassigned === 1 ? "unidad" : "unidades"} sin asignar en la talla ${cell.sizeLabel}.`,
        );

      const [clothier] = await tx
        .select({ id: employees.id, name: users.name })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.role, "clothier"),
            eq(employees.isActive, true),
          ),
        );
      if (!clothier) throw new InputError("employeeId", "Elige una confeccionista activa.");

      const pieceRate = input.pieceRate ?? cell.variantPieceRate;
      const override = pieceRate !== cell.variantPieceRate;
      const rateReason = override ? (input.rateReason?.trim() ?? "") : null;
      if (override && !rateReason)
        throw new InputError("rateReason", "Escribe el motivo de la tarifa distinta.");

      // Same clothier, same size, same rate: grow her assignment instead of a second row.
      const [same] = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(
          and(
            eq(assignments.cellId, cell.id),
            eq(assignments.employeeId, clothier.id),
            eq(assignments.pieceRate, pieceRate),
            rateReason === null
              ? sql`${assignments.rateReason} IS NULL`
              : eq(assignments.rateReason, rateReason),
          ),
        )
        .limit(1)
        .for("update");
      let assignmentId: string;
      if (same) {
        await tx
          .update(assignments)
          .set({
            quantity: sql`${assignments.quantity} + ${input.quantity}`,
            version: sql`${assignments.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(assignments.id, same.id));
        assignmentId = same.id;
      } else {
        const [row] = await tx
          .insert(assignments)
          .values({
            cellId: cell.id,
            employeeId: clothier.id,
            quantity: input.quantity,
            pieceRate,
            rateReason,
            source: "assigned",
            createdBy: guard.employeeId,
          })
          .returning({ id: assignments.id });
        assignmentId = row.id;
      }

      const number = formatPedidoNumber(cell.number);
      await logActivity(tx, {
        actor,
        action: "production.assign",
        entityType: "pedido",
        entityId: cell.pedidoId,
        summary:
          `Asignó ${input.quantity} ${input.quantity === 1 ? "unidad" : "unidades"} de ${cell.garment} (${cell.sizeLabel}) del pedido ${number} a ${clothier.name}` +
          (override ? ` · tarifa especial ${formatPesos(pieceRate)}` : ""),
        after: {
          assignmentId,
          clothier: clothier.name,
          size: cell.sizeLabel,
          units: input.quantity,
          pieceRate,
          catalogRate: cell.variantPieceRate,
        },
        reason: rateReason,
      });
      notices.push({
        employeeId: clothier.id,
        message:
          `Te asignaron ${input.quantity} ${input.quantity === 1 ? "unidad" : "unidades"}: ${cell.garment} · talla ${cell.sizeLabel} · pedido ${number} · ` +
          `${formatPesos(pieceRate)} c/u (${formatPesos(pieceRate * input.quantity)})` +
          (override ? ` — tarifa especial: ${rateReason}` : ""),
      });
      return { assignmentId, unassigned: unassigned - input.quantity, pedidoId: cell.pedidoId };
    });

    await sendNotices(notices);
    revalidatePath(`/pedidos/${result.pedidoId}`);
    revalidatePath("/pedidos");
    return {
      success: true,
      data: { assignmentId: result.assignmentId, unassigned: result.unassigned },
    };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Rate change (admin, before work starts) ─────────────────────────────────

async function lockAssignment(tx: ActivityTx, id: string) {
  const [a] = await tx
    .select({
      id: assignments.id,
      cellId: assignments.cellId,
      employeeId: assignments.employeeId,
      quantity: assignments.quantity,
      pieceRate: assignments.pieceRate,
      version: assignments.version,
      reported: sql<number>`coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = ${assignments.id} AND r.kind = 'report'), 0)::int`,
      anyReport: sql<boolean>`EXISTS (SELECT 1 FROM unit_reports r WHERE r.assignment_id = ${assignments.id})`,
      clothierName: users.name,
    })
    .from(assignments)
    .innerJoin(employees, eq(assignments.employeeId, employees.id))
    .innerJoin(users, eq(employees.userId, users.id))
    .where(eq(assignments.id, id))
    .for("update", { of: assignments });
  return a ?? null;
}

export async function changeAssignmentRate(
  assignmentId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!hasRole(guard.user, "admin"))
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Solo administración puede cambiar la tarifa." },
    };
  if (!isUuid(assignmentId))
    return { success: false, error: { code: "NOT_FOUND", message: "Asignación no encontrada" } };
  const limited = await rateLimited(guard.user.id);
  if (limited) return limited;
  const parsed = changeAssignmentRateSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const notices: Notice[] = [];

  try {
    const pedidoId = await getTxDb().transaction(async (tx) => {
      const a = await lockAssignment(tx, assignmentId);
      if (!a) throw new ConflictError("NOT_FOUND", "Asignación no encontrada");
      if (a.version !== input.version)
        throw new ConflictError("STALE_DATA", "La asignación cambió. Recarga e intenta de nuevo.");
      if (a.anyReport)
        throw new ConflictError(
          "CONFLICT",
          "La confeccionista ya reportó unidades de esta asignación: la tarifa ya no se puede cambiar.",
        );
      const cell = await lockCell(tx, a.cellId);
      if (!cell || cell.cancelledAt)
        throw new ConflictError("CONFLICT", "El pedido está cancelado.");
      if (input.pieceRate === a.pieceRate) return cell.pedidoId;

      await tx
        .update(assignments)
        .set({
          pieceRate: input.pieceRate,
          rateReason: input.reason,
          version: sql`${assignments.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(assignments.id, a.id));

      const number = formatPedidoNumber(cell.number);
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.rate_change",
        entityType: "pedido",
        entityId: cell.pedidoId,
        summary: `Cambió la tarifa de ${a.clothierName} en ${cell.garment} (${cell.sizeLabel}) del pedido ${number}: ${formatPesos(a.pieceRate)} → ${formatPesos(input.pieceRate)}`,
        before: { assignmentId: a.id, pieceRate: a.pieceRate },
        after: { assignmentId: a.id, pieceRate: input.pieceRate },
        reason: input.reason,
      });
      notices.push({
        employeeId: a.employeeId,
        message: `Tu tarifa en ${cell.garment} · talla ${cell.sizeLabel} · pedido ${number} ahora es ${formatPesos(input.pieceRate)} c/u (${formatPesos(input.pieceRate * a.quantity)} por ${a.quantity}). Motivo: ${input.reason}`,
      });
      return cell.pedidoId;
    });

    await sendNotices(notices);
    revalidatePath(`/pedidos/${pedidoId}`);
    return { success: true, data: { id: assignmentId } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Release (staff) ─────────────────────────────────────────────────────────

export async function releaseAssignment(
  assignmentId: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string; quantity: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!isUuid(assignmentId))
    return { success: false, error: { code: "NOT_FOUND", message: "Asignación no encontrada" } };
  const limited = await rateLimited(guard.user.id);
  if (limited) return limited;
  const parsed = releaseAssignmentSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const notices: Notice[] = [];

  try {
    const result = await getTxDb().transaction(async (tx) => {
      const a = await lockAssignment(tx, assignmentId);
      if (!a) throw new ConflictError("NOT_FOUND", "Asignación no encontrada");
      if (a.version !== input.version)
        throw new ConflictError("STALE_DATA", "La asignación cambió. Recarga e intenta de nuevo.");
      const unstarted = a.quantity - Number(a.reported);
      if (input.quantity > unstarted)
        throw new InputError(
          "quantity",
          unstarted > 0
            ? `Solo se pueden liberar ${unstarted} ${unstarted === 1 ? "unidad" : "unidades"}: el resto ya fue reportado.`
            : "Todas las unidades de esta asignación ya fueron reportadas.",
        );
      const cell = await lockCell(tx, a.cellId);
      if (!cell) throw new ConflictError("NOT_FOUND", "Talla no encontrada");

      const quantity = a.quantity - input.quantity;
      await tx
        .update(assignments)
        .set({ quantity, version: sql`${assignments.version} + 1`, updatedAt: new Date() })
        .where(eq(assignments.id, a.id));

      const number = formatPedidoNumber(cell.number);
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.release",
        entityType: "pedido",
        entityId: cell.pedidoId,
        summary: `Liberó ${input.quantity} ${input.quantity === 1 ? "unidad" : "unidades"} de ${a.clothierName} en ${cell.garment} (${cell.sizeLabel}) del pedido ${number}`,
        before: { assignmentId: a.id, quantity: a.quantity },
        after: { assignmentId: a.id, quantity },
      });
      notices.push({
        employeeId: a.employeeId,
        message: `Se liberaron ${input.quantity} ${input.quantity === 1 ? "unidad" : "unidades"} de tu asignación en ${cell.garment} · talla ${cell.sizeLabel} · pedido ${number}. Ahora tienes ${quantity}.`,
      });
      return { pedidoId: cell.pedidoId, quantity };
    });

    await sendNotices(notices);
    revalidatePath(`/pedidos/${result.pedidoId}`);
    return { success: true, data: { id: assignmentId, quantity: result.quantity } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}
