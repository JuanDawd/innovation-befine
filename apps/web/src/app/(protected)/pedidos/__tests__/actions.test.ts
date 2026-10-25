import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// T116 — create / edit pedido: roles, client rules, price rules, server-side total.

type Query = { sql: string; params: unknown[] };

const IDS = {
  client: "00000000-0000-4000-8000-0000000000c1",
  variant: "00000000-0000-4000-8000-0000000000a1",
  noPriceVariant: "00000000-0000-4000-8000-0000000000a2",
  size: "00000000-0000-4000-8000-0000000000b1",
  pedido: "00000000-0000-4000-8000-0000000000d1",
};

const LINE = "00000000-0000-4000-8000-0000000000e1";

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  queries: [] as Query[],
  clientPhone: "3001234567" as string | null,
  clientActive: true,
  assigned: 0,
  version: 1,
  existingLine: false,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.role ? { user: { id: "u1", role: state.role } } : null),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: { general: "general" },
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/employee-ref", () => ({ getEmployeeRef: async () => ({ id: "e1" }) }));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    const rows = (): unknown[][] => {
      if (sql.includes('from "clients"') && sql.includes("for update"))
        return [[IDS.client, "Ana Pérez", state.clientPhone, state.clientActive]];
      if (sql.includes('from "cloth_piece_variants"'))
        return [
          [IDS.variant, 45_000, true],
          [IDS.noPriceVariant, null, true],
        ].filter((r) => params.includes(r[0]));
      if (sql.includes('from "garment_sizes"')) return [[IDS.size, true]];
      if (sql.startsWith('insert into "pedidos"')) return [[IDS.pedido, 412]];
      if (sql.startsWith('insert into "pedido_lines"'))
        return [["00000000-0000-4000-8000-0000000000e1"]];
      if (sql.startsWith('insert into "clients"')) return [[IDS.client, "Luz", "3009998888"]];
      if (sql.includes('from "pedidos"') && sql.includes("for update"))
        return [[IDS.pedido, 412, state.version, null, "client", IDS.client, null, null]];
      if (sql.includes('from "assignments"')) return [[state.assigned]];
      if (state.existingLine && sql.startsWith("select") && sql.includes('from "pedido_lines"'))
        return [[LINE, "garment", IDS.variant, null, 45_000, null, null]];
      if (
        state.existingLine &&
        sql.startsWith("select") &&
        sql.includes('from "pedido_line_cells"')
      )
        return [["00000000-0000-4000-8000-0000000000f1", LINE, IDS.size, 3]];
      if (sql.startsWith('update "pedidos"')) return [[IDS.pedido, 412]];
      return [];
    };
    return { rows: rows() };
  });
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: (fn: (tx: typeof db) => unknown) => fn(db) }),
  };
});

import { createPedido, createPedidoClient, updatePedido } from "../actions";

const garment = (over: Record<string, unknown> = {}) => ({
  kind: "garment",
  clothPieceVariantId: IDS.variant,
  unitPrice: 45_000,
  cells: [{ sizeId: IDS.size, quantity: 3 }],
  ...over,
});
const base = (over: Record<string, unknown> = {}) => ({
  destination: "client",
  clientId: IDS.client,
  lines: [garment()],
  ...over,
});

const inserted = (table: string) =>
  state.queries.filter((q) => q.sql.startsWith(`insert into "${table}"`));
const log = () => inserted("activity_log").at(-1);

