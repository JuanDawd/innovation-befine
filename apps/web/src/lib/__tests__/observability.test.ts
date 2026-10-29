import { describe, it, expect, vi, beforeEach } from "vitest";

// M-61 — caught errors keep their cause; money movements leave a breadcrumb.

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/lib/logger", () => ({ logger: log }));

import { financialBreadcrumb, reportError } from "../observability";

describe("reportError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs the error and sends it to Sentry tagged with the action", () => {
    const err = new Error("boom");
    reportError(err, "processCheckout", { businessDayId: "d1" });
    expect(log.error).toHaveBeenCalledWith(
      { err, action: "processCheckout", businessDayId: "d1" },
      "processCheckout failed",
    );
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      level: "error",
      tags: { action: "processCheckout" },
      extra: { businessDayId: "d1" },
    });
  });

  it("reports degraded dependencies as warnings", () => {
    reportError(new Error("redis down"), "rateLimit", {}, "warning");
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: "warning" }),
    );
  });
});

describe("financialBreadcrumb", () => {
  it("adds an info breadcrumb in the financial category", () => {
    financialBreadcrumb("recordPayout", { payoutId: "p1", amount: 120000 });
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "financial",
      message: "recordPayout",
      level: "info",
      data: { payoutId: "p1", amount: 120000 },
    });
  });
});
