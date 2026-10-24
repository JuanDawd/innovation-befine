import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ratelimit } from "@upstash/ratelimit";
import {
  checkPublicRateLimit,
  checkRateLimit,
  clientIpFromRequest,
  inMemoryKeyCount,
  rateLimitIsShared,
  rateLimits,
  sweepExpired,
} from "../rate-limit";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

function makeReq(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/health", { headers });
}

describe("clientIpFromRequest", () => {
  it("returns the leftmost entry from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFromRequest(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeReq({ "x-real-ip": "203.0.113.10" });
    expect(clientIpFromRequest(req)).toBe("203.0.113.10");
  });

  it("returns 'unknown' when neither header is set", () => {
    const req = makeReq({});
    expect(clientIpFromRequest(req)).toBe("unknown");
  });
});

describe("checkPublicRateLimit", () => {
  it("returns null while under the limit", async () => {
    const req = makeReq({ "x-forwarded-for": "198.51.100.1" });
    const out = await checkPublicRateLimit(rateLimits.publicVersion, req, "test-version-under");
    expect(out).toBeNull();
  });
});

describe("checkRateLimit (M-59)", () => {
  // Mid-window, so the sliding window's previous bucket never weighs in.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T15:00:30Z"));
    sweepExpired(Number.POSITIVE_INFINITY); // start from an empty store
  });
  afterEach(() => vi.useRealTimers());

  it("uses the in-memory store when Upstash is not configured", () => {
    expect(rateLimitIsShared).toBe(false);
  });

  it("enforces each limiter's own cap — buckets don't mix across limiters", async () => {
    const user = "user-separate-buckets";
    for (let i = 0; i < 30; i++) await checkRateLimit(rateLimits.ticketCreate, user);
    expect((await checkRateLimit(rateLimits.ticketCreate, user)).allowed).toBe(false);
    // 31 ticket attempts must not have consumed the general bucket
    expect((await checkRateLimit(rateLimits.general, user)).allowed).toBe(true);
  });

  it("allows exactly the cap within the window", async () => {
    const user = "user-exact-cap";
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push((await checkRateLimit(rateLimits.payoutRecording, user)).allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("evicts a bucket only after its expiry (2 windows + 1 s)", async () => {
    await checkRateLimit(rateLimits.general, "user-evict");
    expect(inMemoryKeyCount()).toBe(1);
    sweepExpired(Date.now() + 60_000);
    expect(inMemoryKeyCount()).toBe(1);
    sweepExpired(Date.now() + 2 * 60_000 + 1_000);
    expect(inMemoryKeyCount()).toBe(0);
  });

  it("fails open when the limiter backend throws", async () => {
    const broken = {
      limit: async () => {
        throw new Error("ECONNREFUSED");
      },
    } as unknown as Ratelimit;
    expect(await checkRateLimit(broken, "u")).toEqual({ allowed: true });
    expect(await checkPublicRateLimit(broken, makeReq({}), "b")).toBeNull();
  });
});
