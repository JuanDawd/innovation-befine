// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@react-email/components";

// L-13 — the password-reset email carries the brand header.

describe("PasswordResetEmail", () => {
  it("shows the logo from the app URL and the tenant name", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    vi.resetModules();
    const { PasswordResetEmail } = await import("../password-reset");
    const { BRAND_FULL_NAME } = await import("@/lib/brand");
    const html = await render(
      <PasswordResetEmail resetUrl="https://app.example.com/reset?t=abc" userName="Ana" />,
    );
    expect(html).toContain('src="https://app.example.com/brand/icon-192.png"');
    expect(html).toContain(`alt="${BRAND_FULL_NAME}"`);
    expect(html).toContain("Hola Ana,");
    expect(html).toContain('href="https://app.example.com/reset?t=abc"');
    vi.unstubAllEnvs();
  });

  it("omits the logo when the app URL is unknown (no broken image)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.resetModules();
    const { PasswordResetEmail } = await import("../password-reset");
    const html = await render(<PasswordResetEmail resetUrl="https://x.test/r" />);
    expect(html).not.toContain("icon-192.png");
    expect(html).toContain("Hola,");
    vi.unstubAllEnvs();
  });
});
