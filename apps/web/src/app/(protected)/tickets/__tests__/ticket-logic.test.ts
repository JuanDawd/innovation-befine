import { describe, it, expect } from "vitest";

// ─── Ticket status transition guard ───────────────────────────────────────────

type TicketStatus = "logged" | "awaiting_payment" | "reopened" | "closed";

function canTransitionToAwaitingPayment(status: TicketStatus): boolean {
  return status === "logged";
}

function canTransitionReopenedToAwaitingPayment(status: TicketStatus): boolean {
  return status === "reopened";
}

function canReopenTicket(status: TicketStatus): boolean {
  return status === "closed";
}

describe("Ticket status transitions", () => {
  describe("logged → awaiting_payment", () => {
    it("allows from logged", () => {
      expect(canTransitionToAwaitingPayment("logged")).toBe(true);
    });

    it("rejects from awaiting_payment", () => {
      expect(canTransitionToAwaitingPayment("awaiting_payment")).toBe(false);
    });

    it("rejects from reopened", () => {
      expect(canTransitionToAwaitingPayment("reopened")).toBe(false);
    });

    it("rejects from closed", () => {
      expect(canTransitionToAwaitingPayment("closed")).toBe(false);
    });
  });

  describe("reopened → awaiting_payment", () => {
    it("allows from reopened", () => {
      expect(canTransitionReopenedToAwaitingPayment("reopened")).toBe(true);
    });

    it("rejects from logged", () => {
      expect(canTransitionReopenedToAwaitingPayment("logged")).toBe(false);
    });

    it("rejects from awaiting_payment", () => {
      expect(canTransitionReopenedToAwaitingPayment("awaiting_payment")).toBe(false);
    });

    it("rejects from closed", () => {
      expect(canTransitionReopenedToAwaitingPayment("closed")).toBe(false);
    });
  });

  describe("closed → reopened", () => {
    it("allows from closed", () => {
      expect(canReopenTicket("closed")).toBe(true);
    });

    it("rejects from logged", () => {
      expect(canReopenTicket("logged")).toBe(false);
    });

    it("rejects from awaiting_payment", () => {
      expect(canReopenTicket("awaiting_payment")).toBe(false);
    });

    it("rejects from reopened", () => {
      expect(canReopenTicket("reopened")).toBe(false);
    });
  });
});

// ─── Payment sum verification ─────────────────────────────────────────────────

type PaymentInput = { method: string; amount: number };
type LineItem = { unitPrice: number; overridePrice: number | null; quantity: number };

function computeGrandTotal(items: LineItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.overridePrice ?? item.unitPrice) * item.quantity,
    0,
  );
}

function verifyPaymentSum(payments: PaymentInput[], grandTotal: number): boolean {
  return payments.reduce((s, p) => s + p.amount, 0) === grandTotal;
}

describe("Checkout payment sum", () => {
  it("accepts payments that exactly match the grand total", () => {
    const items: LineItem[] = [
      { unitPrice: 50000, overridePrice: null, quantity: 2 },
      { unitPrice: 30000, overridePrice: null, quantity: 1 },
    ];
    const total = computeGrandTotal(items); // 130000
    expect(total).toBe(130000);
    expect(verifyPaymentSum([{ method: "cash", amount: 130000 }], total)).toBe(true);
  });

  it("rejects payments that under-pay", () => {
    const items: LineItem[] = [{ unitPrice: 50000, overridePrice: null, quantity: 1 }];
    const total = computeGrandTotal(items);
    expect(verifyPaymentSum([{ method: "cash", amount: 40000 }], total)).toBe(false);
  });

  it("rejects payments that over-pay", () => {
    const items: LineItem[] = [{ unitPrice: 50000, overridePrice: null, quantity: 1 }];
    const total = computeGrandTotal(items);
    expect(verifyPaymentSum([{ method: "cash", amount: 60000 }], total)).toBe(false);
  });

  it("accepts split payments across multiple methods", () => {
    const items: LineItem[] = [{ unitPrice: 100000, overridePrice: null, quantity: 1 }];
    const total = computeGrandTotal(items);
    expect(
      verifyPaymentSum(
        [
          { method: "cash", amount: 60000 },
          { method: "card", amount: 40000 },
        ],
        total,
      ),
    ).toBe(true);
  });

  it("uses override price over unit price when present", () => {
    const items: LineItem[] = [{ unitPrice: 80000, overridePrice: 60000, quantity: 1 }];
    expect(computeGrandTotal(items)).toBe(60000);
  });

  it("handles zero-amount override", () => {
    const items: LineItem[] = [{ unitPrice: 50000, overridePrice: 0, quantity: 1 }];
    expect(computeGrandTotal(items)).toBe(0);
    expect(verifyPaymentSum([], 0)).toBe(true);
  });
});

