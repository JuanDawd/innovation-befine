import { describe, it, expect } from "vitest";

// ─── Pure-logic mirrors of assignment action invariants ────────────────────────
//
// These functions mirror the guard logic inside createAssignment,
// updateCompletedQuantity, and approveAssignmentQuantity server actions
// without touching the database.

// Invariant 1: SUM(assignedQuantity) must not exceed orderItem.quantity
function checkAssignmentCapacity(
  itemQuantity: number,
  currentAssigned: number,
  newAssignedQuantity: number,
): "ok" | "CONFLICT" {
  if (currentAssigned + newAssignedQuantity > itemQuantity) return "CONFLICT";
  return "ok";
}

function remainingAfterAssignment(
  itemQuantity: number,
  currentAssigned: number,
  newAssignedQuantity: number,
): number {
  return itemQuantity - currentAssigned - newAssignedQuantity;
}

// Invariant 2: completedQuantity must not exceed assignedQuantity
function checkCompletedQuantity(
  assignedQuantity: number,
  completedQuantity: number,
): "ok" | "VALIDATION_ERROR" {
  if (completedQuantity > assignedQuantity) return "VALIDATION_ERROR";
  return "ok";
}

// Invariant 3: approvedQuantity must not exceed completedQuantity
function checkApprovedQuantity(
  completedQuantity: number,
  approvedQuantity: number,
): "ok" | "VALIDATION_ERROR" {
  if (approvedQuantity > completedQuantity) return "VALIDATION_ERROR";
  return "ok";
}

// ─── Invariant 1: assigned_quantity <= order_item.quantity ────────────────────

describe("checkAssignmentCapacity — SUM(assigned) <= item.quantity", () => {
  it("assigns exactly the full quantity → ok", () => {
    expect(checkAssignmentCapacity(10, 0, 10)).toBe("ok");
  });

  it("assigns partial quantity → ok", () => {
    expect(checkAssignmentCapacity(10, 4, 3)).toBe("ok");
  });

  it("assigns remaining after partial → ok (boundary)", () => {
    expect(checkAssignmentCapacity(10, 7, 3)).toBe("ok");
  });

  it("one unit over the limit → CONFLICT", () => {
    expect(checkAssignmentCapacity(10, 7, 4)).toBe("CONFLICT");
  });

  it("far over the limit → CONFLICT", () => {
    expect(checkAssignmentCapacity(10, 0, 15)).toBe("CONFLICT");
  });

  it("multiple assignments that together exactly fill → ok", () => {
    // Simulate three sequential assignments: 3 + 3 + 4 = 10
    expect(checkAssignmentCapacity(10, 0, 3)).toBe("ok");
    expect(checkAssignmentCapacity(10, 3, 3)).toBe("ok");
    expect(checkAssignmentCapacity(10, 6, 4)).toBe("ok");
  });

  it("duplicate call with same quantities → CONFLICT (over-assignment)", () => {
    // First assignment: 5 of 10 assigned
    // Duplicate call also tries to assign 5 more: 5+5=10 fits (ok)
    // But if 10 already assigned and you try 1 more: CONFLICT
    expect(checkAssignmentCapacity(10, 10, 1)).toBe("CONFLICT");
  });

  it("zero-quantity assignment → ok (edge: 0 never conflicts)", () => {
    // 0 is an invalid input at the Zod layer (min: 1), but the pure logic is safe
    expect(checkAssignmentCapacity(10, 10, 0)).toBe("ok");
  });
});

describe("remainingAfterAssignment", () => {
  it("returns correct remaining units", () => {
    expect(remainingAfterAssignment(10, 3, 4)).toBe(3);
  });

  it("returns 0 when fully assigned", () => {
    expect(remainingAfterAssignment(10, 6, 4)).toBe(0);
  });
});

// ─── Invariant 2: completed_quantity <= assigned_quantity ─────────────────────

describe("checkCompletedQuantity — completed <= assigned", () => {
  it("completed equals assigned → ok (boundary)", () => {
    expect(checkCompletedQuantity(5, 5)).toBe("ok");
  });

  it("completed below assigned → ok", () => {
    expect(checkCompletedQuantity(5, 3)).toBe("ok");
  });

  it("completed = 0 → ok", () => {
    expect(checkCompletedQuantity(5, 0)).toBe("ok");
  });

  it("completed one above assigned → VALIDATION_ERROR", () => {
    expect(checkCompletedQuantity(5, 6)).toBe("VALIDATION_ERROR");
  });

  it("completed far above assigned → VALIDATION_ERROR", () => {
    expect(checkCompletedQuantity(2, 100)).toBe("VALIDATION_ERROR");
  });
});

// ─── Invariant 3: approved_quantity <= completed_quantity ─────────────────────

describe("checkApprovedQuantity — approved <= completed", () => {
  it("approved equals completed → ok (boundary)", () => {
    expect(checkApprovedQuantity(5, 5)).toBe("ok");
  });

  it("approved below completed → ok", () => {
    expect(checkApprovedQuantity(5, 3)).toBe("ok");
  });

  it("approved = 0 → ok", () => {
    expect(checkApprovedQuantity(5, 0)).toBe("ok");
  });

  it("approved one above completed → VALIDATION_ERROR", () => {
    expect(checkApprovedQuantity(5, 6)).toBe("VALIDATION_ERROR");
  });

  it("approved far above completed → VALIDATION_ERROR", () => {
    expect(checkApprovedQuantity(0, 3)).toBe("VALIDATION_ERROR");
  });
});

// ─── Invariant chain: assigned → completed → approved ────────────────────────

describe("full invariant chain", () => {
  it("valid lifecycle: assign 8, complete 6, approve 6", () => {
    expect(checkAssignmentCapacity(10, 2, 8)).toBe("ok");
    expect(checkCompletedQuantity(8, 6)).toBe("ok");
    expect(checkApprovedQuantity(6, 6)).toBe("ok");
  });

  it("trying to approve more than completed fails even if within assigned", () => {
    // assigned=8, completed=4, want to approve=5
    expect(checkCompletedQuantity(8, 4)).toBe("ok");
    expect(checkApprovedQuantity(4, 5)).toBe("VALIDATION_ERROR");
  });

  it("trying to complete more than assigned fails even if within item quantity", () => {
    // item_quantity=10, assigned=3, want completed=5
    expect(checkCompletedQuantity(3, 5)).toBe("VALIDATION_ERROR");
  });
});
