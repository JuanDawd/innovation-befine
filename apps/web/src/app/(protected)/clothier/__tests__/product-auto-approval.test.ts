import { describe, it, expect } from "vitest";

// ─── Auto-approval status resolution ─────────────────────────────────────────
// Mirrors the logic in markPieceDone (clothier/actions.ts):
// if the parent product has auto_approved=true, piece goes straight to "approved";
// otherwise it goes to "done_pending_approval".

type ProductPieceStatus = "pending" | "done_pending_approval" | "approved";

function resolveMarkDoneStatus(autoApproved: boolean): ProductPieceStatus {
  return autoApproved ? "approved" : "done_pending_approval";
}

// ─── RBAC guard for approveProductPiece ─────────────────────────────────────

type EmployeeRole = "cashier" | "admin" | "secretary" | "stylist" | "clothier";

function canApproveProductPiece(role: EmployeeRole): boolean {
  return role === "admin" || role === "secretary";
}

// ─── auto_approved flag at creation time ─────────────────────────────────────

function resolveAutoApproved(creatorRole: EmployeeRole): boolean {
  return creatorRole === "admin";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("product auto-approval status resolution", () => {
  it("auto_approved=true → piece goes directly to 'approved'", () => {
    expect(resolveMarkDoneStatus(true)).toBe("approved");
  });

  it("auto_approved=false → piece goes to 'done_pending_approval'", () => {
    expect(resolveMarkDoneStatus(false)).toBe("done_pending_approval");
  });
});

describe("auto_approved flag at product creation", () => {
  it("admin creator → auto_approved = true", () => {
    expect(resolveAutoApproved("admin")).toBe(true);
  });

  it("secretary creator → auto_approved = false", () => {
    expect(resolveAutoApproved("secretary")).toBe(false);
  });

  it("clothier creator → auto_approved = false", () => {
    expect(resolveAutoApproved("clothier")).toBe(false);
  });
});

describe("approveProductPiece RBAC guard", () => {
  it("admin can approve", () => {
    expect(canApproveProductPiece("admin")).toBe(true);
  });

  it("secretary can approve", () => {
    expect(canApproveProductPiece("secretary")).toBe(true);
  });

  it("stylist cannot approve → FORBIDDEN", () => {
    expect(canApproveProductPiece("stylist")).toBe(false);
  });

  it("clothier cannot approve → FORBIDDEN", () => {
    expect(canApproveProductPiece("clothier")).toBe(false);
  });
});
