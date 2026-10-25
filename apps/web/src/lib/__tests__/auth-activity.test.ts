import { describe, it, expect, vi, beforeEach } from "vitest";

// T114 — sign-in, sign-out and failed attempts are logged with device info,
// and a logging failure never blocks authentication.

const state = vi.hoisted(() => ({
  entries: [] as Record<string, unknown>[],
  fail: false,
  session: null as null | { user: { id: string; role: string } },
}));

vi.mock("better-auth/api", () => ({
  createAuthMiddleware: (fn: unknown) => fn,
  getSessionFromCtx: async () => state.session,
  isAPIError: (e: unknown) => (e as { isApiError?: boolean })?.isApiError === true,
}));
vi.mock("@/lib/db", () => ({
  getTxDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@befine/db", () => ({
  logActivity: async (_tx: unknown, entry: Record<string, unknown>) => {
    if (state.fail) throw new Error("db down");
    state.entries.push(entry);
  },
}));

import { authActivityAfter, authActivityBefore } from "../auth-activity";

type Hook = (ctx: unknown) => Promise<void>;
const after = authActivityAfter as unknown as Hook;
const before = authActivityBefore as unknown as Hook;

const headers = new Headers({
  "x-forwarded-for": "190.85.1.2, 10.0.0.1",
  "user-agent": "Mozilla/5.0 (iPhone)",
});

describe("auth activity hooks", () => {
  beforeEach(() => {
    state.entries = [];
    state.fail = false;
    state.session = null;
  });

  it("logs a successful sign-in with IP and user agent", async () => {
    await after({
      path: "/sign-in/email",
      headers,
      body: { email: "ana@befine.co" },
      context: { returned: {}, newSession: { user: { id: "u1", role: "secretary" } } },
    });
    expect(state.entries).toEqual([
      expect.objectContaining({
        action: "auth.sign_in",
        actor: { userId: "u1", role: "secretary" },
        entityId: "u1",
        ip: "190.85.1.2",
        userAgent: "Mozilla/5.0 (iPhone)",
      }),
    ]);
  });

  it("logs a failed sign-in without an actor, keeping the attempted email", async () => {
    await after({
      path: "/sign-in/email",
      headers,
      body: { email: " Ana@Befine.co " },
      context: { returned: { isApiError: true, statusCode: 401 }, newSession: null },
    });
    expect(state.entries[0]).toMatchObject({
      action: "auth.sign_in_failed",
      actor: { userId: null, role: null },
      data: { email: "ana@befine.co" },
      ip: "190.85.1.2",
    });
  });

  it("logs sign-out before the session is gone", async () => {
    state.session = { user: { id: "u2", role: "clothier" } };
    await before({ path: "/sign-out", headers, context: {} });
    expect(state.entries[0]).toMatchObject({
      action: "auth.sign_out",
      actor: { userId: "u2", role: "clothier" },
    });
  });

  it("ignores other auth endpoints", async () => {
    await after({ path: "/get-session", headers, context: { returned: {} } });
    await before({ path: "/sign-in/email", headers, context: {} });
    expect(state.entries).toHaveLength(0);
  });

  it("never throws when the log cannot be written", async () => {
    state.fail = true;
    await expect(
      after({
        path: "/sign-in/email",
        headers,
        context: { returned: {}, newSession: { user: { id: "u1", role: "admin" } } },
      }),
    ).resolves.toBeUndefined();
  });
});
