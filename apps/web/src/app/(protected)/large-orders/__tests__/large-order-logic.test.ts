import { describe, it, expect } from "vitest";

// ─── Types mirrored from schema ───────────────────────────────────────────────

type LargeOrderStatus =
  | "pending"
  | "in_production"
  | "ready"
  | "delivered"
  | "paid_in_full"
  | "cancelled";

type LargeOrderAction =
  | "start_production"
  | "mark_ready"
  | "mark_delivered"
  | "mark_paid"
  | "cancel";

// ─── Pure transition logic (mirrors ALLOWED_TRANSITIONS in actions.ts) ────────

const ALLOWED_TRANSITIONS: Partial<
  Record<LargeOrderStatus, Partial<Record<LargeOrderAction, LargeOrderStatus>>>
> = {
  pending: { start_production: "in_production", cancel: "cancelled" },
  in_production: { mark_ready: "ready", cancel: "cancelled" },
  ready: { mark_delivered: "delivered", cancel: "cancelled" },
  delivered: { mark_paid: "paid_in_full", cancel: "cancelled" },
};

function transition(
  current: LargeOrderStatus,
  action: LargeOrderAction,
): LargeOrderStatus | "INVALID" | "TERMINAL" {
  if (current === "paid_in_full" || current === "cancelled") return "TERMINAL";
  const next = ALLOWED_TRANSITIONS[current]?.[action];
  return next ?? "INVALID";
}

// ─── Balance computation (mirrors recordLargeOrderPayment logic) ──────────────

function computeBalance(totalPrice: number, payments: number[]): number {
  const totalPaid = payments.reduce((s, p) => s + p, 0);
  return Math.max(0, totalPrice - totalPaid);
}

function shouldAutoTransitionToPaid(totalPrice: number, payments: number[]): boolean {
  const remaining = totalPrice - payments.reduce((s, p) => s + p, 0);
  return remaining <= 0;
}

function isOverpayment(
  totalPrice: number,
  existingPayments: number[],
  newPayment: number,
): boolean {
  const totalPaid = existingPayments.reduce((s, p) => s + p, 0);
  const remaining = totalPrice - totalPaid;
  return newPayment > remaining;
}

// ─── Cancellation reason requirement ─────────────────────────────────────────

function validateCancelAction(cancellationReason: string | undefined): boolean {
  return !!cancellationReason?.trim();
}

// ─── Status transitions × allowed actions ────────────────────────────────────

describe("LargeOrder status transitions", () => {
  it("pending → in_production via start_production", () => {
    expect(transition("pending", "start_production")).toBe("in_production");
  });

  it("in_production → ready via mark_ready", () => {
    expect(transition("in_production", "mark_ready")).toBe("ready");
  });

  it("ready → delivered via mark_delivered", () => {
    expect(transition("ready", "mark_delivered")).toBe("delivered");
  });

  it("delivered → paid_in_full via mark_paid", () => {
    expect(transition("delivered", "mark_paid")).toBe("paid_in_full");
  });

  it("cancel is reachable from any non-terminal status", () => {
    expect(transition("pending", "cancel")).toBe("cancelled");
    expect(transition("in_production", "cancel")).toBe("cancelled");
    expect(transition("ready", "cancel")).toBe("cancelled");
    expect(transition("delivered", "cancel")).toBe("cancelled");
  });

  it("paid_in_full is terminal — no transitions allowed", () => {
    expect(transition("paid_in_full", "cancel")).toBe("TERMINAL");
    expect(transition("paid_in_full", "mark_paid")).toBe("TERMINAL");
  });

  it("cancelled is terminal — no transitions allowed", () => {
    expect(transition("cancelled", "cancel")).toBe("TERMINAL");
    expect(transition("cancelled", "start_production")).toBe("TERMINAL");
  });

  it("reverse transitions are rejected (no backward movement)", () => {
    expect(transition("in_production", "start_production")).toBe("INVALID");
    expect(transition("delivered", "mark_ready")).toBe("INVALID");
    expect(transition("ready", "mark_paid")).toBe("INVALID");
  });

  it("invalid actions on valid statuses are rejected", () => {
    expect(transition("pending", "mark_paid")).toBe("INVALID");
    expect(transition("ready", "mark_paid")).toBe("INVALID");
  });
});

