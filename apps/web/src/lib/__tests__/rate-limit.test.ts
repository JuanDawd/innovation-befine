import { describe, expect, it } from "vitest";
import { checkPublicRateLimit, clientIpFromRequest, rateLimits } from "../rate-limit";

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
