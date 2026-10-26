import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// H-49 — voiding unpaid tickets (client left without paying).

const state = vi.hoisted(() => ({
  role: "cashier",
  ticket: null as null | { status: string; version: number },
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
        rows: state.ticket ? [[TICKET_ID, state.ticket.status, "emp-x", state.ticket.version]] : [],
      };
    return { rows: [["emp-cashier"]] }; // employee lookup
  });
  // pg-proxy has no transactions; run the callback on the same instance.
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) }),
  };
});

import { voidTicket } from "../actions";

const TICKET_ID = "00000000-0000-4000-8000-0000000000aa";
const input = { ticketId: TICKET_ID, reason: "Se fue sin pagar" };

describe("voidTicket", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.ticket = { status: "awaiting_payment", version: 3 };
    state.updateRows = [[TICKET_ID, "voided"]];
    state.queries = [];
  });

  it("voids an awaiting-payment ticket with reason, actor and version bump", async () => {
    const res = await voidTicket(input);
    expect(res).toEqual({ success: true, data: { id: TICKET_ID, status: "voided" } });
    const update = state.queries.find((q) => q.sql.startsWith("update"))!;
    expect(update.sql).toMatch(/"version" = \$\d+/);
    expect(update.params).toEqual(
      expect.arrayContaining(["voided", "emp-cashier", "Se fue sin pagar", 4, 3]),
    );
    // T131 — logged with the reason, in the same transaction.
    const log = state.queries.find((q) => q.sql.startsWith('insert into "activity_log"'))!;
    expect(log.params).toEqual(
      expect.arrayContaining(["ticket.void", "Anuló un ticket", "Se fue sin pagar"]),
    );
  });

  it("voids a logged ticket", async () => {
    state.ticket = { status: "logged", version: 1 };
    const res = await voidTicket(input);
    expect(res.success).toBe(true);
  });

  it.each(["closed", "reopened", "paid_offline", "voided"])(
    "returns CONFLICT for a %s ticket — nothing unpaid to void",
    async (status) => {
      state.ticket = { status, version: 1 };
      const res = await voidTicket(input);
      expect(!res.success && res.error.code).toBe("CONFLICT");
      expect(state.queries.some((q) => q.sql.startsWith("update"))).toBe(false);
    },
  );

  it("returns STALE_DATA when the ticket changed in between", async () => {
    state.updateRows = [];
    const res = await voidTicket(input);
    expect(!res.success && res.error.code).toBe("STALE_DATA");
  });

  it("returns NOT_FOUND for an unknown ticket", async () => {
    state.ticket = null;
    const res = await voidTicket(input);
    expect(!res.success && res.error.code).toBe("NOT_FOUND");
  });

  it.each(["stylist", "secretary", "clothier"])("returns FORBIDDEN for %s", async (role) => {
    state.role = role;
    const res = await voidTicket(input);
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });

  it.each([
    ["missing reason", { ticketId: TICKET_ID }],
    ["blank reason", { ticketId: TICKET_ID, reason: "    " }],
    ["too-long reason", { ticketId: TICKET_ID, reason: "x".repeat(501) }],
    ["bad id", { ticketId: "nope", reason: "Se fue sin pagar" }],
  ])("returns VALIDATION_ERROR for %s", async (_label, bad) => {
    const res = await voidTicket(bad);
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });
});
