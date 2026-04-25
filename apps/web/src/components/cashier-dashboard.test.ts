import { describe, it, expect } from "vitest";
import { optimisticStatusReducer } from "./cashier-dashboard-helpers";
import type { DashboardTicket } from "@/app/(protected)/tickets/actions";

const ticket = (over: Partial<DashboardTicket> = {}): DashboardTicket => ({
  id: "t-1",
  employeeId: "e-1",
  employeeName: "Ana",
  clientName: "Cliente",
  serviceName: "Corte",
  variantName: "Estándar",
  unitPrice: 20000,
  quantity: 1,
  status: "logged",
  createdAt: new Date("2026-04-24T10:00:00Z"),
  ...over,
});

describe("optimisticStatusReducer (T10R-R2)", () => {
  it("flips a single ticket's status", () => {
    const before = [ticket(), ticket({ id: "t-2", status: "closed" })];
    const after = optimisticStatusReducer(before, { id: "t-1", status: "awaiting_payment" });

    expect(after[0]).toMatchObject({ id: "t-1", status: "awaiting_payment" });
    expect(after[1]).toMatchObject({ id: "t-2", status: "closed" });
  });

  it("returns a new array reference but unchanged tickets are referentially equal", () => {
    const before = [ticket(), ticket({ id: "t-2", status: "closed" })];
    const after = optimisticStatusReducer(before, { id: "t-1", status: "awaiting_payment" });

    expect(after).not.toBe(before);
    expect(after[1]).toBe(before[1]); // unchanged ticket keeps reference
  });

  it("is a no-op when target id does not exist (revert path)", () => {
    const before = [ticket()];
    const after = optimisticStatusReducer(before, { id: "missing", status: "closed" });

    expect(after).toEqual(before);
  });

  it("is idempotent — applying the same update twice yields the same result", () => {
    const before = [ticket()];
    const once = optimisticStatusReducer(before, { id: "t-1", status: "awaiting_payment" });
    const twice = optimisticStatusReducer(once, { id: "t-1", status: "awaiting_payment" });

    expect(twice).toEqual(once);
  });
});

// useOptimistic guarantee: when the surrounding transition completes without
// committing the underlying state via setState, the optimistic layer is dropped
// and the rendered state reverts to the source. The handler in
// cashier-dashboard.tsx relies on this — on error it never calls setTickets, so
// the optimistic flip is automatically discarded.
describe("revert-on-error contract (T10R-R2)", () => {
  it("source state is unchanged when no setTickets call follows a failed action", () => {
    const source = [ticket()];
    // The reducer is called inside startTransition; if the action fails the
    // outer source array remains the truth and useOptimistic returns it again.
    const optimistic = optimisticStatusReducer(source, {
      id: "t-1",
      status: "awaiting_payment",
    });
    // Optimistic state diverges from source — that is the in-flight rendering.
    expect(optimistic[0].status).toBe("awaiting_payment");
    // After the action settles (failure path) React rerenders with `source`,
    // which still reflects the original status because we never mutated it.
    expect(source[0].status).toBe("logged");
  });
});
