import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// M-62 — the user→employee lookup is cached per process (hits only).

const state = vi.hoisted(() => ({ rows: [] as unknown[][], queries: 0 }));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    drizzle(async () => {
      state.queries++;
      return { rows: state.rows };
    }),
}));

import { clearEmployeeRefCache, getEmployeeRef } from "../employee-ref";

describe("getEmployeeRef", () => {
  beforeEach(() => {
    clearEmployeeRefCache();
    state.queries = 0;
    state.rows = [];
  });

  it("queries once per user, then serves the cached id", async () => {
    state.rows = [["emp-1"]];
    expect(await getEmployeeRef("u1")).toEqual({ id: "emp-1" });
    expect(await getEmployeeRef("u1")).toEqual({ id: "emp-1" });
    expect(state.queries).toBe(1);
  });

  it("doesn't cache a miss, so a new employee resolves immediately", async () => {
    expect(await getEmployeeRef("u2")).toBeUndefined();
    state.rows = [["emp-2"]];
    expect(await getEmployeeRef("u2")).toEqual({ id: "emp-2" });
    expect(state.queries).toBe(2);
  });

  it("keeps users apart", async () => {
    state.rows = [["emp-a"]];
    await getEmployeeRef("a");
    state.rows = [["emp-b"]];
    expect(await getEmployeeRef("b")).toEqual({ id: "emp-b" });
    expect(await getEmployeeRef("a")).toEqual({ id: "emp-a" });
  });
});
