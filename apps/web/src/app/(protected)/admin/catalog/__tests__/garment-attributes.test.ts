import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// T110 — sizes and colours catalog: admin-only, validated, audited, never deleted.

type Query = { sql: string; params: unknown[] };

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  rateAllowed: true,
  queries: [] as Query[],
  /** Answers queries in order; an Error is thrown instead of returned. */
  respond: (() => []) as (q: Query) => unknown[][] | Error,
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
  rateLimits: { catalogEdit: "catalogEdit", general: "general" },
  checkRateLimit: async () => ({ allowed: state.rateAllowed }),
}));
vi.mock("@/lib/db", () => {
  const db = drizzle(async (sql, params) => {
    const q = { sql, params };
    state.queries.push(q);
    const res = state.respond(q);
    if (res instanceof Error) throw res;
    return { rows: res };
  });
  return {
    getDb: () => db,
    getTxDb: () => ({ transaction: (fn: (tx: typeof db) => unknown) => fn(db) }),
  };
});

import {
  createGarmentColor,
  createGarmentSize,
  editGarmentColor,
  renameGarmentSize,
  reorderGarmentSizes,
  setGarmentSizeActive,
  listGarmentAttributes,
} from "../actions/garment-attributes";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function uniqueViolation() {
  return Object.assign(new Error("duplicate key"), { code: "23505" });
}

const audits = () => state.queries.filter((q) => q.sql.startsWith('insert into "activity_log"'));

describe("garment attribute actions", () => {
  beforeEach(() => {
    state.role = "admin";
    state.rateAllowed = true;
    state.queries = [];
    state.respond = () => [];
  });

  it.each(["cashier", "secretary", "stylist", "clothier"])(
    "returns FORBIDDEN when %s edits the lists",
    async (role) => {
      state.role = role;
      const results = await Promise.all([
        createGarmentSize({ label: "XL" }),
        renameGarmentSize(A, { label: "XL" }),
        setGarmentSizeActive(A, false),
        reorderGarmentSizes({ ids: [A] }),
        createGarmentColor({ label: "Rojo" }),
        editGarmentColor(A, { label: "Rojo" }),
        listGarmentAttributes(),
      ]);
      for (const r of results) expect(!r.success && r.error.code).toBe("FORBIDDEN");
      expect(state.queries).toHaveLength(0);
    },
  );

  it("returns UNAUTHORIZED without a session", async () => {
    state.role = null;
    const r = await createGarmentSize({ label: "XL" });
    expect(!r.success && r.error.code).toBe("UNAUTHORIZED");
  });

  it("returns RATE_LIMITED before touching the database", async () => {
    state.rateAllowed = false;
    const r = await createGarmentSize({ label: "XL" });
    expect(!r.success && r.error.code).toBe("RATE_LIMITED");
    expect(state.queries).toHaveLength(0);
  });

  it.each([
    ["empty label", { label: "   " }],
    ["too long", { label: "x".repeat(21) }],
    ["not an object", "XL"],
  ])("rejects a size with %s", async (_, input) => {
    const r = await createGarmentSize(input);
    expect(!r.success && r.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries).toHaveLength(0);
  });

  it("rejects a malformed colour hex and a non-uuid id", async () => {
    const bad = await createGarmentColor({ label: "Rojo", hex: "red" });
    expect(!bad.success && bad.error.code).toBe("VALIDATION_ERROR");
    const badId = await editGarmentColor("1; drop table", { label: "Rojo" });
    expect(!badId.success && badId.error.code).toBe("NOT_FOUND");
    const badFlag = await setGarmentSizeActive(A, "yes" as unknown as boolean);
    expect(!badFlag.success && badFlag.error.code).toBe("VALIDATION_ERROR");
    expect(state.queries).toHaveLength(0);
  });

  it("appends a new size after the last one and audits it", async () => {
    state.respond = (q) => {
      if (q.sql.includes("coalesce(max")) return [[70]]; // max(60) + 10, computed in SQL
      if (q.sql.startsWith('insert into "garment_sizes"')) return [[A, "XXXL", 70, true]];
      return [];
    };
    const r = await createGarmentSize({ label: " XXXL " });
    expect(r).toEqual({
      success: true,
      data: { id: A, label: "XXXL", sortOrder: 70, isActive: true },
    });
    const insert = state.queries.find((q) => q.sql.startsWith('insert into "garment_sizes"'))!;
    expect(insert.params).toContain("XXXL");
    expect(insert.params).toContain(70);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]!.params).toContain("garment_size");
  });

  it("returns CONFLICT for a duplicate label (case-insensitive index)", async () => {
    state.respond = (q) =>
      q.sql.startsWith('insert into "garment_colors"') ? uniqueViolation() : [];
    const r = await createGarmentColor({ label: "negro", hex: "#000000" });
    expect(!r.success && r.error.code).toBe("CONFLICT");
  });

  it("stores the hex in upper case", async () => {
    state.respond = (q) =>
      q.sql.startsWith('insert into "garment_colors"') ? [[A, "Rojo", "#C62828", true]] : [];
    await createGarmentColor({ label: "Rojo", hex: "#c62828" });
    const insert = state.queries.find((q) => q.sql.startsWith('insert into "garment_colors"'))!;
    expect(insert.params).toContain("#C62828");
  });

  it("returns NOT_FOUND when renaming a missing size, without auditing", async () => {
    const r = await renameGarmentSize(A, { label: "XL" });
    expect(!r.success && r.error.code).toBe("NOT_FOUND");
    expect(audits()).toHaveLength(0);
  });

  it("deactivates a size (soft delete) and audits it", async () => {
    state.respond = (q) => (q.sql.startsWith('update "garment_sizes"') ? [[A, "XS"]] : []);
    const r = await setGarmentSizeActive(A, false);
    expect(r.success).toBe(true);
    expect(state.queries.some((q) => q.sql.startsWith("delete"))).toBe(false);
    expect(audits()[0]!.params).toContain("catalog.deactivate");
    expect(audits()[0]!.params).toContain("Desactivó la talla «XS»");
  });

  describe("reorderGarmentSizes", () => {
    it("rewrites sort_order and audits only the sizes that moved", async () => {
      state.respond = (q) => {
        if (q.sql.includes("for update"))
          return [
            [A, "XS", 10],
            [B, "S", 20],
          ];
        if (q.sql.startsWith('select "id", "label"'))
          return [
            [B, "S", 10, true],
            [A, "XS", 20, true],
          ];
        return [];
      };
      const r = await reorderGarmentSizes({ ids: [B, A] });
      expect(r.success && r.data.map((s) => s.id)).toEqual([B, A]);
      expect(state.queries.filter((q) => q.sql.startsWith('update "garment_sizes"'))).toHaveLength(
        2,
      );
      expect(audits()).toHaveLength(2);
      expect(audits()[0]!.params).toContain("catalog.reorder");
    });

    it("returns STALE_DATA when the list no longer matches the table", async () => {
      state.respond = (q) =>
        q.sql.includes("for update")
          ? [
              [A, "XS", 10],
              [B, "S", 20],
            ]
          : [];
      const r = await reorderGarmentSizes({ ids: [A] });
      expect(!r.success && r.error.code).toBe("STALE_DATA");
      expect(state.queries.some((q) => q.sql.startsWith("update"))).toBe(false);
    });

    it("rejects duplicate ids", async () => {
      const r = await reorderGarmentSizes({ ids: [A, A] });
      expect(!r.success && r.error.code).toBe("VALIDATION_ERROR");
      expect(state.queries).toHaveLength(0);
    });
  });
});
