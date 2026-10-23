import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// createTicket — failure reporting (M-61).

const state = vi.hoisted(() => ({
  queries: [] as string[],
  failInsert: null as Error | null,
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
    if (sql.includes('from "service_variants"')) return { rows: [[50000, "40.00", true]] };
    if (sql.includes('from "tickets"')) return { rows: [] };
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
});
