import { describe, it, expect, vi, beforeEach } from "vitest";

// T132 — who sees Actividad and each Historial (the queries are in
// packages/db activity.integration.test.ts).

const state = vi.hoisted(() => ({ role: "admin" as string | null, calls: 0 }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@befine/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@befine/db")>()),
  listActivity: async () => {
    state.calls++;
    return { rows: [], next: null };
  },
  clientRecords: async () => [],
  pedidoRecordByNumber: async () => [],
}));

import { getActivityPage, getRecordHistory } from "../actions";

const ID = "00000000-0000-4000-8000-0000000000a1";

describe("Actividad access", () => {
  beforeEach(() => {
    state.role = "admin";
    state.calls = 0;
  });

  it("is admin only", async () => {
    expect((await getActivityPage({})).success).toBe(true);
    for (const role of ["cashier", "secretary", "stylist", "clothier"]) {
      state.role = role;
      const res = await getActivityPage({});
      expect(!res.success && res.error.code).toBe("FORBIDDEN");
    }
    state.role = null;
    const anon = await getActivityPage({});
    expect(!anon.success && anon.error.code).toBe("UNAUTHORIZED");
    expect(state.calls).toBe(1);
  });

  it("rejects bad filters before querying", async () => {
    const res = await getActivityPage({ from: "25/10/2026" });
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.calls).toBe(0);
  });
});

describe("Historial access", () => {
  beforeEach(() => {
    state.calls = 0;
  });

  it.each([
    ["pedido", "cashier", true],
    ["pedido", "secretary", true],
    ["ticket", "cashier", true],
    ["client", "secretary", true],
    ["employee", "admin", true],
    ["employee", "cashier", false],
    ["employee", "secretary", false],
    ["pedido", "stylist", false],
    ["client", "clothier", false],
  ] as const)("%s history for %s → %s", async (entityType, role, allowed) => {
    state.role = role;
    const res = await getRecordHistory({ entityType, entityId: ID });
    expect(res.success).toBe(allowed);
    if (!allowed) expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });

  it("refuses other record types", async () => {
    state.role = "admin";
    const res = await getRecordHistory({ entityType: "user", entityId: ID });
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });
});
