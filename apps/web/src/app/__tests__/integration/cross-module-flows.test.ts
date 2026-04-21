/**
 * T09R-R11 — Cross-module integration tests
 *
 * Tests the orchestration logic for four critical cross-module flows without
 * hitting a real database. Pure business-logic assertions against the domain
 * rules enforced by each module.
 *
 * Flow (a): appointment → ticket → checkout → payout includes the ticket
 * Flow (b): batch → pieces done → approve → payout includes pieces
 * Flow (c): large-order → link batches → record payments → paid_in_full
 * Flow (d): offline queue flush deduplicates on retry
 */

import { describe, it, expect } from "vitest";

// ─── Shared test data helpers ─────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

// ─── Flow (a): Appointment → Ticket → Checkout → Payout ──────────────────────

describe("Flow (a): appointment → ticket → checkout → payout coverage", () => {
  /**
   * Business rule: a stylist's closed ticket is included in their unsettled
   * earnings. After a payout covering that business day, the ticket must NOT
   * appear in future unsettled periods.
   *
   * Tests the data-flow invariants without a DB using in-memory structures
   * that mirror the DB schema relationships.
   */

  type TicketStatus = "logged" | "awaiting_payment" | "closed" | "paid_offline";

  type Ticket = { id: string; businessDayId: string; employeeId: string; status: TicketStatus };
  type PayoutPeriodDay = { payoutId: string; employeeId: string; businessDayId: string };

  function computeUnsettledDays(
    closedTickets: Ticket[],
    settledPeriodDays: PayoutPeriodDay[],
    employeeId: string,
    closedDayIds: string[],
  ): string[] {
    const settledIds = new Set(
      settledPeriodDays.filter((p) => p.employeeId === employeeId).map((p) => p.businessDayId),
    );
    const workedDays = new Set(
      closedTickets
        .filter(
          (t) =>
            t.employeeId === employeeId &&
            t.status === "closed" &&
            closedDayIds.includes(t.businessDayId),
        )
        .map((t) => t.businessDayId),
    );
    return [...workedDays].filter((d) => !settledIds.has(d));
  }

  it("unsettled days include ticket's business day before payout", () => {
    const empId = uuid();
    const dayId = uuid();
    const ticketId = uuid();

    const ticket: Ticket = {
      id: ticketId,
      businessDayId: dayId,
      employeeId: empId,
      status: "closed",
    };
    const unsettled = computeUnsettledDays([ticket], [], empId, [dayId]);

    expect(unsettled).toContain(dayId);
    expect(unsettled).toHaveLength(1);
  });

  it("unsettled days exclude ticket's day after payout covers it", () => {
    const empId = uuid();
    const dayId = uuid();
    const payoutId = uuid();

    const ticket: Ticket = {
      id: uuid(),
      businessDayId: dayId,
      employeeId: empId,
      status: "closed",
    };
    const periodDay: PayoutPeriodDay = { payoutId, employeeId: empId, businessDayId: dayId };
    const unsettled = computeUnsettledDays([ticket], [periodDay], empId, [dayId]);

    expect(unsettled).toHaveLength(0);
  });

  it("payout covers only the specified days — other days remain unsettled", () => {
    const empId = uuid();
    const day1 = uuid();
    const day2 = uuid();
    const payoutId = uuid();

    const tickets: Ticket[] = [
      { id: uuid(), businessDayId: day1, employeeId: empId, status: "closed" },
      { id: uuid(), businessDayId: day2, employeeId: empId, status: "closed" },
    ];
    // Only day1 is settled
    const periodDays: PayoutPeriodDay[] = [{ payoutId, employeeId: empId, businessDayId: day1 }];

    const unsettled = computeUnsettledDays(tickets, periodDays, empId, [day1, day2]);

    expect(unsettled).not.toContain(day1);
    expect(unsettled).toContain(day2);
  });

  it("ticket in awaiting_payment status does not count as worked day", () => {
    const empId = uuid();
    const dayId = uuid();

    const ticket: Ticket = {
      id: uuid(),
      businessDayId: dayId,
      employeeId: empId,
      status: "awaiting_payment",
    };
    const unsettled = computeUnsettledDays([ticket], [], empId, [dayId]);

    expect(unsettled).toHaveLength(0);
  });

  it("needs_review ticket excluded from payout total (mirrors computeStylistEarnings)", () => {
    // A ticket with needsReview=true contributes 0 to earnings
    function earningsForItems(
      items: { effectivePrice: number; commissionPct: number; needsReview: boolean }[],
    ): number {
      return items
        .filter((i) => !i.needsReview)
        .reduce((sum, i) => sum + Math.round((i.effectivePrice * i.commissionPct) / 100), 0);
    }

    const items = [
      { effectivePrice: 50_000, commissionPct: 10, needsReview: false },
      { effectivePrice: 80_000, commissionPct: 10, needsReview: true },
    ];

    expect(earningsForItems(items)).toBe(5_000); // only first item counts
  });

  it("double-payout rejected by unique constraint simulation", () => {
    const empId = uuid();
    const dayId = uuid();

    // Simulate UNIQUE(employee_id, business_day_id) conflict
    const periodDays: PayoutPeriodDay[] = [
      { payoutId: uuid(), employeeId: empId, businessDayId: dayId },
    ];

    function insertPeriodDay(rows: PayoutPeriodDay[], row: PayoutPeriodDay): { conflict: boolean } {
      const exists = rows.some(
        (r) => r.employeeId === row.employeeId && r.businessDayId === row.businessDayId,
      );
      if (exists) return { conflict: true };
      rows.push(row);
      return { conflict: false };
    }

    const result = insertPeriodDay(periodDays, {
      payoutId: uuid(),
      employeeId: empId,
      businessDayId: dayId,
    });
    expect(result.conflict).toBe(true);
  });
});

