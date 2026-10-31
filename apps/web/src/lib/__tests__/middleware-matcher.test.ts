import { describe, it, expect, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/middleware-settings", () => ({ getCashierCanAccessAdminCached: vi.fn() }));

import { config } from "@/proxy";

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("middleware matcher", () => {
  it.each(["/manifest.webmanifest", "/sw.js", "/workbox-bba81d7d.js", "/brand/icon-192.png"])(
    "skips auth for static file %s (L-52)",
    (url) => {
      expect(runs(url)).toBe(false);
    },
  );

  it.each(["/cashier", "/login", "/api/q", "/admin/analytics", "/robots.txt"])(
    "runs for app route %s",
    (url) => {
      expect(runs(url)).toBe(true);
    },
  );
});
