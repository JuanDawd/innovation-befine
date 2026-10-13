import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/query-registry", () => ({
  QUERIES: {
    openTickets: vi.fn(async () => ({ success: true, data: [{ at: new Date(0) }] })),
  },
}));

import { GET } from "./route";

const ctx = (name: string) => ({ params: Promise.resolve({ name }) });

describe("GET /api/q/[name]", () => {
  it("returns 404 for names outside the allowlist", async () => {
    const res = await GET(new Request("http://x/api/q/deleteEverything"), ctx("deleteEverything"));
    expect(res.status).toBe(404);
  });

  it("does not resolve inherited object keys", async () => {
    const res = await GET(new Request("http://x/api/q/constructor"), ctx("constructor"));
    expect(res.status).toBe(404);
  });

  it("serves an allowlisted query with no-store and tagged dates", async () => {
    const res = await GET(new Request("http://x/api/q/openTickets"), ctx("openTickets"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain('"$date":"1970-01-01T00:00:00.000Z"');
  });
});