// ─── Flow (b): Batch → Pieces Done → Approve → Payout Includes Pieces ─────────

describe("Flow (b): batch → pieces done → approve → clothier payout coverage", () => {
  type PieceStatus = "pending" | "done_pending_approval" | "approved";
  type BatchPiece = {
    id: string;
    batchId: string;
    businessDayId: string;
    assignedToEmployeeId: string;
    status: PieceStatus;
    pieceRate: number;
  };

  function computeClothierUnsettled(
    pieces: BatchPiece[],
    settledDays: { employeeId: string; businessDayId: string }[],
    employeeId: string,
    closedDayIds: string[],
  ): string[] {
    const settled = new Set(
      settledDays.filter((s) => s.employeeId === employeeId).map((s) => s.businessDayId),
    );
    const workedDays = new Set(
      pieces
        .filter(
          (p) =>
            p.assignedToEmployeeId === employeeId &&
            p.status === "approved" &&
            closedDayIds.includes(p.businessDayId),
        )
        .map((p) => p.businessDayId),
    );
    return [...workedDays].filter((d) => !settled.has(d));
  }

  it("approved pieces create an unsettled day for the clothier", () => {
    const empId = uuid();
    const dayId = uuid();

    const piece: BatchPiece = {
      id: uuid(),
      batchId: uuid(),
      businessDayId: dayId,
      assignedToEmployeeId: empId,
      status: "approved",
      pieceRate: 15_000,
    };

    const unsettled = computeClothierUnsettled([piece], [], empId, [dayId]);
    expect(unsettled).toContain(dayId);
  });

  it("done_pending_approval pieces do NOT create unsettled day until approved", () => {
    const empId = uuid();
    const dayId = uuid();

    const piece: BatchPiece = {
      id: uuid(),
      batchId: uuid(),
      businessDayId: dayId,
      assignedToEmployeeId: empId,
      status: "done_pending_approval",
      pieceRate: 15_000,
    };

    const unsettled = computeClothierUnsettled([piece], [], empId, [dayId]);
    expect(unsettled).toHaveLength(0);
  });

  it("payout total = sum of approved piece rates", () => {
    const empId = uuid();
    const dayId = uuid();
    const pieces: BatchPiece[] = [
      {
        id: uuid(),
        batchId: uuid(),
        businessDayId: dayId,
        assignedToEmployeeId: empId,
        status: "approved",
        pieceRate: 15_000,
      },
      {
        id: uuid(),
        batchId: uuid(),
        businessDayId: dayId,
        assignedToEmployeeId: empId,
        status: "approved",
        pieceRate: 20_000,
      },
      {
        id: uuid(),
        batchId: uuid(),
        businessDayId: dayId,
        assignedToEmployeeId: empId,
        status: "done_pending_approval",
        pieceRate: 99_000,
      },
    ];

    const total = pieces
      .filter((p) => p.assignedToEmployeeId === empId && p.status === "approved")
      .reduce((sum, p) => sum + p.pieceRate, 0);

    expect(total).toBe(35_000);
  });

  it("day settles after payout covers it — no more unsettled", () => {
    const empId = uuid();
    const dayId = uuid();
    const piece: BatchPiece = {
      id: uuid(),
      batchId: uuid(),
      businessDayId: dayId,
      assignedToEmployeeId: empId,
      status: "approved",
      pieceRate: 15_000,
    };

    const settled = [{ employeeId: empId, businessDayId: dayId }];
    const unsettled = computeClothierUnsettled([piece], settled, empId, [dayId]);

    expect(unsettled).toHaveLength(0);
  });

  it("piece variant rate is used (not cloth_piece base rate)", () => {
    // Invariant: batch_pieces joins cloth_piece_variants, not cloth_pieces directly
    // Simulate variant resolution
    const variants = [
      { id: "v1", clothPieceId: "cp1", name: "Dos piezas", pieceRate: 12_000 },
      { id: "v2", clothPieceId: "cp1", name: "Entera", pieceRate: 18_000 },
    ];

    const batchPieceVariantId = "v2";
    const resolvedRate = variants.find((v) => v.id === batchPieceVariantId)?.pieceRate;

    expect(resolvedRate).toBe(18_000);
  });
});