describe("createPedido", () => {
  beforeEach(() => {
    state.role = "admin";
    state.queries = [];
    state.clientPhone = "3001234567";
    state.clientActive = true;
    state.assigned = 0;
    state.version = 1;
    state.existingLine = false;
  });

  it.each(["stylist", "clothier"])("returns FORBIDDEN for %s", async (role) => {
    state.role = role;
    const res = await createPedido(base());
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
    expect(state.queries).toHaveLength(0);
  });

  it.each(["admin", "cashier", "secretary"])(
    "lets %s create a pedido at catalog price",
    async (role) => {
      state.role = role;
      const res = await createPedido(base());
      expect(res).toEqual({ success: true, data: { id: IDS.pedido, number: 412 } });
      const line = inserted("pedido_lines")[0]!;
      expect(line.params).toContain(45_000);
    },
  );

  it("logs the creation with number, client, units and the server-computed total", async () => {
    await createPedido(base({ lines: [garment({ cells: [{ sizeId: IDS.size, quantity: 3 }] })] }));
    expect(log()!.params).toContain("Creó el pedido #0412 para Ana Pérez · 3 unidades · $135.000");
  });

  it("requires a client for client pedidos and forbids one for inventory pedidos", async () => {
    const noClient = await createPedido(base({ clientId: undefined }));
    expect(!noClient.success && noClient.error.details?.[0]?.field).toBe("clientId");
    const invWithClient = await createPedido(base({ destination: "inventory" }));
    expect(!invWithClient.success && invWithClient.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries).toHaveLength(0);
  });

  it("creates inventory pedidos without a client", async () => {
    const res = await createPedido(base({ destination: "inventory", clientId: undefined }));
    expect(res.success).toBe(true);
    expect(log()!.params.some((p) => String(p).includes("para inventario"))).toBe(true);
  });

  it("requires a phone when the client has none, and saves it", async () => {
    state.clientPhone = null;
    const missing = await createPedido(base());
    expect(!missing.success && missing.error.details?.[0]?.field).toBe("clientPhone");
    expect(inserted("pedidos")).toHaveLength(0);

    state.queries = [];
    const ok = await createPedido(base({ clientPhone: "300 555 1234" }));
    expect(ok.success).toBe(true);
    expect(state.queries.some((q) => q.sql.startsWith('update "clients"'))).toBe(true);
  });

  it("rejects an inactive client", async () => {
    state.clientActive = false;
    const res = await createPedido(base());
    expect(!res.success && res.error.details?.[0]?.field).toBe("clientId");
  });

  it("rejects a pedido with only adjustment lines", async () => {
    const res = await createPedido(
      base({ lines: [{ kind: "adjustment", amount: -5000, priceReason: "descuento" }] }),
    );
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["zero quantity", { cells: [{ sizeId: IDS.size, quantity: 0 }] }],
    ["no sizes", { cells: [] }],
    ["fractional price", { unitPrice: 100.5 }],
    ["negative price", { unitPrice: -1 }],
    [
      "duplicate size",
      {
        cells: [
          { sizeId: IDS.size, quantity: 1 },
          { sizeId: IDS.size, quantity: 2 },
        ],
      },
    ],
    ["size and other size", { cells: [{ sizeId: IDS.size, sizeOther: "Única", quantity: 1 }] }],
  ])("rejects a line with %s", async (_, over) => {
    const res = await createPedido(base({ lines: [garment(over)] }));
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
  });

  describe("price rules", () => {
    it("requires a reason when admin/cashier change the price", async () => {
      state.role = "cashier";
      const res = await createPedido(base({ lines: [garment({ unitPrice: 40_000 })] }));
      expect(!res.success && res.error.details?.[0]?.field).toBe("lines.0.unitPrice");
      const ok = await createPedido(
        base({ lines: [garment({ unitPrice: 40_000, priceReason: "cliente frecuente" })] }),
      );
      expect(ok.success).toBe(true);
    });

    it("forbids the secretary from changing the price, even with a reason", async () => {
      state.role = "secretary";
      const res = await createPedido(
        base({ lines: [garment({ unitPrice: 40_000, priceReason: "descuento" })] }),
      );
      expect(!res.success && res.error.details?.[0]?.field).toBe("lines.0.unitPrice");
      expect(inserted("pedidos")).toHaveLength(0);
    });

    it("needs a typed price + reason for a variant without a selling price", async () => {
      const noReason = await createPedido(
        base({ lines: [garment({ clothPieceVariantId: IDS.noPriceVariant, unitPrice: 30_000 })] }),
      );
      expect(noReason.success).toBe(false);
      const ok = await createPedido(
        base({
          lines: [
            garment({
              clothPieceVariantId: IDS.noPriceVariant,
              unitPrice: 30_000,
              priceReason: "precio acordado",
            }),
          ],
        }),
      );
      expect(ok.success).toBe(true);
    });

    it("forbids adjustment lines for the secretary", async () => {
      state.role = "secretary";
      const res = await createPedido(
        base({
          lines: [garment(), { kind: "adjustment", amount: -5000, priceReason: "descuento" }],
        }),
      );
      expect(!res.success && res.error.details?.[0]?.field).toBe("lines.1.amount");
    });

    it("accepts a reasoned discount line from admin and logs the reason", async () => {
      const res = await createPedido(
        base({
          lines: [garment(), { kind: "adjustment", amount: -15_000, priceReason: "volumen" }],
        }),
      );
      expect(res.success).toBe(true);
      expect(log()!.params).toContain(
        "Creó el pedido #0412 para Ana Pérez · 3 unidades · $120.000",
      );
      expect(log()!.params).toContain("volumen");
    });

    it("ignores any total sent by the client", async () => {
      await createPedido({ ...base(), total: 1 });
      expect(log()!.params.some((p) => String(p).includes("$135.000"))).toBe(true);
    });
  });
});

