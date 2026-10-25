import { describe, it, expect } from "vitest";
import {
  lineIsStarted,
  minimumQuantity,
  planPedidoEdit,
  type ExistingCell,
  type ExistingGarmentLine,
  type PlannedGarmentLine,
} from "../pedido-edit-plan";

const S = "size-s";
const M = "size-m";

function cell(over: Partial<ExistingCell> & { id: string }): ExistingCell {
  return {
    sizeId: S,
    sizeOther: null,
    label: "S",
    quantity: 10,
    assigned: 0,
    approved: 0,
    delivered: 0,
    hasHistory: false,
    ...over,
  };
}

function line(cells: ExistingCell[], over: Partial<ExistingGarmentLine> = {}): ExistingGarmentLine {
  return {
    id: "line-1",
    kind: "garment",
    clothPieceVariantId: "variant-1",
    colorId: "rojo",
    colorOther: null,
    style: "tiro alto",
    instructions: null,
    unitPrice: 45_000,
    priceReason: null,
    cells,
    ...over,
  };
}

function next(
  from: ExistingGarmentLine,
  over: Partial<PlannedGarmentLine> = {},
): PlannedGarmentLine {
  return {
    kind: "garment",
    id: from.id,
    clothPieceVariantId: from.clothPieceVariantId,
    colorId: from.colorId,
    colorOther: from.colorOther,
    style: from.style,
    instructions: from.instructions,
    unitPrice: from.unitPrice,
    priceReason: from.priceReason,
    cells: from.cells.map((c) => ({
      sizeId: c.sizeId,
      sizeOther: c.sizeOther,
      quantity: c.quantity,
    })),
    ...over,
  };
}

const worked = line([
  cell({
    id: "c-s",
    sizeId: S,
    label: "S",
    quantity: 10,
    assigned: 6,
    approved: 4,
    delivered: 2,
    hasHistory: true,
  }),
  cell({ id: "c-m", sizeId: M, label: "M", quantity: 5 }),
]);

describe("minimumQuantity / lineIsStarted", () => {
  it("is the largest of assigned, approved and delivered", () => {
    expect(minimumQuantity(cell({ id: "x", assigned: 3, approved: 5, delivered: 1 }))).toBe(5);
    expect(lineIsStarted(worked)).toBe(true);
    expect(lineIsStarted(line([cell({ id: "x" })]))).toBe(false);
  });
});