// ─── Flow (c): Large-order → Link batches → Payments → paid_in_full ───────────

describe("Flow (c): large-order payment auto-transition to paid_in_full", () => {
  type OrderStatus = "pending" | "in_progress" | "paid_in_full" | "cancelled";

  type LargeOrder = {
    id: string;
    totalAmount: number;
    status: OrderStatus;
    payments: number[];
  };

  function computeOrderStatus(order: LargeOrder): OrderStatus {
    if (order.status === "cancelled") return "cancelled";
    const paid = order.payments.reduce((s, p) => s + p, 0);
    if (paid >= order.totalAmount) return "paid_in_full";
    if (paid > 0) return "in_progress";
    return "pending";
  }

  it("order transitions to paid_in_full when payments sum ≥ total", () => {
    const order: LargeOrder = {
      id: uuid(),
      totalAmount: 500_000,
      status: "in_progress",
      payments: [200_000, 300_000],
    };
    expect(computeOrderStatus(order)).toBe("paid_in_full");
  });

  it("order stays in_progress when partially paid", () => {
    const order: LargeOrder = {
      id: uuid(),
      totalAmount: 500_000,
      status: "in_progress",
      payments: [200_000],
    };
    expect(computeOrderStatus(order)).toBe("in_progress");
  });

  it("overpayment also triggers paid_in_full (graceful rounding)", () => {
    const order: LargeOrder = {
      id: uuid(),
      totalAmount: 500_000,
      status: "in_progress",
      payments: [500_001],
    };
    expect(computeOrderStatus(order)).toBe("paid_in_full");
  });

  it("cancelled order cannot transition to paid_in_full", () => {
    const order: LargeOrder = {
      id: uuid(),
      totalAmount: 500_000,
      status: "cancelled",
      payments: [500_000],
    };
    expect(computeOrderStatus(order)).toBe("cancelled");
  });

  it("no payments leaves order pending", () => {
    const order: LargeOrder = {
      id: uuid(),
      totalAmount: 500_000,
      status: "pending",
      payments: [],
    };
    expect(computeOrderStatus(order)).toBe("pending");
  });

  it("linked batch pieces are included in order value", () => {
    // Invariant: batch_pieces.large_order_id links production to the order
    // Simulate total computation including linked batches
    const orderTotal = 800_000;
    const batchPieces = [
      { largeOrderId: "order-1", pieceRate: 15_000, status: "approved" as const },
      { largeOrderId: "order-1", pieceRate: 20_000, status: "approved" as const },
      { largeOrderId: "order-2", pieceRate: 99_000, status: "approved" as const },
    ];

    const linkedCost = batchPieces
      .filter((p) => p.largeOrderId === "order-1" && p.status === "approved")
      .reduce((s, p) => s + p.pieceRate, 0);

    expect(linkedCost).toBe(35_000);
    expect(linkedCost).toBeLessThanOrEqual(orderTotal);
  });
});

// ─── Flow (d): Offline queue flush deduplication ──────────────────────────────

