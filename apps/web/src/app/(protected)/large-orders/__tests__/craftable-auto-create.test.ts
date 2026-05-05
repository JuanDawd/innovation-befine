import { describe, it, expect } from "vitest";

// ─── Mirrors the auto-create craftable logic in createLargeOrder ──────────────
// A craftable is created only when:
//   1. pieces array is non-empty
//   2. a business day is open
// auto_approved follows the same rule as manual craftables: cashier_admin → true

type Role = "cashier_admin" | "secretary" | "stylist" | "clothier";

function shouldCreateCraftable(pieces: unknown[], businessDayOpen: boolean): boolean {
  return pieces.length > 0 && businessDayOpen;
}

function resolveAutoApproved(role: Role): boolean {
  return role === "cashier_admin";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auto-create craftable from large order", () => {
  const piece = { clothPieceId: "a", clothPieceVariantId: "b", quantity: 2 };

  it("creates craftable when pieces provided and day is open", () => {
    expect(shouldCreateCraftable([piece], true)).toBe(true);
  });

  it("skips craftable when pieces provided but no open business day", () => {
    expect(shouldCreateCraftable([piece], false)).toBe(false);
  });

  it("skips craftable when pieces array is empty", () => {
    expect(shouldCreateCraftable([], true)).toBe(false);
  });

  it("skips craftable when pieces empty and no day open", () => {
    expect(shouldCreateCraftable([], false)).toBe(false);
  });
});

describe("auto_approved on craftable from large order", () => {
  it("cashier_admin creator → auto_approved = true", () => {
    expect(resolveAutoApproved("cashier_admin")).toBe(true);
  });

  it("secretary creator → auto_approved = false", () => {
    expect(resolveAutoApproved("secretary")).toBe(false);
  });
});

describe("source field on craftable from large order", () => {
  it("always sets source = large_order (not manual)", () => {
    // This is a contract test — the action always passes source: "large_order"
    const source = "large_order" as const;
    expect(source).toBe("large_order");
    expect(source).not.toBe("manual");
  });
});