// ─── Cancellation reason ──────────────────────────────────────────────────────

describe("Cancel action — cancellation reason requirement", () => {
  it("accepts a non-empty reason", () => {
    expect(validateCancelAction("Cliente desistió")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateCancelAction("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateCancelAction("   ")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validateCancelAction(undefined)).toBe(false);
  });
});

// ─── Balance computation ──────────────────────────────────────────────────────

describe("Balance computation", () => {
  it("balance equals totalPrice with no payments", () => {
    expect(computeBalance(100_000, [])).toBe(100_000);
  });

  it("balance decreases with each payment", () => {
    expect(computeBalance(100_000, [30_000])).toBe(70_000);
    expect(computeBalance(100_000, [30_000, 40_000])).toBe(30_000);
  });

  it("balance is zero when fully paid", () => {
    expect(computeBalance(100_000, [100_000])).toBe(0);
    expect(computeBalance(100_000, [60_000, 40_000])).toBe(0);
  });

  it("balance clamps at zero — never negative (overpayment guard is upstream)", () => {
    expect(computeBalance(100_000, [120_000])).toBe(0);
  });

  it("works with integer pesos — no floating point artifacts", () => {
    expect(computeBalance(1_999_999, [999_999, 1_000_000])).toBe(0);
  });
});

// ─── Auto-transition to paid_in_full ─────────────────────────────────────────

describe("Auto-transition to paid_in_full", () => {
  it("triggers when payments exactly cover totalPrice", () => {
    expect(shouldAutoTransitionToPaid(100_000, [100_000])).toBe(true);
  });

  it("triggers when payments exceed totalPrice (clamped upstream)", () => {
    expect(shouldAutoTransitionToPaid(100_000, [120_000])).toBe(true);
  });

  it("does not trigger when balance remains", () => {
    expect(shouldAutoTransitionToPaid(100_000, [99_999])).toBe(false);
    expect(shouldAutoTransitionToPaid(100_000, [])).toBe(false);
  });
});

// ─── Overpayment guard ────────────────────────────────────────────────────────

describe("Overpayment guard", () => {
  it("rejects payment greater than remaining balance", () => {
    expect(isOverpayment(100_000, [60_000], 50_000)).toBe(true);
  });

  it("accepts payment equal to remaining balance", () => {
    expect(isOverpayment(100_000, [60_000], 40_000)).toBe(false);
  });

  it("accepts payment less than remaining balance", () => {
    expect(isOverpayment(100_000, [60_000], 30_000)).toBe(false);
  });

  it("rejects any payment when fully paid (remaining = 0)", () => {
    expect(isOverpayment(100_000, [100_000], 1)).toBe(true);
  });

  it("accepts first payment on a fresh order", () => {
    expect(isOverpayment(500_000, [], 200_000)).toBe(false);
  });

  it("integer pesos — no floating point artifacts", () => {
    expect(isOverpayment(1_500_000, [750_000], 750_001)).toBe(true);
    expect(isOverpayment(1_500_000, [750_000], 750_000)).toBe(false);
  });
});

// ─── Role gates ──────────────────────────────────────────────────────────────

describe("Role gates for large-order mutations", () => {
  type Role = "cashier_admin" | "secretary" | "stylist" | "clothier";

  function canWriteLargeOrder(role: Role): boolean {
    return role === "cashier_admin" || role === "secretary";
  }

  it("cashier_admin can write large orders", () => {
    expect(canWriteLargeOrder("cashier_admin")).toBe(true);
  });

  it("secretary can write large orders", () => {
    expect(canWriteLargeOrder("secretary")).toBe(true);
  });

  it("stylist cannot write large orders", () => {
    expect(canWriteLargeOrder("stylist")).toBe(false);
  });

  it("clothier cannot write large orders", () => {
    expect(canWriteLargeOrder("clothier")).toBe(false);
  });
});
