/**
 * Pedido edit planner — T119 (spec §3.4.16)
 *
 * Diffs the stored pedido against the submitted lines and returns either the
 * writes to make or the reasons the edit is not allowed. Pure, so every rule
 * is unit-tested without a database:
 *
 * - Increase a quantity: always; the extra units start unassigned.
 * - Decrease: only down to the units already assigned / approved / delivered.
 * - Remove a size or a line: only if nothing on it was ever worked on.
 * - Change the garment of a line: only while nothing on it is assigned.
 * - Spec changes (colour, style, instructions) on a line with assigned units:
 *   need a reason; the assigned clothiers are notified.
 * - Price changes follow the price rules (reason, role) before reaching here.
 */

export type ExistingCell = {
  id: string;
  sizeId: string | null;
  sizeOther: string | null;
  label: string;
  quantity: number;
  /** Units held by clothiers (assignment quantity − scrapped) */
  assigned: number;
  approved: number;
  delivered: number;
  /** Any assignment with reports/reviews, or any delivery — the cell can't be deleted */
  hasHistory: boolean;
};

export type ExistingGarmentLine = {
  id: string;
  kind: "garment";
  clothPieceVariantId: string;
  colorId: string | null;
  colorOther: string | null;
  style: string | null;
  instructions: string | null;
  unitPrice: number;
  priceReason: string | null;
  cells: ExistingCell[];
};

export type ExistingAdjustmentLine = {
  id: string;
  kind: "adjustment";
  amount: number;
  priceReason: string;
};

export type ExistingLine = ExistingGarmentLine | ExistingAdjustmentLine;

export type PlannedGarmentLine = {
  kind: "garment";
  id?: string;
  clothPieceVariantId: string;
  colorId: string | null;
  colorOther: string | null;
  style: string | null;
  instructions: string | null;
  unitPrice: number;
  priceReason: string | null;
  changeReason?: string | null;
  cells: { sizeId: string | null; sizeOther: string | null; quantity: number }[];
};

export type PlannedAdjustmentLine = {
  kind: "adjustment";
  id?: string;
  amount: number;
  priceReason: string;
};

export type PlannedLine = PlannedGarmentLine | PlannedAdjustmentLine;

export type EditPlan = {
  deleteLineIds: string[];
  deleteCellIds: string[];
  updateLines: {
    id: string;
    position: number;
    line: PlannedLine;
    /** Set when a worked-on line's specs changed: shown to its clothiers */
    specChange: { summary: string; reason: string } | null;
  }[];
  updateCells: { id: string; quantity: number }[];
  insertCells: {
    lineId: string;
    sizeId: string | null;
    sizeOther: string | null;
    quantity: number;
  }[];
  insertLines: { position: number; line: PlannedLine }[];
};

export type PlanError = { field: string; message: string };

const sizeKey = (c: { sizeId: string | null; sizeOther: string | null }) =>
  c.sizeId ?? `other:${(c.sizeOther ?? "").trim().toLowerCase()}`;

/** Fewest units a cell can have: what is assigned, approved or delivered. */
export function minimumQuantity(cell: ExistingCell): number {
  return Math.max(cell.assigned, cell.approved, cell.delivered);
}

export function lineIsStarted(line: ExistingGarmentLine): boolean {
  return line.cells.some((c) => minimumQuantity(c) > 0);
}

function describeSpecChange(
  before: ExistingGarmentLine,
  after: PlannedGarmentLine,
  colorName: (id: string | null, other: string | null) => string,
) {
  const parts: string[] = [];
  if (
    before.colorId !== after.colorId ||
    (before.colorOther ?? null) !== (after.colorOther ?? null)
  )
    parts.push(
      `color ${colorName(before.colorId, before.colorOther)} → ${colorName(after.colorId, after.colorOther)}`,
    );
  if ((before.style ?? "") !== (after.style ?? ""))
    parts.push(`estilo «${before.style ?? "—"}» → «${after.style ?? "—"}»`);
  if ((before.instructions ?? "") !== (after.instructions ?? "")) parts.push("instrucciones");
  return parts;
}

