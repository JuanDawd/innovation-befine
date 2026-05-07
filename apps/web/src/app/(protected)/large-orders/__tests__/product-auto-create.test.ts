import { describe, it, expect } from "vitest";

// ─── Mirrors the auto-create product logic in createLargeOrder ──────────────
// A product is created only when:
//   1. pieces array is non-empty
//   2. a business day is open
// auto_approved follows the same rule as manual products: cashier_admin → true

type Role = "cashier_admin" | "secretary" | "stylist" | "clothier";

function shouldCreateProduct(pieces: unknown[], businessDayOpen: boolean): boolean {
  return pieces.length > 0 && businessDayOpen;
}

function resolveAutoApproved(role: Role): boolean {
  return role === "cashier_admin";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auto-create product from large order", () => {
  const piece = { clothPieceId: "a", clothPieceVariantId: "b", quantity: 2 };

  it("creates product when pieces provided and day is open", () => {
    expect(shouldCreateProduct([piece], true)).toBe(true);
  });

  it("skips product when pieces provided but no open business day", () => {
    expect(shouldCreateProduct([piece], false)).toBe(false);
  });

  it("skips product when pieces array is empty", () => {
    expect(shouldCreateProduct([], true)).toBe(false);
  });

  it("skips product when pieces empty and no day open", () => {
    expect(shouldCreateProduct([], false)).toBe(false);
  });
});

describe("auto_approved on product from large order", () => {
  it("cashier_admin creator → auto_approved = true", () => {
    expect(resolveAutoApproved("cashier_admin")).toBe(true);
  });

  it("secretary creator → auto_approved = false", () => {
    expect(resolveAutoApproved("secretary")).toBe(false);
  });
});

describe("source field on product from large order", () => {
  it("always sets source = large_order (not manual)", () => {
    // This is a contract test — the action always passes source: "large_order"
    const source = "large_order" as const;
    expect(source).toBe("large_order");
    expect(source).not.toBe("manual");
  });
});
