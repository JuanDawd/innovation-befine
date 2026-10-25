import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableColumns } from "drizzle-orm";
import { tickets } from "@befine/db/schema";

// createTicket — failure reporting (M-61) and race-safe idempotency (L-47).

const state = vi.hoisted(() => ({
  queries: [] as string[],
  failInsert: null as Error | null,
  /** A ticket with this key already exists (stored by an earlier/concurrent call) */
  existingTicket: false,
  /** role / is_active of the employee the ticket is for */
  target: ["stylist", true] as unknown[] | null,
  captureException: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: state.captureException }));
vi.mock("@/lib/logger", () => ({ logger: { error: state.loggerError } }));
vi.mock("@befine/realtime/server", () => ({ publishEvent: vi.fn() }));
vi.mock("@/lib/business-day", () => ({ getCurrentBusinessDay: async () => ({ id: DAY_ID }) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimits: { ticketCreate: {} },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "u1", role: "secretary" } }) } },
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql) => {
    state.queries.push(sql);
    if (sql.startsWith("insert") && state.failInsert) throw state.failInsert;
    if (sql.startsWith('insert into "tickets"'))
      return { rows: state.existingTicket ? [] : [ticketRow("new-ticket")] };
    if (sql.startsWith("insert")) return { rows: [] };
    if (sql.includes('from "service_variants"')) return { rows: [[50000, "40.00", true]] };
    if (sql.includes('from "tickets"'))
      return { rows: state.existingTicket ? [ticketRow("existing-ticket")] : [] };
    if (sql.includes('from "employees" inner join "users"')) return { rows: [["Laura"]] };
    if (sql.includes('"is_active" from "employees"'))
      return { rows: state.target ? [state.target] : [] };
    return { rows: [[EMPLOYEE_ID]] };
  });
  // pg-proxy has no transactions; run the callback against the same instance.
  const txDb = { transaction: <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) };
  return { getDb: () => db, getTxDb: () => txDb };
});

import { createTicket } from "../actions";

const DAY_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const KEY = "00000000-0000-4000-8000-00000000000a";

function ticketRow(id: string): unknown[] {
  const values: Record<string, unknown> = {
    id,
    businessDayId: DAY_ID,
    employeeId: EMPLOYEE_ID,
    guestName: "Ana",
    status: "logged",
    idempotencyKey: KEY,
    createdAt: "2026-10-23 15:00:00+00",
    version: 1,
    needsReview: false,
  };
  return Object.keys(getTableColumns(tickets)).map((k) => values[k] ?? null);
}

const input = {
  employeeId: EMPLOYEE_ID,
  serviceVariantId: "00000000-0000-4000-8000-000000000003",
  quantity: 1,
  clientType: "guest",
  guestName: "Ana",
  idempotencyKey: KEY,
};

describe("createTicket", () => {
  beforeEach(() => {
    state.queries = [];
    state.failInsert = null;
    state.existingTicket = false;
    state.target = ["stylist", true];
    state.captureException.mockClear();
    state.loggerError.mockClear();
  });

  it("logs and reports an unexpected DB error but returns a generic message", async () => {
    const boom = new Error("b.mask is not a function");
    state.failInsert = boom;
    const res = await createTicket(input);
    expect(res).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Error al crear el ticket" },
    });
    // Drizzle wraps driver errors; the original stays reachable as `cause`.
    const reported = state.captureException.mock.calls[0]!;
    expect((reported[0] as Error).cause).toBe(boom);
    expect(reported[1]).toEqual(expect.objectContaining({ tags: { action: "createTicket" } }));
    expect(state.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: reported[0], action: "createTicket" }),
      "createTicket failed",
    );
  });

  it("inserts with ON CONFLICT DO NOTHING on the idempotency key, then the item", async () => {
    const res = await createTicket(input);
    expect(res.success && res.data.id).toBe("new-ticket");
    const ticketInsert = state.queries.find((q) => q.startsWith('insert into "tickets"'))!;
    expect(ticketInsert).toMatch(/on conflict \("idempotency_key"\) do nothing/);
    expect(state.queries.some((q) => q.startsWith('insert into "ticket_items"'))).toBe(true);
  });

  it.each([
    ["the secretary herself", ["secretary", true]],
    ["a clothier", ["clothier", true]],
    ["an inactive stylist", ["stylist", false]],
    ["an unknown employee", null],
  ])("rejects a ticket for %s without writing", async (_label, target) => {
    state.target = target as unknown[] | null;
    const res = await createTicket(input);
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries.some((q) => q.startsWith("insert"))).toBe(false);
  });

  it("returns the existing ticket on a replayed key without adding a second item", async () => {
    state.existingTicket = true;
    const res = await createTicket(input);
    expect(res.success && res.data).toEqual(
      expect.objectContaining({ id: "existing-ticket", employeeName: "Laura" }),
    );
    expect(state.queries.some((q) => q.startsWith('insert into "ticket_items"'))).toBe(false);
    expect(state.captureException).not.toHaveBeenCalled();
  });
});
