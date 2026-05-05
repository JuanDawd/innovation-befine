import { describe, it, expect } from "vitest";

// ─── Auto-approval status resolution ─────────────────────────────────────────
// Mirrors the logic in markPieceDone (clothier/actions.ts):
// if the parent craftable has auto_approved=true, piece goes straight to "approved";
// otherwise it goes to "done_pending_approval".

type CraftablePieceStatus = "pending" | "done_pending_approval" | "approved";

function resolveMarkDoneStatus(autoApproved: boolean): CraftablePieceStatus {
  return autoApproved ? "approved" : "done_pending_approval";
}

// ─── RBAC guard for approveCraftablePiece ─────────────────────────────────────

type EmployeeRole = "cashier_admin" | "secretary" | "stylist" | "clothier";

function canApproveCraftablePiece(role: EmployeeRole): boolean {
  return role === "cashier_admin" || role === "secretary";
}

// ─── auto_approved flag at creation time ─────────────────────────────────────

function resolveAutoApproved(creatorRole: EmployeeRole): boolean {
  return creatorRole === "cashier_admin";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("craftable auto-approval status resolution", () => {
  it("auto_approved=true → piece goes directly to 'approved'", () => {
    expect(resolveMarkDoneStatus(true)).toBe("approved");
  });

  it("auto_approved=false → piece goes to 'done_pending_approval'", () => {
    expect(resolveMarkDoneStatus(false)).toBe("done_pending_approval");
  });
});

describe("auto_approved flag at craftable creation", () => {
  it("cashier_admin creator → auto_approved = true", () => {
    expect(resolveAutoApproved("cashier_admin")).toBe(true);
  });

  it("secretary creator → auto_approved = false", () => {
    expect(resolveAutoApproved("secretary")).toBe(false);
  });

  it("clothier creator → auto_approved = false", () => {
    expect(resolveAutoApproved("clothier")).toBe(false);
  });
});

describe("approveCraftablePiece RBAC guard", () => {
  it("cashier_admin can approve", () => {
    expect(canApproveCraftablePiece("cashier_admin")).toBe(true);
  });

  it("secretary can approve", () => {
    expect(canApproveCraftablePiece("secretary")).toBe(true);
  });

  it("stylist cannot approve → FORBIDDEN", () => {
    expect(canApproveCraftablePiece("stylist")).toBe(false);
  });

  it("clothier cannot approve → FORBIDDEN", () => {
    expect(canApproveCraftablePiece("clothier")).toBe(false);
  });
});
