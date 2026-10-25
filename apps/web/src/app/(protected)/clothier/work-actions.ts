"use server";

/**
 * Mi trabajo — T123 (spec §3.2.7–9, §3.7)
 *
 * Clothier-only actions on her own work:
 *   getMyWork       corrections, assigned work, Disponibles, claim limit, day open
 *   claimUnits      take unassigned units of a size, up to the claim limit
 *                   (unstarted units held + claim ≤ limit), at the variant rate
 *   releaseMyUnits  give units back — only while nothing on the assignment was reported
 *   reportUnits     finished units; returned units are re-reported first as
 *                   rework. Needs an open business day. Idempotent per tap, so
 *                   the offline queue can replay it.
 * No client prices or client names ever leave these actions.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, like, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { assignments, unitReports } from "@befine/db/schema";
import { formatPedidoNumber, getClothierWork, type ClothierWork } from "@befine/db";
import { claimUnitsSchema, releaseAssignmentSchema, reportUnitsSchema } from "@befine/types";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getEmployeeRef } from "@/lib/employee-ref";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getCurrentBusinessDay } from "@/lib/business-day";
import { getBusinessSettings } from "@/lib/business-settings";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";

type Fail = Extract<ActionResult<never>, { success: false }>;

export type MyWork = ClothierWork & {
  claimLimit: number;
  /** Reports need an open business day (spec §3.7) */
  dayOpen: boolean;
};

