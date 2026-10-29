// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { unwrap, QueryActionError } from "../action-query";
import { newUuid } from "../uuid";
import { notifyDataChanged } from "../data-events";
import { getQueryClient } from "../query-client";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("unwrap", () => {
  it("resolves with data on success", async () => {
    await expect(
      unwrap(Promise.resolve({ success: true as const, data: [1, 2] })),
    ).resolves.toEqual([1, 2]);
  });

  it("throws QueryActionError with code and message on failure", async () => {
    const failing = unwrap(
      Promise.resolve({
        success: false as const,
        error: { code: "FORBIDDEN" as const, message: "Sin permisos" },
      }),
    );
    await expect(failing).rejects.toBeInstanceOf(QueryActionError);
    await expect(failing).rejects.toMatchObject({ code: "FORBIDDEN", message: "Sin permisos" });
  });
});

describe("newUuid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a v4 UUID", () => {
    expect(newUuid()).toMatch(UUID_V4);
  });

  it("falls back to getRandomValues when randomUUID is unavailable (non-secure origin)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const ids = new Set(Array.from({ length: 50 }, () => newUuid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});

describe("notifyDataChanged", () => {
  it("invalidates only queries whose key starts with the given scope", () => {
    const qc = getQueryClient();
    qc.setQueryData(["tickets", "open"], [1]);
    qc.setQueryData(["tickets", "mine"], [2]);
    qc.setQueryData(["appointments", "2026-10-11", ""], [3]);

    notifyDataChanged("tickets");

    expect(qc.getQueryState(["tickets", "open"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["tickets", "mine"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["appointments", "2026-10-11", ""])?.isInvalidated).toBe(false);
  });
});
