import { describe, it, expect, vi, afterEach } from "vitest";
import { decodeWire, encodeWire } from "@/lib/query-wire";

describe("query wire format", () => {
  it("round-trips Date values as Date instances", () => {
    const at = new Date("2026-10-11T19:24:54.296Z");
    const out = decodeWire<{ data: { closedAt: Date; nested: { at: Date }[] } }>(
      encodeWire({ data: { closedAt: at, nested: [{ at }] } }),
    );
    expect(out.data.closedAt).toBeInstanceOf(Date);
    expect(out.data.closedAt.getTime()).toBe(at.getTime());
    expect(out.data.nested[0].at).toBeInstanceOf(Date);
  });

  it("leaves ISO-looking strings as strings", () => {
    const out = decodeWire<{ date: string }>(encodeWire({ date: "2026-10-11T00:00:00.000Z" }));
    expect(out.date).toBe("2026-10-11T00:00:00.000Z");
  });

  it("keeps null, numbers and money integers intact", () => {
    expect(decodeWire(encodeWire({ a: null, b: 12500, c: [1, 2] }))).toEqual({
      a: null,
      b: 12500,
      c: [1, 2],
    });
  });
});

describe("fetchQuery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns data from a successful ActionResult", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(encodeWire({ success: true, data: [{ id: "t1" }] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const { fetchQuery } = await import("@/lib/action-query");
    await expect(fetchQuery("openTickets")).resolves.toEqual([{ id: "t1" }]);
  });

  it("throws the action error code on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            encodeWire({ success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const { fetchQuery } = await import("@/lib/action-query");
    await expect(fetchQuery("dayStats")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("treats a login-page redirect (HTML) as UNAUTHORIZED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      ),
    );
    const { fetchQuery } = await import("@/lib/action-query");
    await expect(fetchQuery("dayStats")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes params as a query string and skips empty ones", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(encodeWire({ success: true, data: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchQuery } = await import("@/lib/action-query");
    await fetchQuery("appointmentsForDate", { date: "2026-10-12", stylist: "" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/q/appointmentsForDate?date=2026-10-12",
      expect.anything(),
    );
  });
});