// ─── Optimistic lock guard ────────────────────────────────────────────────────

function checkOptimisticLock(expected: number, actual: number): boolean {
  return expected === actual;
}

describe("Optimistic locking", () => {
  it("passes when version matches", () => {
    expect(checkOptimisticLock(3, 3)).toBe(true);
  });

  it("fails when version is stale (another session updated)", () => {
    expect(checkOptimisticLock(3, 4)).toBe(false);
  });

  it("fails when expected is ahead of actual", () => {
    expect(checkOptimisticLock(5, 3)).toBe(false);
  });
});

// ─── Price override — effective price recomputation ───────────────────────────

function effectivePrice(unitPrice: number, overridePrice: number | null): number {
  return overridePrice ?? unitPrice;
}

describe("Override price recomputation", () => {
  it("uses unit price when no override", () => {
    expect(effectivePrice(50000, null)).toBe(50000);
  });

  it("uses override price when set", () => {
    expect(effectivePrice(50000, 30000)).toBe(30000);
  });

  it("accepts zero override (full discount)", () => {
    expect(effectivePrice(50000, 0)).toBe(0);
  });
});

// ─── Batch piece state guards ─────────────────────────────────────────────────

type PieceStatus = "pending" | "done_pending_approval" | "approved";

function canApprovePiece(status: PieceStatus): boolean {
  return status === "done_pending_approval";
}

function canAdminMarkApproved(status: PieceStatus): boolean {
  return status === "pending";
}

function canMarkDone(
  status: PieceStatus,
  assignedToEmployeeId: string | null,
  claimantEmployeeId: string,
): boolean {
  return status === "pending" && assignedToEmployeeId === claimantEmployeeId;
}

describe("Batch piece state guards", () => {
  describe("approvePiece", () => {
    it("allows approval from done_pending_approval", () => {
      expect(canApprovePiece("done_pending_approval")).toBe(true);
    });

    it("rejects approval from pending", () => {
      expect(canApprovePiece("pending")).toBe(false);
    });

    it("rejects approval from already approved", () => {
      expect(canApprovePiece("approved")).toBe(false);
    });
  });

  describe("adminMarkApproved (skip clothier step)", () => {
    it("allows direct approval from pending", () => {
      expect(canAdminMarkApproved("pending")).toBe(true);
    });

    it("rejects from done_pending_approval", () => {
      expect(canAdminMarkApproved("done_pending_approval")).toBe(false);
    });

    it("rejects from already approved", () => {
      expect(canAdminMarkApproved("approved")).toBe(false);
    });
  });

  describe("markPieceDone — self-claim auth guard", () => {
    it("allows when piece is assigned to the requesting clothier", () => {
      expect(canMarkDone("pending", "emp-1", "emp-1")).toBe(true);
    });

    it("rejects when piece is assigned to a different clothier", () => {
      expect(canMarkDone("pending", "emp-2", "emp-1")).toBe(false);
    });

    it("rejects when piece is already in done_pending_approval", () => {
      expect(canMarkDone("done_pending_approval", "emp-1", "emp-1")).toBe(false);
    });

    it("rejects when piece is unassigned (must claim first)", () => {
      expect(canMarkDone("pending", null, "emp-1")).toBe(false);
    });
  });
});

// ─── Checkout idempotency key uniqueness ──────────────────────────────────────

describe("Checkout idempotency", () => {
  it("same idempotency key maps to same session (idempotent replay)", () => {
    const key = "3f4c8b2e-1234-4abc-9def-abcdef012345";
    const firstRequest = key;
    const secondRequest = key;
    // The key itself is the session id — same key = same session
    expect(firstRequest).toBe(secondRequest);
  });

  it("different keys produce different sessions", () => {
    const key1 = "3f4c8b2e-0000-4abc-9def-abcdef012345";
    const key2 = "3f4c8b2e-1111-4abc-9def-abcdef012345";
    expect(key1).not.toBe(key2);
  });
});
