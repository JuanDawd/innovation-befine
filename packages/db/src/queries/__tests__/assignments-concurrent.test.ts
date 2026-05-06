import { describe, it, expect } from "vitest";

/**
 * Concurrent over-assignment simulation.
 *
 * NOTE: The createAssignment server action uses a DB transaction with a
 * SUM aggregate check but currently does NOT acquire a row-level lock
 * (SELECT ... FOR UPDATE) on the order_items row. This means two concurrent
 * transactions can both pass the capacity check if they race between the
 * SELECT and the INSERT.
 *
 * These tests model the serialized behavior that a proper
 * SELECT ... FOR UPDATE would guarantee. They serve as a contract test:
 * if a FOR UPDATE lock is added, these invariants must hold. If it is not
 * added, the race window in the real DB means the CONFLICT branch may never
 * fire under concurrent load.
 *
 * See also: docs/issues-tracker.md — track this as a medium-severity gap
 * if concurrent assignment throughput becomes a concern.
 */

// ─── Simulated assignment store ───────────────────────────────────────────────

type Assignment = { id: string; orderItemId: string; assignedQuantity: number };

type Store = {
  item: { id: string; quantity: number };
  assignments: Assignment[];
  nextId: number;
};

function makeStore(itemQuantity: number): Store {
  return {
    item: { id: "item-1", quantity: itemQuantity },
    assignments: [],
    nextId: 1,
  };
}

/**
 * Serialized (locked) insert: reads current total, checks capacity, inserts.
 * This is what SELECT ... FOR UPDATE guarantees: no two calls interleave.
 */
function serializedInsert(store: Store, quantity: number): "ok" | "CONFLICT" {
  const currentTotal = store.assignments.reduce((s, a) => s + a.assignedQuantity, 0);
  if (currentTotal + quantity > store.item.quantity) return "CONFLICT";
  store.assignments.push({
    id: `asgn-${store.nextId++}`,
    orderItemId: store.item.id,
    assignedQuantity: quantity,
  });
  return "ok";
}

/**
 * Racy (unlocked) insert: simulates two transactions that both snapshot the
 * current total before either commits. Both may pass the capacity check.
 */
function racyInsert(
  store: Store,
  qty1: number,
  qty2: number,
): ["ok" | "CONFLICT", "ok" | "CONFLICT"] {
  // Both read the same snapshot
  const snapshot = store.assignments.reduce((s, a) => s + a.assignedQuantity, 0);
  const r1 = snapshot + qty1 <= store.item.quantity ? "ok" : "CONFLICT";
  const r2 = snapshot + qty2 <= store.item.quantity ? "ok" : "CONFLICT";

  // Both commit if they passed the check (race condition: both may succeed)
  if (r1 === "ok")
    store.assignments.push({
      id: `asgn-${store.nextId++}`,
      orderItemId: store.item.id,
      assignedQuantity: qty1,
    });
  if (r2 === "ok")
    store.assignments.push({
      id: `asgn-${store.nextId++}`,
      orderItemId: store.item.id,
      assignedQuantity: qty2,
    });

  return [r1, r2];
}

// ─── Serialized (correct) behavior ───────────────────────────────────────────

describe("serialized assignment — SELECT ... FOR UPDATE semantics", () => {
  it("first call succeeds, second call that would overflow gets CONFLICT", () => {
    const store = makeStore(10);
    const r1 = serializedInsert(store, 7);
    const r2 = serializedInsert(store, 4); // 7+4=11 > 10
    expect(r1).toBe("ok");
    expect(r2).toBe("CONFLICT");
    expect(store.assignments).toHaveLength(1);
    expect(store.assignments[0].assignedQuantity).toBe(7);
  });

  it("two calls that together exactly fill capacity both succeed", () => {
    const store = makeStore(10);
    const r1 = serializedInsert(store, 6);
    const r2 = serializedInsert(store, 4); // 6+4=10 = boundary
    expect(r1).toBe("ok");
    expect(r2).toBe("ok");
    expect(store.assignments).toHaveLength(2);
  });

  it("single call exceeding full quantity → CONFLICT immediately", () => {
    const store = makeStore(5);
    const r1 = serializedInsert(store, 6);
    expect(r1).toBe("CONFLICT");
    expect(store.assignments).toHaveLength(0);
  });

  it("multiple sequential calls within capacity all succeed", () => {
    const store = makeStore(12);
    expect(serializedInsert(store, 4)).toBe("ok");
    expect(serializedInsert(store, 4)).toBe("ok");
    expect(serializedInsert(store, 4)).toBe("ok");
    expect(serializedInsert(store, 1)).toBe("CONFLICT"); // 12+1 > 12
    expect(store.assignments).toHaveLength(3);
  });
});

// ─── Race condition model (demonstrating why FOR UPDATE is necessary) ─────────

describe("racy insert — demonstrates the race window without FOR UPDATE", () => {
  it("two concurrent transactions both read stale total and both succeed, creating over-assignment", () => {
    const store = makeStore(10);
    // tx1 assigns 7, tx2 assigns 6 — together 13 > 10
    // Both read snapshot=0, both pass the check, both commit
    const [r1, r2] = racyInsert(store, 7, 6);
    expect(r1).toBe("ok");
    expect(r2).toBe("ok");

    const total = store.assignments.reduce((s, a) => s + a.assignedQuantity, 0);
    // Over-assignment has occurred — this is the bug FOR UPDATE prevents
    expect(total).toBeGreaterThan(store.item.quantity);
  });
});

// ─── Post-insert invariant: total assigned never exceeds item quantity ────────
//     (this is what the verifier script checks after backfill)

describe("post-insert invariant check", () => {
  it("after serialized inserts the invariant holds", () => {
    const store = makeStore(10);
    serializedInsert(store, 6);
    serializedInsert(store, 3);
    const total = store.assignments.reduce((s, a) => s + a.assignedQuantity, 0);
    expect(total).toBeLessThanOrEqual(store.item.quantity);
  });
});
