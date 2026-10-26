import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// Undo "Listo para cobrar" — awaiting_payment → logged before caja charges it.

const state = vi.hoisted(() => ({
  role: "stylist",
  ticket: null as null | { status: string; employeeId: string; version: number },
  updateRows: [] as unknown[][],
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@befine/realtime/server", () => ({ publishEvent: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { general: {} },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role } }) } },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    if (sql.startsWith("update")) return { rows: state.updateRows };
    if (sql.includes('from "tickets"'))
      return {
        rows: state.ticket
          ? [[TICKET_ID, state.ticket.status, state.ticket.employeeId, state.ticket.version]]
          : [],
      };
    return { rows: [["emp-own"]] }; // employee lookup
  });
  // pg-proxy has no transactions; run the callback on the same instance.
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) }),
  };
});

import { undoMarkReady } from "../actions";

const TICKET_ID = "00000000-0000-4000-8000-0000000000aa";
const input = { ticketId: TICKET_ID };

describe("undoMarkReady", () => {
  beforeEach(() => {
    state.role = "stylist";
    state.ticket = { status: "awaiting_payment", employeeId: "emp-own", version: 2 };
    state.updateRows = [[TICKET_ID, "logged"]];
    state.queries = [];
  });

  it("returns the stylist's own ticket to logged, guarded by version and no checkout", async () => {
    const res = await undoMarkReady(input);
    expect(res).toEqual({ success: true, data: { id: TICKET_ID, status: "logged" } });
    const update = state.queries.find((q) => q.sql.startsWith("update"))!;
    expect(update.sql).toMatch(/"checkout_session_id" is null/);
    expect(update.params).toEqual(expect.arrayContaining(["logged", 3, 2]));
    const log = state.queries.find((q) => q.sql.startsWith('insert into "activity_log"'));
    expect(log?.params).toEqual(expect.arrayContaining(["ticket.undo_ready"]));
  });

  it("returns STALE_DATA when caja already started the checkout", async () => {
    state.updateRows = [];
    const res = await undoMarkReady(input);
    expect(!res.success && res.error.code).toBe("STALE_DATA");
  });

  it.each(["logged", "closed", "reopened", "voided"])(
    "returns CONFLICT for a %s ticket",
    async (status) => {
      state.ticket = { status, employeeId: "emp-own", version: 1 };
      const res = await undoMarkReady(input);
      expect(!res.success && res.error.code).toBe("CONFLICT");
      expect(state.queries.some((q) => q.sql.startsWith("update"))).toBe(false);
    },
  );

  it("returns FORBIDDEN when a stylist undoes someone else's ticket", async () => {
    state.ticket = { status: "awaiting_payment", employeeId: "emp-other", version: 2 };
    const res = await undoMarkReady(input);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });

  it("lets the secretary undo any ticket", async () => {
    state.role = "secretary";
    state.ticket = { status: "awaiting_payment", employeeId: "emp-other", version: 2 };
    const res = await undoMarkReady(input);
    expect(res.success).toBe(true);
  });

  it("returns FORBIDDEN for a clothier", async () => {
    state.role = "clothier";
    const res = await undoMarkReady(input);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });

  it("returns NOT_FOUND for an unknown ticket", async () => {
    state.ticket = null;
    const res = await undoMarkReady(input);
    expect(!res.success && res.error.code).toBe("NOT_FOUND");
  });

  it("returns VALIDATION_ERROR for a bad id", async () => {
    const res = await undoMarkReady({ ticketId: "nope" });
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });
});
