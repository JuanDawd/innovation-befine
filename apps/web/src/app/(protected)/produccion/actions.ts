"use server";

/**
 * Producción — T124 (spec §3.2.10, §3.7, §3.10)
 *
 * getProductionBoard  review queue grouped by clothier + sizes nobody holds
 * reviewUnits         approve N, return M for rework, scrap K of the units a
 *                     clothier reported on one assignment. Admin, cashier,
 *                     secretary. Needs an open business day. N + M + K ≤ pending
 *                     (checked here, the DB trigger is the backstop); refused
 *                     when the screen is stale. Returned and scrapped units need
 *                     a defect code (stored for analytics). Whether scrapped
 *                     units are paid is copied from the setting at review time.
 * Returned units reappear first on the clothier's phone; scrapped units
 * re-open as unassigned on the pedido (both derived, nothing else to write).
 */

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb, getTxDb } from "@/lib/db";
import {
  clothierDayClosings,
  employees,
  stockMovements,
  unitReviews,
  users,
} from "@befine/db/schema";
import {
  formatPedidoNumber,
  getDayClosings,
  getReviewQueue,
  listUnassignedCells,
  type AvailableItem,
  type DayClosingStatus,
  type ReviewGroup,
  type StoredClosingLine,
} from "@befine/db";
import { approveClosingSchema, DEFECT_LABELS, reviewUnitsSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { financialBreadcrumb, reportError } from "@/lib/observability";
import { getBusinessSettings } from "@/lib/business-settings";
import { createNotification } from "@/lib/notifications";
import { actorOf, logActivity } from "@/lib/activity";
import { applyDayCount, DayCountError } from "@/lib/day-count";
import { hasRole } from "@/lib/middleware-helpers";
import {
  ConflictError,
  InputError,
  requirePedidoRole,
  toFail,
  validationError,
} from "../pedidos/action-helpers";

export type ProductionBoard = {
  queue: ReviewGroup[];
  unassigned: AvailableItem[];
  dayOpen: boolean;
  /** T125 — who is expected to close today and their closings */
  closings: DayClosingStatus[];
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function getProductionBoard(): Promise<ActionResult<ProductionBoard>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const db = getDb();
  const [queue, unassigned, day] = await Promise.all([
    getReviewQueue(db),
    listUnassignedCells(db),
    db.execute(sql`SELECT id FROM business_days WHERE closed_at IS NULL LIMIT 1`),
  ]);
  const dayId = (day.rows[0] as { id: string } | undefined)?.id ?? null;
  const closings = dayId ? await getDayClosings(db, dayId) : [];
  return { success: true, data: { queue, unassigned, dayOpen: dayId !== null, closings } };
}

export async function reviewUnits(
  assignmentId: string,
  rawInput: unknown,
): Promise<ActionResult<{ approved: number; returned: number; scrapped: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof assignmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(assignmentId))
    return { success: false, error: { code: "NOT_FOUND", message: "Asignación no encontrada" } };
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = reviewUnitsSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { payScrappedUnits } = await getBusinessSettings();
  let notice: { employeeId: string; message: string } | null = null;

  try {
    const result = await getTxDb().transaction(async (tx) => {
      // A double tap returns the review the first one recorded.
      const [previous] = await tx
        .select({
          approved: unitReviews.approved,
          returned: unitReviews.returned,
          scrapped: unitReviews.scrapped,
        })
        .from(unitReviews)
        .where(eq(unitReviews.idempotencyKey, input.idempotencyKey));
      if (previous) return { ...previous, pedidoId: null };

      const day = await tx.execute(
        sql`SELECT id FROM business_days WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`,
      );
      const dayId = (day.rows[0] as { id: string } | undefined)?.id;
      if (!dayId) throw new ConflictError("CONFLICT", "Abre el día para revisar unidades.");

      const rows = await tx.execute(sql`
        SELECT a.id, a.employee_id, a.piece_rate, p.id AS pedido_id, p.number, p.destination,
          l.cloth_piece_variant_id AS variant_id, c.size_id, l.color_id,
          u.name AS clothier_name, cp.name || ' — ' || v.name AS garment,
          coalesce(gs.label, c.size_other) AS size_label,
          (coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id), 0)
            - coalesce((SELECT sum(x.approved + x.returned + x.scrapped) FROM unit_reviews x WHERE x.assignment_id = a.id), 0))::int AS pending
        FROM assignments a
        JOIN employees e ON e.id = a.employee_id JOIN users u ON u.id = e.user_id
        JOIN pedido_line_cells c ON c.id = a.cell_id
        JOIN pedido_lines l ON l.id = c.line_id
        JOIN pedidos p ON p.id = l.pedido_id
        JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
        JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
        LEFT JOIN garment_sizes gs ON gs.id = c.size_id
        WHERE a.id = ${assignmentId}
        FOR UPDATE OF a
      `);
      const a = rows.rows[0] as
        | {
            id: string;
            employee_id: string;
            piece_rate: string;
            pedido_id: string;
            number: number;
            destination: "client" | "inventory";
            variant_id: string;
            size_id: string | null;
            color_id: string | null;
            clothier_name: string;
            garment: string;
            size_label: string;
            pending: number;
          }
        | undefined;
      if (!a) throw new ConflictError("NOT_FOUND", "Asignación no encontrada");
      if (a.pending !== input.expectedPending)
        throw new ConflictError(
          "STALE_DATA",
          a.pending > 0
            ? `Ahora hay ${plural(a.pending, "unidad", "unidades")} por revisar. Revisa de nuevo.`
            : "Estas unidades ya fueron revisadas.",
        );

      const returnText =
        input.returned > 0 && input.returnCode
          ? DEFECT_LABELS[input.returnCode] + (input.returnNote ? `: ${input.returnNote}` : "")
          : null;
      const scrapText =
        input.scrapped > 0 && input.scrapCode
          ? DEFECT_LABELS[input.scrapCode] + (input.scrapNote ? `: ${input.scrapNote}` : "")
          : null;

      const [review] = await tx
        .insert(unitReviews)
        .values({
          assignmentId: a.id,
          approved: input.approved,
          returned: input.returned,
          scrapped: input.scrapped,
          reason: returnText,
          returnCode: input.returned > 0 ? input.returnCode : null,
          scrapCode: input.scrapped > 0 ? input.scrapCode : null,
          scrapReason: scrapText,
          scrapPaid: input.scrapped > 0 && payScrappedUnits,
          businessDayId: dayId,
          reviewedBy: guard.employeeId,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: unitReviews.id });

      // T128 — approved units of an inventory pedido enter stock, linked to
      // this review. Client pedido garments never enter general stock (§3.6.25).
      if (a.destination === "inventory" && input.approved > 0)
        await tx.insert(stockMovements).values({
          clothPieceVariantId: a.variant_id,
          sizeId: a.size_id,
          colorId: a.color_id,
          quantity: input.approved,
          kind: "production",
          refType: "unit_review",
          refId: review.id,
          createdBy: guard.employeeId,
        });

      const number = formatPedidoNumber(a.number);
      const parts = [
        input.approved ? plural(input.approved, "aprobada", "aprobadas") : null,
        input.returned
          ? `${plural(input.returned, "devuelta", "devueltas")} (${returnText})`
          : null,
        input.scrapped
          ? `${plural(input.scrapped, "descartada", "descartadas")} (${scrapText})`
          : null,
      ].filter(Boolean);
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.review",
        entityType: "pedido",
        entityId: a.pedido_id,
        businessDayId: dayId,
        summary: `Revisó ${plural(input.approved + input.returned + input.scrapped, "unidad", "unidades")} de ${a.clothier_name} en ${a.garment} (${a.size_label}) del pedido ${number}: ${parts.join(", ")}`,
        after: {
          assignmentId: a.id,
          approved: input.approved,
          returned: input.returned,
          scrapped: input.scrapped,
          returnCode: input.returnCode ?? null,
          scrapCode: input.scrapCode ?? null,
          scrapPaid: input.scrapped > 0 && payScrappedUnits,
        },
        reason: [returnText, scrapText].filter(Boolean).join(" · ") || null,
      });

      const where = `${a.garment} · talla ${a.size_label} · pedido ${number}`;
      const msg = [
        input.approved
          ? `Te aprobaron ${plural(input.approved, "unidad", "unidades")} de ${where}.`
          : null,
        input.returned
          ? `Te devolvieron ${plural(input.returned, "unidad", "unidades")} para corregir: ${returnText}. Aparecen primero en Mi trabajo.`
          : null,
        input.scrapped
          ? `Se ${input.scrapped === 1 ? "descartó" : "descartaron"} ${plural(input.scrapped, "unidad", "unidades")}: ${scrapText}. ${payScrappedUnits ? "Se te pagan." : "No se pagan."}`
          : null,
      ].filter(Boolean);
      notice = { employeeId: a.employee_id, message: msg.join(" ") };
      return {
        approved: input.approved,
        returned: input.returned,
        scrapped: input.scrapped,
        pedidoId: a.pedido_id,
      };
    });

    const n = notice as { employeeId: string; message: string } | null;
    if (n)
      await createNotification({
        recipientEmployeeId: n.employeeId,
        type: "generic",
        message: n.message,
        link: "/clothier",
      }).catch((err) => reportError(err, "createNotification"));

    revalidatePath("/produccion");
    if (result.pedidoId) revalidatePath(`/pedidos/${result.pedidoId}`);
    financialBreadcrumb("reviewUnits", {
      assignmentId,
      pedidoId: result.pedidoId,
      approved: result.approved,
      returned: result.returned,
      scrapped: result.scrapped,
    });
    return {
      success: true,
      data: { approved: result.approved, returned: result.returned, scrapped: result.scrapped },
    };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Closings (T125) ─────────────────────────────────────────────────────────

