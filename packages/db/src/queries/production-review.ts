/**
 * Producción review queue — T124 (spec §3.2.10, §3.10)
 *
 * Reported units waiting for a decision, grouped by clothier. "Pending" is
 * reported (first time + rework) minus reviewed (approved + returned +
 * scrapped) on each assignment — the same rule the DB triggers enforce.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../index";

export type ReviewItem = {
  assignmentId: string;
  pedidoId: string;
  pedidoNumber: number;
  destination: "client" | "inventory";
  garment: string;
  color: string | null;
  sizeLabel: string;
  pending: number;
  /** A correction (returned units) was re-reported since the last review */
  includesRework: boolean;
  /** When the oldest unreviewed report came in */
  reportedAt: Date;
};

export type ReviewGroup = {
  employeeId: string;
  clothierName: string;
  pending: number;
  items: ReviewItem[];
};

export async function getReviewQueue(db: Database): Promise<ReviewGroup[]> {
  const rows = await db.execute(sql`
    WITH rep AS (
      SELECT assignment_id, sum(quantity) AS reported, min(created_at) AS first_at
      FROM unit_reports GROUP BY assignment_id
    ),
    rev AS (
      SELECT assignment_id, sum(approved + returned + scrapped) AS reviewed, max(created_at) AS last_at
      FROM unit_reviews GROUP BY assignment_id
    )
    SELECT a.id AS assignment_id, a.employee_id, u.name AS clothier_name,
      p.id AS pedido_id, p.number AS pedido_number, p.destination,
      cp.name || ' — ' || v.name AS garment,
      coalesce(gc.label, l.color_other) AS color,
      coalesce(gs.label, c.size_other) AS size_label,
      (rep.reported - coalesce(rev.reviewed, 0))::int AS pending,
      EXISTS (
        SELECT 1 FROM unit_reports r
        WHERE r.assignment_id = a.id AND r.kind = 'rework'
          AND (rev.last_at IS NULL OR r.created_at >= rev.last_at)
      ) AS includes_rework,
      coalesce(rev.last_at, rep.first_at) AS since
    FROM assignments a
    JOIN rep ON rep.assignment_id = a.id
    LEFT JOIN rev ON rev.assignment_id = a.id
    JOIN employees e ON e.id = a.employee_id
    JOIN users u ON u.id = e.user_id
    JOIN pedido_line_cells c ON c.id = a.cell_id
    JOIN pedido_lines l ON l.id = c.line_id
    JOIN pedidos p ON p.id = l.pedido_id
    JOIN cloth_piece_variants v ON v.id = l.cloth_piece_variant_id
    JOIN cloth_pieces cp ON cp.id = v.cloth_piece_id
    LEFT JOIN garment_sizes gs ON gs.id = c.size_id
    LEFT JOIN garment_colors gc ON gc.id = l.color_id
    WHERE rep.reported - coalesce(rev.reviewed, 0) > 0
    ORDER BY u.name, since, p.number
  `);

  const groups = new Map<string, ReviewGroup>();
  for (const r of rows.rows as {
    assignment_id: string;
    employee_id: string;
    clothier_name: string;
    pedido_id: string;
    pedido_number: number;
    destination: "client" | "inventory";
    garment: string;
    color: string | null;
    size_label: string;
    pending: number;
    includes_rework: boolean;
    since: string;
  }[]) {
    const pending = Number(r.pending);
    const group = groups.get(r.employee_id) ?? {
      employeeId: r.employee_id,
      clothierName: r.clothier_name,
      pending: 0,
      items: [],
    };
    group.pending += pending;
    group.items.push({
      assignmentId: r.assignment_id,
      pedidoId: r.pedido_id,
      pedidoNumber: Number(r.pedido_number),
      destination: r.destination,
      garment: r.garment,
      color: r.color,
      sizeLabel: r.size_label,
      pending,
      includesRework: Boolean(r.includes_rework),
      reportedAt: new Date(r.since),
    });
    groups.set(r.employee_id, group);
  }
  return [...groups.values()];
}
