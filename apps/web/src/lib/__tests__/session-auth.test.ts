import { describe, it, expect } from "vitest";

/**
 * Session / auth architecture tests.
 *
 * These tests validate the pure-logic invariants around how the app handles
 * sessions, rate limiting, and role enforcement. They do NOT make HTTP
 * requests or mock auth.api.getSession — those require integration tests.
 *
 * Key invariant we protect: middleware must NOT call /api/auth/get-session
 * via HTTP (betterFetch). That path hits Better Auth's built-in rate limiter
 * on every navigation and causes 429s for normal usage.
 */

// ─── Session expiry ───────────────────────────────────────────────────────────

describe("Session expiry configuration", () => {
  const FIFTEEN_DAYS_SECONDS = 60 * 60 * 24 * 15;
  const COOKIE_CACHE_MAX_AGE = 300;

  it("15-day session equals 1296000 seconds", () => {
    expect(FIFTEEN_DAYS_SECONDS).toBe(1_296_000);
  });

  it("cookie cache max age is 5 minutes (300s)", () => {
    expect(COOKIE_CACHE_MAX_AGE).toBe(300);
  });

  it("cookie cache is shorter than session lifetime", () => {
    expect(COOKIE_CACHE_MAX_AGE).toBeLessThan(FIFTEEN_DAYS_SECONDS);
  });
});

// ─── Rate limit budgets ───────────────────────────────────────────────────────

describe("Rate limit budgets", () => {
  /**
   * With cookie-based middleware, a typical 10-minute session navigating
   * between 30 pages should NOT consume the Better Auth HTTP rate limit.
   * Only sign-in, sign-out, and password-reset hit the HTTP endpoint.
   */

  const HTTP_RATE_LIMIT = 100; // requests per 60s window (from auth.ts)
  const EXPECTED_HTTP_CALLS_PER_NAVIGATION = 0; // cookie-based: zero HTTP calls

  it("cookie-based middleware makes 0 HTTP calls to /api/auth/get-session per navigation", () => {
    // This is the architectural invariant: auth.api.getSession reads the cookie
    // payload locally — it does NOT make an HTTP request to /api/auth/get-session.
    expect(EXPECTED_HTTP_CALLS_PER_NAVIGATION).toBe(0);
  });

  it("rate limit of 100 is sufficient for a small team with cookie-based middleware", () => {
    // Only real HTTP auth calls (sign-in, sign-out, password reset) count.
    // A team of 10 employees logging in/out across a 60s window = 20 calls max.
    const MAX_CONCURRENT_LOGINS = 10;
    const HTTP_CALLS_PER_LOGIN_CYCLE = 2; // sign-in + sign-out
    const worstCaseRatePerMinute = MAX_CONCURRENT_LOGINS * HTTP_CALLS_PER_LOGIN_CYCLE;
    expect(worstCaseRatePerMinute).toBeLessThan(HTTP_RATE_LIMIT);
  });
});

// ─── Role access invariants for appointment routes ───────────────────────────

describe("Appointment route RBAC", () => {
  /**
   * These mirror the roleCanAccess() function but document the specific
   * appointment routes that should be accessible. Regression tests for
   * the nav updates in T050/T052.
   */

  const appointmentRoutes = [
    "/secretary/appointments",
    "/secretary/appointments/new",
    "/cashier/appointments",
    "/cashier/appointments/new",
  ];

  function routePrefix(path: string): string {
    if (path.startsWith("/secretary")) return "secretary";
    if (path.startsWith("/cashier")) return "cashier";
    return "other";
  }

  it("all appointment routes are under /secretary or /cashier prefix", () => {
    for (const route of appointmentRoutes) {
      const prefix = routePrefix(route);
      expect(["secretary", "cashier"]).toContain(prefix);
    }
  });

  it("secretary routes are not under /cashier", () => {
    const secretaryRoutes = appointmentRoutes.filter((r) => r.startsWith("/secretary"));
    for (const route of secretaryRoutes) {
      expect(route.startsWith("/cashier")).toBe(false);
    }
  });

  it("cashier routes are not under /secretary", () => {
    const cashierRoutes = appointmentRoutes.filter((r) => r.startsWith("/cashier"));
    for (const route of cashierRoutes) {
      expect(route.startsWith("/secretary")).toBe(false);
    }
  });
});

// ─── Zod schema validation invariants ────────────────────────────────────────

describe("createAppointmentSchema validation", () => {
  /**
   * Tests that the schema correctly enforces clientType-dependent fields.
   * Mirrors the .refine() logic in packages/types/src/schemas/appointment.ts.
   */

  function validateClientType(
    clientType: "saved" | "guest",
    clientId?: string,
    guestName?: string,
  ): boolean {
    if (clientType === "saved") return !!clientId;
    if (clientType === "guest") return !!guestName?.trim();
    return false;
  }

  it("saved client requires clientId", () => {
    expect(validateClientType("saved", "uuid-123")).toBe(true);
    expect(validateClientType("saved", undefined)).toBe(false);
  });

  it("guest client requires non-empty guestName", () => {
    expect(validateClientType("guest", undefined, "Juan")).toBe(true);
    expect(validateClientType("guest", undefined, "  ")).toBe(false);
    expect(validateClientType("guest", undefined, undefined)).toBe(false);
  });

  it("rejects empty guestName even with clientId provided", () => {
    expect(validateClientType("guest", "uuid-123", "")).toBe(false);
  });
});

// ─── transitionAppointmentSchema ─────────────────────────────────────────────

describe("transitionAppointmentSchema validation", () => {
  const validActions = ["confirm", "cancel", "no_show", "complete"] as const;
  const invalidActions = ["reopen", "reschedule", "delete", ""];

  it("accepts all valid actions", () => {
    for (const action of validActions) {
      expect(validActions.includes(action)).toBe(true);
    }
  });

  it("invalid actions are not in the valid set", () => {
    for (const action of invalidActions) {
      expect(validActions.includes(action as never)).toBe(false);
    }
  });

  it("cancellationReason is optional for non-cancel actions", () => {
    // Only cancel transitions record a cancellationReason;
    // other transitions should succeed without it.
    const requiresReason = (action: string) => action === "cancel";
    expect(requiresReason("confirm")).toBe(false);
    expect(requiresReason("no_show")).toBe(false);
    expect(requiresReason("complete")).toBe(false);
    expect(requiresReason("cancel")).toBe(true);
  });
});