/**
 * Approve a clothier's closing, optionally correcting lines (reason required).
 * Corrections rewrite that day's reports the same way her own closing does.
 */
export async function approveClosing(
  closingId: string,
  rawInput: unknown,
): Promise<ActionResult<{ corrected: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof closingId !== "string" || !/^[0-9a-f-]{36}$/i.test(closingId))
    return { success: false, error: { code: "NOT_FOUND", message: "Cierre no encontrado" } };
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = approveClosingSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  let notice: { employeeId: string; message: string } | null = null;

  try {
    const corrected = await getTxDb().transaction(async (tx) => {
      const open = await tx.execute(
        sql`SELECT 1 FROM business_days WHERE closed_at IS NULL LIMIT 1`,
      );
      if (!open.rows.length)
        throw new ConflictError("CONFLICT", "Abre el día para aprobar cierres.");
      const [k] = await tx
        .select({
          id: clothierDayClosings.id,
          employeeId: clothierDayClosings.employeeId,
          businessDayId: clothierDayClosings.businessDayId,
          version: clothierDayClosings.version,
          approvedAt: clothierDayClosings.approvedAt,
          lines: clothierDayClosings.lines,
          name: users.name,
        })
        .from(clothierDayClosings)
        .innerJoin(employees, eq(clothierDayClosings.employeeId, employees.id))
        .innerJoin(users, eq(employees.userId, users.id))
        .where(eq(clothierDayClosings.id, closingId))
        .for("update", { of: clothierDayClosings });
      if (!k) throw new ConflictError("NOT_FOUND", "Cierre no encontrado");
      if (k.approvedAt) throw new ConflictError("CONFLICT", "Este cierre ya fue aprobado.");
      if (k.version !== input.version)
        throw new ConflictError(
          "STALE_DATA",
          "La confeccionista cambió su cierre. Revísalo de nuevo.",
        );

      const lines = (k.lines as StoredClosingLine[]).map((l) => ({ ...l }));
      const changes: string[] = [];
      for (const c of input.corrections ?? []) {
        const line = lines.find((l) => l.assignmentId === c.assignmentId);
        if (!line) throw new InputError("corrections", "Esa línea no está en el cierre.");
        const current = line.corrected ?? line.submitted;
        if (c.finished === current) continue;
        try {
          await applyDayCount(tx, {
            assignmentId: c.assignmentId,
            employeeId: k.employeeId,
            businessDayId: k.businessDayId,
            target: c.finished,
            reportedBy: guard.employeeId,
            key: `correction:${k.id}:${k.version}`,
          });
        } catch (err) {
          if (err instanceof DayCountError)
            throw new InputError(
              "corrections",
              `${line.garment} talla ${line.size}: ${err.message}`,
            );
          throw err;
        }
        changes.push(`${line.garment} ${line.size}: ${current} → ${c.finished}`);
        line.corrected = c.finished;
      }
      const reason = input.reason?.trim() || null;
      if (changes.length && (!reason || reason.length < 3))
        throw new InputError("reason", "Escribe el motivo de la corrección.");

      await tx
        .update(clothierDayClosings)
        .set({
          lines,
          correctionReason: changes.length ? reason : null,
          approvedBy: guard.employeeId,
          approvedAt: new Date(),
          version: sql`${clothierDayClosings.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(clothierDayClosings.id, k.id));

      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.closing_approve",
        entityType: "employee",
        entityId: k.employeeId,
        summary:
          `Aprobó el cierre de jornada de ${k.name}` +
          (changes.length ? ` con correcciones: ${changes.join(", ")}` : ""),
        before: { lines: k.lines },
        after: { lines },
        reason: changes.length ? reason : null,
      });
      notice = {
        employeeId: k.employeeId,
        message: changes.length
          ? `Corrigieron tu cierre de jornada: ${changes.join(", ")}. Motivo: ${reason}`
          : "Tu cierre de jornada fue aprobado.",
      };
      return changes.length;
    });

    const n = notice as { employeeId: string; message: string } | null;
    if (n)
      await createNotification({
        recipientEmployeeId: n.employeeId,
        type: "generic",
        message: n.message,
        link: "/clothier/cierre",
      }).catch((err) => reportError(err, "createNotification"));
    revalidatePath("/produccion");
    financialBreadcrumb("approveClosing", { closingId, corrected });
    return { success: true, data: { corrected } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

/** Remind every clothier who still has to close today. */
export async function remindClosings(): Promise<ActionResult<{ reminded: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const db = getDb();
  const day = await db.execute(sql`SELECT id FROM business_days WHERE closed_at IS NULL LIMIT 1`);
  const dayId = (day.rows[0] as { id: string } | undefined)?.id;
  if (!dayId)
    return { success: false, error: { code: "CONFLICT", message: "El día no está abierto." } };
  const missing = (await getDayClosings(db, dayId)).filter((c) => !c.closing);
  for (const c of missing)
    await createNotification({
      recipientEmployeeId: c.employeeId,
      type: "generic",
      message: "Recuerda cerrar tu jornada: entra a Mi trabajo y confirma cuántas terminaste hoy.",
      link: "/clothier/cierre",
    }).catch((err) => reportError(err, "createNotification"));
  return { success: true, data: { reminded: missing.length } };
}

/**
 * Clothiers who have not closed the open day — the close-business-day dialog
 * warns about them (T125; a warning, never a block). Admin and cashier.
 */
export async function listClothiersWithoutClosing(): Promise<ActionResult<string[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (!hasRole(guard.user, "admin", "cashier"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const db = getDb();
  const day = await db.execute(sql`SELECT id FROM business_days WHERE closed_at IS NULL LIMIT 1`);
  const dayId = (day.rows[0] as { id: string } | undefined)?.id;
  if (!dayId) return { success: true, data: [] };
  return {
    success: true,
    data: (await getDayClosings(db, dayId)).filter((c) => !c.closing).map((c) => c.name),
  };
}