class WorkError extends Error {
  constructor(
    readonly code: "VALIDATION_ERROR" | "CONFLICT" | "STALE_DATA" | "NOT_FOUND" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

async function requireClothier(): Promise<
  Fail | { user: { id: string; role?: string | null }; employeeId: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "clothier"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const emp = await getEmployeeRef(session.user.id);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  return { user: session.user, employeeId: emp.id };
}

async function limited(userId: string): Promise<Fail | null> {
  const { allowed } = await checkRateLimit(rateLimits.general, userId);
  return allowed
    ? null
    : {
        success: false,
        error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
      };
}

function fail(err: unknown): Fail | null {
  if (err instanceof WorkError)
    return { success: false, error: { code: err.code, message: err.message } };
  return null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lock a cell with what the clothier needs to know about it. */
async function lockCell(tx: ActivityTx, cellId: string) {
  const rows = await tx.execute(sql`
    SELECT c.id, c.quantity, p.id AS pedido_id, p.number, p.cancelled_at, v.piece_rate,
      cp.name || ' — ' || v.name AS garment, coalesce(gs.label, c.size_other) AS size_label,
      (c.quantity
        - coalesce((SELECT sum(a.quantity) FROM assignments a WHERE a.cell_id = c.id), 0)
        + coalesce((SELECT sum(r.scrapped) FROM unit_reviews r JOIN assignments a ON a.id = r.assignment_id WHERE a.cell_id = c.id), 0)
      )::int AS unassigned
    FROM pedido_line_cells c
    JOIN pedido_lines l ON l.id = c.line_id
    JOIN pedidos p ON p.id = l.pedido_id
    JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
    JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
    LEFT JOIN garment_sizes gs ON gs.id = c.size_id
    WHERE c.id = ${cellId}
    FOR UPDATE OF c
  `);
  return (rows.rows[0] ?? null) as {
    id: string;
    pedido_id: string;
    number: number;
    cancelled_at: string | null;
    piece_rate: string;
    garment: string;
    size_label: string;
    unassigned: number;
  } | null;
}

/** Her assignment with its work so far, locked. */
async function lockMine(tx: ActivityTx, assignmentId: string, employeeId: string) {
  const rows = await tx.execute(sql`
    SELECT a.id, a.quantity, a.version, a.employee_id, a.cell_id, p.id AS pedido_id, p.number,
      p.cancelled_at,
      coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0)::int AS reported,
      coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'rework'), 0)::int AS rework,
      coalesce((SELECT sum(v.returned) FROM unit_reviews v WHERE v.assignment_id = a.id), 0)::int AS returned,
      EXISTS (SELECT 1 FROM unit_reports r WHERE r.assignment_id = a.id) AS any_report
    FROM assignments a
    JOIN pedido_line_cells c ON c.id = a.cell_id
    JOIN pedido_lines l ON l.id = c.line_id
    JOIN pedidos p ON p.id = l.pedido_id
    WHERE a.id = ${assignmentId}
    FOR UPDATE OF a
  `);
  const a = rows.rows[0] as
    | {
        id: string;
        quantity: number;
        version: number;
        employee_id: string;
        pedido_id: string;
        number: number;
        cancelled_at: string | null;
        reported: number;
        rework: number;
        returned: number;
        any_report: boolean;
      }
    | undefined;
  // Someone else's assignment looks exactly like a missing one.
  if (!a || a.employee_id !== employeeId) throw new WorkError("NOT_FOUND", "Trabajo no encontrado");
  return a;
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getMyWork(): Promise<ActionResult<MyWork>> {
  const guard = await requireClothier();
  if ("success" in guard) return guard;
  const [work, settings, day] = await Promise.all([
    getClothierWork(getDb(), guard.employeeId),
    getBusinessSettings(),
    getCurrentBusinessDay(),
  ]);
  return {
    success: true,
    data: { ...work, claimLimit: settings.clothierClaimLimit, dayOpen: day !== null },
  };
}

// ─── Claim ───────────────────────────────────────────────────────────────────

export async function claimUnits(
  rawInput: unknown,
): Promise<ActionResult<{ assignmentId: string }>> {
  const guard = await requireClothier();
  if ("success" in guard) return guard;
  const rl = await limited(guard.user.id);
  if (rl) return rl;
  const parsed = claimUnitsSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      },
    };
  const input = parsed.data;
  const { clothierClaimLimit } = await getBusinessSettings();

  try {
    const result = await getTxDb().transaction(async (tx) => {
      // Serialise her own claims so two taps cannot both pass the limit.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`claim:${guard.employeeId}`}))`);
      const cell = await lockCell(tx, input.cellId);
      if (!cell || cell.cancelled_at)
        throw new WorkError("NOT_FOUND", "Ese trabajo ya no está disponible.");
      if (cell.unassigned !== input.expectedUnassigned)
        throw new WorkError(
          "STALE_DATA",
          cell.unassigned > 0
            ? `Ahora quedan ${plural(cell.unassigned, "unidad", "unidades")}. Revisa y vuelve a intentar.`
            : "Otra persona ya tomó estas unidades.",
        );
      if (input.quantity > cell.unassigned)
        throw new WorkError(
          "VALIDATION_ERROR",
          `Solo quedan ${plural(cell.unassigned, "unidad", "unidades")}.`,
        );

      const [{ held }] = (
        await tx.execute(sql`
          SELECT coalesce(sum(a.quantity - coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0)), 0)::int AS held
          FROM assignments a
          JOIN pedido_line_cells c ON c.id = a.cell_id JOIN pedido_lines l ON l.id = c.line_id
          JOIN pedidos p ON p.id = l.pedido_id
          WHERE a.employee_id = ${guard.employeeId} AND p.cancelled_at IS NULL
        `)
      ).rows as { held: number }[];
      const room = clothierClaimLimit - Number(held);
      if (input.quantity > room)
        throw new WorkError(
          "VALIDATION_ERROR",
          room > 0
            ? `Puedes tomar hasta ${plural(room, "unidad más", "unidades más")} (límite ${clothierClaimLimit}).`
            : `Ya tienes ${held} unidades sin terminar, el límite es ${clothierClaimLimit}. Termina o reporta antes de tomar más.`,
        );

      const pieceRate = Number(cell.piece_rate);
      const [same] = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(
          and(
            eq(assignments.cellId, cell.id),
            eq(assignments.employeeId, guard.employeeId),
            eq(assignments.pieceRate, pieceRate),
            sql`${assignments.rateReason} IS NULL`,
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
            employeeId: guard.employeeId,
            quantity: input.quantity,
            pieceRate,
            source: "claimed",
            createdBy: guard.employeeId,
          })
          .returning({ id: assignments.id });
        assignmentId = row.id;
      }

      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.claim",
        entityType: "pedido",
        entityId: cell.pedido_id,
        summary: `Tomó ${plural(input.quantity, "unidad", "unidades")} de ${cell.garment} (${cell.size_label}) del pedido ${formatPedidoNumber(cell.number)}`,
        after: { assignmentId, units: input.quantity, size: cell.size_label, pieceRate },
      });
      return { assignmentId, pedidoId: cell.pedido_id };
    });
    revalidatePath("/clothier");
    revalidatePath(`/pedidos/${result.pedidoId}`);
    return { success: true, data: { assignmentId: result.assignmentId } };
  } catch (err) {
    const f = fail(err);
    if (f) return f;
    throw err;
  }
}

// ─── Release ─────────────────────────────────────────────────────────────────