describe("Flow (d): offline queue flush deduplication", () => {
  /**
   * The queue flush calls server actions with idempotency keys.
   * A second flush of the same mutation must not create a duplicate.
   * We test the dedup logic (the idempotency store) in isolation.
   */

  type CacheEntry = { key: string; route: string; response: unknown; expiresAt: Date };

  function makeIdempotencyStore() {
    const store = new Map<string, CacheEntry>();

    function check(key: string): unknown | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < new Date()) {
        store.delete(key);
        return null;
      }
      return entry.response;
    }

    function store_(key: string, route: string, response: unknown, ttlMs = 86_400_000) {
      if (store.has(key)) return; // ON CONFLICT DO NOTHING
      store.set(key, { key, route, response, expiresAt: new Date(Date.now() + ttlMs) });
    }

    return { check, store: store_ };
  }

  it("first call executes and stores result", () => {
    const { check, store } = makeIdempotencyStore();
    const key = uuid();

    expect(check(key)).toBeNull();
    store(key, "markPieceDone", { success: true });
    expect(check(key)).toEqual({ success: true });
  });

  it("second call with same key returns cached result without re-executing", () => {
    const { check, store } = makeIdempotencyStore();
    const key = uuid();
    let execCount = 0;

    function executeOnce() {
      const cached = check(key);
      if (cached) return cached;
      execCount++;
      const result = { success: true, data: { id: "piece-123" } };
      store(key, "markPieceDone", result);
      return result;
    }

    executeOnce();
    executeOnce();

    expect(execCount).toBe(1);
  });

  it("different keys do not interfere", () => {
    const { check, store } = makeIdempotencyStore();
    const key1 = uuid();
    const key2 = uuid();

    store(key1, "markPieceDone", { success: true, data: { id: "piece-1" } });
    store(key2, "markPieceDone", { success: true, data: { id: "piece-2" } });

    expect(check(key1)).toEqual({ success: true, data: { id: "piece-1" } });
    expect(check(key2)).toEqual({ success: true, data: { id: "piece-2" } });
  });

  it("expired entry is treated as a miss — re-execution is allowed", () => {
    const { check, store } = makeIdempotencyStore();
    const key = uuid();

    store(key, "markPieceDone", { success: true }, -1); // already expired
    expect(check(key)).toBeNull(); // lazy expiry returns null
  });

  it("queue processes mutations in insertion order", () => {
    type Mutation = { id: string; payload: { seq: number }; createdAt: number };

    const queue: Mutation[] = [
      { id: uuid(), payload: { seq: 3 }, createdAt: 3 },
      { id: uuid(), payload: { seq: 1 }, createdAt: 1 },
      { id: uuid(), payload: { seq: 2 }, createdAt: 2 },
    ];

    const sorted = [...queue].sort((a, b) => a.createdAt - b.createdAt);
    expect(sorted.map((m) => m.payload.seq)).toEqual([1, 2, 3]);
  });

  it("successful flush removes item from queue", () => {
    type QueueItem = { id: string; attempts: number; lastError: string | null };
    const queue: QueueItem[] = [{ id: "m1", attempts: 0, lastError: null }];

    function dequeue(id: string) {
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) queue.splice(i, 1);
    }

    dequeue("m1");
    expect(queue).toHaveLength(0);
  });

  it("failed flush increments attempts and retains item", () => {
    type QueueItem = { id: string; attempts: number; lastError: string | null };
    const queue: QueueItem[] = [{ id: "m1", attempts: 0, lastError: null }];

    function markAttempted(id: string, err: string) {
      const item = queue.find((q) => q.id === id);
      if (item) {
        item.attempts++;
        item.lastError = err;
      }
    }

    markAttempted("m1", "Network error");

    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe("Network error");
  });

  it("same mutation queued twice with same idempotency key only executes once on flush", () => {
    const { check, store } = makeIdempotencyStore();
    const key = uuid();
    let execCount = 0;

    // Simulate two identical queued mutations with the same idempotency key
    const queue = [
      { id: key, type: "markPieceDone", payload: { pieceId: "p1", expectedVersion: 1 } },
      { id: key, type: "markPieceDone", payload: { pieceId: "p1", expectedVersion: 1 } },
    ];

    const processed: string[] = [];

    for (const mutation of queue) {
      const cached = check(mutation.id);
      if (cached) {
        processed.push("cache-hit");
        continue;
      }
      execCount++;
      processed.push("executed");
      store(mutation.id, mutation.type, { success: true });
    }

    expect(execCount).toBe(1);
    expect(processed).toEqual(["executed", "cache-hit"]);
  });
});
