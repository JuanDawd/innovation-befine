/**
 * "Liquidar" gate for clothiers — T126 (spec §3.2.12)
 *
 * A clothier's day can be settled only when her closing for that day was
 * submitted AND approved. Days she did not work on (no reports, no reviewed
 * units, no closing) do not need one.
 */

import { sql } from "drizzle-orm";
import type { Database } from "@befine/db";

export type ClosingBlock = {
  businessDayId: string;
  /** Bogotá date of the day, YYYY-MM-DD */
  date: string;
  state: "missing" | "pending";
};

export async function clothierClosingBlocks(
  db: Database,
  employeeId: string,
  businessDayIds: string[],
): Promise<ClosingBlock[]> {
  if (!businessDayIds.length) return [];
  const ids = sql.join(
    businessDayIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    SELECT d.id, to_char(d.opened_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS date,
      k.id AS closing_id, k.approved_at
    FROM business_days d
    LEFT JOIN clothier_day_closings k ON k.business_day_id = d.id AND k.employee_id = ${employeeId}
    WHERE d.id IN (${ids})
      AND (
        k.id IS NOT NULL
        OR EXISTS (SELECT 1 FROM unit_reports r JOIN assignments a ON a.id = r.assignment_id
                   WHERE a.employee_id = ${employeeId} AND r.business_day_id = d.id)
        OR EXISTS (SELECT 1 FROM unit_reviews v JOIN assignments a ON a.id = v.assignment_id
                   WHERE a.employee_id = ${employeeId} AND v.business_day_id = d.id)
      )
    ORDER BY d.opened_at
  `);
  return (
    rows.rows as {
      id: string;
      date: string;
      closing_id: string | null;
      approved_at: string | null;
    }[]
  ).flatMap((r) =>
    r.approved_at
      ? []
      : [
          {
            businessDayId: r.id,
            date: r.date,
            state: r.closing_id ? "pending" : "missing",
          } as const,
        ],
  );
}

/** "Luz no ha cerrado su jornada del 24 de oct" — the reason shown on Liquidar. */
export function closingBlockMessage(name: string, blocks: ClosingBlock[]): string | null {
  if (!blocks.length) return null;
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const missing = blocks.filter((b) => b.state === "missing").map((b) => fmt(b.date));
  const pending = blocks.filter((b) => b.state === "pending").map((b) => fmt(b.date));
  const parts = [
    missing.length ? `${name} no ha cerrado su jornada del ${missing.join(", ")}` : null,
    pending.length
      ? `${missing.length ? "y" : name} tiene el cierre del ${pending.join(", ")} sin aprobar`
      : null,
  ].filter(Boolean);
  return `${parts.join(" ")}. Apruébalo en Producción → Cierres antes de liquidar.`;
}