export function planPedidoEdit(
  existing: ExistingLine[],
  next: PlannedLine[],
  colorName: (id: string | null, other: string | null) => string = (id, other) =>
    other ?? id ?? "sin color",
): { ok: true; plan: EditPlan } | { ok: false; errors: PlanError[] } {
  const errors: PlanError[] = [];
  const plan: EditPlan = {
    deleteLineIds: [],
    deleteCellIds: [],
    updateLines: [],
    updateCells: [],
    insertCells: [],
    insertLines: [],
  };
  const byId = new Map(existing.map((l) => [l.id, l]));
  const kept = new Set(next.flatMap((l) => (l.id ? [l.id] : [])));

  // Lines that disappear
  for (const line of existing) {
    if (kept.has(line.id)) continue;
    if (line.kind === "garment" && line.cells.some((c) => minimumQuantity(c) > 0 || c.hasHistory)) {
      errors.push({
        field: "lines",
        message: "No se puede quitar una prenda que ya tiene unidades asignadas o trabajadas.",
      });
      continue;
    }
    plan.deleteLineIds.push(line.id);
    if (line.kind === "garment") plan.deleteCellIds.push(...line.cells.map((c) => c.id));
  }

  next.forEach((line, position) => {
    const prev = line.id ? byId.get(line.id) : undefined;
    if (!prev) {
      plan.insertLines.push({ position, line });
      return;
    }
    if (prev.kind !== line.kind) {
      errors.push({
        field: `lines.${position}`,
        message: "La línea ya no existe. Recarga el pedido.",
      });
      return;
    }
    if (prev.kind === "adjustment" || line.kind === "adjustment") {
      plan.updateLines.push({ id: prev.id, position, line, specChange: null });
      return;
    }

    const started = lineIsStarted(prev);
    if (started && prev.clothPieceVariantId !== line.clothPieceVariantId) {
      errors.push({
        field: `lines.${position}.clothPieceVariantId`,
        message: "No se puede cambiar la prenda: ya tiene unidades asignadas.",
      });
      return;
    }

    let specChange: { summary: string; reason: string } | null = null;
    const changed = describeSpecChange(prev, line, colorName);
    if (started && changed.length) {
      const reason = line.changeReason?.trim();
      if (!reason) {
        errors.push({
          field: `lines.${position}.changeReason`,
          message: "Esta prenda ya está en producción: escribe el motivo del cambio.",
        });
        return;
      }
      specChange = { summary: changed.join(", "), reason };
    }

    // Cells: match by size
    const prevCells = new Map(prev.cells.map((c) => [sizeKey(c), c]));
    const nextKeys = new Set(line.cells.map(sizeKey));
    for (const cell of prev.cells) {
      if (nextKeys.has(sizeKey(cell))) continue;
      if (minimumQuantity(cell) > 0 || cell.hasHistory) {
        errors.push({
          field: `lines.${position}.cells`,
          message: `La talla ${cell.label} ya tiene unidades trabajadas: baja la cantidad en vez de quitarla.`,
        });
        continue;
      }
      plan.deleteCellIds.push(cell.id);
    }
    for (const cell of line.cells) {
      const before = prevCells.get(sizeKey(cell));
      if (!before) {
        plan.insertCells.push({ lineId: prev.id, ...cell });
        continue;
      }
      const min = minimumQuantity(before);
      if (cell.quantity < min) {
        const why =
          before.delivered >= min
            ? `${before.delivered} ya entregadas`
            : before.approved >= min
              ? `${before.approved} ya aprobadas`
              : `${before.assigned} ya asignadas`;
        errors.push({
          field: `lines.${position}.cells`,
          message: `La talla ${before.label} no puede bajar de ${min} (${why}). Libera o reasigna primero.`,
        });
        continue;
      }
      if (cell.quantity !== before.quantity)
        plan.updateCells.push({ id: before.id, quantity: cell.quantity });
    }

    plan.updateLines.push({ id: prev.id, position, line, specChange });
  });

  return errors.length ? { ok: false, errors } : { ok: true, plan };
}