describe("updatePedido", () => {
  beforeEach(() => {
    state.role = "admin";
    state.queries = [];
    state.clientPhone = "3001234567";
    state.clientActive = true;
    state.assigned = 0;
    state.version = 1;
    state.existingLine = false;
  });

  it("returns STALE_DATA when the version moved", async () => {
    state.version = 2;
    const res = await updatePedido(IDS.pedido, { ...base(), version: 1 });
    expect(!res.success && res.error.code).toBe("STALE_DATA");
    expect(state.queries.some((q) => q.sql.startsWith("delete"))).toBe(false);
  });

  it("refuses once production has started", async () => {
    state.existingLine = true;
    state.assigned = 3;
    const res = await updatePedido(IDS.pedido, { ...base(), version: 1 });
    expect(!res.success && res.error.code).toBe("CONFLICT");
    expect(state.queries.some((q) => q.sql.startsWith("delete"))).toBe(false);
  });

  it("keeps an existing line's id and price snapshot on edit, even for the secretary", async () => {
    state.role = "secretary";
    state.existingLine = true;
    const res = await updatePedido(IDS.pedido, {
      ...base({ lines: [garment({ id: LINE, cells: [{ sizeId: IDS.size, quantity: 5 }] })] }),
      version: 1,
    });
    expect(res.success).toBe(true);
    const line = inserted("pedido_lines")[0]!;
    expect(line.params).toContain(LINE);
    expect(log()!.params.some((p) => String(p).includes("$135.000 → $225.000"))).toBe(true);
  });

  it("rejects a line id that is not on the pedido", async () => {
    const res = await updatePedido(IDS.pedido, {
      ...base({ lines: [garment({ id: "00000000-0000-4000-8000-000000000999" })] }),
      version: 1,
    });
    expect(!res.success && res.error.details?.[0]?.field).toBe("lines.0");
  });

  it("bumps the version and logs the edit", async () => {
    const res = await updatePedido(IDS.pedido, { ...base(), version: 1 });
    expect(res.success).toBe(true);
    const upd = state.queries.find((q) => q.sql.startsWith('update "pedidos"'))!;
    expect(upd.sql).toMatch(/"version" = "pedidos"\."version" \+ 1/);
    expect(log()!.params).toContain("pedido.update");
  });

  it("rejects a malformed id", async () => {
    const res = await updatePedido("1; drop", { ...base(), version: 1 });
    expect(!res.success && res.error.code).toBe("NOT_FOUND");
  });
});

describe("createPedidoClient", () => {
  beforeEach(() => {
    state.role = "cashier";
    state.queries = [];
  });

  it("requires a phone", async () => {
    const res = await createPedidoClient({ name: "Luz", phone: "" });
    expect(!res.success && res.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries).toHaveLength(0);
  });

  it("lets the cashier create a client and logs it", async () => {
    const res = await createPedidoClient({ name: "Luz", phone: "300 999 8888" });
    expect(res.success).toBe(true);
    expect(log()!.params).toContain("Creó el cliente «Luz»");
  });

  it("returns FORBIDDEN for a stylist", async () => {
    state.role = "stylist";
    const res = await createPedidoClient({ name: "Luz", phone: "3009998888" });
    expect(!res.success && res.error.code).toBe("FORBIDDEN");
  });
});