describe("planPedidoEdit", () => {
  it("always allows increases; the extra units start unassigned", () => {
    const r = planPedidoEdit(
      [worked],
      [
        next(worked, {
          cells: [
            { sizeId: S, sizeOther: null, quantity: 14 },
            { sizeId: M, sizeOther: null, quantity: 5 },
          ],
        }),
      ],
    );
    expect(r).toEqual({
      ok: true,
      plan: expect.objectContaining({ updateCells: [{ id: "c-s", quantity: 14 }] }),
    });
  });

  it("allows decreasing down to the assigned units", () => {
    const r = planPedidoEdit(
      [worked],
      [
        next(worked, {
          cells: [
            { sizeId: S, sizeOther: null, quantity: 6 },
            { sizeId: M, sizeOther: null, quantity: 1 },
          ],
        }),
      ],
    );
    expect(r.ok && r.plan.updateCells).toEqual([
      { id: "c-s", quantity: 6 },
      { id: "c-m", quantity: 1 },
    ]);
  });

  it("rejects a decrease below assigned units with a clear message", () => {
    const r = planPedidoEdit(
      [worked],
      [
        next(worked, {
          cells: [
            { sizeId: S, sizeOther: null, quantity: 5 },
            { sizeId: M, sizeOther: null, quantity: 5 },
          ],
        }),
      ],
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        {
          field: "lines.0.cells",
          message: "La talla S no puede bajar de 6 (6 ya asignadas). Libera o reasigna primero.",
        },
      ],
    });
  });

  it("names approved or delivered units when they set the minimum", () => {
    const approvedLine = line([cell({ id: "c", assigned: 0, approved: 7, hasHistory: true })]);
    const r1 = planPedidoEdit(
      [approvedLine],
      [next(approvedLine, { cells: [{ sizeId: S, sizeOther: null, quantity: 3 }] })],
    );
    expect(!r1.ok && r1.errors[0]!.message).toMatch(/7 ya aprobadas/);
    const deliveredLine = line([
      cell({ id: "c", assigned: 8, approved: 8, delivered: 8, hasHistory: true }),
    ]);
    const r2 = planPedidoEdit(
      [deliveredLine],
      [next(deliveredLine, { cells: [{ sizeId: S, sizeOther: null, quantity: 3 }] })],
    );
    expect(!r2.ok && r2.errors[0]!.message).toMatch(/8 ya entregadas/);
  });

  it("removes an untouched size but not a worked one", () => {
    const ok = planPedidoEdit(
      [worked],
      [next(worked, { cells: [{ sizeId: S, sizeOther: null, quantity: 10 }] })],
    );
    expect(ok.ok && ok.plan.deleteCellIds).toEqual(["c-m"]);
    const bad = planPedidoEdit(
      [worked],
      [next(worked, { cells: [{ sizeId: M, sizeOther: null, quantity: 5 }] })],
    );
    expect(!bad.ok && bad.errors[0]!.message).toMatch(/La talla S ya tiene unidades trabajadas/);
  });

  it("does not let a fully-scrapped size be removed (it has history)", () => {
    const scrapped = line([cell({ id: "c", assigned: 0, hasHistory: true })]);
    const r = planPedidoEdit([scrapped], [next(scrapped, { cells: [] })]);
    expect(r.ok).toBe(false);
  });

  it("adds new sizes and matches free-text sizes case-insensitively", () => {
    const withOther = line([
      cell({ id: "c-u", sizeId: null, sizeOther: "Única", label: "Única", quantity: 2 }),
    ]);
    const r = planPedidoEdit(
      [withOther],
      [
        next(withOther, {
          cells: [
            { sizeId: null, sizeOther: "única", quantity: 3 },
            { sizeId: M, sizeOther: null, quantity: 4 },
          ],
        }),
      ],
    );
    expect(r.ok && r.plan).toMatchObject({
      updateCells: [{ id: "c-u", quantity: 3 }],
      insertCells: [{ lineId: "line-1", sizeId: M, sizeOther: null, quantity: 4 }],
      deleteCellIds: [],
    });
  });

  it("removes a line only while nothing on it was worked", () => {
    const fresh = line([cell({ id: "c" })], { id: "line-2" });
    const r = planPedidoEdit([worked, fresh], [next(worked)]);
    expect(r.ok && r.plan).toMatchObject({ deleteLineIds: ["line-2"], deleteCellIds: ["c"] });
    const bad = planPedidoEdit([worked, fresh], [next(fresh)]);
    expect(!bad.ok && bad.errors[0]!.message).toMatch(/No se puede quitar una prenda/);
  });

  it("blocks changing the garment of a started line", () => {
    const r = planPedidoEdit([worked], [next(worked, { clothPieceVariantId: "variant-2" })]);
    expect(!r.ok && r.errors[0]!.field).toBe("lines.0.clothPieceVariantId");
    const fresh = line([cell({ id: "c" })]);
    expect(planPedidoEdit([fresh], [next(fresh, { clothPieceVariantId: "variant-2" })]).ok).toBe(
      true,
    );
  });

  it("requires a reason for spec changes on a started line and describes them", () => {
    const missing = planPedidoEdit([worked], [next(worked, { colorId: "azul" })]);
    expect(!missing.ok && missing.errors[0]!.field).toBe("lines.0.changeReason");

    const names: Record<string, string> = { rojo: "Rojo", azul: "Azul" };
    const ok = planPedidoEdit(
      [worked],
      [
        next(worked, {
          colorId: "azul",
          style: "tiro bajo",
          instructions: "doble costura",
          changeReason: "la clienta cambió de idea",
        }),
      ],
      (id, other) => other ?? (id ? names[id]! : "sin color"),
    );
    expect(ok.ok && ok.plan.updateLines[0]!.specChange).toEqual({
      summary: "color Rojo → Azul, estilo «tiro alto» → «tiro bajo», instrucciones",
      reason: "la clienta cambió de idea",
    });
  });

  it("needs no reason for spec changes before production", () => {
    const fresh = line([cell({ id: "c" })]);
    const r = planPedidoEdit([fresh], [next(fresh, { colorId: "azul" })]);
    expect(r.ok && r.plan.updateLines[0]!.specChange).toBeNull();
  });

  it("inserts new lines and updates adjustments", () => {
    const adj = { id: "adj", kind: "adjustment" as const, amount: -5000, priceReason: "x" };
    const r = planPedidoEdit(
      [worked, adj],
      [
        next(worked),
        { kind: "adjustment", id: "adj", amount: -8000, priceReason: "volumen" },
        {
          kind: "garment",
          clothPieceVariantId: "v",
          colorId: null,
          colorOther: null,
          style: null,
          instructions: null,
          unitPrice: 1,
          priceReason: null,
          cells: [],
        },
      ],
    );
    expect(r.ok && r.plan.insertLines).toHaveLength(1);
    expect(r.ok && r.plan.updateLines.map((u) => u.id)).toEqual(["line-1", "adj"]);
  });

  it("rejects a line whose kind changed", () => {
    const adj = { id: "adj", kind: "adjustment" as const, amount: -5000, priceReason: "x" };
    const r = planPedidoEdit([adj], [next(line([], { id: "adj" }))]);
    expect(!r.ok && r.errors[0]!.field).toBe("lines.0");
  });

  it("collects every problem at once", () => {
    const r = planPedidoEdit(
      [worked],
      [
        next(worked, {
          colorId: "azul",
          cells: [{ sizeId: S, sizeOther: null, quantity: 1 }],
        }),
      ],
    );
    expect(!r.ok && r.errors.length).toBeGreaterThanOrEqual(1);
  });
});
