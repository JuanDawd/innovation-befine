import { describe, it, expect } from "vitest";
import { resolveTrustedOrigins } from "../trusted-origins";

describe("resolveTrustedOrigins (L-48)", () => {
  it("keeps the vercel.app origin in production when nothing is configured", () => {
    expect(resolveTrustedOrigins({ NODE_ENV: "production" })).toEqual([
      "https://innovation-befine.vercel.app",
    ]);
  });

  it("adds the custom domain from BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL", () => {
    expect(
      resolveTrustedOrigins({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://app.befine.co/",
        NEXT_PUBLIC_APP_URL: "https://app.befine.co",
      }),
    ).toEqual(["https://innovation-befine.vercel.app", "https://app.befine.co"]);
  });

  it("accepts a comma-separated list for self-hosted / LAN deployments", () => {
    expect(
      resolveTrustedOrigins({
        NODE_ENV: "production",
        BETTER_AUTH_TRUSTED_ORIGINS: " https://salon.local:8443 , http://192.168.0.50:3000/x ,",
      }),
    ).toEqual([
      "https://innovation-befine.vercel.app",
      "https://salon.local:8443",
      "http://192.168.0.50:3000",
    ]);
  });

  it("ignores malformed URLs", () => {
    expect(
      resolveTrustedOrigins({ NODE_ENV: "development", BETTER_AUTH_URL: "not a url" }),
    ).toEqual(["http://localhost:3000"]);
  });
});
