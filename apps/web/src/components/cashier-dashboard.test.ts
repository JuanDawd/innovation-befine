import { describe, it, expect } from "vitest";
import {
  daysSince,
  formatAge,
  groupByStatus,
  isStale,
  matchesQuery,
  optimisticStatusReducer,
  ticketTotal,
} from "./cashier-dashboard-helpers";
import type { DashboardTicket } from "@/app/(protected)/tickets/actions";

const ticket = (over: Partial<DashboardTicket> = {}): DashboardTicket => ({
  id: "t-1",
  employeeId: "e-1",
  employeeName: "Ana",
  clientName: "Cliente",
  serviceName: "Corte",
  variantName: "Estándar",
  unitPrice: 20000,
  overridePrice: null,
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

describe("groupByStatus", () => {
  it("orders groups charge-first and drops empty ones", () => {
    const groups = groupByStatus([
      ticket({ id: "a", status: "reopened" }),
      ticket({ id: "b", status: "awaiting_payment" }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(["awaiting_payment", "reopened"]);
  });

  it("sorts oldest first inside a group", () => {
    const groups = groupByStatus([
      ticket({ id: "new", createdAt: new Date("2026-04-24T12:00:00Z") }),
      ticket({ id: "old", createdAt: new Date("2026-04-24T09:00:00Z") }),
    ]);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(["old", "new"]);
  });
});

describe("formatAge", () => {
  const min = 60_000;
  it.each([
    [30_000, "< 1 min"],
    [45 * min, "45 min"],
    [120 * min, "2 h"],
    [190 * min, "3 h 10 min"],
    [125 * 24 * 60 * min, "125 d"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatAge(ms)).toBe(expected);
  });

  it("flags tickets open two hours or more as stale", () => {
    expect(isStale(119 * min)).toBe(false);
    expect(isStale(120 * min)).toBe(true);
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    const now = new Date("2026-04-27T10:00:00Z").getTime();
    expect(daysSince(new Date("2026-04-24T11:00:00Z"), now)).toBe(2);
    expect(daysSince(new Date("2026-04-27T08:00:00Z"), now)).toBe(0);
  });
});

describe("matchesQuery", () => {
  it("matches client, service and employee, ignoring case and accents", () => {
    const t = ticket({ clientName: "María Gómez", serviceName: "Tinte", employeeName: "Sofía" });
    expect(matchesQuery(t, "maria")).toBe(true);
    expect(matchesQuery(t, "TINTE")).toBe(true);
    expect(matchesQuery(t, "sofia")).toBe(true);
    expect(matchesQuery(t, "pedro")).toBe(false);
    expect(matchesQuery(t, "  ")).toBe(true);
  });
});

describe("ticketTotal", () => {
  it("is unit price × quantity", () => {
    expect(ticketTotal(ticket({ unitPrice: 20_000, quantity: 3 }))).toBe(60_000);
  });

  it("uses the cashier's adjusted price, including an adjustment to $0", () => {
    expect(ticketTotal(ticket({ unitPrice: 50_000, overridePrice: 42_000 }))).toBe(42_000);
    expect(ticketTotal(ticket({ unitPrice: 50_000, overridePrice: 0, quantity: 2 }))).toBe(0);
  });
});
