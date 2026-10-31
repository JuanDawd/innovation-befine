import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableBody, retryingFetch } from "./retry-fetch";

const read = JSON.stringify({ query: 'select "id" from "tickets"', params: [] });
const write = JSON.stringify({ query: 'insert into "tickets" values ($1)', params: [1] });
const ok = new Response("{}", { status: 200 });
const dropped = () =>
  Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

describe("isRetryableBody", () => {
  it.each([
    ['select "a" from "b"', true],
    ["  SELECT 1", true],
    ["with x as (select 1) select * from x", true],
    ['with x as (delete from "b" returning 1) select * from x', false],
    ['select "a" from "b" for update', false],
    ['update "b" set "a" = 1', false],
    ["insert into b values (1)", false],
  ])("%s → %s", (query, expected) => {
    expect(isRetryableBody(JSON.stringify({ query, params: [] }))).toBe(expected);
  });

  it("allows a batch only when every statement is a read", () => {
    const q = (query: string) => ({ query, params: [] });
    expect(isRetryableBody(JSON.stringify({ queries: [q("select 1"), q("select 2")] }))).toBe(true);
    expect(isRetryableBody(JSON.stringify({ queries: [q("select 1"), q("delete from b")] }))).toBe(
      false,
    );
  });

  it("refuses anything it cannot read", () => {
    expect(isRetryableBody(undefined)).toBe(false);
    expect(isRetryableBody("not json")).toBe(false);
  });
});

describe("retryingFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (...results: (Response | Error)[]) => {
    const fn = vi.fn();
    for (const r of results) {
      if (r instanceof Error) fn.mockRejectedValueOnce(r);
      else fn.mockResolvedValueOnce(r);
    }
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("retries a read after a dropped connection", async () => {
    const fn = stub(dropped(), ok);
    await expect(retryingFetch("u", { body: read })).resolves.toBe(ok);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after two retries and rethrows", async () => {
    const fn = stub(dropped(), dropped(), dropped(), ok);
    await expect(retryingFetch("u", { body: read })).rejects.toThrow("fetch failed");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries a write", async () => {
    const fn = stub(dropped(), ok);
    await expect(retryingFetch("u", { body: write })).rejects.toThrow("fetch failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry an SQL error, which arrives as a response", async () => {
    const bad = new Response("{}", { status: 400 });
    const fn = stub(bad, ok);
    await expect(retryingFetch("u", { body: read })).resolves.toBe(bad);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry an aborted request", async () => {
    const fn = stub(Object.assign(new Error("aborted"), { name: "AbortError" }), ok);
    await expect(retryingFetch("u", { body: read })).rejects.toThrow("aborted");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
