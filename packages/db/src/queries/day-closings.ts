/**
 * Cerrar mi jornada — T125 (spec §3.2.11–13)
 *
 * A closing states, per assignment, how many units the clothier finished on a
 * business day. The day's reports are brought in line with that number:
 * more units add reports (rework first), fewer remove today's reports that
 * nobody reviewed yet. Staff corrections use the same rule.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../index";

// ─── Pure: bring today's reports to a target ─────────────────────────────────

export type DayCountState = {
  /** Units reported on this assignment on the day */
  reportedToday: number;
  /** Today's report rows, oldest first */
  todayRows: { id: string; quantity: number; kind: "report" | "rework" }[];
  /** Returned units not yet re-reported */
  inRework: number;
  /** Assigned units never reported */
  unstarted: number;
  /** Reported (any day) minus reviewed: the only units that can be taken back */
  pendingReview: number;
};

export type DayCountPlan =
  | {
      ok: true;
      add: { kind: "report" | "rework"; quantity: number }[];
      /** Report rows to shrink to `quantity` (0 = delete), newest first */
      trim: { id: string; quantity: number }[];
    }
  | { ok: false; message: string };

export function planDayCount(target: number, s: DayCountState): DayCountPlan {
  if (!Number.isInteger(target) || target < 0)
    return { ok: false, message: "La cantidad debe ser un número entero de 0 o más." };
  const delta = target - s.reportedToday;
  if (delta === 0) return { ok: true, add: [], trim: [] };

  if (delta > 0) {
    const room = s.inRework + s.unstarted;
    if (delta > room)
      return {
        ok: false,
        message:
          room > 0
            ? `Solo ${room === 1 ? "queda 1 unidad" : `quedan ${room} unidades`} por hacer en este trabajo.`
            : "Este trabajo no tiene unidades por hacer.",
      };
    const rework = Math.min(delta, s.inRework);
    return {
      ok: true,
      add: [
        ...(rework ? [{ kind: "rework" as const, quantity: rework }] : []),
        ...(delta - rework ? [{ kind: "report" as const, quantity: delta - rework }] : []),
      ],
      trim: [],
    };
  }

  // Fewer than reported today: only units nobody reviewed can be taken back.
  let remove = -delta;
  if (remove > s.pendingReview)
    return {
      ok: false,
      message: `Ya se revisaron unidades de hoy: no puede bajar de ${s.reportedToday - s.pendingReview}.`,
    };
  const trim: { id: string; quantity: number }[] = [];
  for (const row of [...s.todayRows].reverse()) {
    if (remove === 0) break;
    const take = Math.min(row.quantity, remove);
    trim.push({ id: row.id, quantity: row.quantity - take });
    remove -= take;
  }
  return { ok: true, add: [], trim };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export type ClosingLine = {
  assignmentId: string;
  pedidoNumber: number;
  garment: string;
  size: string;
  reportedToday: number;
  /** Units still to make: unstarted + returned for rework */
  toDo: number;
  pendingReview: number;
};

export type StoredClosingLine = {
  assignmentId: string;
  pedidoNumber: number;
  garment: string;
  size: string;
  submitted: number;
  corrected: number | null;
};

export type ClosingRow = {
  id: string;
  version: number;
  submittedAt: Date;
  approvedAt: Date | null;
  approvedByName: string | null;
  correctionReason: string | null;
  submittedUnits: number;
  lines: StoredClosingLine[];
};

/**
 * The assignments a clothier closes the day on: work she still holds, plus
 * anything she reported that day (even if it is finished now).
 */
export async function getClosingLines(
  db: Database,
  employeeId: string,
  businessDayId: string,
): Promise<ClosingLine[]> {
  const rows = await db.execute(sql`
    WITH a AS (
      SELECT a.id, a.quantity, p.number, cp.name || ' — ' || v.name AS garment,
        coalesce(gs.label, c.size_other) AS size, gs.sort_order,
        coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0) AS reported,
        coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'rework'), 0) AS rework,
        coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.business_day_id = ${businessDayId}), 0) AS today,
        coalesce((SELECT sum(x.returned) FROM unit_reviews x WHERE x.assignment_id = a.id), 0) AS returned,
        coalesce((SELECT sum(x.approved + x.returned + x.scrapped) FROM unit_reviews x WHERE x.assignment_id = a.id), 0) AS reviewed
      FROM assignments a
      JOIN pedido_line_cells c ON c.id = a.cell_id
      JOIN pedido_lines l ON l.id = c.line_id
      JOIN pedidos p ON p.id = l.pedido_id
      JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
      JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
      LEFT JOIN garment_sizes gs ON gs.id = c.size_id
      WHERE a.employee_id = ${employeeId} AND p.cancelled_at IS NULL
    )
    SELECT id, number, garment, size,
      today::int AS reported_today,
      ((quantity - reported) + (returned - rework))::int AS to_do,
      ((reported + rework) - reviewed)::int AS pending_review
    FROM a
    WHERE today > 0 OR (quantity - reported) + (returned - rework) > 0
    ORDER BY number, sort_order NULLS LAST, size
  `);
  return (
    rows.rows as {
      id: string;
      number: number;
      garment: string;
      size: string;
      reported_today: number;
      to_do: number;
      pending_review: number;
    }[]
  ).map((r) => ({
    assignmentId: r.id,
    pedidoNumber: Number(r.number),
    garment: r.garment,
    size: r.size,
    reportedToday: Number(r.reported_today),
    toDo: Number(r.to_do),
    pendingReview: Number(r.pending_review),
  }));
}

export type DayClosingStatus = {
  employeeId: string;
  name: string;
  closing: ClosingRow | null;
};

/**
 * Every clothier expected to close a business day — active clothiers who hold
 * work or reported that day — with her closing, if any. Closings from anyone
 * else that day are included too.
 */
export async function getDayClosings(
  db: Database,
  businessDayId: string,
): Promise<DayClosingStatus[]> {
  const rows = await db.execute(sql`
    SELECT e.id AS employee_id, u.name,
      k.id AS closing_id, k.version, k.submitted_at, k.approved_at, k.correction_reason,
      k.submitted_units, k.lines, au.name AS approved_by_name
    FROM employees e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN clothier_day_closings k ON k.employee_id = e.id AND k.business_day_id = ${businessDayId}
    LEFT JOIN employees ae ON ae.id = k.approved_by
    LEFT JOIN users au ON au.id = ae.user_id
    WHERE e.role = 'clothier' AND (
      k.id IS NOT NULL OR (e.is_active AND (
        EXISTS (SELECT 1 FROM unit_reports r JOIN assignments a ON a.id = r.assignment_id
                WHERE a.employee_id = e.id AND r.business_day_id = ${businessDayId})
        OR EXISTS (
          SELECT 1 FROM assignments a
          JOIN pedido_line_cells c ON c.id = a.cell_id JOIN pedido_lines l ON l.id = c.line_id
          JOIN pedidos p ON p.id = l.pedido_id
          WHERE a.employee_id = e.id AND p.cancelled_at IS NULL
            AND a.quantity > coalesce((SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'), 0)
        )
      ))
    )
    ORDER BY (k.id IS NULL) DESC, (k.approved_at IS NULL) DESC, u.name
  `);
  return (
    rows.rows as {
      employee_id: string;
      name: string;
      closing_id: string | null;
      version: number;
      submitted_at: string;
      approved_at: string | null;
      correction_reason: string | null;
      submitted_units: number;
      lines: StoredClosingLine[];
      approved_by_name: string | null;
    }[]
  ).map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    closing: r.closing_id
      ? {
          id: r.closing_id,
          version: Number(r.version),
          submittedAt: new Date(r.submitted_at),
          approvedAt: r.approved_at ? new Date(r.approved_at) : null,
          approvedByName: r.approved_by_name,
          correctionReason: r.correction_reason,
          submittedUnits: Number(r.submitted_units),
          lines: r.lines ?? [],
        }
      : null,
  }));
}
