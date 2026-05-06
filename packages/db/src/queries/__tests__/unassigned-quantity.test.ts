import { describe, it, expect } from "vitest";

// ─── Pure-logic mirror of getUnassignedQuantity ────────────────────────────────

function computeUnassignedQuantity(itemQuantity: number, totalAssigned: number): number {
  const unassigned = itemQuantity - totalAssigned;
  if (unassigned < 0) return 0; // anomaly guard: never return negative
  return unassigned;
}

// ─── Pure-logic mirror of the "synthetic unassigned row" in getAssignmentProgress ──

function computeUnassignedRow(itemQuantity: number, assignments: { assignedQuantity: number }[]) {
  const totalAssigned = assignments.reduce((sum, a) => sum + a.assignedQuantity, 0);
  const unassigned = Math.max(0, itemQuantity - totalAssigned);
  return { unassigned, dataAnomaly: totalAssigned > itemQuantity };
}

// ─── getUnassignedQuantity tests ──────────────────────────────────────────────

describe("computeUnassignedQuantity — mirrors getUnassignedQuantity", () => {
  it("no assignments → full item quantity", () => {
    expect(computeUnassignedQuantity(10, 0)).toBe(10);
  });

  it("fully assigned → 0", () => {
    expect(computeUnassignedQuantity(10, 10)).toBe(0);
  });

  it("partially assigned → correct remainder", () => {
    expect(computeUnassignedQuantity(10, 4)).toBe(6);
  });

  it("anomaly: assigned exceeds quantity → 0 (never negative)", () => {
    expect(computeUnassignedQuantity(10, 12)).toBe(0);
  });
});

// ─── getAssignmentProgress: unassigned row and data anomaly ──────────────────

describe("computeUnassignedRow — synthetic unassigned row in getAssignmentProgress", () => {
  it("no assignments → unassigned equals full item quantity", () => {
    const { unassigned, dataAnomaly } = computeUnassignedRow(10, []);
    expect(unassigned).toBe(10);
    expect(dataAnomaly).toBe(false);
  });

  it("fully assigned → unassigned = 0, no anomaly", () => {
    const { unassigned, dataAnomaly } = computeUnassignedRow(10, [
      { assignedQuantity: 6 },
      { assignedQuantity: 4 },
    ]);
    expect(unassigned).toBe(0);
    expect(dataAnomaly).toBe(false);
  });

  it("partially assigned → correct remainder", () => {
    const { unassigned, dataAnomaly } = computeUnassignedRow(10, [
      { assignedQuantity: 3 },
      { assignedQuantity: 2 },
    ]);
    expect(unassigned).toBe(5);
    expect(dataAnomaly).toBe(false);
  });

  it("anomaly: SUM(assigned) > item.quantity → unassigned = 0, dataAnomaly = true", () => {
    const { unassigned, dataAnomaly } = computeUnassignedRow(10, [
      { assignedQuantity: 7 },
      { assignedQuantity: 5 },
    ]);
    expect(unassigned).toBe(0);
    expect(dataAnomaly).toBe(true);
  });
});
