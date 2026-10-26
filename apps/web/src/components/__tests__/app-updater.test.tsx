import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

// Silent updates: a new build reloads on the next navigation, never on its own.

const nav = vi.hoisted(() => ({ path: "/cashier" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

import { AppUpdater, nextDelay } from "../app-updater";

const reload = vi.fn();
let remoteBuild = "build-1";

describe("AppUpdater", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "build-1");
    remoteBuild = "build-1";
    nav.path = "/cashier";
    reload.mockReset();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ buildId: remoteBuild }) })),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders nothing", () => {
    const { container } = render(<AppUpdater />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not reload while the user stays on the page, then reloads on the next navigation", async () => {
    remoteBuild = "build-2";
    const { rerender } = render(<AppUpdater />);
    await act(async () => {});
    expect(reload).not.toHaveBeenCalled();

    nav.path = "/pedidos";
    rerender(<AppUpdater />);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads when the build is the same", async () => {
    const { rerender } = render(<AppUpdater />);
    await act(async () => {});
    nav.path = "/pedidos";
    rerender(<AppUpdater />);
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits about 15 minutes, ± 1 minute, backing off to an hour on failures", () => {
    for (const now of [0, 59_999, 60_000, 120_000, 1_792_972_974_519]) {
      const d = nextDelay(0, now);
      expect(d).toBeGreaterThanOrEqual(14 * 60_000);
      expect(d).toBeLessThanOrEqual(16 * 60_000);
    }
    expect(nextDelay(3, 60_000)).toBe(60 * 60_000); // capped, no offset at the midpoint
  });
});
