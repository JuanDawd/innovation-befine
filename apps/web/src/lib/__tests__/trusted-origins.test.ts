import { describe, it, expect } from "vitest";
import { resolveAuthBaseURL, resolveTrustedOrigins } from "../trusted-origins";

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

describe("Vercel preview origins", () => {
  const preview = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    BETTER_AUTH_URL: "https://innovation-befine.vercel.app",
    VERCEL_URL: "innovation-befine-6yu3ea4dw-team.vercel.app",
    VERCEL_BRANCH_URL: "innovation-befine-git-feat-x-team.vercel.app",
  };

  it("trusts the preview deployment's own URLs", () => {
    expect(resolveTrustedOrigins(preview)).toEqual([
      "https://innovation-befine.vercel.app",
      "https://innovation-befine-git-feat-x-team.vercel.app",
      "https://innovation-befine-6yu3ea4dw-team.vercel.app",
    ]);
    expect(resolveAuthBaseURL(preview)).toBe(
      "https://innovation-befine-git-feat-x-team.vercel.app",
    );
  });

  it("never trusts VERCEL_URL in production", () => {
    const prod = { ...preview, VERCEL_ENV: "production" };
    expect(resolveTrustedOrigins(prod)).toEqual(["https://innovation-befine.vercel.app"]);
    expect(resolveAuthBaseURL(prod)).toBe("https://innovation-befine.vercel.app");
  });

  it("falls back to VERCEL_URL when there is no branch URL", () => {
    expect(resolveAuthBaseURL({ ...preview, VERCEL_BRANCH_URL: undefined })).toBe(
      "https://innovation-befine-6yu3ea4dw-team.vercel.app",
    );
  });
});