export async function releaseMyUnits(
  assignmentId: string,
  rawInput: unknown,
): Promise<ActionResult<{ quantity: number }>> {
  const guard = await requireClothier();
  if ("success" in guard) return guard;
  if (typeof assignmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(assignmentId))
    return { success: false, error: { code: "NOT_FOUND", message: "Trabajo no encontrado" } };
  const rl = await limited(guard.user.id);
  if (rl) return rl;
  const parsed = releaseAssignmentSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      },
    };
  const input = parsed.data;

  try {
    const result = await getTxDb().transaction(async (tx) => {
      const a = await lockMine(tx, assignmentId, guard.employeeId);
      if (a.version !== input.version)
        throw new WorkError("STALE_DATA", "Tu trabajo cambió. Actualiza la pantalla.");
      // Spec §3.2.7: after the first report only secretary/admin can reassign.
      if (a.any_report)
        throw new WorkError(
          "CONFLICT",
          "Ya reportaste unidades de este trabajo: pide a la secretaria que lo reasigne.",
        );
      if (input.quantity > a.quantity)
        throw new WorkError("VALIDATION_ERROR", `Solo tienes ${a.quantity} unidades aquí.`);
      const quantity = a.quantity - input.quantity;
      await tx
        .update(assignments)
        .set({ quantity, version: sql`${assignments.version} + 1`, updatedAt: new Date() })
        .where(eq(assignments.id, a.id));
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.release",
        entityType: "pedido",
        entityId: a.pedido_id,
        summary: `Devolvió ${plural(input.quantity, "unidad", "unidades")} del pedido ${formatPedidoNumber(a.number)}`,
        before: { assignmentId: a.id, quantity: a.quantity },
        after: { assignmentId: a.id, quantity },
      });
      return { quantity, pedidoId: a.pedido_id };
    });
    revalidatePath("/clothier");
    revalidatePath(`/pedidos/${result.pedidoId}`);
    return { success: true, data: { quantity: result.quantity } };
  } catch (err) {
    const f = fail(err);
    if (f) return f;
    throw err;
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

export async function reportUnits(
  rawInput: unknown,
): Promise<ActionResult<{ reported: number; rework: number }>> {
  const guard = await requireClothier();
  if ("success" in guard) return guard;
  const rl = await limited(guard.user.id);
  if (rl) return rl;
  const parsed = reportUnitsSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
      },
    };
  const input = parsed.data;

  try {
    const result = await getTxDb().transaction(async (tx) => {
      // Replayed from the offline queue: return what the first attempt wrote.
      const previous = await tx
        .select({ kind: unitReports.kind, quantity: unitReports.quantity })
        .from(unitReports)
        .where(like(unitReports.idempotencyKey, `${input.idempotencyKey}:%`));
      if (previous.length)
        return {
          reported: previous.filter((p) => p.kind === "report").reduce((n, p) => n + p.quantity, 0),
          rework: previous.filter((p) => p.kind === "rework").reduce((n, p) => n + p.quantity, 0),
          pedidoId: null,
        };

      const day = await tx.execute(
        sql`SELECT id FROM business_days WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`,
      );
      const dayId = (day.rows[0] as { id: string } | undefined)?.id;
      if (!dayId)
        throw new WorkError(
          "CONFLICT",
          "El día no está abierto. Pide en caja que lo abran para reportar tu trabajo.",
        );

      const a = await lockMine(tx, input.assignmentId, guard.employeeId);
      if (a.cancelled_at) throw new WorkError("CONFLICT", "Ese pedido fue cancelado.");
      const inRework = a.returned - a.rework;
      const unstarted = a.quantity - a.reported;
      const toDo = inRework + unstarted;
      if (input.quantity > toDo)
        throw new WorkError(
          "VALIDATION_ERROR",
          toDo > 0
            ? `Te ${toDo === 1 ? "queda" : "quedan"} ${plural(toDo, "unidad", "unidades")} por hacer aquí.`
            : "Ya reportaste todo este trabajo.",
        );

      // Corrections first: returned units are what she is asked to redo.
      const rework = Math.min(input.quantity, inRework);
      const reported = input.quantity - rework;
      const rows = [
        ...(rework ? [{ kind: "rework" as const, quantity: rework }] : []),
        ...(reported ? [{ kind: "report" as const, quantity: reported }] : []),
      ];
      await tx.insert(unitReports).values(
        rows.map((r) => ({
          assignmentId: a.id,
          quantity: r.quantity,
          kind: r.kind,
          businessDayId: dayId,
          reportedBy: guard.employeeId,
          idempotencyKey: `${input.idempotencyKey}:${r.kind}`,
        })),
      );
      await logActivity(tx, {
        actor: actorOf(guard.user),
        action: "production.report",
        entityType: "pedido",
        entityId: a.pedido_id,
        businessDayId: dayId,
        summary:
          `Reportó ${plural(input.quantity, "unidad terminada", "unidades terminadas")} del pedido ${formatPedidoNumber(a.number)}` +
          (rework ? ` (${rework} de corrección)` : ""),
        after: { assignmentId: a.id, reported, rework },
      });
      return { reported, rework, pedidoId: a.pedido_id };
    });
    revalidatePath("/clothier");
    if (result.pedidoId) revalidatePath(`/pedidos/${result.pedidoId}`);
    return { success: true, data: { reported: result.reported, rework: result.rework } };
  } catch (err) {
    const f = fail(err);
    if (f) return f;
    throw err;
  }
}
