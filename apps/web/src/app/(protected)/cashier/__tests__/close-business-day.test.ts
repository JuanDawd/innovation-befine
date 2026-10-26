import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableColumns } from "drizzle-orm";
import { businessDays } from "@befine/db/schema";

// H-49 — the business day can't be closed while it has unpaid tickets.
// pg-proxy builds the real SQL; the callback plays the database.

const state = vi.hoisted(() => ({
  role: "cashier",
  queries: [] as string[],
  respond: (() => []) as (sql: string) => unknown[][],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
// Till totals and after-hours attach have their own tests; here only the guard and the log.
vi.mock("@befine/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@befine/db")>();
  return { ...mod, getDayIncome: async () => ({ ...mod.summarizeDayIncome([]), total: 125_000 }) };
});
vi.mock("@/lib/after-hours", () => ({ attachAfterHoursPayments: async () => 0 }));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql) => {
    state.queries.push(sql);
    return { rows: state.respond(sql) };
  });
  // pg-proxy has no transactions; run the callback on the same instance.
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) }),
  };
});

import { closeBusinessDay, openBusinessDay } from "../actions/business-day";

const DAY_ID = "00000000-0000-4000-8000-000000000001";

function dayRow(overrides: Record<string, unknown> = {}): unknown[] {
  const values: Record<string, unknown> = {
    id: DAY_ID,
    openedAt: "2026-10-23 13:00:00+00",
    closedAt: "2026-10-23 23:00:00+00",
    ...overrides,
  };
  return Object.keys(getTableColumns(businessDays)).map((k) => values[k] ?? null);
}

describe("closeBusinessDay", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.queries = [];
    state.respond = () => [];
  });

  it("guards the update with an unpaid-tickets NOT EXISTS in the same statement", async () => {
    state.respond = (sql) => (sql.startsWith("update") ? [dayRow()] : []);
    const res = await closeBusinessDay(DAY_ID);
    expect(res.success).toBe(true);
    // The guarded update, then its activity log entry in the same transaction (T131).
    expect(state.queries).toHaveLength(2);
    expect(state.queries[1]).toMatch(/^insert into "activity_log"/);
    const sql = state.queries[0]!;
    expect(sql).toMatch(/"closed_at" is null/);
    expect(sql).toMatch(/not exists \(select .* from "tickets"/);
    expect(sql).toMatch(/"status" in \(\$\d+, \$\d+, \$\d+\)/);
  });

  it("returns CONFLICT with the unpaid count when tickets are still open", async () => {
    state.respond = (sql) => {
      if (sql.startsWith("update")) return [];
      if (sql.includes("count(")) return [[3]];
      return [[null]]; // day exists, still open
    };
    const res = await closeBusinessDay(DAY_ID);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("CONFLICT");
    expect(res.error.message).toContain("3 ticket");
  });

  it("returns CONFLICT when the day is already closed", async () => {
    state.respond = (sql) => (sql.startsWith("update") ? [] : [["2026-10-23 23:00:00+00"]]);
    const res = await closeBusinessDay(DAY_ID);
    expect(!res.success && res.error.message).toBe("El día ya está cerrado");
  });

  it("returns NOT_FOUND for an unknown day", async () => {
    const res = await closeBusinessDay(DAY_ID);
    expect(!res.success && res.error.code).toBe("NOT_FOUND");
  });

  it("returns FORBIDDEN for a stylist", async () => {
    state.role = "stylist";
    const res = await closeBusinessDay(DAY_ID);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });
});

describe("openBusinessDay", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.queries = [];
    state.respond = () => [];
  });

  it("opens the day in one statement guarded by NOT EXISTS an open day (M-62)", async () => {
    state.respond = (sql) => (sql.startsWith("insert") ? [dayRow({ closedAt: null })] : []);
    const res = await openBusinessDay();
    expect(res.success).toBe(true);
    expect(state.queries).toHaveLength(2);
    expect(state.queries[1]).toMatch(/^insert into "activity_log"/);
    expect(state.queries[0]).toMatch(
      /^insert into "business_days" .* select .* where not exists \(select .*"closed_at" is null\)/s,
    );
  });

  it("returns CONFLICT when a day is already open", async () => {
    const res = await openBusinessDay();
    expect(!res.success && res.error.code).toBe("CONFLICT");
  });

  it("returns FORBIDDEN for a stylist", async () => {
    state.role = "stylist";
    const res = await openBusinessDay();
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });
});
