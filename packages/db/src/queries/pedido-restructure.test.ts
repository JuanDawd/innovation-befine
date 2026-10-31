import { describe, expect, it } from "vitest";
import {
  planRestructureCell,
  type RestructureAssignment,
  type RestructureCell,
} from "./pedido-restructure";

const a = (over: Partial<RestructureAssignment> = {}): RestructureAssignment => ({
  id: "a1",
  employeeId: "e1",
  quantity: 0,
  movedOut: 0,
  reported: 0,
  rework: 0,
  approved: 0,
  returned: 0,
  scrapped: 0,
  ...over,
});
const cell = (over: Partial<RestructureCell> = {}): RestructureCell => ({
  cellId: "c1",
  label: "M",
  ordered: 10,
  delivered: 0,
  assignments: [],
  ...over,
});
const go = (c: RestructureCell, d: Partial<Parameters<typeof planRestructureCell>[1]>) =>
  planRestructureCell(c, { cellId: "c1", newQuantity: 5, toStock: 0, toScrap: 0, ...d });

describe("planRestructureCell", () => {
  it("moves approved undelivered units out, across clothiers", () => {
    const r = go(
      cell({
        assignments: [
          a({ id: "a1", quantity: 4, reported: 4, approved: 4 }),
          a({ id: "a2", quantity: 4, reported: 4, approved: 4 }),
        ],
      }),
      { newQuantity: 5, toStock: 2, toScrap: 1 },
    );
    expect(r.ok && r.cell.moves).toEqual([{ assignmentId: "a1", quantity: 3 }]);
  });

  it("refuses to leave more approved than ordered", () => {
    const r = go(cell({ assignments: [a({ quantity: 8, reported: 8, approved: 8 })] }), {
      newQuantity: 5,
      toStock: 1,
    });
    expect(r).toEqual({ ok: false, message: expect.stringContaining("Saca 2 más") });
  });

  it("never touches delivered units", () => {
    const c = cell({ delivered: 6, assignments: [a({ quantity: 8, reported: 8, approved: 8 })] });
    expect(go(c, { newQuantity: 6, toStock: 3 }).ok).toBe(false);
    expect(go(c, { newQuantity: 5, toStock: 2 }).ok).toBe(false);
    expect(go(c, { newQuantity: 6, toStock: 2 }).ok).toBe(true);
  });

  it("requires a decision on units waiting for review", () => {
    const c = cell({ assignments: [a({ quantity: 3, reported: 3 })] });
    expect(go(c, {}).ok).toBe(false);
  });

  it("approve-and-move pays the waiting units and takes them out", () => {
    const c = cell({ assignments: [a({ quantity: 3, reported: 3 })] });
    const r = go(c, { newQuantity: 1, toStock: 3, pendingAction: "approve" });
    expect(r.ok && r.cell.reviews).toEqual([{ assignmentId: "a1", approved: 3, rejected: 0 }]);
    expect(r.ok && r.cell.moves).toEqual([{ assignmentId: "a1", quantity: 3 }]);
  });

  it("rejected units are not paid and free their place", () => {
    const c = cell({ assignments: [a({ quantity: 3, reported: 3 })] });
    const r = go(c, { newQuantity: 1, pendingAction: "reject" });
    expect(r.ok && r.cell.reviews).toEqual([{ assignmentId: "a1", approved: 0, rejected: 3 }]);
    expect(r.ok && r.cell.releases).toEqual([]);
  });

  it("cancels only the unstarted units that no longer fit, last assigned first", () => {
    const r = go(
      cell({
        assignments: [
          a({ id: "a1", employeeId: "e1", quantity: 5 }),
          a({ id: "a2", employeeId: "e2", quantity: 3 }),
        ],
      }),
      { newQuantity: 4 },
    );
    expect(r.ok && r.cell.releases).toEqual([
      { assignmentId: "a2", employeeId: "e2", quantity: 3 },
      { assignmentId: "a1", employeeId: "e1", quantity: 1 },
    ]);
  });

  it("counts units an earlier restructure already moved", () => {
    const c = cell({ assignments: [a({ quantity: 5, reported: 5, approved: 5, movedOut: 4 })] });
    expect(go(c, { newQuantity: 1, toStock: 2 }).ok).toBe(false);
    const r = go(c, { newQuantity: 1, toStock: 1 });
    expect(r.ok && r.cell.before.approved).toBe(1);
  });

  it("blocks a cell with corrections in progress", () => {
    const c = cell({ assignments: [a({ quantity: 3, reported: 3, returned: 1, approved: 2 })] });
    expect(go(c, { newQuantity: 3 })).toEqual({
      ok: false,
      message: expect.stringContaining("correcciones"),
    });
  });
});
